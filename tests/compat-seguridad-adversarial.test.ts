/**
 * Pruebas adversariales de la capa de compatibilidad (change
 * `agregar-andamio-astro`, T-022; etapa C · seguridad).
 *
 * `Link` e `Imagen` reemplazan a `next/link` y `next/image`. Estas pruebas
 * comprueban que, ante `href`/`src` hostiles, la capa propia no es más
 * permisiva que Next: React 19 bloquea `javascript:` en ambos casos, escapa
 * atributos y texto, y `Imagen` nunca reescribe el `src` hacia un optimizador
 * o proxy del servidor (sin SSRF: el servidor no descarga nada, el `src` se
 * pinta tal cual y lo pide el navegador).
 *
 * Todos los datos son ficticios.
 */
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NextImage from "next/image";
import NextLink from "next/link";
import { describe, expect, it } from "vitest";

import { Imagen } from "@/components/compat/imagen";
import { Link } from "@/components/compat/link";

const pintar = renderToStaticMarkup;
const BLOQUEO_REACT = "javascript:throw new Error(";

const HREF_JAVASCRIPT = [
  "javascript:alert(1)",
  " JaVaScRiPt:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "\u0001javascript:alert(1)",
];

describe("compat · Link ante href hostiles", () => {
  it.each(HREF_JAVASCRIPT)("bloquea %j igual que next/link", (href) => {
    const propio = pintar(h(Link, { href }, "Ver"));
    expect(propio).toBe(pintar(h(NextLink, { href }, "Ver")));
    expect(propio).toContain(`href="${BLOQUEO_REACT}`);
    expect(propio).not.toContain("alert(1)");
  });

  it("un href que intenta cerrar el atributo queda escapado", () => {
    const href = '/negocio/x"><script>alert(1)</script>';
    const propio = pintar(h(Link, { href }, "Ver"));
    expect(propio).toBe(pintar(h(NextLink, { href }, "Ver")));
    expect(propio).not.toContain("<script");
    expect(propio).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("hijos con HTML se pintan como texto, no como marcado", () => {
    const hijo = '<img src=x onerror="alert(1)">Taller Ficticio';
    const propio = pintar(h(Link, { href: "/negocio/taller-ficticio" }, hijo));
    expect(propio).not.toContain("<img");
    expect(propio).toContain("&lt;img");
  });

  // `next/link` tampoco filtra estos: la capa no pierde protección, pero el
  // `href` NO es una frontera de seguridad. Quien construya un href con datos
  // de usuario debe validarlo antes (p. ej. solo http(s) en URLs externas).
  it.each(["//evil.example/x", "/\\evil.example", "vbscript:x", "data:text/html,<b>x</b>"])(
    "no es más permisivo que next/link con %j",
    (href) => {
      expect(pintar(h(Link, { href }, "Ver"))).toBe(pintar(h(NextLink, { href }, "Ver")));
    },
  );

  it("unicode y caracteres reservados en el href se escapan igual que en Next", () => {
    const href = "/plomeria-haciendas-de-tizayuca?q=ñandú&x=<2>&y=‮";
    const propio = pintar(h(Link, { href }, "Ver"));
    expect(propio).toBe(pintar(h(NextLink, { href }, "Ver")));
    expect(propio).toContain("&amp;x=&lt;2&gt;");
  });
});

describe("compat · Imagen ante src hostiles (sin proxy ni SSRF)", () => {
  const props = (src: string, priority = false) => ({
    src,
    alt: 'Foto de "Taller" <Ficticio>',
    fill: true as const,
    unoptimized: true as const,
    priority,
    sizes: "(min-width: 640px) 33vw, 100vw",
    className: "object-cover",
  });

  it.each(["javascript:alert(1)", " JAVASCRIPT:alert(1)"])("bloquea %j igual que next/image", (src) => {
    const propio = pintar(h(Imagen, props(src)));
    expect(propio).toBe(pintar(h(NextImage, props(src))));
    expect(propio).not.toContain("alert(1)");
  });

  it.each([
    "//evil.example/x.webp",
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:5432/",
    "file:///etc/passwd",
  ])("pinta %j tal cual: no lo reescribe a /_image ni /_next/image", (src) => {
    for (const prioridad of [false, true]) {
      const propio = pintar(h(Imagen, props(src, prioridad)));
      expect(propio).toBe(pintar(h(NextImage, props(src, prioridad))));
      expect(propio).not.toMatch(/\/_image|\/_next\/image|srcset/);
    }
  });

  it("un src que intenta inyectar onerror queda escapado dentro del atributo", () => {
    const src = '/api/foto/0123456789abcdef0123456789abcdef/tarjeta" onerror="alert(1)';
    const propio = pintar(h(Imagen, props(src)));
    expect(propio).toBe(pintar(h(NextImage, props(src))));
    // El texto "onerror=" puede aparecer DENTRO del src escapado; lo que no
    // debe existir es un atributo real (comilla sin escapar antes de él).
    expect(propio).not.toMatch(/"\s+onerror=/);
    expect(propio).toContain('tarjeta&quot; onerror=&quot;alert(1)"');
  });

  it("el alt con comillas y etiquetas se escapa", () => {
    const propio = pintar(h(Imagen, props("/api/foto/0123456789abcdef0123456789abcdef/tarjeta")));
    expect(propio).toContain('alt="Foto de &quot;Taller&quot; &lt;Ficticio&gt;"');
  });
});

/**
 * ¿El middleware aplica la regla de origen (`envioDeOtroOrigen`) antes de la
 * tabla de Actions? Se lee el código sin comentarios.
 */
function revisaElOrigenAntesDeLasActions(): boolean {
  const fuente = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const origen = fuente.indexOf("envioDeOtroOrigen(contexto.request.method, contexto.request.headers)");
  const acciones = fuente.indexOf("atenderAcciones(contexto, siguiente)");
  return origen !== -1 && acciones !== -1 && origen < acciones;
}

describe("astro.config.mjs · superficie del andamio", () => {
  const texto = readFileSync(new URL("../astro.config.mjs", import.meta.url), "utf8");

  it("la función solo incluye el certificado público, nada más", async () => {
    const coincidencia = texto.match(/includeFiles:\s*\[([^\]]*)\]/);
    expect(coincidencia).not.toBeNull();
    expect(coincidencia![1].trim()).toBe('"./certs/supabase-root-2021-ca.crt"');
  });

  // Antes: la revisión de origen de Astro NUNCA se apagaba. Desde 3a (change
  // `migrar-formularios-publicos-astro`, design.md §1) se apaga porque su 403
  // sale antes del middleware, en inglés y sin cabeceras; la invariante sigue
  // siendo la misma —el origen SIEMPRE se revisa—, y ahora se exige que, si
  // Astro no la hace, la haga el middleware ANTES de atender cualquier Action.
  it("no expone variables al cliente ni deja el origen sin revisar", () => {
    expect(texto).not.toMatch(/PUBLIC_|envPrefix|import\.meta\.env|process\.env/);
    expect(!/checkOrigin\s*:\s*false/.test(texto) || revisaElOrigenAntesDeLasActions()).toBe(true);
  });

  it("el servicio de imágenes no descarga de dominios externos", async () => {
    const { default: config } = await import("../astro.config.mjs");
    expect(config.image?.service?.entrypoint).toBe("astro/assets/services/noop");
    expect(config.image?.domains ?? []).toEqual([]);
    expect(config.image?.remotePatterns ?? []).toEqual([]);
    expect(config.security?.checkOrigin !== false || revisaElOrigenAntesDeLasActions()).toBe(true);
  });
});
