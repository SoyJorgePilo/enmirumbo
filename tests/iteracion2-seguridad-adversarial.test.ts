import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { apuntaABaseLocal } from "../prisma/guardas-entorno";
import { seedCatalogos } from "../prisma/seed";
import { motivoParaNoSembrar } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  esBaseLocal,
  interpretarConexion,
  motivoDeConexionInsegura,
} from "../src/lib/base-datos/conexion";
import { apartarCupoCompartido, claveDeCupo } from "../src/lib/cupos/compartido";
import { almacenDeFotos, reiniciarAlmacenDeFotos } from "../src/lib/fotos/almacen";
import { barrerFotosHuerfanas } from "../src/lib/fotos/huerfanas";
import { motivoParaNoAbrirLaBase } from "../src/lib/prisma";
import { crearCupoPorIp } from "../src/lib/registro/limite-ip";
import { crearReporte } from "../src/lib/reportes/crear";
import { purgarRechazados } from "../src/lib/purga/rechazados";
import { crearClientePrueba, urlDeLaBaseDePrueba } from "./db";
import { almacenDeMentiras } from "./fotos-fixtures";

/**
 * ETAPA C · ITERACIÓN 2 del change `preparar-deploy-produccion`.
 *
 * Lo que se audita aquí es la CORRECCIÓN, no el hallazgo original: que A1 y A2
 * estén cerrados con mis payloads y con variantes nuevas, que el cerrojo de A3
 * esté en el camino real (y no sólo en una copia del SQL dentro de una
 * prueba), y que las decisiones nuevas de A4 y A5 no hayan abierto puertas
 * distintas.
 *
 * ⚠️ DOS PRUEBAS ESTÁN EN ROJO A PROPÓSITO ([R1] y [R2]): fijan los dos
 * hallazgos que la iteración 2 deja abiertos. Se ponen solas en verde cuando
 * se corrijan.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771999 6xxx, hosts
 * `.invalid` / `.example` reservados por la RFC, e IPs de documentación
 * (RFC 5737: 203.0.113.0/24).
 */

