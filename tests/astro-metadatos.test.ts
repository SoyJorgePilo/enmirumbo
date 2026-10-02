/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023),
 * requirement "Los metadatos de cada página son los mismos que emitía Next".
 * tasks.md #6; design.md §3.
 *
 * La expectativa NO está escrita a mano: son los `<head>` que emitió la build
 * de Next de `main` (`tests/fixtures/next-head/`, capturados con
 * `node scripts/diff-html.mjs --capturar-head`, base semilla ficticia), con y
 * sin `SITIO_URL`. Se compara el CONJUNTO de etiquetas (el orden no se exige),
 * ya normalizado por el núcleo del diff: sin hojas de estilo y con `?<hash>`
 * en la imagen y el icono.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extraerPagina } from "../scripts/diff-html/nucleo.mjs";
import {
  type Etiqueta,
  type MetadatosDePagina,
  etiquetasAHtml,
  resolverMetadatos,
} from "../src/astro/metadatos";
import {
  DESCRIPCION_AVISO_PRIVACIDAD,
  DESCRIPCION_TERMINOS,
  TITULO_AVISO_PRIVACIDAD,
  TITULO_TERMINOS,
} from "../src/lib/legales/textos";
import { imagenesDeMarca, metadataDelSitio } from "../src/lib/seo/metadata";

const raiz = join(__dirname, "..");
const URL_SITIO = "https://enmirumbo.example";

const ENTORNOS = {
  "con-sitio-url": { NODE_ENV: "production", SITIO_URL: URL_SITIO },
  "sin-sitio-url": { NODE_ENV: "production" },
} as const;

type Caso = "home" | "aviso-de-privacidad" | "terminos" | "404";

/** Los metadatos que declara cada página, igual que en `src/pages/`. */
function paginaDe(caso: Caso, env: Record<string, string>): MetadatosDePagina | undefined {
  switch (caso) {
    case "home":
      return undefined;
    case "aviso-de-privacidad":
      return { title: TITULO_AVISO_PRIVACIDAD, description: DESCRIPCION_AVISO_PRIVACIDAD };
    case "terminos":
      return { title: TITULO_TERMINOS, description: DESCRIPCION_TERMINOS };
    case "404":
      return { openGraph: { images: imagenesDeMarca(env) } };
  }
}

function resolver(caso: Caso, env: Record<string, string>): Etiqueta[] {
  return resolverMetadatos({
    sitio: metadataDelSitio(env),
    pagina: paginaDe(caso, env),
    noEncontrado: caso === "404",
    versionImagenDeMarca: "0123456789abcdef",
    versionIcono: "fedcba9876543210",
  });
}

const comoPagina = (head: string) => `<!DOCTYPE html><html><head>${head}</head><body></body></html>`;

function conjuntoDe(head: string) {
  const { titulo, metas, enlacesDelHead } = extraerPagina(comoPagina(head));
  return {
    titulo,
    metas,
    // Las hojas de estilo son del marco; aquí solo cuentan canónica e icono.
    enlaces: enlacesDelHead.filter((e: string) => !e.includes("rel=stylesheet")),
  };
}

const CASOS: Caso[] = ["home", "aviso-de-privacidad", "terminos", "404"];

describe("plataforma-astro · metadatos iguales a los de Next (fixtures de la build de main)", () => {
  for (const [variante, env] of Object.entries(ENTORNOS)) {
    for (const caso of CASOS) {
      it(`${caso}, ${variante}: mismo título, mismas <meta> y mismos <link>`, () => {
        const esperado = readFileSync(join(raiz, "tests/fixtures/next-head", variante, `${caso}.html`), "utf8");
        const obtenido = etiquetasAHtml(resolver(caso, { ...env }));
        expect(conjuntoDe(obtenido)).toEqual(conjuntoDe(esperado));
      });
    }
  }
});

describe("plataforma-astro · metadatos, scenarios", () => {
  const env = { ...ENTORNOS["con-sitio-url"] };
  const html = (caso: Caso, e: Record<string, string> = env) => etiquetasAHtml(resolver(caso, e));

  it("la home conserva el título del sitio y no pide no indexarse", () => {
    expect(html("home")).toContain("<title>EnMiRumbo — Encuentra negocios y servicios en Tizayuca</title>");
    expect(html("home")).not.toContain('name="robots"');
  });

  it("la vista previa heredada trae la imagen de marca con su versión y sus medidas", () => {
    const home = html("home");
    expect(home).toContain(`<meta property="og:image" content="${URL_SITIO}/opengraph-image?0123456789abcdef">`);
    expect(home).toContain('<meta property="og:image:width" content="1200">');
    expect(home).toContain('<meta property="og:image:height" content="630">');
    expect(home).toContain('<meta property="og:image:type" content="image/png">');
    expect(home).toContain(
      '<meta property="og:image:alt" content="EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp">',
    );
  });

  it("la 404 pide no indexarse y declara la imagen absoluta sin versión", () => {
    const pagina = html("404");
    expect(pagina).toContain('<meta name="robots" content="noindex">');
    expect(pagina).toContain(`<meta property="og:image" content="${URL_SITIO}/opengraph-image">`);
    expect(pagina).not.toContain("opengraph-image?");
  });

  it("producción sin URL pública: ninguna URL absoluta ni localhost", () => {
    for (const caso of CASOS) {
      const pagina = html(caso, { ...ENTORNOS["sin-sitio-url"] });
      expect(pagina, caso).not.toContain("localhost");
      expect(pagina, caso).not.toMatch(/content="https?:/);
      expect(pagina, caso).not.toContain('rel="canonical"');
    }
  });

  it("la canónica y el robots de una página se pintan como en Next", () => {
    const etiquetas = resolverMetadatos({
      sitio: metadataDelSitio(env),
      pagina: {
        title: "Plomería en Tizayuca",
        alternates: { canonical: `${URL_SITIO}/plomeria` },
        robots: { index: false, follow: true },
      },
      versionImagenDeMarca: "v",
      versionIcono: "i",
    });
    const pagina = etiquetasAHtml(etiquetas);
    expect(pagina).toContain(`<link rel="canonical" href="${URL_SITIO}/plomeria">`);
    expect(pagina).toContain('<meta name="robots" content="noindex, follow">');
    expect(pagina).toContain("<title>Plomería en Tizayuca — EnMiRumbo</title>");
  });

  it("escapa lo que no es marcado", () => {
    const pagina = etiquetasAHtml(
      resolverMetadatos({
        sitio: metadataDelSitio(env),
        pagina: { title: '<script>"x"</script>', description: 'a"b<c' },
        versionImagenDeMarca: "v",
        versionIcono: "i",
      }),
    );
    expect(pagina).not.toContain("<script>");
    expect(pagina).toContain('content="a&quot;b&lt;c"');
  });
});
