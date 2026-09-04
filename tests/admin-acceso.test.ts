import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { entrarAlPanel } from "../src/app/admin/accion-acceso";
import { salirDelPanel } from "../src/app/admin/accion-salir";
import AccesoAdminPage from "../src/app/admin/page";
import { reiniciarIntentosDeAcceso, INTENTOS_ACCESO_POR_VENTANA } from "../src/lib/admin/acceso";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  reiniciarAvisoDeConfiguracion,
} from "../src/lib/admin/config";
import {
  DURACION_SESION_MS,
  NOMBRE_COOKIE_SESION,
  RUTA_COOKIE_SESION,
  crearValorDeSesion,
  haySesionValida,
} from "../src/lib/admin/sesion";
import {
  ERROR_CONTRASENA_INCORRECTA,
  ERROR_DEMASIADOS_INTENTOS,
  ETIQUETA_CONTRASENA,
  MENSAJE_PANEL_NO_DISPONIBLE,
  MENSAJE_SESION_CERRADA,
} from "../src/lib/admin/textos";
import { VARIABLE_ENCABEZADO_IP } from "../src/lib/registro/limite-ip";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";

// Spec: revision-admin · Requirements "Acceso al panel con contraseña única de
// entorno y sesión firmada", "Sin contraseña configurada el panel no abre
// (fail-safe)" y "Toda pantalla y toda acción del panel exigen sesión válida"
// (tasks.md #8, #9, #10, #11).

const raiz = join(__dirname, "..");
const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const IP = "203.0.113.10"; // TEST-NET-3, reservado para documentación

const normalizado = (html: string) => html.replace(/\s+/g, " ");

function configurarPanel() {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_ENCABEZADO_IP] = "x-forwarded-for";
}

function desconfigurarPanel() {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
}

const envio = (contrasena: string) => {
  const formData = new FormData();
  formData.set("contrasena", contrasena);
  return formData;
};

beforeAll(() => configurarPanel());

afterAll(() => {
  desconfigurarPanel();
  delete process.env[VARIABLE_ENCABEZADO_IP];
});

beforeEach(() => {
  configurarPanel();
  reiniciarPeticion();
  reiniciarIntentosDeAcceso();
  peticion.encabezados["x-forwarded-for"] = IP;
});

afterEach(() => vi.restoreAllMocks());

async function renderAcceso(searchParams: Record<string, string> = {}) {
  const pagina = await AccesoAdminPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(createElement(() => pagina));
}

describe("revision-admin · entrar al panel", () => {
  // Scenario: entrar al panel con la contraseña correcta
  it("con la contraseña correcta crea la cookie de sesión y lleva a la cola", async () => {
    const destino = await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)));
    expect(destino).toBe("/admin/cola");

    expect(peticion.puestas).toHaveLength(1);
    const [cookie] = peticion.puestas;
    expect(cookie.nombre).toBe(NOMBRE_COOKIE_SESION);
    expect(cookie.opciones).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: RUTA_COOKIE_SESION,
      maxAge: DURACION_SESION_MS / 1000,
    });
    // El contenido de la cookie no incluye la contraseña ni el secreto.
    expect(cookie.valor).not.toContain(CONTRASENA);
    expect(cookie.valor).not.toContain(SECRETO);
    // Y sirve de verdad como sesión.
    expect(haySesionValida(cookie.valor)).toBe(true);
  });

  it("marca la cookie como Secure cuando el proxy declara HTTPS", async () => {
    peticion.encabezados["x-forwarded-proto"] = "https";
    await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)));
    expect(peticion.puestas[0].opciones.secure).toBe(true);
  });

  // Scenario: contraseña equivocada
  it("con otra contraseña no crea sesión y vuelve con el error", async () => {
    const destino = await urlDeRedireccion(() => entrarAlPanel(envio("otra-cosa")));
    expect(destino).toBe("/admin?error=incorrecta");
    expect(peticion.puestas).toEqual([]);

    const html = await renderAcceso({ error: "incorrecta" });
    expect(normalizado(html)).toContain(ERROR_CONTRASENA_INCORRECTA);
  });

  it("un envío sin campo de contraseña se trata como contraseña equivocada", async () => {
    const destino = await urlDeRedireccion(() => entrarAlPanel(new FormData()));
    expect(destino).toBe("/admin?error=incorrecta");
    expect(peticion.puestas).toEqual([]);
  });

  // Scenario: intentos repetidos
  it("tras agotar los intentos, ni la contraseña correcta entra", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await urlDeRedireccion(() => entrarAlPanel(envio("otra-cosa")));
    }

    const destino = await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)));
    expect(destino).toBe("/admin?error=intentos");
    expect(peticion.puestas).toEqual([]);

    const html = await renderAcceso({ error: "intentos" });
    expect(normalizado(html)).toContain(ERROR_DEMASIADOS_INTENTOS);
  });

  // Scenario: la contraseña no aparece en el log
  it("ni el acceso exitoso ni el fallido escriben la contraseña o la cookie en el log", async () => {
    const escrito: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        escrito.push(args.map(String).join(" "));
      });
    }

    await urlDeRedireccion(() => entrarAlPanel(envio("intento-fallido-secreto")));
    await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)));

    const todo = escrito.join("\n");
    expect(todo).not.toContain(CONTRASENA);
    expect(todo).not.toContain("intento-fallido-secreto");
    expect(todo).not.toContain(SECRETO);
    for (const cookie of peticion.puestas) {
      expect(todo).not.toContain(cookie.valor);
    }
  });
});

