import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { entrarAlPanel } from "@/app/admin/accion-acceso";
import { avisarSinConfigurarUnaVez, estaConfigurado } from "@/lib/admin/config";
import { RUTA_COLA_ADMIN, haySesionAdmin } from "@/lib/admin/guarda";
import {
  BOTON_ENTRAR,
  ERROR_CONTRASENA_INCORRECTA,
  ERROR_DEMASIADOS_INTENTOS,
  ETIQUETA_CONTRASENA,
  MENSAJE_PANEL_NO_DISPONIBLE,
  MENSAJE_SESION_CERRADA,
  TEXTO_ENCABEZADO_ACCESO,
} from "@/lib/admin/textos";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

// Requirement "El panel no se indexa ni se enlaza desde el sitio público",
// scenario "metadata de no indexación": TODAS las pantallas del panel,
// incluida esta, declaran `noindex, nofollow`.
export const metadata: Metadata = {
  title: "Panel de revisión — NecesitoUno Tizayuca",
  robots: { index: false, follow: false },
};

const MENSAJES_ERROR: Record<string, string> = {
  incorrecta: ERROR_CONTRASENA_INCORRECTA,
  intentos: ERROR_DEMASIADOS_INTENTOS,
};

/**
 * Acceso al panel en `/admin` (requirement "Acceso al panel con contraseña
 * única de entorno y sesión firmada"). Server Component: el `<form>` postea a
 * una Server Action sin ningún JavaScript de cliente.
 *
 * Esta página no llama a `requerirSesionAdmin()` porque ES la pantalla de
 * acceso: es el destino de esa guarda. Tampoco lee ni un dato de ningún
 * registro, así que quien llegue sin sesión no ve nada del panel.
 *
 * Sin contraseña o sin secreto configurados (requirement "Sin contraseña
 * configurada el panel no abre") muestra el mensaje de no disponible y NO
 * pinta el campo: no hay nada que escribir. El detalle de qué falta se queda
 * en el log del servidor.
 */
export default async function AccesoAdminPage({
  searchParams,
}: PageProps<"/admin">) {
  const { error, salida } = await searchParams;

  if (!estaConfigurado()) {
    // Una sola vez por proceso: esta pantalla es pública y no se le puede dar
    // a cualquiera un botón para llenar el log (hallazgo BAJO 3 de la etapa C).
    avisarSinConfigurarUnaVez();
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {TEXTO_ENCABEZADO_ACCESO}
        </h1>
        <p className="max-w-sm text-tinta-suave">{MENSAJE_PANEL_NO_DISPONIBLE}</p>
      </section>
    );
  }

  // Con sesión vigente, el acceso sobra: se entra directo a la cola. Tras
  // "Salir" no hay sesión, así que esa vuelta no rebota.
  if (await haySesionAdmin()) redirect(RUTA_COLA_ADMIN);

  const errorTexto =
    typeof error === "string" ? MENSAJES_ERROR[error] : undefined;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {TEXTO_ENCABEZADO_ACCESO}
      </h1>

      {salida === "1" && (
        <p role="status" className="text-tinta-suave">
          {MENSAJE_SESION_CERRADA}
        </p>
      )}

      <form
        action={entrarAlPanel}
        className="flex w-full max-w-xs flex-col gap-3"
      >
        {errorTexto && (
          <p id="contrasena-error" role="alert" className="text-sm font-semibold text-tinta">
            ⚠ {errorTexto}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contrasena" className="text-sm font-semibold text-tinta">
            {ETIQUETA_CONTRASENA}
          </label>
          <input
            type="password"
            id="contrasena"
            name="contrasena"
            required
            autoComplete="current-password"
            aria-invalid={Boolean(errorTexto)}
            aria-describedby={errorTexto ? "contrasena-error" : undefined}
            className="w-full rounded-lg border border-borde bg-fondo px-4 py-3 text-base text-tinta focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
          />
        </div>
        <button type="submit" className={CLASE_BOTON_PRIMARIO}>
          {BOTON_ENTRAR}
        </button>
      </form>
    </section>
  );
}
