/**
 * La puerta de las tareas programadas, en un solo lugar.
 *
 * Spec `despliegue` (change `preparar-deploy-produccion`, design.md §7): las
 * rutas que dispara el programador de tareas —la purga de rechazados y el
 * barrido de fotos huérfanas— solo actúan si traen el secreto configurado, y
 * si no lo traen se comportan como si no existieran.
 *
 * El nombre `CRON_SECRET` viene del programador de Vercel, que manda ese
 * encabezado solo cuando la variable se llama así. El sistema no depende de
 * Vercel para nada más: cualquier cron que sepa mandar un `Authorization:
 * Bearer …` sirve igual (ADR-007), y cambiar de hosting es cambiar quién
 * llama, no qué se llama.
 */
import { timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";

/** Variable con el secreto que autoriza el disparo de una tarea programada. */
export const VARIABLE_SECRETO_TAREAS = "CRON_SECRET";

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

/**
 * ¿El encabezado `Authorization` trae el secreto configurado?
 *
 * La comparación es de tiempo constante: quien pide la ruta controla lo que
 * manda y puede insistir cuantas veces quiera, así que una comparación que se
 * corta en el primer byte distinto le iría diciendo cuánto lleva acertado.
 */
export function secretoDeTareaCorrecto(
  encabezado: string | null,
  secreto: string,
): boolean {
  if (!encabezado?.startsWith("Bearer ")) return false;
  const recibido = Buffer.from(encabezado.slice("Bearer ".length));
  const esperado = Buffer.from(secreto);
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

let yaSeAvisoSinSecreto = false;

/**
 * Deja constancia en el log —UNA SOLA VEZ por proceso, al ARRANCAR— de que en
 * producción no hay secreto de tareas configurado.
 *
 * Hallazgo M5 de la etapa C, y no es cosmético: el delta de `paginas-legales`
 * de este change RETIRA la purga de los 90 días de los pendientes operativos
 * "porque el sistema la ejecuta sin intervención humana". Eso sólo es verdad
 * si el disparo puede llegar. Sin `CRON_SECRET`, las dos rutas contestan como
 * si no existieran —en silencio, para siempre— y el sistema seguiría
 * afirmando que ese compromiso del aviso de privacidad está cumplido. Se
 * cambia un pendiente declarado por un incumplimiento invisible, salvo que
 * alguien lo diga en voz alta. Esto lo dice.
 *
 * Fuera de producción no avisa nada: en desarrollo nadie tiene un cron.
 */
export function avisarSinSecretoDeTareasUnaVez(
  env: Record<string, string | undefined> = process.env,
): void {
  const enProduccion =
    (env.NODE_ENV ?? "").trim().toLowerCase() === "production" ||
    (env.VERCEL_ENV ?? "").trim().toLowerCase() === "production";
  if (!enProduccion || yaSeAvisoSinSecreto) return;
  if ((env[VARIABLE_SECRETO_TAREAS] ?? "").trim() !== "") return;

  yaSeAvisoSinSecreto = true;
  console.error(
    `[tareas] falta ${VARIABLE_SECRETO_TAREAS}: las tareas programadas NO se pueden disparar. ` +
      "Eso incluye la purga de los registros rechazados a los 90 días, que el aviso de privacidad " +
      "publicado promete cumplir (PRD §8). Ver docs/despliegue.md §6.",
  );
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeSecretoDeTareas(): void {
  yaSeAvisoSinSecreto = false;
}
