import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El panel de revisión (E3) solo se pinta con sesión: `cookies()` y
// `headers()` no existen fuera de un request. Se simulan igual que en
// `tests/admin-paginas.test.ts` para poder revisar SUS enlaces aquí, junto a
// los del resto del sitio. Ninguna página pública usa estas APIs, así que la
// simulación no toca lo demás.
vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  const real = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...real, redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import ColaAdminPage from "../src/app/admin/cola/page";
import AccesoAdminPage from "../src/app/admin/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import RegistroAprobadoPage from "../src/app/admin/registros/[id]/aprobado/page";
import ReportarGraciasPage from "../src/app/(publico)/negocio/[ficha]/reportar/gracias/page";
import ReportarNegocioPage from "../src/app/(publico)/negocio/[ficha]/reportar/page";
import RegistroVerificarPage from "../src/app/(publico)/registro/verificar/page";
import { Footer } from "../src/components/footer";
import { Header } from "../src/components/header";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO, crearPasoInicial, firmarPaso } from "../src/lib/verificacion/paso";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  type CatalogosDeLaRaiz,
  resolverSlugDeLaRaiz,
} from "../src/lib/seo/rutas";
import { metadataDelSitio } from "../src/lib/seo/metadata";
// Home, legales, 404 y el documento base ya se sirven con Astro (change
// `migrar-lectura-publica-astro`, tasks.md #15). Lo que pintaba cada página es
// el contenido de <main>; los metadatos del documento salen de
// `metadataDelSitio()`, que es lo que usa `src/layouts/DocumentoBase.astro`.
import NotFoundPage from "../src/pages/404.astro";
import AvisoDePrivacidadPage from "../src/pages/aviso-de-privacidad.astro";
import Home from "../src/pages/index.astro";
import TerminosPage from "../src/pages/terminos.astro";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { contenidoDelMain, pintarPagina } from "./astro-paginas";
import { crearClientePrueba } from "./db";
// Las páginas del directorio ya se sirven con Astro (change
// `migrar-directorio-publico-astro`, tasks.md #15): lo que pintaban es el
// contenido de <main>.
import { mainDeBuscar, mainDeDestino, mainDeFicha } from "./paginas-directorio";

// Deuda registrada en el change agregar-layout-base (reports/b-dev.md):
// port a Vitest de los scenarios automatizables 2, 4, 7, 9, 10, 11, 12 y 13
// de openspec/specs/layout-base/spec.md, más el contraste AA (scenario 8)
// como test unitario sobre los tokens. El header usa next/link (componente
// de cliente), así que sus scenarios se verifican sobre el código fuente.

const raiz = join(__dirname, "..");

function archivosDe(dir: string, extensiones: string[]): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "generated") continue; // artefactos de Prisma
      rutas.push(...archivosDe(ruta, extensiones));
    } else if (extensiones.some((ext) => entrada.name.endsWith(ext))) {
      rutas.push(ruta);
    }
  }
  return rutas;
}

const fuentesTsx = archivosDe(join(raiz, "src"), [".tsx", ".astro"]);
const fuentesTodas = archivosDe(join(raiz, "src"), [".ts", ".tsx", ".css"]);

/** ¿Es una carpeta de GRUPO de rutas, `(publico)`? No aparece en la URL. */
const esGrupoDeRutas = (segmento: string) =>
  segmento.startsWith("(") && segmento.endsWith(")");

/**
 * URL de una página a partir de la ruta de su archivo dentro de `src/app`.
 *
 * MODIFICADO por el change `agregar-analitica-cookieless`: las carpetas entre
 * paréntesis son grupos de rutas (`src/app/(publico)/terminos/page.tsx`) y NO
 * son un segmento de la URL — sin esto, `/terminos` se leería como
 * `/(publico)/terminos` y toda la revisión de enlaces se volvería mentira.
 */
export function rutaDePagina(rutaArchivo: string): string {
  const relativa = rutaArchivo.slice(join(raiz, "src/app").length + 1);
  const segmentos = relativa
    .split("/")
    .slice(0, -1)
    .filter((segmento) => !esGrupoDeRutas(segmento));
  return `/${segmentos.join("/")}`;
}

/**
 * Rutas ESTÁTICAS que existen de verdad: cada `page.tsx` bajo `src/app` que no
 * tenga segmentos dinámicos. Sirve de lista blanca de hrefs, así que agregar
 * un enlace a una página que aún no existe rompe la suite. Desde el change
 * `agregar-paginas-legales` la lista reconoce `/aviso-de-privacidad` y
 * `/terminos`, que ya existen. Las rutas dinámicas (`/[destino]`,
 * `/negocio/[ficha]`) se validan aparte, resolviendo el destino contra el
 * catálogo y contra los negocios publicados.
 */
const rutasExistentes = new Set([
  ...archivosDe(join(raiz, "src/app"), ["page.tsx"])
    .map(rutaDePagina)
    .filter((ruta) => !ruta.includes("[")),
  // Las rutas de Astro (change `migrar-lectura-publica-astro`): cada página o
  // endpoint de `src/pages/` sin segmentos dinámicos. La 404 no es un destino.
  ...archivosDe(join(raiz, "src/pages"), [".astro", ".ts"])
    .map(rutaDePaginaAstro)
    .filter((ruta) => !ruta.includes("[") && ruta !== "/404"),
]);

/** URL de una página o endpoint de `src/pages/` a partir de su archivo. */
function rutaDePaginaAstro(rutaArchivo: string): string {
  const relativa = rutaArchivo.slice(join(raiz, "src/pages").length + 1).replace(/\.(astro|ts)$/, "");
  const sinIndice = relativa === "index" ? "" : relativa.replace(/\/index$/, "");
  return `/${sinIndice}`;
}
const globalsCss = readFileSync(join(raiz, "src/app/globals.css"), "utf8");
// El documento base del sitio (antes `src/app/layout.tsx`).
const layoutTsx = readFileSync(join(raiz, "src/layouts/DocumentoBase.astro"), "utf8");
const headerTsx = readFileSync(join(raiz, "src/components/header.tsx"), "utf8");

const htmlHeader = renderToStaticMarkup(createElement(Header));
const htmlFooter = renderToStaticMarkup(createElement(Footer));
const html404 = contenidoDelMain(await pintarPagina(NotFoundPage, { ruta: "/no-existe" }));
// Páginas legales (change `agregar-paginas-legales`): sus enlaces cruzados
// entran a la misma revisión que los del resto del sitio.
const htmlAvisoPrivacidad = contenidoDelMain(
  await pintarPagina(AvisoDePrivacidadPage, { ruta: "/aviso-de-privacidad" }),
);
const htmlTerminos = contenidoDelMain(await pintarPagina(TerminosPage, { ruta: "/terminos" }));
const normalizado = (html: string) => html.replace(/\s+/g, " ");

