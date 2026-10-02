import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import BuscarPage, { metadata } from "../src/app/(publico)/buscar/page";
import { Buscador } from "../src/components/directorio/buscador";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearClientePrueba } from "./db";

/**
 * Change `agregar-buscador`, tasks.md #9 y #11 a #14.
 *
 * Spec `directorio-publico` · requirements "Buscador en la home que funciona
 * sin JavaScript de cliente", "Página de resultados con las mismas tarjetas
 * del listado", "Sin resultados, la página ofrece las categorías como
 * alternativa", "Consulta vacía y términos hostiles acotados, sin error" y
 * "La página de resultados no es indexable".
 *
 * Los negocios son los ficticios del seed de demostración (`771999xxxx`).
 */

const raiz = join(__dirname, "..");
const normalizado = (html: string) => html.replace(/\s+/g, " ");

/**
 * Texto tal como lo lee el vecino: sin entidades HTML. Los literales de la
 * spec traen comillas (`Resultados para "…"`), y React las escribe
 * escapadas (`&quot;`) — que es justo lo que se quiere, pero estorba al
 * comparar contra el literal.
 */
const comoSeLee = (html: string) =>
  normalizado(html).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

let prisma: PrismaClient;

/** Render de `/buscar` con lo que trae la URL (o sin parámetro). */
async function renderBuscar(q?: string | string[]): Promise<string> {
  const elemento = await BuscarPage({
    // El tipo promete strings; en la URL real `q` puede faltar o repetirse.
    searchParams: Promise.resolve(
      (q === undefined ? {} : { q }) as unknown as Record<string, string>,
    ),
  } as unknown as Parameters<typeof BuscarPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

const CATEGORIAS = [
  "Restaurantes y fondas",
  "Servicios del hogar",
  "Belleza",
  "Salud",
  "Abarrotes y comercio",
  "Talleres",
  "Clubes y escuelas deportivas",
  "Otro",
];

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "771999" } } });
  await prisma.$disconnect();
});

describe("directorio-publico · el componente del buscador (tasks #9)", () => {
  const htmlVacio = renderToStaticMarkup(createElement(Buscador));
  const htmlLleno = renderToStaticMarkup(
    createElement(Buscador, { valorInicial: "plomero" }),
  );

  // Scenario: campo etiquetado y tocable
  it("es un formulario GET a /buscar con los tres literales de la spec", () => {
    expect(htmlVacio).toContain('action="/buscar"');
    expect(htmlVacio).toContain('method="get"');
    expect(htmlVacio).toContain('name="q"');
    expect(htmlVacio).toContain('type="search"');
    expect(normalizado(htmlVacio)).toContain("Busca lo que necesitas");
    expect(htmlVacio).toContain('placeholder="ej. plomero, tacos, futbol infantil"');
    expect(normalizado(htmlVacio)).toContain(">Buscar<");
  });

  it("la etiqueta visible está asociada al campo por id", () => {
    const idDelCampo = htmlVacio.match(/<input[^>]*\bid="([^"]+)"/)?.[1];
    expect(idDelCampo).toBeTruthy();
    expect(htmlVacio).toContain(`for="${idDelCampo}"`);
  });

  // Scenario: corregir la búsqueda sin regresar
  it("prellena el campo con lo que el vecino ya escribió", () => {
    expect(htmlVacio).toMatch(/<input[^>]*\bvalue=""/);
    expect(htmlLleno).toContain('value="plomero"');
  });

  // Scenario: la jerarquía de la home no cambia
  it("no agrega ningún encabezado propio", () => {
    expect(htmlVacio).not.toMatch(/<h[1-6][\s>]/);
  });

  // Scenario: el buscador funciona sin JavaScript
  it("no declara JavaScript de cliente ni manejadores de eventos", () => {
    const fuente = readFileSync(
      join(raiz, "src/components/directorio/buscador.tsx"),
      "utf8",
    );
    expect(fuente).not.toMatch(/["']use client["']/);
    expect(htmlVacio).not.toMatch(/\son(click|change|submit|input)\s*=/i);
  });
});

describe("directorio-publico · resultados de una búsqueda (tasks #11)", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderBuscar("plomero");
  });

  // Scenario: resultados de una búsqueda
  it('encabeza con Resultados para "plomero" como único h1', () => {
    expect(comoSeLee(html)).toContain('Resultados para "plomero"');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("lista al negocio sembrado que coincide, con su tarjeta completa", async () => {
    const plomeria = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719995001" },
    });
    expect(normalizado(html)).toContain("Plomería Hermanos Rosales (ficticio)");
    expect(html).toContain(`href="/negocio/plomeria-hermanos-rosales-ficticio-${plomeria.id}"`);
    expect(html).toContain('href="https://wa.me/527719995001?text=');
    expect(normalizado(html)).toContain("Huicalco");
    expect(normalizado(html)).toContain("A domicilio");
    // No arrastra negocios que no coinciden.
    expect(normalizado(html)).not.toContain("Estética Glamour de Mentiras");
  });

  // Scenario: corregir la búsqueda sin regresar
  it("repite el buscador arriba con la consulta ya escrita", () => {
    expect(html).toContain('action="/buscar"');
    expect(html).toContain('value="plomero"');
  });

  // Scenario: encuentra por giro asignado por el admin
  it('"comida" encuentra a la fonda por el giro que le puso el admin', async () => {
    const fonda = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719995004" },
      include: { giros: true },
    });
    expect(fonda.giros.map((g) => g.slug)).toContain("fonda-comida-corrida");
    expect(fonda.nombreNormalizado).not.toContain("comid");
    expect(fonda.queOfrecesNormalizado).not.toContain("comid");

    expect(normalizado(await renderBuscar("comida"))).toContain(
      "Fonda Doña Cuquita (ficticia)",
    );
  });

  // Scenario: "futbol" encuentra al club de "fútbol"
  it('"futbol" encuentra al club que escribió "fútbol"', async () => {
    expect(normalizado(await renderBuscar("futbol"))).toContain(
      "Academia de Futbol Halcones (ficticia)",
    );
  });

  // Scenario: la consulta se muestra como texto
  it("una consulta que parece marcado se muestra escapada", async () => {
    const conMarcado = await renderBuscar("<b>plomero</b>");
    expect(conMarcado).not.toContain("<b>plomero</b>");
    expect(conMarcado).toContain("&lt;b&gt;plomero&lt;/b&gt;");
    // Y aun así encuentra al negocio: los signos se descartan al normalizar.
    expect(normalizado(conMarcado)).toContain("Plomería Hermanos Rosales (ficticio)");
  });

  // Scenario: los negocios no publicados nunca aparecen
  it("ni el en_revision ni el rechazado aparecen en el HTML", async () => {
    const html = await renderBuscar("barberia corte");
    expect(html).not.toContain("Barbería El Buen Corte Imaginario");
    expect(html).not.toContain("7719995011");
    const rechazado = await renderBuscar("taller fantasma");
    expect(rechazado).not.toContain("Taller Fantasma Rechazado");
    expect(rechazado).not.toContain("7719995012");
  });
});

