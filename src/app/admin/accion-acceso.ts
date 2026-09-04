"use server";

/**
 * Server Action del acceso al panel (spec `revision-admin`, requirement
 * "Acceso al panel con contraseña única de entorno y sesión firmada").
 *
 * Es deliberadamente delgada: la comparación en tiempo constante vive en
 * `src/lib/admin/acceso.ts`, la firma de la sesión en
 * `src/lib/admin/sesion.ts` y el fail-safe en `src/lib/admin/config.ts`.
 *
 * NADA de lo que pasa por aquí —ni la contraseña configurada, ni la que se
 * intentó, ni el valor de la cookie— se escribe en el log. Los mensajes de
 * error viajan por la URL como un código corto (`?error=…`) y la pantalla de
 * acceso los traduce a los textos literales de la spec.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  accesoBloqueado,
  avisarSiElLimiteDeAccesoNoAplica,
  contrasenaCorrecta,
  registrarIntentoFallido,
} from "@/lib/admin/acceso";
import { leerConfiguracionPanel, motivoSinConfigurar } from "@/lib/admin/config";
import { RUTA_ACCESO_ADMIN, RUTA_COLA_ADMIN, sirviendoPorHttps } from "@/lib/admin/guarda";
import {
  NOMBRE_COOKIE_SESION,
  crearValorDeSesion,
  opcionesCookieSesion,
} from "@/lib/admin/sesion";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";

export async function entrarAlPanel(formData: FormData): Promise<void> {
  const configuracion = leerConfiguracionPanel();
  if (!configuracion) {
    // El detalle de qué falta se queda SOLO en el log del servidor: a quien
    // está afuera no se le dice si falta la contraseña o el secreto.
    console.warn(`[panel] acceso imposible, ${motivoSinConfigurar()}`);
    redirect(RUTA_ACCESO_ADMIN);
  }

  const encabezados = await headers();
  // Misma política endurecida que el cupo del formulario público (T-003): solo
  // se confía en el encabezado que declara el despliegue, y de él se toma el
  // último salto, que es el que agrega el proxy más cercano. Si no hay IP
  // atribuible, el límite no aplica y se dice en el log (no en silencio).
  const ip = ipDeEncabezados(encabezados);
  avisarSiElLimiteDeAccesoNoAplica(ip);

  // El bloqueo va ANTES de comparar: agotados los intentos, ni la contraseña
  // correcta abre el panel dentro de la ventana.
  if (accesoBloqueado(ip)) {
    console.warn("[panel] acceso rechazado: demasiados intentos desde esta procedencia");
    redirect(`${RUTA_ACCESO_ADMIN}?error=intentos`);
  }

  const enviado = formData.get("contrasena");
  const intento = typeof enviado === "string" ? enviado : "";

  if (!contrasenaCorrecta(intento, configuracion.contrasena)) {
    registrarIntentoFallido(ip);
    console.warn("[panel] acceso rechazado: contraseña incorrecta");
    redirect(`${RUTA_ACCESO_ADMIN}?error=incorrecta`);
  }

  const almacen = await cookies();
  almacen.set(
    NOMBRE_COOKIE_SESION,
    crearValorDeSesion(configuracion.secreto),
    opcionesCookieSesion(await sirviendoPorHttps()),
  );

  redirect(RUTA_COLA_ADMIN);
}
