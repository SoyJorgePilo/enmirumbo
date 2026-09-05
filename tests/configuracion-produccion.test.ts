import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { motivoParaNoRellenar, VARIABLE_PERMISO_BACKFILL } from "../prisma/backfill-busqueda";
import { apuntaABaseLocal, esEntornoDeProduccion } from "../prisma/guardas-entorno";
import { motivoParaNoSembrar, VARIABLE_PERMISO_SEED_DEMO } from "../prisma/seed-demo";
import { URL_BASE_LOCAL_POR_DEFECTO } from "../src/lib/base-local";
import {
  esBaseLocal,
  interpretarConexion,
  motivoDeConexionInsegura,
} from "../src/lib/base-datos/conexion";
import {
  avisarSinBaseDeDatosUnaVez,
  MENSAJE_SIN_BASE_DATOS,
  motivoParaNoAbrirLaBase,
  reiniciarAvisoDeBaseDeDatos,
  urlBaseDeDatos,
  VARIABLE_BASE_DATOS,
} from "../src/lib/prisma";
import {
  avisarSinSecretoDeTareasUnaVez,
  reiniciarAvisoDeSecretoDeTareas,
  VARIABLE_SECRETO_TAREAS,
} from "../src/lib/tareas/secreto";
import {
  avisarSinUrlSitioUnaVez,
  reiniciarAvisoDeUrlSitio,
  urlSitio,
  VARIABLE_URL_SITIO,
} from "../src/lib/sitio";

/**
 * Spec `despliegue` · Requirements "En producción ninguna configuración
 * requerida falta en silencio" y "Los comandos que escriben en la base
 * reconocen el entorno real" (change `preparar-deploy-produccion`, tasks #7 y
 * #8).
 */

const LOCAL = "postgresql://postgres:postgres@localhost:51214/template1";
const REMOTA =
  "postgresql://usuario:clave@db.abcdefg.supabase.co:5432/postgres?sslmode=require";
/** La misma, tal como la escribiría alguien que no supo que hay que pedir TLS. */
const REMOTA_EN_CLARO = "postgresql://usuario:clave@db.abcdefg.supabase.co:5432/postgres";

