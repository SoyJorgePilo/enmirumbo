/**
 * El registro de un negocio en Astro (change `migrar-registro-astro`, Fase
 * 3b-1): lo que eran `src/app/(publico)/registro/page.tsx` (los catálogos que
 * lee la página) y `accion.ts` (el envío). Spec `registro-negocio` y spec
 * `plataforma-astro`, "El envío del registro sin JavaScript se comporta igual
 * que en Next" y "Con la bandera encendida, el registro llega a la
 * verificación igual que en Next".
 *
 * SIN LÓGICA NUEVA: todo se delega en `src/lib/`, en el orden de `accion.ts`:
 * la IP de las cabeceras → `procesarRegistro` (la ficha se guarda PRIMERO) →
 * `dependenciasDeVerificacion` → `pedirCodigoParaFicha` → la cookie de paso.
 * Lo único que cambia es la forma de devolver el desenlace: en vez de lanzar
 * `redirect()`, se devuelve un resultado cerrado que obedece el middleware
 * (`src/astro/acciones.ts`): el 303 a un destino FIJO o, ante un error, el
 * estado para volver a pintar el formulario en la misma respuesta (sin PRG,
 * como en Next; design.md §3). Los valores capturados no se guardan en
 * ningún lado: viajan solo en esa respuesta.
 */
import type { AstroCookieSetOptions } from "astro";

import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { procesarRegistro } from "@/lib/registro/procesar";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO } from "@/lib/registro/textos";
import {
  ESTADO_INICIAL_REGISTRO,
  VALORES_VACIOS_REGISTRO,
  type ElementoCatalogo,
  type EstadoAccionRegistro,
} from "@/lib/registro/tipos";
import { dependenciasDeVerificacion } from "@/lib/verificacion/acciones";
import { pedirCodigoParaFicha } from "@/lib/verificacion/flujo";
import { COOKIE_PASO, firmarPaso, opcionesCookiePaso } from "@/lib/verificacion/paso";

/** La ruta de la página del formulario: la única desde la que corre la Action. */
export const RUTA_DE_REGISTRO = "/registro";

/** Los dos destinos del éxito. Fijos: nunca salen del envío ni del `Referer`. */
export const RUTA_GRACIAS = "/registro/gracias";
export const RUTA_VERIFICAR = "/registro/verificar";

/** El desenlace de un envío, cerrado. */
export type ResultadoDeRegistrar =
  /** 303 a gracias o, con la bandera encendida y el código pedido, a verificar. */
  | { tipo: "redirigir"; ruta: typeof RUTA_GRACIAS | typeof RUTA_VERIFICAR }
  /** 200: la misma página con los errores y lo capturado (salvo foto y casilla). */
  | { tipo: "repintar"; estado: EstadoAccionRegistro }
  /** La Action se pidió desde una ruta que no es la suya: no hace nada. */
  | { tipo: "fuera-de-ruta" };

/** Lo que la Action usa del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDeRegistrar = {
  routePattern: string;
  request: Request;
  cookies: { set(nombre: string, valor: string, opciones?: AstroCookieSetOptions): void };
};

// ── El envío (pegamento copiado de `accion.ts`) ─────────────────────────────

/** El manejador de la Action `registrar` (`src/actions/index.ts`). */
export async function registrarDesdeElFormulario(
  formData: FormData,
  contexto: ContextoDeRegistrar,
): Promise<ResultadoDeRegistrar> {
  // Defensa en profundidad: el middleware ya ata la Action a su ruta, pero
  // Astro, solo, ejecutaría `?_action=registrar` en cualquier página.
  if (contexto.routePattern !== RUTA_DE_REGISTRO) return { tipo: "fuera-de-ruta" };

  const encabezados = contexto.request.headers;
  const resultado = await procesarRegistro(formData, {
    prisma: obtenerPrisma(),
    ip: ipDeEncabezados(encabezados),
  });

  if (!resultado.exito) return { tipo: "repintar", estado: resultado.estado };

  // Con la capacidad apagada esto es `null` y no cuesta ni una consulta: no se
  // construye el adaptador del proveedor ni se lee ninguna credencial.
  const dependencias = await dependenciasDeVerificacion(encabezados);
  if (dependencias) {
    const paso = await pedirCodigoParaFicha(resultado.ficha, dependencias.contexto);
    if (paso) {
      // El identificador del negocio viaja DENTRO de la cookie firmada, nunca
      // en la URL (design.md §3 de T-016).
      contexto.cookies.set(
        COOKIE_PASO,
        firmarPaso(paso, dependencias.contexto.secreto),
        opcionesCookiePaso(dependencias.esHttps),
      );
      return { tipo: "redirigir", ruta: RUTA_VERIFICAR };
    }
  }

  return { tipo: "redirigir", ruta: RUTA_GRACIAS };
}

/**
 * El estado cuando la Action no llegó a correr (`ActionError` de Astro;
 * design.md §3), SIN leer la base: con un cuerpo de más de 6 MiB, el mensaje
 * de la foto; con cualquier otra falla (un cuerpo que no es formulario, una
 * falla interna), el error general de siempre. Los valores se pierden porque
 * Astro corta sin leer el cuerpo.
 */
export function estadoTrasUnaFalla(codigo: string | undefined): EstadoAccionRegistro {
  const errores =
    codigo === "CONTENT_TOO_LARGE"
      ? { foto: MENSAJES_ERROR_FOTO.demasiadoGrande }
      : { general: MENSAJES_ERROR_REGISTRO.servidor };
  return { errores, valores: VALORES_VACIOS_REGISTRO };
}

// ── Lo que pinta la página ──────────────────────────────────────────────────

const esObjetoPlano = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * ¿Tiene la forma de un `EstadoAccionRegistro`? Errores de texto y valores de
 * texto (o la casilla de entregas, booleana). Lo usa la tabla de Actions para
 * no obedecer un resultado con otra forma, y la página para no pintarlo.
 */
export function esEstadoDeRegistro(valor: unknown): valor is EstadoAccionRegistro {
  if (!esObjetoPlano(valor) || !esObjetoPlano(valor.errores) || !esObjetoPlano(valor.valores)) return false;
  return (
    Object.values(valor.errores).every((v) => typeof v === "string") &&
    Object.values(valor.valores).every((v) => typeof v === "string" || typeof v === "boolean")
  );
}

/**
 * El estado con el que se pinta `/registro`: el de la Action si la respuesta
 * es la de un envío con error (`Astro.getActionResult`), si no, el vacío.
 */
export function estadoDelEnvio(resultado: { data?: unknown; error?: unknown } | undefined): EstadoAccionRegistro {
  if (!resultado || resultado.error || !esEstadoDeRegistro(resultado.data)) return ESTADO_INICIAL_REGISTRO;
  return resultado.data;
}

/**
 * Las categorías y colonias de la base, como las leía la página de Next. Si
 * la base no responde, lanza: la página responde la 500.
 */
export async function catalogosDelRegistro(): Promise<{ categorias: ElementoCatalogo[]; colonias: ElementoCatalogo[] }> {
  const prisma = obtenerPrisma();
  const [categorias, colonias] = await Promise.all([
    prisma.categoria.findMany({ orderBy: { id: "asc" } }),
    prisma.colonia.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { categorias, colonias };
}
