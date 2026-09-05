import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DESCRIPCION_AVISO_PRIVACIDAD,
  DESCRIPCION_TERMINOS,
  TITULO_AVISO_PRIVACIDAD,
  TITULO_TERMINOS,
} from "../src/lib/legales/textos";
import { NOMBRE_DEL_SITIO, TITULO_DEL_SITIO } from "../src/lib/seo/metadata";
import { TITULO_BUSCAR } from "../src/app/(publico)/buscar/page";
import { TITULO_PANEL } from "../src/app/admin/page";

/**
 * Spec: layout-base · requirement "Ninguna superficie del sitio nombra la
 * marca anterior ni pega la localidad al nombre" (T-019, tasks.md #6).
 *
 * ESTE ARCHIVO ES EL GUARDIÁN DE LA MARCA. Falla —nombrando el archivo— si en
 * el código de las superficies del sitio reaparece la marca anterior o la
 * forma compuesta que el fundador descartó junto con ella.
 *
 * SI ESTA SUITE ESTÁ EN ROJO: el mensaje dice el archivo y la línea. La marca
 * es "EnMiRumbo", sola. Donde haga falta el contexto geográfico va como
 * descriptor —"EnMiRumbo, el directorio de negocios de Tizayuca"— en la
 * primera mención de esa superficie, y "EnMiRumbo" a secas después.
 *
 * ÁMBITO: solo `src/`. La documentación histórica del repositorio (devlog,
 * ADR, tickets cerrados y changes archivados) nombra a la marca anterior a
 * propósito, porque cuenta lo que pasó cuando pasó; reescribirla para pasar el
 * CI sería peor enfermedad que la que se cura (design.md §4).
 */

/** Raíces que el guardián revisa: el código de las superficies del sitio. */
const RAICES_VIGILADAS = ["src"] as const;

/** El cliente de Prisma se genera; no es código que nadie escriba. */
const DIRECTORIOS_IGNORADOS = new Set(["generated", "node_modules"]);

/**
 * Lo que no puede aparecer, y por qué. La marca anterior se busca sin
 * distinguir mayúsculas y pegada a lo que sea (`necesitouno.mx`, el nombre de
 * una base de datos, un identificador); la forma compuesta, con cualquier
 * espacio en medio.
 */
const PROHIBIDOS: ReadonlyArray<{ nombre: string; patron: RegExp; comoSeArregla: string }> = [
  {
    nombre: "la marca anterior",
    patron: /necesitouno/i,
    comoSeArregla: 'la marca del sitio es "EnMiRumbo".',
  },
  {
    nombre: 'la forma compuesta "EnMiRumbo Tizayuca"',
    patron: /EnMiRumbo\s+Tizayuca/i,
    comoSeArregla:
      'la localidad va como descriptor ("EnMiRumbo, el directorio de negocios de Tizayuca"), no pegada al nombre.',
  },
];

type Hallazgo = { archivo: string; linea: number; que: string; comoSeArregla: string };

function archivosDe(directorio: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      if (!DIRECTORIOS_IGNORADOS.has(entrada.name)) encontrados.push(...archivosDe(ruta));
    } else if (entrada.isFile()) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

/**
 * El guardián. Recibe las raíces para poder probarlo por mutación contra un
 * doble: si se probara con una copia de la lógica, no probaría nada.
 */
function marcasProhibidasEn(raices: readonly string[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const raiz of raices) {
    for (const archivo of archivosDe(raiz)) {
      const lineas = readFileSync(archivo, "utf8").split("\n");
      lineas.forEach((linea, indice) => {
        for (const prohibido of PROHIBIDOS) {
          if (prohibido.patron.test(linea)) {
            hallazgos.push({
              archivo,
              linea: indice + 1,
              que: prohibido.nombre,
              comoSeArregla: prohibido.comoSeArregla,
            });
          }
        }
      });
    }
  }
  return hallazgos;
}

function comoSeLee(hallazgos: readonly Hallazgo[]): string {
  return hallazgos
    .map((h) => `${h.archivo}:${h.linea} — apareció ${h.que}: ${h.comoSeArregla}`)
    .join("\n");
}