describe("directorio-publico · sin resultados (tasks #12)", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderBuscar("veterinario espacial");
  });

  // Scenario: búsqueda sin coincidencias
  it("dice que no encontró nada y ofrece las ocho categorías", () => {
    expect(comoSeLee(html)).toContain(
      'No encontramos negocios para "veterinario espacial".',
    );
    expect(normalizado(html)).toContain(
      "Prueba con otra palabra o elige una categoría:",
    );
    for (const nombre of CATEGORIAS) {
      expect(normalizado(html), nombre).toContain(`>${nombre}</a>`);
    }
    expect(html).toContain('href="/servicios-del-hogar"');
  });

  // Scenario: la búsqueda vacía de resultados no es un error
  it("es una página normal y conserva el buscador con lo escrito", () => {
    expect(comoSeLee(html)).toContain('Resultados para "veterinario espacial"');
    expect(html).toContain('value="veterinario espacial"');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toMatch(/<article/); // ninguna tarjeta de negocio
  });
});

describe("directorio-publico · consulta vacía (tasks #13)", () => {
  // Scenario: consulta vacía o de puros espacios / comodines / otro alfabeto
  it.each([
    ["sin el parámetro", undefined],
    ["con q vacía", ""],
    ["con puros espacios", "  "],
    ["con un comodín", "%"],
    ["con guion bajo", "_"],
    ["con emojis", "🎉🎈"],
    ["con otro alfabeto", "Привет"],
  ])("%s muestra el aviso y las categorías, sin listar nada", async (_caso, q) => {
    const html = await renderBuscar(q);
    expect(normalizado(html)).toContain("¿Qué estás buscando?");
    expect(normalizado(html)).toContain(
      "Escribe qué necesitas y te decimos quién lo hace en Tizayuca.",
    );
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(normalizado(html)).not.toContain("Resultados para");
    expect(html).not.toMatch(/<article/);
    // El buscador se muestra vacío y las categorías quedan como alternativa.
    expect(html).toMatch(/<input[^>]*\bvalue=""/);
    for (const nombre of CATEGORIAS) {
      expect(normalizado(html), nombre).toContain(`>${nombre}</a>`);
    }
  });

  // Scenario: consulta repetida en la URL
  it("con el parámetro repetido usa el primer valor", async () => {
    const html = await renderBuscar(["plomero", "tacos"]);
    expect(comoSeLee(html)).toContain('Resultados para "plomero"');
    expect(normalizado(html)).toContain("Plomería Hermanos Rosales (ficticio)");
  });

  // Scenario: consulta larguísima
  it("una cadena de miles de caracteres no se repite entera en el encabezado", async () => {
    const larga = "a".repeat(5_000);
    const html = await renderBuscar(larga);
    expect(html).not.toContain(larga);
    const encabezado = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(encabezado.length).toBeLessThan(200);
  });
});

