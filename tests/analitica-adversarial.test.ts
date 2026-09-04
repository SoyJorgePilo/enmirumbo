import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import BuscarPage, {
  TITULO_BUSCAR,
  metadata as metadataBuscar,
} from "../src/app/(publico)/buscar/page";
import LayoutPublico from "../src/app/(publico)/layout";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import { ScriptAnalitica } from "../src/components/analitica/script-analitica";
import { TarjetaNegocio } from "../src/components/directorio/tarjeta-negocio";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  VARIABLE_SRC,
  VARIABLE_WEBSITE_ID,
  configuracionAnalitica,
  motivoConfiguracionIncompleta,
  reiniciarAvisoDeAnalitica,
} from "../src/lib/analitica/config";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad y pruebas) del change `agregar-analitica-cookieless`.
 *
 * Esta suite NO repite el camino feliz de la etapa B: ataca los tres bordes
 * donde este change puede filtrar algo a un TERCERO.
 *
 * 1. **La variable hostil.** `NEXT_PUBLIC_UMAMI_SRC` la escribe quien
 *    despliega, pero termina como `src` de un `<script>` en todas las páginas
 *    públicas: si un valor raro pasara la validación, el sitio cargaría
 *    JavaScript ajeno o rompería el atributo.
 * 2. **El dato del negocio disfrazado de slug.** La regla de privacidad se
 *    prueba normalmente con texto que "se ve" libre ("atrás del panteón"). Lo
 *    interesante es el texto libre que YA parece un slug del catálogo
 *    (`haciendas-de-tizayuca`) o el nombre con guiones y número dentro: ahí un
 *    saneado por forma no distingue nada, y lo único que salva es el cableado
 *    (que `coloniaOtra` no alimente jamás la propiedad).
 * 3. **La superficie que se mide sin querer.** Una página pública creada fuera
 *    del grupo `(publico)` queda sin medir, y —al revés— cualquier página
 *    futura que entre al grupo se mide sola. La spec declara las dos cosas.
 *
 * Todos los datos son ficticios (repo público + LFPDPPP): la serie `7719890`
 * es exclusiva de este archivo y se borra al terminar.
 */

const raiz = join(__dirname, "..");
const PREFIJO = "7719890";

const SRC_VALIDO = "https://cloud.umami.is/script.js";
const ID_VALIDO = "00000000-0000-4000-8000-000000000000";

/**
 * Negocio trampa: su colonia de texto libre YA tiene forma de slug del
 * catálogo y su nombre lleva guiones y su propio número dentro. Si el contrato
 * de eventos saneara "por forma" en vez de por origen del dato, los dos
 * pasarían el filtro sin que se note.
 */
const NEGOCIO_TRAMPA = {
  nombre: `Cerrajeria-24h-${PREFIJO}321-ficticia`,
  whatsapp: `${PREFIJO}321`,
  // Texto libre que parece un slug del catálogo (y no lo es).
  coloniaOtra: "haciendas-de-tizayuca",
  queOfreces: "Aperturas inventadas para la auditoria adversarial.",
};

let prisma: PrismaClient;
let idTrampa = "";

function conMedicion(): void {
  process.env[VARIABLE_SRC] = SRC_VALIDO;
  process.env[VARIABLE_WEBSITE_ID] = ID_VALIDO;
}

function sinMedicion(): void {
  delete process.env[VARIABLE_SRC];
  delete process.env[VARIABLE_WEBSITE_ID];
}

async function render(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(createElement(() => resuelta));
}

/** La página dentro del tronco público: lo que el vecino recibe de verdad. */
async function renderEnElTroncoPublico(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(
    createElement(LayoutPublico, { children: resuelta } as never),
  );
}

/** Cada atributo `data-umami-event*` del HTML, como pares nombre/valor. */
function atributosDeMedicion(html: string): Array<[string, string]> {
  return [...html.matchAll(/(data-umami-event(?:-[a-z-]+)?)="([^"]*)"/g)].map((m) => [
    m[1],
    m[2],
  ]);
}

/** Rutas de todos los `page.tsx` de `src/app`, relativas a la raíz del repo. */
function paginasDeLaApp(dir = join(raiz, "src/app")): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) rutas.push(...paginasDeLaApp(ruta));
    else if (entrada.name === "page.tsx") rutas.push(ruta.slice(raiz.length));
  }
  return rutas;
}