describe("layout-base · ninguna superficie del sitio nombra la marca anterior", () => {
  // Scenario: un literal nuevo trae la marca vieja
  // Scenario: alguien vuelve a pegarle la localidad a la marca
  it("el código de las superficies del sitio está limpio", () => {
    const hallazgos = marcasProhibidasEn(RAICES_VIGILADAS);
    expect(comoSeLee(hallazgos)).toBe("");
  });

  it("de verdad revisa algo: las raíces vigiladas existen y tienen archivos", () => {
    const archivos = RAICES_VIGILADAS.flatMap((raiz) => archivosDe(raiz));
    expect(archivos.length).toBeGreaterThan(50);
  });
});

describe("layout-base · el guardián de verdad salta (prueba por mutación)", () => {
  /** Un `src/` de mentira con un solo archivo dentro. */
  function raizConArchivo(contenido: string): { raiz: string; archivo: string } {
    const raiz = mkdtempSync(join(tmpdir(), "marca-guardian-"));
    mkdirSync(join(raiz, "lib"), { recursive: true });
    const archivo = join(raiz, "lib", "textos.ts");
    writeFileSync(archivo, contenido, "utf8");
    return { raiz, archivo };
  }

  it.each([
    ['export const T = "Hola, te vi en NecesitoUno. ¿Me das informes?";', "la marca anterior"],
    ['export const T = "Bienvenido a necesitouno.mx";', "la marca anterior"],
    [
      'export const T = "Hola, te escribo de EnMiRumbo Tizayuca.";',
      'la forma compuesta "EnMiRumbo Tizayuca"',
    ],
  ])("un literal con la marca prohibida deja la verificación en rojo: %s", (fuente, que) => {
    const { raiz, archivo } = raizConArchivo(fuente);
    try {
      const hallazgos = marcasProhibidasEn([raiz]);
      expect(hallazgos).toHaveLength(1);
      expect(hallazgos[0].archivo).toBe(archivo);
      expect(hallazgos[0].que).toBe(que);
      // El mensaje nombra el archivo: es lo que hace accionable el fallo.
      expect(comoSeLee(hallazgos)).toContain(archivo);
    } finally {
      rmSync(raiz, { force: true, recursive: true });
    }
  });

  it("un literal con la marca vigente pasa", () => {
    const { raiz } = raizConArchivo(
      'export const T = "EnMiRumbo, el directorio de negocios de Tizayuca";',
    );
    try {
      expect(marcasProhibidasEn([raiz])).toEqual([]);
    } finally {
      rmSync(raiz, { force: true, recursive: true });
    }
  });
});

describe("layout-base · la historia del repositorio se queda como está", () => {
  const HISTORICOS = [
    "docs/devlog",
    "docs/decisiones",
    "openspec/changes/archive",
    "docs/metricas-pipeline.md",
  ];

  // Scenario: la historia del repositorio se queda como está
  it("los devlogs, los ADR y los changes archivados siguen nombrando la marca anterior, y el guardián pasa igual", () => {
    // La premisa: si esos documentos ya no la nombraran, este caso no probaría
    // nada — y querría decir que alguien reescribió la historia.
    const historicosQueLaNombran = HISTORICOS.flatMap((ruta) => {
      const archivos = ruta.endsWith(".md") ? [ruta] : archivosDe(ruta);
      return archivos.filter((archivo) => /necesitouno/i.test(readFileSync(archivo, "utf8")));
    });
    expect(historicosQueLaNombran.length).toBeGreaterThan(5);

    // Y aun así el guardián está en verde: esas rutas no son suyas.
    expect(RAICES_VIGILADAS).toEqual(["src"]);
    expect(marcasProhibidasEn(RAICES_VIGILADAS)).toEqual([]);
  });
});

describe("layout-base · las páginas legales y el panel usan la marca vigente en su metadata", () => {
  // Scenario: las páginas legales tampoco la nombran en su metadata
  it.each([
    ["título del sitio", TITULO_DEL_SITIO],
    ["nombre del sitio", NOMBRE_DEL_SITIO],
    ["título del aviso", TITULO_AVISO_PRIVACIDAD],
    ["descripción del aviso", DESCRIPCION_AVISO_PRIVACIDAD],
    ["título de los términos", TITULO_TERMINOS],
    ["descripción de los términos", DESCRIPCION_TERMINOS],
    ["título del buscador", TITULO_BUSCAR],
    ["título del panel", TITULO_PANEL],
  ])("%s dice EnMiRumbo y nada más", (_que, texto) => {
    expect(texto).toContain("EnMiRumbo");
    expect(texto).not.toMatch(/necesitouno/i);
    expect(texto).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });
});