/**
 * Hallazgo MEDIO 3 de la etapa C: la política de identificación es la misma
 * endurecida del formulario público (solo el encabezado declarado, y de él el
 * último salto), pero cuando no hay IP atribuible el límite NO aplica — y eso
 * no puede pasar en silencio, porque lo que queda sin freno es la única
 * credencial del sitio.
 */
describe("revision-admin · el límite de acceso avisa cuando no aplica", () => {
  function espiarAvisos(): string[] {
    const escrito: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      escrito.push(args.map(String).join(" "));
    });
    return escrito;
  }

  it("sin encabezado de IP declarado el aviso sale UNA vez y nombra al panel", async () => {
    delete process.env[VARIABLE_ENCABEZADO_IP];
    const escrito = espiarAvisos();

    for (let i = 0; i < 4; i += 1) {
      await urlDeRedireccion(() => entrarAlPanel(envio("otra-cosa")));
    }

    const avisos = escrito.filter((linea) => linea.includes("INACTIVO"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("[panel]");
    expect(avisos[0]).toContain(VARIABLE_ENCABEZADO_IP);
  });

  it("con el encabezado declarado pero un último salto que no es IP, también avisa", async () => {
    process.env[VARIABLE_ENCABEZADO_IP] = "x-forwarded-for";
    peticion.encabezados["x-forwarded-for"] = "198.51.100.200, no-soy-una-ip";
    const escrito = espiarAvisos();

    await urlDeRedireccion(() => entrarAlPanel(envio("otra-cosa")));

    expect(escrito.filter((linea) => linea.includes("INACTIVO"))).toHaveLength(1);
  });

  it("con IP atribuible no avisa nada y el límite sí cuenta", async () => {
    const escrito = espiarAvisos();

    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await urlDeRedireccion(() => entrarAlPanel(envio("otra-cosa")));
    }

    expect(escrito.filter((linea) => linea.includes("INACTIVO"))).toEqual([]);
    expect(await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)))).toBe(
      "/admin?error=intentos",
    );
  });
});

describe("revision-admin · salir del panel", () => {
  // Scenario: salir del panel
  it("caduca la cookie con los mismos atributos y avisa que cerró sesión", async () => {
    const destino = await urlDeRedireccion(() => salirDelPanel());
    expect(destino).toBe("/admin?salida=1");

    const [cookie] = peticion.puestas;
    expect(cookie.nombre).toBe(NOMBRE_COOKIE_SESION);
    expect(cookie.valor).toBe("");
    expect(cookie.opciones).toMatchObject({ maxAge: 0, path: RUTA_COOKIE_SESION });

    const html = await renderAcceso({ salida: "1" });
    expect(normalizado(html)).toContain(MENSAJE_SESION_CERRADA);
  });
});

describe("revision-admin · fail-safe sin configuración", () => {
  beforeEach(() => desconfigurarPanel());

  // Scenario: sin contraseña configurada
  it.each([
    ["sin contraseña", () => delete process.env[VARIABLE_CONTRASENA]],
    ["sin secreto", () => delete process.env[VARIABLE_SECRETO_SESION]],
  ])("%s, la pantalla lo dice sin decir qué falta y sin campo de contraseña", async (
    _caso,
    quitar,
  ) => {
    configurarPanel();
    quitar();

    const html = await renderAcceso();
    expect(normalizado(html)).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
    expect(html).not.toContain("<input");
    expect(html).not.toContain(ETIQUETA_CONTRASENA);
    // El detalle de qué falta se queda en el log, no viaja en la respuesta.
    expect(html).not.toContain(VARIABLE_CONTRASENA);
    expect(html).not.toContain(VARIABLE_SECRETO_SESION);
  });

  // Scenario: sin secreto de firma
  it("con la contraseña correcta pero sin secreto no se crea ninguna sesión", async () => {
    process.env[VARIABLE_CONTRASENA] = CONTRASENA;

    const destino = await urlDeRedireccion(() => entrarAlPanel(envio(CONTRASENA)));
    expect(destino).toBe("/admin");
    expect(peticion.puestas).toEqual([]);

    const html = await renderAcceso();
    expect(normalizado(html)).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
  });

  it("sin configuración, ni una cookie bien firmada abre el panel", () => {
    const valor = crearValorDeSesion(SECRETO);
    expect(haySesionValida(valor)).toBe(false);
  });

  /**
   * Hallazgo BAJO 3 de la etapa C: la pantalla de acceso es pública, así que
   * un `console.warn` por petición le da a cualquiera —sin autenticarse— una
   * forma de inundar el log de un despliegue mal configurado.
   */
  it("el aviso de 'falta configuración' se escribe una sola vez, no por visita", async () => {
    reiniciarAvisoDeConfiguracion();
    const escrito: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      escrito.push(args.map(String).join(" "));
    });

    for (let i = 0; i < 5; i += 1) await renderAcceso();

    const avisos = escrito.filter((linea) => linea.includes("[panel]"));
    expect(avisos).toHaveLength(1);
    // Y sigue diciendo QUÉ falta: el detalle es para el log, no para la respuesta.
    expect(avisos[0]).toContain(VARIABLE_CONTRASENA);
  });
});

