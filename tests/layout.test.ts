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
import ListadoCategoriaPage from "../src/app/[categoria]/page";
import ColaAdminPage from "../src/app/admin/cola/page";
import AccesoAdminPage from "../src/app/admin/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import RegistroAprobadoPage from "../src/app/admin/registros/[id]/aprobado/page";
import { metadata } from "../src/app/layout";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import NotFoundPage from "../src/app/not-found";
import Home from "../src/app/page";
import { Footer } from "../src/components/footer";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

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

const fuentesTsx = archivosDe(join(raiz, "src"), [".tsx"]);
const fuentesTodas = archivosDe(join(raiz, "src"), [".ts", ".tsx", ".css"]);

/**
 * Rutas ESTÁTICAS que existen de verdad: cada `page.tsx` bajo `src/app` que no
 * tenga segmentos dinámicos. Sirve de lista blanca de hrefs, así que agregar
 * un enlace a una página que aún no existe (los legales de E6, por ejemplo)
 * rompe la suite. Las rutas dinámicas (`/[categoria]`,
 * `/negocio/[ficha]`) se validan aparte, resolviendo el destino contra el
 * catálogo y contra los negocios publicados.
 */
const rutasExistentes = new Set(
  archivosDe(join(raiz, "src/app"), ["page.tsx"])
    .map((ruta) => {
      const relativa = ruta.slice(join(raiz, "src/app").length + 1);
      const segmentos = relativa.split("/").slice(0, -1);
      return `/${segmentos.join("/")}`;
    })
    .filter((ruta) => !ruta.includes("[")),
);
const globalsCss = readFileSync(join(raiz, "src/app/globals.css"), "utf8");
const layoutTsx = readFileSync(join(raiz, "src/app/layout.tsx"), "utf8");
const headerTsx = readFileSync(join(raiz, "src/components/header.tsx"), "utf8");

const htmlFooter = renderToStaticMarkup(createElement(Footer));
const html404 = renderToStaticMarkup(createElement(NotFoundPage));
const normalizado = (html: string) => html.replace(/\s+/g, " ");

// La home y las páginas del directorio leen la base (Server Components
// asíncronos), así que la suite siembra los catálogos y los negocios de
// demostración antes de renderizarlas.
let htmlHome = "";
let htmlListado = "";
let htmlListadoFiltrado = "";
let htmlFicha = "";
let slugsCategorias: string[] = [];
let idsPublicados: string[] = [];

// Pantallas del panel (E3): también tienen que cumplir la revisión de enlaces.
let htmlAccesoAdmin = "";
let htmlColaAdmin = "";
let htmlDetalleAdmin = "";
let htmlAprobadoAdmin = "";
let idsEnRevision: string[] = [];

const SECRETO_PANEL = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO_PANEL = "https://necesitouno.example";

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = "contrasena-de-prueba-nada-real";
  process.env[VARIABLE_SECRETO_SESION] = SECRETO_PANEL;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO_PANEL;

  const prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  slugsCategorias = (await prisma.categoria.findMany({ select: { slug: true } })).map(
    (c) => c.slug,
  );
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

  const home = await Home();
  htmlHome = renderToStaticMarkup(createElement(() => home));

  const listado = await ListadoCategoriaPage({
    params: Promise.resolve({ categoria: "servicios-del-hogar" }),
    searchParams: Promise.resolve({}),
  });
  htmlListado = renderToStaticMarkup(createElement(() => listado));

  const filtrado = await ListadoCategoriaPage({
    params: Promise.resolve({ categoria: "servicios-del-hogar" }),
    searchParams: Promise.resolve({ colonia: "atempa" }),
  });
  htmlListadoFiltrado = renderToStaticMarkup(createElement(() => filtrado));

  const ficha = await FichaNegocioPage({
    params: Promise.resolve({
      ficha: construirSegmentoFicha(publicados[0].nombre, publicados[0].id),
    }),
    searchParams: Promise.resolve({}),
  });
  htmlFicha = renderToStaticMarkup(createElement(() => ficha));

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
 * Devuelve la lista de problemas para poder probar que de verdad falla ante
 * un enlace inventado, no solo que hoy pasa.
 */
