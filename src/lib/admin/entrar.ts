/**
 * Entrar y salir del panel, SIN Next (change `migrar-panel-admin-base-astro`,
 * design.md §2.3; spec `revision-admin`, requirement "Acceso al panel con
 * contraseña única de entorno y sesión firmada").
 *
 * Es el cuerpo de `entrarAlPanel` y `salirDelPanel` de siempre, en el mismo
 * orden y con las mismas líneas de log, con cada `redirect(x)` cambiado por
 * `return { tipo: "redirigir", ruta: x }`. Los envoltorios de Next
 * (`src/app/admin/accion-*.ts`) y las Actions de Astro
 * (`src/astro/panel/acceso.ts`) traducen el destino cada uno a su manera.
 *
 * NADA de lo que pasa por aquí —ni la contraseña configurada, ni la que se
 * intentó, ni el valor de la cookie, ni la IP— se escribe en el log. Los
 * mensajes de error viajan por la URL como un código corto (`?error=…`).
 */
import {
  apartarIntentoDeAcceso,
  avisarSiElLimiteDeAccesoNoAplica,
  contrasenaCorrecta,
} from "@/lib/admin/acceso";
import { leerConfiguracionPanel, motivoSinConfigurar, type EntornoPanel } from "@/lib/admin/config";
import { type AlmacenCookiesPanel, esPeticionHttps } from "@/lib/admin/peticion";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion, opcionesCookieSesion } from "@/lib/admin/sesion";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";

/** A dónde va el admin tras entrar o salir: una lista cerrada, sin datos. */
export type DestinoAcceso = {
  tipo: "redirigir";
  ruta: "/admin" | "/admin?error=incorrecta" | "/admin?error=intentos" | "/admin/cola" | "/admin?salida=1";
};

export async function ejecutarAcceso(
  formData: FormData,
  encabezados: Headers,
  almacen: AlmacenCookiesPanel,
  env: EntornoPanel = process.env,
  ahora: Date = new Date(),
): Promise<DestinoAcceso> {
  const configuracion = leerConfiguracionPanel(env);
  if (!configuracion) {
    // El detalle de qué falta se queda SOLO en el log del servidor: a quien
    // está afuera no se le dice si falta la contraseña o el secreto.
    console.warn(`[panel] acceso imposible, ${motivoSinConfigurar(env)}`);
    return { tipo: "redirigir", ruta: "/admin" };
  }

  // Misma política endurecida que el cupo del formulario público (T-003): solo
  // se confía en el encabezado que declara el despliegue, y de él se toma el
  // último salto, que es el que agrega el proxy más cercano. Si no hay IP
  // atribuible, el límite no aplica y se dice en el log (no en silencio).
  const ip = ipDeEncabezados(encabezados);
  avisarSiElLimiteDeAccesoNoAplica(ip);

  // El intento se aparta ANTES de comparar, y en un solo paso atómico: si la
  // procedencia agotó su margen, ni la contraseña correcta abre el panel
  // dentro de la ventana. Preguntar primero y apuntar después deja una ventana
  // por la que se cuelan las peticiones simultáneas, que es exactamente lo que
  // hace una herramienta de fuerza bruta.
  //
  // Se apunta SIEMPRE, no solo cuando la contraseña falla: el atacante controla
  // cuántas veces prueba, no si acierta, y contar solo los fallos le regala un
  // intento gratis por cada acierto. Al admin que teclea bien a la primera no
  // le cuesta nada: entra y la ventana se olvida sola.
  const hayMargen = await apartarIntentoDeAcceso(ip, configuracion.secreto, ahora);
  if (!hayMargen) {
    console.warn("[panel] acceso rechazado: demasiados intentos desde esta procedencia");
    return { tipo: "redirigir", ruta: "/admin?error=intentos" };
  }

  const enviado = formData.get("contrasena");
  const intento = typeof enviado === "string" ? enviado : "";

  if (!contrasenaCorrecta(intento, configuracion.contrasena)) {
    console.warn("[panel] acceso rechazado: contraseña incorrecta");
    return { tipo: "redirigir", ruta: "/admin?error=incorrecta" };
  }

  almacen.set(
    NOMBRE_COOKIE_SESION,
    crearValorDeSesion(configuracion.secreto, ahora),
    opcionesCookieSesion(esPeticionHttps(encabezados, env)),
  );
  return { tipo: "redirigir", ruta: "/admin/cola" };
}

/**
 * "Salir": caduca la cookie de sesión y manda a la pantalla de acceso con el
 * mensaje "Cerraste sesión.". No exige sesión a propósito (paridad, decisión 3
 * del fundador): su único efecto es borrar una cookie del propio navegador.
 * Se expira con los MISMOS atributos con los que se creó (mismo `Path`), que
 * es lo único que garantiza que el navegador la reemplace.
 */
export function ejecutarSalida(encabezados: Pick<Headers, "get">, almacen: AlmacenCookiesPanel): DestinoAcceso {
  almacen.set(NOMBRE_COOKIE_SESION, "", { ...opcionesCookieSesion(esPeticionHttps(encabezados)), maxAge: 0 });
  return { tipo: "redirigir", ruta: "/admin?salida=1" };
}
