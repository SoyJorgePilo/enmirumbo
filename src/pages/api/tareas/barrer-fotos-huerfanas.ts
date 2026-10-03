/**
 * Disparo del barrido de fotos sin dueño, servido por Astro: lo que era
 * `src/app/api/tareas/barrer-fotos-huerfanas/route.ts` (change
 * `migrar-tareas-programadas-astro`, design.md §1). Misma ruta, así que el
 * cron de `vercel.json` no cambia.
 *
 * Spec `despliegue`, requirement "El barrido de fotos huérfanas también corre
 * solo, y se nota cuando no barre" (change `preparar-deploy-produccion`).
 *
 * La misma lógica —con sus cuatro salvaguardas— detrás de la misma puerta que
 * la purga (`src/astro/tareas.ts`), y por las mismas razones (ADR-007: nada
 * exclusivo del hosting; cualquier programador de tareas sirve).
 *
 * FAIL-CLOSED, y aquí es lo importante: cuando una salvaguarda DETIENE el
 * barrido, la respuesta NO es 200. El comando de consola lo decía con
 * `process.exitCode = 1`; si el equivalente por HTTP contestara 200 con un
 * mensaje adentro, el programador de tareas lo daría por bueno y las fotos
 * huérfanas —que son datos personales fuera del alcance del borrado ARCO,
 * PRD §8— se acumularían en silencio para siempre. Un 500 sale en el panel de
 * fallos del cron; un 200 con letra chica, no.
 *
 * Métodos: los mismos que la purga (`HEAD` como `GET`; los demás, el 404
 * vacío).
 */
import type { APIRoute } from "astro";

import { respuestaDeTareaNoExistente, tareaAutorizada } from "@/astro/tareas";
import { almacenDeFotos } from "@/lib/fotos/almacen";
import { barrerFotosHuerfanas } from "@/lib/fotos/huerfanas";
import { obtenerPrisma } from "@/lib/prisma";

// Lee el almacén y la base en cada petición: nunca se prerenderiza. Sin
// `Cache-Control` propio, como Next (medido).
export const prerender = false;

const CABECERAS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
};

export const GET: APIRoute = async ({ request }) => {
  if (!tareaAutorizada(request)) return respuestaDeTareaNoExistente();

  let resultado;
  try {
    resultado = await barrerFotosHuerfanas({
      prisma: obtenerPrisma(),
      almacen: almacenDeFotos(),
    });
  } catch (error) {
    console.error(
      `[fotos] el barrido de huérfanas falló: ${error instanceof Error ? error.name : "error desconocido"}`,
    );
    return new Response(JSON.stringify({ barrido: false }), {
      status: 500,
      headers: CABECERAS,
    });
  }

  // Solo conteos: ninguna clave de foto sale de aquí (una clave es la
  // dirección de un archivo con la cara del negocio de alguien).
  const cuerpo = {
    barrido: resultado.barrido,
    revisadas: resultado.revisadas,
    huerfanas: resultado.huerfanas,
    borradas: resultado.borradas,
    enPeriodoDeGracia: resultado.enPeriodoDeGracia,
    ignoradas: resultado.ignoradas,
    noBorrables: resultado.noBorrables,
  };

  if (!resultado.barrido) {
    console.error(`[fotos] barrido DETENIDO por una salvaguarda: ${resultado.mensaje}`);
    return new Response(JSON.stringify(cuerpo), { status: 500, headers: CABECERAS });
  }

  console.log(
    `[fotos] barrido: ${resultado.borradas} huérfanas borradas de ${resultado.revisadas} revisadas`,
  );
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: CABECERAS });
};

/** `HEAD` como `GET`, como en Next: con el secreto correcto corre el barrido; Astro quita el cuerpo. */
export const HEAD: APIRoute = (contexto) => GET(contexto);

/** Cualquier otro método: el mismo 404 vacío, sin mirar el secreto (design.md §1.3). */
export const ALL: APIRoute = () => respuestaDeTareaNoExistente();
