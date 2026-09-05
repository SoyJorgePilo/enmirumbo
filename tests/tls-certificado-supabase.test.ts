import { X509Certificate } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { parse } from "pg-connection-string";
import { describe, expect, it } from "vitest";

import { motivoDeConexionInsegura } from "../src/lib/base-datos/conexion";

/**
 * La raíz de certificación de Supabase, y que de verdad viaje al servidor.
 *
 * Producción (Vercel + Supabase) estuvo con `sslmode=no-verify` —cifra pero no
 * valida la cadena— porque Supabase firma su PostgreSQL con una CA propia que
 * no está en el almacén de confianza de Node: bajo `require`, `pg` corta con
 * "self-signed certificate in certificate chain". El arreglo definitivo es
 * llevar esa raíz en el repositorio y pedir `verify-full` contra ella.
 *
 * Eso deja DOS cosas frágiles que ninguna otra prueba mira, y que son las que
 * se atan aquí:
 *
 * 1. **El archivo.** Es un certificado PÚBLICO de CA, no un secreto; pero a un
 *    archivo suelto en `certs/` cualquiera lo borra por "limpieza" y el sitio
 *    se cae en producción, no en el CI.
 * 2. **Que llegue al bundle serverless.** `sslrootcert=` es una ruta que `pg`
 *    abre con `fs` EN TIEMPO DE EJECUCIÓN: el rastreo de archivos de Next
 *    —que sigue `import`, `require` y usos estáticos de `fs`— no puede verla.
 *    Sin incluirla a mano en `next.config.ts`, el archivo existe en el repo,
 *    el build pasa, y la función desplegada revienta al primer `SELECT`.
 */

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/**
 * El MISMO comparador de globs que usa Next al aplicar el rastreo, sacado de su
 * propio paquete (`node_modules/next/dist/build/collect-build-traces.js` lo
 * carga de ahí). Se usa el suyo y no otra copia para que la prueba no opine
 * sobre lo que Next hará: lo ejecute.
 *
 * Va por `createRequire` porque el picomatch empaquetado de Next no trae tipos
 * y un `import` directo obligaría a un `any`.
 */
type Picomatch = (
  patron: string,
  opciones?: { dot?: boolean; contains?: boolean },
) => (valor: string) => boolean;
const requerir = createRequire(import.meta.url);
const picomatch = requerir("next/dist/compiled/picomatch") as Picomatch;

/**
 * La ruta es RELATIVA a propósito: `pg` la resuelve contra el directorio de
 * trabajo del proceso, y en Vercel ese directorio es la raíz del paquete de la
 * función, que es donde el rastreo de archivos deja lo que se le pide incluir.
 * Una ruta absoluta de esta laptop no significaría nada allá.
 */
const RUTA_DEL_CERTIFICADO = "certs/supabase-root-2021-ca.crt";

/** Lo que tiene que decir el certificado para ser el que creemos que es. */
const NOMBRE_COMUN = "Supabase Root 2021 CA";

// ── 1. El archivo está, y es lo que dice ser ────────────────────────────────

describe("TLS · la raíz de Supabase vive en el repositorio", () => {
  const pem = (() => {
    try {
      return readFileSync(path.join(raiz, RUTA_DEL_CERTIFICADO), "utf8");
    } catch {
      return null;
    }
  })();

  it("el archivo existe donde la cadena de conexión lo busca", () => {
    expect(
      pem,
      `falta ${RUTA_DEL_CERTIFICADO}. Sin él, producción no abre la base: ` +
        "`pg` lee esa ruta al interpretar DATABASE_URL y falla con ENOENT " +
        "(ver docs/despliegue.md §3.4).",
    ).not.toBeNull();
  });

  it("es un PEM de certificado, no otra cosa con ese nombre", () => {
    expect(pem!.trimStart()).toMatch(/^-----BEGIN CERTIFICATE-----/);
    expect(pem!.trimEnd()).toMatch(/-----END CERTIFICATE-----$/);
    // Una sola raíz: si mañana son dos, que sea una decisión y no un pegote.
    expect(pem!.match(/-----BEGIN CERTIFICATE-----/g)).toHaveLength(1);
  });

  it("es la raíz autofirmada de Supabase y sirve para firmar", () => {
    const certificado = new X509Certificate(pem!);
    expect(certificado.subject).toContain(`CN=${NOMBRE_COMUN}`);
    // Autofirmada: quien la emite es ella misma. Eso es lo que la hace raíz.
    expect(certificado.issuer).toBe(certificado.subject);
    expect(certificado.verify(certificado.publicKey)).toBe(true);
    // `ca` es la restricción básica que autoriza a firmar otros certificados.
    expect(certificado.ca).toBe(true);
  });

  it("todavía no caduca", () => {
    // No es una prueba del reloj: es el aviso de que hay que renovarla ANTES
    // de que producción se quede sin poder validar a Supabase.
    const certificado = new X509Certificate(pem!);
    expect(new Date(certificado.validTo).getTime()).toBeGreaterThan(Date.now());
  });

  it("no trae ninguna llave privada pegada", () => {
    // Repo público: un `PRIVATE KEY` aquí sería un secreto publicado.
    expect(pem!).not.toContain("PRIVATE KEY");
  });
});

// ── 2. La cadena de producción funciona con ese archivo ─────────────────────

