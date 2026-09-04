/**
 * Disparo del barrido de fotos sin dueño.
 *
 * Spec `despliegue`, requirement "El barrido de fotos huérfanas también corre
 * solo, y se nota cuando no barre" (change `preparar-deploy-produccion`).
 *
 * El barrido existía desde el change `agregar-foto-negocio` como comando de
 * consola (`npm run fotos:barrer-huerfanos`) y con una nota que decía "en
 * producción esto le toca a un cron; queda anotado para T-013". Esto es ese
 * cron: la misma lógica —con sus cuatro salvaguardas— detrás de la misma
 * puerta que la purga, y por las mismas razones (ADR-007: nada exclusivo del
 * hosting; cualquier programador de tareas sirve).
 *
 * FAIL-CLOSED, y aquí es lo importante: cuando una salvaguarda DETIENE el
 * barrido, la respuesta NO es 200. El comando de consola lo decía con
 * `process.exitCode = 1`; si el equivalente por HTTP contestara 200 con un
 * mensaje adentro, el programador de tareas lo daría por bueno y las fotos
 * huérfanas —que son datos personales fuera del alcance del borrado ARCO,
 * PRD §8— se acumularían en silencio para siempre. Un 500 sale en el panel de
 * fallos del cron; un 200 con letra chica, no.
 */
import { almacenDeFotos } from "@/lib/fotos/almacen";
import { barrerFotosHuerfanas } from "@/lib/fotos/huerfanas";
import { obtenerPrisma } from "@/lib/prisma";
import {
  respuestaDeTareaNoExistente,
  secretoDeTareaCorrecto,
  VARIABLE_SECRETO_TAREAS,
} from "@/lib/tareas/secreto";

// Lee el almacén y la base en cada petición: nunca se prerenderiza.
export const dynamic = "force-dynamic";

const CABECERAS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(peticion: Request): Promise<Response> {
  const secreto = (process.env[VARIABLE_SECRETO_TAREAS] ?? "").trim();
  if (secreto === "") respuestaDeTareaNoExistente();
  if (!secretoDeTareaCorrecto(peticion.headers.get("authorization"), secreto)) {
    respuestaDeTareaNoExistente();
  }

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
}
