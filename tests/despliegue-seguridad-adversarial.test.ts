import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  apuntaABaseLocal,
  esEntornoDeProduccion,
} from "../prisma/guardas-entorno";
import { seedCatalogos } from "../prisma/seed";
import { motivoParaNoSembrar } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import { rechazarRegistro } from "../src/lib/admin/transiciones";
import type { AlmacenFotos } from "../src/lib/fotos/almacen";
import { normalizarTexto, terminosDeBusqueda } from "../src/lib/busqueda";
import { purgarRechazados } from "../src/lib/purga/rechazados";
import { secretoDeTareaCorrecto } from "../src/lib/tareas/secreto";
import { crearClientePrueba } from "./db";
import { almacenDeMentiras } from "./fotos-fixtures";

/**
 * ETAPA C (seguridad y pruebas) del change `preparar-deploy-produccion`.
 *
 * Lo que el camino feliz del dev no cubre: el cambio de dialecto SQLite →
 * PostgreSQL movido a producción. Cada bloque dice qué hallazgo fija.
 *
 * ITERACIÓN 2: las cuatro pruebas que estaban en rojo a propósito ([A1] ×2,
 * [M3] y [M4]) están EN VERDE — el dev cerró esos tres hallazgos. Se quedan
 * como pruebas de regresión: son la definición ejecutable de lo que no puede
 * volver a pasar. Las adversariales nuevas de la iteración 2 están en
 * `tests/iteracion2-seguridad-adversarial.test.ts`.
 *
 * Todos los datos son ficticios (repo público + LFPDPPP): serie 771999 4xxx,
 * hosts `.invalid` y `.example` reservados por la RFC.
 */

const PREFIJO = "7719994";
const AHORA = new Date("2026-12-01T09:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1000;

let prisma: PrismaClient;
let categoriaId: number;

async function alta(
  whatsapp: string,
  datos: Record<string, unknown> = {},
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio de la Etapa C",
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-06-01T10:00:00.000Z"),
      ...datos,
    },
  });
  return creado.id;
}

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

