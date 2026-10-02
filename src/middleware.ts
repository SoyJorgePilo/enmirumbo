import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";

import { RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE, atenderAcciones } from "@/astro/acciones";
import { prepararRespuesta } from "@/astro/cabeceras";
import { envioDeOtroOrigen } from "@/astro/origen";
import { avisarSinAlmacenDeFotosUnaVez } from "@/lib/fotos/almacen";
import { avisarSinBaseDeDatosUnaVez } from "@/lib/prisma";
import { avisarSinUrlSitioUnaVez } from "@/lib/sitio";
import { avisarSinSecretoDeTareasUnaVez } from "@/lib/tareas/secreto";

/**
 * Middleware único del sitio en Astro (change `migrar-lectura-publica-astro`,
 * design.md §5).
 *
 * LOS AVISOS DE ARRANQUE viven aquí, en el tronco del módulo, como vivían en
 * `src/app/layout.tsx`: se ejecutan una vez al cargar la función, nunca por
 * petición. Son las cuatro cosas que en un despliegue no pueden faltar en
 * silencio (spec `despliegue`): la URL pública, la dirección de la base, el
 * secreto de las tareas programadas y el almacenamiento de las fotos.
 */
avisarSinUrlSitioUnaVez();
avisarSinBaseDeDatosUnaVez();
avisarSinSecretoDeTareasUnaVez();
avisarSinAlmacenDeFotosUnaVez();

/**
 * En este orden (change `migrar-formularios-publicos-astro`, design.md §1):
 *
 * 1. **La regla de origen** (`src/astro/origen.ts`), la de Next, porque
 *    `security.checkOrigin` está apagado en `astro.config.mjs`. Un envío de
 *    otro origen no ejecuta nada: se reescribe a la página 403 en español con
 *    la marca `locals.envioRechazado`, que solo pone el servidor (el
 *    adaptador de Vercel no acepta `locals` del cliente sin su secreto).
 * 2. **La tabla de Actions y el PRG** (`src/astro/acciones.ts`).
 * 3. **Las cuatro cabeceras de seguridad** en toda respuesta que sale de la
 *    función (páginas, endpoints, 403, 404 y el 303), sin pisar una que la
 *    respuesta ya traiga, y el `Cache-Control` de Next en el HTML dinámico.
 *    Lo prerenderizado no pasa por aquí en producción: sus cabeceras las
 *    escribe la integración de la CDN.
 */
export const onRequest = defineMiddleware(async (contexto, siguiente) => {
  if (contexto.isPrerendered) return siguiente();
  return prepararRespuesta(await atender(contexto, siguiente));
});

async function atender(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  // Segunda pasada, ya reescrita a la página 403: solo se pinta.
  if (contexto.locals.envioRechazado === true) return siguiente();
  if (envioDeOtroOrigen(contexto.request.method, contexto.request.headers)) {
    contexto.locals.envioRechazado = true;
    return contexto.rewrite(RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE);
  }
  return atenderAcciones(contexto, siguiente);
}
