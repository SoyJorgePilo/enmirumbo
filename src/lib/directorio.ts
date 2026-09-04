/**
 * Consultas del directorio público (design.md §5 del change
 * `agregar-directorio-publico`).
 *
 * Este es el ÚNICO lugar del código que lee negocios para mostrarlos:
 *
 * 1. El filtro `estado: publicado` se aplica por construcción en cada
 *    función, con la constante de `src/lib/negocio.ts`. Ninguna página arma
 *    su propio `where`, así que "el directorio nunca muestra negocios sin
 *    publicar" es una propiedad del código y no una disciplina.
 * 2. Los campos se seleccionan uno por uno: quedan fuera `estado`, `origen`,
 *    `registradoEn`, `consintioAvisoEn`, `tokenGestion` y las coordenadas.
 *    Lo que no se lee no se puede filtrar al HTML por accidente (PRD §8).
 */
import { terminosDeBusqueda } from "@/lib/busqueda";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import { obtenerPrisma } from "@/lib/prisma";

/** Categoría del catálogo, tal como se usa en la home y en el listado. */
export type CategoriaCatalogo = { nombre: string; slug: string };

/** Colonia del catálogo, tal como se usa en el filtro del listado. */
export type ColoniaCatalogo = { nombre: string; slug: string };

/** Giro del catálogo cerrado (PRD Apéndice B), el que asigna el admin. */
export type GiroCatalogo = { nombre: string; slug: string };

/** Lo que la tarjeta del listado necesita, y nada más. */
export type NegocioListado = {
  id: string;
  nombre: string;
  /**
   * Slug de la categoría DEL NEGOCIO. Se lee para que la propiedad `categoria`
   * del evento de medición sea correcta también en `/buscar`, donde conviven
   * resultados de categorías distintas (change `agregar-analitica-cookieless`).
   */
  categoriaSlug: string;
  /** Nombre del catálogo o el texto libre de "Otra"; `null` si no hay ninguno. */
  coloniaNombre: string | null;
  /** `null` cuando la colonia es "Otra" sin normalizar: no filtra por catálogo. */
  coloniaSlug: string | null;
  entregaADomicilio: boolean;
  /** Como está guardado; el enlace se arma con `construirEnlaceWhatsapp`. */
  whatsapp: string;
  /**
   * Referencia interna de la foto tal como está guardada, sin interpretar:
   * quien la pinta la pasa por `urlDeFoto` (`src/lib/fotos/url.ts`), que
   * devuelve la dirección interna o `null`. Aquí NO se construye ninguna URL
   * (spec `directorio-publico`, "Solo se pinta la foto que generó el
   * servidor").
   */
  fotoClave: string | null;
};

/** Lo de la tarjeta más lo que solo se muestra en la ficha. */
export type NegocioFicha = NegocioListado & {
  /** Nombre de la categoría del catálogo, para los datos estructurados. */
  categoriaNombre: string;
  queOfreces: string | null;
  telefonoFijo: string | null;
  /** Dirección o referencias en texto libre, tal como las escribió el negocio. */
  direccion: string | null;
  horario: string | null;
  /** Página que registró el negocio; no necesariamente Facebook (M4 de T-003). */
  facebookUrl: string | null;
};

/**
 * Slug de la categoría que destaca el bloque "Deporte en Tizayuca" (PRD §6.5).
 * Es un slug del catálogo (`prisma/seed.ts`), no una ruta aparte.
 */
export const SLUG_CATEGORIA_DEPORTE = "clubes-y-escuelas-deportivas";

const CAMPOS_LISTADO = {
  id: true,
  nombre: true,
  entregaADomicilio: true,
  whatsapp: true,
  fotoClave: true,
  coloniaOtra: true,
  colonia: { select: { nombre: true, slug: true } },
  categoria: { select: { slug: true } },
} as const;