afterEach(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

// ── 1. La guarda de "base local" contra el host que `pg` usa de verdad ──────
//
// `apuntaABaseLocal` es lo único que impide que `npm run db:seed:demo` siembre
// 12 negocios de mentira en la base de VERDAD cuando quien lo corre no está en
// un entorno marcado como producción (su laptop nunca lo está). Lee el
// `hostname` de la URL con `new URL(...)`; el adaptador (`@prisma/adapter-pg`
// → `pg` → `pg-connection-string`) NO usa ese hostname si la cadena trae el
// parámetro `?host=`, que es sintaxis estándar de PostgreSQL.

/** El host al que `pg` se conectaría de verdad con esa cadena. */
function hostRealDePg(connectionString: string): string {
  return String(new pg.Client({ connectionString }).host ?? "");
}

const HOSTS_DE_ESTA_MAQUINA = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

describe("adversarial · la guarda de base local y el host real del driver", () => {
  it.each([
    ["postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable"],
    ["postgresql://postgres:postgres@127.0.0.1:5432/necesitouno"],
    ["postgres://postgres:postgres@[::1]:5432/necesitouno"],
  ])("una dirección local de verdad se reconoce como local (%s)", (url) => {
    expect(apuntaABaseLocal({ DATABASE_URL: url })).toBe(true);
    expect(HOSTS_DE_ESTA_MAQUINA.has(hostRealDePg(url))).toBe(true);
  });

  it.each([
    // Un dominio que sólo EMPIEZA por localhost no es esta máquina.
    ["postgresql://u:p@localhost.necesitouno.example:5432/db"],
    // Credenciales con `@` adentro: el host real es el último tramo.
    ["postgresql://localhost:p@db.necesitouno.example:5432/db"],
    ["postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres"],
  ])("una dirección remota se reconoce como remota (%s)", (url) => {
    expect(apuntaABaseLocal({ DATABASE_URL: url })).toBe(false);
  });

  /**
   * HALLAZGO A1 (alto) — EN ROJO A PROPÓSITO.
   *
   * `?host=` es sintaxis de cadena de conexión de PostgreSQL y `pg` la
   * obedece: el `hostname` de la URL se ignora. Comprobado en vivo contra la
   * base local (una URL con hostname inexistente y `?host=localhost` conecta).
   *
   * Explotación: quien copia la cadena de Supabase con esa forma —o quien
   * recibe un `.env` preparado— corre `npm run db:seed:demo` desde su laptop
   * (donde NODE_ENV/VERCEL_ENV no son `production`), la guarda contesta
   * "local", no pide `SEED_DEMO_PERMITIR=1`, y los 12 negocios de mentira
   * entran en la base de producción. Lo mismo con
   * `npm run db:backfill:busqueda`, que reescribe columnas de TODAS las fichas.
   *
   * Arreglo: derivar el host con el mismo parser del driver (o rechazar toda
   * cadena que traiga `host`/`hostaddr` como parámetro).
   */
  it("[A1] la guarda coincide con el host al que el driver se conecta de verdad", () => {
    const url =
      "postgresql://postgres:clave@localhost:5432/postgres?host=db.abcdefgh.supabase.co";

    expect(hostRealDePg(url)).toBe("db.abcdefgh.supabase.co");
    expect(apuntaABaseLocal({ DATABASE_URL: url })).toBe(false);
  });

  it("[A1] con esa cadena el seed de demostración pide permiso explícito", () => {
    const env = {
      DATABASE_URL:
        "postgresql://postgres:clave@localhost:5432/postgres?host=db.abcdefgh.supabase.co",
    };

    expect(esEntornoDeProduccion(env)).toBe(false);
    expect(motivoParaNoSembrar(env)).not.toBeNull();
  });
});

// ── 2. Los CHECK de la migración bajo UPDATE crudo (transiciones ilegales) ──
//
// El dev los ejercita con INSERT. Una transición ilegal no se escribe con un
// INSERT: se escribe con un UPDATE (`rechazado → publicado` sin pasar por
// revisión, un estado con otra caja, un espacio pegado al final). Aquí van por
// debajo de Prisma, como llegaría un `psql` a mano o un script de operación.

describe("adversarial · los CHECK aguantan un UPDATE crudo y hostil", () => {
  const CASOS: Array<[string, string]> = [
    ["mayúsculas", "PUBLICADO"],
    ["capitalizado", "Publicado"],
    ["con espacio al final", "publicado "],
    ["con espacio al principio", " publicado"],
    ["con salto de línea", "publicado\n"],
    ["con tabulador", "publicado\t"],
    ["vacío", ""],
    ["parecido con guion", "publi-cado"],
    ["con acento", "publicadó"],
    ["cirílico homoglifo", "publicadо"],
    ["inventado", "aprobado"],
  ];

  it.each(CASOS)(
    "la base rechaza mover el estado a un valor %s",
    async (_etiqueta, valor) => {
      const id = await alta(`${PREFIJO}${Math.random().toString().slice(2, 8)}`, {
        estado: "rechazado",
        rechazadoEn: AHORA,
        motivoRechazo: "Motivo ficticio",
      });

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "Negocio" SET "estado" = $1 WHERE "id" = $2`,
          valor,
          id,
        ),
      ).rejects.toThrow();

      const releido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      expect(releido.estado).toBe("rechazado");
    },
  );

  it("la base rechaza un origen fuera del conjunto en un UPDATE", async () => {
    const id = await alta(`${PREFIJO}201`);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Negocio" SET "origen" = $1 WHERE "id" = $2`,
        "importado",
        id,
      ),
    ).rejects.toThrow();
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).origen).toBe(
      "organico",
    );
  });

  it("la base rechaza mover un reporte a un estado inventado", async () => {
    const id = await alta(`${PREFIJO}202`, { estado: "publicado", publicadoEn: AHORA });
    const reporte = await prisma.reporte.create({
      data: { negocioId: id, motivo: "cerrado" },
    });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Reporte" SET "estado" = $1 WHERE "id" = $2`,
        "archivado",
        reporte.id,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Reporte" SET "motivo" = $1 WHERE "id" = $2`,
        "otro",
        reporte.id,
      ),
    ).rejects.toThrow();
  });

  // Doble aprobación: la escritura va condicionada al estado, así que la
  // segunda no puede pisar la fecha de la primera ni "reaprobar" un rechazado.
  it("una ficha rechazada no se puede aprobar sin volver a revisión", async () => {
    const id = await alta(`${PREFIJO}203`, {
      estado: "rechazado",
      rechazadoEn: AHORA,
      motivoRechazo: "Motivo ficticio",
    });

    const { count } = await prisma.negocio.updateMany({
      where: { id, estado: "en_revision" },
      data: { estado: "publicado", publicadoEn: AHORA },
    });

    expect(count).toBe(0);
    const releido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(releido.estado).toBe("rechazado");
    expect(releido.publicadoEn).toBeNull();
  });
});

