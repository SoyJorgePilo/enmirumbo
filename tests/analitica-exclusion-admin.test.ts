import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Las pantallas del panel solo se pintan con sesión: `cookies()` y `headers()`
// no existen fuera de un request. Se simulan igual que en
// `tests/admin-paginas.test.ts`.
vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import LayoutPublico from "../src/app/(publico)/layout";
import LayoutPanel, { metadata as metadataPanel } from "../src/app/admin/layout";
import ColaAdminPage, { metadata as metadataCola } from "../src/app/admin/cola/page";
import NegociosAdminPage, {
  metadata as metadataNegocios,
} from "../src/app/admin/negocios/page";
import AccesoAdminPage, { metadata as metadataAcceso } from "../src/app/admin/page";
import DetalleRegistroAdminPage, {
  metadata as metadataDetalle,
} from "../src/app/admin/registros/[id]/page";
import RegistroAprobadoPage, {
  metadata as metadataAprobado,
} from "../src/app/admin/registros/[id]/aprobado/page";
import RegistroRechazadoPage, {
  metadata as metadataRechazado,
} from "../src/app/admin/registros/[id]/rechazado/page";
import { metadata as metadataYaResuelto } from "../src/app/admin/registros/[id]/ya-resuelto/page";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: layout-base · requirement "El panel del admin queda fuera de la
// medición" (tasks.md #8). La exclusión es estructural: el script lo inyecta
// el layout del grupo `(publico)`, y `/admin` vive fuera de ese grupo.

const raiz = join(__dirname, "..");
const SRC = "https://cloud.umami.is/script.js";
const ID_SITIO = "00000000-0000-4000-8000-000000000000";
const SECRETO_PANEL = "s".repeat(LONGITUD_MINIMA_SECRETO);

const htmlAdmin: Record<string, string> = {};
let htmlLayoutPublico = "";

async function render(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(createElement(() => resuelta));
}

