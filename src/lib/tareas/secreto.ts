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
 *
 * Este módulo no depende de ningún marco: el 404 de las tareas vive en
 * `src/astro/tareas.ts` (Astro) y en `src/app/api/tareas/no-existe.ts` (Next,
 * hasta la Fase 6b).
 */
import { timingSafeEqual } from "node:crypto";

/** Variable con el secreto que autoriza el disparo de una tarea programada. */
export const VARIABLE_SECRETO_TAREAS = "CRON_SECRET";

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
