"use server";

/**
 * Server Action del formulario público de registro (spec `registro-negocio`,
 * design.md §1). Es deliberadamente delgada: saca la IP del request, delega
 * todo en `procesarRegistro` (probado en `tests/registro-accion.test.ts`) y
 * decide a dónde va el usuario.
 *
 * Al tener éxito redirige a la pantalla de gracias (POST-Redirect-GET): así
 * recargar esa pantalla no vuelve a crear el registro.
 *
 * Funciona con y sin JavaScript de cliente: `<form action={...}>` hace un
 * POST real cuando el JS no cargó, y la respuesta re-renderiza la página con
 * los errores por campo.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { procesarRegistro } from "@/lib/registro/procesar";
import type { EstadoAccionRegistro } from "@/lib/registro/tipos";

export async function registrarNegocio(
  _estadoPrevio: EstadoAccionRegistro,
  formData: FormData,
): Promise<EstadoAccionRegistro> {
  const resultado = await procesarRegistro(formData, {
    prisma: obtenerPrisma(),
    ip: ipDeEncabezados(await headers()),
  });

  if (!resultado.exito) return resultado.estado;

  // `redirect` lanza para cortar el flujo: va fuera de cualquier try/catch.
  redirect("/registro/gracias");
}
