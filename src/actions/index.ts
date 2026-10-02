/**
 * Las Actions del sitio (change `migrar-formularios-publicos-astro`, Fase 3a).
 *
 * Cada una corre SOLO por envío de formulario (`?_action=<nombre>`) y SOLO
 * desde la ruta que le asigna la tabla de `src/astro/acciones.ts`: el
 * middleware la ejecuta, responde el 303 y cierra la vía RPC
 * (`/_actions/*`). Aquí no hay lógica: cada manejador delega en `src/astro/`,
 * que a su vez delega en `src/lib/`.
 *
 * Sin esquema de entrada a propósito: el formulario se valida donde siempre
 * (`crearReporte`), con los mismos mensajes, y un campo de más se ignora.
 */
import { defineAction } from "astro:actions";

import { reportarDesdeElFormulario } from "@/astro/reportar";

export const server = {
  reportar: defineAction({
    accept: "form",
    handler: (formData, contexto) => reportarDesdeElFormulario(formData, contexto),
  }),
};
