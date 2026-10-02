/**
 * Pruebas adversariales de la etapa C (seguridad) del spike T-021. Datos
 * ficticios. Cubren lo que el camino feliz no: cookies forjadas o deformes,
 * cadenas de conexión que engañan a la guarda de TLS, y entradas hostiles al
 * formulario y a la cookie del aviso.
 */
import { createHmac } from "node:crypto";

import { parse } from "pg-connection-string";
import { describe, expect, it } from "vitest";

import { revisarConexion } from "../src/lib/base";
import { cabecerasPara } from "../src/lib/cabeceras";
import { rutasConCabecerasEstaticas } from "../src/lib/cabeceras-estaticas";
import { avisoDesdeCookie, validarReporte } from "../src/lib/reporte";
import { crearValorDeSesion, esSesionValida, OPCIONES_COOKIE } from "../src/lib/sesion";

const SECRETO = "k".repeat(32);
const AHORA = new Date("2026-10-01T12:00:00Z");
const MAÑANA = AHORA.getTime() + 3600 * 1000;
const CERT = "certs/supabase-root-2021-ca.crt";
const REMOTA = "postgresql://usuario:clave@db.ejemplo.test:5432/postgres";
const existe = () => true;

function firmaCon(secreto: string, caducidad: number): string {
  return createHmac("sha256", secreto).update(`v1.${caducidad}`).digest("base64url");
}

describe("[C-S] sesión: cookies forjadas o deformes", () => {
  it("una cookie forjada con secreto vacío o corto no abre", () => {
    for (const secreto of ["", "x", "k".repeat(31)]) {
      expect(esSesionValida(`${MAÑANA}.${firmaCon(secreto, MAÑANA)}`, SECRETO, AHORA)).toBe(false);
    }
  });

  it("una firma sin el prefijo de versión (v1.) no abre", () => {
    const sinPrefijo = createHmac("sha256", SECRETO).update(String(MAÑANA)).digest("base64url");
    expect(esSesionValida(`${MAÑANA}.${sinPrefijo}`, SECRETO, AHORA)).toBe(false);
  });

  it("caducidades con formas numéricas alternativas no reutilizan una firma", () => {
    const firma = firmaCon(SECRETO, MAÑANA);
    for (const texto of [`0${MAÑANA}`, `+${MAÑANA}`, `${MAÑANA}.0`, `${MAÑANA}e0`, ` ${MAÑANA}`, `-${MAÑANA}`]) {
      expect(esSesionValida(`${texto}.${firma}`, SECRETO, AHORA)).toBe(false);
    }
  });

  it("una firma con el mismo largo en bytes pero multibyte no revienta y no abre", () => {
    const largo = Buffer.byteLength(firmaCon(SECRETO, MAÑANA));
    const multibyte = "ñ".repeat(Math.floor(largo / 2)) + "a".repeat(largo % 2);
    expect(Buffer.byteLength(multibyte)).toBe(largo);
    expect(() => esSesionValida(`${MAÑANA}.${multibyte}`, SECRETO, AHORA)).not.toThrow();
    expect(esSesionValida(`${MAÑANA}.${multibyte}`, SECRETO, AHORA)).toBe(false);
  });

  it("una firma en base64 estándar (con + / =) de la misma firma no abre", () => {
    const estandar = createHmac("sha256", SECRETO).update(`v1.${MAÑANA}`).digest("base64");
    expect(esSesionValida(`${MAÑANA}.${estandar}`, SECRETO, AHORA)).toBe(false);
  });

  it("valores enormes no revientan", () => {
    expect(esSesionValida(`${MAÑANA}.${"A".repeat(100_000)}`, SECRETO, AHORA)).toBe(false);
    expect(esSesionValida(".".repeat(10_000), SECRETO, AHORA)).toBe(false);
  });

  it("una sesión legítima ya vencida no revive aunque la firma sea buena", () => {
    const vieja = crearValorDeSesion(SECRETO, new Date(AHORA.getTime() - 9 * 3600 * 1000));
    expect(esSesionValida(vieja, SECRETO, AHORA)).toBe(false);
  });

  it("la cookie sale HttpOnly, Secure, SameSite=Lax y con caducidad", () => {
    expect(OPCIONES_COOKIE).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(OPCIONES_COOKIE.maxAge).toBeGreaterThan(0);
  });
});

/**
 * Invariante que la guarda promete (spec: "sin caer a una conexión sin
 * verificar"): si `revisarConexion` aprueba una base remota, el driver `pg`
 * —que interpreta la MISMA cadena— debe acabar con TLS que rechaza
 * certificados no verificados. Se pregunta al parser real de `pg`.
 */
