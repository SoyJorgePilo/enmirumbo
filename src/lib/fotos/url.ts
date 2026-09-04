/**
 * Validador de render de la foto (spec `directorio-publico`, requirement
 * "Solo se pinta la foto que generó el servidor"; cierre del hallazgo M1 de
 * T-004).
 *
 * Recibe lo que está guardado en `Negocio.fotoClave` —que puede ser
 * cualquier cosa: una URL externa, un `data:`, una ruta con `..`, una cadena
 * vacía— y devuelve o la dirección interna que construye el servidor, o
 * `null`. Con `null`, la vista se comporta como si el negocio no tuviera
 * foto. Ningún componente arma esta dirección por su cuenta.
 *
 * Módulo puro: solo cadenas, sin acceso a datos ni a disco, así que lo pueden
 * importar los componentes sin arrastrar nada del servidor.
 */
import { esClaveFotoValida, type VarianteFoto } from "./clave";

/**
 * Desde dónde se pide la foto:
 *
 * - `publico`: la ruta abierta del sitio, que sirve ÚNICAMENTE fotos de
 *   negocios publicados y responde 404 en cualquier otro caso.
 * - `panel`: la ruta que vive bajo `/admin`, dentro del alcance de la cookie
 *   de sesión, y que sin sesión válida responde exactamente el mismo 404.
 *
 * Son dos direcciones y no una porque la cookie del panel está limitada a
 * `Path=/admin` (decisión de T-005 que este change no reabre): el navegador
 * nunca la mandaría a `/api/foto/…`, así que un solo endpoint con rama de
 * sesión no podría funcionar en un navegador de verdad. Ver reports/b-dev.md.
 */
export const AMBITOS_FOTO = ["publico", "panel"] as const;
export type AmbitoFoto = (typeof AMBITOS_FOTO)[number];

const PREFIJO_POR_AMBITO: Record<AmbitoFoto, string> = {
  publico: "/api/foto",
  panel: "/admin/foto",
};

export function urlDeFoto(
  claveGuardada: unknown,
  variante: VarianteFoto,
  ambito: AmbitoFoto = "publico",
): string | null {
  if (!esClaveFotoValida(claveGuardada)) return null;
  return `${PREFIJO_POR_AMBITO[ambito]}/${claveGuardada}/${variante}`;
}