function problemasDeEnlaces(html: string): string[] {
  const problemas: string[] = [];
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

    const ruta = href.split("?")[0];
    if (rutasExistentes.has(ruta)) continue;

    const segmentos = ruta.split("/").slice(1);
    if (segmentos.length === 1 && slugsCategorias.includes(segmentos[0])) continue;
    if (
      segmentos.length === 2 &&
      segmentos[0] === "negocio" &&
      idsPublicados.some((id) => segmentos[1].endsWith(id))
    ) {
      continue;
    }
    // Panel de revisión (E3): `/admin/registros/<id>` y sus sub-rutas de
    // confirmación resuelven contra registros que existen de verdad, igual que
    // la ficha pública. Una ruta del panel inventada sigue siendo un problema.
    if (
      segmentos.length >= 3 &&
      segmentos[0] === "admin" &&
      segmentos[1] === "registros" &&
      [...idsPublicados, ...idsEnRevision].includes(segmentos[2]) &&
      (segmentos.length === 3 ||
        (segmentos.length === 4 &&
          ["aprobado", "rechazado", "ya-resuelto"].includes(segmentos[3])))
    ) {
      continue;
    }

    problemas.push(`href a una ruta inexistente: ${href}`);
  }
  return problemas;
}

describe("layout-base · header con marca y posicionamiento (scenario 1)", () => {
  it('el header lleva el wordmark "NecesitoUno" y el posicionamiento "Tizayuca"', () => {
    expect(headerTsx).toMatch(/NecesitoUno/);
    expect(headerTsx).toMatch(/Tizayuca/);
    expect(layoutTsx).toMatch(/<Header \/>/);
  });
});

describe("layout-base · footer sin enlaces muertos (scenario 2)", () => {
  it("el footer no tiene ningún enlace mientras no existan las páginas legales", () => {
    expect(htmlFooter).not.toMatch(/<a[\s>]/);
  });

  // layout-base (MODIFIED por agregar-formulario-registro) · Scenario: sin
  // enlaces muertos. La lista blanca ya no es la constante "/": son las rutas
  // que existen en `src/app`, más las dinámicas resueltas contra la base.
  it("todo href literal del código de interfaz apunta a una ruta existente", () => {
    const hrefs = fuentesTsx.flatMap((ruta) =>
      [...readFileSync(ruta, "utf8").matchAll(/href="([^"]*)"/g)].map(
        (m) => m[1],
      ),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(rutasExistentes).toContain("/registro");
    for (const href of hrefs) {
      expect(rutasExistentes, `href a una ruta inexistente: ${href}`).toContain(
        href,
      );
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
    ]) {
      expect(html).not.toContain("/admin");
    }
    // Tampoco en el código de las superficies públicas (header, footer, home).
    for (const ruta of ["src/components/header.tsx", "src/components/footer.tsx", "src/app/page.tsx"]) {
      expect(readFileSync(join(raiz, ruta), "utf8")).not.toContain("/admin");
    }
  });

  // Scenario: enlace interno a una ruta inexistente (la verificación falla)
  it("señala un enlace inventado, uno externo sin rel y un tel: con pestaña nueva", () => {
    expect(problemasDeEnlaces('<a href="/aviso-de-privacidad">Aviso</a>')).toHaveLength(
      1,
    );
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
      problemasDeEnlaces(`<a href="/admin/registros/${idsEnRevision[0]}/borrar">x</a>`),
    ).toHaveLength(1);
    expect(problemasDeEnlaces('<a href="/admin/pantalla-inventada">x</a>')).toHaveLength(1);
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
  it("título y descripción son los literales aprobados en la spec", () => {
    expect(metadata.title).toBe(
      "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca",
    );
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
    join(raiz, "src/app/registro"),
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
  const homeTsx = readFileSync(join(raiz, "src/app/page.tsx"), "utf8");
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
    for (const ruta of fuentesTodas) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(
        /next\.svg|vercel\.svg|vercel\.(com|app)|create next app|Get started|geist|prefers-color-scheme/i,
      );
    }
  });
});