function pgVerificaTls(url: string): boolean {
  const { ssl } = parse(url) as { ssl?: unknown };
  return typeof ssl === "object" && ssl !== null && (ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized !== false;
}

/** Aprobada ⇒ o pg se conecta de verdad a esta máquina, o verifica TLS. */
function aprobadaEsSegura(url: string): boolean {
  const host = (parse(url).host ?? "").toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || pgVerificaTls(url);
}

describe("[C-S] base: la guarda de TLS frente a cadenas que la engañan", () => {
  const base = `${REMOTA}?sslmode=verify-full&sslrootcert=${CERT}`;

  it("lo que la guarda aprueba hoy y pg sí verifica", () => {
    for (const url of [base, `${base}&ssl=0`, `${base}&uselibpqcompat=true`, `${REMOTA}?ssl=false&sslmode=verify-full&sslrootcert=${CERT}`]) {
      if (revisarConexion(url, existe).ok) expect(aprobadaEsSegura(url)).toBe(true);
    }
  });

  it("variantes de mayúsculas o modos débiles no se aprueban", () => {
    for (const url of [
      `${REMOTA}?sslmode=VERIFY-FULL&sslrootcert=${CERT}`,
      `${REMOTA}?sslmode=no-verify&sslrootcert=${CERT}`,
      `${REMOTA}?sslmode=verify-ca&sslrootcert=${CERT}`,
      `postgresql://u:c@localhost.ejemplo.test/x?sslmode=disable`,
      `postgresql://u:c@127.0.0.1.nip.ejemplo.test/x?sslmode=disable`,
      `mysql://u:c@db.ejemplo.test/x?sslmode=verify-full&sslrootcert=${CERT}`,
      // pg distingue mayúsculas en los parámetros: `HOST=` no cambia el
      // destino real, que sigue siendo esta máquina.
      `postgresql://u:c@localhost/x?HOST=db.ejemplo.test`,
    ]) {
      const revision = revisarConexion(url, existe);
      if (revision.ok) expect(aprobadaEsSegura(url)).toBe(true);
    }
  });

  // HALLAZGO M1 (c-seguridad.md): la guarda leía el PRIMER `sslmode` y `pg`
  // usa el ÚLTIMO. Corregido: un `sslmode`/`sslrootcert` repetido se rechaza.
  it("M1: un sslmode duplicado (verify-full y luego disable/no-verify) no debe aprobarse", () => {
    for (const debil of ["disable", "no-verify"]) {
      const url = `${base}&sslmode=${debil}`;
      expect(pgVerificaTls(url)).toBe(false); // pg conecta sin verificar
      expect(aprobadaEsSegura(url)).toBe(false);
      expect(revisarConexion(url, existe).ok).toBe(false);
    }
    // Repetido aunque coincida, y también `sslrootcert`: falla a la vista.
    expect(revisarConexion(`${base}&sslmode=verify-full`, existe)).toEqual({ ok: false, motivo: "no-interpretable" });
    expect(revisarConexion(`${base}&sslrootcert=otro.crt`, existe)).toEqual({ ok: false, motivo: "no-interpretable" });
  });
});

describe("[C-S] formulario: entradas hostiles", () => {
  function formulario(pares: Array<[string, string | Blob]>): FormData {
    const datos = new FormData();
    for (const [nombre, valor] of pares) datos.append(nombre, valor);
    return datos;
  }

  it("un motivo con espacios, mayúsculas, bytes nulos o HTML no pasa", () => {
    for (const motivo of [" cerrado", "CERRADO", "cerrado\u0000", "cerrado ", "<b>cerrado</b>", "cerrado​"]) {
      expect(validarReporte(formulario([["motivo", motivo]]))).toEqual({ ok: false, aviso: "motivo" });
    }
  });

  it("un motivo enviado como archivo no pasa", () => {
    const archivo = new Blob(["cerrado"], { type: "text/plain" });
    expect(validarReporte(formulario([["motivo", archivo]]))).toEqual({ ok: false, aviso: "motivo" });
  });

  it("el comentario justo en el límite pasa y uno más no; HTML y RTL no se interpretan aquí", () => {
    expect(validarReporte(formulario([["motivo", "cerrado"], ["comentario", "<script>".padEnd(300, "x")]])).ok).toBe(true);
    expect(validarReporte(formulario([["motivo", "cerrado"], ["comentario", "‮".repeat(301)]]))).toEqual({
      ok: false,
      aviso: "comentario",
    });
  });

  it("la cookie del aviso solo acepta los dos códigos exactos", () => {
    for (const valor of ["Motivo", "motivo ", " motivo", "motivo\u0000", "comentario;path=/", "%6Dotivo", ""]) {
      expect(avisoDesdeCookie(valor)).toBeNull();
    }
  });
});

describe("[C-S] cabeceras: rutas engañosas", () => {
  it("solo la página exacta del formulario relaja a strict-origin; parecidas llevan las de producción", () => {
    const produccion = cabecerasPara("/")["Referrer-Policy"];
    for (const ruta of ["/reportar-x", "/REPORTAR", "/reportar//", "/reportar/gracias", "/x/reportar"]) {
      expect(cabecerasPara(ruta)["Referrer-Policy"]).toBe(produccion);
    }
  });

  it("un archivo de la CDN con metacaracteres de regex se reconoce solo literalmente", () => {
    const rutas = rutasConCabecerasEstaticas([{ handle: "filesystem" }], ["_astro/a+b(c)$.css"]);
    const patron = new RegExp((rutas[0] as { src: string }).src);
    expect(patron.test("/_astro/a+b(c)$.css")).toBe(true);
    expect(patron.test("/_astro/aab(c).css")).toBe(false);
    expect(patron.test("/_astro/a+b(c)$.cssX")).toBe(false);
  });

  it("sin `handle: filesystem` el build truena en vez de publicar sin cabeceras", () => {
    expect(() => rutasConCabecerasEstaticas([], ["estatica/index.html"])).toThrow();
  });
});
