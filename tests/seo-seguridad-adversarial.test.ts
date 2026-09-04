import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import DestinoPage, {
  generateMetadata as metadataDestino,
} from "../src/app/[destino]/page";
import FichaNegocioPage, {
  generateMetadata as metadataFicha,
} from "../src/app/negocio/[ficha]/page";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { reiniciarMemoriaDeCatalogos } from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { SEGMENTOS_RESERVADOS } from "../src/lib/rutas-reservadas";
import {
  datosEstructuradosDeFicha,
  serializarJsonLd,
} from "../src/lib/seo/datos-estructurados";
import { problemasDeAmbiguedadDeCatalogos } from "../src/lib/seo/invariante-catalogos";
import { imagenesDeLaFicha, imagenesDeMarca } from "../src/lib/seo/metadata";
import { ocultarNumerosDeContacto } from "../src/lib/seo/saneo";
import { descripcionFicha } from "../src/lib/seo/titulos";
import {
  type CatalogosDeLaRaiz,
  LARGO_MAXIMO_DE_SLUG,
  resolverSlugDeLaRaiz,
  tieneFormaDeSlugDeLaRaiz,
} from "../src/lib/seo/rutas";
import {
  VARIABLE_URL_SITIO,
  reiniciarAvisoDeUrlSitio,
  urlSitio,
} from "../src/lib/sitio";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad) del change `agregar-seo-local`: lo que el camino feliz
 * no cubre.
 *
 * No repite lo que ya prueba `tests/seo-adversarial.test.ts` (29 slugs
 * hostiles contra la página y su metadata). Ataca lo que quedó fuera:
 *
 *  1. el resolvedor triple contra el catálogo REAL, par por par (1 029
 *     combinaciones), no contra un catálogo de juguete;
 *  2. homógrafos, normalización unicode y sondeo de extensiones;
 *  3. la invariante de no-ambigüedad ante catálogos FUTUROS hostiles
 *     (un giro o una categoría que se llame como un compuesto ya válido);
 *  4. un negocio que estuvo publicado y luego fue RECHAZADO (conserva
 *     `publicadoEn`): no puede reaparecer por ninguna ruta nueva;
 *  5. el JSON-LD como superficie de fuga: se afirma el conjunto EXACTO de
 *     claves y que ningún campo privado viaja, con centinelas únicos;
 *  6. `SITIO_URL` hostil (credenciales, ruta, salto de línea, esquemas raros);
 *  7. el costo en consultas de un slug hostil (DoS barato) y del sitemap.
 *
 * Todos los datos son ficticios (LFPDPPP + repo público): serie `771999 6xxx`
 * y nombres que se leen como inventados.
 */

const raiz = join(__dirname, "..");
const URL_SITIO = "https://necesitouno.example";
/** Prefijo propio de esta suite, para no pisar los fixtures de las otras. */
const PREFIJO = "7719996";

/** Centinelas: si alguno aparece en una respuesta pública, hay fuga. */
const CENTINELA = {
  direccion: "CENTINELA-DIRECCION-Calle Falsa 000",
  horario: "CENTINELA-HORARIO L-V 25:00",
  fijo: "7716660001",
  motivo: "CENTINELA-MOTIVO no se pudo verificar",
  coloniaOtra: "CENTINELA-COLONIA-OTRA Barrio Imaginario",
  ofreceRevision: "CENTINELA-OFRECE-EN-REVISION",
  ofreceRechazado: "CENTINELA-OFRECE-RECHAZADO",
  ofrecePublicado: "Servicio ficticio de cerrajería para la prueba.",
} as const;

let prisma: PrismaClient;
let catalogos: CatalogosDeLaRaiz = { categorias: [], giros: [], colonias: [] };
let idPorWhatsapp: Record<string, string> = {};

const almacenGlobal = globalThis as typeof globalThis & {
  prismaNecesitoUno?: PrismaClient;
};

/** Cuenta cada llamada a un modelo de Prisma, para medir el costo por request. */
const contador = { consultas: 0 };

function clienteQueCuenta(real: PrismaClient): PrismaClient {
  const modelos = new Set(["negocio", "categoria", "colonia", "giro"]);
  return new Proxy(real, {
    get(objetivo, propiedad) {
      const valor = Reflect.get(objetivo, propiedad) as unknown;
      if (typeof propiedad !== "string" || !modelos.has(propiedad) || !valor) {
        return valor;
      }
      const delegado = valor as Record<string, unknown>;
      return new Proxy(delegado, {
        get(modelo, metodo) {
          const fn = Reflect.get(modelo, metodo) as unknown;
          if (typeof fn !== "function") return fn;
          return (...args: unknown[]) => {
            contador.consultas += 1;
            return (fn as (...a: unknown[]) => unknown).apply(modelo, args);
          };
        },
      });
    },
  }) as PrismaClient;
}

type Respuesta = { html: string } | { digest: string };

async function pedirDestino(destino: string): Promise<Respuesta> {
  try {
    const elemento = await DestinoPage({
      params: Promise.resolve({ destino }),
      searchParams: Promise.resolve({}),
    });
    return { html: renderToStaticMarkup(createElement(() => elemento)) };
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") return { digest };
    throw error;
  }
}

async function htmlDeFicha(nombre: string, id: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: construirSegmentoFicha(nombre, id) }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

/** Bloques `application/ld+json` crudos, tal como salen en el HTML. */
function bloquesCrudos(html: string): string[] {
  return [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);
}

async function sembrarNegocio(datos: {
  nombre: string;
  whatsapp: string;
  categoriaSlug: string;
  coloniaSlug?: string;
  coloniaOtra?: string;
  estado: "publicado" | "en_revision" | "rechazado";
  publicadoEn?: string;
  rechazadoEn?: string;
  motivoRechazo?: string;
  queOfreces?: string;
  direccion?: string;
  telefonoFijo?: string;
  horario?: string;
  latitud?: number;
  longitud?: number;
  giros: string[];
}): Promise<string> {
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: datos.categoriaSlug },
  });
  const colonia = datos.coloniaSlug
    ? await prisma.colonia.findUniqueOrThrow({ where: { slug: datos.coloniaSlug } })
    : null;
  const comunes = {
    nombre: datos.nombre,
    categoriaId: categoria.id,
    coloniaId: colonia?.id ?? null,
    coloniaOtra: datos.coloniaOtra ?? null,
    queOfreces: datos.queOfreces ?? null,
    direccion: datos.direccion ?? null,
    telefonoFijo: datos.telefonoFijo ?? null,
    horario: datos.horario ?? null,
    latitud: datos.latitud ?? null,
    longitud: datos.longitud ?? null,
    estado: datos.estado,
    origen: "siembra",
    publicadoEn: datos.publicadoEn ? new Date(datos.publicadoEn) : null,
    rechazadoEn: datos.rechazadoEn ? new Date(datos.rechazadoEn) : null,
    motivoRechazo: datos.motivoRechazo ?? null,
    ...datosDeBusqueda(datos.nombre, datos.queOfreces),
  };
  const fila = await prisma.negocio.upsert({
    where: { whatsapp: datos.whatsapp },
    update: { ...comunes, giros: { set: datos.giros.map((slug) => ({ slug })) } },
    create: {
      ...comunes,
      whatsapp: datos.whatsapp,
      giros: { connect: datos.giros.map((slug) => ({ slug })) },
      consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      registradoEn: new Date("2026-07-31T10:00:00.000Z"),
    },
  });
  return fila.id;
}