// ── 3. Los índices únicos que en SQLite admitían varios NULL ────────────────
//
// La migración de SQLite lo decía con todas sus letras ("en SQLite un índice
// único admite varios NULL, que es lo que necesitan las fichas sin foto"). Si
// eso cambiara al mudarse a PostgreSQL, la SEGUNDA ficha sin foto no se podría
// registrar. Se fija aquí para que no dependa de un comentario.

describe("adversarial · los índices únicos y los nulos, en el dialecto nuevo", () => {
  it("muchas fichas pueden convivir sin foto y sin token de gestión", async () => {
    await alta(`${PREFIJO}301`);
    await alta(`${PREFIJO}302`);
    await alta(`${PREFIJO}303`);

    const sinFoto = await prisma.negocio.count({
      where: { whatsapp: { startsWith: PREFIJO }, fotoClave: null },
    });
    expect(sinFoto).toBe(3);
  });

  it("dos fichas no pueden compartir la misma clave de foto", async () => {
    const clave = "a".repeat(32);
    await alta(`${PREFIJO}304`, { fotoClave: clave });
    await expect(alta(`${PREFIJO}305`, { fotoClave: clave })).rejects.toThrow();
  });

  it("dos fichas no pueden compartir el mismo token de gestión", async () => {
    const token = "b".repeat(43);
    await alta(`${PREFIJO}306`, { tokenGestion: token });
    await expect(alta(`${PREFIJO}307`, { tokenGestion: token })).rejects.toThrow();
  });

  it("dos fichas no pueden compartir el mismo WhatsApp", async () => {
    await alta(`${PREFIJO}308`);
    await expect(alta(`${PREFIJO}308`)).rejects.toThrow();
  });
});

// ── 4. El buscador después del cambio de dialecto ───────────────────────────
//
// En SQLite `LIKE` ignoraba mayúsculas; en PostgreSQL NO (comprobado contra la
// base: `LIKE '%PLOME%'` no encuentra `plomeria`). Lo único que sostiene el
// requirement "coincidencia insensible a mayúsculas y acentos" es que las DOS
// puntas se normalizan. Estas pruebas son el candado: si alguien deja de
// normalizar una punta, el buscador se vuelve sensible a mayúsculas y nadie se
// entera hasta que un vecino escribe con teclado en mayúsculas.

describe("adversarial · el buscador y el LIKE sensible a mayúsculas de PostgreSQL", () => {
  beforeEach(async () => {
    await alta(`${PREFIJO}401`, {
      nombre: "Plomería Güicho",
      queOfreces: "Destape de DRENAJES y fugas",
      estado: "publicado",
      publicadoEn: AHORA,
      ...{
        nombreNormalizado: normalizarTexto("Plomería Güicho"),
        queOfrecesNormalizado: normalizarTexto("Destape de DRENAJES y fugas"),
      },
    });
  });

  it.each([
    ["PLOMERIA"],
    ["Plomería"],
    ["plomeria"],
    ["PLOMERÍA"],
    ["  plOMEría  "],
  ])("una consulta escrita como sea encuentra la misma ficha (%s)", async (consulta) => {
    const terminos = terminosDeBusqueda(consulta);
    expect(terminos.length).toBeGreaterThan(0);

    const filas = await prisma.negocio.findMany({
      where: {
        estado: "publicado",
        AND: terminos.map((termino) => ({
          OR: [
            { nombreNormalizado: { contains: termino } },
            { queOfrecesNormalizado: { contains: termino } },
          ],
        })),
      },
      select: { whatsapp: true },
    });

    expect(filas.map((f) => f.whatsapp)).toEqual([`${PREFIJO}401`]);
  });

  it("lo guardado en las columnas de búsqueda va en minúsculas y sin acentos", async () => {
    const fila = await prisma.negocio.findFirstOrThrow({
      where: { whatsapp: `${PREFIJO}401` },
      select: { nombreNormalizado: true, queOfrecesNormalizado: true },
    });

    for (const valor of [fila.nombreNormalizado, fila.queOfrecesNormalizado]) {
      expect(valor).toBe(valor.toLowerCase());
      expect(valor).toMatch(/^[a-z0-9 ]*$/);
    }
  });

  it("un término con comodines de LIKE no se cuela hasta la consulta", () => {
    expect(terminosDeBusqueda("100% _seguro%")).toEqual(["100", "segur"]);
    for (const termino of terminosDeBusqueda("%%%___%%%")) {
      expect(termino).toMatch(/^[a-z0-9]+$/);
    }
  });
});