// design.md §3: la disciplina de llamar a la guarda es una propiedad
// verificable del código, no la memoria de quien programa.
describe("revision-admin · toda ruta y toda acción del panel invocan la guarda", () => {
  /**
   * Las dos únicas excepciones, y por qué: la pantalla de acceso ES el
   * destino de la guarda (pedirle sesión sería un bucle) y la acción de salir
   * solo caduca una cookie del propio navegador. El test comprueba además que
   * ninguna de las dos toca la base ni las consultas del panel.
   */
  const EXCEPCIONES = ["src/app/admin/page.tsx", "src/app/admin/accion-acceso.ts", "src/app/admin/accion-salir.ts"];

  /**
   * La ruta que sirve las fotos del panel también exige sesión, pero NO puede
   * redirigir: la spec `revision-admin` pide que sin sesión responda "la misma
   * respuesta de no encontrado que daría el sitio público" (una redirección al
   * acceso sería una respuesta distinta y delataría la ruta). Por eso usa
   * `haySesionAdmin()` en vez de `requerirSesionAdmin()`, y por eso se
   * verifica aparte, abajo.
   */
  const GUARDA_SIN_REDIRECCION = ["src/app/admin/foto/[clave]/[variante]/route.ts"];

  function archivosDe(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) return archivosDe(ruta);
      return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
    });
  }

  const archivos = archivosDe(join(raiz, "src/app/admin")).map((ruta) =>
    ruta.slice(raiz.length + 1),
  );

  it("hay rutas y acciones que vigilar", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(7);
    for (const excepcion of EXCEPCIONES) expect(archivos).toContain(excepcion);
  });

  it("cada archivo del panel llama a requerirSesionAdmin() antes de nada", () => {
    for (const ruta of archivos) {
      if (EXCEPCIONES.includes(ruta) || GUARDA_SIN_REDIRECCION.includes(ruta)) continue;
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      expect(codigo, ruta).toContain("await requerirSesionAdmin();");
    }
  });

  // Spec `revision-admin`, scenario "la foto del registro en revisión no sale
  // del panel" (change `agregar-foto-negocio`).
  it("la ruta de fotos del panel exige sesión, pero responde 404 en vez de redirigir", () => {
    for (const ruta of GUARDA_SIN_REDIRECCION) {
      expect(archivos, "la excepción sigue existiendo").toContain(ruta);
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      const cuerpo = codigo.slice(codigo.lastIndexOf("\nimport "));
      expect(codigo, ruta).toContain("await haySesionAdmin()");
      // Nada de redirigir: eso delataría que la ruta existe. Se mira el
      // cuerpo, no los comentarios de arriba (que sí explican por qué).
      expect(cuerpo, ruta).not.toContain("redirect(");
      expect(cuerpo, ruta).not.toContain("requerirSesionAdmin(");
      // La sesión se resuelve antes de pedir siquiera el cliente de la base.
      expect(cuerpo.indexOf("await haySesionAdmin()")).toBeLessThan(
        cuerpo.indexOf("obtenerPrisma()"),
      );
      // Y quien decide qué se sirve recibe explícitamente si hay sesión.
      expect(codigo, ruta).toContain("conSesionAdmin");
    }
  });

  it("las excepciones no leen ni escriben nada de la base", () => {
    for (const ruta of EXCEPCIONES) {
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      expect(codigo, ruta).not.toContain("obtenerPrisma");
      expect(codigo, ruta).not.toContain("@/lib/admin/consultas");
      expect(codigo, ruta).not.toContain("@/lib/admin/transiciones");
    }
  });
});