beforeEach(() => {
  reiniciarAvisoDeBaseDeDatos();
  reiniciarAvisoDeUrlSitio();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. Qué cuenta como "la base de esta máquina" ────────────────────────────

describe("guardas · 'base local' ya no es un archivo, es un host", () => {
  it.each([
    ["localhost", LOCAL],
    ["127.0.0.1", "postgresql://postgres@127.0.0.1:5432/enmirumbo"],
    ["IPv6 local", "postgresql://postgres@[::1]:5432/enmirumbo"],
    ["esquema postgres://", "postgres://postgres@localhost:5432/enmirumbo"],
    ["con mayúsculas y espacios", "  POSTGRESQL://postgres@LOCALHOST:5432/x  "],
    ["sin declarar (se usa el default local)", undefined],
  ])("reconoce como local: %s", (_caso, DATABASE_URL) => {
    expect(apuntaABaseLocal({ DATABASE_URL })).toBe(true);
  });

  it.each([
    ["Supabase", REMOTA],
    ["otro host cualquiera", "postgresql://u:c@db.example.com:5432/x"],
    ["un subdominio que empieza por localhost", "postgresql://u@localhost.evil.com:5432/x"],
    ["el archivo SQLite de la era anterior", "file:./prisma/dev.db"],
    ["el mismo archivo en mayúsculas", "  FILE:./prisma/dev.db  "],
    ["prisma accelerate", "prisma://accelerate.prisma-data.net/?api_key=x"],
    ["libsql", "libsql://enmirumbo.turso.io?authToken=x"],
    ["https", "https://base.example/db"],
    ["mysql local (otro motor)", "mysql://root@localhost:3306/enmirumbo"],
    ["una dirección ilegible", "no-es-una-url"],
    ["basura con pinta de host", "postgresql//localhost/x"],
  ])("NO reconoce como local: %s", (_caso, DATABASE_URL) => {
    expect(apuntaABaseLocal({ DATABASE_URL })).toBe(false);
  });

  it("producción se detecta por cualquiera de las dos variables del hosting", () => {
    expect(esEntornoDeProduccion({ NODE_ENV: "production" })).toBe(true);
    expect(esEntornoDeProduccion({ VERCEL_ENV: "production" })).toBe(true);
    expect(esEntornoDeProduccion({ NODE_ENV: " Production " })).toBe(true);
    expect(esEntornoDeProduccion({ NODE_ENV: "development" })).toBe(false);
    expect(esEntornoDeProduccion({})).toBe(false);
  });
});

describe("guardas · las políticas de cada comando no cambiaron", () => {
  // Scenario: seed de demostración en el entorno de producción del hosting
  it("el seed de demostración no siembra en producción ni con permiso", () => {
    const motivo = motivoParaNoSembrar({
      VERCEL_ENV: "production",
      DATABASE_URL: LOCAL,
      [VARIABLE_PERMISO_SEED_DEMO]: "1",
    });
    expect(motivo).toContain("producción");
  });

  // Scenario: seed de demostración apuntando a la base de Supabase
  it("contra una base remota sin permiso, el seed dice qué falta", () => {
    const motivo = motivoParaNoSembrar({ DATABASE_URL: REMOTA });
    expect(motivo).toContain("DATABASE_URL");
    expect(motivo).toContain(`${VARIABLE_PERMISO_SEED_DEMO}=1`);
  });

  // Scenario: seed de demostración contra la base local
  it("contra la base local de desarrollo, el seed puede sembrar", () => {
    expect(motivoParaNoSembrar({ NODE_ENV: "development", DATABASE_URL: LOCAL })).toBeNull();
  });

  it("el relleno del buscador sí abre la puerta de producción, con permiso explícito", () => {
    expect(
      motivoParaNoRellenar({ NODE_ENV: "production", DATABASE_URL: REMOTA }),
    ).toContain(VARIABLE_PERMISO_BACKFILL);
    expect(
      motivoParaNoRellenar({
        NODE_ENV: "production",
        DATABASE_URL: REMOTA,
        [VARIABLE_PERMISO_BACKFILL]: "1",
      }),
    ).toBeNull();
    expect(motivoParaNoRellenar({ DATABASE_URL: LOCAL })).toBeNull();
  });
});

// ── 2. Sin dirección de base, en producción, se dice ────────────────────────

describe("despliegue · sin DATABASE_URL en producción no se cae a ninguna base local", () => {
  // Scenario: desarrollo sin configurar nada
  it("fuera de producción, sin variable, usa la base local por defecto", () => {
    expect(urlBaseDeDatos({})).toBe(URL_BASE_LOCAL_POR_DEFECTO);
    expect(urlBaseDeDatos({ NODE_ENV: "development" })).toBe(URL_BASE_LOCAL_POR_DEFECTO);
  });

  // Scenario: producción sin dirección de base de datos
  it.each([["NODE_ENV"], ["VERCEL_ENV"]])(
    "en producción por %s, sin variable, no hay base a la que conectarse",
    (variable) => {
      expect(urlBaseDeDatos({ [variable]: "production" })).toBeNull();
    },
  );

  it("con la variable puesta se usa, en producción y fuera", () => {
    expect(urlBaseDeDatos({ DATABASE_URL: REMOTA, NODE_ENV: "production" })).toBe(REMOTA);
    expect(urlBaseDeDatos({ DATABASE_URL: LOCAL })).toBe(LOCAL);
    // Una variable de puros espacios es como no tenerla.
    expect(urlBaseDeDatos({ DATABASE_URL: "   ", NODE_ENV: "production" })).toBeNull();
  });

  it("el aviso nombra la variable que falta y dice que no hay respaldo local", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    avisarSinBaseDeDatosUnaVez({ NODE_ENV: "production" });

    expect(errores).toHaveBeenCalledTimes(1);
    expect(MENSAJE_SIN_BASE_DATOS).toContain(VARIABLE_BASE_DATOS);
    expect(MENSAJE_SIN_BASE_DATOS.toLowerCase()).toContain("no se cae a ninguna base local");
  });

  // Scenario: el aviso no se repite por petición
  it("el aviso sale una sola vez por proceso, no una vez por petición", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 50; i += 1) avisarSinBaseDeDatosUnaVez({ NODE_ENV: "production" });
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("con la variable puesta no avisa nada", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    avisarSinBaseDeDatosUnaVez({ NODE_ENV: "production", DATABASE_URL: REMOTA });
    expect(errores).not.toHaveBeenCalled();
  });
});

