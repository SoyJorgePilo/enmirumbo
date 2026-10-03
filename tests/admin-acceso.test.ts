import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Sin simular `next/*` (change `migrar-panel-admin-base-astro`, design.md
// §2.3): la lógica vive en `src/lib/admin/entrar.ts`, sin Next, y se prueba
// directo; la pantalla es la de Astro.
import AccesoAdmin from "../src/pages/admin/index.astro";
import { reiniciarIntentosDeAcceso, INTENTOS_ACCESO_POR_VENTANA } from "../src/lib/admin/acceso";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  reiniciarAvisoDeConfiguracion,
} from "../src/lib/admin/config";
import { ejecutarAcceso, ejecutarSalida } from "../src/lib/admin/entrar";
import type { AlmacenCookiesPanel } from "../src/lib/admin/peticion";
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
import { pintarRespuesta } from "./astro-paginas";

// Spec: revision-admin · Requirements "Acceso al panel con contraseña única de
// entorno y sesión firmada", "Sin contraseña configurada el panel no abre
// (fail-safe)" y "Toda pantalla y toda acción del panel exigen sesión válida"
// (tasks.md #8, #9, #10, #11). Desde 5a (change `migrar-panel-admin-base-astro`)
// la lógica se prueba en `ejecutarAcceso`/`ejecutarSalida` y la pantalla es la
// de Astro (`src/pages/admin/index.astro`).

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

/** Un almacén de cookies como el de Next o el de Astro, que anota lo que se pone. */
type Puesta = { nombre: string; valor: string; opciones: Record<string, unknown> };
function almacenFalso(): AlmacenCookiesPanel & { puestas: Puesta[] } {
  const puestas: Puesta[] = [];
  return {
    puestas,
    get: () => undefined,
    set: (nombre, valor, opciones) => void puestas.push({ nombre, valor, opciones: { ...opciones } }),
  };
}

/** Cabeceras de la petición: la IP declarada (y lo que se agregue). */
let encabezados: Headers;

beforeAll(() => configurarPanel());

afterAll(() => {
  desconfigurarPanel();
  delete process.env[VARIABLE_ENCABEZADO_IP];
});

beforeEach(async () => {
  configurarPanel();
  await reiniciarIntentosDeAcceso();
  encabezados = new Headers({ "x-forwarded-for": IP });
});

afterEach(() => vi.restoreAllMocks());

/** La pantalla de acceso de Astro, con esos parámetros (y la cookie, si se da). */
async function renderAcceso(parametros: Record<string, string> = {}, cookie?: string) {
  const consulta = new URLSearchParams(parametros).toString();
  const { html } = await pintarRespuesta(AccesoAdmin, { ruta: `/admin${consulta ? `?${consulta}` : ""}`, cabeceras: cookie ? { cookie } : {} });
  return html;
}

