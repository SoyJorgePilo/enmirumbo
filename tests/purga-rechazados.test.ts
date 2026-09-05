import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { GET as purgarRechazadosRuta } from "../src/app/api/tareas/purgar-rechazados/route";
import type { PrismaClient } from "../src/generated/prisma/client";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto, VARIANTES_FOTO } from "../src/lib/fotos/clave";
import {
  DIAS_PARA_PURGAR_RECHAZADOS,
  fechaDeCorteDePurga,
  purgarRechazados,
} from "../src/lib/purga/rechazados";
import { crearClientePrueba } from "./db";

/**
 * Spec `modelo-datos` · Requirement "Los registros rechazados se eliminan
 * definitivamente a los 90 días" y spec `despliegue` · Requirement "La purga
 * de rechazados se dispara sola en producción" (change
 * `preparar-deploy-produccion`, tasks #10 y #11).
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771999 3xxx.
 */

const PREFIJO = "7719993";
const AHORA = new Date("2026-12-01T09:00:00.000Z");
const SECRETO = "secreto-de-pruebas-que-no-sirve-en-ningun-lado";

let prisma: PrismaClient;
let categoriaId: number;

/** Un rechazo de hace `dias` días, contado desde `AHORA`. */
const haceDias = (dias: number) =>
  new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000);

async function alta(
  whatsapp: string,
  datos: Record<string, unknown> = {},
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio de la Purga",
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-06-01T10:00:00.000Z"),
      ...datos,
    },
  });
  return creado.id;
}

const rechazadoHace = (whatsapp: string, dias: number) =>
  alta(whatsapp, {
    estado: "rechazado",
    rechazadoEn: haceDias(dias),
    motivoRechazo: "Motivo ficticio de prueba",
  });

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

describe("purga · qué se lleva y qué no", () => {
  it("el corte son exactamente 90 días antes del momento de correrla", () => {
    expect(DIAS_PARA_PURGAR_RECHAZADOS).toBe(90);
    expect(fechaDeCorteDePurga(AHORA).toISOString()).toBe(haceDias(90).toISOString());
  });

  // Scenario: rechazado que cumplió el plazo
  it("elimina un rechazado de hace 90 días y otro de hace 91", async () => {
    const noventa = await rechazadoHace(`${PREFIJO}001`, 90);
    const noventaYUno = await rechazadoHace(`${PREFIJO}002`, 91);

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 2, fallidos: 0 });

    expect(await prisma.negocio.findUnique({ where: { id: noventa } })).toBeNull();
    expect(await prisma.negocio.findUnique({ where: { id: noventaYUno } })).toBeNull();
  });

  // Scenario: rechazado que todavía no cumple el plazo
  it("no toca un rechazado de hace 89 días", async () => {
    const id = await rechazadoHace(`${PREFIJO}003`, 89);

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0, fallidos: 0 });

    const sigue = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(sigue.motivoRechazo).toBe("Motivo ficticio de prueba");
  });

  // Scenario: la purga no toca lo que no es suyo
  it("no toca publicados ni en revisión, por viejos que sean", async () => {
    const publicado = await alta(`${PREFIJO}004`, {
      estado: "publicado",
      publicadoEn: haceDias(400),
      registradoEn: haceDias(400),
    });
    const enRevision = await alta(`${PREFIJO}005`, { registradoEn: haceDias(400) });
    const rechazadoViejo = await rechazadoHace(`${PREFIJO}006`, 120);

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 1, fallidos: 0 });

    expect(await prisma.negocio.findUnique({ where: { id: publicado } })).not.toBeNull();
    expect(await prisma.negocio.findUnique({ where: { id: enRevision } })).not.toBeNull();
    expect(await prisma.negocio.findUnique({ where: { id: rechazadoViejo } })).toBeNull();
  });

  // Scenario: el negocio que corrigió y volvió a la cola
  it("no toca un rechazado sin fecha de rechazo (volvió a la cola)", async () => {
    const id = await alta(`${PREFIJO}007`, {
      estado: "rechazado",
      rechazadoEn: null,
      motivoRechazo: null,
    });

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0, fallidos: 0 });
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  it("tampoco toca al que fue rechazado hace un año pero volvió a en_revision", async () => {
    const id = await rechazadoHace(`${PREFIJO}008`, 365);
    await prisma.negocio.update({
      where: { id },
      data: { estado: "en_revision", rechazadoEn: null, motivoRechazo: null },
    });

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0, fallidos: 0 });
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  // Scenario: purga idempotente
  it("correrla dos veces seguidas deja la base igual e informa cero", async () => {
    await rechazadoHace(`${PREFIJO}009`, 200);

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 1, fallidos: 0 });
    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0, fallidos: 0 });
  });

  it("se lleva por delante los reportes del registro purgado (cascada)", async () => {
    const id = await rechazadoHace(`${PREFIJO}010`, 100);
    await prisma.reporte.create({ data: { negocioId: id, motivo: "cerrado" } });

    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 1, fallidos: 0 });
    expect(await prisma.reporte.count({ where: { negocioId: id } })).toBe(0);
  });

  it("se lleva también los archivos de la foto, como el borrado ARCO", async () => {
    const almacen = almacenDeFotos();
    const clave = generarClaveFoto();
    for (const variante of VARIANTES_FOTO) {
      await almacen.guardar(clave, variante, Buffer.from("foto de mentiras"));
    }
    await rechazadoHace(`${PREFIJO}011`, 95).then((id) =>
      prisma.negocio.update({ where: { id }, data: { fotoClave: clave } }),
    );

    expect(await purgarRechazados(prisma, { ahora: AHORA, almacen })).toMatchObject({
      eliminados: 1,
      fallidos: 0,
    });
    for (const variante of VARIANTES_FOTO) {
      expect(await almacen.leer(clave, variante)).toBeNull();
    }
  });

  // Scenario: el informe no filtra datos personales
  it("lo que informa es un conteo, sin un solo dato de nadie", async () => {
    await rechazadoHace(`${PREFIJO}012`, 120);
    const resultado = await purgarRechazados(prisma, { ahora: AHORA });

    expect(Object.keys(resultado).sort()).toEqual([
      "cuposLimpiados",
      "eliminados",
      "fallidos",
    ]);
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(PREFIJO);
    expect(serializado).not.toContain("Negocio Ficticio");
    expect(serializado).not.toContain("Motivo ficticio");
  });
});

