/**
 * La mejora progresiva de `/editar/[token]` (change
 * `migrar-enlace-gestion-astro`, Fase 4, design.md §4.2; spec
 * `plataforma-astro`, "Con JavaScript, la edición conserva la experiencia de
 * hoy sin isla de React"): el MISMO módulo de `/registro`
 * (`src/astro/registro-cliente.ts`), configurado para esta página.
 *
 * - La ruta sale del propio documento: el `action` del formulario, ya
 *   resuelto por el navegador (`/editar/<token>?_action=editar`), sin la
 *   consulta. Solo se usa para comparar la URL final del `fetch` (del mismo
 *   origen) y para navegar a su confirmación o volver a cargarla; no se manda
 *   a ningún otro lado.
 * - El texto del error general de la edición y esta configuración viajan
 *   aquí, no en un atributo `data-` del HTML ni en el módulo de `/registro`.
 *
 * Sin el formulario de un enlace (p. ej. en la 404), no hace nada.
 */
import { type ConfigDelFormulario, type VentanaDelRegistro, mejorarFormulario } from "@/astro/registro-cliente";
import { ERROR_GUARDAR_EDICION } from "@/lib/gestion/textos";

/** Un segmento de enlace de gestión: lo que ve el navegador en `/editar/<segmento>`. */
const RUTA_DE_EDICION = /^\/editar\/[A-Za-z0-9_-]+$/;

/**
 * La configuración de la edición a partir del `action` del formulario (ya
 * resuelto por el navegador): su ruta sin la consulta, su ÚNICA confirmación,
 * sin ejemplo al cargar (como Next) y recargando ante la 404 (decisión 2 del
 * fundador). `null` si no es la de un enlace de gestión: entonces no se mejora
 * nada.
 */
export function configDeEdicion(accion: string, textoErrorGeneral: string): ConfigDelFormulario | null {
  let url: URL;
  try {
    url = new URL(accion);
  } catch {
    return null;
  }
  if (!RUTA_DE_EDICION.test(url.pathname)) return null;
  return {
    rutaDelFormulario: url.pathname,
    rutasDeExito: [`${url.pathname}/gracias`],
    textoErrorGeneral,
    ejemploAlCargar: false,
    alNoEncontrado: "recargar",
  };
}

export function mejorarFormularioDeEdicion(documento: Document, ventana: VentanaDelRegistro): () => void {
  const formulario = documento.querySelector("form");
  const config = formulario ? configDeEdicion(formulario.action, ERROR_GUARDAR_EDICION) : null;
  return config ? mejorarFormulario(documento, ventana, config) : () => {};
}
