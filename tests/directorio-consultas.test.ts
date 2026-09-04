import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  SLUG_CATEGORIA_DEPORTE,
  listarCategorias,
  obtenerCategoriaPorSlug,
  obtenerColoniasConNegociosPublicados,
  obtenerNegocioPublicado,
  obtenerNegociosPublicados,
} from "../src/lib/directorio";
import { SEGMENTOS_RESERVADOS, esSegmentoReservado } from "../src/lib/rutas-reservadas";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico · requirements "Listado por categoría en URL limpia
// con el slug del catálogo", "Solo se muestra lo que está publicado",
// "Filtro por colonia..." y "Se publica la colonia, nunca el domicilio
// exacto ni los datos internos de la ficha" (tasks.md #1 y #2, design.md §5).

const raiz = join(__dirname, "..");

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = crearClientePrueba();
  // Estado conocido: los catálogos y solo los negocios de demostración.
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719995" } } });
  await prisma.$disconnect();
});

describe("directorio-publico · la ruta dinámica no tapa rutas propias (tasks #1)", () => {
  // Scenario: la ruta dinámica no tapa las rutas propias del sitio
  it("ningún slug del catálogo de categorías coincide con un segmento reservado", async () => {
    const categorias = await listarCategorias();
    expect(categorias).toHaveLength(8);
    for (const categoria of categorias) {
      expect(
        esSegmentoReservado(categoria.slug),
        `el slug "${categoria.slug}" taparía una ruta propia del sitio`,
      ).toBe(false);
    }
  });

  it("las rutas propias que ya existen en src/app están declaradas como reservadas", () => {
    const segmentosDeLaRaiz = readdirSync(join(raiz, "src/app"), {
      withFileTypes: true,
    })
      .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith("["))
      .map((entrada) => entrada.name);

    expect(segmentosDeLaRaiz).toContain("registro");
    expect(segmentosDeLaRaiz).toContain("negocio");
    for (const segmento of segmentosDeLaRaiz) {
      expect(SEGMENTOS_RESERVADOS, segmento).toContain(segmento);
    }
  });

  it("reconoce un segmento reservado sin importar mayúsculas ni espacios", () => {
    expect(esSegmentoReservado("registro")).toBe(true);
    expect(esSegmentoReservado("Registro")).toBe(true);
    expect(esSegmentoReservado("belleza")).toBe(false);
  });
});

describe("directorio-publico · catálogo de categorías (tasks #2)", () => {
  it("devuelve las 8 categorías en el orden del catálogo", async () => {
    const categorias = await listarCategorias();
    expect(categorias.map((c) => c.nombre)).toEqual([
      "Restaurantes y fondas",
      "Servicios del hogar",
      "Belleza",
      "Salud",
      "Abarrotes y comercio",
      "Talleres",
      "Clubes y escuelas deportivas",
      "Otro",
    ]);
  });

  it("resuelve una categoría por su slug y no inventa parecidos", async () => {
    expect(await obtenerCategoriaPorSlug("servicios-del-hogar")).toEqual({
      nombre: "Servicios del hogar",
      slug: "servicios-del-hogar",
    });
    expect(await obtenerCategoriaPorSlug("plomeros-baratos")).toBeNull();
  });

  it("la categoría del bloque de deporte existe en el catálogo", async () => {
    expect(await obtenerCategoriaPorSlug(SLUG_CATEGORIA_DEPORTE)).not.toBeNull();
  });
});

describe("directorio-publico · solo se muestra lo publicado (tasks #2)", () => {
  // Scenarios: un negocio en revisión / rechazado no aparece en el listado
  it("los negocios en revisión y rechazados no vuelven en ningún listado", async () => {
    const belleza = await obtenerNegociosPublicados("belleza");
    expect(belleza.map((n) => n.nombre)).not.toContain(
      "Barbería El Buen Corte Imaginario",
    );

    const talleres = await obtenerNegociosPublicados("talleres");
    expect(talleres.map((n) => n.nombre)).not.toContain("Taller Fantasma Rechazado");

    // Ni con filtro de colonia aplicado
    const bellezaCentro = await obtenerNegociosPublicados("belleza", "tizayuca-centro");
    expect(bellezaCentro).toHaveLength(0);
  });

  // Scenario: ficha de un negocio no publicado
  it("la ficha de un negocio no publicado no existe para el módulo", async () => {
    const enRevision = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719995011" },
    });
    const rechazado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719995012" },
    });

    expect(await obtenerNegocioPublicado(enRevision.id)).toBeNull();
    expect(await obtenerNegocioPublicado(rechazado.id)).toBeNull();
    expect(await obtenerNegocioPublicado("no-existe-este-id")).toBeNull();
  });

  // Scenario: solo colonias con negocios
  it("el filtro de colonias no cuenta negocios sin publicar", async () => {
    const colonias = await obtenerColoniasConNegociosPublicados("belleza");
    expect(colonias.map((c) => c.slug)).toEqual(["haciendas-de-tizayuca"]);

    const deTalleres = await obtenerColoniasConNegociosPublicados("talleres");
    expect(deTalleres.map((c) => c.slug)).toEqual(["zona-industrial"]);
  });
});

