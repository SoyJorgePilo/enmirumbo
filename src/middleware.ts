import { defineMiddleware } from "astro:middleware";

import { prepararRespuesta } from "@/astro/cabeceras";
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
 * Las cuatro cabeceras de seguridad en toda respuesta que sale de la función
 * (páginas, endpoints, 404 y redirecciones), sin pisar una que la respuesta ya
 * traiga, y el `Cache-Control` de Next en el HTML dinámico. Lo prerenderizado
 * no pasa por aquí en producción: sus cabeceras las escribe la integración de
 * la CDN.
 *
 * Brecha conocida (proposal.md): el `403` de `checkOrigin` sale ANTES de este
 * middleware y sin cabeceras; lo decide la Fase 3 (T-024).
 */
export const onRequest = defineMiddleware(async (contexto, siguiente) => {
  const respuesta = await siguiente();
  if (contexto.isPrerendered) return respuesta;
  return prepararRespuesta(respuesta);
});
