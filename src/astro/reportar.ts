/**
 * El reporte de un negocio en Astro (change `migrar-formularios-publicos-astro`,
 * Fase 3a): lo que eran `src/app/(publico)/negocio/[ficha]/reportar/page.tsx`
 * (lo que lee la página) y `accion.ts` (el envío). Spec `directorio-publico`,
 * requirements del formulario, de la validación, de la confirmación y del
 * anti-abuso; spec `plataforma-astro`, "El envío del reporte se comporta
 * igual que en Next".
 *
 * SIN LÓGICA NUEVA: todo se delega en `src/lib/` y el pegamento
 * (`motivoDelEnvio`, `textoDelEnvio`, la regla de HTTPS) se copió tal cual de
 * `accion.ts`. Lo único que cambia es la forma de devolver el desenlace: en
 * vez de lanzar `redirect()`/`notFound()`, se devuelve un resultado cerrado y
 * el middleware responde el 303 o deja pintar la 404 (`src/astro/acciones.ts`).
 *
 * EL IDENTIFICADOR SALE DE LA URL, nunca del envío. En Next viajaba como
 * campo oculto sin firmar (`$ACTION_1:1`, hallazgo M3); aquí el formulario no
 * lo lleva y un `negocioId`, `$ACTION_*` o `destino` en el cuerpo se ignoran.
 * La ruta de vuelta y el `Path` de la cookie se arman con lo que devolvió la
 * BASE (`construirSegmentoFicha`), nunca con texto del envío.
 */
import type { AstroCookieSetOptions } from "astro";

import type { MetadatosDePagina } from "@/astro/metadatos";
import type { ErrorFormularioReporte } from "@/components/reportes/formulario-reporte";
import { obtenerNegocioPublicado } from "@/lib/directorio";
import { construirSegmentoFicha, extraerIdDeSegmentoFicha } from "@/lib/ficha-url";
import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { CAMPO_TRAMPA } from "@/lib/registro/validacion";
import {
  NOMBRE_COOKIE_BORRADOR,
  codificarBorrador,
  decodificarBorrador,
  opcionesCookieBorrador,
} from "@/lib/reportes/borrador";
import { crearReporte } from "@/lib/reportes/crear";
import { LIMITE_COMENTARIO_REPORTE } from "@/lib/reportes/textos";

/** La ruta de la página del formulario: la única desde la que corre la Action. */
export const RUTA_DE_REPORTAR = "/negocio/[ficha]/reportar";

/** El formulario y su confirmación no se indexan (requirement "La página de reporte no se indexa"). */
export const METADATOS_REPORTAR: MetadatosDePagina = { robots: { index: false, follow: false } };

/** El desenlace de un envío, cerrado. */
export type ResultadoDeReportar =
  /** 303 a esta ruta del sitio (la confirmación o el formulario con su error). */
  | { tipo: "redirigir"; ruta: string }
  /** La misma 404 que un `GET` a esa URL: sin cookie y sin escribir. */
  | { tipo: "no-encontrado" }
  /** La Action se pidió desde una ruta que no es la suya: no hace nada. */
  | { tipo: "fuera-de-ruta" };

/** Lo que la Action usa del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDeReportar = {
  routePattern: string;
  params: Record<string, string | undefined>;
  request: Request;
  cookies: { set(nombre: string, valor: string, opciones?: AstroCookieSetOptions): void };
};

const ERRORES_VALIDOS: readonly ErrorFormularioReporte[] = ["motivo", "comentario", "cupo", "servidor"];

/** `?error=`: solo un código de la lista cerrada; cualquier otro se ignora. */
export function errorDelFormulario(valor: string | null): ErrorFormularioReporte | undefined {
  return (ERRORES_VALIDOS as readonly string[]).includes(valor ?? "") ? (valor as ErrorFormularioReporte) : undefined;
}

/** El negocio publicado de este segmento, o `null` (no existe, no está publicado o no trae identificador). */
async function negocioDelSegmento(segmento: string | undefined) {
  const id = extraerIdDeSegmentoFicha(segmento ?? "");
  return id ? obtenerNegocioPublicado(id) : null;
}

const rutaDelFormulario = (negocio: { nombre: string; id: string }) =>
  `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}/reportar`;

// ── Lo que pinta la página ──────────────────────────────────────────────────

export type CargaDeReportar =
  | { tipo: "no-encontrado" }
  | {
      tipo: "formulario";
      nombre: string;
      hrefFicha: string;
      error: ErrorFormularioReporte | undefined;
      comentarioPrevio: string;
    };

