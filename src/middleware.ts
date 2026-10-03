import type { APIContext, MiddlewareNext } from "astro";
import { getActionContext } from "astro:actions";
import { defineMiddleware } from "astro:middleware";

import { RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE, atenderAcciones } from "@/astro/acciones";
import { prepararRespuesta } from "@/astro/cabeceras";
import { envioDeOtroOrigen } from "@/astro/origen";
import { conReferenteDelPanel, guardiaDelPanel } from "@/astro/panel/guardia";
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
  // La ruta PEDIDA se lee ANTES de atender: el 403, "como dirección
  // inexistente" y la 500 son reescrituras y no deben cambiar la política.
  const urlPedida = contexto.url;
  const rutaPedida = urlPedida.pathname;
  const respuesta = await atender(contexto, siguiente);
  // 5a: el referente estricto del panel, antes de que se pongan las globales.
  // Fase 4: `prepararRespuesta` fija `strict-origin` en todo `/editar/`,
  // pisando lo que venga. Prefijos disjuntos: ninguna pisa a la otra.
  return prepararRespuesta(conReferenteDelPanel(urlPedida, respuesta), rutaPedida);
});

async function atender(contexto: APIContext, siguiente: MiddlewareNext): Promise<Response> {
  // Segunda pasada, ya reescrita a la página 403: solo se pinta.
  if (contexto.locals.envioRechazado === true) return siguiente();
  if (envioDeOtroOrigen(contexto.request.method, contexto.request.headers)) {
    contexto.locals.envioRechazado = true;
    return contexto.rewrite(RUTA_DE_RESPUESTAS_DEL_MIDDLEWARE);
  }
  // 5a (change `migrar-panel-admin-base-astro`, design.md §1.3): la guarda de
  // sesión del panel, DESPUÉS del origen y ANTES de la tabla de Actions: sin
  // sesión, ninguna Action del panel (salvo entrar y salir) llega a leer el cuerpo.
  const sinSesion = guardiaDelPanel(contexto, getActionContext(contexto).action?.name);
  if (sinSesion) return sinSesion;
  return atenderAcciones(contexto, siguiente);
}
