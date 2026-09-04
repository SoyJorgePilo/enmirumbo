import type { Metadata } from "next";
import Link from "next/link";

import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  MENSAJE_BORRADO_HECHO,
  MENSAJE_BORRADO_SIN_ALMACEN,
  MENSAJE_YA_NO_EXISTE,
  TEXTO_VOLVER_A_LA_COLA,
} from "@/lib/admin/textos";

export const metadata: Metadata = { robots: { index: false, follow: false } };

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Pantalla posterior al borrado definitivo (spec
 * `agregar-despublicar-y-borrado-arco`, requirement "El borrado definitivo
 * se lleva todo y no deja rastro de datos personales"): a propósito NO vive
 * bajo `/admin/registros/[id]/…` — después de borrar ya no hay fila que
 * leer, y una URL con el id viaja al log de acceso del hosting. Esta ruta
 * es estática, sin ningún dato del negocio borrado ni en la pantalla ni en
 * la URL.
 *
 * `resultado` distingue las tres cosas que le pudieron pasar a esta acción
 * (ninguna es un dato personal, así que puede ir en la URL sin problema):
 * `"borrado"` es el borrado que se acaba de ejecutar; `"ya-no-existe"` es la
 * confirmación desde otra pestaña sobre un registro que ya se había borrado
 * (idempotencia — scenario "borrar dos veces"); y `"almacen-inalcanzable"`
 * (iteración 4, hallazgo R4) es la ficha que **no se borró** porque tenía foto
 * y el almacén no se dejó alcanzar. Si llega cualquier otro valor o ninguno,
 * se asume el caso "borrado" (no hay nada más seguro que mostrar aquí).
 *
 * OJO con el caso nuevo: es el único de los tres en el que la ficha SIGUE
 * existiendo, así que el enlace de abajo devuelve a la cola, donde el admin la
 * vuelve a encontrar para reintentar cuando la configuración esté bien.
 */
export default async function BorradoHechoPage({
  searchParams,
}: PageProps<"/admin/borrado-hecho">) {
  await requerirSesionAdmin();

  const sp = await searchParams;
  const resultado = primeraCadena(sp.resultado);
  const mensaje =
    resultado === "ya-no-existe"
      ? MENSAJE_YA_NO_EXISTE
      : resultado === "almacen-inalcanzable"
        ? MENSAJE_BORRADO_SIN_ALMACEN
        : MENSAJE_BORRADO_HECHO;

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">{mensaje}</h1>
      <Link
        href="/admin/cola"
        className="inline-flex min-h-11 items-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_VOLVER_A_LA_COLA}
      </Link>
    </section>
  );
}
