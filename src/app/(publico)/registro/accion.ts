"use server";

/**
 * Server Action del formulario público de registro (spec `registro-negocio`,
 * design.md §1). Es deliberadamente delgada: saca la IP del request, delega
 * todo en `procesarRegistro` (probado en `tests/registro-accion.test.ts`) y
 * decide a dónde va el usuario.
 *
 * Al tener éxito redirige (POST-Redirect-GET): así recargar la pantalla de
 * destino no vuelve a crear el registro.
 *
 * **A dónde redirige depende de la bandera de la verificación por SMS, y solo
 * de eso** (T-016, ADR-011). Con la capacidad apagada —el estado por defecto y
 * el del lanzamiento— esta acción se comporta EXACTAMENTE como antes de T-016:
 * `pedirCodigoParaFicha` devuelve `null` sin tocar nada y el dueño va a la
 * pantalla de gracias de siempre. Con la capacidad encendida y el código
 * pedido con éxito, va a "Confirma tu número", que a su vez termina en gracias.
 *
 * El orden importa y es el del design.md §2: **la ficha se guarda PRIMERO**.
 * Un SMS que no sale —proveedor caído, tope diario, cupo por IP, número que el
 * proveedor no acepta— no pierde el registro ni le enseña un error al dueño:
 * el flujo degrada al de siempre y termina en la pantalla de gracias.
 *
 * Funciona con y sin JavaScript de cliente: `<form action={...}>` hace un
 * POST real cuando el JS no cargó, y la respuesta re-renderiza la página con
 * los errores por campo.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { procesarRegistro } from "@/lib/registro/procesar";
import type { EstadoAccionRegistro } from "@/lib/registro/tipos";
import { dependenciasDeVerificacion } from "@/lib/verificacion/acciones";
import { pedirCodigoParaFicha } from "@/lib/verificacion/flujo";
import { COOKIE_PASO, firmarPaso, opcionesCookiePaso } from "@/lib/verificacion/paso";

export async function registrarNegocio(
  _estadoPrevio: EstadoAccionRegistro,
  formData: FormData,
): Promise<EstadoAccionRegistro> {
  const encabezados = await headers();
  const resultado = await procesarRegistro(formData, {
    prisma: obtenerPrisma(),
    ip: ipDeEncabezados(encabezados),
  });

  if (!resultado.exito) return resultado.estado;

  // Con la capacidad apagada esto es `null` y no cuesta ni una consulta: no se
  // construye el adaptador del proveedor ni se lee ninguna credencial.
  const dependencias = await dependenciasDeVerificacion();
  if (dependencias) {
    const paso = await pedirCodigoParaFicha(resultado.ficha, dependencias.contexto);
    if (paso) {
      // El identificador del negocio viaja DENTRO de la cookie firmada, nunca
      // en la URL (design.md §3).
      const almacen = await cookies();
      almacen.set(
        COOKIE_PASO,
        firmarPaso(paso, dependencias.contexto.secreto),
        opcionesCookiePaso(dependencias.esHttps),
      );
      redirect("/registro/verificar");
    }
  }

  // `redirect` lanza para cortar el flujo: va fuera de cualquier try/catch.
  redirect("/registro/gracias");
}
