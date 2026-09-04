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

/** Lo que la tarjeta del listado necesita, y nada más. */
export type NegocioListado = {
  id: string;
  nombre: string;
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
} as const;

const CAMPOS_FICHA = {
  ...CAMPOS_LISTADO,
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
};

/** La colonia del catálogo manda; si no la hay, el texto libre de "Otra". */
function aListado(fila: FilaListado): NegocioListado {
  return {
    id: fila.id,
    nombre: fila.nombre,
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
 * igualdad, por nombre (requirement del listado; SQLite deja los `publicadoEn`
 * nulos al final en orden descendente).
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
    queOfreces: fila.queOfreces,
    telefonoFijo: fila.telefonoFijo,
    direccion: fila.direccion,
    horario: fila.horario,
    facebookUrl: fila.facebookUrl,
  };
}