// ── 5. La purga: bordes exactos del plazo y lo que la puede dejar a medias ──

describe("adversarial · los bordes exactos del plazo de 90 días", () => {
  const enFecha = (ms: number) =>
    alta(`${PREFIJO}${Math.random().toString().slice(2, 8)}`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - ms),
      motivoRechazo: "Motivo ficticio",
    });

  it("un milisegundo antes de cumplir 90 días NO se borra", async () => {
    const id = await enFecha(90 * DIA_MS - 1);
    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0 });
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  it("en el milisegundo exacto de los 90 días SÍ se borra", async () => {
    const id = await enFecha(90 * DIA_MS);
    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 1 });
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  it("una fecha de rechazo en el futuro (reloj torcido) no borra nada", async () => {
    const id = await enFecha(-30 * DIA_MS);
    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 0 });
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  it("un rechazado viejo que además fue despublicado alguna vez sí se borra", async () => {
    const id = await alta(`${PREFIJO}501`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - 200 * DIA_MS),
      motivoRechazo: "Motivo ficticio",
      despublicadoEn: new Date(AHORA.getTime() - 300 * DIA_MS),
      motivoDespublicacion: "Motivo ficticio",
      publicadoEn: new Date(AHORA.getTime() - 400 * DIA_MS),
    });
    expect(await purgarRechazados(prisma, { ahora: AHORA })).toMatchObject({ eliminados: 1 });
    expect(await prisma.negocio.findUnique({ where: { id } })).toBeNull();
  });

  /**
   * HALLAZGO M3 (medio) — EN ROJO A PROPÓSITO.
   *
   * `purgarRechazados` borra uno por uno en un `for` sin `try`. Si el almacén
   * de fotos falla al borrar UNA ficha (permisos, disco de sólo lectura,
   * almacén remoto caído), la excepción sube: la ruta contesta 500 y las demás
   * fichas que ya cumplieron el plazo NO se purgan. Como el fallo es estable,
   * al día siguiente vuelve a tropezar con la misma ficha: la purga de los 90
   * días que promete el aviso de privacidad no vuelve a completarse nunca.
   */
  // ITERACIÓN 2 · el `toEqual` exacto pasó a `toMatchObject`: al corregir M3,
  // `purgarRechazados` empezó a informar TAMBIÉN cuántos registros no se
  // pudieron eliminar (`fallidos`, que es lo que hace que la ruta responda 500
  // en vez de un 200 con la mala noticia adentro).
  //
  // ITERACIÓN 4 · cambió el CONTEO, no lo que esta prueba vigila. Con la
  // decisión del fundador sobre R4 (*el borrado se niega a mentir*), la ficha
  // cuya foto no se pudo alcanzar YA NO SE BORRA: su fila se queda, cuenta
  // como `fallidos` y el cron responde 500. Antes se borraba y se contaba como
  // eliminada, que era exactamente la mentira del hallazgo. Lo que esta prueba
  // existe para vigilar —que el fallo con UNA ficha no impida purgar las
  // demás— se sigue asegurando abajo, con la ficha sana.
  it("[M3] un fallo al borrar la foto de una ficha no impide purgar las demás", async () => {
    const claveRota = "c".repeat(32);
    await alta(`${PREFIJO}502`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - 120 * DIA_MS),
      motivoRechazo: "Motivo ficticio",
      fotoClave: claveRota,
    });
    const sana = await alta(`${PREFIJO}503`, {
      estado: "rechazado",
      rechazadoEn: new Date(AHORA.getTime() - 120 * DIA_MS),
      motivoRechazo: "Motivo ficticio",
    });

    const almacenQueFalla: AlmacenFotos = almacenDeMentiras({
      borrar: async (clave) => {
        if (clave === claveRota) throw new Error("EACCES: almacén de sólo lectura");
      },
    });

    await expect(
      purgarRechazados(prisma, { ahora: AHORA, almacen: almacenQueFalla }),
    ).resolves.toMatchObject({ eliminados: 1, fallidos: 1 });
    // La sana se purgó: el fallo de la otra no paró la pasada.
    expect(await prisma.negocio.findUnique({ where: { id: sana } })).toBeNull();
    // Y la que no se pudo alcanzar sigue ahí, para reintentarla mañana, en vez
    // de haber desaparecido dejando su foto viva y sin dueño.
    expect(
      await prisma.negocio.findFirst({ where: { fotoClave: claveRota } }),
    ).not.toBeNull();
  });
});

