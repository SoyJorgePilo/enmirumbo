import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { borrarNegocio } from "../src/lib/admin/transiciones";
import {
  MAX_FILAS_DE_CUPOS,
  RETENCION_MAXIMA_DE_CUPOS_MS,
  limpiarCuposCaducados,
} from "../src/lib/cupos/compartido";
import {
  almacenDeFotos,
  avisarSinAlmacenDeFotosUnaVez,
  crearAlmacenSinConfigurar,
  reiniciarAlmacenDeFotos,
} from "../src/lib/fotos/almacen";
import { barrerFotosHuerfanas } from "../src/lib/fotos/huerfanas";
import { purgarRechazados } from "../src/lib/purga/rechazados";
import { crearClientePrueba } from "./db";
import { almacenDeMentiras } from "./fotos-fixtures";

/**
 * ETAPA C · ITERACIÓN 3 (última) del change `preparar-deploy-produccion`.
 *
 * Sólo las tres correcciones nuevas, ejercitadas contra el código real:
 * la caducidad y el techo de los cupos (R1), el almacén que falla a la vista
 * (R2) y la asimetría de `borrar`, que es la única decisión de diseño de esta
 * iteración con consecuencias sobre datos personales.
 *
 * [R4] ESTABA EN ROJO A PROPÓSITO y hoy está en verde: la iteración 4 lo
 * corrigió con la decisión del fundador —el borrado se niega a mentir—, así
 * que esta prueba pasó de fijar un hallazgo a ser su regresión.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771999 7xxx.
 */

const PREFIJO = "7719997";
const AHORA = new Date("2026-12-01T09:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.intentoDeCupo.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.intentoDeCupo.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarAlmacenDeFotos();
});

/** Una ficha ficticia, opcionalmente con foto. */
async function ficha(
  whatsapp: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const creada = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio de la Iteración 3",
      categoriaId,
      whatsapp,
      consintioAvisoEn: AHORA,
      ...extra,
    },
  });
  return creada.id;
}

/** Marcas de cupo escritas directas, para no depender del camino del panel. */
async function marcas(cuantas: number, desfaseMs: number): Promise<void> {
  await prisma.intentoDeCupo.createMany({
    data: Array.from({ length: cuantas }, (_, i) => ({
      clave: `ficticia-${desfaseMs}-${i}`,
      ocurrioEn: new Date(AHORA.getTime() - desfaseMs),
    })),
  });
}

// ── 1. R1: las marcas caducan y la tabla tiene techo ────────────────────────

describe("iteración 3 · R1: la retención de los cupos se hace cumplir", () => {
  it("la retención es MAYOR que la ventana del límite más largo en uso", async () => {
    const { VENTANA_INTENTOS_ACCESO_MS } = await import("../src/lib/admin/acceso");
    // Si algún día una ventana pasara de la retención, la limpieza borraría
    // marcas todavía vigentes y aflojaría el límite en silencio.
    expect(VENTANA_INTENTOS_ACCESO_MS).toBeLessThan(RETENCION_MAXIMA_DE_CUPOS_MS);
  });

  it("una marca fuera del horizonte la borra la TAREA DIARIA, no sólo el propio cupo", async () => {
    await marcas(1, RETENCION_MAXIMA_DE_CUPOS_MS + 1000);
    expect(await prisma.intentoDeCupo.count()).toBe(1);

    const resultado = await purgarRechazados(prisma, {
      ahora: AHORA,
      almacen: crearAlmacenSinConfigurar(),
    });

    expect(await prisma.intentoDeCupo.count()).toBe(0);
    expect(resultado.cuposLimpiados).toBe(1);
  });

  it("una marca DENTRO del horizonte no se toca: el límite sigue operando", async () => {
    await marcas(1, 60_000); // un minuto
    await purgarRechazados(prisma, { ahora: AHORA, almacen: crearAlmacenSinConfigurar() });
    expect(await prisma.intentoDeCupo.count()).toBe(1);
  });

  it("con 5001 filas vigentes el techo poda exactamente una, la más vieja", async () => {
    // Todas dentro del horizonte: lo único que puede recortarlas es el techo.
    await prisma.intentoDeCupo.createMany({
      data: Array.from({ length: MAX_FILAS_DE_CUPOS + 1 }, (_, i) => ({
        clave: `ficticia-techo-${i}`,
        // La 0 es la más vieja, pero TODAS caben dentro del horizonte de una
        // hora (se separan un milisegundo): así lo único que puede recortarlas
        // es el techo de filas, no la caducidad.
        ocurrioEn: new Date(AHORA.getTime() - (MAX_FILAS_DE_CUPOS + 1 - i)),
      })),
    });
    expect(await prisma.intentoDeCupo.count()).toBe(MAX_FILAS_DE_CUPOS + 1);

    const { caducadas, podadas } = await limpiarCuposCaducados(prisma, { ahora: AHORA });

    expect(caducadas).toBe(0);
    expect(podadas).toBe(1);
    expect(await prisma.intentoDeCupo.count()).toBe(MAX_FILAS_DE_CUPOS);
    // Se fue la más antigua, no una cualquiera.
    expect(
      await prisma.intentoDeCupo.findFirst({ where: { clave: "ficticia-techo-0" } }),
    ).toBeNull();
  }, 60_000);

  it("justo en el techo no poda nada (no se pasa de celosa)", async () => {
    await prisma.intentoDeCupo.createMany({
      data: Array.from({ length: MAX_FILAS_DE_CUPOS }, (_, i) => ({
        clave: `ficticia-justo-${i}`,
        ocurrioEn: new Date(AHORA.getTime() - 1000),
      })),
    });
    const { podadas } = await limpiarCuposCaducados(prisma, { ahora: AHORA });
    expect(podadas).toBe(0);
    expect(await prisma.intentoDeCupo.count()).toBe(MAX_FILAS_DE_CUPOS);
  }, 60_000);

  it("si la limpieza falla, la purga de rechazados se completa igual", async () => {
    const id = await ficha(`${PREFIJO}101`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - 200 * 24 * 60 * 60 * 1000),
      motivoRechazo: "Motivo ficticio",
    });

    const rota = new Proxy(prisma, {
      get(objetivo, propiedad) {
        if (propiedad === "intentoDeCupo") {
          return { deleteMany: () => Promise.reject(new Error("base caída")), count: () => 0 };
        }
        return Reflect.get(objetivo, propiedad);
      },
    }) as PrismaClient;

    const resultado = await purgarRechazados(rota, {
      ahora: AHORA,
      almacen: crearAlmacenSinConfigurar(),
    });

    expect(resultado.eliminados).toBe(1);
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });
});