// La home y las páginas del directorio leen la base (Server Components
// asíncronos), así que la suite siembra los catálogos y los negocios de
// demostración antes de renderizarlas.
let htmlHome = "";
let htmlListado = "";
let htmlListadoFiltrado = "";
let htmlFicha = "";
let htmlReportar = "";
let htmlReportarGracias = "";
let htmlBuscar = "";
let htmlBuscarVacio = "";
let htmlGiro = "";
let htmlGiroColonia = "";
let idsPublicados: string[] = [];
/** Segmento de la ficha que renderiza esta suite, para sus sub-rutas. */
let segmentoFichaPublicada = "";
// Los tres catálogos, con los que se resuelven las URLs de la raíz igual que
// en producción (change `agregar-seo-local`).
let catalogos: CatalogosDeLaRaiz = { categorias: [], giros: [], colonias: [] };

// Pantallas del panel (E3): también tienen que cumplir la revisión de enlaces.
let htmlAccesoAdmin = "";
let htmlColaAdmin = "";
let htmlDetalleAdmin = "";
let htmlAprobadoAdmin = "";
let idsEnRevision: string[] = [];
/**
 * Pantalla "Confirma tu número" (T-016): entra a la misma revisión de enlaces
 * y de `action` que el resto del sitio. Solo se puede pintar con la capacidad
 * ENCENDIDA y con la cookie de paso firmada puesta — que es exactamente lo que
 * fija el fail-safe (`tests/verificacion-failsafe.test.ts` prueba el 404).
 */
let htmlVerificar = "";

const SECRETO_PANEL = "s".repeat(LONGITUD_MINIMA_SECRETO);
/** Credenciales de mentira: no sirven para nada fuera de esta suite. */
const SECRETO_VERIFICACION = "secreto-de-pruebas-de-32-caracteres-o-mas";
const URL_SITIO_PANEL = "https://enmirumbo.example";

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = "contrasena-de-prueba-nada-real";
  process.env[VARIABLE_SECRETO_SESION] = SECRETO_PANEL;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO_PANEL;

  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  catalogos = {
    categorias: await prisma.categoria.findMany({
      select: { nombre: true, slug: true },
    }),
    giros: await prisma.giro.findMany({ select: { nombre: true, slug: true } }),
    colonias: await prisma.colonia.findMany({ select: { nombre: true, slug: true } }),
  };
  const publicados = await prisma.negocio.findMany({
    where: { estado: "publicado", whatsapp: "7719995001" },
    select: { id: true, nombre: true },
  });
  idsPublicados = (
    await prisma.negocio.findMany({
      where: { estado: "publicado" },
      select: { id: true },
    })
  ).map((n) => n.id);
  idsEnRevision = (
    await prisma.negocio.findMany({
      where: { estado: "en_revision" },
      select: { id: true },
    })
  ).map((n) => n.id);
  await prisma.$disconnect();

  htmlHome = contenidoDelMain(await pintarPagina(Home, { ruta: "/" }));

  // El segmento dinámico de la raíz se llama `destino` desde el change
  // `agregar-seo-local`: la misma carpeta resuelve categoría, giro y
  // giro+colonia (design.md §1). Las URLs no cambiaron.
  htmlListado = await mainDeDestino("servicios-del-hogar");
  htmlListadoFiltrado = await mainDeDestino("servicios-del-hogar", { colonia: "atempa" });
  htmlGiro = await mainDeDestino("plomeria");
  htmlGiroColonia = await mainDeDestino("plomeria-huicalco");
  htmlFicha = await mainDeFicha(construirSegmentoFicha(publicados[0].nombre, publicados[0].id));

  // Página de reporte y su confirmación (change `agregar-boton-reportar`):
  // sus enlaces —el "Volver a la ficha" de las dos— entran a la misma
  // revisión que los del resto del sitio.
  segmentoFichaPublicada = construirSegmentoFicha(publicados[0].nombre, publicados[0].id);
  const reportar = await ReportarNegocioPage({
    params: Promise.resolve({ ficha: segmentoFichaPublicada }),
    searchParams: Promise.resolve({}),
  });
  htmlReportar = renderToStaticMarkup(createElement(() => reportar));

  const gracias = await ReportarGraciasPage({
    params: Promise.resolve({ ficha: segmentoFichaPublicada }),
    searchParams: Promise.resolve({}),
  });
  htmlReportarGracias = renderToStaticMarkup(createElement(() => gracias));

  // Página de resultados (change `agregar-buscador`): sus enlaces y el
  // destino de su buscador entran a la misma revisión.
  htmlBuscar = await mainDeBuscar({ q: "plomeria" });
  htmlBuscarVacio = await mainDeBuscar({});
  // Panel: la pantalla de acceso se ve sin sesión; el resto, con una cookie
  // firmada de verdad por el mismo módulo que usa producción.
  reiniciarPeticion();
  const acceso = await AccesoAdminPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  });
  htmlAccesoAdmin = renderToStaticMarkup(createElement(() => acceso));

  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO_PANEL);
  const cola = await ColaAdminPage();
  htmlColaAdmin = renderToStaticMarkup(createElement(() => cola));

  const detalle = await DetalleRegistroAdminPage({
    params: Promise.resolve({ id: idsEnRevision[0] }),
    searchParams: Promise.resolve({}),
  });
  htmlDetalleAdmin = renderToStaticMarkup(createElement(() => detalle));

  const aprobado = await RegistroAprobadoPage({
    params: Promise.resolve({ id: idsPublicados[0] }),
    searchParams: Promise.resolve({}),
  });
  htmlAprobadoAdmin = renderToStaticMarkup(createElement(() => aprobado));

  // Pantalla del código (T-016): capacidad encendida y cookie de paso puesta.
  process.env[VARIABLE_BANDERA] = "1";
  process.env[VARIABLE_TWILIO_SID] = "AC-de-mentiras-000";
  process.env[VARIABLE_TWILIO_AUTH_TOKEN] = "token-de-mentiras-000";
  process.env[VARIABLE_TWILIO_SERVICE_SID] = "VA-de-mentiras-000";
  process.env[VARIABLE_SECRETO] = SECRETO_VERIFICACION;
  peticion.cookies[COOKIE_PASO] = firmarPaso(
    crearPasoInicial(idsEnRevision[0], "7719995099"),
    SECRETO_VERIFICACION,
  );
  const verificar = await RegistroVerificarPage({
    searchParams: Promise.resolve({}),
  } as unknown as Parameters<typeof RegistroVerificarPage>[0]);
  htmlVerificar = renderToStaticMarkup(createElement(() => verificar));
  for (const variable of [
    VARIABLE_BANDERA,
    VARIABLE_TWILIO_SID,
    VARIABLE_TWILIO_AUTH_TOKEN,
    VARIABLE_TWILIO_SERVICE_SID,
    VARIABLE_SECRETO,
  ]) {
    delete process.env[variable];
  }
  delete peticion.cookies[COOKIE_PASO];
});