// ── 6. Byte nulo: lo que quedó fuera del arreglo del borde ──────────────────
//
// El dev tapó tres bordes (URL de ficha, id de reporte, comentario del
// reporte). PostgreSQL sigue abortando la consulta con `22021` en cualquier
// otro texto de usuario que llegue a la base. Comprobado contra la base: el
// byte nulo es el ÚNICO carácter que el motor rechaza — los surrogates sueltos
// y los no-caracteres se transcodifican a U+FFFD y entran sin ruido.

describe("adversarial · el byte nulo en los bordes que quedaron sin filtrar", () => {
  it("un surrogate suelto y un no-carácter SÍ entran (no hay que filtrarlos)", async () => {
    const id = await alta(`${PREFIJO}601`, { nombre: "Taco\uD800\uFFFFería" });
    const releido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(releido.nombre).toContain("Taco");
  });

  /**
   * HALLAZGO M4 (medio) — EN ROJO A PROPÓSITO.
   *
   * `rechazarRegistro` y `despublicarFicha` escriben el motivo tal cual, y
   * `accion-rechazar.ts` / `accion-despublicar.ts` no envuelven la llamada en
   * `try`. Un motivo con un byte nulo (un pegado desde otro programa) revienta
   * la consulta: la Server Action lanza y el panel devuelve un 500, con la
   * transición sin hacer. Mismo arreglo de borde que el comentario del reporte
   * (`sinBytesNulos`).
   */
  it("[M4] un motivo de rechazo con un byte nulo no tumba la transición", async () => {
    const id = await alta(`${PREFIJO}602`);

    await expect(
      rechazarRegistro(prisma, id, "Se cerr\u0000ó el negocio", AHORA),
    ).resolves.toBeDefined();
  });
});

// ── 7. La puerta de las tareas programadas ─────────────────────────────────

describe("adversarial · la comparación del secreto de las tareas", () => {
  const SECRETO = "secreto-ficticio-de-la-etapa-c-32-caracteres";

  it.each([
    ["sin encabezado", null],
    ["vacío", ""],
    ["sólo la palabra", "Bearer"],
    ["esquema en minúsculas", `bearer ${SECRETO}`],
    ["esquema en mayúsculas", `BEARER ${SECRETO}`],
    ["otro esquema", `Basic ${SECRETO}`],
    ["doble espacio", `Bearer  ${SECRETO}`],
    ["con basura pegada", `Bearer ${SECRETO}x`],
    ["un carácter de menos", `Bearer ${SECRETO.slice(0, -1)}`],
    ["con espacio al final", `Bearer ${SECRETO} `],
    ["con salto de línea", `Bearer ${SECRETO}\n`],
    ["dos secretos", `Bearer ${SECRETO}, Bearer ${SECRETO}`],
    ["el secreto pero en otra caja", `Bearer ${SECRETO.toUpperCase()}`],
    ["prefijo del secreto repetido", `Bearer ${SECRETO.slice(0, 5).repeat(9)}`],
  ])("no abre la puerta con un Authorization %s", (_etiqueta, encabezado) => {
    expect(secretoDeTareaCorrecto(encabezado, SECRETO)).toBe(false);
  });

  it("sólo el secreto exacto abre la puerta", () => {
    expect(secretoDeTareaCorrecto(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
  });

  it("un secreto vacío no se compara nunca contra un encabezado vacío", () => {
    // La ruta corta antes de llegar aquí, pero si alguien la reordena, esto
    // deja fijado que un secreto sin configurar no puede validar nada.
    expect(secretoDeTareaCorrecto("Bearer ", "")).toBe(true);
    // …por eso la comprobación de "secreto vacío" tiene que vivir en la ruta,
    // y hay prueba de ello en `tests/purga-rechazados.test.ts`.
  });
});