beforeAll(async () => {
  sinMedicion();
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await seedCatalogos(prisma);
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "servicios-del-hogar" },
  });

  const creado = await prisma.negocio.create({
    data: {
      nombre: NEGOCIO_TRAMPA.nombre,
      whatsapp: NEGOCIO_TRAMPA.whatsapp,
      categoriaId: categoria.id,
      coloniaId: null,
      coloniaOtra: NEGOCIO_TRAMPA.coloniaOtra,
      queOfreces: NEGOCIO_TRAMPA.queOfreces,
      entregaADomicilio: false,
      estado: "publicado",
      origen: "siembra",
      publicadoEn: new Date("2026-08-21T10:00:00.000Z"),
      consintioAvisoEn: new Date("2026-08-20T10:00:00.000Z"),
      ...datosDeBusqueda(NEGOCIO_TRAMPA.nombre, NEGOCIO_TRAMPA.queOfreces),
    },
    select: { id: true },
  });
  idTrampa = creado.id;

  // Dos negocios que NO están publicados: nada suyo puede salir medido.
  for (const [sufijo, estado] of [
    ["322", "en_revision"],
    ["323", "rechazado"],
  ] as const) {
    const nombre = `Taller sin publicar ${sufijo} (ficticio)`;
    await prisma.negocio.create({
      data: {
        nombre,
        whatsapp: `${PREFIJO}${sufijo}`,
        categoriaId: categoria.id,
        coloniaId: null,
        coloniaOtra: "colonia-inventada-del-borrador",
        entregaADomicilio: false,
        estado,
        origen: "organico",
        consintioAvisoEn: new Date("2026-08-20T10:00:00.000Z"),
        ...datosDeBusqueda(nombre, "cerrajeria aperturas inventadas"),
      },
    });
  }
});