describe("directorio-publico · orden y filtro del listado (tasks #2)", () => {
  // Requirement: "primero los publicados más recientemente y, a igualdad, por nombre"
  it("ordena por publicación reciente y desempata por nombre", async () => {
    const negocios = await obtenerNegociosPublicados("servicios-del-hogar");
    expect(negocios.map((n) => n.nombre)).toEqual([
      "Cerrajería Puerta Abierta (ficticio)", // publicado después
      "Electricidad Rápida JR (ficticio)", // empate de fecha, gana por nombre
      "Plomería Hermanos Rosales (ficticio)",
    ]);
  });

  // Scenario: filtrar por una colonia
  it("filtra por colonia del catálogo", async () => {
    const enAtempa = await obtenerNegociosPublicados("servicios-del-hogar", "atempa");
    expect(enAtempa.map((n) => n.nombre)).toEqual([
      "Electricidad Rápida JR (ficticio)",
    ]);
  });

  // Scenario: negocio publicado con colonia "Otra" sin normalizar
  it("un publicado con colonia 'Otra' aparece sin filtro, con su texto libre", async () => {
    const abarrotes = await obtenerNegociosPublicados("abarrotes-y-comercio");
    expect(abarrotes).toHaveLength(1);
    expect(abarrotes[0].coloniaNombre).toBe("Fraccionamiento Los Sauces Imaginarios");
    expect(abarrotes[0].coloniaSlug).toBeNull();

    // No aparece bajo ningún filtro de colonia del catálogo
    const colonias = await obtenerColoniasConNegociosPublicados("abarrotes-y-comercio");
    expect(colonias).toHaveLength(0);
  });

  it("una categoría sin negocios publicados devuelve una lista vacía, no un error", async () => {
    expect(await obtenerNegociosPublicados("otro")).toEqual([]);
    expect(await obtenerColoniasConNegociosPublicados("otro")).toEqual([]);
  });

  it("una categoría inexistente no arrastra negocios de otras", async () => {
    expect(await obtenerNegociosPublicados("plomeros-baratos")).toEqual([]);
  });
});

describe("directorio-publico · solo campos públicos (design.md §5)", () => {
  const camposInternos = [
    "estado",
    "origen",
    "registradoEn",
    "consintioAvisoEn",
    "tokenGestion",
  ];

  // Scenario: sin datos internos en la respuesta (la mitad del servidor: lo
  // que no se lee no se puede filtrar al HTML por accidente)
  it("ni el listado ni la ficha traen los datos internos de la ficha", async () => {
    const [negocio] = await obtenerNegociosPublicados("servicios-del-hogar");
    for (const campo of camposInternos) {
      expect(Object.keys(negocio), campo).not.toContain(campo);
    }

    const ficha = await obtenerNegocioPublicado(negocio.id);
    expect(ficha).not.toBeNull();
    for (const campo of camposInternos) {
      expect(Object.keys(ficha!), campo).not.toContain(campo);
    }
  });

  it("la ficha trae lo que el negocio registró y nada más", async () => {
    const [listado] = await obtenerNegociosPublicados("salud");
    const ficha = await obtenerNegocioPublicado(listado.id);
    expect(ficha).toMatchObject({
      nombre: "Veterinaria Patitas de Mentiras",
      coloniaNombre: "Olmos / Ampliación Olmos",
      coloniaSlug: "olmos-ampliacion-olmos",
      queOfreces: "Consultas, vacunas y desparasitación.",
      telefonoFijo: "7717775009",
      horario: "L-S 9am-7pm",
      entregaADomicilio: false,
    });
    // El pin del mapa quedó pospuesto: no se leen coordenadas.
    expect(Object.keys(ficha!)).not.toContain("latitud");
    expect(Object.keys(ficha!)).not.toContain("longitud");
  });

  it("un negocio que solo llenó lo obligatorio devuelve nulos, no cadenas vacías", async () => {
    const [fonda] = await obtenerNegociosPublicados("restaurantes-y-fondas");
    const ficha = await obtenerNegocioPublicado(fonda.id);
    expect(ficha).toMatchObject({
      queOfreces: null,
      telefonoFijo: null,
      direccion: null,
      horario: null,
      facebookUrl: null,
      fotoClave: null,
    });
  });

  // design.md §5: el filtro de estado vive en un solo archivo.
  //
  // MODIFICADO por el change agregar-panel-admin: ahora hay DOS archivos que
  // nombran el estado publicado, y hacen cosas distintas —
  // `src/lib/directorio.ts` es el único que FILTRA por él (qué se muestra) y
  // `src/lib/admin/transiciones.ts` el único que lo ESCRIBE (qué se publica,
  // desde el panel autenticado). Un tercer archivo que lo mencione sigue
  // rompiendo la suite, y el test de abajo comprueba que el del panel no cuela
  // un filtro propio.
  it("solo el directorio filtra por estado publicado y solo el panel lo escribe", () => {
    const archivosConEstadoPublicado = archivosDe(join(raiz, "src"))
      .filter((ruta) => !ruta.includes("/generated/"))
      .filter((ruta) => /estado:\s*ESTADO_NEGOCIO_PUBLICADO|estado:\s*"publicado"/.test(
        readFileSync(ruta, "utf8"),
      ));
    expect(archivosConEstadoPublicado.sort()).toEqual([
      join(raiz, "src/lib/admin/transiciones.ts"),
      join(raiz, "src/lib/directorio.ts"),
    ]);

    // El módulo del panel solo lo usa para ESCRIBIR: nunca dentro de un `where`.
    const transiciones = readFileSync(join(raiz, "src/lib/admin/transiciones.ts"), "utf8");
    expect(transiciones).not.toMatch(
      /where:\s*\{[^}]*(ESTADO_NEGOCIO_PUBLICADO|"publicado")/,
    );
    expect(transiciones).toMatch(/data:\s*\{[\s\S]{0,80}estado:\s*ESTADO_NEGOCIO_PUBLICADO/);
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
