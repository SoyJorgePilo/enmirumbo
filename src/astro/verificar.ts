/**
 * La pantalla "Confirma tu número" en Astro (change
 * `migrar-verificacion-sms-astro`, Fase 3b-2): lo que eran
 * `src/app/(publico)/registro/verificar/page.tsx` (lo que lee la página) y
 * `accion-confirmar.ts` / `accion-reenviar.ts` (los dos envíos). Spec
 * `registro-negocio` de T-016 y spec `plataforma-astro`, requirements de 3b-2.
 *
 * SIN LÓGICA NUEVA: todo se delega en `src/lib/verificacion/` —
 * `dependenciasDeVerificacion` (con la IP de las cabeceras, nunca la del
 * socket), `ejecutarConfirmacion`, `ejecutarReenvio`, `leerPaso`—, que
 * ya devuelven un destino cerrado (`DestinoVerificacion`). Aquí solo se:
 *
 * - adapta `Astro.cookies` al `AlmacenCookies` de `src/lib/` (los mismos
 *   atributos al leer, al conservar y al borrar; design.md §4);
 * - obedece el destino SOLO si está en la lista cerrada
 *   `DESTINOS_DE_VERIFICAR`; cualquier otro es "no encontrado" (design.md §3);
 * - arma lo que pinta la página: primero la configuración, después la cookie
 *   (el mismo orden que la página de Next; design.md §2.3 y §5).
 *
 * Con la capacidad apagada, la tabla de Actions ni siquiera llama a estos
 * manejadores (`puedeCorrer`, `src/astro/acciones.ts`), y la página responde
 * la 404 antes de mirar la cookie.
 */
import type { AstroCookieSetOptions } from "astro";

import type { ErrorFormularioVerificar, ErrorReenvioVerificar } from "@/components/registro/formulario-verificar-codigo";
import type { MetadatosDePagina } from "@/astro/metadatos";
import {
  type AlmacenCookies,
  type DestinoVerificacion,
  dependenciasDeVerificacion,
  ejecutarConfirmacion,
  ejecutarReenvio,
} from "@/lib/verificacion/acciones";
import { leerConfiguracionVerificacion } from "@/lib/verificacion/config";
import { COOKIE_PASO, leerPaso } from "@/lib/verificacion/paso";

/** La ruta de la pantalla: la única desde la que corren `confirmar` y `reenviar`. */
export const RUTA_DE_VERIFICAR = "/registro/verificar";

/** La pantalla no se indexa ni se siguen sus enlaces (la `metadata` de la página de Next). */
export const METADATOS_VERIFICAR: MetadatosDePagina = { robots: { index: false, follow: false } };

const ERRORES_CODIGO: readonly ErrorFormularioVerificar[] = ["incompleto", "no-coincide", "vencido", "proveedor"];
const ERRORES_REENVIO: readonly ErrorReenvioVerificar[] = ["espera-reenvio", "cupo"];

/**
 * Los ÚNICOS destinos que se obedecen (design.md §3). Hoy `src/lib/` no puede
 * devolver otra cosa; esto es defensa en profundidad.
 */
export const DESTINOS_DE_VERIFICAR: ReadonlySet<string> = new Set([
  "/registro/gracias?verificado=1",
  "/registro/gracias?agotado=1",
  RUTA_DE_VERIFICAR,
  ...ERRORES_CODIGO.map((e) => `${RUTA_DE_VERIFICAR}?error=${e}`),
  ...ERRORES_REENVIO.map((e) => `${RUTA_DE_VERIFICAR}?errorReenvio=${e}`),
]);

/** El desenlace de un envío, cerrado. */
export type ResultadoDeVerificar =
  /** 303 a un destino de la lista cerrada. */
  | { tipo: "redirigir"; ruta: string }
  /** La 404 de no encontrado (sin credencial válida, ficha borrada, destino fuera de la lista). */
  | { tipo: "no-encontrado" }
  /** La Action se pidió desde una ruta que no es la suya: no hace nada. */
  | { tipo: "fuera-de-ruta" };

/** Lo que estas funciones usan de `Astro.cookies`. */
type CookiesDeAstro = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones?: AstroCookieSetOptions): void;
};

