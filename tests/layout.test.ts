import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata } from "../src/app/layout";
import Home from "../src/app/page";
import { Footer } from "../src/components/footer";

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
 * Rutas que existen de verdad: cada `page.tsx` bajo `src/app`. Sirve de lista
 * blanca de hrefs, así que agregar un enlace a una página que aún no existe
 * (los legales de E6, por ejemplo) rompe la suite.
 */
const rutasExistentes = new Set(
  archivosDe(join(raiz, "src/app"), ["page.tsx"]).map((ruta) => {
    const relativa = ruta.slice(join(raiz, "src/app").length + 1);
    const segmentos = relativa.split("/").slice(0, -1);
    return `/${segmentos.join("/")}`;
  }),
);
const globalsCss = readFileSync(join(raiz, "src/app/globals.css"), "utf8");
const layoutTsx = readFileSync(join(raiz, "src/app/layout.tsx"), "utf8");
const headerTsx = readFileSync(join(raiz, "src/components/header.tsx"), "utf8");

const htmlHome = renderToStaticMarkup(createElement(Home));
const htmlFooter = renderToStaticMarkup(createElement(Footer));
const normalizado = (html: string) => html.replace(/\s+/g, " ");

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
  // que existen en `src/app` (hoy "/", "/registro" y "/registro/gracias").
  it("todo href del código de interfaz apunta a una ruta existente", () => {
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

describe("layout-base · solo tokens de color (scenario 4)", () => {
  it("ningún componente usa hexadecimales sueltos; la única fuente es @theme", () => {
    for (const ruta of fuentesTsx) {
      expect(readFileSync(ruta, "utf8")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("layout-base · estructura semántica (scenario 7)", () => {
  it("el layout arma header/main/footer y la home tiene exactamente un h1", () => {
    expect(layoutTsx).toMatch(/<main[\s>]/);
    expect(headerTsx).toMatch(/<header[\s>]/);
    expect(htmlFooter.match(/<footer[\s>]/g)).toHaveLength(1);
    expect(htmlHome.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlHome).not.toMatch(/<h[2-6][\s>]/);
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

describe("layout-base · home provisional (scenario 12)", () => {
  it("la home saluda con los textos literales de la spec", () => {
    expect(normalizado(htmlHome)).toContain("Bienvenido, vecino de Tizayuca");
    expect(normalizado(htmlHome)).toContain(
      "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca.",
    );
  });
});

// layout-base MODIFIED por el change agregar-formulario-registro.
describe("layout-base · entrada al registro desde la home", () => {
  const homeTsx = readFileSync(join(raiz, "src/app/page.tsx"), "utf8");
  const botonPrimario = readFileSync(join(raiz, "src/lib/estilos-boton.ts"), "utf8");

  // Scenario: entrada al registro desde la home
  it('la home enlaza a /registro con el texto literal "Registra tu negocio gratis"', () => {
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
  it("no queda nada de create-next-app en src/", () => {
    for (const ruta of fuentesTodas) {
      expect(readFileSync(ruta, "utf8")).not.toMatch(
        /next\.svg|vercel|create next app|Get started|geist|prefers-color-scheme/i,
      );
    }
  });
});