const PREFIJO = "7719996";
const AHORA = new Date("2026-12-01T09:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1000;

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

// ── 1. A1: el host efectivo, con los payloads originales y con más ──────────
//
// El invariante que A1 rompía, escrito una sola vez: la guarda NUNCA puede
// decir "local" cuando el driver se conectaría a otra máquina. Se comprueba
// contra `pg` de verdad, que es quien abre el socket.

/**
 * El host al que `pg` se conectaría de verdad con esa cadena.
 *
 * Se compara en minúsculas porque la resolución de nombres NO distingue cajas:
 * `LOCALHOST` y `localhost` abren el mismo socket. (Una ruta de socket Unix sí
 * distingue mayúsculas, pero esas no cuentan como locales para la guarda, así
 * que normalizar aquí no puede convertir una remota en local.)
 */
function hostRealDePg(url: string): string {
  try {
    return String(new pg.Client({ connectionString: url }).host ?? "").toLowerCase();
  } catch {
    return "<no parseable>";
  }
}

const HOSTS_DE_ESTA_MAQUINA = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Cadenas hostiles y legítimas, para el invariante de abajo. */
const CADENAS = [
  // El payload original del hallazgo A1.
  "postgresql://postgres:clave@localhost:5432/postgres?host=db.abcdefgh.supabase.co",
  // Variantes de la misma idea.
  "postgresql://postgres:clave@localhost:5432/postgres?host=localhost&host=db.a.example",
  "postgresql://postgres:clave@localhost:5432/postgres?host=db.a.example&host=localhost",
  "postgresql://postgres:clave@localhost:5432/postgres?HOST=db.a.example",
  "postgresql://postgres:clave@localhost:5432/postgres?hostaddr=203.0.113.9",
  "postgresql://postgres:clave@localhost:5432/postgres?host=%2Fvar%2Frun%2Fpostgresql",
  // Las de siempre.
  "postgresql://postgres:clave@db.inexistente.invalid:5432/x?host=localhost",
  "postgresql://postgres:clave@LOCALHOST:5432/x",
  "postgresql://postgres:clave@localhost.evil.example:5432/x",
  "postgresql://localhost:clave@db.evil.example:5432/x",
  "postgresql://postgres:clave@127.0.0.1:5432/x",
  "postgres://postgres:clave@[::1]:5432/x",
  "postgresql://postgres:clave@db.abcdefgh.supabase.co:5432/postgres",
  "file:./prisma/dev.db",
  "no-es-una-url",
  "",
];

describe("iteración 2 · A1: la guarda no puede ser más laxa que el driver", () => {
  it.each(CADENAS.map((c) => [c || "(cadena vacía)", c] as const))(
    "INVARIANTE · %s",
    (_etiqueta, cadena) => {
      const dice = esBaseLocal(cadena);
      if (!dice) return; // decir "remota" nunca es inseguro
      // Si dice "local", el driver TIENE que estar de acuerdo.
      expect(HOSTS_DE_ESTA_MAQUINA.has(hostRealDePg(cadena))).toBe(true);
    },
  );

  it("el payload original de A1 se reconoce como remoto y el seed se niega", () => {
    const url = CADENAS[0];
    expect(hostRealDePg(url)).toBe("db.abcdefgh.supabase.co");
    expect(esBaseLocal(url)).toBe(false);
    expect(apuntaABaseLocal({ DATABASE_URL: url })).toBe(false);
    expect(motivoParaNoSembrar({ DATABASE_URL: url })).not.toBeNull();
  });

  it("una cadena con `hostaddr` no se adivina: se trata como remota", () => {
    // `pg` lo ignora y libpq no: la misma cadena significa cosas distintas
    // según quién la lea, y una guarda no puede apostar.
    const url = "postgresql://postgres:clave@localhost:5432/x?hostaddr=203.0.113.9";
    expect(interpretarConexion(url).sospechosa).toBe(true);
    expect(esBaseLocal(url)).toBe(false);
  });

  it("la base local de desarrollo sigue reconociéndose (no se rompió el día a día)", () => {
    expect(esBaseLocal("postgresql://postgres:postgres@localhost:51214/template1?sslmode=disable")).toBe(
      true,
    );
    expect(motivoParaNoSembrar({ DATABASE_URL: urlDeLaBaseDePrueba() })).toBeNull();
  });
});

// ── 2. A2: TLS exigido en el código, no sólo escrito en el documento ────────

describe("iteración 2 · A2: sin TLS no se abre la base remota", () => {
  it.each([
    // Los DOS literales que documenta docs/despliegue.md §3.1 y §4.
    ["directa de Supabase", "postgresql://postgres:CLAVE@db.abcdefgh.supabase.co:5432/postgres"],
    [
      "pooler de Supabase",
      "postgresql://postgres.ref:CLAVE@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    ],
    [
      "remota con sslmode=disable",
      "postgresql://postgres:CLAVE@db.abcdefgh.supabase.co:5432/postgres?sslmode=disable",
    ],
    ["remota con la palabra sslmode en el nombre de la base", "postgresql://u:p@db.a.example:5432/sslmode"],
  ])("una conexión remota %s se rechaza", (_etiqueta, url) => {
    expect(motivoDeConexionInsegura(url)).not.toBeNull();
    expect(motivoParaNoAbrirLaBase({ DATABASE_URL: url })).not.toBeNull();
  });

  it.each([
    ["remota con sslmode=require", "postgresql://u:CLAVE@db.a.example:5432/x?sslmode=require"],
    ["remota con sslmode=verify-full", "postgresql://u:CLAVE@db.a.example:5432/x?sslmode=verify-full"],
    ["local sin TLS (los bytes no salen del equipo)", "postgresql://u:p@localhost:5432/x"],
    ["local con sslmode=disable", "postgresql://u:p@127.0.0.1:51214/t?sslmode=disable"],
  ])("una conexión %s se acepta", (_etiqueta, url) => {
    expect(motivoDeConexionInsegura(url)).toBeNull();
  });

  it("el motivo NUNCA repite la contraseña ni la cadena completa", () => {
    const url = "postgresql://postgres:Sup3rClaveDeProduccion@db.abcdefgh.supabase.co:5432/postgres";
    const motivo = motivoDeConexionInsegura(url) ?? "";
    expect(motivo).not.toContain("Sup3rClaveDeProduccion");
    expect(motivo).not.toContain(url);
    // Pero sí dice qué host y qué hay que poner: un aviso que no se puede
    // accionar es ruido.
    expect(motivo).toContain("db.abcdefgh.supabase.co");
    expect(motivo).toContain("sslmode=require");
  });

  it("una dirección ilegible se trata como insegura, no como local", () => {
    for (const url of ["no-es-una-url", "file:./prisma/dev.db", "   "]) {
      expect(esBaseLocal(url)).toBe(false);
      expect(motivoDeConexionInsegura(url)).not.toBeNull();
    }
  });
});

// ── 3. A3: el cerrojo tiene que estar en el CAMINO REAL ─────────────────────
//
// `tests/concurrencia-real.test.ts` demuestra el mecanismo de la base con su
// propia copia del SQL: si alguien borrara el `pg_advisory_xact_lock` de
// `src/lib/reportes/crear.ts`, esa prueba seguiría en verde. Esto vigila la
// sentencia que el servidor emite de verdad.

/** Cliente de mentiras que apunta las consultas que le piden, en orden. */
function clienteQueApunta(consultas: string[], filas = 1) {
  const tx = {
    $queryRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => {
      consultas.push(partes.join("?") + " || " + JSON.stringify(valores));
      return Promise.resolve([]);
    },
    $executeRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => {
      consultas.push(partes.join("?") + " || " + JSON.stringify(valores));
      return Promise.resolve(filas);
    },
  };
  return {
    negocio: { findUnique: () => Promise.resolve({ estado: "publicado" }) },
    $transaction: (operacion: (t: typeof tx) => Promise<number>) => operacion(tx),
  };
}

describe("iteración 2 · A3: el cerrojo va en la sentencia que el servidor emite", () => {
  it("crearReporte toma el cerrojo consultivo ANTES del INSERT y en la misma transacción", async () => {
    const consultas: string[] = [];
    const resultado = await crearReporte(clienteQueApunta(consultas) as never, {
      negocioId: "ficha-ficticia-de-prueba",
      motivo: "cerrado",
      comentario: "",
      trampa: "",
      ip: null,
    });

    expect(resultado).toEqual({ resultado: "creado" });
    expect(consultas).toHaveLength(2);
    // 1º el cerrojo, 2º el INSERT: al revés no serializa nada.
    expect(consultas[0]).toContain("pg_advisory_xact_lock");
    expect(consultas[0]).toContain("ficha-ficticia-de-prueba");
    expect(consultas[1]).toContain('INSERT INTO "Reporte"');
    expect(consultas[1]).toContain("COUNT(*)");
  });

  it("el cerrojo se toma por FICHA, no uno global para todo el sitio", async () => {
    const unas: string[] = [];
    const otras: string[] = [];
    const envio = { motivo: "cerrado" as const, comentario: "", trampa: "", ip: null };
    await crearReporte(clienteQueApunta(unas) as never, { ...envio, negocioId: "ficha-a" });
    await crearReporte(clienteQueApunta(otras) as never, { ...envio, negocioId: "ficha-b" });

    expect(unas[0]).not.toBe(otras[0]);
  });

  it("el cupo compartido también toma su cerrojo antes de contar", async () => {
    const consultas: string[] = [];
    const cliente = {
      $transaction: (operacion: (t: unknown) => Promise<boolean>) =>
        operacion({
          $queryRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => {
            consultas.push(partes.join("?") + JSON.stringify(valores));
            return Promise.resolve([]);
          },
          intentoDeCupo: {
            count: () => Promise.resolve(0),
            create: () => Promise.resolve({}),
            deleteMany: () => Promise.resolve({ count: 0 }),
          },
        }),
      intentoDeCupo: { deleteMany: () => Promise.resolve({ count: 0 }) },
    };

    await apartarCupoCompartido(cliente as never, {
      cupo: "acceso-panel",
      ip: "203.0.113.7",
      maximo: 5,
      ventanaMs: 600_000,
      secreto: "secreto-ficticio-de-al-menos-32-caracteres",
      respaldo: crearCupoPorIp({ maximo: 5, ventanaMs: 600_000 }),
    });

    expect(consultas[0]).toContain("pg_advisory_xact_lock");
  });

  /**
   * El guardián del salto: `tests/concurrencia-real.test.ts` se salta cuando la
   * base multiplexa todas las conexiones sobre un solo backend (PGlite). Eso es
   * correcto en una laptop y NO lo es en el CI: ahí esas dos pruebas son la
   * única demostración de que el cerrojo hace algo, y un salto silencioso
   * dejaría el PR en verde sin haberlas corrido nunca.
   */
  it("en el CI la base tiene que poder ejercitar carreras de verdad", async () => {
    if (!process.env.CI) return;
    const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
    const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
    try {
      await a.connect();
      await b.connect();
      const pidA = (await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const pidB = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      expect(pidA).not.toBe(pidB);
    } finally {
      await a.end().catch(() => {});
      await b.end().catch(() => {});
    }
  });
});

// ── 4. A4: lo que se guarda del intento de acceso, y cuánto dura ────────────

describe("iteración 2 · A4: la clave del cupo no es la IP", () => {
  const SECRETO = "secreto-de-sesion-ficticio-de-al-menos-32-caracteres";
  const IP = "203.0.113.7";

  it("no contiene la IP ni ninguna forma reconocible de ella", () => {
    const clave = claveDeCupo("acceso-panel", IP, SECRETO);
    expect(clave).toMatch(/^[0-9a-f]{32}$/);
    for (const forma of [IP, "203.0.113", "203", Buffer.from(IP).toString("hex")]) {
      expect(clave).not.toContain(forma);
    }
  });

  it("rotar el secreto invalida el histórico entero", () => {
    expect(claveDeCupo("acceso-panel", IP, SECRETO)).not.toBe(
      claveDeCupo("acceso-panel", IP, `${SECRETO}-rotado`),
    );
  });

  it("dos cupos distintos no comparten contador aunque sea la misma IP", () => {
    expect(claveDeCupo("acceso-panel", IP, SECRETO)).not.toBe(
      claveDeCupo("altas-formulario", IP, SECRETO),
    );
  });

  it("sin secreto no se escribe NADA en la base: se cae al contador en memoria", async () => {
    const respaldo = crearCupoPorIp({ maximo: 1, ventanaMs: 600_000 });
    const concedido = await apartarCupoCompartido(prisma as never, {
      cupo: "acceso-panel",
      ip: IP,
      maximo: 1,
      ventanaMs: 600_000,
      secreto: "   ",
      respaldo,
    });
    expect(concedido).toBe(true);
    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });

  /**
   * HALLAZGO R1 (medio) — EN ROJO A PROPÓSITO.
   *
   * La migración `20260907000000_agrega_cupos_compartidos` promete que "las
   * filas se borran en cuanto salen de la ventana, **y el barrido de la purga
   * diaria recoge las que queden**", y `docs/despliegue.md` §3.5 repite lo
   * primero. Ninguna de las dos cosas es cierta para la fila que importa: la
   * limpieza sólo ocurre dentro de `apartarCupoCompartido`, o sea sólo para
   * las claves que se vuelven a consultar. La procedencia que prueba una vez
   * y no vuelve deja su fila en la base para siempre, y ninguna tarea
   * programada la recoge.
   */
  it("[R1] una marca fuera de la ventana no sobrevive a la tarea programada diaria", async () => {
    const respaldo = crearCupoPorIp({ maximo: 5, ventanaMs: 600_000 });
    const vieja = new Date(AHORA.getTime() - 30 * DIA_MS);

    await apartarCupoCompartido(prisma as never, {
      cupo: "acceso-panel",
      ip: "203.0.113.44",
      maximo: 5,
      ventanaMs: 600_000,
      ahora: vieja,
      secreto: SECRETO,
      respaldo,
    });
    expect(await prisma.intentoDeCupo.count()).toBe(1);

    // La purga diaria es la única tarea programada que toca la base.
    await purgarRechazados(prisma, { ahora: AHORA, almacen: almacenDeMentiras() });

    expect(await prisma.intentoDeCupo.count()).toBe(0);
  });
});

// ── 5. A5: el almacén de fotos, y la salvaguarda nueva ──────────────────────

describe("iteración 2 · A5: el barrido y el almacén equivocado", () => {
  async function ficha(whatsapp: string, fotoClave: string | null): Promise<void> {
    await prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio de la Iteración 2",
        categoriaId,
        whatsapp,
        consintioAvisoEn: AHORA,
        estado: "publicado",
        publicadoEn: AHORA,
        fotoClave,
      },
    });
  }

  it("almacén vacío CON fichas que dicen tener foto: se detiene y lo dice", async () => {
    await ficha(`${PREFIJO}101`, "d".repeat(32));

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacenDeMentiras({ listar: async () => [] }),
    });

    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.mensaje).toContain("almacén equivocado");
    // Y ninguna clave de foto sale en el mensaje.
    expect(resultado.mensaje).not.toContain("d".repeat(32));
  });

  it("almacén vacío SIN fichas con foto: eso sí es 'nada que barrer' (sin falso positivo)", async () => {
    await ficha(`${PREFIJO}102`, null);

    const resultado = await barrerFotosHuerfanas({
      prisma,
      almacen: almacenDeMentiras({ listar: async () => [] }),
    });

    expect(resultado.barrido).toBe(true);
    expect(resultado.revisadas).toBe(0);
  });

  /**
   * HALLAZGO R2 (medio) — EN ROJO A PROPÓSITO.
   *
   * `almacenDeFotos()` elige Supabase Storage si están las dos variables y, si
   * no, **cae al disco local sin decir una palabra** (con las dos ausentes
   * `configuracionSupabase` devuelve `null` en silencio; sólo avisa cuando hay
   * una y falta la otra). En Vercel ese disco es efímero: las fotos no
   * sobreviven un despliegue y el borrado ARCO responde "borrado" sin borrar.
   *
   * Es exactamente lo que el requirement "En producción ninguna configuración
   * requerida falta en silencio" prohíbe, y el mismo caso que este change ya
   * resuelve para `DATABASE_URL`, `SITIO_URL` y `CRON_SECRET`.
   */
  it("[R2] en producción el almacén de fotos no puede ser el disco efímero", () => {
    reiniciarAlmacenDeFotos();
    const almacen = almacenDeFotos({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(almacen.descripcion()).not.toContain("disco local");
  });

  it("con las dos variables puestas se usa Supabase, no el disco", () => {
    reiniciarAlmacenDeFotos();
    const almacen = almacenDeFotos({
      SUPABASE_URL: "https://proyecto-ficticio.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "llave-ficticia-de-servicio",
    });
    expect(almacen.descripcion()).toContain("Supabase");
    expect(almacen.descripcion()).not.toContain("llave-ficticia-de-servicio");
  });

  it("con media configuración avisa y NO se queda callado", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    reiniciarAlmacenDeFotos();
    almacenDeFotos({ SUPABASE_URL: "https://proyecto-ficticio.supabase.co" });
    expect(aviso).toHaveBeenCalled();
    expect(aviso.mock.calls.flat().join(" ")).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

// ── 6. Cabeceras de la adenda, en el módulo que las define ──────────────────

describe("iteración 2 · las cabeceras globales y la del panel", () => {
  it("la política del panel es más estricta que la global, no igual", async () => {
    const { POLITICA_DE_REFERENTE } = await import("../src/lib/seguridad/csp");
    // `strict-origin` no manda ruta ni siquiera dentro del propio sitio;
    // `strict-origin-when-cross-origin` sí la manda en el mismo origen.
    expect(POLITICA_DE_REFERENTE).toBe("strict-origin-when-cross-origin");
    const layout = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/admin/layout.tsx", "utf8"),
    );
    expect(layout).toMatch(/referrer:\s*"strict-origin"/);
  });

  it("toda respuesta lleva las cuatro cabeceras, con su valor exacto", async () => {
    const { cabecerasDeSeguridad } = await import("../src/lib/seguridad/csp");
    const puestas = new Map(cabecerasDeSeguridad().map((c) => [c.key, c.value]));

    expect(puestas.get("X-Content-Type-Options")).toBe("nosniff");
    expect(puestas.get("X-Frame-Options")).toBe("DENY");
    expect(puestas.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(puestas.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("ninguna cabecera de seguridad lleva un valor vacío", async () => {
    const { cabecerasDeSeguridad } = await import("../src/lib/seguridad/csp");
    for (const { key, value } of cabecerasDeSeguridad()) {
      expect(value.trim(), `cabecera ${key}`).not.toBe("");
    }
  });
});
