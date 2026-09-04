/**
 * Disparo de la purga de registros rechazados a los 90 días (PRD §8).
 *
 * Spec `despliegue`, requirement "La purga de rechazados se dispara sola en
 * producción"; change `preparar-deploy-produccion`, design.md §7.
 *
 * Es una ruta HTTP normal y no una función propia del hosting a propósito
 * (ADR-007: nada exclusivo de Vercel). Quien la llama es un programador de
 * tareas cualquiera —el cron de `vercel.json`, un `curl` desde otra máquina,
 * un workflow programado—: lo único que necesita saber hacer es mandar un
 * encabezado `Authorization`.
 *
 * FAIL-CLOSED: sin secreto configurado, o con uno que no coincide, responde el
 * MISMO 404 que una ruta inexistente y no borra nada. Una ruta que borra
 * registros en bloque no se anuncia.
 */
import { almacenDeFotos } from "@/lib/fotos/almacen";
import { obtenerPrisma } from "@/lib/prisma";
import { purgarRechazados } from "@/lib/purga/rechazados";
import {
  respuestaDeTareaNoExistente,
  secretoDeTareaCorrecto,
  VARIABLE_SECRETO_TAREAS,
} from "@/lib/tareas/secreto";

// Escribe en la base en cada petición: nunca se prerenderiza ni se cachea.
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
  const secreto = (process.env[VARIABLE_SECRETO_TAREAS] ?? "").trim();
  if (secreto === "") respuestaDeTareaNoExistente();
  if (!secretoDeTareaCorrecto(peticion.headers.get("authorization"), secreto)) {
    respuestaDeTareaNoExistente();
  }

  let eliminados: number;
  let fallidos: number;
  let cuposLimpiados: number;
  try {
    ({ eliminados, fallidos, cuposLimpiados } = await purgarRechazados(obtenerPrisma(), {
      almacen: almacenDeFotos(),
    }));
  } catch (error) {
    // Ni el mensaje de la base ni ningún dato de nadie: solo que falló.
    console.error(
      `[purga] no se pudo completar: ${error instanceof Error ? error.name : "error desconocido"}`,
    );
    return new Response(JSON.stringify({ error: "No se pudo completar la purga." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  // Conteos y nada más: ni nombres, ni WhatsApp, ni motivos de rechazo (spec
  // `modelo-datos`, scenario "el informe no filtra datos personales").
  const cabeceras = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow",
  };

  // FAIL-VISIBLE, igual que el barrido de fotos: si algún registro que ya
  // cumplió el plazo sigue ahí, la purga NO cumplió y el programador de tareas
  // tiene que registrarlo como fallo. Un 200 con la mala noticia en el cuerpo
  // lo daría por bueno, y el incumplimiento del aviso de privacidad se
  // repetiría todos los días en silencio.
  if (fallidos > 0) {
    console.error(
      `[purga] ${fallidos} registros rechazados NO se pudieron eliminar (se eliminaron ${eliminados})`,
    );
    return new Response(JSON.stringify({ eliminados, fallidos, cuposLimpiados }), {
      status: 500,
      headers: cabeceras,
    });
  }

  console.log(`[purga] eliminados ${eliminados} registros rechazados con 90 días o más`);
  return new Response(JSON.stringify({ eliminados, fallidos, cuposLimpiados }), {
    status: 200,
    headers: cabeceras,
  });
}