// ── 2. R2: el almacén sin configurar falla a la vista ───────────────────────

describe("iteración 3 · R2: desplegado sin almacén, nada se pierde en silencio", () => {
  const REMOTA = "postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres?sslmode=require";

  it.each([
    ["por VERCEL_ENV=production", { VERCEL_ENV: "production" }],
    ["por NODE_ENV=production", { NODE_ENV: "production" }],
    ["por base remota (staging real)", { DATABASE_URL: REMOTA }],
  ])("desplegado %s y sin variables: el almacén NO es el disco", (_etiqueta, env) => {
    reiniciarAlmacenDeFotos();
    expect(almacenDeFotos(env).descripcion()).toContain("SIN CONFIGURAR");
  });

  it("en una laptop con base local sigue siendo el disco (no se rompe el día a día)", () => {
    reiniciarAlmacenDeFotos();
    const almacen = almacenDeFotos({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable",
    });
    expect(almacen.descripcion()).toContain("disco local");
  });

  it("guardar y listar LANZAN; leer no revienta una página pública", async () => {
    const almacen = crearAlmacenSinConfigurar();
    await expect(almacen.guardar("a".repeat(32), "ficha", Buffer.from(""))).rejects.toThrow();
    await expect(almacen.listar()).rejects.toThrow();
    await expect(almacen.leer("a".repeat(32), "ficha")).resolves.toBeNull();
  });

  it("el barrido no confunde 'no pude mirar' con 'no hay nada'", async () => {
    await expect(
      barrerFotosHuerfanas({ prisma, almacen: crearAlmacenSinConfigurar() }),
    ).rejects.toThrow();
  });

  it("el aviso de arranque nombra las dos variables y sale una sola vez", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reiniciarAlmacenDeFotos();
    for (let i = 0; i < 20; i += 1) {
      avisarSinAlmacenDeFotosUnaVez({ VERCEL_ENV: "production" });
    }
    expect(log).toHaveBeenCalledTimes(1);
    const dicho = log.mock.calls.flat().join(" ");
    expect(dicho).toContain("SUPABASE_URL");
    expect(dicho).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("la descripción del almacén no lleva credenciales", () => {
    reiniciarAlmacenDeFotos();
    const almacen = almacenDeFotos({
      SUPABASE_URL: "https://proyecto-ficticio.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "llave-ficticia-de-servicio-no-usar",
      VERCEL_ENV: "production",
    });
    expect(almacen.descripcion()).not.toContain("llave-ficticia-de-servicio-no-usar");
  });
});

// ── 3. La asimetría de `borrar`: ¿"completarse sin mentir" miente alguna vez? ─

describe("iteración 3 · la asimetría de borrar, puesta a prueba", () => {
  it("nunca se configuró: no hay foto, así que borrar de verdad no miente", async () => {
    const id = await ficha(`${PREFIJO}201`, { fotoClave: null });
    expect(await borrarNegocio(prisma, id, crearAlmacenSinConfigurar())).toEqual({
      resultado: "borrado",
    });
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  /**
   * HALLAZGO R4 — CERRADO en la iteración 4 con la decisión (a) del fundador.
   *
   * El escenario es el original del hallazgo: el almacén ESTUVO configurado,
   * se subieron fotos (hay `fotoClave` y archivos en el bucket) y la
   * configuración se perdió —una llave rotada y no propagada, un deploy sin
   * las variables, un `staging` apuntando a la base de producción—. Antes, el
   * borrado se completaba callado: el panel decía "borrado", al titular se le
   * informaba que su ARCO se cumplió, y la foto seguía en el almacén sin
   * ninguna fila que la nombrara.
   *
   * Ahora el borrado se niega, y la aserción es del CONTRATO COMPLETO, no de
   * "algo distinto a borrado": desenlace propio y **la fila intacta**, que es
   * lo único que permite reintentar.
   */
  it("[R4] estuvo configurado y se perdió: borrar una ficha CON foto se NIEGA y deja la fila", async () => {
    const id = await ficha(`${PREFIJO}202`, {
      estado: "publicado",
      publicadoEn: AHORA,
      fotoClave: "e".repeat(32),
    });

    expect(await borrarNegocio(prisma, id, crearAlmacenSinConfigurar())).toEqual({
      resultado: "almacen-inalcanzable",
    });

    const sigue = await prisma.negocio.findUnique({ where: { id } });
    expect(sigue).not.toBeNull();
    expect(sigue?.fotoClave).toBe("e".repeat(32));
  });

  it("con el almacén operativo borra los archivos Y la fila (el camino feliz no se rompió)", async () => {
    const clave = "1".repeat(32);
    const id = await ficha(`${PREFIJO}204`, {
      estado: "publicado",
      publicadoEn: AHORA,
      fotoClave: clave,
    });
    const borradas: string[] = [];

    expect(
      await borrarNegocio(
        prisma,
        id,
        almacenDeMentiras({
          borrar: async (c) => {
            borradas.push(c);
          },
        }),
      ),
    ).toEqual({ resultado: "borrado" });

    expect(borradas).toEqual([clave]);
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  it("ficha SIN foto con el almacén caído: se borra igual (no hay nada que alcanzar)", async () => {
    const id = await ficha(`${PREFIJO}205`, { fotoClave: null });

    expect(
      await borrarNegocio(
        prisma,
        id,
        almacenDeMentiras({
          borrar: () => Promise.reject(new Error("almacén caído")),
          listar: () => Promise.reject(new Error("almacén caído")),
        }),
      ),
    ).toEqual({ resultado: "borrado" });

    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  it("ninguna combinación borra la fila dejando el archivo en el almacén", async () => {
    // Barrido de las cuatro combinaciones de (tiene foto) × (almacén sano).
    // El invariante: si la fila desapareció, o no había archivo, o el almacén
    // confirmó haberlo borrado. Nunca "fila fuera, archivo dentro".
    const casos = [
      { etiqueta: "con foto · almacén sano", conFoto: true, sano: true },
      { etiqueta: "con foto · almacén caído", conFoto: true, sano: false },
      { etiqueta: "sin foto · almacén sano", conFoto: false, sano: true },
      { etiqueta: "sin foto · almacén caído", conFoto: false, sano: false },
    ];

    for (const [i, caso] of casos.entries()) {
      const clave = caso.conFoto ? String(i).repeat(32) : null;
      const id = await ficha(`${PREFIJO}21${i}`, { fotoClave: clave });
      const confirmadas: string[] = [];

      await borrarNegocio(
        prisma,
        id,
        almacenDeMentiras({
          borrar: async (c) => {
            if (!caso.sano) throw new Error("almacén caído");
            confirmadas.push(c);
          },
        }),
      );

      const filaSeFue = (await prisma.negocio.findUnique({ where: { id } })) === null;
      const archivoConfirmado = clave === null || confirmadas.includes(clave);
      expect(
        filaSeFue ? archivoConfirmado : true,
        `${caso.etiqueta}: la fila se fue dejando el archivo`,
      ).toBe(true);
    }
  });

  /**
   * ITERACIÓN 4 · esta prueba estaba INVERTIDA a propósito: documentaba el
   * comportamiento de entonces (la fila se iba y nada avisaba de que su foto
   * quedaba en el almacén) y anotaba cuál sería el correcto. Con la decisión
   * del fundador sobre R4 ya no hay que documentar el defecto: se fija el
   * comportamiento nuevo, que es el que aquella nota pedía.
   */
  it("y en la purga diaria ese mismo caso cuenta como fallido, no como limpio", async () => {
    const id = await ficha(`${PREFIJO}203`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - 120 * 24 * 60 * 60 * 1000),
      motivoRechazo: "Motivo ficticio",
      fotoClave: "f".repeat(32),
    });

    const resultado = await purgarRechazados(prisma, {
      ahora: AHORA,
      almacen: crearAlmacenSinConfigurar(),
    });

    // `fallidos` es lo que hace que la ruta del cron responda 500, que es la
    // maquinaria que la iteración 2 construyó para que esto no pase callado.
    expect(resultado.eliminados).toBe(0);
    expect(resultado.fallidos).toBe(1);
    // Y la ficha SIGUE ahí: mañana se reintenta. Antes desaparecía dejando su
    // foto viva y sin ninguna fila que la nombrara.
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });
});