/** Lo que las Actions usan del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDeVerificar = {
  routePattern: string;
  request: Request;
  cookies: CookiesDeAstro;
};

/**
 * `Astro.cookies` como el almacén de `src/lib/`: las opciones (`httpOnly`,
 * `sameSite`, `path`, `maxAge` en segundos y `secure`) pasan tal cual las
 * arma `opcionesCookiePaso`, sin agregar ninguna.
 */
export function almacenDe(cookies: CookiesDeAstro): AlmacenCookies {
  return {
    get: (nombre) => {
      const cookie = cookies.get(nombre);
      return cookie === undefined ? undefined : { value: cookie.value };
    },
    set: (nombre, valor, opciones) => cookies.set(nombre, valor, opciones as AstroCookieSetOptions),
  };
}

/** El destino de `src/lib/`, obedecido solo si está en la lista cerrada. */
export function destinoDeVerificar(destino: DestinoVerificacion): ResultadoDeVerificar {
  if (destino.tipo === "redirigir" && DESTINOS_DE_VERIFICAR.has(destino.ruta)) return destino;
  return { tipo: "no-encontrado" };
}

/** El manejador de la Action `confirmar` ("Confirmar mi número"). */
export async function confirmarDesdeElFormulario(formData: FormData, contexto: ContextoDeVerificar): Promise<ResultadoDeVerificar> {
  // Defensa en profundidad: el middleware ya ata la Action a su ruta.
  if (contexto.routePattern !== RUTA_DE_VERIFICAR) return { tipo: "fuera-de-ruta" };
  const dependencias = await dependenciasDeVerificacion(contexto.request.headers);
  return destinoDeVerificar(await ejecutarConfirmacion(formData, dependencias, almacenDe(contexto.cookies)));
}

/** El manejador de la Action `reenviar` ("Reenviar el código"). */
export async function reenviarDesdeElFormulario(contexto: ContextoDeVerificar): Promise<ResultadoDeVerificar> {
  if (contexto.routePattern !== RUTA_DE_VERIFICAR) return { tipo: "fuera-de-ruta" };
  const dependencias = await dependenciasDeVerificacion(contexto.request.headers);
  return destinoDeVerificar(await ejecutarReenvio(dependencias, almacenDe(contexto.cookies)));
}

// ── Lo que pinta la página ──────────────────────────────────────────────────

export type PantallaDeVerificar =
  | { tipo: "no-encontrado" }
  | {
      tipo: "pantalla";
      ultimosCuatroDigitos: string;
      errorCodigo: ErrorFormularioVerificar | undefined;
      errorReenvio: ErrorReenvioVerificar | undefined;
    };

/** El PRIMER valor de ese parámetro, solo si está en la lista; si no, ninguno. */
function deLaLista<T extends string>(lista: readonly T[], valor: string | null): T | undefined {
  return (lista as readonly string[]).includes(valor ?? "") ? (valor as T) : undefined;
}

/**
 * Lo que necesita `/registro/verificar`, en este orden (el de la página de
 * Next):
 *
 * 1. la configuración: con la capacidad apagada o a medias, "no encontrado"
 *    SIN leer la cookie (el requirement rey de T-016);
 * 2. el resultado de la Action: si ya dijo "no encontrado" (sin credencial
 *    válida, ficha borrada, envío ilegible), la 404 aunque la cookie valga;
 * 3. la cookie de paso firmada: sin una válida, "no encontrado".
 *
 * No consulta la base ni escribe nada: pedir la pantalla no tiene efectos.
 */
export function cargarPantalla(
  url: URL,
  cookies: Pick<CookiesDeAstro, "get">,
  resultadoDeLaAccion: { error?: unknown } | undefined,
): PantallaDeVerificar {
  const configuracion = leerConfiguracionVerificacion();
  if (!configuracion) return { tipo: "no-encontrado" };
  if (resultadoDeLaAccion?.error) return { tipo: "no-encontrado" };
  const paso = leerPaso(cookies.get(COOKIE_PASO)?.value, configuracion.secreto);
  if (!paso) return { tipo: "no-encontrado" };
  return {
    tipo: "pantalla",
    ultimosCuatroDigitos: paso.ultimosCuatroDigitos,
    errorCodigo: deLaLista(ERRORES_CODIGO, url.searchParams.get("error")),
    errorReenvio: deLaLista(ERRORES_REENVIO, url.searchParams.get("errorReenvio")),
  };
}
