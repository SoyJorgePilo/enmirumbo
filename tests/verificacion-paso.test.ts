import { describe, expect, it } from "vitest";

import {
  COOKIE_PASO,
  DURACION_PASO_MS,
  RUTA_COOKIE_PASO,
  crearPasoInicial,
  firmarPaso,
  leerPaso,
  opcionesCookiePaso,
  ultimosCuatroDigitos,
} from "../src/lib/verificacion/paso";

/**
 * Spec `registro-negocio` (T-016) · Requirement "La pantalla 'Confirma tu
 * número'…", párrafo de la credencial de paso: "el sistema DEBE saber de qué
 * ficha se trata por una credencial de paso que pone y firma el servidor —
 * nunca por un identificador en la URL ni por un campo que mande el cliente—,
 * con caducidad corta" (tasks.md #8; design.md §3).
 *
 * Secretos de mentira: no sirven para nada fuera de este archivo.
 */

const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const OTRO_SECRETO = "otro-secreto-de-pruebas-de-32-caracteres";

/** Números de la serie de pruebas: no son de nadie. */
const NUMERO = "7710000188";
const AHORA = new Date("2026-09-04T12:00:00.000Z");
const enMs = (ms: number) => new Date(AHORA.getTime() + ms);

const pasoDePrueba = () => crearPasoInicial("cln0000negocio0001", NUMERO, AHORA);

describe("registro-negocio · la credencial de paso va firmada", () => {
  it("una cookie recién firmada se lee de vuelta igual", () => {
    const paso = pasoDePrueba();
    const valor = firmarPaso(paso, SECRETO);
    expect(leerPaso(valor, SECRETO, AHORA)).toEqual(paso);
  });

  it("una firma alterada no pasa", () => {
    const valor = firmarPaso(pasoDePrueba(), SECRETO);
    const alterado = `${valor.slice(0, -3)}xyz`;
    expect(leerPaso(alterado, SECRETO, AHORA)).toBeNull();
  });

  it("un contenido alterado con la firma vieja no pasa", () => {
    const original = pasoDePrueba();
    const [, firma] = firmarPaso(original, SECRETO).split(".");

    for (const trampa of [
      { ...original, negocioId: "ficha-ajena-0001" },
      { ...original, ultimosCuatroDigitos: "9999" },
      { ...original, creadaEnMs: AHORA.getTime() + 60_000 },
    ]) {
      const contenidoFalso = Buffer.from(JSON.stringify(trampa), "utf8").toString("base64url");
      expect(leerPaso(`${contenidoFalso}.${firma}`, SECRETO, AHORA), JSON.stringify(trampa)).toBeNull();
    }
  });

  it("una cookie firmada con otro secreto no pasa", () => {
    const valor = firmarPaso(pasoDePrueba(), OTRO_SECRETO);
    expect(leerPaso(valor, SECRETO, AHORA)).toBeNull();
  });

  it("una cookie caducada no pasa (15 minutos)", () => {
    expect(DURACION_PASO_MS).toBe(15 * 60 * 1000);
    const valor = firmarPaso(pasoDePrueba(), SECRETO);
    expect(leerPaso(valor, SECRETO, enMs(DURACION_PASO_MS - 1))).not.toBeNull();
    expect(leerPaso(valor, SECRETO, enMs(DURACION_PASO_MS + 1))).toBeNull();
  });

  it.each([
    ["vacía", ""],
    ["sin punto", "solouncachito"],
    ["con demasiadas partes", "a.b.c"],
    ["con base64 inválido", "%%%%.firma"],
    ["con JSON que no es un objeto", `${Buffer.from('"hola"').toString("base64url")}.firma`],
    ["con campos de otro tipo", `${Buffer.from('{"negocioId":7}').toString("base64url")}.firma`],
  ])("una cookie %s no pasa", (_caso, valor) => {
    expect(leerPaso(valor, SECRETO, AHORA)).toBeNull();
  });

  it("sin cookie no pasa", () => {
    expect(leerPaso(undefined, SECRETO, AHORA)).toBeNull();
    expect(leerPaso(null, SECRETO, AHORA)).toBeNull();
  });

  it("una cookie de otra ficha solo sirve para esa otra ficha", () => {
    const ajena = firmarPaso(crearPasoInicial("otro-negocio-9999", NUMERO, AHORA), SECRETO);
    const paso = leerPaso(ajena, SECRETO, AHORA);
    // Se lee (está bien firmada), pero identifica a la OTRA ficha: quien la
    // presente solo puede gastar intentos de la suya.
    expect(paso?.negocioId).toBe("otro-negocio-9999");
    expect(paso?.negocioId).not.toBe("cln0000negocio0001");
  });
});

