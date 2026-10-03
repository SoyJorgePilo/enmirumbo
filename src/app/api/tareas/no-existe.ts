/**
 * El 404 de las tareas programadas EN NEXT, mudado tal cual desde
 * `src/lib/tareas/secreto.ts` (change `migrar-tareas-programadas-astro`,
 * design.md §2.2): es un `notFound()` de Next, así que no puede vivir en
 * `src/lib/`, que ya no depende de ningún marco. Solo lo usan las dos rutas de
 * `src/app/api/tareas/`; se borra con ellas en la Fase 6b. En Astro, el 404 de
 * las tareas vive en `src/astro/tareas.ts`.
 */
import { notFound } from "next/navigation";

/**
 * Contesta como si la ruta no existiera. **Lanza**: no devuelve nada.
 *
 * Ni "no autorizado" ni "prohibido": una ruta que borra registros en bloque no
 * se anuncia. Sin secreto configurado y con secreto equivocado responden
 * exactamente igual, así que la respuesta tampoco sirve para averiguar si la
 * tarea está activada.
 *
 * ITERACIÓN 2 (hallazgo M1 de la etapa C): antes esto fabricaba su propia
 * respuesta —nueve bytes de texto plano, con `content-type` propio y una
 * cabecera `X-Robots-Tag` que ninguna otra ruta del sitio manda—. Un escáner
 * separaba las dos rutas de tareas del resto del sitio en una sola pasada, y
 * encontrarlas es el primer paso para insistir contra su secreto.
 *
 * Ahora se delega en `notFound()`. MEDIDO CONTRA EL SITIO SERVIDO, porque el
 * marco devuelve dos 404 distintos y conviene no prometer de más:
 *
 *   dirección inexistente          → 11 090 bytes de HTML, `text/html`
 *   ruta que existe y no encuentra → 0 bytes, sin `content-type`
 *
 * Desde un Route Handler no hay forma de emitir el primero. Lo que se consigue
 * —y lo que cierra el hallazgo— es emitir EXACTAMENTE el segundo: la respuesta
 * es idéntica, byte por byte, a la de `/api/foto/…` cuando el archivo no
 * existe, que es el otro Route Handler público del sitio. Ya no hay nada
 * propio por lo que distinguirlas.
 */
export function respuestaDeTareaNoExistente(): never {
  notFound();
}
