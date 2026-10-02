/**
 * Spec `plataforma-astro` (change `migrar-lectura-publica-astro`, T-023),
 * requirement "La imagen de marca se sirve en la misma dirección y no se
 * renderiza por petición": scenarios "la imagen dice lo mismo que hoy" y "la
 * imagen responde en su dirección de siempre" (medidas y tipo). Los de la
 * salida del build ("nada se renderiza por petición", cabeceras) viven en
 * `tests/plataforma-astro-build.test.ts`. tasks.md #9.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import { describe, expect, it } from "vitest";

import { medidasPng } from "../scripts/diff-html/nucleo.mjs";
import { arbolDeLaImagenDeMarca } from "../src/astro/imagen-de-marca/arbol";
import {
  ALT_IMAGEN_DE_MARCA,
  TAMANO_IMAGEN_DE_MARCA,
  TIPO_IMAGEN_DE_MARCA,
} from "../src/astro/imagen-de-marca/datos";
import { generarImagenDeMarca } from "../src/astro/imagen-de-marca/generar";
import { COLORES_MARCA } from "../src/lib/colores-marca";

const raiz = join(__dirname, "..");

type Nodo = { texto: string[]; estilos: Record<string, unknown>[] };

/** Recorre el árbol que recibe el generador: textos por elemento y estilos. */
function recorrer(nodo: ReactNode, salida: Nodo = { texto: [], estilos: [] }): Nodo {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) recorrer(hijo, salida);
  } else if (isValidElement(nodo)) {
    const props = (nodo as ReactElement<{ style?: Record<string, unknown>; children?: ReactNode }>).props;
    if (props.style) salida.estilos.push(props.style);
    const hijos = props.children;
    if (typeof hijos === "string") salida.texto.push(hijos.replace(/\s+/g, " ").trim());
    else recorrer(hijos, salida);
  }
  return salida;
}

describe("plataforma-astro · la imagen dice lo mismo que hoy", () => {
  const { texto, estilos } = recorrer(arbolDeLaImagenDeMarca());

  it("trae los cuatro textos, cada uno en su propio elemento", () => {
    expect(texto).toEqual([
      "EnMiRumbo",
      "Tizayuca",
      "Negocios y servicios de aquí, verificados uno por uno.",
      "Contáctalos por WhatsApp",
    ]);
  });

  it("Tizayuca va aparte y más chica que el wordmark, nunca pegada", () => {
    const tamano = (indice: number) => Number(estilos.filter((e) => "fontSize" in e)[indice]?.fontSize);
    expect(tamano(1)).toBeLessThan(tamano(0));
    expect(texto.join("|")).not.toMatch(/EnMiRumbo\s*Tizayuca/i);
    expect(texto.join("|")).not.toMatch(/necesitouno/i);
  });

  it("usa solo los colores de la marca", () => {
    const colores = new Set(Object.values(COLORES_MARCA));
    const usados = estilos.flatMap((e) => [e.background, e.color].filter(Boolean));
    expect(usados.length).toBeGreaterThan(0);
    for (const color of usados) expect(colores.has(color as never), String(color)).toBe(true);
  });

  it("no mete hexadecimales sueltos ni nada de una petición o de la base", () => {
    for (const archivo of ["arbol.tsx", "generar.ts"]) {
      const fuente = readFileSync(join(raiz, "src/astro/imagen-de-marca", archivo), "utf8");
      expect(fuente, archivo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const prohibido of ["params", "searchParams", "request", "prisma", "@/lib/directorio", "fetch("]) {
        expect(fuente, `${archivo}: ${prohibido}`).not.toContain(prohibido);
      }
    }
    expect(readFileSync(join(raiz, "src/astro/imagen-de-marca/arbol.tsx"), "utf8")).toContain("COLORES_MARCA");
  });

  it("declara tamaño, tipo y texto alternativo en español", () => {
    expect(TAMANO_IMAGEN_DE_MARCA).toEqual({ width: 1200, height: 630 });
    expect(TIPO_IMAGEN_DE_MARCA).toBe("image/png");
    expect(ALT_IMAGEN_DE_MARCA).toBe(
      "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp",
    );
  });

  it("la tipografía viaja con su licencia", () => {
    const licencia = readFileSync(join(raiz, "src/astro/imagen-de-marca/OFL.txt"), "utf8");
    expect(licencia).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licencia).toContain("The Geist Project Authors");
  });
});

describe("plataforma-astro · el PNG generado", () => {
  it("es un PNG de 1200×630, el mismo en dos generaciones", async () => {
    const png = await generarImagenDeMarca();
    expect(medidasPng(png)).toEqual({ ancho: 1200, alto: 630 });
    // Determinista: el hash del PNG es la versión que llevan los metadatos.
    expect(Buffer.compare(png, await generarImagenDeMarca())).toBe(0);
  }, 30_000);
});
