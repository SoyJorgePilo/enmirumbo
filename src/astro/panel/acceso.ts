/**
 * Las Actions `entrar` y `salir` del panel en Astro (change
 * `migrar-panel-admin-base-astro`, Fase 5a, design.md §2 y §4): lo que eran
 * `src/app/admin/accion-acceso.ts` y `accion-salir.ts`.
 *
 * SIN LÓGICA NUEVA: delegan en `ejecutarAcceso` y `ejecutarSalida`
 * (`src/lib/admin/entrar.ts`), que ya devuelven un destino cerrado. Aquí solo
 * se:
 *
 * - ata cada Action a su ruta (defensa en profundidad: el middleware ya lo
 *   hace con la tabla de `src/astro/acciones.ts`);
 * - adapta `Astro.cookies` al almacén de `src/lib/` (las opciones de
 *   `opcionesCookieSesion` pasan tal cual, sin agregar ninguna);
 * - pasan las cabeceras de la petición, de donde `src/lib/` saca la IP con
 *   `ipDeEncabezados` (nunca la IP que deduce el marco);
 * - obedece el destino SOLO si está en la lista cerrada; cualquier otro es
 *   `/admin`.
 *
 * `salir` no exige sesión (paridad con Next, decisión 3 del fundador): la
 * guarda del middleware la deja pasar solo en `/admin/cola`.
 */
import type { AstroCookieSetOptions } from "astro";

import type { AlmacenCookiesPanel } from "@/lib/admin/peticion";
import { type DestinoAcceso, ejecutarAcceso, ejecutarSalida } from "@/lib/admin/entrar";

/** La ruta de la pantalla de acceso: la única desde la que corre `entrar`. */
export const RUTA_DEL_ACCESO = "/admin";
/** La ruta de la cola: la única desde la que corre `salir`. */
export const RUTA_DE_LA_COLA = "/admin/cola";

/** Los ÚNICOS destinos que se obedecen (design.md §4). Ninguno lleva datos. */
export const DESTINOS_DEL_ACCESO: ReadonlySet<string> = new Set([
  "/admin",
  "/admin?error=incorrecta",
  "/admin?error=intentos",
  "/admin/cola",
  "/admin?salida=1",
]);

/** El desenlace de `entrar` o `salir`, cerrado. */
export type ResultadoDelAcceso =
  /** 303 a un destino de la lista cerrada. */
  | { tipo: "redirigir"; ruta: string }
  /** La Action se pidió desde una ruta que no es la suya: no hace nada. */
  | { tipo: "fuera-de-ruta" };

/** Lo que estas funciones usan de `Astro.cookies`. */
type CookiesDeAstro = {
  get(nombre: string): { value: string } | undefined;
  set(nombre: string, valor: string, opciones?: AstroCookieSetOptions): void;
};

/** Lo que las Actions usan del contexto de Astro (y lo que arman las pruebas). */
export type ContextoDelAcceso = {
  routePattern: string;
  request: Request;
  cookies: CookiesDeAstro;
};

/** `Astro.cookies` como el almacén de `src/lib/`. */
function almacenDe(cookies: CookiesDeAstro): AlmacenCookiesPanel {
  return {
    get: (nombre) => {
      const cookie = cookies.get(nombre);
      return cookie === undefined ? undefined : { value: cookie.value };
    },
    set: (nombre, valor, opciones) => cookies.set(nombre, valor, opciones),
  };
}

/** El destino de `src/lib/`, obedecido solo si está en la lista cerrada; si no, `/admin`. */
export function destinoDelAcceso(destino: DestinoAcceso): ResultadoDelAcceso {
  return DESTINOS_DEL_ACCESO.has(destino.ruta) ? destino : { tipo: "redirigir", ruta: RUTA_DEL_ACCESO };
}

/** El manejador de la Action `entrar` ("Entrar"). */
export async function entrarDesdeElFormulario(formData: FormData, contexto: ContextoDelAcceso): Promise<ResultadoDelAcceso> {
  if (contexto.routePattern !== RUTA_DEL_ACCESO) return { tipo: "fuera-de-ruta" };
  return destinoDelAcceso(await ejecutarAcceso(formData, contexto.request.headers, almacenDe(contexto.cookies)));
}

/** El manejador de la Action `salir` ("Salir"). */
export function salirDesdeElFormulario(contexto: ContextoDelAcceso): ResultadoDelAcceso {
  if (contexto.routePattern !== RUTA_DE_LA_COLA) return { tipo: "fuera-de-ruta" };
  return destinoDelAcceso(ejecutarSalida(contexto.request.headers, almacenDe(contexto.cookies)));
}