afterAll(async () => {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

/**
 * Revisión de enlaces del sitio (spec layout-base, requirement "Enlaces
 * internos a rutas existentes y enlaces externos protegidos"):
 *
 * - interno: tiene que resolver a una ruta que existe, incluidas las
 *   dinámicas (un slug del catálogo de categorías, la ficha de un negocio
 *   publicado);
 * - externo que abre pestaña nueva: `rel="noopener noreferrer"`;
 * - `tel:`: no abre pestaña (el celular cambia de app), así que no lleva
 *   `target` ni necesita `rel`.
 *
 * MODIFIED por el change `agregar-buscador`: la misma regla aplica al destino
 * de los formularios (el `action` del buscador). Un formulario que envía a
 * una ruta que no existe es un control muerto igual que un enlace roto.
 *
 * Devuelve la lista de problemas para poder probar que de verdad falla ante
 * un enlace inventado, no solo que hoy pasa.
 */

/** ¿Esta ruta interna existe (estática, o dinámica con destino resuelto)? */
function rutaInternaExiste(href: string): boolean {
  const ruta = href.split("?")[0];
  if (rutasExistentes.has(ruta)) return true;

  const segmentos = ruta.split("/").slice(1);
  // Un solo segmento en la raíz: lo resuelve el MISMO resolvedor que
  // producción contra los tres catálogos (change `agregar-seo-local`), así que
  // valen `/servicios-del-hogar` (categoría), `/plomeria` (giro) y
  // `/plomeria-huicalco` (giro+colonia), y sigue sin valer un slug inventado.
  if (
    segmentos.length === 1 &&
    resolverSlugDeLaRaiz(segmentos[0], catalogos).tipo !== "desconocido"
  ) {
    return true;
  }
  // Ficha pública y, desde el change `agregar-boton-reportar`, su página de
  // reporte con la confirmación: cuelgan del mismo segmento de la ficha, así
  // que resuelven contra un negocio publicado de verdad. Una sub-ruta
  // inventada bajo la ficha sigue siendo un enlace roto.
  if (
    segmentos.length >= 2 &&
    segmentos[0] === "negocio" &&
    idsPublicados.some((id) => segmentos[1].endsWith(id))
  ) {
    if (segmentos.length === 2) return true;
    return (
      segmentos[2] === "reportar" &&
      (segmentos.length === 3 || (segmentos.length === 4 && segmentos[3] === "gracias"))
    );
  }
  // Panel de revisión (E3): `/admin/registros/<id>` y sus sub-rutas de
  // confirmación resuelven contra registros que existen de verdad, igual que
  // la ficha pública. Una ruta del panel inventada sigue siendo un problema.
  if (
    segmentos.length >= 3 &&
    segmentos[0] === "admin" &&
    segmentos[1] === "registros" &&
    [...idsPublicados, ...idsEnRevision].includes(segmentos[2])
  ) {
    if (segmentos.length === 3) return true;
    // "borrar" y "despublicado" los estrena el change
    // `agregar-despublicar-y-borrado-arco`: el detalle enlaza a la pantalla de
    // confirmación del borrado, y la acción de despublicar lleva a la suya.
    // "regenerar-enlace" (y su "/listo") los estrena `agregar-enlace-de-
    // gestion`: el detalle de una ficha publicada enlaza a la confirmación de
    // "Generar un enlace nuevo".
    if (
      segmentos.length === 4 &&
      [
        "aprobado",
        "borrar",
        "despublicado",
        "rechazado",
        "regenerar-enlace",
        "ya-resuelto",
      ].includes(segmentos[3])
    ) {
      return true;
    }
    return (
      segmentos.length === 5 &&
      segmentos[3] === "regenerar-enlace" &&
      segmentos[4] === "listo"
    );
  }

  // Ediciones del panel (change `agregar-enlace-de-gestion`):
  // `/admin/ediciones/<id>` y sus dos confirmaciones. El identificador es el
  // de una edición, no el de un negocio, así que aquí solo se comprueba la
  // FORMA de la ruta —una sub-ruta inventada sigue siendo un enlace roto—.
  if (segmentos.length >= 3 && segmentos[0] === "admin" && segmentos[1] === "ediciones") {
    if (segmentos.length === 3) return segmentos[2] !== "";
    return segmentos.length === 4 && ["aplicada", "descartada"].includes(segmentos[3]);
  }

  // Modo edición público (`agregar-enlace-de-gestion`): `/editar/<token>` y su
  // confirmación. Ninguna página pública enlaza aquí —la spec lo exige y
  // `gestion-edicion.test.ts` lo comprueba—, pero las propias pantallas del
  // modo edición sí se enlazan a sí mismas al postear.
  if (segmentos.length >= 2 && segmentos[0] === "editar") {
    if (segmentos.length === 2) return segmentos[1] !== "";
    return segmentos.length === 3 && segmentos[2] === "gracias";
  }

  return false;
}

function problemasDeEnlaces(html: string): string[] {
  const problemas: string[] = [];

  // Destino de los formularios (spec layout-base, scenario "destino del
  // formulario de búsqueda").
  for (const etiqueta of html.matchAll(/<form\s[^>]*>/g)) {
    const form = etiqueta[0];
    const action = form.match(/action="([^"]*)"/)?.[1];
    if (action === undefined) {
      problemas.push(`formulario sin action: ${form}`);
      continue;
    }
    // Los formularios del panel usan Server Actions: fuera del runtime de
    // Next, React las serializa con este action centinela (en producción Next
    // lo sustituye por el id de la action). No es un enlace roto.
    if (action.startsWith("javascript:throw new Error(")) continue;
    if (!action.startsWith("/")) {
      problemas.push(`action que no es una ruta del sitio: ${action}`);
      continue;
    }
    if (!rutaInternaExiste(action)) {
      problemas.push(`action a una ruta inexistente: ${action}`);
    }
  }

  for (const etiqueta of html.matchAll(/<a\s[^>]*>/g)) {
    const anchor = etiqueta[0];
    const href = anchor.match(/href="([^"]*)"/)?.[1];
    if (href === undefined) {
      problemas.push(`enlace sin href: ${anchor}`);
      continue;
    }

    if (href.startsWith("tel:")) {
      if (anchor.includes('target="_blank"')) {
        problemas.push(`el enlace de llamada no debe abrir pestaña nueva: ${href}`);
      }
      continue;
    }

    if (/^https?:\/\//.test(href)) {
      if (!anchor.includes('rel="noopener noreferrer"')) {
        problemas.push(`enlace externo sin rel="noopener noreferrer": ${href}`);
      }
      if (!anchor.includes('target="_blank"')) {
        problemas.push(`enlace externo sin pestaña nueva: ${href}`);
      }
      continue;
    }

    if (!href.startsWith("/")) {
      problemas.push(`href que no es una ruta del sitio ni un externo: ${href}`);
      continue;
    }

    if (rutaInternaExiste(href)) continue;

    problemas.push(`href a una ruta inexistente: ${href}`);
  }
  return problemas;
}