const CAMPOS_FICHA = {
  ...CAMPOS_LISTADO,
  // Los DOS campos de la categoría, y por razones distintas: el `nombre` lo
  // pinta la ficha (change `agregar-seo-local`) y el `slug` es la propiedad
  // `categoria` del evento de medición (change `agregar-analitica-cookieless`).
  // Este `select` PISA al de `CAMPOS_LISTADO`, así que omitir uno lo deja en
  // `undefined` sin que TypeScript avise.
  categoria: { select: { nombre: true, slug: true } },
  queOfreces: true,
  telefonoFijo: true,
  direccion: true,
  horario: true,
  facebookUrl: true,
} as const;

type FilaListado = {
  id: string;
  nombre: string;
  entregaADomicilio: boolean;
  whatsapp: string;
  fotoClave: string | null;
  coloniaOtra: string | null;
  colonia: { nombre: string; slug: string } | null;
  categoria: { slug: string };
};

/** La colonia del catálogo manda; si no la hay, el texto libre de "Otra". */
function aListado(fila: FilaListado): NegocioListado {
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoriaSlug: fila.categoria.slug,
    coloniaNombre: fila.colonia?.nombre ?? fila.coloniaOtra?.trim() ?? null,
    coloniaSlug: fila.colonia?.slug ?? null,
    entregaADomicilio: fila.entregaADomicilio,
    whatsapp: fila.whatsapp,
    fotoClave: fila.fotoClave,
  };
}

/** Las 8 categorías del catálogo, en el orden en que se sembraron (PRD §6.1). */
export async function listarCategorias(): Promise<CategoriaCatalogo[]> {
  return obtenerPrisma().categoria.findMany({
    orderBy: { id: "asc" },
    select: { nombre: true, slug: true },
  });
}

/** La categoría de ese slug, o `null` si no está en el catálogo (→ 404). */
export async function obtenerCategoriaPorSlug(
  slug: string,
): Promise<CategoriaCatalogo | null> {
  return obtenerPrisma().categoria.findUnique({
    where: { slug },
    select: { nombre: true, slug: true },
  });
}

/**
 * La colonia de ese slug, o `null` si no está en el catálogo. El listado la
 * usa para distinguir "colonia que existe pero no tiene negocios de esta
 * categoría" (mensaje de sin resultados) de "colonia inventada en la URL"
 * (se ignora el filtro).
 */
export async function obtenerColoniaPorSlug(
  slug: string,
): Promise<ColoniaCatalogo | null> {
  return obtenerPrisma().colonia.findUnique({
    where: { slug },
    select: { nombre: true, slug: true },
  });
}

/**
 * Negocios publicados de una categoría, opcionalmente filtrados por una
 * colonia del catálogo. Orden: los publicados más recientemente primero y, a
 * igualdad, por nombre (requirement del listado).
 *
 * Solo entran fichas `publicado`, que siempre traen `publicadoEn` (se lo pone
 * la aprobación del panel), así que el orden de los nulos no aplica. Se anota
 * porque el dialecto cambió y con él la respuesta: PostgreSQL pone los nulos
 * PRIMERO en un `DESC` (SQLite los ponía al final). Si algún día una ficha
 * publicada pudiera quedarse sin fecha, esa ficha encabezaría el listado.
 */
export async function obtenerNegociosPublicados(
  categoriaSlug: string,
  coloniaSlug?: string,
): Promise<NegocioListado[]> {
  const filas = await obtenerPrisma().negocio.findMany({
    where: {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      categoria: { slug: categoriaSlug },
      ...(coloniaSlug ? { colonia: { slug: coloniaSlug } } : {}),
    },
    orderBy: [{ publicadoEn: "desc" }, { nombre: "asc" }],
    select: CAMPOS_LISTADO,
  });
  return filas.map(aListado);
}