describe("directorio-publico · la página de resultados no es indexable (tasks #14)", () => {
  // Scenario: metadata de la página de resultados
  it("declara noindex, follow", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  // Scenario: las páginas del directorio siguen indexables
  it("ninguna otra página del sitio quedó marcada como no indexable", () => {
    // El panel de revisión (spec revision-admin) exige su propio noindex:
    // las únicas páginas legítimamente no indexables son /buscar, /admin/* y
    // —desde el change `agregar-boton-reportar`— el mini-formulario de reporte
    // con su confirmación (requirement "La página de reporte no se indexa":
    // son páginas de una acción concreta sobre una ficha, no contenido que un
    // buscador deba traer; la ficha en sí sigue indexable).
    //
    // El change `agregar-seo-local` suma un caso acotado —las páginas de giro
    // y giro+colonia SIN negocios publicados—, y por eso mismo ninguna página
    // lo escribe a mano: la instrucción vive en una sola constante
    // (`NOINDEX_CON_ENLACES`, en `src/lib/seo/metadata.ts`) que la metadata
    // del segmento dinámico aplica solo cuando no hay nada que mostrar. Esta
    // verificación sigue cubriendo TODAS las páginas, incluida esa.
    // Y el change `preparar-deploy-produccion` suma las dos rutas de las
    // TAREAS PROGRAMADAS (`/api/tareas/…`), que no son páginas: son puntos de
    // disparo de la purga y del barrido de fotos, mandan `X-Robots-Tag:
    // noindex` en su respuesta y responden 404 a quien no traiga el secreto.
    // Y el change `agregar-enlace-de-gestion` suma el MODO EDICIÓN con su
    // confirmación: el token viaja en la URL, así que la spec
    // `registro-negocio` exige `noindex, nofollow` en las dos (y
    // `referrer: no-referrer`, que se comprueba en `gestion-edicion.test.ts`).
    const noIndexables = [
      join(raiz, "src/app/(publico)/buscar/page.tsx"),
      join(raiz, "src/app/(gestion)/editar/[token]/page.tsx"),
      join(raiz, "src/app/(gestion)/editar/[token]/gracias/page.tsx"),
      join(raiz, "src/app/(publico)/negocio/[ficha]/reportar/page.tsx"),
      join(raiz, "src/app/(publico)/negocio/[ficha]/reportar/gracias/page.tsx"),
      join(raiz, "src/app/api/tareas/purgar-rechazados/route.ts"),
      join(raiz, "src/app/api/tareas/barrer-fotos-huerfanas/route.ts"),
      // Y el change `agregar-verificacion-sms-tras-bandera` (T-016) suma la
      // pantalla del código: la spec `registro-negocio` exige que NO sea
      // indexable y que no aparezca en el sitemap, igual que
      // `/registro/gracias`.
      join(raiz, "src/app/(publico)/registro/verificar/page.tsx"),
    ];
    const paginas = archivosDe(join(raiz, "src/app")).filter(
      (ruta) =>
        !noIndexables.includes(ruta) && !ruta.startsWith(join(raiz, "src/app/admin/")),
    );
    expect(paginas.length).toBeGreaterThanOrEqual(4);
    for (const ruta of paginas) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/noindex|index:\s*false/);
    }
    // Y las tres excepciones sí lo declaran: la lista blanca no es un permiso
    // en blanco, es la constancia de que cada una lo pide a propósito.
    for (const ruta of noIndexables) {
      expect(readFileSync(ruta, "utf8"), ruta).toMatch(/noindex|index:\s*false/);
    }
  });
});

function archivosDe(dir: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) rutas.push(...archivosDe(ruta));
    else if (/\.tsx?$/.test(entrada.name)) rutas.push(ruta);
  }
  return rutas;
}