afterAll(async () => {
  sinMedicion();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

afterEach(() => {
  sinMedicion();
  reiniciarAvisoDeAnalitica();
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
// 1. La variable de entorno hostil
// ───────────────────────────────────────────────────────────────────────────

describe("analitica adversarial · el `src` del proveedor solo puede ser https", () => {
  const completo = { [VARIABLE_SRC]: SRC_VALIDO, [VARIABLE_WEBSITE_ID]: ID_VALIDO };

  // Ampliación adversarial del scenario "configuración a medias": esquemas que
  // NO son https y formas que un `startsWith("https://")` habría dejado pasar.
  it.each([
    ["data: con JavaScript dentro", "data:text/javascript,alert(1)"],
    ["data: con base64", "data:application/javascript;base64,YWxlcnQoMSk="],
    ["esquema relativo al protocolo", "//cdn.ajeno.example/script.js"],
    ["javascript: con mayúsculas", "JavaScript:alert(document.cookie)"],
    ["javascript: con espacios delante", "   javascript:alert(1)"],
    ["file: local", "file:///etc/passwd"],
    ["ftp:", "ftp://ajeno.example/script.js"],
    ["blob:", "blob:https://ajeno.example/1234"],
    ["solo el esquema", "https://"],
    ["cadena vacía disfrazada", "   "],
    ["ruta absoluta del sitio", "/script.js"],
    ["subida de directorio", "../../script.js"],
    ["salto de línea entre esquema y host", "http\n://cloud.umami.is/script.js"],
  ])("rechaza %s sin romper la página", (_caso, src) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(configuracionAnalitica({ ...completo, [VARIABLE_SRC]: src })).toBeNull();
    expect(motivoConfiguracionIncompleta({ ...completo, [VARIABLE_SRC]: src })).toContain(
      VARIABLE_SRC,
    );

    process.env[VARIABLE_SRC] = src;
    process.env[VARIABLE_WEBSITE_ID] = ID_VALIDO;
    expect(renderToStaticMarkup(createElement(ScriptAnalitica))).toBe("");
  });

  it("un `..` en la ruta no engaña a la validación: sigue siendo el host de https", () => {
    // La subida de directorio se normaliza; lo que manda es el ORIGEN, y ese
    // lo elige quien despliega (hallazgo M-3: no hay lista blanca de dominio).
    const configuracion = configuracionAnalitica({
      ...completo,
      [VARIABLE_SRC]: "https://cloud.umami.is/../../script.js",
    });
    expect(configuracion?.src).toBe("https://cloud.umami.is/../../script.js");
  });

  it("el aviso del log nunca repite lo que se configuró mal", () => {
    const avisos: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    configuracionAnalitica({
      ...completo,
      [VARIABLE_SRC]: "http://interno.example/script.js?token=nunca-en-el-log",
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).not.toContain("token");
    expect(avisos[0]).not.toContain("interno.example");
  });
});

describe("analitica adversarial · un valor hostil no puede romper la etiqueta", () => {
  // Scenario: con las dos variables se carga el script del proveedor — pero el
  // valor lo escribe un humano y puede venir con comillas y marcado dentro.
  it("comillas y marcado en el `src` salen escapados, no como HTML", () => {
    process.env[VARIABLE_SRC] =
      'https://ajeno.example/a.js"></script><script>alert(1)</script>';
    process.env[VARIABLE_WEBSITE_ID] = ID_VALIDO;
    const html = renderToStaticMarkup(createElement(ScriptAnalitica));

    expect([...html.matchAll(/<script\b/g)]).toHaveLength(1);
    expect(html).not.toContain("alert(1)</script>");
    expect(html).toContain("&quot;");
  });

  it("un identificador de sitio hostil se queda dentro de su atributo", () => {
    process.env[VARIABLE_SRC] = SRC_VALIDO;
    process.env[VARIABLE_WEBSITE_ID] = '" onload="alert(1)" data-x="';
    const html = renderToStaticMarkup(createElement(ScriptAnalitica));

    expect([...html.matchAll(/<script\b/g)]).toHaveLength(1);
    // El `onload` sobrevive como TEXTO escapado dentro del valor; lo que no
    // puede pasar es que se convierta en un atributo de verdad.
    const atributos = [...html.matchAll(/[\s<]([a-z][a-z-]*)="/g)].map((m) => m[1]);
    expect(atributos).toEqual([
      "defer",
      "src",
      "data-website-id",
      "data-exclude-search",
    ]);
    expect(html).toContain("&quot;");
  });

  it("no hay una segunda forma de inyectar scripts: el tronco público pinta uno solo", async () => {
    conMedicion();
    const html = await renderEnElTroncoPublico(
      ListadoCategoriaPage({
        params: Promise.resolve({ destino: "servicios-del-hogar" }),
        searchParams: Promise.resolve({}),
      }),
    );
    const externos = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
    expect(externos).toEqual([SRC_VALIDO]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. El dato del negocio disfrazado de slug
// ───────────────────────────────────────────────────────────────────────────

describe("analitica adversarial · texto libre que YA parece un slug", () => {
  // Scenario: negocio con colonia "Otra" sin normalizar — versión hostil: el
  // texto libre pasaría cualquier saneado "por forma".
  it("una colonia libre escrita como slug del catálogo sigue viajando como 'otra'", async () => {
    const html = await render(
      FichaNegocioPage({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(NEGOCIO_TRAMPA.nombre, idTrampa),
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    const colonias = atributosDeMedicion(html)
      .filter(([nombre]) => nombre === "data-umami-event-colonia")
      .map(([, valor]) => valor);
    expect(colonias.length).toBeGreaterThan(0);
    expect(new Set(colonias)).toEqual(new Set(["otra"]));
    // El texto libre se ve en la ficha (es su colonia), pero no se mide.
    expect(html).toContain(NEGOCIO_TRAMPA.coloniaOtra);
    for (const [, valor] of atributosDeMedicion(html)) {
      expect(valor).not.toContain("haciendas");
    }
  });

  // Scenario: ningún dato del negocio dentro de un atributo de medición —
  // versión hostil: el nombre trae guiones y el número de WhatsApp dentro.
  it.each(["listado", "resultados", "ficha"])(
    "en %s el nombre con forma de slug y con el WhatsApp dentro no se mide",
    async (pagina) => {
      const html =
        pagina === "listado"
          ? await render(
              ListadoCategoriaPage({
                params: Promise.resolve({ destino: "servicios-del-hogar" }),
                searchParams: Promise.resolve({}),
              }),
            )
          : pagina === "resultados"
            ? await render(
                BuscarPage({
                  searchParams: Promise.resolve({ q: "cerrajeria" }),
                } as unknown as Parameters<typeof BuscarPage>[0]),
              )
            : await render(
                FichaNegocioPage({
                  params: Promise.resolve({
                    ficha: construirSegmentoFicha(NEGOCIO_TRAMPA.nombre, idTrampa),
                  }),
                  searchParams: Promise.resolve({}),
                }),
              );

      const atributos = atributosDeMedicion(html);
      expect(atributos.length).toBeGreaterThan(0);
      for (const [nombre, valor] of atributos) {
        for (const prohibido of [
          NEGOCIO_TRAMPA.nombre.toLowerCase(),
          NEGOCIO_TRAMPA.whatsapp,
          PREFIJO,
          "cerrajeria",
          "24h",
          idTrampa.toLowerCase(),
        ]) {
          expect(valor.toLowerCase(), `${nombre} filtró "${prohibido}"`).not.toContain(
            prohibido,
          );
        }
      }
    },
  );

  it("un negocio sin publicar no aporta ni un atributo de medición", async () => {
    const listado = await render(
      ListadoCategoriaPage({
        params: Promise.resolve({ destino: "servicios-del-hogar" }),
        searchParams: Promise.resolve({}),
      }),
    );
    const resultados = await render(
      BuscarPage({
        searchParams: Promise.resolve({ q: "cerrajeria" }),
      } as unknown as Parameters<typeof BuscarPage>[0]),
    );
    for (const html of [listado, resultados]) {
      expect(html).not.toContain("Taller sin publicar");
      expect(html).not.toContain("colonia-inventada-del-borrador");
      for (const [, valor] of atributosDeMedicion(html)) {
        expect(valor).not.toContain("colonia-inventada");
      }
    }
  });

  it("la categoría del evento no puede faltar: el esquema la exige", () => {
    const esquema = readFileSync(join(raiz, "prisma/schema.prisma"), "utf8");
    // `categoriaId Int` (sin `?`): por eso `categoriaSlug` de la proyección
    // nunca es nulo y no hay negocio "sin categoría" que medir en /buscar.
    expect(esquema).toMatch(/categoriaId\s+Int(?!\?)/);
  });

  it("props hostiles directas a la tarjeta se convierten en 'otra', sin marcado", () => {
    const html = renderToStaticMarkup(
      createElement(TarjetaNegocio, {
        nombre: 'Negocio "raro" <b>ficticio</b>',
        coloniaNombre: "Otra",
        categoriaSlug: '"><script>alert(1)</script>',
        coloniaSlug: "  Colonia Ñ 😀  ",
        entregaADomicilio: false,
        fotoClave: null,
        hrefFicha: "/negocio/x-1",
        hrefWhatsapp: "https://wa.me/5215500000000",
      }),
    );

    expect(html).not.toContain("<script");
    for (const [, valor] of atributosDeMedicion(html)) {
      expect(valor).toMatch(/^[a-z0-9-]+$/);
    }
    expect(html).toContain('data-umami-event-categoria="otra"');
    expect(html).toContain('data-umami-event-colonia="otra"');
  });
});

describe("analitica adversarial · lo que escribe el vecino en /buscar", () => {
  const CONSULTA_HOSTIL =
    'divorcio "urgente" <b>abogado</b> 7711234567 ünïcode 😀 \u202eoculto';

  // Scenario: lo que escribe el vecino no viaja. El HTML servido de
  // /buscar?q=… tiene que pedir al tracker que quite la cadena de consulta, y
  // el texto no puede aparecer en ningún atributo de medición.
  it("el HTML servido pide excluir la cadena de consulta y no mide el texto", async () => {
    conMedicion();
    const html = await renderEnElTroncoPublico(
      BuscarPage({
        searchParams: Promise.resolve({ q: CONSULTA_HOSTIL }),
      } as unknown as Parameters<typeof BuscarPage>[0]),
    );

    const etiquetas = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(etiquetas).toHaveLength(1);
    expect(etiquetas[0]).toContain('data-exclude-search="true"');
    expect(etiquetas[0]).not.toContain("divorcio");

    for (const [nombre, valor] of atributosDeMedicion(html)) {
      for (const trozo of ["divorcio", "abogado", "7711234567", "unicode", "ünïcode"]) {
        expect(valor.toLowerCase(), `${nombre} filtró "${trozo}"`).not.toContain(
          trozo.toLowerCase(),
        );
      }
    }
  });

  it("la consulta tampoco se cuela por el título de la página (el tracker manda `document.title`)", () => {
    // El tracker del proveedor incluye `title: document.title` en cada envío,
    // así que `data-exclude-search` NO alcanza si el título llegara a llevar
    // la consulta ("Resultados para «q» — …").
    //
    // Cerrado en la iteración 2 (M-2): /buscar ya no se apoya en "no tiene
    // título propio, hereda el del layout" —lo que T-009 rompería sin
    // enterarse— sino que declara un título ESTÁTICO explícito, con el porqué
    // escrito al lado. Este caso vigila que siga siendo estático.
    const fuente = readFileSync(join(raiz, "src/app/(publico)/buscar/page.tsx"), "utf8");
    expect(fuente).not.toContain("generateMetadata");
    expect(fuente).toMatch(/export const metadata: Metadata = \{\s*title: TITULO_BUSCAR,\s*robots:/);
    expect(TITULO_BUSCAR).toBe("Buscar — NecesitoUno Tizayuca");
    // El título no depende de nada que escriba el vecino.
    expect(metadataBuscar.title).toBe(TITULO_BUSCAR);
    for (const trozo of ["q", "consulta", "resultados para"]) {
      expect(String(metadataBuscar.title).toLowerCase()).not.toContain(trozo + " ");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Qué superficie se mide y cuál no
// ───────────────────────────────────────────────────────────────────────────

describe("analitica adversarial · el grupo (publico) es la frontera de la medición", () => {
  // Scenario: una página pública nueva sí queda medida. La etapa B verificó lo
  // contrario (que /admin no entre al grupo); esto cierra el círculo: toda
  // página que no sea del panel vive dentro del tronco que mide.
  it("toda página del sitio vive o en el grupo (publico) o en /admin", () => {
    const paginas = paginasDeLaApp();
    expect(paginas.length).toBeGreaterThanOrEqual(13);
    for (const pagina of paginas) {
      expect(
        pagina.startsWith("/src/app/(publico)/") || pagina.startsWith("/src/app/admin/"),
        `${pagina} no está ni en el tronco medido ni en el panel excluido`,
      ).toBe(true);
    }
  });

  it("la 404 vive fuera del grupo (efecto lateral aceptado en el diseño)", () => {
    expect(readdirSync(join(raiz, "src/app"))).toContain("not-found.tsx");
    expect(readdirSync(join(raiz, "src/app/(publico)"))).not.toContain("not-found.tsx");
    expect(readFileSync(join(raiz, "src/app/not-found.tsx"), "utf8")).not.toContain(
      "Analitica",
    );
  });

  it("sin configuración el tronco público no deja ni rastro del proveedor", async () => {
    sinMedicion();
    const html = await renderEnElTroncoPublico(
      FichaNegocioPage({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(NEGOCIO_TRAMPA.nombre, idTrampa),
        }),
        searchParams: Promise.resolve({}),
      }),
    );
    // Lo que la spec prohíbe sin configuración es el script HACIA UN DOMINIO
    // EXTERNO ("el navegador no pide nada fuera del sitio"): cero `<script>`
    // con `src`. La ficha sí trae un `<script type="application/ld+json">`
    // desde el change `agregar-seo-local` —es el Schema.org que Google lee—:
    // no carga nada, no ejecuta nada y no sale del sitio. Se fija aquí cuál es
    // el único inline permitido, para que un `<script>` de verdad no se cuele
    // aprovechando la excepción.
    expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
    const inlines = [...html.matchAll(/<script\b[^>]*>/g)].map(([etiqueta]) => etiqueta);
    for (const etiqueta of inlines) {
      expect(etiqueta, etiqueta).toContain('type="application/ld+json"');
    }
    expect(html).not.toContain("umami.is");
    expect(html).not.toContain("data-website-id");
  });
});
