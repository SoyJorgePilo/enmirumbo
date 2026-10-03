/**
 * La puerta de las tareas programadas en Astro y su 404, en un solo lugar
 * (change `migrar-tareas-programadas-astro`, design.md §3; spec `despliegue`,
 * requirement "El 404 de las tareas programadas no las delata").
 *
 * Cada endpoint de `src/pages/api/tareas/` la llama como su PRIMERA sentencia,
 * antes de construir el cliente de la base, de leer el almacén de fotos o la
 * configuración del correo: sin el secreto correcto, la ruta no hace nada más.
 *
 * El 404 es el de Next medido sobre `main` (`tests/fixtures/next-6a/`): el
 * `notFound()` de un Route Handler sale con estado 404, cero bytes y sin
 * `Content-Type`, `Cache-Control` ni `X-Robots-Tag` (hallazgo M1 de la etapa C
 * de `preparar-deploy-produccion`: esa cabecera lo delataba). Las cuatro
 * cabeceras de seguridad las pone el middleware, como `next.config.ts` en
 * Next. La única cabecera de Next que no se replica es su `Vary: rsc,
 * next-router-…`, que nombra al enrutador de Next.
 *
 * Como lo devuelve un endpoint, Astro no lo reencamina a `404.astro`
 * (`skipErrorReroute`): es el mismo 404 vacío que el de una foto inexistente
 * (`src/pages/api/foto/[clave]/[variante].ts`), sin el `no-store` propio de
 * esa ruta. En Next el párrafo equivalente vive en
 * `src/app/api/tareas/no-existe.ts` hasta la Fase 6b.
 */
import { secretoDeTareaCorrecto, VARIABLE_SECRETO_TAREAS } from "@/lib/tareas/secreto";

/**
 * ¿La petición trae el secreto configurado? Lee `CRON_SECRET` en ESTA
 * petición (cambiarlo en el panel y redesplegar basta), lo recorta y trata el
 * vacío como "no". La comparación es la de `secretoDeTareaCorrecto`, de
 * tiempo constante.
 */
export function tareaAutorizada(
  peticion: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const secreto = (env[VARIABLE_SECRETO_TAREAS] ?? "").trim();
  if (!secreto) return false;
  return secretoDeTareaCorrecto(peticion.headers.get("authorization"), secreto);
}

/**
 * Contesta como si la ruta no existiera: 404, sin cuerpo y sin cabeceras
 * propias. Ni "no autorizado" ni "prohibido": una ruta que borra registros en
 * bloque no se anuncia, y sin secreto configurado o con uno equivocado
 * responde exactamente igual.
 */
export function respuestaDeTareaNoExistente(): Response {
  return new Response(null, { status: 404 });
}
