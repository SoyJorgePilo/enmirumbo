import { notFound } from "next/navigation";

/**
 * Cualquier URL bajo `/admin` que no sea una pantalla real del panel
 * (observación O-1 de la re-auditoría del change `agregar-analitica-cookieless`).
 *
 * Responde exactamente lo mismo que respondía antes de existir —404 para
 * cualquiera, con o sin sesión— pero ahora esa 404 la sirve una ruta que vive
 * DENTRO del panel, así que hereda del layout la política de referente. Sin
 * esto, un `/admin/registros/<id>/loquesea` tecleado o pegado a mano
 * respondía 404 sin política, y esa URL lleva el identificador de un registro
 * de una persona: al salir de ahí hacia una página pública, el referente se
 * lo habría entregado al proveedor de analítica (PRD §8, LFPDPPP).
 *
 * No lee nada ni escribe nada, y por eso no llama a la guarda de sesión: no
 * hay nada que proteger detrás de una ruta que no existe, y pedir sesión para
 * decir "no existe" delataría más de lo que oculta.
 */
export default function RutaDelPanelQueNoExiste() {
  notFound();
}
