import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  CUPO_ACCESO_PANEL,
  INTENTOS_ACCESO_POR_VENTANA,
  VENTANA_INTENTOS_ACCESO_MS,
  accesoBloqueado,
  apartarIntentoDeAcceso,
  contrasenaCorrecta,
  reiniciarIntentosDeAcceso,
  respaldoDeIntentosParaPruebas,
} from "../src/lib/admin/acceso";
import { claveDeCupo } from "../src/lib/cupos/compartido";
import { crearClientePrueba } from "./db";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
} from "../src/lib/admin/config";
import {
  DURACION_SESION_MS,
  NOMBRE_COOKIE_SESION,
  RUTA_COOKIE_SESION,
  crearValorDeSesion,
  haySesionValida,
  opcionesCookieSesion,
} from "../src/lib/admin/sesion";

// Spec: revision-admin · Requirements "Acceso al panel con contraseña única de
// entorno y sesión firmada" y "Sin contraseña configurada el panel no abre".
// design.md §1 (HMAC sin dependencias nuevas) y §4 (antifuerza bruta).

const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const OTRO_SECRETO = "o".repeat(LONGITUD_MINIMA_SECRETO);
const CONTRASENA = "contrasena-solo-de-prueba";

const entorno = (extra: Record<string, string | undefined> = {}) => ({
  [VARIABLE_CONTRASENA]: CONTRASENA,
  [VARIABLE_SECRETO_SESION]: SECRETO,
  ...extra,
});

const AHORA = new Date("2026-09-03T12:00:00.000Z");
const masTarde = (ms: number) => new Date(AHORA.getTime() + ms);

describe("revision-admin · valor de sesión firmado (design.md §1)", () => {
  it("el valor lleva caducidad y firma, y no lleva la contraseña ni datos personales", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    const [caducidad, firma] = valor.split(".");

    expect(valor.split(".")).toHaveLength(2);
    expect(Number(caducidad)).toBe(AHORA.getTime() + DURACION_SESION_MS);
    expect(firma.length).toBeGreaterThan(0);
    expect(valor).not.toContain(CONTRASENA);
    expect(valor).not.toContain(SECRETO);
  });

  it("la sesión dura 8 horas", () => {
    expect(DURACION_SESION_MS).toBe(8 * 60 * 60 * 1000);
  });

  // Scenario: entrar al panel con la contraseña correcta
  it("un valor recién firmado se acepta durante toda la ventana", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    expect(haySesionValida(valor, entorno(), AHORA)).toBe(true);
    expect(haySesionValida(valor, entorno(), masTarde(DURACION_SESION_MS - 1000))).toBe(
      true,
    );
  });

  // Scenario: cookie manipulada o caducada
  const valido = crearValorDeSesion(SECRETO, AHORA);
  const [caducidadValida, firmaValida] = valido.split(".");

  it.each<[string, string | null, Date]>([
    ["nulo (sin cookie)", null, AHORA],
    ["vacío", "", AHORA],
    ["sin punto", "solo-un-valor", AHORA],
    ["con caducidad que no es número", "manana.abc", AHORA],
    ["con la firma vacía", `${caducidadValida}.`, AHORA],
    [
      "con la firma alterada",
      `${caducidadValida}.${firmaValida.slice(0, -1)}${
        firmaValida.endsWith("a") ? "b" : "a"
      }`,
      AHORA,
    ],
    [
      "con la caducidad estirada a mano",
      `${AHORA.getTime() + 10 * DURACION_SESION_MS}.${firmaValida}`,
      AHORA,
    ],
    ["firmado con otro secreto", crearValorDeSesion(OTRO_SECRETO, AHORA), AHORA],
    ["caducado", valido, masTarde(DURACION_SESION_MS + 1)],
    ["con basura de más pegada", `${valido}.extra`, AHORA],
    // Hallazgo BAJO 1 de la etapa C: la caducidad tiene que estar en su forma
    // canónica. Con ceros a la izquierda serían dos cookies para la misma
    // sesión, y una cadena de dígitos larguísima colapsa a `Infinity`, que
    // compara mayor que cualquier fecha (sesión eterna).
    ["con ceros a la izquierda", `000${caducidadValida}.${firmaValida}`, AHORA],
    ["con una caducidad de 400 dígitos", `${"9".repeat(400)}.${firmaValida}`, AHORA],
    [
      "con una caducidad fuera del entero seguro",
      `99999999999999999999.${firmaValida}`,
      AHORA,
    ],
  ])("rechaza un valor %s", (_caso, valor, cuando) => {
    expect(haySesionValida(valor, entorno(), cuando)).toBe(false);
  });

  it("una caducidad no canónica no vale ni firmada con el secreto bueno", () => {
    // Se firma exactamente la cadena no canónica, como haría quien tuviera el
    // secreto: aun así no abre, porque el formato se valida antes de la firma.
    const conCeros = `000${caducidadValida}`;
    const firmada = `${conCeros}.${createHmac("sha256", SECRETO)
      .update(`v1.${conCeros}`)
      .digest("base64url")}`;
    expect(haySesionValida(firmada, entorno(), AHORA)).toBe(false);
  });

  // Scenario: ninguna transición sin configuración
  it("sin panel configurado, ninguna cookie vale — ni una firmada correctamente", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    expect(haySesionValida(valor, { [VARIABLE_CONTRASENA]: CONTRASENA }, AHORA)).toBe(
      false,
    );
    expect(haySesionValida(valor, { [VARIABLE_SECRETO_SESION]: SECRETO }, AHORA)).toBe(
      false,
    );
    expect(haySesionValida(valor, {}, AHORA)).toBe(false);
  });

  it("la firma es un HMAC-SHA256 del secreto sobre la caducidad versionada", () => {
    const valor = crearValorDeSesion(SECRETO, AHORA);
    const [caducidad, firma] = valor.split(".");
    const esperada = createHmac("sha256", SECRETO)
      .update(`v1.${caducidad}`)
      .digest("base64url");
    expect(firma).toBe(esperada);
  });
});