beforeAll(async () => {
  // La medición SÍ está configurada: es la única forma de comprobar que el
  // panel queda fuera aunque las variables estén puestas.
  process.env[VARIABLE_SRC] = SRC;
  process.env[VARIABLE_WEBSITE_ID] = ID_SITIO;
  process.env[VARIABLE_CONTRASENA] = "contrasena-de-prueba-nada-real";
  process.env[VARIABLE_SECRETO_SESION] = SECRETO_PANEL;
  process.env[VARIABLE_URL_SITIO] = "https://enmirumbo.example";

  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
  const [enRevision] = await prisma.negocio.findMany({
    where: { estado: "en_revision" },
    select: { id: true },
  });
  const [publicado] = await prisma.negocio.findMany({
    where: { estado: "publicado" },
    select: { id: true },
  });
  const [rechazado] = await prisma.negocio.findMany({
    where: { estado: "rechazado" },
    select: { id: true },
  });
  await prisma.$disconnect();

  htmlLayoutPublico = renderToStaticMarkup(
    createElement(LayoutPublico, {
      children: createElement("p", null, "contenido público"),
    } as never),
  );

  reiniciarPeticion();
  htmlAdmin.acceso = await render(
    AccesoAdminPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
  );

  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO_PANEL);
  htmlAdmin.cola = await render(ColaAdminPage());
  // El listado "Todos los negocios" (change `agregar-listado-gestion-panel`)
  // es una pantalla más del panel: tampoco puede colar medición.
  htmlAdmin.negocios = await render(
    NegociosAdminPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    } as never),
  );
  htmlAdmin.detalle = await render(
    DetalleRegistroAdminPage({
      params: Promise.resolve({ id: enRevision.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlAdmin.aprobado = await render(
    RegistroAprobadoPage({
      params: Promise.resolve({ id: publicado.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  htmlAdmin.rechazado = await render(
    RegistroRechazadoPage({
      params: Promise.resolve({ id: rechazado.id }),
      searchParams: Promise.resolve({}),
    }),
  );
});

afterAll(async () => {
  delete process.env[VARIABLE_SRC];
  delete process.env[VARIABLE_WEBSITE_ID];
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("layout-base · el tronco público es el que mide (tasks #8)", () => {
  it("el layout del grupo público pinta el script y deja pasar el contenido", () => {
    expect(htmlLayoutPublico).toContain("contenido público");
    expect(htmlLayoutPublico).toContain(`src="${SRC}"`);
    expect([...htmlLayoutPublico.matchAll(/<script\b/g)]).toHaveLength(1);
  });

  it("no repinta el documento: nada de html, body, header ni footer", () => {
    expect(htmlLayoutPublico).not.toMatch(/<html|<body|<header|<footer|<main/);
  });
});

describe("layout-base · el panel del admin queda fuera de la medición (tasks #8)", () => {
  // Scenario: el panel no carga el script
  it.each(["acceso", "cola", "negocios", "detalle", "aprobado", "rechazado"])(
    "la pantalla %s del panel no trae script ni atributos de medición",
    (pantalla) => {
      const html = htmlAdmin[pantalla];
      expect(html.length).toBeGreaterThan(0);
      // Ninguna etiqueta `<script src>`: es la que carga a un tercero. (Las
      // pantallas con Server Actions traen un script EN LÍNEA de React para
      // reproducir el envío del formulario; lo pone React al renderizar fuera
      // del runtime de Next y no sale del sitio.)
      expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
      expect(html).not.toContain("umami");
      expect(html).not.toContain("data-website-id");
      expect(html).not.toMatch(/data-umami-event/);
    },
  );

  // Scenario: una página pública nueva sí queda medida (exclusión estructural)
  it("ninguna página del panel vive dentro del grupo (publico)", () => {
    const paginasDelGrupo = paginasBajo(join(raiz, "src/app/(publico)"));
    expect(paginasDelGrupo.length).toBeGreaterThanOrEqual(7);
    for (const pagina of paginasDelGrupo) {
      expect(pagina, pagina).not.toContain("/admin");
    }
    // Sube con cada pantalla nueva del panel: 7 desde el listado "Todos los
    // negocios" (change `agregar-listado-gestion-panel`, tasks.md #11).
    expect(paginasBajo(join(raiz, "src/app/admin")).length).toBeGreaterThanOrEqual(7);
  });

  it("el script se renderiza desde un único archivo, y es el layout del grupo", () => {
    // Se mira el CÓDIGO, no el texto del archivo: desde el change
    // `agregar-enlace-de-gestion` hay otro layout —el del modo edición— que
    // EXPLICA en su comentario por qué no monta el tracker, y confundir la
    // explicación con el defecto convertiría este guardián en un castigo por
    // documentar. Lo que se afirma sigue siendo lo mismo: un solo archivo lo
    // renderiza.
    const sinComentarios = (codigo: string) =>
      codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const conElScript = archivosDe(join(raiz, "src")).filter((ruta) =>
      /<ScriptAnalitica\s*\/>/.test(sinComentarios(readFileSync(ruta, "utf8"))),
    );
    // Uno por marco mientras conviven (ADR-013): el layout del grupo en Next
    // y el tronco público en Astro (change `migrar-lectura-publica-astro`).
    expect(conElScript.sort()).toEqual(
      [join(raiz, "src/app/(publico)/layout.tsx"), join(raiz, "src/layouts/TroncoPublico.astro")].sort(),
    );
  });

  it("el layout raíz —que también envuelve al panel— no sabe nada de la medición", () => {
    const layoutRaiz = readFileSync(join(raiz, "src/app/layout.tsx"), "utf8");
    expect(layoutRaiz).not.toContain("ScriptAnalitica");
    expect(layoutRaiz).not.toContain("analitica");
    // Su equivalente en Astro (change `migrar-lectura-publica-astro`).
    const documentoBase = readFileSync(join(raiz, "src/layouts/DocumentoBase.astro"), "utf8");
    expect(documentoBase).not.toContain("ScriptAnalitica");
    expect(documentoBase).not.toContain("analitica");
  });

  // El panel SÍ tiene layout propio desde el hallazgo A-1 (corta el
  // referente). Lo que importa es que ese layout no cuele medición.
  it("el layout del panel no renderiza el script ni ningún atributo de evento", () => {
    const layoutPanel = readFileSync(join(raiz, "src/app/admin/layout.tsx"), "utf8");
    expect(layoutPanel).not.toContain("ScriptAnalitica");
    expect(layoutPanel).not.toContain("umami");
    expect(renderToStaticMarkup(
      createElement(LayoutPanel, {
        children: createElement("p", null, "pantalla del panel"),
      } as never),
    )).toBe("<p>pantalla del panel</p>");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// A-1 (etapa C): el otro canal por el que las URLs del panel llegaban a un
// tercero. El script no se carga en /admin, pero el admin navega del panel a
// una página pública (logo del encabezado, enlaces del pie, "abrir en pestaña
// nueva") y ahí el tracker manda `document.referrer`; para referentes del
// mismo origen, lo manda como RUTA. La política de referente del layout del
// panel emite `<meta name="referrer" content="…">` en el `<head>` de todas
// sus pantallas y corta el canal por construcción.
//
// A-2 (re-auditoría): el VALOR no es intercambiable. Lo que hay que anclar es
// la invariante, no la cadena — la política del panel tiene que ocultar la
// RUTA y conservar el `Origin` de los envíos de formulario:
//
// - `no-referrer` oculta la ruta, pero hace que un POST de navegación mande
//   `Origin: null` y Next aborta esa Server Action → el panel respondía 500
//   SIN JavaScript, contra su requirement aprobado "el panel funciona sin
//   JavaScript" (`revision-admin`).
// - `same-origin` conserva el `Origin` pero manda la ruta completa entre
//   páginas del mismo origen, que es justo nuestra fuga: no sirve.
// - `origin` y `strict-origin` cumplen las dos condiciones. `strict-origin`
//   es el elegido (además no manda referente al bajar de https a http).
// ───────────────────────────────────────────────────────────────────────────

/** Pantallas del panel con la metadata que exporta cada una. */
const PANTALLAS_DEL_PANEL = {
  acceso: metadataAcceso,
  cola: metadataCola,
  negocios: metadataNegocios,
  detalle: metadataDetalle,
  aprobado: metadataAprobado,
  rechazado: metadataRechazado,
  "ya-resuelto": metadataYaResuelto,
} as const;

/**
 * La etiqueta que Next emite en el `<head>` de una pantalla del panel, según
 * su regla de herencia: un campo que la página no define lo hereda del layout
 * (`node_modules/next/dist/docs/.../generate-metadata.md`). Verificado sobre
 * el HTML servido de las seis pantallas (con sesión firmada) al implementar.
 */
function metaReferrerServida(metadataPagina: { referrer?: unknown }): string {
  const politica = metadataPagina.referrer ?? metadataPanel.referrer;
  return `<meta name="referrer" content="${String(politica)}">`;
}

/**
 * Las ÚNICAS políticas que cumplen las dos condiciones a la vez: ocultan la
 * ruta en el referente (cierran A-1) y conservan el `Origin` de un POST de
 * navegación, para que las Server Actions del panel sigan funcionando sin
 * JavaScript (A-2).
 */
const POLITICAS_ACEPTABLES = ["strict-origin", "origin"];

/** Políticas que reabren uno de los dos agujeros; ninguna puede aparecer. */
const POLITICAS_PROHIBIDAS = [
  "no-referrer", // rompe las Server Actions sin JS (Origin: null) — A-2
  "same-origin", // deja pasar la ruta completa entre páginas propias — A-1
  "unsafe-url",
  "no-referrer-when-downgrade",
];

describe("layout-base · el panel no filtra sus URLs por el referente (A-1/A-2)", () => {
  it("el layout del panel declara una política que oculta la ruta y conserva el Origin", () => {
    expect(POLITICAS_ACEPTABLES).toContain(metadataPanel.referrer);
    expect(POLITICAS_PROHIBIDAS).not.toContain(metadataPanel.referrer);
  });

  it.each(Object.keys(PANTALLAS_DEL_PANEL))(
    "el HTML de la pantalla %s del panel lleva esa meta",
    (pantalla) => {
      const metadataPagina = PANTALLAS_DEL_PANEL[
        pantalla as keyof typeof PANTALLAS_DEL_PANEL
      ] as { referrer?: unknown };
      expect(metaReferrerServida(metadataPagina)).toBe(
        `<meta name="referrer" content="${metadataPanel.referrer}">`,
      );
      // Ninguna pantalla puede cambiar la política por su cuenta: o no la
      // define (y hereda la del layout), o define una de las aceptables.
      expect([undefined, ...POLITICAS_ACEPTABLES]).toContain(metadataPagina.referrer);
    },
  );

  it("las páginas del panel no cambian la política en su código", () => {
    for (const ruta of archivosDe(join(raiz, "src/app/admin"))) {
      const codigo = readFileSync(ruta, "utf8");
      const declaraciones = [...codigo.matchAll(/referrer:\s*"([^"]*)"/g)].map((m) => m[1]);
      if (declaraciones.length === 0) continue;
      expect(ruta.endsWith("layout.tsx"), `${ruta} declara una política`).toBe(true);
      for (const politica of declaraciones) {
        expect(POLITICAS_ACEPTABLES, `${ruta} usa "${politica}"`).toContain(politica);
      }
    }
  });

  /**
   * MISMA INVARIANTE, OTRA SUPERFICIE: el modo edición del enlace de gestión
   * (T-014). Ahí la ruta no "apunta a" un dato personal, **es la credencial**
   * con la que se edita una ficha, así que filtrarla por el referente sería
   * peor que en el panel. Y tiene el mismo formulario con Server Action que
   * debe funcionar sin JavaScript (requirement aprobado de `registro-negocio`,
   * "la edición funciona sin JavaScript").
   *
   * La implementación traía `no-referrer` en cada página, que es la letra de
   * design.md §4 pero reabre exactamente el A-2: medido con `curl` contra el
   * sitio servido, el envío sin JS respondía **500 con `Origin: null`** y
   * **303 con el `Origin` correcto**. Se movió a `strict-origin` en el layout
   * del grupo, que es la decisión que este repo ya había ratificado para el
   * panel, y el envío sin JS volvió a guardar la edición.
   */
  // Fase 4 (change `migrar-enlace-gestion-astro`, design.md §1.2): el modo
  // edición ya se sirve con Astro. La política vive en su tronco
  // (`src/layouts/TroncoGestion.astro`), no en cada pantalla.
  const TRONCO_GESTION = join(raiz, "src/layouts/TroncoGestion.astro");
  const politicaDelTronco = () => [...readFileSync(TRONCO_GESTION, "utf8").matchAll(/referrer:\s*"([^"]*)"/g)].map((m) => m[1]);

  it("el tronco del modo edición declara la misma política que el panel", () => {
    expect(politicaDelTronco()).toHaveLength(1);
    expect(POLITICAS_ACEPTABLES).toContain(politicaDelTronco()[0]);
    expect(POLITICAS_PROHIBIDAS).not.toContain(politicaDelTronco()[0]);
  });

  it("las páginas del modo edición no cambian la política por su cuenta", () => {
    const paginas = archivosDe(join(raiz, "src/pages/editar"));
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    for (const ruta of [...paginas, TRONCO_GESTION]) {
      const codigo = readFileSync(ruta, "utf8");
      const declaraciones = [...codigo.matchAll(/referrer:\s*"([^"]*)"/g)].map((m) => m[1]);
      if (declaraciones.length === 0) continue;
      expect(ruta, `${ruta} declara una política`).toBe(TRONCO_GESTION);
      for (const politica of declaraciones) {
        expect(POLITICAS_ACEPTABLES, `${ruta} usa "${politica}"`).toContain(politica);
      }
    }
  });

  it("el modo edición deja escrito por qué el valor no es intercambiable", () => {
    // Igual que en el panel: sin el motivo al lado, el siguiente que pase
    // "endurece" a `no-referrer` y vuelve a romper el envío sin JavaScript.
    const tronco = readFileSync(TRONCO_GESTION, "utf8");
    expect(tronco).toContain("Origin: null");
    expect(tronco).toContain("Server Action");
    expect(tronco).toContain("sin JavaScript");
  });

  it("el panel deja escrito por qué el valor no es intercambiable", () => {
    // Sin el motivo al lado, el siguiente que pase "endurece" a `no-referrer`
    // y vuelve a romper el panel sin JavaScript.
    const layoutPanel = readFileSync(join(raiz, "src/app/admin/layout.tsx"), "utf8");
    expect(layoutPanel).toContain("Origin: null");
    expect(layoutPanel).toContain("Server Action");
    expect(layoutPanel).toContain("sin JavaScript");
  });

  // O-1: una URL inexistente bajo /admin también lleva un identificador de
  // registro (`/admin/registros/<id>/loquesea`). Antes respondía 404 sin
  // pasar por el layout del panel, así que salía sin política.
  it("las URLs inexistentes del panel también quedan bajo la política", () => {
    const comodin = join(raiz, "src/app/admin/[...resto]/page.tsx");
    expect(existsSync(comodin), "falta la ruta comodín del panel").toBe(true);
    const codigo = readFileSync(comodin, "utf8");
    // Responde 404 de verdad (no una pantalla 200 disfrazada)…
    expect(codigo).toContain("notFound()");
    // …y no enseña, lee ni escribe nada.
    expect(codigo).not.toContain("obtenerPrisma");
    expect(codigo).not.toContain("@/lib/admin/consultas");
    expect(codigo).not.toContain("return"); // no pinta ninguna pantalla
  });

  it("la ruta comodín del panel no puede pisar una pantalla real", () => {
    // En Next el segmento estático le gana al comodín, pero si alguien
    // moviera el comodín hacia arriba se comería el sitio entero.
    const comodines = archivosDe(join(raiz, "src/app"))
      .filter((ruta) => ruta.includes("[..."))
      .map((ruta) => ruta.slice(raiz.length));
    expect(comodines).toEqual(["/src/app/admin/[...resto]/page.tsx"]);
  });

  it("la política es del panel, no del sitio: lo público no la hereda", () => {
    const layoutPublico = readFileSync(join(raiz, "src/app/(publico)/layout.tsx"), "utf8");
    const layoutRaiz = readFileSync(join(raiz, "src/app/layout.tsx"), "utf8");
    expect(layoutPublico).not.toContain("referrer");
    expect(layoutRaiz).not.toContain("referrer");
    for (const layout of ["src/layouts/TroncoPublico.astro", "src/layouts/DocumentoBase.astro"]) {
      expect(readFileSync(join(raiz, layout), "utf8"), layout).not.toContain("referrer");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// M-1 (etapa C): la 404 no se mide. Lo que SÍ es invariante nuestra —y esto
// lo vigila— es dónde vive la frontera; lo que NO es nuestro está anotado en
// el canario de versiones de abajo.
// ───────────────────────────────────────────────────────────────────────────

describe("layout-base · la 404 queda fuera del tronco medido", () => {
  it("la página 404 vive fuera del grupo (publico)", () => {
    expect(existsSync(join(raiz, "src/app/not-found.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/(publico)/not-found.tsx"))).toBe(false);
  });

  it("nadie mete un not-found dentro del grupo (mediría las 404)", () => {
    // Un `not-found.tsx` DENTRO de `(publico)` movería la frontera del error:
    // el layout medido envolvería a la 404 y el proveedor recibiría las URLs
    // que responden 404, incluidas las de fichas NO publicadas
    // (`/negocio/<slug-con-el-nombre>-<id>` de un registro en revisión,
    // rechazado o borrado). La duda #1 de la aprobación autorizó las URLs de
    // fichas PÚBLICAS, no las de las que no lo son.
    const notFounds = archivosDe(join(raiz, "src/app"))
      .filter((ruta) => ruta.endsWith("not-found.tsx"))
      .map((ruta) => ruta.slice(raiz.length));
    expect(notFounds).toEqual(["/src/app/not-found.tsx"]);
  });

  it("canario de versiones: el DOM hidratado de una 404 se midió con estas", () => {
    // Medido a mano con Chrome contra `next start` (etapa C y iteración 2):
    // en una URL que primero encaja con `/[categoria]` o `/negocio/[ficha]` y
    // luego llama a `notFound()`, el HTML servido no trae ninguna etiqueta
    // `<script>` del proveedor, pero React inserta el nodo al hidratar y NO
    // lo ejecuta: cero peticiones al proveedor, cero eventos.
    //
    // Eso último NO es una propiedad de nuestro código: es cómo React trata
    // un `<script src>` que aparece al hidratar. Si alguien sube React o
    // Next, hay que volver a medirlo (el procedimiento está en
    // `reports/b-dev.md`, iteración 2) y actualizar estas versiones. Si
    // pasara a ejecutarse, las 404 empezarían a medirse solas.
    const paquete = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
    // Re-medido el 2026-10-01 con next@16.3.8 (parche de seguridad GHSA-vcvr-r3jv-pc5j):
    // DOM hidratado de la 404 CON la etiqueta del proveedor, cero peticiones; la
    // portada (control) sí pide `/script.js` y `POST /api/send`.
    expect(paquete.dependencies.next, "vuelve a medir la 404 (M-1)").toBe("16.3.8");
    expect(paquete.dependencies["react-dom"], "vuelve a medir la 404 (M-1)").toBe("19.2.8");
  });
});

/** Rutas de `page.tsx` bajo una carpeta, relativas a la raíz del repo. */
function paginasBajo(dir: string): string[] {
  return archivosDe(dir)
    .filter((ruta) => ruta.endsWith("page.tsx"))
    .map((ruta) => ruta.slice(raiz.length));
}

function archivosDe(dir: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "generated") continue;
      rutas.push(...archivosDe(ruta));
    } else if (/\.(tsx?|astro)$/.test(entrada.name)) {
      // `.astro` desde el change `migrar-lectura-publica-astro`: las páginas
      // y los layouts de Astro entran a los mismos guardianes.
      rutas.push(ruta);
    }
  }
  return rutas;
}

// ───────────────────────────────────────────────────────────────────────────
// Astro (change `migrar-lectura-publica-astro`, design.md §1; spec
// `plataforma-astro`, requirement "Las páginas públicas se arman con un
// documento base y un tronco medido…", scenario "una exclusión sin motivo
// reprueba"). La exclusión sigue siendo estructural: toda página de
// `src/pages/` usa `TroncoPublico`, y la que use `DocumentoBase` directo queda
// fuera de la medición SOLO si lo dice por escrito arriba del archivo.
// ───────────────────────────────────────────────────────────────────────────

/** Comentario obligatorio de una página que usa el documento base sin el tronco. */
const MOTIVO_DE_EXCLUSION = /^\s*\/\/\s*fuera de la medición:\s*\S.{10,}$/m;

/**
 * Exclusiones que existen hoy, con su porqué. Si una deja de tener página, la
 * lista deja de ser una excepción viva y hay que revisarla.
 */
const EXCLUSIONES_DE_ASTRO: Array<[string, string]> = [
  ["src/pages/404.astro", "la 404 de las URLs que no casan con ninguna ruta (spec layout-base)"],
  ["src/pages/500.astro", "la página de error del servidor, que sale también con la base caída (hallazgo M1 de T-023)"],
  // Change `migrar-formularios-publicos-astro` (3a, design.md §1): el 403 de
  // un envío de otro origen (y "como dirección inexistente"). Es la respuesta
  // a un envío, no una visita.
  ["src/pages/envio-rechazado.astro", "la respuesta a un envío rechazado por origen (T-024)"],
  // Change `migrar-directorio-publico-astro` (2b, design.md §1): la 404 de
  // `/[destino]` y `/negocio/[ficha]`. Las URLs de fichas no publicadas llevan
  // el nombre del negocio; hoy tampoco se miden.
  ["src/astro/componentes/NoEncontradoDinamico.astro", "la 404 de las rutas dinámicas (alternativa B, M-1)"],
  // Change `migrar-enlace-gestion-astro` (Fase 4, design.md §2): el tronco de
  // las pantallas del enlace de gestión. La ruta ES la credencial de la ficha
  // y el tracker manda el `pathname` (hallazgo ALTO 1 de T-014).
  ["src/layouts/TroncoGestion.astro", "el tronco del enlace de gestión: la ruta lleva el token (T-014, ALTO 1)"],
];

/** Carpeta de las pantallas del enlace de gestión: las ÚNICAS que pueden usar `TroncoGestion`. */
const CARPETA_DE_GESTION = join(raiz, "src/pages/editar");

/** ¿Es una pantalla del enlace que usa el tronco de gestión (con el motivo escrito en el tronco)? */
function usaTroncoDeGestion(ruta: string, fuente: string): boolean {
  return ruta.startsWith(`${CARPETA_DE_GESTION}/`) && /<TroncoGestion\b/.test(fuente);
}

/**
 * Componentes `.astro` de `rutaAstro` que pintan un DOCUMENTO (usan
 * `DocumentoBase` o abren `<html>`) sin el tronco y sin decir por qué (2b:
 * la 404 dinámica vive en `src/astro/componentes/`, no en `src/pages/`). Un
 * fragmento como `NoEncontrado.astro` no es una respuesta y no entra.
 */
export function componentesAstroSinMotivo(rutaAstro: string): string[] {
  return archivosDe(rutaAstro)
    .filter((ruta) => ruta.endsWith(".astro"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      if (!/<DocumentoBase\b|<html\b/.test(fuente)) return false;
      if (/<TroncoPublico\b/.test(fuente)) return false;
      const frontmatter = fuente.split("---")[1] ?? "";
      return !(/<DocumentoBase\b/.test(fuente) && MOTIVO_DE_EXCLUSION.test(frontmatter));
    })
    .map((ruta) => ruta.slice(raiz.length + 1));
}

/** Troncos de `src/layouts/` que pintan el documento sin el tronco medido (Fase 4: `TroncoGestion`). */
function troncosFueraDeLaMedicion(): string[] {
  return archivosDe(join(raiz, "src/layouts"))
    .filter((ruta) => ruta.endsWith(".astro"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      // `TroncoPublico` también envuelve al documento, pero pinta la medición.
      return /<DocumentoBase\b/.test(fuente) && !/<ScriptAnalitica\b/.test(fuente);
    });
}

/** Componentes `.astro` de `src/astro/` que pintan un documento fuera del tronco. */
function documentosDeSrcAstro(): string[] {
  return archivosDe(join(raiz, "src/astro"))
    .filter((ruta) => ruta.endsWith(".astro"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      return /<DocumentoBase\b|<html\b/.test(fuente) && !/<TroncoPublico\b/.test(fuente);
    });
}

/** Páginas `.astro` de `rutaPages` que no usan el tronco y no dicen por qué. */
export function paginasAstroSinMotivo(rutaPages: string): string[] {
  return archivosDe(rutaPages)
    .filter((ruta) => ruta.endsWith(".astro"))
    .filter((ruta) => {
      const fuente = readFileSync(ruta, "utf8");
      const frontmatter = fuente.split("---")[1] ?? "";
      if (/<TroncoPublico\b/.test(fuente)) return false;
      // Fase 4: una pantalla del enlace con el tronco de gestión (el motivo vive en el tronco).
      if (usaTroncoDeGestion(ruta, fuente)) return false;
      return !(/<DocumentoBase\b/.test(fuente) && MOTIVO_DE_EXCLUSION.test(frontmatter));
    })
    .map((ruta) => ruta.slice(raiz.length + 1));
}

describe("plataforma-astro · la medición sigue siendo una propiedad de la estructura", () => {
  const paginas = archivosDe(join(raiz, "src/pages")).filter((ruta) => ruta.endsWith(".astro"));

  it("toda página .astro usa el tronco público o dice por escrito por qué queda fuera", () => {
    expect(paginas.length).toBeGreaterThanOrEqual(4);
    expect(paginasAstroSinMotivo(join(raiz, "src/pages"))).toEqual([]);
  });

  it("las páginas fuera del tronco son exactamente las exclusiones declaradas, y existen", () => {
    const fuera = [
      ...paginas.filter((ruta) => {
        const fuente = readFileSync(ruta, "utf8");
        return !/<TroncoPublico\b/.test(fuente) && !usaTroncoDeGestion(ruta, fuente);
      }),
      ...documentosDeSrcAstro(),
      ...troncosFueraDeLaMedicion(),
    ].map((ruta) => ruta.slice(raiz.length + 1));
    expect(fuera).toEqual(EXCLUSIONES_DE_ASTRO.map(([ruta]) => ruta));
    for (const [ruta, porque] of EXCLUSIONES_DE_ASTRO) {
      expect(existsSync(join(raiz, ruta)), `${ruta} ya no existe (${porque})`).toBe(true);
      const fuente = readFileSync(join(raiz, ruta), "utf8");
      expect(fuente, ruta).toMatch(MOTIVO_DE_EXCLUSION);
      expect(fuente, ruta).not.toContain("ScriptAnalitica");
    }
  });

  // 3b-1 (change `migrar-registro-astro`): las dos pantallas del registro
  // son el embudo del PRD §10; se miden con sus vistas, como en Next. 3b-2
  // (change `migrar-verificacion-sms-astro`) suma la pantalla del código.
  it("/registro, /registro/gracias y /registro/verificar van dentro del tronco medido y no son exclusiones", () => {
    for (const ruta of ["src/pages/registro.astro", "src/pages/registro/gracias.astro", "src/pages/registro/verificar.astro"]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).toMatch(/<TroncoPublico\b/);
      expect(EXCLUSIONES_DE_ASTRO.map(([r]) => r), ruta).not.toContain(ruta);
    }
  });

  // Fase 4 (change `migrar-enlace-gestion-astro`, design.md §1.2 y §2): la
  // exclusión del enlace es por ESTRUCTURA. Toda pantalla de `src/pages/editar`
  // pinta el tronco de gestión o la 404 dinámica; nunca el tronco medido ni el
  // script. Y el tronco de gestión no sirve de escape a una página pública.
  it("las pantallas del enlace usan el tronco de gestión o la 404 dinámica, y nada más las usa", () => {
    const delEnlace = archivosDe(CARPETA_DE_GESTION).filter((ruta) => ruta.endsWith(".astro"));
    expect(delEnlace.map((ruta) => ruta.slice(raiz.length + 1)).sort()).toEqual(["src/pages/editar/[token].astro", "src/pages/editar/[token]/gracias.astro"]);
    for (const ruta of delEnlace) {
      const fuente = readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(fuente, ruta).toMatch(/<TroncoGestion\b/);
      expect(fuente, ruta).not.toMatch(/<TroncoPublico\b|ScriptAnalitica|<DocumentoBase\b/);
      expect(fuente.match(/<(TroncoGestion|NoEncontradoDinamico)\b/g)?.length ?? 0, ruta).toBeGreaterThanOrEqual(1);
    }
    const fueraDelEnlace = archivosDe(join(raiz, "src"))
      .filter((ruta) => !ruta.startsWith(`${CARPETA_DE_GESTION}/`) && !ruta.endsWith("TroncoGestion.astro"))
      // Se mira el código, no los comentarios que lo mencionan.
      .filter((ruta) => /<TroncoGestion\b|TroncoGestion\.astro/.test(readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
    expect(fueraDelEnlace).toEqual([]);
  });

  it("el tronco de gestión no mide: ni el script, ni el tronco medido, y dice por qué", () => {
    const tronco = readFileSync(join(raiz, "src/layouts/TroncoGestion.astro"), "utf8");
    const frontmatter = tronco.split("---")[1] ?? "";
    expect(frontmatter).toMatch(MOTIVO_DE_EXCLUSION);
    const codigo = tronco.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toMatch(/<DocumentoBase\b/);
    expect(codigo).not.toMatch(/ScriptAnalitica|TroncoPublico|umami/);
  });

  it("todo componente de src/astro que pinta un documento fuera del tronco dice por escrito por qué", () => {
    expect(documentosDeSrcAstro().length).toBeGreaterThanOrEqual(1);
    expect(componentesAstroSinMotivo(join(raiz, "src/astro"))).toEqual([]);
  });

  it("un componente de src/astro con el documento base y sin motivo reprueba, y se nombra", () => {
    const ejemplo = join(raiz, "tests/fixtures/paginas-sin-motivo");
    // `sin-layout.astro` es un fragmento (no pinta documento): en `src/astro/` eso es un componente normal.
    expect(componentesAstroSinMotivo(ejemplo)).toEqual(["tests/fixtures/paginas-sin-motivo/sin-motivo.astro"]);
  });

  it("una página con el documento base y sin motivo reprueba, y se nombra", () => {
    // El guardián, aplicado a una carpeta de páginas de ejemplo.
    const ejemplo = join(raiz, "tests/fixtures/paginas-sin-motivo");
    expect(paginasAstroSinMotivo(ejemplo)).toEqual([
      "tests/fixtures/paginas-sin-motivo/sin-motivo.astro",
      "tests/fixtures/paginas-sin-motivo/sin-layout.astro",
    ].sort());
  });

  it("el tronco público envuelve al documento base: un solo documento", () => {
    const tronco = readFileSync(join(raiz, "src/layouts/TroncoPublico.astro"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(tronco).toMatch(/<DocumentoBase\b/);
    expect(tronco).not.toMatch(/<html|<body|<header|<footer|<main/);
  });
});

