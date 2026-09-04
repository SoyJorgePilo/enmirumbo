import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import ListadoCategoriaPage from "../src/app/[destino]/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import NotFoundPage from "../src/app/not-found";
import Home from "../src/app/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico (home, listado, filtro, tarjeta, ficha, botones de
// contacto, privacidad y Server Components) + layout-base (página 404).
// tasks.md #6 a #13 y #18.

const raiz = join(__dirname, "..");
const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let htmlHome = "";
let idPorWhatsapp: Record<string, string> = {};

async function renderListado(
  categoria: string,
  colonia?: string,
): Promise<string> {
  const elemento = await ListadoCategoriaPage({
    // Renombrado a `destino` por el change `agregar-seo-local` (design.md §1):
    // el mismo segmento dinámico resuelve categoría, giro y giro+colonia. Los
    // casos de esta suite no cambian: la URL `/servicios-del-hogar` es la
    // misma y responde lo mismo.
    params: Promise.resolve({ destino: categoria }),
    searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderFicha(segmento: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: segmento }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

/** Digest del 404 de Next (`NEXT_HTTP_ERROR_FALLBACK;404`) o `null`. */
async function digestDe(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : null;
  }
}

/** Segmento canónico de la ficha del negocio sembrado con ese WhatsApp. */
function segmentoDe(whatsapp: string, nombre: string): string {
  return construirSegmentoFicha(nombre, idPorWhatsapp[whatsapp]);
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  // Fixtures del hallazgo M2 (etapa C): un fijo guardado con formato feo y
  // otro que no es un número marcable. Van en "Belleza", categoría de la que
  // este archivo no afirma conteos. Datos ficticios, misma serie que el seed.
  const belleza = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "belleza" },
  });
  const centro = await prisma.colonia.findUniqueOrThrow({
    where: { slug: "tizayuca-centro" },
  });
  for (const [whatsapp, nombre, telefonoFijo] of [
    ["7719995013", "Peluquería Formato Feo (ficticia)", "+52 (771) 777-5013"],
    ["7719995014", "Salón Teléfono Raro (ficticio)", "771 777 5014 ext. 12"],
  ]) {
    await prisma.negocio.upsert({
      where: { whatsapp },
      update: { telefonoFijo },
      create: {
        nombre,
        whatsapp,
        telefonoFijo,
        categoriaId: belleza.id,
        coloniaId: centro.id,
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-12T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });
  }

  const negocios = await prisma.negocio.findMany({
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp = Object.fromEntries(negocios.map((n) => [n.whatsapp, n.id]));

  const home = await Home();
  htmlHome = renderToStaticMarkup(createElement(() => home));
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("directorio-publico · home con categorías y bloque de deporte", () => {
  // Scenario: las ocho categorías visibles
  it.each([
    "Restaurantes y fondas",
    "Servicios del hogar",
    "Belleza",
    "Salud",
    "Abarrotes y comercio",
    "Talleres",
    "Clubes y escuelas deportivas",
    "Otro",
  ])('muestra la categoría "%s" del catálogo con enlace a su listado', (nombre) => {
    expect(normalizado(htmlHome)).toContain(`>${nombre}</a>`);
  });

  it('las categorías van bajo el encabezado literal "Busca por categoría"', () => {
    expect(htmlHome).toContain("Busca por categoría");
    expect(htmlHome.indexOf("Busca por categoría")).toBeLessThan(
      htmlHome.indexOf("Servicios del hogar"),
    );
  });

  // Scenario: tocar una categoría lleva a su listado
  it("el botón de Servicios del hogar lleva a /servicios-del-hogar", () => {
    expect(htmlHome).toContain('href="/servicios-del-hogar"');
  });

  // Scenario: sin controles muertos en la home (MODIFIED por el change
  // `agregar-buscador`: la cláusula que prohibía mostrar un campo de búsqueda
  // "mientras el buscador (E2-4) no exista" cae; lo que sigue prohibido es un
  // control SIN destino).
  it("todo control de la home lleva a algo: el único formulario va a /buscar", () => {
    const formularios = [...htmlHome.matchAll(/<form\s[^>]*>/g)].map((m) => m[0]);
    expect(formularios).toHaveLength(1);
    expect(formularios[0]).toContain('action="/buscar"');
    expect(formularios[0]).toContain('method="get"');

    // Un solo campo (el de la búsqueda) y un solo botón (su envío): ni
    // filtros, ni selects, ni botones que no manden a ningún lado.
    expect(htmlHome.match(/<input\b/g)).toHaveLength(1);
    expect(htmlHome).toContain('name="q"');
    expect(htmlHome.match(/<button\b/g)).toHaveLength(1);
    expect(htmlHome).toMatch(/<button type="submit"/);
    expect(htmlHome).not.toMatch(/<select|<textarea/);
  });

  // Scenario: el bloque de deporte se ve al mismo nivel que las categorías
  it("el bloque de deporte trae su título, su frase y su entrada", () => {
    expect(normalizado(htmlHome)).toContain("Deporte en Tizayuca");
    expect(normalizado(htmlHome)).toContain(
      "Escuelas, clubes y entrenadores para que los niños (y los grandes) se muevan.",
    );
    expect(normalizado(htmlHome)).toContain("Ver clubes y escuelas deportivas");
  });

  // Scenario: el bloque lleva al listado de deporte
  it("lleva al mismo listado que el botón de la categoría", () => {
    const enlaces = [...htmlHome.matchAll(/href="\/clubes-y-escuelas-deportivas"/g)];
    expect(enlaces).toHaveLength(2); // el botón de categoría y el del bloque
  });

  it("los dos bloques usan el mismo nivel de encabezado (h2)", () => {
    const h2 = [...htmlHome.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(h2).toContain("Busca por categoría");
    expect(h2).toContain("Deporte en Tizayuca");
    expect(htmlHome.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlHome).not.toMatch(/<h[3-6][\s>]/);
  });
});

describe("directorio-publico · listado por categoría", () => {
  let htmlServicios = "";

  beforeAll(async () => {
    htmlServicios = await renderListado("servicios-del-hogar");
  });

  // Scenario: listado de una categoría con negocios
  it("encabeza con '<Categoría> en Tizayuca' y trae una tarjeta por negocio", () => {
    expect(htmlServicios).toContain("Servicios del hogar en Tizayuca");
    expect(htmlServicios.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlServicios.match(/<article[\s>]/g)).toHaveLength(3);
  });

  // Requirement: orden determinista (reciente primero, empate por nombre)
  it("ordena por publicación reciente y desempata por nombre", () => {
    const nombres = [...htmlServicios.matchAll(/<h3[^>]*><a[^>]*>([^<]+)<\/a>/g)].map(
      (m) => m[1],
    );
    expect(nombres).toEqual([
      "Cerrajería Puerta Abierta (ficticio)",
      "Electricidad Rápida JR (ficticio)",
      "Plomería Hermanos Rosales (ficticio)",
    ]);
  });

  // Scenario: contenido de la tarjeta + Scenario: la tarjeta lleva a la ficha
  it("cada tarjeta trae marcador de foto, nombre, colonia, WhatsApp y enlace a la ficha", () => {
    const segmento = segmentoDe("7719995001", "Plomería Hermanos Rosales (ficticio)");
    expect(htmlServicios).toContain(`href="/negocio/${segmento}"`);
    expect(htmlServicios).toContain("Huicalco");
    expect(htmlServicios).toContain("Atempa");
    // Marcador de posición decorativo, sin prometer imagen
    expect(htmlServicios).toContain('aria-hidden="true"');
    expect(htmlServicios).not.toContain("<img");
  });

  // Scenario: WhatsApp directo desde la tarjeta + Scenario: etiqueta accesible
  it("el botón de WhatsApp sale a wa.me y dice a qué negocio le escribe", () => {
    expect(htmlServicios).toContain("https://wa.me/527719995001?text=");
    expect(htmlServicios).toContain(
      'aria-label="Enviar WhatsApp a Plomería Hermanos Rosales (ficticio)"',
    );
  });

  // Scenario: etiqueta "A domicilio" solo cuando aplica
  it('la etiqueta "A domicilio" aparece solo en los negocios que la registraron', () => {
    // Dos de los tres negocios de la categoría hacen entregas
    expect(htmlServicios.match(/A domicilio/g)).toHaveLength(2);
  });

  // Scenario: categoría inexistente
  it("un slug que no está en el catálogo responde 404", async () => {
    expect(await digestDe(renderListado("plomeros-baratos"))).toBe(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
  });

  // Scenario: categoría sin negocios publicados todavía
  it("una categoría vacía invita a registrarse en vez de quedarse en blanco", async () => {
    const html = await renderListado("otro");
    expect(normalizado(html)).toContain(
      "Todavía no hay negocios publicados en esta categoría.",
    );
    expect(normalizado(html)).toContain("Registra tu negocio gratis");
    expect(html).toContain('href="/registro"');
    expect(html).not.toMatch(/<article[\s>]/);
  });
});

describe("directorio-publico · filtro por colonia sin JavaScript", () => {
  // Scenario: solo colonias con negocios
  it("ofrece 'Todas las colonias' y solo colonias con negocios publicados", async () => {
    const html = await renderListado("servicios-del-hogar");
    expect(html).toContain("Todas las colonias");
    expect(html).toContain('href="/servicios-del-hogar?colonia=huicalco"');
    expect(html).toContain('href="/servicios-del-hogar?colonia=atempa"');
    // Una colonia del catálogo sin negocios de esta categoría no se ofrece
    expect(html).not.toContain("colonia=nacozari");
    // Sin JS: son enlaces, no un <select>
    expect(html).not.toMatch(/<select|onchange/i);
  });

  // Scenario: filtrar por una colonia
  it("con filtro solo salen los negocios de esa colonia y la opción se ve activa", async () => {
    const html = await renderListado("servicios-del-hogar", "atempa");
    expect(html.match(/<article[\s>]/g)).toHaveLength(1);
    expect(html).toContain("Electricidad Rápida JR (ficticio)");
    expect(html).not.toContain("Plomería Hermanos Rosales (ficticio)");
    const enlaces = [...html.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    const activa = enlaces.find((a) => a.includes("colonia=atempa"));
    const huicalco = enlaces.find((a) => a.includes("colonia=huicalco"));
    expect(activa).toContain('aria-current="true"');
    expect(huicalco).not.toContain("aria-current");
  });

  // Scenario: quitar el filtro
  it("'Todas las colonias' apunta al listado sin parámetro", async () => {
    const html = await renderListado("servicios-del-hogar", "atempa");
    expect(html).toContain('href="/servicios-del-hogar"');
  });

  // Scenario: filtro con negocios de esa categoría pero no en esa colonia
  it("un filtro sin resultados explica y ofrece quitar el filtro", async () => {
    const html = await renderListado("servicios-del-hogar", "nacozari");
    expect(normalizado(html)).toContain(
      "No encontramos negocios de esta categoría en esa colonia.",
    );
    expect(normalizado(html)).toContain("Ver todas las colonias");
    expect(html).not.toMatch(/<article[\s>]/);
  });

  // Scenario: colonia desconocida en la URL
  it("una colonia inventada se ignora y muestra el listado completo", async () => {
    const html = await renderListado("servicios-del-hogar", "colonia-que-no-existe");
    expect(html.match(/<article[\s>]/g)).toHaveLength(3);
    expect(normalizado(html)).not.toContain(
      "No encontramos negocios de esta categoría en esa colonia.",
    );
  });

  // Scenario: negocio publicado con colonia "Otra" sin normalizar
  it("un publicado con colonia 'Otra' se lista con su texto libre y sin filtro propio", async () => {
    const html = await renderListado("abarrotes-y-comercio");
    expect(html).toContain("Fraccionamiento Los Sauces Imaginarios");
    expect(html).toContain("Abarrotes La Esperanza Inventada");
    // Sin colonias del catálogo con publicados, no se pinta el filtro
    expect(html).not.toContain("Todas las colonias");
  });
});

describe("directorio-publico · ficha de negocio", () => {
  let htmlCompleta = "";
  let htmlMinima = "";

  beforeAll(async () => {
    htmlCompleta = await renderFicha(
      segmentoDe("7719995009", "Veterinaria Patitas de Mentiras"),
    );
    htmlMinima = await renderFicha(
      segmentoDe("7719995004", "Fonda Doña Cuquita (ficticia)"),
    );
  });

  // Scenario: ficha completa
  it("muestra nombre, sello, qué ofrece, colonia, dirección y horario", () => {
    expect(htmlCompleta.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlCompleta).toContain("Veterinaria Patitas de Mentiras");
    expect(htmlCompleta).toContain("Negocio verificado");
    expect(htmlCompleta).toContain("Consultas, vacunas y desparasitación.");
    expect(htmlCompleta).toContain("Olmos / Ampliación Olmos");
    expect(htmlCompleta).toContain(
      "Frente al jardín del fraccionamiento (referencia inventada)",
    );
    expect(htmlCompleta).toContain("L-S 9am-7pm");
  });

  // Scenario: ficha de un negocio que solo llenó lo obligatorio
  it("la ficha mínima no deja secciones vacías ni etiquetas sin contenido", () => {
    expect(htmlMinima).toContain("Fonda Doña Cuquita (ficticia)");
    expect(htmlMinima).toContain("Negocio verificado");
    expect(htmlMinima).toContain("Tizayuca Centro");
    expect(htmlMinima).toContain("Enviar WhatsApp");
    expect(htmlMinima).not.toContain("Horario");
    expect(htmlMinima).not.toContain("A domicilio");
    expect(htmlMinima).not.toContain("No disponible");
    expect(htmlMinima).not.toContain("<p></p>");
  });

  // Scenario: WhatsApp como acción principal
  it("'Enviar WhatsApp' es el único botón con el verde de acción", () => {
    expect(htmlCompleta).toContain("Enviar WhatsApp");
    expect(htmlCompleta).toContain("https://wa.me/527719995009?text=");
    expect(htmlCompleta.match(/bg-accion\b/g)).toHaveLength(1);
  });

  // Scenario: botones que dependen de lo registrado
  it("muestra 'Llamar' y 'Cómo llegar' solo cuando el negocio los registró", async () => {
    expect(htmlCompleta).toContain('href="tel:+527717775009"'); // normalizado (M2)
    expect(htmlCompleta).toContain("Cómo llegar");
    expect(htmlCompleta).toContain("https://www.google.com/maps/search/");
    // Scenario: negocio sin teléfono ni dirección
    expect(htmlMinima).not.toContain("tel:");
    expect(htmlMinima).not.toContain("Cómo llegar");

    // Con teléfono y dirección pero sin página registrada
    const conTelefonoSinPagina = await renderFicha(
      segmentoDe("7719995002", "Electricidad Rápida JR (ficticio)"),
    );
    expect(conTelefonoSinPagina).toContain('href="tel:+527717775002"');
    expect(conTelefonoSinPagina).toContain("Cómo llegar");
    expect(conTelefonoSinPagina).not.toContain("Ver su página");
  });

  // Scenario: los botones muestran la acción, no el número
  it("el botón de llamar dice la acción, no el teléfono", () => {
    expect(htmlCompleta).toContain(">Llamar</a>");
    expect(normalizado(htmlCompleta)).not.toContain(">7717775009<");
  });

  // Hallazgo M2 de la etapa C: el `tel:` sale normalizado, y lo que no es un
  // número marcable no se convierte en un botón que marca cualquier cosa.
  it("un fijo guardado con formato feo se marca igual, ya normalizado", async () => {
    const html = await renderFicha(
      segmentoDe("7719995013", "Peluquería Formato Feo (ficticia)"),
    );
    expect(html).toContain('href="tel:+527717775013"');
    expect(html).toContain(">Llamar</a>");
    // Ni paréntesis, ni guiones, ni espacios dentro del href
    expect(html).not.toContain('href="tel:+52 ');
    expect(html).not.toMatch(/href="tel:[^"]*[()\s-]/);
  });

  it("un fijo que no se puede marcar se muestra como texto, sin botón 'Llamar'", async () => {
    const html = await renderFicha(
      segmentoDe("7719995014", "Salón Teléfono Raro (ficticio)"),
    );
    expect(html).not.toContain("tel:");
    expect(html).not.toContain(">Llamar</a>");
    // Lo que el negocio registró no se pierde: se muestra como dato, no como acción
    expect(normalizado(html)).toContain("771 777 5014 ext. 12");
  });

  // Scenario: el enlace a la página registrada no promete Facebook
  it("el enlace a la página registrada muestra su dominio real", async () => {
    const html = await renderFicha(
      segmentoDe("7719995006", "Academia de Futbol Halcones (ficticia)"),
    );
    expect(html).toContain("halcones-ficticios.example.mx");
    expect(html).not.toContain("Facebook");
    expect(html).toContain('href="https://halcones-ficticios.example.mx/perfil"');
  });

  // Scenario: enlace viejo tras un cambio de nombre
  it("una URL con la parte legible vieja sigue abriendo la ficha", async () => {
    const id = idPorWhatsapp["7719995004"];
    const html = await renderFicha(`nombre-viejo-que-ya-no-existe-${id}`);
    expect(html).toContain("Fonda Doña Cuquita (ficticia)");
  });

  // Scenario: ficha inexistente + Scenario: ficha de un negocio no publicado
  it("un negocio inexistente y uno sin publicar dan exactamente el mismo 404", async () => {
    const inexistente = await digestDe(renderFicha("negocio-inventado-noexiste123"));
    const enRevision = await digestDe(
      renderFicha(segmentoDe("7719995011", "Barbería El Buen Corte Imaginario")),
    );
    const rechazado = await digestDe(
      renderFicha(segmentoDe("7719995012", "Taller Fantasma Rechazado")),
    );
    expect(inexistente).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(enRevision).toBe(inexistente);
    expect(rechazado).toBe(inexistente);
  });

  it("un segmento sin identificador tampoco filtra nada", async () => {
    expect(await digestDe(renderFicha("-"))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("directorio-publico · privacidad de lo publicado (tasks #18)", () => {
  const camposInternos = [
    "en_revision",
    "rechazado",
    "publicado",
    "siembra",
    "organico",
    "registradoEn",
    "consintioAvisoEn",
    "tokenGestion",
    "2026-07-31", // fecha de registro y de consentimiento sembrada
  ];

  // Scenario: sin datos internos en la respuesta
  it("ni el listado ni la ficha traen estado, origen, fechas internas ni token", async () => {
    const listado = await renderListado("servicios-del-hogar");
    const ficha = await renderFicha(
      segmentoDe("7719995009", "Veterinaria Patitas de Mentiras"),
    );
    for (const campo of camposInternos) {
      expect(listado, campo).not.toContain(campo);
      expect(ficha, campo).not.toContain(campo);
    }
  });

  // Scenario: negocio sin dirección capturada
  it("un negocio que solo registró colonia no muestra ninguna otra ubicación", async () => {
    const html = await renderFicha(
      segmentoDe("7719995005", "Estética Glamour de Mentiras"),
    );
    expect(html).toContain("Haciendas de Tizayuca");
    expect(html).not.toContain("Cómo llegar");
    expect(html).not.toContain("google.com/maps");
  });

  // Scenario: negocio con referencias capturadas
  it("las referencias se muestran tal como las escribió el negocio", async () => {
    const html = await renderFicha(
      segmentoDe("7719995001", "Plomería Hermanos Rosales (ficticio)"),
    );
    expect(html).toContain("A un lado de la primaria, calle Morelos");
    // El mapa busca esa referencia con su colonia, sin inventar domicilio
    expect(html).toContain(
      encodeURIComponent(
        "A un lado de la primaria, calle Morelos, Huicalco, Tizayuca, Hidalgo",
      ),
    );
  });
});

describe("layout-base · página 404 en español (tasks #6)", () => {
  const html404 = renderToStaticMarkup(createElement(NotFoundPage));

  // Scenario: URL desconocida
  it("trae los tres textos literales de la spec", () => {
    expect(normalizado(html404)).toContain("No encontramos esta página");
    expect(normalizado(html404)).toContain(
      "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita.",
    );
    expect(normalizado(html404)).toContain("Ir al inicio");
  });

  // Scenario: la 404 no es una página en inglés ni un volcado técnico
  it("su único enlace lleva a la home y no hay detalles técnicos", () => {
    const hrefs = [...html404.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/"]);
    expect(html404).not.toMatch(/404|Error|error|stack|Not Found/);
  });
});

describe("directorio-publico · Server Components sin JS de cliente", () => {
  // Scenario: sin JS de cliente nuevo
  it('ningún archivo del directorio declara "use client"', () => {
    const archivos = [
      join(raiz, "src/app/page.tsx"),
      join(raiz, "src/app/not-found.tsx"),
      join(raiz, "src/app/[destino]/page.tsx"),
      join(raiz, "src/app/negocio/[ficha]/page.tsx"),
      ...readdirSync(join(raiz, "src/components/directorio")).map((nombre) =>
        join(raiz, "src/components/directorio", nombre),
      ),
    ];
    expect(archivos.length).toBeGreaterThanOrEqual(9);
    for (const ruta of archivos) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/["']use client["']/);
    }
  });

  // Scenario: celular a 390px (lo automatizable del "sin scroll horizontal":
  // todo texto que escribe el negocio puede partirse)
  it("el texto que captura el negocio se parte en vez de desbordar la pantalla", () => {
    const tarjeta = readFileSync(
      join(raiz, "src/components/directorio/tarjeta-negocio.tsx"),
      "utf8",
    );
    const ficha = readFileSync(join(raiz, "src/app/negocio/[ficha]/page.tsx"), "utf8");
    const botones = readFileSync(
      join(raiz, "src/components/directorio/botones-contacto.tsx"),
      "utf8",
    );
    expect(tarjeta.match(/\bbreak-words\b/g)?.length).toBeGreaterThanOrEqual(2);
    expect(ficha.match(/\bbreak-words\b/g)?.length).toBeGreaterThanOrEqual(5);
    expect(botones).toMatch(/\bbreak-all\b/); // el dominio de la página registrada
  });

  // Scenario: celular a 390px (lo automatizable: área táctil reservada)
  it("todo lo tocable del directorio reserva al menos 44px", () => {
    const tarjeta = readFileSync(
      join(raiz, "src/components/directorio/tarjeta-negocio.tsx"),
      "utf8",
    );
    // El marcado del listado salió de la página a su componente cuando la raíz
    // pasó a resolver tres tipos de URL (change `agregar-seo-local`).
    const listado =
      readFileSync(join(raiz, "src/components/directorio/listado-categoria.tsx"), "utf8") +
      readFileSync(
        join(raiz, "src/components/directorio/navegacion-colonias.tsx"),
        "utf8",
      );
    // La grilla de categorías salió de la home a su propio componente (change
    // `agregar-buscador`) para que `/buscar` ofrezca los MISMOS ocho botones.
    const categorias = readFileSync(
      join(raiz, "src/components/directorio/categorias-grid.tsx"),
      "utf8",
    );
    const buscador = readFileSync(
      join(raiz, "src/components/directorio/buscador.tsx"),
      "utf8",
    );
    const botones = readFileSync(join(raiz, "src/lib/estilos-boton.ts"), "utf8");
    expect(botones).toMatch(/\bmin-h-11\b/g);
    expect(listado).toMatch(/\bmin-h-11\b/);
    expect(categorias).toMatch(/\bmin-h-16\b/); // botones grandes de categoría
    expect(buscador).toMatch(/\bmin-h-11\b/); // campo de búsqueda
    expect(tarjeta).toContain("CLASE_BOTON_PRIMARIO");
  });
});