describe("revision-admin · atributos de la cookie de sesión", () => {
  // Scenario: entrar al panel con la contraseña correcta
  it("es HttpOnly, SameSite=Lax, acotada al panel y de 8 horas", () => {
    const opciones = opcionesCookieSesion(false);
    expect(NOMBRE_COOKIE_SESION.length).toBeGreaterThan(0);
    expect(RUTA_COOKIE_SESION).toBe("/admin");
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe("lax");
    expect(opciones.path).toBe(RUTA_COOKIE_SESION);
    expect(opciones.maxAge).toBe(DURACION_SESION_MS / 1000);
  });

  it("lleva Secure cuando el sitio se sirve por HTTPS", () => {
    expect(opcionesCookieSesion(true).secure).toBe(true);
    expect(opcionesCookieSesion(false).secure).toBe(false);
  });
});

describe("revision-admin · comparación de la contraseña en tiempo constante", () => {
  // Scenario: entrar al panel con la contraseña correcta / contraseña equivocada
  it("acepta la contraseña configurada y rechaza cualquier otra", () => {
    expect(contrasenaCorrecta(CONTRASENA, CONTRASENA)).toBe(true);
    expect(contrasenaCorrecta("otra-cosa", CONTRASENA)).toBe(false);
    expect(contrasenaCorrecta("", CONTRASENA)).toBe(false);
    // Un prefijo correcto no vale: se compara todo, no el principio.
    expect(contrasenaCorrecta(CONTRASENA.slice(0, -1), CONTRASENA)).toBe(false);
    expect(contrasenaCorrecta(`${CONTRASENA} `, CONTRASENA)).toBe(false);
  });

  it("no usa comparación directa de cadenas (design.md §1)", async () => {
    const { readFileSync } = await import("node:fs");
    const codigo = readFileSync(
      new URL("../src/lib/admin/acceso.ts", import.meta.url),
      "utf8",
    );
    expect(codigo).toContain("timingSafeEqual");
  });
});