/**
 * Negocios publicados que coinciden con lo que escribió el vecino (change
 * `agregar-buscador`, design.md §2 y §4; spec `directorio-publico`,
 * requirements "La búsqueda cubre nombre, palabras clave y giros, y solo lo
 * publicado" y "Coincidencia insensible a mayúsculas y acentos...").
 *
 * La consulta se acota y se trocea en raíces ANTES de llegar aquí
 * (`terminosDeBusqueda`), así que lo que entra al `where` ya es `[a-z0-9]`:
 * sin `%` ni `_`, que en un `LIKE` serían comodines y `contains` no escapa.
 * Si no queda ningún término, se devuelve la lista vacía sin consultar nada.
 *
 * Se exigen TODOS los términos (`AND`), y cada uno puede coincidir en el
 * nombre normalizado, en el "¿Qué ofreces?" normalizado o en el `slug` de
 * alguno de sus giros —el del catálogo ya viene sin acentos, así que se
 * compara directo (design.md §3)—. Sin ranking: el orden es el mismo del
 * listado. El filtro de estado y la proyección de campos públicos son los del
 * resto del módulo.
 */
export async function buscarNegociosPublicados(
  consulta: string,
): Promise<NegocioListado[]> {
  const terminos = terminosDeBusqueda(consulta);
  if (terminos.length === 0) return [];

  const filas = await obtenerPrisma().negocio.findMany({
    where: {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      AND: terminos.map((termino) => ({
        OR: [
          { nombreNormalizado: { contains: termino } },
          { queOfrecesNormalizado: { contains: termino } },
          { giros: { some: { slug: { contains: termino } } } },
        ],
      })),
    },
    orderBy: [{ publicadoEn: "desc" }, { nombre: "asc" }],
    select: CAMPOS_LISTADO,
  });
  return filas.map(aListado);
}

/**
 * Colonias con al menos un negocio publicado en esa categoría: el filtro solo
 * ofrece opciones que llevan a algo (una que lleva a "no hay nada" es un
 * control muerto). Las colonias "Otra" sin normalizar no aparecen, porque no
 * son del catálogo y no se puede filtrar por ellas.
 */
export async function obtenerColoniasConNegociosPublicados(
  categoriaSlug: string,
): Promise<ColoniaCatalogo[]> {
  return obtenerPrisma().colonia.findMany({
    where: {
      negocios: {
        some: {
          estado: ESTADO_NEGOCIO_PUBLICADO,
          categoria: { slug: categoriaSlug },
        },
      },
    },
    orderBy: { id: "asc" },
    select: { nombre: true, slug: true },
  });
}

/**
 * Los tres catálogos de la raíz. Los arreglos son `readonly` a propósito: la
 * lectura se memoriza y se comparte entre peticiones, así que nadie puede
 * ordenarlos ni recortarlos en el lugar (observación R3 de la etapa C).
 */
export type CatalogosDeLaRaiz = {
  categorias: readonly CategoriaCatalogo[];
  giros: readonly GiroCatalogo[];
  colonias: readonly ColoniaCatalogo[];
};

async function leerCatalogosDeLaRaiz(): Promise<CatalogosDeLaRaiz> {
  const prisma = obtenerPrisma();
  const [categorias, giros, colonias] = await Promise.all([
    prisma.categoria.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
    prisma.giro.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
    prisma.colonia.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
  ]);
  // Congelados: la memoria de abajo entrega LA MISMA referencia a todas las
  // peticiones del proceso, así que un `catalogos.giros.sort(...)` dentro de
  // una página corrompería el catálogo de todas las peticiones siguientes
  // hasta que caduque. Hoy ningún consumidor los muta (solo `.find`); esto lo
  // vuelve imposible en lugar de improbable (observación R3 de la etapa C).
  return {
    categorias: Object.freeze(categorias),
    giros: Object.freeze(giros),
    colonias: Object.freeze(colonias),
  };
}

/**
 * Cuánto vale una lectura de los catálogos antes de volver a preguntarle a la
 * base. Treinta segundos acotan el único efecto posible —que un giro recién
 * sembrado tarde en aparecer en desarrollo— y bastan para lo que resuelven:
 * que una misma petición no lea los tres catálogos dos veces.
 */
export const VIGENCIA_CATALOGOS_MS = 30_000;

let catalogosEnMemoria: {
  leidoEn: number;
  lectura: Promise<CatalogosDeLaRaiz>;
} | null = null;