describe("registro-negocio · qué guarda y qué NO guarda la credencial", () => {
  it("no lleva el número completo, solo los últimos cuatro dígitos", () => {
    const paso = pasoDePrueba();
    expect(paso.ultimosCuatroDigitos).toBe("0188");
    expect(JSON.stringify(paso)).not.toContain(NUMERO);

    const valor = firmarPaso(paso, SECRETO);
    const claro = Buffer.from(valor.split(".")[0], "base64url").toString("utf8");
    expect(claro).not.toContain(NUMERO);
  });

  it("no lleva ningún código, ni ningún contador: el código nunca vive en casa", () => {
    const valor = firmarPaso(pasoDePrueba(), SECRETO);
    const claro = Buffer.from(valor.split(".")[0], "base64url").toString("utf8");
    // Hallazgo [C-2] cerrado: la credencial de paso dice DE QUÉ FICHA se
    // trata y nada más. Los tres contadores que vivían aquí —intentos,
    // reenvíos y la marca del último envío— se movieron al servidor
    // (`limites.ts`), porque reusar la cookie del principio los rebobinaba.
    expect(Object.keys(JSON.parse(claro))).toEqual([
      "negocioId",
      "ultimosCuatroDigitos",
      "creadaEnMs",
    ]);
  });

  it("`ultimosCuatroDigitos` nunca revela más de cuatro", () => {
    expect(ultimosCuatroDigitos("7711234567")).toBe("4567");
    expect(ultimosCuatroDigitos("77")).toBe("77");
    expect(ultimosCuatroDigitos("")).toBe("");
  });
});

// Hallazgo [C-2]: las cotas por registro YA NO viven en la credencial. Su
// prueba está en `tests/verificacion-limites.test.ts` (contra el almacén
// compartido) y en `tests/verificacion-flujo.test.ts` (de punta a punta).
describe("registro-negocio · la credencial no decide ninguna cota", () => {
  it("no exporta ninguna función de conteo: rebobinarla no consigue nada", async () => {
    const modulo = await import("../src/lib/verificacion/paso");
    for (const desaparecida of ["intentosAgotados", "reenviosAgotados", "dentroDelCooldown"]) {
      expect(modulo, desaparecida).not.toHaveProperty(desaparecida);
    }
  });

  it("dos credenciales de la misma ficha son intercambiables (ya no hay estado)", () => {
    const primera = crearPasoInicial("cln0000negocio0001", NUMERO, AHORA);
    const segunda = crearPasoInicial("cln0000negocio0001", NUMERO, AHORA);
    expect(firmarPaso(primera, SECRETO)).toBe(firmarPaso(segunda, SECRETO));
  });
});

describe("registro-negocio · atributos de la cookie", () => {
  it("es HttpOnly, SameSite=Lax y su Path está acotado a la pantalla", () => {
    const opciones = opcionesCookiePaso(false);
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe("lax");
    expect(opciones.path).toBe(RUTA_COOKIE_PASO);
    expect(RUTA_COOKIE_PASO).toBe("/registro/verificar");
    expect(opciones.maxAge).toBe(DURACION_PASO_MS / 1000);
  });

  it("es Secure cuando el sitio se sirve por HTTPS, y no cuando no", () => {
    expect(opcionesCookiePaso(true).secure).toBe(true);
    expect(opcionesCookiePaso(false).secure).toBe(false);
  });

  it("el nombre de la cookie es neutro: no anuncia qué guarda", () => {
    expect(COOKIE_PASO).toMatch(/^nu_/);
    expect(COOKIE_PASO.toLowerCase()).not.toContain("sms");
    expect(COOKIE_PASO.toLowerCase()).not.toContain("codigo");
  });
});