describe("revision-admin · entrar al panel", () => {
  // Scenario: entrar al panel con la contraseña correcta
  it("con la contraseña correcta crea la cookie de sesión y lleva a la cola", async () => {
    const almacen = almacenFalso();
    expect(await ejecutarAcceso(envio(CONTRASENA), encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin/cola" });

    expect(almacen.puestas).toHaveLength(1);
    const [cookie] = almacen.puestas;
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
    encabezados.set("x-forwarded-proto", "https");
    const almacen = almacenFalso();
    await ejecutarAcceso(envio(CONTRASENA), encabezados, almacen);
    expect(almacen.puestas[0].opciones.secure).toBe(true);
  });

  // Scenario: contraseña equivocada
  it("con otra contraseña no crea sesión y vuelve con el error", async () => {
    const almacen = almacenFalso();
    expect(await ejecutarAcceso(envio("otra-cosa"), encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin?error=incorrecta" });
    expect(almacen.puestas).toEqual([]);

    const html = await renderAcceso({ error: "incorrecta" });
    expect(normalizado(html)).toContain(ERROR_CONTRASENA_INCORRECTA);
  });

  it("un envío sin campo de contraseña se trata como contraseña equivocada", async () => {
    const almacen = almacenFalso();
    expect(await ejecutarAcceso(new FormData(), encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin?error=incorrecta" });
    expect(almacen.puestas).toEqual([]);
  });

  // Scenario: intentos repetidos
  it("tras agotar los intentos, ni la contraseña correcta entra", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await ejecutarAcceso(envio("otra-cosa"), encabezados, almacenFalso());
    }

    const almacen = almacenFalso();
    expect(await ejecutarAcceso(envio(CONTRASENA), encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin?error=intentos" });
    expect(almacen.puestas).toEqual([]);

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

    const almacen = almacenFalso();
    await ejecutarAcceso(envio("intento-fallido-secreto"), encabezados, almacen);
    await ejecutarAcceso(envio(CONTRASENA), encabezados, almacen);

    const todo = escrito.join("\n");
    expect(todo).not.toContain(CONTRASENA);
    expect(todo).not.toContain("intento-fallido-secreto");
    expect(todo).not.toContain(SECRETO);
    expect(todo).not.toContain(IP);
    for (const cookie of almacen.puestas) {
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
      await ejecutarAcceso(envio("otra-cosa"), encabezados, almacenFalso());
    }

    const avisos = escrito.filter((linea) => linea.includes("INACTIVO"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("[panel]");
    expect(avisos[0]).toContain(VARIABLE_ENCABEZADO_IP);
  });

  it("con el encabezado declarado pero un último salto que no es IP, también avisa", async () => {
    process.env[VARIABLE_ENCABEZADO_IP] = "x-forwarded-for";
    encabezados.set("x-forwarded-for", "198.51.100.200, no-soy-una-ip");
    const escrito = espiarAvisos();

    await ejecutarAcceso(envio("otra-cosa"), encabezados, almacenFalso());

    expect(escrito.filter((linea) => linea.includes("INACTIVO"))).toHaveLength(1);
  });

  it("con IP atribuible no avisa nada y el límite sí cuenta", async () => {
    const escrito = espiarAvisos();

    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await ejecutarAcceso(envio("otra-cosa"), encabezados, almacenFalso());
    }

    expect(escrito.filter((linea) => linea.includes("INACTIVO"))).toEqual([]);
    expect(await ejecutarAcceso(envio(CONTRASENA), encabezados, almacenFalso())).toEqual({ tipo: "redirigir", ruta: "/admin?error=intentos" });
  });

  it("la IP es el ÚLTIMO valor del encabezado: rotar el primero no da más intentos", async () => {
    for (let i = 0; i < INTENTOS_ACCESO_POR_VENTANA; i += 1) {
      await ejecutarAcceso(envio("otra-cosa"), new Headers({ "x-forwarded-for": `198.51.100.${i}, ${IP}` }), almacenFalso());
    }
    expect(await ejecutarAcceso(envio(CONTRASENA), new Headers({ "x-forwarded-for": `198.51.100.99, ${IP}` }), almacenFalso())).toEqual({
      tipo: "redirigir",
      ruta: "/admin?error=intentos",
    });
  });
});

describe("revision-admin · salir del panel", () => {
  // Scenario: salir del panel
  it("caduca la cookie con los mismos atributos y avisa que cerró sesión", async () => {
    const almacen = almacenFalso();
    expect(ejecutarSalida(encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin?salida=1" });

    const [cookie] = almacen.puestas;
    expect(cookie.nombre).toBe(NOMBRE_COOKIE_SESION);
    expect(cookie.valor).toBe("");
    expect(cookie.opciones).toMatchObject({ maxAge: 0, path: RUTA_COOKIE_SESION, httpOnly: true, sameSite: "lax" });

    const html = await renderAcceso({ salida: "1" });
    expect(normalizado(html)).toContain(MENSAJE_SESION_CERRADA);
  });
});

// Los envoltorios de Next (`src/app/admin/accion-*.ts`) ya no se importan
// (spec, "misma dureza": ninguna prueba importa las piezas de 5a de Next); su
// tipo lo revisa `npm run typecheck` y su cuerpo, esta lectura.
describe("revision-admin · los envoltorios de Next delegan sin cambiar nada", () => {
  it("los envoltorios no tienen lógica propia: solo traducen el destino", () => {
    const acceso = readFileSync(join(raiz, "src/app/admin/accion-acceso.ts"), "utf8");
    const salir = readFileSync(join(raiz, "src/app/admin/accion-salir.ts"), "utf8");
    expect(acceso).toMatch(/redirect\(\(await ejecutarAcceso\(formData, await headers\(\), await cookies\(\)\)\)\.ruta\)/);
    expect(salir).toMatch(/redirect\(ejecutarSalida\(await headers\(\), await cookies\(\)\)\.ruta\)/);
    for (const codigo of [acceso, salir]) {
      for (const prohibido of ["apartarIntentoDeAcceso", "contrasenaCorrecta", "crearValorDeSesion", "console."]) {
        expect(codigo).not.toContain(prohibido);
      }
    }
  });
});

describe("revision-admin · fail-safe sin configuración", () => {
  beforeEach(() => desconfigurarPanel());

  // Scenario: sin contraseña configurada
  it.each([
    ["sin contraseña", () => delete process.env[VARIABLE_CONTRASENA]],
    ["sin secreto", () => delete process.env[VARIABLE_SECRETO_SESION]],
    ["con un secreto de 31", () => (process.env[VARIABLE_SECRETO_SESION] = "k".repeat(LONGITUD_MINIMA_SECRETO - 1))],
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

    const almacen = almacenFalso();
    expect(await ejecutarAcceso(envio(CONTRASENA), encabezados, almacen)).toEqual({ tipo: "redirigir", ruta: "/admin" });
    expect(almacen.puestas).toEqual([]);

    const html = await renderAcceso();
    expect(normalizado(html)).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
  });

  it("sin configuración, ni una cookie bien firmada abre el panel", async () => {
    const valor = crearValorDeSesion(SECRETO);
    expect(haySesionValida(valor)).toBe(false);
    // Tampoco en la pantalla: no redirige a la cola, pinta "no disponible".
    const html = await renderAcceso({}, `${NOMBRE_COOKIE_SESION}=${valor}`);
    expect(normalizado(html)).toContain(MENSAJE_PANEL_NO_DISPONIBLE);
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

  it("entrar sin configuración deja el motivo en el log, sin la contraseña, y no aparta intento", async () => {
    const escrito: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      escrito.push(args.map(String).join(" "));
    });
    await ejecutarAcceso(envio(CONTRASENA), encabezados, almacenFalso());
    expect(escrito).toEqual([expect.stringContaining("[panel] acceso imposible, falta configurar:")]);
    expect(escrito.join("\n")).not.toContain(CONTRASENA);
  });
});

describe("revision-admin · la pantalla de acceso con sesión", () => {
  it("con una sesión vigente redirige (307) a la cola, como Next", async () => {
    const { status, html } = await pintarRespuesta(AccesoAdmin, {
      ruta: "/admin",
      cabeceras: { cookie: `${NOMBRE_COOKIE_SESION}=${crearValorDeSesion(SECRETO)}` },
    });
    expect(status).toBe(307);
    expect(html).not.toContain("<input");
  });
});

// design.md §3: la disciplina de llamar a la guarda es una propiedad
// verificable del código, no la memoria de quien programa.
describe("revision-admin · toda ruta y toda acción del panel invocan la guarda", () => {
  function archivosDe(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) return archivosDe(ruta);
      return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
    });
  }

  /**
   * Lo que sigue en Next (detalle, ediciones, fotos, borrado: Fases 5b–5d).
   * Lo que ya sirve Astro —la carpeta de `src/app/admin/` que tiene su página
   * en `src/pages/admin/`, y los archivos sueltos de la raíz, que reemplaza
   * `src/pages/admin/index.astro`— lo vigila la disciplina de Astro de abajo
   * (design.md §1.5, punto 4).
   */
  const enAstro = (carpeta: string) => existsSync(join(raiz, "src/pages/admin", `${carpeta}.astro`));
  const carpetasDeNext = readdirSync(join(raiz, "src/app/admin"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !enAstro(e.name))
    .map((e) => e.name);
  const archivos = carpetasDeNext
    .flatMap((carpeta) => archivosDe(join(raiz, "src/app/admin", carpeta)))
    .map((ruta) => ruta.slice(raiz.length + 1));

  /**
   * La ruta que sirve las fotos del panel también exige sesión, pero NO puede
   * redirigir: la spec `revision-admin` pide que sin sesión responda "la misma
   * respuesta de no encontrado que daría el sitio público" (una redirección al
   * acceso sería una respuesta distinta y delataría la ruta). Por eso usa
   * `haySesionAdmin()` en vez de `requerirSesionAdmin()`, y por eso se
   * verifica aparte, abajo.
   */
  const GUARDA_SIN_REDIRECCION = ["src/app/admin/foto/[clave]/[variante]/route.ts"];

  it("hay rutas y acciones que vigilar, en Next y en Astro", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(7);
    expect(carpetasDeNext).toEqual(expect.arrayContaining(["registros", "ediciones", "foto"]));
    // Lo que ya sirve Astro no se vigila dos veces.
    for (const carpeta of ["cola", "negocios", "[...resto]"]) expect(carpetasDeNext).not.toContain(carpeta);
  });

  it("cada archivo del panel que sigue en Next llama a requerirSesionAdmin() antes de nada", () => {
    for (const ruta of archivos) {
      if (GUARDA_SIN_REDIRECCION.includes(ruta)) continue;
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

  /**
   * Astro (design.md §1.5, punto 4): cada página de `src/pages/admin/` llama
   * a `exigirSesionAdmin(Astro)` antes del primer acceso a datos. Las únicas
   * excepciones —el acceso (es la puerta), el comodín (no hay nada que
   * proteger) y el pegamento de entrar y salir (solo tocan la cookie)— no
   * tocan la base.
   */
  const PAGINAS_ASTRO = readdirSync(join(raiz, "src/pages/admin"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(raiz.length + 1));
  const EXCEPCIONES_ASTRO = ["src/pages/admin/index.astro", "src/pages/admin/[...resto].astro", "src/astro/panel/acceso.ts"];
  const ACCESOS_A_DATOS = ["obtenerPrisma", "prisma.", "@/lib/admin/consultas", "@/lib/admin/transiciones", "@/lib/admin/reportes"];

  it("cada página de Astro del panel llama a exigirSesionAdmin antes del primer acceso a datos y no confía en locals", () => {
    expect(PAGINAS_ASTRO.length).toBeGreaterThanOrEqual(4);
    for (const ruta of PAGINAS_ASTRO) {
      if (EXCEPCIONES_ASTRO.includes(ruta)) continue;
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      const guarda = codigo.indexOf("exigirSesionAdmin(Astro)");
      expect(guarda, ruta).toBeGreaterThan(-1);
      for (const dato of ["obtenerPrisma(", "await "]) {
        const primero = codigo.indexOf(dato, codigo.indexOf("export const prerender"));
        if (primero !== -1) expect(guarda, `${ruta}: ${dato}`).toBeLessThan(primero);
      }
      expect(codigo, ruta).not.toMatch(/locals\.sesion/);
    }
  });

  it("las excepciones no leen ni escriben nada de la base", () => {
    for (const ruta of EXCEPCIONES_ASTRO) {
      expect(existsSync(join(raiz, ruta)), ruta).toBe(true);
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      for (const dato of ACCESOS_A_DATOS) expect(codigo, `${ruta}: ${dato}`).not.toContain(dato);
    }
  });
});