/**
 * ITERACIÓN 2 (hallazgo M1 de la etapa C): la ruta ya no fabrica su propio
 * 404 de texto plano —que la distinguía del resto del sitio a simple vista—
 * sino que delega en `notFound()`, la MISMA página 404 de cualquier dirección
 * inventada. `notFound()` funciona lanzando, así que aquí se comprueba que la
 * llamada termina con esa señal y sin haber tocado la base.
 */
async function respondeComoInexistente(llamada: () => Promise<Response>): Promise<boolean> {
  try {
    const respuesta = await llamada();
    // Si llegara a devolver algo, un 404 propio también sería "no existe",
    // pero ya no sería indistinguible: se falla a propósito.
    expect(respuesta.status, "la ruta fabricó su propio 404 en vez de servir el del sitio").toBe(
      -1,
    );
    return false;
  } catch (error) {
    return String((error as Error).message).includes("NEXT_HTTP_ERROR_FALLBACK;404");
  }
}

describe("purga · la ruta que la dispara", () => {
  // La ruta no recibe "ahora" de nadie: usa el reloj del servidor, como en
  // producción. Así que aquí las fechas se cuentan desde HOY de verdad.
  const rechazadoHace = (whatsapp: string, dias: number) =>
    alta(whatsapp, {
      estado: "rechazado",
      rechazadoEn: new Date(Date.now() - dias * 24 * 60 * 60 * 1000),
      motivoRechazo: "Motivo ficticio de prueba",
    });

  const pedir = (encabezados: Record<string, string> = {}) =>
    purgarRechazadosRuta(
      new Request("https://enmirumbo.example/api/tareas/purgar-rechazados", {
        headers: encabezados,
      }),
    );

  // Scenario: sin secreto configurado
  it("sin CRON_SECRET responde como una ruta inexistente y no purga nada", async () => {
    const id = await rechazadoHace(`${PREFIJO}101`, 200);

    expect(await respondeComoInexistente(() => pedir({ authorization: `Bearer ${SECRETO}` }))).toBe(
      true,
    );
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  // Scenario: alguien encuentra la ruta
  it.each([
    ["sin encabezado", undefined],
    ["con el secreto equivocado", "Bearer otra-cosa-completamente-distinta"],
    ["con el secreto vacío", "Bearer "],
    ["sin el prefijo Bearer", SECRETO],
    ["con el secreto correcto en otro esquema", `Basic ${SECRETO}`],
    ["con el secreto correcto y basura pegada", `Bearer ${SECRETO}x`],
  ])("%s responde el mismo 404 del sitio y no borra nada", async (_caso, encabezado) => {
    process.env.CRON_SECRET = SECRETO;
    const id = await rechazadoHace(`${PREFIJO}102`, 200);

    expect(
      await respondeComoInexistente(() => pedir(encabezado ? { authorization: encabezado } : {})),
    ).toBe(true);
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  // Scenario: la tarea programada corre
  it("con el secreto correcto purga y responde solo el conteo", async () => {
    process.env.CRON_SECRET = SECRETO;
    const viejo = await rechazadoHace(`${PREFIJO}103`, 120);
    const reciente = await rechazadoHace(`${PREFIJO}104`, 10);

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ eliminados: 1, fallidos: 0 });
    expect(await prisma.negocio.findUnique({ where: { id: viejo } })).toBeNull();
    expect(await prisma.negocio.findUnique({ where: { id: reciente } })).not.toBeNull();
  });

  it("el secreto con espacios alrededor se compara sin ellos", async () => {
    process.env.CRON_SECRET = `  ${SECRETO}  `;
    await rechazadoHace(`${PREFIJO}105`, 120);

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });
    expect(respuesta.status).toBe(200);
  });

  it("un CRON_SECRET de puros espacios es como no tenerlo", async () => {
    process.env.CRON_SECRET = "   ";
    const id = await rechazadoHace(`${PREFIJO}106`, 200);

    expect(await respondeComoInexistente(() => pedir({ authorization: "Bearer    " }))).toBe(true);
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  it("el log de la purga no lleva ningún dato de nadie", async () => {
    process.env.CRON_SECRET = SECRETO;
    await rechazadoHace(`${PREFIJO}107`, 120);
    const registro = vi.spyOn(console, "log").mockImplementation(() => {});

    await pedir({ authorization: `Bearer ${SECRETO}` });

    const dicho = registro.mock.calls.flat().join(" ");
    expect(dicho).toContain("1");
    expect(dicho).not.toContain(PREFIJO);
    expect(dicho).not.toContain("Negocio Ficticio");
    expect(dicho).not.toContain("Motivo ficticio");
  });

  it("la respuesta pide que no se indexe", async () => {
    process.env.CRON_SECRET = SECRETO;
    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });
    expect(respuesta.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});

// ── El borrado se niega a mentir (iteración 4, hallazgo R4) ────────────────

describe("purga · una ficha con foto inalcanzable no se borra ni se cuenta como limpia", () => {
  /** Un almacén que no se deja alcanzar, como una llave rotada y no propagada. */
  const almacenCaido = () => ({
    guardar: () => Promise.reject(new Error("EACCES")),
    leer: () => Promise.resolve(null),
    borrar: () => Promise.reject(new Error("EACCES: el almacén no responde")),
    listar: () => Promise.reject(new Error("EACCES")),
    descripcion: () => "almacén caído de mentiras",
  });

  it("la fila sigue ahí, cuenta como fallida y el cron responde 500", async () => {
    const conFoto = await rechazadoHace(`${PREFIJO}301`, 120).then((id) =>
      prisma.negocio.update({
        where: { id },
        data: { fotoClave: "a".repeat(32) },
      }),
    );

    const resultado = await purgarRechazados(prisma, {
      ahora: AHORA,
      almacen: almacenCaido(),
    });

    expect(resultado.eliminados).toBe(0);
    expect(resultado.fallidos).toBe(1);
    // Lo que la decisión del fundador protege: la fila NO se tocó, así que
    // mañana se reintenta. Antes desaparecía dejando su foto viva en el
    // almacén y sin ninguna fila que la nombrara — ni el barrido de huérfanas
    // podría haberla identificado.
    expect(await prisma.negocio.findUnique({ where: { id: conFoto.id } })).not.toBeNull();
  });

  it("una ficha SIN foto sí se purga aunque el almacén esté caído", async () => {
    // No hay nada que alcanzar: negarse aquí sería incumplir los 90 días por
    // una configuración que a esta ficha no le afecta.
    const id = await rechazadoHace(`${PREFIJO}302`, 120);

    const resultado = await purgarRechazados(prisma, {
      ahora: AHORA,
      almacen: almacenCaido(),
    });

    expect(resultado).toMatchObject({ eliminados: 1, fallidos: 0 });
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  it("el log no lleva ni la clave de la foto ni datos del negocio", async () => {
    await rechazadoHace(`${PREFIJO}303`, 120).then((id) =>
      prisma.negocio.update({ where: { id }, data: { fotoClave: "b".repeat(32) } }),
    );
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    await purgarRechazados(prisma, { ahora: AHORA, almacen: almacenCaido() });

    const dicho = errores.mock.calls.flat().join(" ");
    expect(dicho).toContain("almacén inalcanzable");
    expect(dicho).not.toContain("b".repeat(32));
    expect(dicho).not.toContain(PREFIJO);
    expect(dicho).not.toContain("Negocio Ficticio");
  });
});