/**
 * Lo que necesita `/negocio/[ficha]/reportar`. Lo que el vecino ya había
 * escrito vuelve por la cookie de borrador, NO por la URL (hallazgo M2): en la
 * URL solo viaja el código del error.
 */
export async function cargarReportar(
  segmento: string | undefined,
  error: string | null,
  borrador: string | undefined,
): Promise<CargaDeReportar> {
  const negocio = await negocioDelSegmento(segmento);
  if (!negocio) return { tipo: "no-encontrado" };
  return {
    tipo: "formulario",
    nombre: negocio.nombre,
    hrefFicha: `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`,
    error: errorDelFormulario(error),
    comentarioPrevio: decodificarBorrador(borrador, LIMITE_COMENTARIO_REPORTE),
  };
}

// ── El envío (pegamento copiado de `accion.ts`) ─────────────────────────────

/**
 * Un grupo de radios manda un solo valor. Varios `motivo` en el mismo envío
 * son un POST manipulado: se descarta el envío entero en vez de quedarse con
 * el primero.
 */
function motivoDelEnvio(formData: FormData): unknown {
  const valores = formData.getAll("motivo");
  return valores.length === 1 ? valores[0] : undefined;
}

/** Texto de un campo; un `File` colado en el envío cuenta como vacío. */
function textoDelEnvio(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Misma regla que la cookie del panel: en producción, solo por HTTPS. */
function sirviendoPorHttps(cabeceras: Headers): boolean {
  const protocolo = cabeceras.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (
    protocolo === "https" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/** El manejador de la Action `reportar` (`src/actions/index.ts`). */
export async function reportarDesdeElFormulario(
  formData: FormData,
  contexto: ContextoDeReportar,
): Promise<ResultadoDeReportar> {
  // Defensa en profundidad: el middleware ya ata la Action a su ruta, pero
  // Astro, solo, ejecutaría `?_action=reportar` en cualquier página.
  if (contexto.routePattern !== RUTA_DE_REPORTAR) return { tipo: "fuera-de-ruta" };

  const comentario = textoDelEnvio(formData, "comentario");

  // La ruta se arma con lo que devuelve la BASE: si el segmento no trae un
  // identificador de una ficha publicada, aquí se acaba, sin cookie.
  const negocio = await negocioDelSegmento(contexto.params.ficha);
  if (!negocio) return { tipo: "no-encontrado" };
  const rutaFormulario = rutaDelFormulario(negocio);

  const resultado = await crearReporte(obtenerPrisma(), {
    negocioId: negocio.id,
    motivo: motivoDelEnvio(formData),
    comentario,
    trampa: textoDelEnvio(formData, CAMPO_TRAMPA),
    ip: ipDeEncabezados(contexto.request.headers),
  });

  // Dejó de estar publicado entre la lectura y el alta: el mismo 404.
  if (resultado.resultado === "no-encontrado") return { tipo: "no-encontrado" };

  const hayError = resultado.resultado !== "creado" && resultado.resultado !== "descartado-silencioso";

  // El borrador se escribe (o se borra) SIEMPRE, no solo al fallar.
  const borrador = hayError ? codificarBorrador(comentario, LIMITE_COMENTARIO_REPORTE) : "";
  const opciones = opcionesCookieBorrador(rutaFormulario, sirviendoPorHttps(contexto.request.headers));
  if (borrador === "") {
    contexto.cookies.set(NOMBRE_COOKIE_BORRADOR, "", { ...opciones, maxAge: 0 });
  } else {
    contexto.cookies.set(NOMBRE_COOKIE_BORRADOR, borrador, opciones);
  }

  // Guardado, honeypot lleno o tope de pendientes: la MISMA confirmación.
  if (!hayError) return { tipo: "redirigir", ruta: `${rutaFormulario}/gracias` };

  const error = resultado.resultado === "cupo-agotado" ? "cupo" : resultado.error;
  return { tipo: "redirigir", ruta: `${rutaFormulario}?error=${error}` };
}

/**
 * Destino cuando la Action no llegó a correr (`ActionError` de Astro: cuerpo
 * de más de 6 MiB, un cuerpo que no es formulario o una falla interna): de
 * vuelta al formulario con el error `servidor`, sin escribir nada y sin
 * cookie, o la 404 si la ficha no está publicada (design.md §6).
 */
export async function destinoTrasUnaFalla(contexto: Pick<ContextoDeReportar, "params">): Promise<ResultadoDeReportar> {
  const negocio = await negocioDelSegmento(contexto.params.ficha);
  if (!negocio) return { tipo: "no-encontrado" };
  return { tipo: "redirigir", ruta: `${rutaDelFormulario(negocio)}?error=servidor` };
}
