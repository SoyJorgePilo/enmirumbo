"use server";

/**
 * Server Action del botón "Salir" (spec `revision-admin`, requirement "Acceso
 * al panel…"): caduca la cookie de sesión y manda a la pantalla de acceso con
 * el mensaje "Cerraste sesión.".
 *
 * No llama a `requerirSesionAdmin()` a propósito: no lee ni escribe nada de
 * la base y su único efecto es borrar una cookie del propio navegador. Salir
 * sin sesión es simplemente salir. Se expira con los MISMOS atributos con los
 * que se creó (mismo `Path`), que es lo único que garantiza que el navegador
 * la reemplace en vez de guardar una segunda.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RUTA_ACCESO_ADMIN, sirviendoPorHttps } from "@/lib/admin/guarda";
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion } from "@/lib/admin/sesion";

export async function salirDelPanel(): Promise<void> {
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE_SESION, "", {
    ...opcionesCookieSesion(await sirviendoPorHttps()),
    maxAge: 0,
  });

  redirect(`${RUTA_ACCESO_ADMIN}?salida=1`);
}