/** Solo para pruebas y para el arranque: vacía la memoria de catálogos. */
export function reiniciarMemoriaDeCatalogos(): void {
  catalogosEnMemoria = null;
}

/**
 * Los tres catálogos con los que la raíz decide qué es cada URL (change
 * `agregar-seo-local`, design.md §1): categoría, giro o par giro+colonia.
 *
 * Se leen enteros —8 + 49 + 21 filas de dos columnas— porque la resolución es
 * una regla sobre los tres catálogos a la vez (§2) y porque así la página
 * tiene ya los NOMBRES para encabezar, sin una consulta extra después.
 *
 * **Se memorizan** (iteración 2, hallazgo M4 de la etapa C): cada vista de la
 * raíz los pedía DOS veces —una en `generateMetadata` y otra en la página—,
 * que era la mitad del costo de cada petición, legítima u hostil. Son datos de
 * SIEMBRA (`prisma/seed.ts`): no los edita nadie desde la aplicación, así que
 * una memoria corta y compartida por el proceso es honesta y sirve también a
 * `sitemap.xml`, que corre fuera del render de React (donde `React.cache` no
 * aplica).
 *
 * **Los NEGOCIOS nunca se memorizan**: lo que el admin publica o rechaza tiene
 * que verse en la siguiente petición, sin excepción.
 */
export async function obtenerCatalogosDeLaRaiz(): Promise<CatalogosDeLaRaiz> {
  const ahora = Date.now();
  if (catalogosEnMemoria && ahora - catalogosEnMemoria.leidoEn < VIGENCIA_CATALOGOS_MS) {
    return catalogosEnMemoria.lectura;
  }

  const lectura = leerCatalogosDeLaRaiz();
  catalogosEnMemoria = { leidoEn: ahora, lectura };
  // Una lectura fallida no se queda guardada 30 segundos: si la base no
  // responde, la siguiente petición vuelve a intentarlo.
  lectura.catch(() => {
    if (catalogosEnMemoria?.lectura === lectura) catalogosEnMemoria = null;
  });
  return lectura;
}

/**
 * Negocios publicados con un giro asignado, opcionalmente acotados a una
 * colonia del catálogo (spec `directorio-publico`, requirements de las
 * páginas de giro y de giro+colonia).
 *
 * **Sin importar la categoría**: el giro manda (PRD §8). Mismo filtro de
 * estado, misma proyección de campos públicos y mismo orden determinista que
 * el listado por categoría, para que la tarjeta se vea igual en los dos.
 */
export async function obtenerNegociosPublicadosPorGiro(
  giroSlug: string,
  coloniaSlug?: string,
): Promise<NegocioListado[]> {
  const filas = await obtenerPrisma().negocio.findMany({
    where: {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      giros: { some: { slug: giroSlug } },
      ...(coloniaSlug ? { colonia: { slug: coloniaSlug } } : {}),
    },
    orderBy: [{ publicadoEn: "desc" }, { nombre: "asc" }],
    select: CAMPOS_LISTADO,
  });
  return filas.map(aListado);
}

/**
 * Cuántos negocios publicados tiene una página de giro (o de giro+colonia).
 * Lo usa la metadata para decidir el `noindex` de lo vacío sin traerse las
 * filas que la página ya va a leer por su cuenta.
 */
export async function contarNegociosPublicadosPorGiro(
  giroSlug: string,
  coloniaSlug?: string,
): Promise<number> {
  return obtenerPrisma().negocio.count({
    where: {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      giros: { some: { slug: giroSlug } },
      ...(coloniaSlug ? { colonia: { slug: coloniaSlug } } : {}),
    },
  });
}

/**
 * Colonias con al menos un negocio publicado de ese giro: la navegación de la
 * página de giro solo ofrece opciones que llevan a algo (una opción que lleva
 * a una página vacía sería, además, un enlace a contenido que no se indexa).
 */
