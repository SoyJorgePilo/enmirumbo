/**
 * El modo edición del enlace de gestión en Astro (change
 * `migrar-enlace-gestion-astro`, Fase 4): lo que eran
 * `src/app/(gestion)/editar/[token]/page.tsx` (lo que lee la página) y
 * `accion.ts` (el envío). Spec `registro-negocio` (requirements del enlace de
 * gestión) y spec `plataforma-astro`, requirements de la Fase 4.
 *
 * SIN LÓGICA NUEVA: todo se delega en `src/lib/gestion/`, en el orden de
 * `accion.ts`: la IP de las cabeceras → `procesarEdicion` (campo trampa, cupo
 * propio, token, validación del registro, duplicado contra OTRA ficha y una
 * sola pendiente). Lo único que cambia es la forma de devolver el desenlace:
 * un resultado cerrado que obedece el middleware (`src/astro/acciones.ts`).
 *
 * EL TOKEN:
 *
 * - sale SIEMPRE del segmento de la ruta (`contexto.params.token`), nunca del
 *   cuerpo, del `Referer` ni de la consulta (en Next viajaba ligado en el
 *   cuerpo con `.bind`);
 * - el único destino de un 303 es `/editar/<ese token>/gracias`, y solo si el
 *   segmento tiene forma de token (`destinoDeEditar`);
 * - este módulo NO escribe nada al log: ni la ruta, ni los parámetros, ni el
 *   cuerpo (`src/lib/gestion` solo registra el tipo de evento).
 */
import type { MetadatosDePagina } from "@/astro/metadatos";
import { esEstadoDeRegistro } from "@/astro/registro";
import { obtenerFormularioDeEdicion } from "@/lib/gestion/consultas";
import { procesarEdicion } from "@/lib/gestion/procesar-edicion";
import { ERROR_GUARDAR_EDICION, TITULO_EDICION } from "@/lib/gestion/textos";
import { RUTA_EDICION, pareceToken } from "@/lib/gestion/token";
import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { VALORES_VACIOS_REGISTRO, type ElementoCatalogo, type EstadoAccionRegistro } from "@/lib/registro/tipos";

/** El patrón de la pantalla: la única ruta desde la que corre la Action `editar`. */
export const RUTA_DE_EDITAR = `${RUTA_EDICION}/[token]`;

/** La `metadata` de la página de Next: el título (sin el nombre del negocio) y no indexar. */
export const METADATOS_EDICION: MetadatosDePagina = { title: TITULO_EDICION, robots: { index: false, follow: false } };

/** La de la confirmación. */
export const METADATOS_GRACIAS_EDICION: MetadatosDePagina = { robots: { index: false, follow: false } };

/** El desenlace de un envío, cerrado. */
export type ResultadoDeEditar =
  /** 303 a `/editar/<token>/gracias` (éxito o campo trampa). */
  | { tipo: "redirigir"; ruta: string }
  /** 200: la misma página con los errores y lo capturado (sin PRG, como Next). */
  | { tipo: "repintar"; estado: EstadoAccionRegistro }
  /** El token no resuelve: la 404 de no encontrado. */
  | { tipo: "no-encontrado" }
  /** La Action se pidió desde una ruta que no es la suya: no hace nada. */
  | { tipo: "fuera-de-ruta" };

/** Lo que la Action usa del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDeEditar = {
  routePattern: string;
  request: Request;
  params: Record<string, string | undefined>;
};

/** El ÚNICO destino del 303 para ese segmento, o `null` si no tiene forma de token. */
export function destinoDeEditar(token: string | undefined): string | null {
  return token !== undefined && pareceToken(token) ? `${RUTA_EDICION}/${token}/gracias` : null;
}

/** El manejador de la Action `editar` (`src/actions/index.ts`). */
export async function editarDesdeElFormulario(formData: FormData, contexto: ContextoDeEditar): Promise<ResultadoDeEditar> {
  // Defensa en profundidad: el middleware ya ata la Action a su ruta.
  if (contexto.routePattern !== RUTA_DE_EDITAR) return { tipo: "fuera-de-ruta" };
  const token = contexto.params.token ?? "";
  const resultado = await procesarEdicion(token, formData, {
    prisma: obtenerPrisma(),
    ip: ipDeEncabezados(contexto.request.headers),
  });
  if (resultado.exito) {
    const ruta = destinoDeEditar(token);
    return ruta ? { tipo: "redirigir", ruta } : { tipo: "no-encontrado" };
  }
  if (resultado.noEncontrado) return { tipo: "no-encontrado" };
  return { tipo: "repintar", estado: resultado.estado };
}

/**
 * El validador del destino de la entrada `editar` de la tabla: el 303 solo se
 * obedece si va EXACTAMENTE a la confirmación del token de la ruta pedida.
 */
export function destinoValidoDeEditar(ruta: string, contexto: Pick<ContextoDeEditar, "params">): boolean {
  const unico = destinoDeEditar(contexto.params.token);
  return unico !== null && ruta === unico;
}

/**
 * El estado cuando la Action no llegó a correr (`ActionError` de Astro:
 * cuerpo de más de 6 MiB o que no es formulario), SIN leer la base: el error
 * de la edición y los valores vacíos. Si el token no resuelve, la página pinta
 * la 404 igual.
 */
export function estadoTrasUnaFallaDeEdicion(): EstadoAccionRegistro {
  return { errores: { general: ERROR_GUARDAR_EDICION }, valores: VALORES_VACIOS_REGISTRO };
}

// ── Lo que pinta la página ──────────────────────────────────────────────────

export type PantallaDeEditar =
  | { tipo: "no-encontrado" }
  | {
      tipo: "pantalla";
      categorias: ElementoCatalogo[];
      colonias: ElementoCatalogo[];
      estado: EstadoAccionRegistro;
      tieneEdicionPendiente: boolean;
    };

/**
 * Lo que necesita `/editar/[token]`, en este orden:
 *
 * 1. el token, SIEMPRE primero: si no resuelve, la 404, aunque haya un
 *    resultado de la Action (un envío nunca pinta el formulario de un enlace
 *    que no resuelve);
 * 2. el resultado de la Action: si dijo "no encontrado", la 404; si es un
 *    estado de re-pintado válido, ese estado;
 * 3. si no, lo publicado o lo último que el dueño mandó.
 *
 * Si la base no responde, lanza: la página responde la 500.
 */
export async function cargarEdicion(
  token: string | undefined,
  resultadoDeLaAccion: { data?: unknown; error?: unknown } | undefined,
): Promise<PantallaDeEditar> {
  const prisma = obtenerPrisma();
  const edicion = await obtenerFormularioDeEdicion(prisma, token ?? "");
  if (!edicion) return { tipo: "no-encontrado" };
  if (resultadoDeLaAccion?.error) return { tipo: "no-encontrado" };
  const [categorias, colonias] = await Promise.all([
    prisma.categoria.findMany({ orderBy: { id: "asc" } }),
    prisma.colonia.findMany({ orderBy: { id: "asc" } }),
  ]);
  const estado =
    resultadoDeLaAccion && esEstadoDeRegistro(resultadoDeLaAccion.data)
      ? resultadoDeLaAccion.data
      : { errores: {}, valores: edicion.valores };
  return { tipo: "pantalla", categorias, colonias, estado, tieneEdicionPendiente: edicion.tieneEdicionPendiente };
}
