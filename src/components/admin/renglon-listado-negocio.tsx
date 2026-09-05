import Link from "next/link";

import type { RegistroListadoItem } from "@/lib/admin/consultas";
import {
  ETIQUETA_COLA_DESPUBLICADA,
  TEXTO_VER_DETALLE,
  textoEstadoNegocio,
  textoFechaDeRegistro,
} from "@/lib/admin/textos";

/**
 * Renglón del listado "Todos los negocios" (delta `revision-admin`,
 * requirement "Vista 'Todos los negocios'..."): nombre, colonia, fecha de
 * registro completa, estado escrito con palabras, la etiqueta de
 * despublicada cuando aplica, y "Ver detalle" hacia el detalle real.
 *
 * A diferencia de `TarjetaCola` (donde el nombre es el enlace y "Revisar"
 * es decorativo), aquí el texto visible Y accesible del enlace es
 * literalmente "Ver detalle" — así lo pide el requirement — con el mismo
 * patrón de "stretched link" (`after:absolute after:inset-0`) para que todo
 * el renglón sea tocable y el área táctil pase de 44px sin depender del
 * tamaño del texto del enlace. Solo lectura: ningún botón de acción, ningún
 * dato sensible (ni WhatsApp, ni teléfono, ni dirección, ni foto, ni
 * motivos). Server Component, sin JS.
 */
export function RenglonListadoNegocio({
  id,
  nombre,
  coloniaTexto,
  registradoEn,
  estado,
  vieneDeDespublicacion,
}: RegistroListadoItem) {
  return (
    <article className="relative flex min-h-11 flex-col gap-1.5 rounded-xl border border-borde bg-fondo p-4">
      <h2 className="font-semibold break-words text-tinta">{nombre}</h2>
      <p className="break-words text-sm text-tinta-suave">{coloniaTexto}</p>
      <p className="text-sm text-tinta-suave">{textoFechaDeRegistro(registradoEn)}</p>
      <p className="w-fit rounded-full border border-borde px-2.5 py-1 text-xs font-semibold text-tinta">
        {textoEstadoNegocio(estado)}
      </p>
      {vieneDeDespublicacion && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tinta px-2.5 py-1 text-xs font-semibold text-tinta">
          {ETIQUETA_COLA_DESPUBLICADA}
        </p>
      )}
      <Link
        href={`/admin/registros/${id}`}
        className="w-fit text-sm font-semibold text-accion-fuerte underline underline-offset-4 after:absolute after:inset-0"
      >
        {TEXTO_VER_DETALLE}
      </Link>
    </article>
  );
}