describe("revision-admin · límite de intentos de acceso por IP (design.md §4)", () => {
  const IP = "203.0.113.10"; // TEST-NET-3, reservado para documentación
  const OTRA_IP = "198.51.100.7"; // TEST-NET-2

  // ITERACIÓN 2 del change `preparar-deploy-produccion` (hallazgo A4 de la
  // etapa C): el conteo dejó de vivir en la memoria del proceso y pasó a la
  // base, porque en serverless cada instancia tiene su propio contador y "5
  // intentos por instancia" no es un límite. Por eso estas pruebas ahora son
  // asíncronas y pasan el secreto con el que se deriva la clave (nunca se
  // guarda la IP: se guarda un HMAC).
  const SECRETO = "secreto-de-pruebas-para-derivar-la-clave-del-cupo";

  beforeEach(async () => {
    await reiniciarIntentosDeAcceso();
  });

  // Scenario: intentos repetidos
  it("tras agotar los intentos, hasta la contraseña correcta queda bloqueada", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      expect(await accesoBloqueado(IP, SECRETO, AHORA)).toBe(false);
      expect(await apartarIntentoDeAcceso(IP, SECRETO, AHORA)).toBe(true);
    }
    expect(await accesoBloqueado(IP, SECRETO, AHORA)).toBe(true);
    // Y el siguiente intento ya no encuentra margen.
    expect(await apartarIntentoDeAcceso(IP, SECRETO, AHORA)).toBe(false);
    // El bloqueo es por procedencia: otra IP sigue pudiendo intentar.
    expect(await accesoBloqueado(OTRA_IP, SECRETO, AHORA)).toBe(false);
  });

  it("el bloqueo se suelta al pasar la ventana", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await apartarIntentoDeAcceso(IP, SECRETO, AHORA);
    }
    expect(await accesoBloqueado(IP, SECRETO, masTarde(VENTANA_INTENTOS_ACCESO_MS - 1))).toBe(
      true,
    );
    expect(await accesoBloqueado(IP, SECRETO, masTarde(VENTANA_INTENTOS_ACCESO_MS + 1))).toBe(
      false,
    );
  });

  it("tiene su propia ventana, distinta de la del formulario público", () => {
    expect(VENTANA_INTENTOS_ACCESO_MS).toBeGreaterThan(0);
    expect(INTENTOS_ACCESO_POR_VENTANA).toBeGreaterThanOrEqual(3);
  });

  it("sin IP atribuible no se bloquea a nadie (mismo criterio que T-003)", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA * 3; i += 1) {
      expect(await apartarIntentoDeAcceso(null, SECRETO, AHORA)).toBe(true);
    }
    expect(await accesoBloqueado(null, SECRETO, AHORA)).toBe(false);
  });

  // Lo que este change vino a arreglar: el conteo se comparte entre procesos.
  it("lo apuntado sobrevive a que el proceso olvide su memoria", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await apartarIntentoDeAcceso(IP, SECRETO, AHORA);
    }
    // Una instancia nueva de Vercel arranca con la memoria vacía: eso es lo
    // que simula vaciar SOLO el respaldo en memoria.
    respaldoDeIntentosParaPruebas().reiniciar();
    expect(await accesoBloqueado(IP, SECRETO, AHORA)).toBe(true);
    expect(await apartarIntentoDeAcceso(IP, SECRETO, AHORA)).toBe(false);
  });

  // Y lo que NO se guarda: la IP.
  it("en la base no queda ninguna IP, solo una clave derivada", async () => {
    await apartarIntentoDeAcceso(IP, SECRETO, AHORA);
    const prisma = crearClientePrueba();
    try {
      const filas = await prisma.intentoDeCupo.findMany();
      expect(filas.length).toBeGreaterThan(0);
      for (const fila of filas) {
        expect(fila.clave).not.toContain(IP);
        expect(fila.clave).toMatch(/^[0-9a-f]{32}$/);
      }
      // La clave depende del secreto: rotarlo invalida el histórico entero.
      expect(claveDeCupo(CUPO_ACCESO_PANEL, IP, SECRETO)).not.toBe(
        claveDeCupo(CUPO_ACCESO_PANEL, IP, "otro-secreto-distinto"),
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});