export async function obtenerColoniasConNegociosPublicadosDeGiro(
  giroSlug: string,
): Promise<ColoniaCatalogo[]> {
  return obtenerPrisma().colonia.findMany({
    where: {
      negocios: {
        some: {
          estado: ESTADO_NEGOCIO_PUBLICADO,
          giros: { some: { slug: giroSlug } },
        },
      },
    },
    orderBy: { id: "asc" },
    select: { nombre: true, slug: true },
  });
}

/**
 * Giros que el admin le asignó a un negocio PUBLICADO, para enlazarlos desde
 * su ficha. Lista vacía si el negocio no existe, no está publicado o todavía
 * no tiene giros: los tres casos se ven igual desde afuera.
 */
export async function obtenerGirosDeNegocioPublicado(
  id: string,
): Promise<GiroCatalogo[]> {
  return obtenerPrisma().giro.findMany({
    where: {
      negocios: { some: { id, estado: ESTADO_NEGOCIO_PUBLICADO } },
    },
    orderBy: { id: "asc" },
    select: { nombre: true, slug: true },
  });
}

/** Lo que el sitemap necesita de la base, ya sin nada sin publicar. */
export type DatosDelSitemap = {
  categorias: CategoriaCatalogo[];
  /** Slugs de giro con al menos un negocio publicado. */
  giros: string[];
  /** Pares con al menos un negocio publicado, sin repetir. */
  pares: Array<{ giroSlug: string; coloniaSlug: string }>;
  fichas: Array<{ id: string; nombre: string; publicadoEn: Date | null }>;
};

/**
 * Todo lo que el sitemap publica, con un número FIJO de consultas: los
 * catálogos por un lado y **una sola** lectura de los negocios publicados con
 * su colonia y sus giros. Nada de una consulta por combinación posible: hay
 * 49 × 21 ≈ 1 000 y solo un puñado tiene contenido (design.md §9).
 */
export async function obtenerDatosDelSitemap(): Promise<DatosDelSitemap> {
  const prisma = obtenerPrisma();
  const [categorias, publicados] = await Promise.all([
    prisma.categoria.findMany({
      orderBy: { id: "asc" },
      select: { nombre: true, slug: true },
    }),
    prisma.negocio.findMany({
      where: { estado: ESTADO_NEGOCIO_PUBLICADO },
      orderBy: [{ publicadoEn: "desc" }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        publicadoEn: true,
        colonia: { select: { slug: true } },
        giros: { select: { slug: true } },
      },
    }),
  ]);

  const giros = new Set<string>();
  const pares = new Map<string, { giroSlug: string; coloniaSlug: string }>();
  for (const negocio of publicados) {
    for (const giro of negocio.giros) {
      giros.add(giro.slug);
      // Un negocio con colonia "Otra" sin normalizar no aporta ningún par:
      // esa URL no existe porque la colonia no está en el catálogo.
      if (!negocio.colonia) continue;
      const coloniaSlug = negocio.colonia.slug;
      pares.set(`${giro.slug}-${coloniaSlug}`, { giroSlug: giro.slug, coloniaSlug });
    }
  }

  return {
    categorias,
    giros: [...giros],
    pares: [...pares.values()],
    fichas: publicados.map(({ id, nombre, publicadoEn }) => ({
      id,
      nombre,
      publicadoEn,
    })),
  };
}

/**
 * Ficha de un negocio publicado por identificador. Devuelve `null` tanto si
 * el identificador no existe como si el negocio no está publicado: quien
 * llama responde el mismo 404 en ambos casos, para no delatar que hay una
 * ficha en revisión (PRD §6.3 y §8).
 */
export async function obtenerNegocioPublicado(
  id: string,
): Promise<NegocioFicha | null> {
  const fila = await obtenerPrisma().negocio.findFirst({
    where: { id, estado: ESTADO_NEGOCIO_PUBLICADO },
    select: CAMPOS_FICHA,
  });
  if (!fila) return null;

  return {
    ...aListado(fila),
    categoriaNombre: fila.categoria.nombre,
    queOfreces: fila.queOfreces,
    telefonoFijo: fila.telefonoFijo,
    direccion: fila.direccion,
    horario: fila.horario,
    facebookUrl: fila.facebookUrl,
  };
}