// layout-base ADDED por el change `agregar-analitica-cookieless` · Requirement
// "El panel del admin queda fuera de la medición" (tasks.md #5): las páginas
// públicas viven en un grupo de rutas, y un grupo no es un segmento de URL.
describe("layout-base · los grupos de rutas no cambian ninguna URL", () => {
  it("la carpeta entre paréntesis no aparece en la ruta que se revisa", () => {
    const app = join(raiz, "src/app");
    expect(rutaDePagina(join(app, "(publico)/page.tsx"))).toBe("/");
    expect(rutaDePagina(join(app, "(publico)/terminos/page.tsx"))).toBe("/terminos");
    expect(rutaDePagina(join(app, "(publico)/registro/gracias/page.tsx"))).toBe(
      "/registro/gracias",
    );
    // Y lo que no es grupo sigue contando como segmento.
    expect(rutaDePagina(join(app, "admin/cola/page.tsx"))).toBe("/admin/cola");
    expect(rutaDePagina(join(app, "page.tsx"))).toBe("/");
  });

  it("las rutas públicas siguen existiendo con la misma URL de siempre", () => {
    for (const ruta of [
      "/",
      "/registro",
      "/registro/gracias",
      // Change `agregar-verificacion-sms-tras-bandera` (T-016).
      "/registro/verificar",
      "/buscar",
      "/aviso-de-privacidad",
      "/terminos",
    ]) {
      expect(rutasExistentes, ruta).toContain(ruta);
    }
    for (const ruta of rutasExistentes) {
      expect(ruta, ruta).not.toContain("(");
    }
  });
});

// ENMENDADO (encargo del fundador, fix `fix/contorno-controles`): el header
// se queda solo con el wordmark; "Tizayuca" ya no va ahí. El posicionamiento
// hiperlocal se mueve a otras superficies del producto (home, footer,
// metadata), que se comprueban en sus propias suites (home más abajo en este
// archivo; metadata en el describe "documento es-MX con metadata").
describe("layout-base · header con el wordmark (scenario 1)", () => {
  // ENMENDADO (rebrand T-019): el wordmark es "EnMiRumbo", sin localidad
  // pegada. Scenario "header con el wordmark".
  it('el header lleva el wordmark "EnMiRumbo" y ya NO el posicionamiento "Tizayuca"', () => {
    // Sobre el HTML renderizado, no el código fuente: el código sí menciona
    // "Tizayuca" en su comentario (documenta a dónde se movió el
    // posicionamiento), lo que importa es qué ve el vecino.
    expect(htmlHeader).toContain("EnMiRumbo");
    expect(htmlHeader).not.toContain("Tizayuca");
    expect(htmlHeader).not.toMatch(/necesitouno/i);
    expect(layoutTsx).toMatch(/<Header \/>/);
  });

  // Scenario: footer con los enlaces legales / el posicionamiento hiperlocal
  // sigue visible fuera del header (T-019: la identificación es la marca sola).
  it('el footer identifica al sitio como "EnMiRumbo", sin la localidad pegada', () => {
    expect(htmlFooter).toContain("EnMiRumbo");
    expect(htmlFooter).not.toMatch(/necesitouno/i);
    expect(htmlFooter).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });

  // Scenario: la línea de cierre del footer no cambió con el rebrand
  it("la línea de cierre del footer sigue palabra por palabra como estaba", () => {
    expect(htmlFooter).toContain("Hecho para los vecinos de Tizayuca, Hidalgo.");
  });
});

describe("layout-base · footer sin enlaces muertos (scenario 2)", () => {
  // MODIFIED por el change `agregar-paginas-legales`: el hueco que T-002
  // reservó lo ocupan los dos enlaces legales (E6), cada uno hacia una página
  // que existe de verdad. Antes este caso exigía cero enlaces.
  it("el footer enlaza las dos páginas legales, y las dos existen", () => {
    const delFooter = [...htmlFooter.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
      href: m[1].match(/href="([^"]*)"/)?.[1],
      texto: m[2].replace(/<[^>]+>/g, "").trim(),
      etiqueta: m[0],
    }));
    expect(delFooter).toHaveLength(2);
    expect(delFooter.map((enlace) => enlace.texto)).toEqual([
      "Aviso de privacidad",
      "Términos y condiciones",
    ]);
    expect(delFooter.map((enlace) => enlace.href)).toEqual([
      "/aviso-de-privacidad",
      "/terminos",
    ]);
    for (const enlace of delFooter) {
      expect(rutasExistentes, enlace.href).toContain(enlace.href);
    }
    // Y sigue sin enlaces muertos.
    expect(problemasDeEnlaces(htmlFooter)).toEqual([]);
  });

  // Scenario: los enlaces del footer se pueden tocar en el celular
  it("cada enlace del footer reserva al menos 44px de área táctil", () => {
    const footerTsx = readFileSync(join(raiz, "src/components/footer.tsx"), "utf8");
    expect(footerTsx.match(/\bmin-h-11\b/g)).toHaveLength(2);
  });

  // layout-base (MODIFIED por agregar-formulario-registro) · Scenario: sin
  // enlaces muertos. La lista blanca ya no es la constante "/": son las rutas
  // que existen en `src/app`, más las dinámicas resueltas contra la base.
  // MODIFIED por el change `agregar-buscador`: la misma regla cubre el
  // `action` de los formularios, que es como el buscador sale de la home.
  it("todo href y action literal del código de interfaz apunta a una ruta existente", () => {
    const destinos = fuentesTsx.flatMap((ruta) =>
      [...readFileSync(ruta, "utf8").matchAll(/(?:href|action)="([^"]*)"/g)].map(
        (m) => m[1],
      ),
    );
    expect(destinos.length).toBeGreaterThan(0);
    expect(rutasExistentes).toContain("/registro");
    expect(rutasExistentes).toContain("/buscar");
    for (const destino of destinos) {
      expect(
        rutasExistentes,
        `destino a una ruta inexistente: ${destino}`,
      ).toContain(destino);
    }
  });
});