beforeAll(async () => {
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);

  // La app usa el mismo cliente que la suite, envuelto para contar consultas.
  almacenGlobal.prismaNecesitoUno = clienteQueCuenta(prisma);

  catalogos = {
    categorias: await prisma.categoria.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
    giros: await prisma.giro.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
    colonias: await prisma.colonia.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
  };

  // Control publicado: la página de `/cerrajeria` sí existe para alguien.
  await sembrarNegocio({
    nombre: "Cerrajería Llave Inventada",
    whatsapp: `${PREFIJO}001`,
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "huicalco",
    estado: "publicado",
    publicadoEn: "2026-08-20T10:00:00.000Z",
    queOfreces: CENTINELA.ofrecePublicado,
    giros: ["cerrajeria"],
  });

  // En revisión, con giro y colonia: nada suyo puede salir a la luz.
  await sembrarNegocio({
    nombre: "Herrería Fantasma Sin Aprobar (ficticia)",
    whatsapp: `${PREFIJO}002`,
    categoriaSlug: "talleres",
    coloniaSlug: "atempa",
    estado: "en_revision",
    queOfreces: CENTINELA.ofreceRevision,
    direccion: CENTINELA.direccion,
    telefonoFijo: CENTINELA.fijo,
    horario: CENTINELA.horario,
    giros: ["herreria"],
  });

  // El caso que la suite del dev no cubre: estuvo PUBLICADO y después fue
  // RECHAZADO. Conserva `publicadoEn` (el panel no lo borra), así que
  // cualquier consulta que filtrara por "tiene fecha de publicación" en vez de
  // por estado lo dejaría reaparecer.
  await sembrarNegocio({
    nombre: "Herrería Revocada Imaginaria",
    whatsapp: `${PREFIJO}003`,
    categoriaSlug: "talleres",
    coloniaSlug: "atempa",
    estado: "rechazado",
    publicadoEn: "2026-08-10T10:00:00.000Z",
    rechazadoEn: "2026-08-21T10:00:00.000Z",
    motivoRechazo: CENTINELA.motivo,
    queOfreces: CENTINELA.ofreceRechazado,
    direccion: CENTINELA.direccion,
    telefonoFijo: CENTINELA.fijo,
    horario: CENTINELA.horario,
    giros: ["herreria"],
  });

  // Publicado con TODOS los campos privados llenos: el JSON-LD no puede
  // publicar ni uno.
  await sembrarNegocio({
    nombre: "Ferretería Centinela Ficticia",
    whatsapp: `${PREFIJO}004`,
    categoriaSlug: "abarrotes-y-comercio",
    coloniaOtra: CENTINELA.coloniaOtra,
    estado: "publicado",
    publicadoEn: "2026-08-22T10:00:00.000Z",
    queOfreces: "Tornillos y clavos de mentira.",
    direccion: CENTINELA.direccion,
    telefonoFijo: CENTINELA.fijo,
    horario: CENTINELA.horario,
    latitud: 19.8333,
    longitud: -98.9833,
    giros: ["ferreteria"],
  });

  const negocios = await prisma.negocio.findMany({
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp = Object.fromEntries(negocios.map((n) => [n.whatsapp, n.id]));
});

afterAll(async () => {
  delete almacenGlobal.prismaNecesitoUno;
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
// 1. El resolvedor triple contra el catálogo REAL
// ───────────────────────────────────────────────────────────────────────────

describe("seo/seguridad · el resolvedor sobre los catálogos sembrados", () => {
  it("los 8 slugs de categoría resuelven a su categoría y a nada más", () => {
    expect(catalogos.categorias).toHaveLength(8);
    for (const categoria of catalogos.categorias) {
      expect(
        resolverSlugDeLaRaiz(categoria.slug, catalogos),
        categoria.slug,
      ).toEqual({ tipo: "categoria", categoria });
    }
  });

  it("los 49 slugs de giro resuelven a su giro y a nada más", () => {
    expect(catalogos.giros).toHaveLength(49);
    for (const giro of catalogos.giros) {
      expect(resolverSlugDeLaRaiz(giro.slug, catalogos), giro.slug).toEqual({
        tipo: "giro",
        giro,
      });
    }
  });

  it("ninguna de las 21 colonias abre página propia en la raíz", () => {
    // Solo hay tres tipos de URL en la raíz; una colonia suelta no es ninguno,
    // así que tiene que ser 404 y no un listado de "toda la colonia".
    expect(catalogos.colonias).toHaveLength(21);
    for (const colonia of catalogos.colonias) {
      expect(
        resolverSlugDeLaRaiz(colonia.slug, catalogos),
        colonia.slug,
      ).toEqual({ tipo: "desconocido" });
    }
  });

  it("las 1 029 combinaciones giro+colonia se leen de UNA sola manera", () => {
    // La invariante de `seo-invariante-catalogos` razona sobre los catálogos;
    // esto ejecuta el resolvedor de producción par por par, que es lo que de
    // verdad sirve la URL. Si alguna combinación resolviera a otro par (o a un
    // giro que la tapa), aquí se nombra cuál.
    const fallos: string[] = [];
    for (const giro of catalogos.giros) {
      for (const colonia of catalogos.colonias) {
        const compuesto = `${giro.slug}-${colonia.slug}`;
        const resuelto = resolverSlugDeLaRaiz(compuesto, catalogos);
        if (
          resuelto.tipo !== "giro-colonia" ||
          resuelto.giro.slug !== giro.slug ||
          resuelto.colonia.slug !== colonia.slug
        ) {
          fallos.push(`${compuesto} → ${JSON.stringify(resuelto)}`);
        }
      }
    }
    expect(fallos).toEqual([]);
    expect(catalogos.giros.length * catalogos.colonias.length).toBe(1029);
  });

  it("ningún compuesto del catálogo tapa una ruta propia del sitio", () => {
    for (const giro of catalogos.giros) {
      for (const colonia of catalogos.colonias) {
        expect(
          SEGMENTOS_RESERVADOS as readonly string[],
        ).not.toContain(`${giro.slug}-${colonia.slug}`);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Homógrafos, normalización y sondeo
// ───────────────────────────────────────────────────────────────────────────

/** Entradas que se PARECEN a un slug del catálogo pero no lo son. */
const IMPOSTORES: Array<[string, string]> = [
  ["plomer\u0131a", "i sin punto (U+0131)"],
  ["plomer\u0456a", "і cirílica (U+0456)"],
  ["\u0440lomeria", "р cirílica (U+0440)"],
  ["plomeria\u200b", "espacio de ancho cero al final"],
  ["\u200bplomeria", "espacio de ancho cero al inicio"],
  ["plome\u0301ria", "acento combinante (NFD)"],
  ["ｐｌｏｍｅｒｉａ", "anchura completa"],
  ["plomerıa-huicalco", "compuesto con i sin punto"],
  ["plomeria\u00a0huicalco", "espacio duro"],
  ["plomeria\u0000", "byte nulo"],
  ["plomeria\n", "salto de línea"],
  ["plomeria\r\nSet-Cookie: a=b", "inyección de encabezado"],
  ["plomeria\t", "tabulador"],
  ["plomeria.", "punto final"],
  ["plomeria.json", "sondeo de extensión"],
  ["plomeria.xml", "sondeo de extensión"],
  ["plomeria;huicalco", "punto y coma"],
  ["plomeria:huicalco", "dos puntos"],
  ["plomeria@huicalco", "arroba"],
  ["plomeria#huicalco", "fragmento"],
  ["plomeria?colonia=huicalco", "consulta pegada"],
  ["plomeria%c0%ae%c0%ae", "traversal sobrelargo"],
  ["..%252fadmin", "traversal doblemente codificado"],
  [".well-known", "ruta de convención"],
  ["plomeria+huicalco", "más"],
  ["plomeria|huicalco", "tubería"],
  ["plomeria\\huicalco", "diagonal invertida"],
  ["-".repeat(LARGO_MAXIMO_DE_SLUG), "solo guiones"],
  ["a".repeat(LARGO_MAXIMO_DE_SLUG + 1), "un carácter sobre el tope"],
];

describe("seo/seguridad · impostores unicode y sondeo de rutas", () => {
  it.each(IMPOSTORES)(
    "%o (%s) ni tiene forma de slug ni resuelve a nada",
    (entrada) => {
      expect(tieneFormaDeSlugDeLaRaiz(entrada), entrada).toBe(false);
      expect(resolverSlugDeLaRaiz(entrada, catalogos), entrada).toEqual({
        tipo: "desconocido",
      });
    },
  );

  it("el tope de largo se aplica en el límite exacto, no cerca", () => {
    expect(tieneFormaDeSlugDeLaRaiz("a".repeat(LARGO_MAXIMO_DE_SLUG))).toBe(true);
    expect(tieneFormaDeSlugDeLaRaiz("a".repeat(LARGO_MAXIMO_DE_SLUG + 1))).toBe(
      false,
    );
    // Un slug del largo máximo tiene forma válida pero no está en el catálogo.
    expect(
      resolverSlugDeLaRaiz("a".repeat(LARGO_MAXIMO_DE_SLUG), catalogos),
    ).toEqual({ tipo: "desconocido" });
  });

  it("una cadena de 10 000 caracteres con 5 000 guiones no cuesta tiempo", () => {
    // Sin el tope de largo, `cortesDeCompuesto` recorrería 5 000 cortes contra
    // los dos catálogos. Con él, muere en la comparación de longitud.
    const bomba = `${"a-".repeat(5000)}b`;
    const inicio = performance.now();
    for (let i = 0; i < 200; i++) {
      expect(resolverSlugDeLaRaiz(bomba, catalogos)).toEqual({
        tipo: "desconocido",
      });
    }
    expect(performance.now() - inicio).toBeLessThan(200);
  });

  it("las mayúsculas y los acentos no abren una segunda URL de la misma página", () => {
    // Contenido duplicado y, de paso, una vía para inflar el índice.
    for (const variante of [
      "Plomeria",
      "PLOMERIA",
      "PlOmErIa",
      "plomería",
      "Servicios-Del-Hogar",
      "SERVICIOS-DEL-HOGAR",
    ]) {
      expect(resolverSlugDeLaRaiz(variante, catalogos), variante).toEqual({
        tipo: "desconocido",
      });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. La invariante ante catálogos FUTUROS hostiles
// ───────────────────────────────────────────────────────────────────────────

describe("seo/seguridad · catálogos futuros que romperían la raíz", () => {
  const conGiro = (nombre: string, slug: string): CatalogosDeLaRaiz => ({
    ...catalogos,
    giros: [...catalogos.giros, { nombre, slug }],
  });

  it("un giro futuro con el slug de una categoría se detecta y no secuestra la URL", () => {
    const futuro = conGiro("Servicios del hogar (giro)", "servicios-del-hogar");
    const problemas = problemasDeAmbiguedadDeCatalogos(futuro);
    expect(problemas.join(" | ")).toContain("servicios-del-hogar");
    // Y mientras tanto, la URL publicada NO cambia de significado.
    expect(resolverSlugDeLaRaiz("servicios-del-hogar", futuro)).toMatchObject({
      tipo: "categoria",
    });
  });

  it("un giro futuro con el slug de un compuesto ya válido se detecta (taparía el par)", () => {
    const futuro = conGiro("Plomería en Huicalco", "plomeria-huicalco");
    expect(problemasDeAmbiguedadDeCatalogos(futuro).join(" | ")).toContain(
      "plomeria-huicalco",
    );
    // El giro le gana al par: `/plomeria-huicalco` dejaría de ser la página de
    // la colonia. Por eso la invariante tiene que fallar ANTES de sembrarlo.
    expect(resolverSlugDeLaRaiz("plomeria-huicalco", futuro)).toMatchObject({
      tipo: "giro",
      giro: { slug: "plomeria-huicalco" },
    });
  });

  it("una categoría futura con el slug de un compuesto ya válido se detecta", () => {
    const futuro: CatalogosDeLaRaiz = {
      ...catalogos,
      categorias: [
        ...catalogos.categorias,
        { nombre: "Plomería Huicalco", slug: "plomeria-huicalco" },
      ],
    };
    expect(problemasDeAmbiguedadDeCatalogos(futuro).join(" | ")).toContain(
      "plomeria-huicalco",
    );
    expect(resolverSlugDeLaRaiz("plomeria-huicalco", futuro)).toMatchObject({
      tipo: "categoria",
    });
  });

  it("una colonia futura con el slug de una categoría se detecta", () => {
    const futuro: CatalogosDeLaRaiz = {
      ...catalogos,
      colonias: [...catalogos.colonias, { nombre: "Belleza", slug: "belleza" }],
    };
    expect(problemasDeAmbiguedadDeCatalogos(futuro).join(" | ")).toContain(
      "belleza",
    );
  });

  it("un giro o una colonia con un segmento reservado se detecta en los tres catálogos", () => {
    for (const reservado of SEGMENTOS_RESERVADOS) {
      const conGiroReservado = conGiro("Inventado", reservado);
      expect(
        problemasDeAmbiguedadDeCatalogos(conGiroReservado).join(" | "),
        reservado,
      ).toContain(reservado);
      const conColoniaReservada: CatalogosDeLaRaiz = {
        ...catalogos,
        colonias: [...catalogos.colonias, { nombre: "Inventada", slug: reservado }],
      };
      expect(
        problemasDeAmbiguedadDeCatalogos(conColoniaReservada).join(" | "),
        reservado,
      ).toContain(reservado);
    }
  });

  it("tres lecturas de un mismo compuesto se detectan todas y la URL responde 404", () => {
    const ambiguo: CatalogosDeLaRaiz = {
      categorias: [],
      giros: [
        { nombre: "Uno", slug: "a" },
        { nombre: "Dos", slug: "a-b" },
        { nombre: "Tres", slug: "a-b-c" },
      ],
      colonias: [
        { nombre: "Cuatro", slug: "b-c-d" },
        { nombre: "Cinco", slug: "c-d" },
        { nombre: "Seis", slug: "d" },
      ],
    };
    const problemas = problemasDeAmbiguedadDeCatalogos(ambiguo).join(" | ");
    expect(problemas).toContain("3 maneras");
    // Con tres lecturas posibles no se elige ninguna: 404 antes que servir una
    // URL que significa tres cosas.
    expect(resolverSlugDeLaRaiz("a-b-c-d", ambiguo)).toEqual({
      tipo: "desconocido",
    });
  });

  it("un slug de catálogo con forma inválida se detecta como página inalcanzable", () => {
    for (const roto of ["Plomería", "plomeria_2", "plomeria-", "plomeria huicalco"]) {
      expect(
        problemasDeAmbiguedadDeCatalogos(conGiro("Roto", roto)).join(" | "),
        roto,
      ).toContain(roto);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Nada sin publicar sale por las rutas nuevas
// ───────────────────────────────────────────────────────────────────────────

/** Todo lo que jamás puede aparecer en una respuesta pública. */
function rastrosPrivados(): string[] {
  return [
    "Herrería Fantasma Sin Aprobar (ficticia)",
    "Herrería Revocada Imaginaria",
    CENTINELA.ofreceRevision,
    CENTINELA.ofreceRechazado,
    CENTINELA.direccion,
    CENTINELA.horario,
    CENTINELA.fijo,
    CENTINELA.motivo,
    `${PREFIJO}002`,
    `${PREFIJO}003`,
    idPorWhatsapp[`${PREFIJO}002`],
    idPorWhatsapp[`${PREFIJO}003`],
  ];
}

function sinRastros(html: string, contexto: string): void {
  for (const rastro of rastrosPrivados()) {
    expect(html, `${contexto} filtró ${rastro}`).not.toContain(rastro);
  }
}

describe("seo/seguridad · lo no publicado no reaparece por ninguna ruta nueva", () => {
  // El rechazado conserva `publicadoEn`: el filtro tiene que ser por ESTADO.
  it("un negocio publicado y luego rechazado no vuelve por su página de giro", async () => {
    const respuesta = await pedirDestino("herreria");
    expect("html" in respuesta).toBe(true);
    const html = "html" in respuesta ? respuesta.html : "";
    expect(html).toContain("Herrería en Tizayuca");
    expect(html).toContain("Todavía no hay negocios publicados de esto en Tizayuca.");
    sinRastros(html, "/herreria");
  });

  it("tampoco por la página de giro+colonia que solo él ocupaba", async () => {
    const respuesta = await pedirDestino("herreria-atempa");
    const html = "html" in respuesta ? respuesta.html : "";
    expect(html).toContain("Todavía no hay negocios publicados de esto en esta colonia.");
    sinRastros(html, "/herreria-atempa");
  });

  it("ni por el listado de su categoría", async () => {
    const respuesta = await pedirDestino("talleres");
    const html = "html" in respuesta ? respuesta.html : "";
    sinRastros(html, "/talleres");
  });

  it("su ficha responde 404 y su metadata no declara nada", async () => {
    for (const whatsapp of [`${PREFIJO}002`, `${PREFIJO}003`]) {
      const id = idPorWhatsapp[whatsapp];
      await expect(
        htmlDeFicha("Herrería Revocada Imaginaria", id),
        whatsapp,
      ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
      const metadata = await metadataFicha({
        params: Promise.resolve({
          ficha: construirSegmentoFicha("Herrería Revocada Imaginaria", id),
        }),
        searchParams: Promise.resolve({}),
      });
      expect(metadata, whatsapp).toEqual({});
    }
  });

  it("el sitemap no publica su ficha, su giro, su par ni ningún dato suyo", async () => {
    const entradas = await sitemap();
    const serializado = JSON.stringify(entradas);
    const urls = entradas.map((entrada) => entrada.url);
    expect(urls).not.toContain(`${URL_SITIO}/herreria`);
    expect(urls).not.toContain(`${URL_SITIO}/herreria-atempa`);
    sinRastros(serializado, "sitemap");
    // Y el control sí está: la cerrajería publicada aporta sus tres URLs.
    expect(urls).toContain(`${URL_SITIO}/cerrajeria`);
    expect(urls).toContain(`${URL_SITIO}/cerrajeria-huicalco`);
    expect(urls).toContain(
      `${URL_SITIO}/negocio/${construirSegmentoFicha("Cerrajería Llave Inventada", idPorWhatsapp[`${PREFIJO}001`])}`,
    );
  });

  it("la página vacía de un giro sin publicados pide no ser indexada, y la que tiene contenido no", async () => {
    const vacia = await metadataDestino({
      params: Promise.resolve({ destino: "herreria" }),
      searchParams: Promise.resolve({}),
    });
    expect(vacia.robots).toEqual({ index: false, follow: true });

    const conContenido = await metadataDestino({
      params: Promise.resolve({ destino: "cerrajeria" }),
      searchParams: Promise.resolve({}),
    });
    expect(conContenido.robots).toBeUndefined();
    expect(conContenido.alternates).toEqual({
      canonical: `${URL_SITIO}/cerrajeria`,
    });
  });

  it("ningún listado por categoría se marca como no indexable, ni siquiera vacío", async () => {
    // El `noindex` es solo para giros y pares vacíos: las 8 categorías son la
    // navegación fija del sitio y sí entran al sitemap (spec `layout-base`).
    for (const categoria of catalogos.categorias) {
      const metadata = await metadataDestino({
        params: Promise.resolve({ destino: categoria.slug }),
        searchParams: Promise.resolve({}),
      });
      expect(metadata.robots, categoria.slug).toBeUndefined();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. El JSON-LD como superficie de fuga y de inyección
// ───────────────────────────────────────────────────────────────────────────

/** Las únicas claves que el bloque puede traer (spec: markup parcial y honesto). */
const CLAVES_PERMITIDAS = new Set([
  "@context",
  "@type",
  "name",
  "url",
  "description",
  "image",
  "address",
  "knowsAbout",
]);

describe("seo/seguridad · el bloque de datos no publica de más", () => {
  it("con todos los campos privados llenos, el bloque solo trae las claves permitidas", async () => {
    const id = idPorWhatsapp[`${PREFIJO}004`];
    const html = await htmlDeFicha("Ferretería Centinela Ficticia", id);
    const crudos = bloquesCrudos(html);
    expect(crudos).toHaveLength(1);
    const bloque = JSON.parse(crudos[0]) as Record<string, unknown>;

    // Nunca una clave de más: si alguien suma `telephone`, `openingHours` o
    // cualquier campo interno al bloque, esto falla.
    expect(
      Object.keys(bloque).filter((clave) => !CLAVES_PERMITIDAS.has(clave)),
    ).toEqual([]);
    // Este negocio no tiene foto, así que `image` no está; el resto sí.
    expect(new Set(Object.keys(bloque))).toEqual(
      new Set([...CLAVES_PERMITIDAS].filter((clave) => clave !== "image")),
    );
    const direccion = bloque.address as Record<string, unknown>;
    expect(new Set(Object.keys(direccion))).toEqual(
      // Sin colonia del catálogo no hay `streetAddress`: la ficha quedó con
      // "Otra" sin normalizar y el bloque no inventa una colonia.
      new Set(["@type", "addressLocality", "addressRegion", "addressCountry"]),
    );

    const serializado = JSON.stringify(bloque);
    for (const centinela of [
      CENTINELA.direccion,
      CENTINELA.horario,
      CENTINELA.fijo,
      CENTINELA.coloniaOtra,
      `${PREFIJO}004`,
      "19.83",
      "-98.98",
    ]) {
      expect(serializado, centinela).not.toContain(centinela);
    }
    // El identificador solo puede aparecer dentro de la URL pública de la
    // ficha, en ningún otro campo del bloque.
    const sinUrl = { ...bloque };
    delete sinUrl.url;
    expect(JSON.stringify(sinUrl)).not.toContain(id);
    // …y la ficha SÍ le enseña a las personas lo que el bloque no publica.
    expect(html).toContain(CENTINELA.direccion);
    expect(html).toContain(CENTINELA.horario);
  });

  it("el bloque nunca trae el identificador interno ni el enlace de gestión", async () => {
    const id = idPorWhatsapp[`${PREFIJO}001`];
    const html = await htmlDeFicha("Cerrajería Llave Inventada", id);
    const bloque = JSON.parse(bloquesCrudos(html)[0]) as Record<string, unknown>;
    const serializado = JSON.stringify(bloque);
    for (const prohibido of [
      "tokenGestion",
      "token",
      "identifier",
      "@id",
      "telephone",
      "contactPoint",
      "openingHours",
      "geo",
    ]) {
      expect(serializado.toLowerCase(), prohibido).not.toContain(
        prohibido.toLowerCase(),
      );
    }
    // El id sí viaja dentro de la URL de la ficha (es la URL pública), pero
    // solo ahí y no como campo suelto.
    expect(bloque.url).toBe(
      `${URL_SITIO}/negocio/${construirSegmentoFicha("Cerrajería Llave Inventada", id)}`,
    );
  });
});

/** Cargas hostiles en los dos campos de texto libre que el bloque publica. */
const CARGAS_HOSTILES = [
  "</script><script>alert(1)</script>",
  "</ScRiPt ><svg onload=alert(1)>",
  "</script\t>",
  "</script\n>",
  "<!--<script>",
  "-->",
  "]]><script>",
  '\\"}</script><script>alert(1)//',
  "\u2028\u2029",
  "\\u003c/script>",
  "<\\/script>",
  "&lt;/script&gt;",
];

describe("seo/seguridad · escapado del bloque contra XSS almacenado", () => {
  it.each(CARGAS_HOSTILES)(
    "la carga %o viaja como dato: ni un `<` crudo, ni un bloque partido",
    (carga) => {
      const serializado = serializarJsonLd(
        datosEstructuradosDeFicha(
          {
            id: "id-ficticio",
            nombre: `Negocio ${carga}`,
            coloniaNombre: "Huicalco",
            coloniaSlug: "huicalco",
            entregaADomicilio: false,
            whatsapp: `${PREFIJO}009`,
            fotoUrl: null,
            categoriaNombre: "Talleres",
            queOfreces: carga,
            telefonoFijo: null,
            direccion: null,
            horario: null,
            facebookUrl: null,
          },
          [{ nombre: carga, slug: "plomeria" }],
          "/negocio/ficticio-id-ficticio",
        ),
        );

      // Nada que un navegador pueda leer como el fin del bloque.
      expect(serializado).not.toContain("<");
      expect(serializado).not.toContain("</");
      expect(serializado.toLowerCase()).not.toContain("</script");
      expect(serializado).not.toContain("<!--");
      // Y sigue siendo un solo JSON válido, con el texto íntegro adentro.
      const bloque = JSON.parse(serializado) as Record<string, unknown>;
      expect(bloque.name).toBe(`Negocio ${carga}`);
      expect(bloque.knowsAbout).toEqual(["Talleres", carga]);
      // `U+2028U+2029` son espacio en blanco para `trim()`: un "¿Qué ofreces?"
      // que solo trae eso no produce descripción, y está bien que no la haya.
      //
      // La descripción se compara con los espacios colapsados: desde la
      // iteración 2 (hallazgo M2) el "¿Qué ofreces?" pasa por
      // `ocultarNumerosDeContacto`, que además de ocultar teléfonos normaliza
      // los espacios (tabuladores y saltos de línea incluidos) porque una meta
      // descripción con saltos de línea se ve rota en el resultado de
      // búsqueda. Lo que esta prueba vigila —que la carga viaje como DATO y no
      // pueda cerrar el bloque— se sigue exigiendo carácter por carácter
      // arriba, sobre el serializado, y sobre `name` y `knowsAbout`, que no
      // pasan por ningún saneo.
      const espaciosColapsados = (texto: string) => texto.replace(/\s+/g, " ").trim();
      if (carga.trim() !== "") {
        expect(espaciosColapsados(bloque.description as string)).toBe(
          espaciosColapsados(carga),
        );
      } else {
        expect(bloque).not.toHaveProperty("description");
      }
    },
  );

  it("una ficha real con la carga adentro deja un solo <script> y ninguna etiqueta de regalo", async () => {
    const nombre = 'Vulcanizadora </script><img src=x onerror="alert(1)"> Ficticia';
    const id = await sembrarNegocio({
      nombre,
      whatsapp: `${PREFIJO}005`,
      categoriaSlug: "talleres",
      coloniaSlug: "huicalco",
      estado: "publicado",
      publicadoEn: "2026-08-23T10:00:00.000Z",
      queOfreces: '<!--</script--><iframe src="javascript:alert(2)"></iframe>',
      giros: ["vulcanizadora"],
    });
    const html = await htmlDeFicha(nombre, id);

    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html).toContain('<script type="application/ld+json">');

    // Fuera del bloque de datos, ni una etiqueta ni un atributo de evento: lo
    // que el negocio escribió lo escapa React en el cuerpo de la página.
    const fueraDelBloque = html.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
      "",
    );
    for (const patron of [/<img/i, /<iframe/i, /<!--/, /<svg\s+onload/i]) {
      expect(fueraDelBloque, String(patron)).not.toMatch(patron);
    }
    // Lo que el negocio escribió sí se ve, pero escapado: es texto, no marcado.
    expect(fueraDelBloque).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(fueraDelBloque).toContain("&lt;iframe");
    // Y dentro del bloque, `onerror=` queda como texto de un dato JSON: sin un
    // `<` crudo no se puede formar ninguna etiqueta ni cerrar el <script>.

    const crudo = bloquesCrudos(html);
    expect(crudo).toHaveLength(1);
    expect(crudo[0]).not.toContain("<");
    expect(JSON.parse(crudo[0])).toMatchObject({ name: nombre });

    await prisma.negocio.delete({ where: { whatsapp: `${PREFIJO}005` } });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. `SITIO_URL` hostil
// ───────────────────────────────────────────────────────────────────────────

describe("seo/seguridad · SITIO_URL hostil o mal escrita", () => {
  const conVariable = async <T,>(
    valor: string | undefined,
    produccion: boolean,
    cuerpo: () => T | Promise<T>,
  ): Promise<T> => {
    const anterior = process.env[VARIABLE_URL_SITIO];
    if (valor === undefined) delete process.env[VARIABLE_URL_SITIO];
    else process.env[VARIABLE_URL_SITIO] = valor;
    if (produccion) vi.stubEnv("NODE_ENV", "production");
    try {
      return await cuerpo();
    } finally {
      vi.unstubAllEnvs();
      if (anterior === undefined) delete process.env[VARIABLE_URL_SITIO];
      else process.env[VARIABLE_URL_SITIO] = anterior;
    }
  };

  it("solo sobrevive el origen: ni credenciales, ni ruta, ni consulta, ni fragmento", () => {
    expect(
      urlSitio({
        [VARIABLE_URL_SITIO]:
          "https://admin:sup3rsecreto@necesitouno.example/sub/dir?a=b#frag",
      }),
    ).toBe("https://necesitouno.example");
    expect(
      urlSitio({ [VARIABLE_URL_SITIO]: "https://necesitouno.example/" }),
    ).toBe("https://necesitouno.example");
    expect(
      urlSitio({ [VARIABLE_URL_SITIO]: "  https://necesitouno.example  " }),
    ).toBe("https://necesitouno.example");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://necesitouno.example",
    "//evil.example",
    "necesitouno.example",
    "",
    "   ",
    "https://",
  ])("en producción, %o se trata como ausente (null), nunca como origen", (valor) => {
    expect(
      urlSitio({ [VARIABLE_URL_SITIO]: valor, NODE_ENV: "production" }),
    ).toBeNull();
  });

  it("un valor con salto de línea no puede inyectar una segunda directiva", async () => {
    const hostil = "https://necesitouno.example\nSitemap: https://evil.example/x.xml";
    const origen = urlSitio({ [VARIABLE_URL_SITIO]: hostil });
    if (origen !== null) {
      expect(origen).not.toContain("\n");
      expect(origen).not.toContain("evil.example");
      expect(origen).toMatch(/^https?:\/\/[^\s/?#]+$/);
    }
    await conVariable(hostil, false, () => {
      const salida = robots();
      const serializado = JSON.stringify(salida);
      expect(serializado).not.toContain("evil.example");
      expect(String(salida.sitemap ?? "")).not.toMatch(/[\n\r]/);
    });
  });

  it("con credenciales y ruta en la variable, el sitemap no las refleja", async () => {
    await conVariable(
      "https://admin:sup3rsecreto@necesitouno.example/sub?a=b#frag",
      false,
      async () => {
        const urls = (await sitemap()).map((entrada) => entrada.url);
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
          expect(url).not.toContain("sup3rsecreto");
          expect(url).not.toContain("admin:");
          expect(url).not.toContain("/sub");
          expect(url).not.toContain("#");
          expect(url).not.toContain("?");
          expect(url.startsWith("https://necesitouno.example"), url).toBe(true);
          // Sin diagonales dobles después del esquema.
          expect(url.slice("https://".length)).not.toContain("//");
        }
      },
    );
  });

  it("en producción sin la variable, ninguna página nueva publica una canónica a localhost", async () => {
    await conVariable(undefined, true, async () => {
      reiniciarAvisoDeUrlSitio();
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const paginas = ["servicios-del-hogar", "cerrajeria", "cerrajeria-huicalco"];
        for (const destino of paginas) {
          const metadata = await metadataDestino({
            params: Promise.resolve({ destino }),
            searchParams: Promise.resolve({}),
          });
          expect(metadata.alternates, destino).toBeUndefined();
          expect(JSON.stringify(metadata), destino).not.toContain("localhost");
        }

        const id = idPorWhatsapp[`${PREFIJO}001`];
        const metadataDeFicha = await metadataFicha({
          params: Promise.resolve({
            ficha: construirSegmentoFicha("Cerrajería Llave Inventada", id),
          }),
          searchParams: Promise.resolve({}),
        });
        expect(metadataDeFicha.alternates).toBeUndefined();
        expect(JSON.stringify(metadataDeFicha)).not.toContain("localhost");
        expect(metadataDeFicha.openGraph?.images).toEqual([]);

        // Y el bloque de datos tampoco inventa una URL local.
        const html = await htmlDeFicha("Cerrajería Llave Inventada", id);
        const bloque = JSON.parse(bloquesCrudos(html)[0]) as Record<string, unknown>;
        expect(bloque).not.toHaveProperty("url");
        expect(JSON.stringify(bloque)).not.toContain("localhost");
      } finally {
        aviso.mockRestore();
        reiniciarAvisoDeUrlSitio();
      }
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Imagen de la vista previa
// ───────────────────────────────────────────────────────────────────────────

describe("seo/seguridad · la imagen para compartir", () => {
  it("la imagen de marca no recibe nada de un negocio: no hay superficie que inyectar", () => {
    const fuente = readFileSync(join(raiz, "src/app/opengraph-image.tsx"), "utf8");
    // Ni parámetros de ruta, ni consulta, ni base de datos: el PNG se pinta
    // con literales de la marca, así que un nombre hostil no puede entrar.
    for (const prohibido of [
      "params",
      "searchParams",
      "prisma",
      "@/lib/directorio",
      "obtenerNegocio",
      "fetch(",
    ]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
    expect(fuente).toContain("COLORES_MARCA");
  });

  it("una foto con un esquema hostil nunca sale como og:image", () => {
    for (const hostil of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "  javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "httpx://necesitouno.example/x.png",
      "x.png",
    ]) {
      const imagenes = imagenesDeLaFicha(hostil, {
        [VARIABLE_URL_SITIO]: URL_SITIO,
      });
      expect(imagenes, hostil).toHaveLength(1);
      expect(imagenes[0], hostil).toMatch(/^https:\/\/necesitouno\.example\//);
      expect(imagenes[0], hostil).not.toContain("javascript");
      expect(imagenes[0], hostil).not.toContain("data:");
    }
  });

  it("una ficha sin foto se comparte con la imagen de marca, absoluta", () => {
    expect(imagenesDeLaFicha(null, { [VARIABLE_URL_SITIO]: URL_SITIO })).toEqual([
      `${URL_SITIO}/opengraph-image`,
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Costo por petición (DoS barato)
// ───────────────────────────────────────────────────────────────────────────

describe("seo/seguridad · lo que cuesta una petición hostil", () => {
  async function consultasDe(destino: string): Promise<number> {
    // Peor caso a propósito: memoria de catálogos fría, como la primera
    // petición que recibe un proceso recién arrancado (iteración 2, M4).
    reiniciarMemoriaDeCatalogos();
    contador.consultas = 0;
    await metadataDestino({
      params: Promise.resolve({ destino }),
      searchParams: Promise.resolve({}),
    });
    await pedirDestino(destino);
    return contador.consultas;
  }

  it("un slug sin forma de slug no cuesta ni una consulta", async () => {
    for (const basura of [
      "a".repeat(LARGO_MAXIMO_DE_SLUG + 1),
      "PLOMERIA",
      "../../etc/passwd",
      "plomeria%00",
      `${"a-".repeat(5000)}b`,
    ]) {
      expect(await consultasDe(basura), basura).toBe(0);
    }
  });

  it("un slug bien formado pero inexistente cuesta un número ACOTADO de consultas", async () => {
    // Documenta el costo real: el resolvedor lee los tres catálogos enteros.
    // Es fijo y pequeño, pero NO es cero: la clase hostil que sí paga
    // consultas es esta. Si alguien agregara una consulta por corte del
    // compuesto, esto falla.
    //
    // ACTUALIZADO en la iteración 2 (hallazgo M4): eran 8 —los tres catálogos
    // DOS veces, una en `generateMetadata` y otra en la página, más el resto—
    // y ahora son 3: los catálogos se leen una sola vez y se memorizan
    // (`obtenerCatalogosDeLaRaiz`, `VIGENCIA_CATALOGOS_MS`). El peor caso que
    // se mide aquí es con la memoria fría; en un proceso caliente, esta misma
    // petición cuesta CERO consultas.
    // Secuencial a propósito: el contador es del proceso, no de la petición.
    const costos: number[] = [];
    for (const slug of [
      "aaaa-bbbb",
      "plomeria-colonia-inventada",
      "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p",
      "a".repeat(LARGO_MAXIMO_DE_SLUG),
    ]) {
      costos.push(await consultasDe(slug));
    }
    for (const costo of costos) {
      expect(costo).toBeGreaterThan(0);
      expect(costo).toBeLessThanOrEqual(3);
    }
    // Y un compuesto con muchos cortes no cuesta más que uno con dos.
    expect(costos[2]).toBe(costos[0]);

    // Con la memoria caliente (lo normal en producción), la segunda petición
    // del mismo tipo no le pregunta nada a la base.
    contador.consultas = 0;
    await metadataDestino({
      params: Promise.resolve({ destino: "aaaa-bbbb" }),
      searchParams: Promise.resolve({}),
    });
    await pedirDestino("aaaa-bbbb");
    expect(contador.consultas).toBe(0);
  });

  it("el sitemap cuesta lo mismo con un negocio que con muchos (sin N+1)", async () => {
    contador.consultas = 0;
    await sitemap();
    const conPocos = contador.consultas;

    const creados: string[] = [];
    for (let i = 0; i < 12; i++) {
      const whatsapp = `${PREFIJO}1${String(i).padStart(2, "0")}`;
      creados.push(whatsapp);
      await sembrarNegocio({
        nombre: `Papelería Ficticia ${i}`,
        whatsapp,
        categoriaSlug: "abarrotes-y-comercio",
        coloniaSlug: catalogos.colonias[i % catalogos.colonias.length].slug,
        estado: "publicado",
        publicadoEn: "2026-08-24T10:00:00.000Z",
        giros: ["papeleria"],
      });
    }

    contador.consultas = 0;
    await sitemap();
    expect(contador.consultas).toBe(conPocos);
    expect(conPocos).toBeLessThanOrEqual(2);

    await prisma.negocio.deleteMany({ where: { whatsapp: { in: creados } } });
  });

  it("robots.txt no toca la base", async () => {
    contador.consultas = 0;
    robots();
    expect(contador.consultas).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Verificación de la iteración 2 (correcciones a M1, M2, M4 y O1)
//
// No repite `tests/seo-iteracion2.test.ts` (la prueba del dev): ataca las
// correcciones, que es otra cosa. Lo que se busca aquí es evadir el saneo y
// hacer que la memoria de catálogos sirva algo que no debe.
// ───────────────────────────────────────────────────────────────────────────

/** Las formas en que una persona escribe de verdad un teléfono mexicano. */
const TELEFONOS_ESCRITOS = [
  "Plomería 24 horas, llámanos al 771 000 0000.",
  "Tel 771-999-88-77",
  "(771) 999 8877",
  "+52 771 999 8877",
  "771.999.8877",
  "7719998877",
  "771/999/8877",
  "Escríbenos a wa.me/527719998877",
  "771 999 88 77 llámame",
  "Whats 55 1234 5678 y fijo 771 100 2030",
  "Cel: 7719998877 / Fijo: 7717770000",
  "771–999–8877",
];

/** Lo que la gente sí quiere leer y NO puede desaparecer. */
const TEXTOS_LEGITIMOS = [
  "Clases de futbol de 6 a 12 años",
  "Abierto L-S 9am-7pm",
  "Cortes desde $1,200",
  "Servicio 24/7",
  "Pizzas de 30 cm",
  "Horario 9:00-19:00",
  "Servicio desde 1995 hasta 2024",
  "Reparamos lavadoras y refrigeradores",
];

describe("seo/seguridad · iteración 2 · saneo de números (M2)", () => {
  it.each(TELEFONOS_ESCRITOS)(
    "oculta el número escrito como %o",
    (texto) => {
      const saneado = ocultarNumerosDeContacto(texto);
      expect(saneado).toContain("…");
      // Ni un solo tramo de 7 dígitos sobrevive, con o sin separadores.
      expect(saneado.replace(/[\s().\-+/·–—]/g, "")).not.toMatch(/\d{7}/);
    },
  );

  it.each(TEXTOS_LEGITIMOS)("no toca %o", (texto) => {
    expect(ocultarNumerosDeContacto(texto)).toBe(texto);
  });

  it("el umbral es de 7 dígitos: 6 pasan, 7 se ocultan", () => {
    expect(ocultarNumerosDeContacto("123456")).toBe("123456");
    expect(ocultarNumerosDeContacto("1234567")).toBe("…");
    expect(ocultarNumerosDeContacto("12 34 56")).toBe("12 34 56");
    expect(ocultarNumerosDeContacto("12 34 567")).toBe("…");
  });

  it("residuo conocido y aceptado: la evasión deliberada sigue pasando", () => {
    // CARACTERIZACIÓN, no aprobación: documenta el límite del saneo tal como
    // quedó (ver `reports/c-seguridad.md`, R1). Todas estas formas requieren
    // que el propio negocio ofusque su número a propósito; ninguna ocurre al
    // escribir normal. Si alguna vez se normaliza el texto (NFKC + quitar
    // caracteres de ancho cero) antes de buscar, esta prueba debe ACTUALIZARSE
    // para exigir que se oculten, no borrarse.
    const evasiones = [
      "７７１９９９８８７７", // dígitos de ancho completo
      "٧٧١٩٩٩٨٨٧٧", // dígitos arábigo-índicos
      "7​7​1​9​9​9​8​8​7​7", // ancho cero
      "771_999_8877", // guion bajo
      "771,999,8877", // comas (excluidas para no romper "$1,200")
      "7719,998877",
    ];
    for (const evasion of evasiones) {
      expect(ocultarNumerosDeContacto(evasion), evasion).not.toContain("…");
    }
    // Lo que sí importa: ninguna de ellas rompe nada aguas abajo.
    for (const evasion of evasiones) {
      expect(() => descripcionFicha({
        nombre: "Negocio Ficticio",
        coloniaNombre: "Huicalco",
        queOfreces: evasion,
      })).not.toThrow();
    }
  });

  it("residuo conocido: oculta de más cuando hay muchas cifras sueltas", () => {
    // CARACTERIZACIÓN del costo del umbral conservador (ver R1): una tienda de
    // ropa que lista tallas pierde ese texto en el snippet. Es un costo de
    // contenido, no de seguridad, y está elegido a propósito.
    expect(ocultarNumerosDeContacto("Tallas 28 30 32 34 36")).toBe("Tallas …");
    expect(ocultarNumerosDeContacto("2020-2024")).toBe("…");
  });

  it("el saneo no se atraganta con una entrada patológica", () => {
    // El campo se valida a 200 caracteres en el formulario, pero una fila
    // sembrada a mano puede ser más larga: el saneo no puede ser un ReDoS.
    const patologicas = [
      `1${" ".repeat(50_000)}x`,
      `${"1 ".repeat(50_000)}x`,
      `${"(".repeat(20_000)}1234567`,
      `${"1-".repeat(30_000)}1`,
    ];
    const inicio = performance.now();
    for (const entrada of patologicas) {
      expect(typeof ocultarNumerosDeContacto(entrada)).toBe("string");
    }
    expect(performance.now() - inicio).toBeLessThan(2000);
  });

  it("las TRES superficies quedan saneadas y el cuerpo de la ficha no", async () => {
    const numero = "771 000 0000";
    const texto = `Plomería 24 horas, llámanos al ${numero}. Tallas no, tuberías sí.`;
    const id = await sembrarNegocio({
      nombre: "Plomería Con Número Ficticia",
      whatsapp: `${PREFIJO}006`,
      categoriaSlug: "servicios-del-hogar",
      coloniaSlug: "huicalco",
      estado: "publicado",
      publicadoEn: "2026-08-26T10:00:00.000Z",
      queOfreces: texto,
      giros: ["plomeria"],
    });
    try {
      const segmento = construirSegmentoFicha("Plomería Con Número Ficticia", id);
      const metadata = await metadataFicha({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      });

      // 1 y 2: meta descripción y og:description
      expect(metadata.description).toContain("…");
      expect(metadata.description).not.toContain(numero);
      expect(metadata.description).not.toContain("7710000000");
      expect(metadata.openGraph?.description).toBe(metadata.description);
      // El título tampoco lo trae (viene del nombre y la colonia).
      expect(JSON.stringify(metadata)).not.toContain("7710000000");
      expect(JSON.stringify(metadata)).not.toContain(numero);

      // 3: el bloque JSON-LD
      const html = await htmlDeFicha("Plomería Con Número Ficticia", id);
      const crudo = bloquesCrudos(html);
      expect(crudo).toHaveLength(1);
      const bloque = JSON.parse(crudo[0]) as Record<string, unknown>;
      expect(bloque.description).toContain("…");
      expect(crudo[0]).not.toContain(numero);
      expect(crudo[0]).not.toContain("7710000000");

      // …y a las personas la ficha les sigue mostrando lo que el negocio quiso
      // escribir, que es donde tiene sentido.
      expect(html).toContain(numero);
    } finally {
      await prisma.negocio.delete({ where: { whatsapp: `${PREFIJO}006` } });
    }
  });
});

describe("seo/seguridad · iteración 2 · la memoria de catálogos (M4)", () => {
  it("los NEGOCIOS no se memorizan: rechazar uno lo saca en la petición siguiente", async () => {
    // El corazón del riesgo de cualquier caché en este proyecto: que algo que
    // el admin quitó siga a la vista. Se hace SIN reiniciar la memoria, para
    // probar que la memoria caliente no protege al negocio.
    const whatsapp = `${PREFIJO}001`;
    const antes = await pedirDestino("cerrajeria");
    expect("html" in antes && antes.html).toContain("Cerrajería Llave Inventada");

    await prisma.negocio.update({
      where: { whatsapp },
      data: {
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-27T10:00:00.000Z"),
        motivoRechazo: CENTINELA.motivo,
      },
    });

    try {
      const despues = await pedirDestino("cerrajeria");
      const html = "html" in despues ? despues.html : "";
      expect(html).not.toContain("Cerrajería Llave Inventada");
      expect(html).toContain("Todavía no hay negocios publicados de esto en Tizayuca.");
      expect(html).not.toContain(CENTINELA.motivo);
      expect(html).not.toContain(idPorWhatsapp[whatsapp]);

      // La decisión de `noindex` también es en vivo, no memorizada.
      const metadata = await metadataDestino({
        params: Promise.resolve({ destino: "cerrajeria" }),
        searchParams: Promise.resolve({}),
      });
      expect(metadata.robots).toEqual({ index: false, follow: true });

      // Y el sitemap deja de publicarlo de inmediato.
      const urls = (await sitemap()).map((entrada) => entrada.url);
      expect(urls).not.toContain(`${URL_SITIO}/cerrajeria`);
      expect(urls).not.toContain(`${URL_SITIO}/cerrajeria-huicalco`);
      expect(JSON.stringify(await sitemap())).not.toContain(idPorWhatsapp[whatsapp]);
    } finally {
      await prisma.negocio.update({
        where: { whatsapp },
        data: {
          estado: "publicado",
          rechazadoEn: null,
          motivoRechazo: null,
          publicadoEn: new Date("2026-08-20T10:00:00.000Z"),
        },
      });
    }

    // Y al revés: vuelve a estar publicado y reaparece sin esperar nada.
    const reaparece = await pedirDestino("cerrajeria");
    expect("html" in reaparece && reaparece.html).toContain(
      "Cerrajería Llave Inventada",
    );
  });

  it("un negocio publicado recién creado aparece sin esperar a que caduque nada", async () => {
    const urlsAntes = (await sitemap()).map((entrada) => entrada.url);
    expect(urlsAntes).not.toContain(`${URL_SITIO}/pasteleria`);

    await sembrarNegocio({
      nombre: "Pastelería Recién Inventada",
      whatsapp: `${PREFIJO}007`,
      categoriaSlug: "restaurantes-y-fondas",
      coloniaSlug: "atempa",
      estado: "publicado",
      publicadoEn: "2026-08-28T10:00:00.000Z",
      giros: ["pasteleria"],
    });
    try {
      const respuesta = await pedirDestino("pasteleria");
      expect("html" in respuesta && respuesta.html).toContain(
        "Pastelería Recién Inventada",
      );
      const urls = (await sitemap()).map((entrada) => entrada.url);
      expect(urls).toContain(`${URL_SITIO}/pasteleria`);
      expect(urls).toContain(`${URL_SITIO}/pasteleria-atempa`);
    } finally {
      await prisma.negocio.delete({ where: { whatsapp: `${PREFIJO}007` } });
    }
  });

  it("lo único que la memoria puede retrasar es un catálogo, y de forma inofensiva", async () => {
    // Se calienta la memoria y se agrega un giro nuevo por detrás.
    await pedirDestino("plomeria");
    const giro = await prisma.giro.create({
      data: { nombre: "Giro Reciente Ficticio", slug: "giro-reciente-ficticio" },
    });
    try {
      // Con la memoria caliente todavía no existe: 404, que es lo peor que
      // puede pasar (nunca datos de más).
      const conMemoria = await pedirDestino("giro-reciente-ficticio");
      expect(conMemoria).toEqual({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

      // Al caducar (aquí, al reiniciarla a mano) ya resuelve.
      reiniciarMemoriaDeCatalogos();
      const sinMemoria = await pedirDestino("giro-reciente-ficticio");
      expect("html" in sinMemoria).toBe(true);
      expect("html" in sinMemoria ? sinMemoria.html : "").toContain(
        "Giro Reciente Ficticio en Tizayuca",
      );
    } finally {
      await prisma.giro.delete({ where: { id: giro.id } });
      reiniciarMemoriaDeCatalogos();
    }
  });

  it("un giro borrado del catálogo, mientras la memoria lo recuerda, no enseña datos de nadie", async () => {
    const giro = await prisma.giro.create({
      data: { nombre: "Giro Efímero Ficticio", slug: "giro-efimero-ficticio" },
    });
    reiniciarMemoriaDeCatalogos();
    await pedirDestino("giro-efimero-ficticio"); // memoria caliente con el giro
    await prisma.giro.delete({ where: { id: giro.id } });
    try {
      const respuesta = await pedirDestino("giro-efimero-ficticio");
      const html = "html" in respuesta ? respuesta.html : "";
      expect(html).toContain("Todavía no hay negocios publicados");
      sinRastros(html, "giro borrado con memoria caliente");
      expect(html).not.toMatch(/<article[\s>]/);
    } finally {
      reiniciarMemoriaDeCatalogos();
    }
  });

  it("la memoria solo guarda catálogos: ni un campo de negocio cabe en ella", () => {
    const fuente = readFileSync(join(raiz, "src/lib/directorio.ts"), "utf8");
    const memoria = fuente.slice(
      fuente.indexOf("let catalogosEnMemoria"),
      fuente.indexOf("export async function obtenerNegociosPublicadosPorGiro"),
    );
    expect(memoria).not.toContain("negocio.");
    expect(memoria).not.toContain("ESTADO_NEGOCIO_PUBLICADO");
    // Y no hay NINGUNA otra memoria en el módulo: el único estado mutable de
    // alcance de módulo es el de los catálogos. Si alguien agrega otro `let`
    // (para memorizar negocios, por ejemplo), esta prueba lo señala.
    const estadoDeModulo = [...fuente.matchAll(/^let\s+(\w+)/gm)].map((m) => m[1]);
    expect(estadoDeModulo).toEqual(["catalogosEnMemoria"]);
  });
});

describe("seo/seguridad · iteración 2 · M1 y O1", () => {
  it("los dos niveles raíz de metadata declaran su imagen, no la heredan", () => {
    for (const archivo of ["src/app/layout.tsx", "src/app/not-found.tsx"]) {
      const fuente = readFileSync(join(raiz, archivo), "utf8");
      expect(fuente, archivo).toMatch(/images|metadataDelSitio/);
    }
    const notFound = readFileSync(join(raiz, "src/app/not-found.tsx"), "utf8");
    expect(notFound).toContain("imagenesDeMarca()");
  });

  it("sin URL pública en producción, la imagen de marca es una lista vacía", () => {
    expect(imagenesDeMarca({ NODE_ENV: "production" })).toEqual([]);
    expect(
      imagenesDeMarca({ NODE_ENV: "production", [VARIABLE_URL_SITIO]: "no-es-url" }),
    ).toEqual([]);
    expect(imagenesDeMarca({ [VARIABLE_URL_SITIO]: URL_SITIO })).toEqual([
      `${URL_SITIO}/opengraph-image`,
    ]);
    // Y nunca una ruta relativa ni algo que se resuelva contra localhost.
    for (const imagen of imagenesDeMarca({ [VARIABLE_URL_SITIO]: URL_SITIO })) {
      expect(imagen).toMatch(/^https:\/\//);
      expect(imagen).not.toContain("localhost");
    }
  });

  it("las rutas que Next publica desde un archivo están reservadas", () => {
    for (const segmento of [
      "robots.txt",
      "sitemap.xml",
      "opengraph-image",
      "favicon.ico",
    ]) {
      expect(SEGMENTOS_RESERVADOS as readonly string[], segmento).toContain(
        segmento,
      );
    }
    // Y ningún slug del catálogo real choca con ellas.
    for (const entrada of [
      ...catalogos.categorias,
      ...catalogos.giros,
      ...catalogos.colonias,
    ]) {
      expect(
        (SEGMENTOS_RESERVADOS as readonly string[]).includes(entrada.slug),
        entrada.slug,
      ).toBe(false);
    }
  });
});