describe("TLS · la cadena de conexión de producción se interpreta bien", () => {
  /**
   * La forma EXACTA que se configura en Vercel (docs/despliegue.md §3.1). Las
   * credenciales son de mentira; lo que se prueba es la parte de TLS.
   */
  const cadenaDeProduccion =
    "postgresql://postgres.ejemplo:CLAVE@aws-0-us-east-1.pooler.supabase.com:6543/postgres" +
    `?sslmode=verify-full&sslrootcert=${RUTA_DEL_CERTIFICADO}`;

  it("`pg` lee el certificado desde la ruta relativa y arma el TLS", () => {
    // Si el archivo no estuviera, esto lanzaría ENOENT. Ese es justo el fallo
    // que se vería en producción, y aquí se ve en el CI.
    const configuracion = parse(cadenaDeProduccion);
    expect(configuracion.host).toBe("aws-0-us-east-1.pooler.supabase.com");
    expect(typeof configuracion.ssl).toBe("object");
    expect(String((configuracion.ssl as { ca?: string }).ca)).toContain(
      "BEGIN CERTIFICATE",
    );
    // `verify-full` valida cadena Y nombre del host: no se relaja nada.
    expect((configuracion.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(
      false,
    );
  });

  it("la guarda de conexión insegura la da por buena", () => {
    expect(motivoDeConexionInsegura(cadenaDeProduccion)).toBeNull();
  });

  it("y sigue rechazando lo que no cifra de verdad", () => {
    // Guardián del guardián: sin esto, un `motivoDeConexionInsegura` roto
    // dejaría el test de arriba en verde sin comprobar nada.
    expect(
      motivoDeConexionInsegura(
        "postgresql://u:c@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=prefer",
      ),
    ).toContain("SIN CIFRAR");
  });
});

// ── 3. El certificado viaja en el paquete de la función ─────────────────────

/**
 * Las rutas de la aplicación, en la forma en que Next las nombra al aplicar
 * `outputFileTracingIncludes` (los grupos `(publico)` no aparecen en la URL).
 */
function rutasDeLaApp(): string[] {
  const encontradas = new Set<string>();
  const recorrer = (directorio: string, ruta: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completo = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        // Un grupo de rutas —`(publico)`— organiza carpetas, no URLs.
        const segmento = /^\(.*\)$/.test(entrada.name) ? ruta : `${ruta}/${entrada.name}`;
        recorrer(completo, segmento);
      } else if (/^(page|route|sitemap|robots)\.(ts|tsx)$/.test(entrada.name)) {
        encontradas.add(ruta === "" ? "/" : ruta);
      }
    }
  };
  recorrer(path.join(raiz, "src/app"), "");
  return [...encontradas];
}

describe("TLS · el certificado llega al servidor desplegado", () => {
  it("next.config incluye la carpeta de certificados en el rastreo", async () => {
    const { default: configuracion } = (await import("../next.config")) as {
      default: { outputFileTracingIncludes?: Record<string, string[]> };
    };
    const incluidos = configuracion.outputFileTracingIncludes;
    expect(
      incluidos,
      "sin `outputFileTracingIncludes`, el certificado se queda en el repo y " +
        "la función desplegada no lo encuentra",
    ).toBeDefined();

    // Alguna de las reglas tiene que alcanzar al archivo de verdad. Los
    // patrones se resuelven desde la raíz del proyecto.
    const patrones = Object.values(incluidos!).flat();
    const alcanzaElCertificado = patrones.some((patron) =>
      picomatch(patron, { dot: true })(RUTA_DEL_CERTIFICADO),
    );
    expect(
      alcanzaElCertificado,
      `ninguno de estos patrones alcanza ${RUTA_DEL_CERTIFICADO}: ${patrones.join(", ")}`,
    ).toBe(true);
  });

  it("lo incluye para TODAS las rutas del servidor, no para unas cuantas", async () => {
    const { default: configuracion } = (await import("../next.config")) as {
      default: { outputFileTracingIncludes?: Record<string, string[]> };
    };
    const incluidos = configuracion.outputFileTracingIncludes!;

    // Next compara la clave con la ruta usando picomatch con `contains: true`
    // (`node_modules/next/dist/build/collect-build-traces.js`). Se replica tal
    // cual: un `/*` de manual parece global y deja fuera la portada.
    const claves = Object.keys(incluidos).filter((clave) =>
      incluidos[clave].some((patron) => picomatch(patron, { dot: true })(RUTA_DEL_CERTIFICADO)),
    );
    const cubre = (ruta: string) =>
      claves.some((clave) => picomatch(clave, { dot: true, contains: true })(ruta));

    const rutas = rutasDeLaApp();
    // Guardián del guardián: si el barrido no encontrara rutas, esto pasaría
    // en verde sin mirar nada.
    expect(rutas.length).toBeGreaterThan(5);
    expect(rutas, "la portada").toContain("/");

    const sinCubrir = rutas.filter((ruta) => !cubre(ruta));
    expect(
      sinCubrir,
      `estas rutas se desplegarían sin el certificado:\n  ${sinCubrir.join("\n  ")}`,
    ).toEqual([]);
  });

  it("el runbook documenta la cadena con verify-full y su ruta", () => {
    const documento = readFileSync(path.join(raiz, "docs/despliegue.md"), "utf8");
    expect(documento).toContain("sslmode=verify-full");
    expect(documento).toContain(RUTA_DEL_CERTIFICADO);
    // Y deja escrito que el puente temporal ya no se usa.
    expect(documento).toContain("no-verify");
  });
});