// ── 3. Sin SITIO_URL en producción, también se dice ─────────────────────────

describe("despliegue · sin SITIO_URL en producción el sitio lo dice al arrancar", () => {
  // Scenario: producción sin `SITIO_URL`
  it("en producción no inventa localhost y deja constancia una sola vez", () => {
    expect(urlSitio({ NODE_ENV: "production" })).toBeNull();

    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 20; i += 1) avisarSinUrlSitioUnaVez({ NODE_ENV: "production" });

    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain(VARIABLE_URL_SITIO);
  });

  it("el aviso se dispara al ARRANCAR el servidor, no en cada petición", () => {
    // `src/app/layout.tsx` lo llama en el tronco del módulo: se ejecuta una
    // vez, al cargar la aplicación. Si alguien lo mueve dentro del componente,
    // volvería a ser por petición y este test lo dice.
    const layout = readFileSync(
      new URL("../src/app/layout.tsx", import.meta.url),
      "utf8",
    );
    const cuerpo = layout.slice(0, layout.search(/export\s+default\s+function/));
    expect(cuerpo).toContain("avisarSinUrlSitioUnaVez()");
  });

  it("fuera de producción sigue funcionando con localhost", () => {
    expect(urlSitio({})).toBe("http://localhost:3000");
  });
});

// ── 4. TLS obligatorio hacia fuera (hallazgo A2 de la etapa C) ──────────────