// layout-base ADDED por agregar-directorio-publico · Requirement "Enlaces
// internos a rutas existentes y enlaces externos protegidos" (tasks.md #16).
describe("layout-base · enlaces internos y externos de las páginas servidas", () => {
  // Scenario: enlaces a rutas dinámicas
  it("la home, el listado (con y sin filtro), la ficha y la 404 solo enlazan a lo que existe", () => {
    expect(problemasDeEnlaces(htmlHome)).toEqual([]);
    expect(problemasDeEnlaces(htmlListado)).toEqual([]);
    expect(problemasDeEnlaces(htmlListadoFiltrado)).toEqual([]);
    expect(problemasDeEnlaces(htmlFicha)).toEqual([]);
    expect(problemasDeEnlaces(html404)).toEqual([]);
    expect(problemasDeEnlaces(htmlFooter)).toEqual([]);
    expect(problemasDeEnlaces(htmlBuscar)).toEqual([]);
    expect(problemasDeEnlaces(htmlBuscarVacio)).toEqual([]);
    // Páginas nuevas del change `agregar-seo-local`
    expect(problemasDeEnlaces(htmlGiro)).toEqual([]);
    expect(problemasDeEnlaces(htmlGiroColonia)).toEqual([]);
    // Páginas nuevas del change `agregar-boton-reportar`
    expect(problemasDeEnlaces(htmlReportar)).toEqual([]);
    expect(problemasDeEnlaces(htmlReportarGracias)).toEqual([]);
    // Las dos páginas legales se enlazan entre sí: ninguna es un enlace muerto.
    expect(problemasDeEnlaces(htmlAvisoPrivacidad)).toEqual([]);
    expect(problemasDeEnlaces(htmlTerminos)).toEqual([]);
    // Pantalla del código (change `agregar-verificacion-sms-tras-bandera`):
    // su única salida es "Mejor luego, mi registro ya quedó", que lleva a la
    // pantalla de gracias de siempre.
    expect(problemasDeEnlaces(htmlVerificar)).toEqual([]);
  });

  // directorio-publico · Requirements "Página indexable por giro…" y "Desde la
  // ficha se llega a las páginas de sus giros" (tasks.md #21).
  it("los enlaces de giro y de giro+colonia resuelven contra el catálogo", () => {
    expect(htmlGiro).toContain('href="/plomeria-huicalco"');
    expect(htmlGiroColonia).toContain('href="/plomeria"');
    expect(htmlFicha).toContain('href="/plomeria"');
    expect(problemasDeEnlaces('<a href="/plomeria">x</a>')).toEqual([]);
    expect(problemasDeEnlaces('<a href="/plomeria-huicalco">x</a>')).toEqual([]);
    // Y lo que no está en el catálogo sigue siendo un enlace roto
    expect(problemasDeEnlaces('<a href="/giro-que-no-existe">x</a>')).toHaveLength(1);
    expect(problemasDeEnlaces('<a href="/plomeria-colonia-inventada">x</a>')).toHaveLength(
      1,
    );
    expect(problemasDeEnlaces('<a href="/loquesea-huicalco">x</a>')).toHaveLength(1);
  });

  // directorio-publico (change `agregar-boton-reportar`) · Requirements
  // "Control discreto 'Reportar este negocio' en la ficha" y "Mini-formulario
  // de reporte…" (tasks.md #10).
  it("la ficha enlaza al reporte de ESE negocio, y la sub-ruta inventada falla", () => {
    const segmento = segmentoFichaPublicada;
    expect(htmlFicha).toContain(`href="/negocio/${segmento}/reportar"`);
    expect(problemasDeEnlaces(`<a href="/negocio/${segmento}/reportar">x</a>`)).toEqual([]);
    expect(
      problemasDeEnlaces(`<a href="/negocio/${segmento}/reportar/gracias">x</a>`),
    ).toEqual([]);
    // Y lo que no existe bajo la ficha sigue siendo un enlace roto.
    expect(
      problemasDeEnlaces(`<a href="/negocio/${segmento}/reportarr">x</a>`),
    ).toHaveLength(1);
    expect(
      problemasDeEnlaces(`<a href="/negocio/${segmento}/reportar/enviado">x</a>`),
    ).toHaveLength(1);
    expect(
      problemasDeEnlaces('<a href="/negocio/negocio-que-no-existe-xyz/reportar">x</a>'),
    ).toHaveLength(1);
  });

  // Scenario: destino del formulario de búsqueda (change `agregar-buscador`)
  it("el buscador de la home y el de resultados envían a una ruta que existe", () => {
    for (const [nombre, html] of [
      ["home", htmlHome],
      ["resultados", htmlBuscar],
      ["consulta vacía", htmlBuscarVacio],
    ] as const) {
      const acciones = [...html.matchAll(/<form\s[^>]*>/g)].map(
        (m) => m[0].match(/action="([^"]*)"/)?.[1],
      );
      expect(acciones, nombre).toEqual(["/buscar"]);
      expect(rutasExistentes, nombre).toContain("/buscar");
    }
  });

  // Scenario: enlaces externos protegidos
  it("los externos de la ficha abren en pestaña nueva y con rel de protección", () => {
    const externos = [...htmlFicha.matchAll(/<a\s[^>]*>/g)]
      .map((m) => m[0])
      .filter((anchor) => /href="https?:\/\//.test(anchor));
    expect(externos.length).toBeGreaterThanOrEqual(2); // WhatsApp y mapa
    for (const anchor of externos) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });

  // Scenario: enlace de llamada
  it('el botón "Llamar" usa tel: y no abre pestaña nueva', () => {
    const llamar = [...htmlFicha.matchAll(/<a\s[^>]*>/g)]
      .map((m) => m[0])
      .filter((anchor) => anchor.includes('href="tel:'));
    expect(llamar).toHaveLength(1);
    expect(llamar[0]).not.toContain("target=");
  });

  // revision-admin · Requirement "El panel no se indexa ni se enlaza desde el
  // sitio público" + "Enlaces internos a rutas existentes…" (tasks.md #24).
  it("las pantallas del panel solo enlazan a rutas del panel que existen", () => {
    expect(problemasDeEnlaces(htmlAccesoAdmin)).toEqual([]);
    expect(problemasDeEnlaces(htmlColaAdmin)).toEqual([]);
    expect(problemasDeEnlaces(htmlDetalleAdmin)).toEqual([]);
    expect(problemasDeEnlaces(htmlAprobadoAdmin)).toEqual([]);
    // Y de verdad hay enlaces que revisar en esas pantallas.
    expect(htmlColaAdmin).toMatch(/<a[^>]+href="\/admin\/registros\//);
  });

  it("los wa.me que abre el panel llevan rel de protección y pestaña nueva", () => {
    for (const html of [htmlDetalleAdmin, htmlAprobadoAdmin]) {
      const externos = [...html.matchAll(/<a\s[^>]*>/g)]
        .map((m) => m[0])
        .filter((anchor) => /href="https:\/\/wa\.me\//.test(anchor));
      expect(externos.length).toBeGreaterThanOrEqual(1);
      for (const anchor of externos) {
        expect(anchor).toContain('target="_blank"');
        expect(anchor).toContain('rel="noopener noreferrer"');
      }
    }
  });

  // Scenario: sin enlaces desde lo público
  it("ninguna página pública enlaza ni menciona la ruta del panel", () => {
    for (const html of [
      htmlHome,
      htmlListado,
      htmlListadoFiltrado,
      htmlFicha,
      html404,
      htmlFooter,
      htmlAvisoPrivacidad,
      htmlTerminos,
    ]) {
      expect(html).not.toContain("/admin");
    }
    // Tampoco en el código de las superficies públicas (header, footer, home).
    for (const ruta of ["src/components/header.tsx", "src/components/footer.tsx", "src/pages/index.astro"]) {
      expect(readFileSync(join(raiz, ruta), "utf8")).not.toContain("/admin");
    }
  });

  // Scenario: las rutas legales ya no son un enlace muerto (MODIFIED por el
  // change `agregar-paginas-legales`)
  it("las rutas legales existen; una legal mal escrita sigue fallando", () => {
    expect(rutasExistentes).toContain("/aviso-de-privacidad");
    expect(rutasExistentes).toContain("/terminos");
    expect(problemasDeEnlaces('<a href="/aviso-de-privacidad">Aviso</a>')).toEqual([]);
    expect(problemasDeEnlaces('<a href="/terminos">Términos</a>')).toEqual([]);
    expect(problemasDeEnlaces('<a href="/terminos-y-condiciones">x</a>')).toHaveLength(1);
    expect(problemasDeEnlaces('<a href="/aviso-privacidad">x</a>')).toHaveLength(1);
  });

  // Scenario: enlace interno a una ruta inexistente (la verificación falla)
  it("señala un enlace inventado, uno externo sin rel y un tel: con pestaña nueva", () => {
    // `/aviso-de-privacidad` ya no sirve de ejemplo de ruta inexistente: la
    // publicó el change `agregar-paginas-legales`. Su versión mal escrita sí.
    expect(problemasDeEnlaces('<a href="/terminos-y-condiciones">x</a>')).toHaveLength(1);
    expect(problemasDeEnlaces('<a href="/categoria-inventada">x</a>')).toHaveLength(1);
    expect(
      problemasDeEnlaces('<a href="/negocio/negocio-que-no-existe-xyz">x</a>'),
    ).toHaveLength(1);
    expect(
      problemasDeEnlaces('<a href="https://wa.me/527719995001" target="_blank">x</a>'),
    ).toEqual(['enlace externo sin rel="noopener noreferrer": https://wa.me/527719995001']);
    expect(
      problemasDeEnlaces('<a href="tel:7717775001" target="_blank">x</a>'),
    ).toHaveLength(1);
    // Y no se queja de lo que sí es correcto
    expect(problemasDeEnlaces('<a href="/servicios-del-hogar">x</a>')).toEqual([]);
    expect(problemasDeEnlaces('<a href="/registro">x</a>')).toEqual([]);
    expect(problemasDeEnlaces('<a href="/admin/cola">x</a>')).toEqual([]);
    expect(
      problemasDeEnlaces(`<a href="/admin/registros/${idsEnRevision[0]}">x</a>`),
    ).toEqual([]);
    // Una ruta del panel inventada sigue rompiendo la revisión.
    expect(
      problemasDeEnlaces('<a href="/admin/registros/id-que-no-existe">x</a>'),
    ).toHaveLength(1);
    expect(
      problemasDeEnlaces(
        `<a href="/admin/registros/${idsEnRevision[0]}/pantalla-inventada">x</a>`,
      ),
    ).toHaveLength(1);
    // `/borrar` sí existe desde el change `agregar-despublicar-y-borrado-arco`.
    expect(
      problemasDeEnlaces(`<a href="/admin/registros/${idsEnRevision[0]}/borrar">x</a>`),
    ).toEqual([]);
    expect(problemasDeEnlaces('<a href="/admin/pantalla-inventada">x</a>')).toHaveLength(1);
  });

  // Scenario: destino del formulario de búsqueda (la verificación falla si se
  // cambia el `action` por una ruta inventada)
  it("señala un formulario que envía a una ruta que no existe", () => {
    expect(problemasDeEnlaces('<form action="/buscador" method="get"></form>')).toEqual([
      "action a una ruta inexistente: /buscador",
    ]);
    expect(
      problemasDeEnlaces('<form action="https://evil.example" method="get"></form>'),
    ).toEqual(["action que no es una ruta del sitio: https://evil.example"]);
    expect(problemasDeEnlaces('<form method="get"></form>')).toHaveLength(1);
    // Y el destino de verdad no se queja.
    expect(problemasDeEnlaces('<form action="/buscar" method="get"></form>')).toEqual([]);
  });
});

describe("layout-base · solo tokens de color (scenario 4)", () => {
  it("ningún componente usa hexadecimales sueltos; la única fuente es @theme", () => {
    for (const ruta of fuentesTsx) {
      expect(readFileSync(ruta, "utf8")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("layout-base · estructura semántica (scenario 7)", () => {
  // Scenario: jerarquía de encabezados (MODIFIED por agregar-directorio-publico:
  // la home ya no es una sola sección, tiene secciones con h2).
  it("el layout arma header/main/footer y la home tiene un h1 con secciones h2", () => {
    expect(layoutTsx).toMatch(/<main[\s>]/);
    expect(headerTsx).toMatch(/<header[\s>]/);
    expect(htmlFooter.match(/<footer[\s>]/g)).toHaveLength(1);
    expect(htmlHome.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlHome.match(/<h2[\s>]/g)).toHaveLength(3);
    expect(htmlHome).not.toMatch(/<h[3-6][\s>]/); // sin saltos de jerarquía
  });

  it("el listado y la ficha también tienen un solo h1", () => {
    expect(htmlListado.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlFicha.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html404.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("layout-base · contraste AA de los tokens (scenario 8)", () => {
  const tokens = Object.fromEntries(
    [...globalsCss.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(
      (m) => [m[1], m[2]],
    ),
  );

  function luminancia(hex: string): number {
    const canales = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = canales;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function ratio(a: string, b: string): number {
    const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (claro + 0.05) / (oscuro + 0.05);
  }

  // Pares texto/fondo documentados en globals.css.
  const paresAA: Array<[string, string]> = [
    ["tinta", "fondo"],
    ["tinta", "superficie"],
    ["tinta", "accion"],
    ["tinta-suave", "fondo"],
    ["tinta-suave", "superficie"],
    ["accion-fuerte", "fondo"],
    ["accion-fuerte", "superficie"],
  ];

  it.each(paresAA)("%s sobre %s cumple AA (≥4.5:1)", (texto, fondo) => {
    expect(ratio(tokens[texto], tokens[fondo])).toBeGreaterThanOrEqual(4.5);
  });

  it("blanco sobre accion-fuerte cumple AA (botón verde con texto blanco)", () => {
    expect(ratio("#ffffff", tokens["accion-fuerte"])).toBeGreaterThanOrEqual(4.5);
  });

  // Par NO-TEXTUAL (WCAG 2.1, 1.4.11): el contorno de los controles de
  // formulario, no un par texto/fondo — el umbral es 3:1, no 4.5:1. Corrección
  // reportada por el fundador (fix `fix/contorno-controles`, spec
  // `layout-base`, requirement "Accesibilidad base del PRD §8").
  const paresNoTextuales: Array<[string, string]> = [
    ["borde-control", "fondo"],
    ["borde-control", "superficie"],
  ];

  it.each(paresNoTextuales)(
    "%s sobre %s cumple el contraste no-textual (≥3:1)",
    (borde, fondo) => {
      expect(ratio(tokens[borde], tokens[fondo])).toBeGreaterThanOrEqual(3);
    },
  );

  // Scenario: contorno del botón secundario (enmienda aprobada por el
  // fundador, revisión visual lote 2 · decisión B1 del paquete visual): el
  // botón secundario es un control, no un adorno, así que su borde sube al
  // token de controles (≥3:1) — y sigue sin usar el verde de acción, para no
  // competir con el botón principal.
  it("el botón secundario usa el borde de controles y no el decorativo", () => {
    const botones = readFileSync(join(raiz, "src/lib/estilos-boton.ts"), "utf8");
    const secundario = botones
      .split("CLASE_BOTON_SECUNDARIO")[1]
      .split(";")[0];
    expect(secundario).toMatch(/\bborder-borde-control\b/);
    expect(secundario).not.toMatch(/\bborder-borde\b(?!-)/);
    expect(ratio(tokens["borde-control"], tokens["fondo"])).toBeGreaterThanOrEqual(3);
  });

  it("el secundario no compite con el primario: sin verde en ningún papel", () => {
    const botones = readFileSync(join(raiz, "src/lib/estilos-boton.ts"), "utf8");
    const secundario = botones.split("CLASE_BOTON_SECUNDARIO")[1].split(";")[0];
    const primario = botones.split("CLASE_BOTON_PRIMARIO")[1].split(";")[0];
    // El relleno verde es del primario, y de nadie más.
    expect(primario).toMatch(/\bbg-accion\b/);
    expect(secundario).not.toMatch(/\bbg-accion\b/);
    expect(secundario).not.toMatch(/\btext-accion\b/);
    expect(secundario).not.toMatch(/\bborder-accion\b/);
    // El único verde que le queda es el aro de foco, igual que en el primario.
    expect(secundario).toMatch(/\bfocus:ring-accion-fuerte\b/);
  });

  it("el verde marca como texto NO cumple AA — la razón de los dos tokens sigue vigente", () => {
    expect(ratio(tokens["accion"], tokens["fondo"])).toBeLessThan(4.5);
  });
});

describe("layout-base · áreas táctiles ≥44px (scenario 9)", () => {
  it("el enlace del header reserva min-h-11 (11 × 4px = 44px) y nadie redefine --spacing", () => {
    expect(headerTsx).toMatch(/\bmin-h-11\b/);
    expect(globalsCss).not.toMatch(/--spacing\s*:/);
  });
});

describe("layout-base · documento es-MX con metadata (scenario 10)", () => {
  // MODIFIED por el change `agregar-seo-local`: el título del sitio pasa a ser
  // el `default` (lo que ve la home y cualquier página sin título propio) y
  // aparece la plantilla que las páginas con título propio heredan. El literal
  // no cambió. Los demás campos nuevos (metadataBase, Open Graph) los cubre
  // `tests/seo-metadata.test.ts`.
  it("título y descripción son los literales aprobados en la spec", () => {
    const metadata = metadataDelSitio();
    expect(layoutTsx).toContain("metadataDelSitio()");
    expect(metadata.title).toEqual({
      default: "EnMiRumbo — Encuentra negocios y servicios en Tizayuca",
      template: "%s — EnMiRumbo",
    });
    expect(metadata.description).toBe(
      "Encuentra negocios, servicios y deporte en Tizayuca y contáctalos directo por WhatsApp. Registro gratis para negocios locales.",
    );
  });

  it("el documento declara lang es-MX", () => {
    expect(layoutTsx).toMatch(/<html lang="es-MX"/);
  });
});

describe("layout-base · sin JS de cliente (scenario 11)", () => {
  // El requirement es del layout ("el layout, el header y el footer"), no de
  // todo el sitio: el formulario de registro sí tiene dos componentes de
  // cliente justificados y acotados (spec registro-negocio, design.md §1),
  // que su propia suite vigila (tests/registro-pagina.test.ts).
  // La lista es por exclusión, no fija: cualquier archivo nuevo de `src/` que
  // no sea del registro entra solo a la vigilancia (nota menor de la etapa C).
  const rutasDelRegistro = [
    join(raiz, "src/app/(publico)/registro"),
    join(raiz, "src/components/registro"),
  ];
  const fuentesLayoutBase = fuentesTodas.filter(
    (ruta) => !rutasDelRegistro.some((carpeta) => ruta.startsWith(carpeta)),
  );

  it('ningún archivo de la capacidad layout-base declara "use client"', () => {
    expect(fuentesLayoutBase.length).toBeGreaterThanOrEqual(6);
    for (const ruta of fuentesLayoutBase) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/["']use client["']/);
    }
  });

  // MODIFIED (change `migrar-lectura-publica-astro`): ni directiva `client:`
  // en el documento base, el tronco ni las páginas de Astro.
  it("ningún layout ni página de Astro se hidrata con una directiva client:", () => {
    const astro = archivosDe(join(raiz, "src"), [".astro"]);
    expect(astro.length).toBeGreaterThanOrEqual(7);
    for (const ruta of astro) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/\sclient:[a-z]+/i);
    }
  });
});

// layout-base · Requirement "Home del sitio dentro del layout, con la entrada
// al registro" (RENAMED + MODIFIED por agregar-directorio-publico; antes era
// "Home provisional que usa el layout", scenario 12).
describe("layout-base · home del sitio dentro del layout", () => {
  // Scenario: home dentro del layout
  it("saluda con los textos literales de la spec", () => {
    expect(normalizado(htmlHome)).toContain("¿Qué necesitas en Tizayuca?");
    expect(normalizado(htmlHome)).toContain(
      "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp.",
    );
  });

  // Scenario: la home ya no anuncia que el directorio viene después
  it("ya no anuncia que el directorio viene después", () => {
    expect(normalizado(htmlHome)).not.toContain(
      "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca.",
    );
    expect(normalizado(htmlHome)).not.toContain("Bienvenido, vecino de Tizayuca");
  });
});

// layout-base ADDED por agregar-directorio-publico · Requirement "Página 404
// en español dentro del layout" (tasks.md #6).
describe("layout-base · página 404 en español", () => {
  // Scenario: URL desconocida
  it("trae los tres textos literales y vive dentro del layout", () => {
    expect(normalizado(html404)).toContain("No encontramos esta página");
    expect(normalizado(html404)).toContain(
      "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita.",
    );
    expect(normalizado(html404)).toContain("Ir al inicio");
    // No repinta header ni footer: los pone el layout raíz
    expect(html404).not.toMatch(/<header[\s>]|<footer[\s>]/);
  });

  // Scenario: la 404 no es una página en inglés ni un volcado técnico
  it("no muestra detalles técnicos y su único enlace es la home", () => {
    expect([...html404.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual(["/"]);
    expect(html404).not.toMatch(/404|Not Found|stack|undefined/);
  });
});

// layout-base MODIFIED por el change agregar-formulario-registro.
describe("layout-base · entrada al registro desde la home", () => {
  const homeTsx = readFileSync(join(raiz, "src/pages/index.astro"), "utf8");
  const botonPrimario = readFileSync(join(raiz, "src/lib/estilos-boton.ts"), "utf8");

  // Scenario: entrada al registro desde la home
  it('la home enlaza a /registro con el texto literal "Registra tu negocio gratis"', () => {
    // MODIFIED por agregar-directorio-publico: la entrada va bajo la pregunta.
    expect(normalizado(htmlHome)).toContain("¿Tienes un negocio en Tizayuca?");
    expect(normalizado(htmlHome)).toContain("Registra tu negocio gratis");
    expect(htmlHome).toMatch(/<a[^>]+href="\/registro"/);
  });

  // Scenario: entrada al registro desde la home (estilo de acción y área táctil)
  it("usa el verde de acción y reserva al menos 44px de área táctil", () => {
    expect(homeTsx).toContain("CLASE_BOTON_PRIMARIO");
    expect(botonPrimario).toMatch(/\bbg-accion\b/);
    expect(botonPrimario).toMatch(/\bmin-h-11\b/);
  });
});

describe("layout-base · sin rastros de la plantilla (scenario 13)", () => {
  // "vercel" a secas se afinó a los rastros REALES de la plantilla (el logo,
  // los enlaces a vercel.com/vercel.app): `VERCEL_ENV` es una variable de
  // entorno legítima que el panel mira para no abrirse mal configurado en
  // producción, igual que ya hacía `prisma/seed-demo.ts`.
  it("no queda nada de create-next-app en src/", () => {
    // Única excepción, y solo para "geist": la imagen de marca se dibuja con
    // Geist Regular, la tipografía que traía `next/og`, copiada con su
    // licencia (change `migrar-lectura-publica-astro`, design.md §6). No es la
    // fuente de la plantilla: el sitio sigue con la pila de sistema.
    const imagenDeMarca = join(raiz, "src/astro/imagen-de-marca");
    for (const ruta of fuentesTodas) {
      const patron = ruta.startsWith(imagenDeMarca)
        ? /next\.svg|vercel\.svg|vercel\.(com|app)|create next app|Get started|prefers-color-scheme/i
        : /next\.svg|vercel\.svg|vercel\.(com|app)|create next app|Get started|geist|prefers-color-scheme/i;
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(patron);
    }
    expect(globalsCss).not.toMatch(/geist/i);
    expect(layoutTsx).not.toMatch(/geist/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fase 2b (change `migrar-directorio-publico-astro`, tasks.md #13; spec
// `plataforma-astro`, requirement "El sitemap, los enlaces y las rutas
// reservadas resuelven en Astro").
//
// La revisión de arriba acepta lo que exista en `src/app` O en `src/pages`,
// porque el panel (Fase 5) y el reporte (Fase 3) siguen en Next. Esta es más
// estricta: lo que pintan las páginas públicas YA migradas tiene que resolver
// en Astro, salvo los enlaces que esperan a la Fase 3, que son una lista
// explícita (design.md §8). No se crean páginas provisionales.
// ───────────────────────────────────────────────────────────────────────────

/** Enlaces que esperan a la Fase 3 (T-024): en 2b responden la 404 global. */
const EXCEPCIONES_FASE_3: Array<[RegExp, string]> = [
  [/^\/registro$/, "formulario de registro (Fase 3)"],
  [/^\/negocio\/[^/]+\/reportar$/, "reporte de un negocio (Fase 3, T-024)"],
];

/** Rutas dinámicas de `src/pages/`, en forma de URL (`/[destino]`, …). */
const rutasDinamicasDeAstro = archivosDe(join(raiz, "src/pages"), [".astro", ".ts"])
  .map(rutaDePaginaAstro)
  .filter((ruta) => ruta.includes("["))
  .sort();

/** Rutas estáticas de `src/pages/` (sin la 404 ni la 500, que no son destinos). */
const rutasEstaticasDeAstro = new Set(
  archivosDe(join(raiz, "src/pages"), [".astro", ".ts"])
    .map(rutaDePaginaAstro)
    .filter((ruta) => !ruta.includes("[") && ruta !== "/404" && ruta !== "/500"),
);

/** ¿Esta ruta interna la sirve Astro (estática, o dinámica que resuelve)? */
function rutaDeAstroExiste(href: string): boolean {
  const ruta = href.split("?")[0];
  if (rutasEstaticasDeAstro.has(ruta)) return true;
  const segmentos = ruta.split("/").slice(1);
  // `src/pages/[destino].astro`: categoría, giro o giro+colonia del catálogo.
  if (segmentos.length === 1 && resolverSlugDeLaRaiz(segmentos[0], catalogos).tipo !== "desconocido") {
    return true;
  }
  // `src/pages/negocio/[ficha].astro`: la ficha de un negocio publicado.
  return segmentos.length === 2 && segmentos[0] === "negocio" && idsPublicados.some((id) => segmentos[1].endsWith(id));
}

/** Enlaces y destinos de formulario internos que Astro no sirve y no son excepción de la Fase 3. */
function problemasDeEnlacesEnAstro(html: string): string[] {
  const destinos = [
    ...[...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<form\s[^>]*action="([^"]*)"/g)].map((m) => m[1]),
  ].filter((destino) => destino.startsWith("/"));
  return destinos
    .filter((destino) => !EXCEPCIONES_FASE_3.some(([patron]) => patron.test(destino.split("?")[0])))
    .filter((destino) => !rutaDeAstroExiste(destino))
    .map((destino) => `destino que Astro no sirve: ${destino}`);
}

/** Los enlaces de la página que caen en la lista de la Fase 3. */
const enlacesDeFase3 = (html: string) =>
  [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((href) => EXCEPCIONES_FASE_3.some(([patron]) => patron.test(href)));

describe("plataforma-astro · los enlaces de las páginas migradas resuelven en Astro (2b)", () => {
  it("reconoce las rutas dinámicas de src/pages: [destino], negocio/[ficha] y la de fotos", () => {
    expect(rutasDinamicasDeAstro).toEqual(["/[destino]", "/api/foto/[clave]/[variante]", "/negocio/[ficha]"]);
    expect(rutasEstaticasDeAstro).toContain("/buscar");
    expect(rutasEstaticasDeAstro).not.toContain("/registro");
  });

  it("home, listados, giro, ficha, /buscar, 404, legales y footer solo enlazan a lo que Astro sirve", () => {
    const paginas: Array<[string, string]> = [
      ["home", htmlHome],
      ["listado", htmlListado],
      ["listado filtrado", htmlListadoFiltrado],
      ["giro", htmlGiro],
      ["giro+colonia", htmlGiroColonia],
      ["ficha", htmlFicha],
      ["resultados", htmlBuscar],
      ["consulta vacía", htmlBuscarVacio],
      ["404", html404],
      ["aviso de privacidad", htmlAvisoPrivacidad],
      ["términos", htmlTerminos],
      ["footer", htmlFooter],
      ["header", htmlHeader],
    ];
    for (const [nombre, html] of paginas) expect(problemasDeEnlacesEnAstro(html), nombre).toEqual([]);
  });

  // Scenario "los enlaces de la Fase 3 son la única excepción".
  it("acepta /registro y /negocio/<…>/reportar solo por estar en la lista de la Fase 3", () => {
    expect(enlacesDeFase3(htmlFicha)).toEqual([`/negocio/${segmentoFichaPublicada}/reportar`]);
    expect(enlacesDeFase3(htmlHome)).toEqual(["/registro"]);
    // Sin la excepción, las dos serían destinos que Astro no sirve.
    expect(rutaDeAstroExiste("/registro")).toBe(false);
    expect(rutaDeAstroExiste(`/negocio/${segmentoFichaPublicada}/reportar`)).toBe(false);
  });

  it("falla con cualquier otro destino que no existe", () => {
    expect(problemasDeEnlacesEnAstro('<a href="/ruta-inventada-xyz">x</a>')).toHaveLength(1);
    expect(problemasDeEnlacesEnAstro(`<a href="/negocio/${segmentoFichaPublicada}/reportar/gracias">x</a>`)).toHaveLength(1);
    expect(problemasDeEnlacesEnAstro('<a href="/registro/gracias">x</a>')).toHaveLength(1);
    expect(problemasDeEnlacesEnAstro('<a href="/negocio/negocio-que-no-existe-xyz">x</a>')).toHaveLength(1);
    expect(problemasDeEnlacesEnAstro('<form action="/buscador-inventado"></form>')).toHaveLength(1);
    expect(problemasDeEnlacesEnAstro('<form action="/buscar"></form>')).toEqual([]);
  });
});