describe("despliegue · una conexión que sale de esta máquina va cifrada o no va", () => {
  it("el host que se comprueba es el EFECTIVO, no el que se lee en la URL", () => {
    // Hallazgo A1: `?host=` manda sobre el `hostname` de la URL, y el driver
    // le hace caso.
    expect(interpretarConexion("postgresql://a:b@localhost:5432/x?host=db.supabase.co").host).toBe(
      "db.supabase.co",
    );
    expect(esBaseLocal("postgresql://a:b@localhost:5432/x?host=db.supabase.co")).toBe(false);
    expect(esBaseLocal("postgresql://a:b@db.inexistente.invalid:5432/x?host=localhost")).toBe(
      true,
    );
  });

  it("una cadena con `hostaddr` no se interpreta: se trata como remota y sin cifrar", () => {
    // `pg` no implementa `hostaddr` y libpq sí: la misma cadena significaría
    // cosas distintas según quién la lea. Ante la duda, la respuesta cara.
    const conAddr = "postgresql://a@localhost:5432/x?hostaddr=203.0.113.9&sslmode=require";
    expect(esBaseLocal(conAddr)).toBe(false);
    expect(motivoDeConexionInsegura(conAddr)).not.toBeNull();
  });

  it.each([
    ["Supabase sin sslmode", "postgresql://u:c@db.abc.supabase.co:5432/postgres"],
    [
      "el pooler sin sslmode",
      "postgresql://u:c@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    ],
    ["sslmode=disable a un host remoto", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=disable"],
    ["local de mentira con ?host= remoto", "postgresql://u:c@localhost:5432/x?host=db.abc.supabase.co"],
    ["una dirección ilegible", "no-es-una-url"],
  ])("rechaza %s", (_caso, url) => {
    const motivo = motivoDeConexionInsegura(url);
    expect(motivo, url).not.toBeNull();
    expect(motivo).toContain("SIN CIFRAR");
    expect(motivo).toContain("sslmode=require");
  });

  it.each([
    ["la base local por defecto", URL_BASE_LOCAL_POR_DEFECTO],
    ["localhost sin TLS (los bytes no salen del equipo)", LOCAL],
    ["127.0.0.1 sin TLS", "postgresql://postgres@127.0.0.1:5432/enmirumbo"],
    ["IPv6 local sin TLS", "postgresql://postgres@[::1]:5432/enmirumbo"],
    ["Supabase con sslmode=require", REMOTA],
    ["Supabase con verify-full", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=verify-full"],
    ["Supabase con no-verify", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=no-verify"],
  ])("acepta %s", (_caso, url) => {
    expect(motivoDeConexionInsegura(url), url).toBeNull();
  });

  it("en producción, una base remota en claro impide abrir la base y lo dice", () => {
    const motivo = motivoParaNoAbrirLaBase({
      NODE_ENV: "production",
      DATABASE_URL: REMOTA_EN_CLARO,
    });
    expect(motivo).toContain("SIN CIFRAR");
    expect(motivo).toContain("db.abcdefg.supabase.co");
    // Y no filtra la contraseña de la base en el mensaje.
    expect(motivo).not.toContain("clave");
    expect(motivo).not.toContain("usuario");
  });

  it("el aviso sale al arrancar, una sola vez, como error", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 20; i += 1) {
      avisarSinBaseDeDatosUnaVez({ NODE_ENV: "production", DATABASE_URL: REMOTA_EN_CLARO });
    }
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("con TLS pedido, ni motivo ni aviso", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      motivoParaNoAbrirLaBase({ NODE_ENV: "production", DATABASE_URL: REMOTA }),
    ).toBeNull();
    avisarSinBaseDeDatosUnaVez({ NODE_ENV: "production", DATABASE_URL: REMOTA });
    expect(errores).not.toHaveBeenCalled();
  });

  it("los literales de docs/despliegue.md piden TLS", () => {
    // El documento es lo que copia y pega quien despliega: si ahí falta el
    // parámetro, el arreglo del código sólo sirve para que el deploy falle.
    const documento = readFileSync(
      new URL("../docs/despliegue.md", import.meta.url),
      "utf8",
    );
    const conexiones = [...documento.matchAll(/postgresql:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
    expect(conexiones.length).toBeGreaterThan(2);
    for (const url of conexiones) {
      // La local y el socket Unix no necesitan TLS: los bytes no salen de la
      // máquina. Todo lo demás sí, y el propio código lo exige.
      if (esBaseLocal(url) || interpretarConexion(url).esSocketUnix) continue;
      expect(url, `sin sslmode en el documento: ${url}`).toMatch(/sslmode=/);
      expect(
        motivoDeConexionInsegura(url),
        `el documento propone un sslmode que no cifra: ${url}`,
      ).toBeNull();
    }
  });
});

// ── 5. Sin secreto de tareas, la purga no corre y hay que decirlo ───────────

describe("despliegue · sin CRON_SECRET en producción las tareas no corren", () => {
  beforeEach(() => reiniciarAvisoDeSecretoDeTareas());

  /**
   * Hallazgo M5 de la etapa C: el delta de `paginas-legales` retira la purga de
   * los 90 días de los pendientes operativos "porque el sistema la ejecuta
   * sin intervención humana", y eso sólo es verdad si el disparo puede llegar.
   */
  it.each([["NODE_ENV"], ["VERCEL_ENV"]])(
    "en producción por %s, sin secreto, lo dice como error",
    (variable) => {
      const errores = vi.spyOn(console, "error").mockImplementation(() => {});
      avisarSinSecretoDeTareasUnaVez({ [variable]: "production" });

      expect(errores).toHaveBeenCalledTimes(1);
      const dicho = String(errores.mock.calls[0][0]);
      expect(dicho).toContain(VARIABLE_SECRETO_TAREAS);
      expect(dicho).toContain("90 días");
      expect(dicho).toContain("aviso de privacidad");
    },
  );

  it("una sola vez por proceso, no una por petición", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 30; i += 1) {
      avisarSinSecretoDeTareasUnaVez({ NODE_ENV: "production" });
    }
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("con el secreto puesto, o fuera de producción, no dice nada", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    avisarSinSecretoDeTareasUnaVez({ NODE_ENV: "production", CRON_SECRET: "un-secreto" });
    avisarSinSecretoDeTareasUnaVez({ NODE_ENV: "development" });
    avisarSinSecretoDeTareasUnaVez({});
    expect(errores).not.toHaveBeenCalled();
  });

  it("los tres avisos de arranque se disparan al cargar la aplicación", () => {
    // Si alguien los mueve dentro del componente, vuelven a ser por petición.
    const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
    const cuerpo = layout.slice(0, layout.search(/export\s+default\s+function/));
    expect(cuerpo).toContain("avisarSinUrlSitioUnaVez()");
    expect(cuerpo).toContain("avisarSinBaseDeDatosUnaVez()");
    expect(cuerpo).toContain("avisarSinSecretoDeTareasUnaVez()");
  });
});

// ── 6. B7 · qué cuenta como "cifrada", con pg v9 a la vista ────────────────

describe("despliegue · sslmode: solo los modos que garantizan cifrado", () => {
  it.each([
    ["prefer", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=prefer"],
    ["allow", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=allow"],
    ["disable", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=disable"],
    ["PREFER en mayúsculas", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=PREFER"],
  ])("hacia fuera, %s NO cuenta como cifrada", (_caso, url) => {
    // `pg` los trata HOY como `verify-full` y avisa de que en su v9 adoptarán
    // la semántica de libpq, donde `prefer` acepta texto claro como respaldo.
    // Aceptarlos ahora sería dejar que una subida de versión reabra A2 sola.
    expect(interpretarConexion(url).cifrada, url).toBe(false);
    const motivo = motivoDeConexionInsegura(url);
    expect(motivo, url).not.toBeNull();
    // Y el mensaje explica que el modo que trae no basta, no que falte.
    expect(motivo).toContain("no garantiza cifrado");
  });

  it.each([
    ["require", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=require"],
    ["verify-full", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=verify-full"],
    ["verify-ca", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=verify-ca"],
    ["no-verify", "postgresql://u:c@db.abc.supabase.co:5432/x?sslmode=no-verify"],
  ])("%s sí cuenta como cifrada", (_caso, url) => {
    expect(interpretarConexion(url).cifrada, url).toBe(true);
    expect(motivoDeConexionInsegura(url), url).toBeNull();
  });
});

// ── 7. B8 · el socket Unix tiene salida, y es la correcta ──────────────────

describe("despliegue · una base por socket Unix no queda sin salida", () => {
  const SOCKET = "postgresql://postgres@localhost:5432/enmirumbo?host=%2Fvar%2Frun%2Fpostgresql";

  it("se reconoce como socket y NO se le exige cifrado", () => {
    // Un socket es un archivo de esta máquina: no hay red que interceptar, y
    // pedirle TLS dejaba al sistema sin arrancar con una instrucción inútil.
    const interpretada = interpretarConexion(SOCKET);
    expect(interpretada.esSocketUnix).toBe(true);
    expect(interpretada.host).toBe("/var/run/postgresql");
    expect(motivoDeConexionInsegura(SOCKET)).toBeNull();
    expect(motivoParaNoAbrirLaBase({ DATABASE_URL: SOCKET })).toBeNull();
  });

  it("pero NO cuenta como base local para los comandos que escriben en masa", () => {
    // Decisión declarada: de una ruta de socket no se sabe a qué servidor
    // lleva (un túnel, un contenedor con producción montada, un pgbouncer
    // delante de Supabase). La salida es el permiso explícito, que es una
    // decisión consciente y no un default silencioso.
    expect(esBaseLocal(SOCKET)).toBe(false);
    expect(motivoParaNoSembrar({ DATABASE_URL: SOCKET })).toContain(
      `${VARIABLE_PERMISO_SEED_DEMO}=1`,
    );
    expect(
      motivoParaNoSembrar({ DATABASE_URL: SOCKET, [VARIABLE_PERMISO_SEED_DEMO]: "1" }),
    ).toBeNull();
  });

  it("el mensaje de conexión insegura ofrece la salida del socket", () => {
    // Sin esto, quien trabaje por socket lee "agrega sslmode=require", lo hace,
    // y sigue sin arrancar. El mensaje tiene que decir qué SÍ funciona.
    const motivo = motivoDeConexionInsegura("postgresql://u:c@db.abc.supabase.co:5432/x");
    expect(motivo).toContain("socket Unix");
    expect(motivo).toContain("?host=");
  });

  it("el documento explica las dos mitades de la decisión", () => {
    const documento = readFileSync(
      new URL("../docs/despliegue.md", import.meta.url),
      "utf8",
    );
    expect(documento).toContain("socket Unix");
    expect(documento).toContain(VARIABLE_PERMISO_SEED_DEMO);
  });
});
