import Link from "next/link";

import { EtiquetaTipoCola } from "@/components/admin/etiqueta-tipo-cola";
import { IndicadorAtrasado } from "@/components/admin/indicador-atrasado";
import { ETIQUETA_COLA_DESPUBLICADA, TEXTO_REVISAR } from "@/lib/admin/textos";
import type { RegistroColaItem } from "@/lib/admin/consultas";
import { ETIQUETA_COLA_NUMERO_VERIFICADO_SMS } from "@/lib/verificacion/textos";

/**
 * Un renglón de la cola, tal como lo arma `obtenerColaDeRevision`. `tipo` y
 * `hrefDetalle` los trae ya el propio item (change
 * `agregar-enlace-de-gestion`): la cola es una sola lista con altas y
 * ediciones, y cada renglón sabe qué es y a dónde lleva.
 */
export type TarjetaColaProps = RegistroColaItem;

/**
 * Renglón de la cola (requirement "Cola de revisión..."): nombre, colonia,
 * desde cuándo espera, el indicador de 48 horas si aplica, y la entrada al
 * detalle. Una sola acción por renglón ("Revisar"), así que todo el
 * `<article>` es el enlace (patrón "stretched link" de `tarjeta-negocio`),
 * lo que además hace el área táctil más grande que el mínimo de 44px.
 * Server Component, sin JS.
 *
 * `vieneDeDespublicacion` (spec `agregar-despublicar-y-borrado-arco`,
 * requirement modificado "Cola de revisión..."): distingue una ficha que
 * volvió a la cola por despublicación de un alta nueva, con la etiqueta
 * literal aprobada — texto, no solo color, mismo criterio que
 * `IndicadorAtrasado`. `tipo`/`hrefDetalle` (change `agregar-enlace-de-
 * gestion`) son la misma idea aplicada a "esto es una edición, no un alta".
 *
 * `numeroVerificadoEn` (spec `revision-admin` MODIFIED de T-016, ADR-011):
 * la etiqueta "Número verificado por SMS" aparece SOLO cuando la ficha trae
 * su fecha de verificación, sin condición de la bandera — si la capacidad
 * está apagada ninguna ficha llega con esta fecha, así que el fail-safe se
 * cumple solo.
 */
export function TarjetaCola({
  nombre,
  coloniaTexto,
  esperaTexto,
  atrasado,
  vieneDeDespublicacion,
  tipo,
  hrefDetalle,
  numeroVerificadoEn,
}: TarjetaColaProps) {
  return (
    <article className="relative flex min-h-11 flex-col gap-1.5 rounded-xl border border-borde bg-fondo p-4">
      <h2 className="font-semibold break-words text-tinta">
        <Link href={hrefDetalle} className="after:absolute after:inset-0">
          {nombre}
        </Link>
      </h2>
      <p className="break-words text-sm text-tinta-suave">{coloniaTexto}</p>
      <p className="text-sm text-tinta-suave">{esperaTexto}</p>
      <EtiquetaTipoCola tipo={tipo} />
      {vieneDeDespublicacion && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tinta px-2.5 py-1 text-xs font-semibold text-tinta">
          {ETIQUETA_COLA_DESPUBLICADA}
        </p>
      )}
      {numeroVerificadoEn && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-tinta px-2.5 py-1 text-xs font-semibold text-tinta">
          {ETIQUETA_COLA_NUMERO_VERIFICADO_SMS}
        </p>
      )}
      {atrasado && <IndicadorAtrasado />}
      <span aria-hidden="true" className="text-sm font-semibold text-accion-fuerte">
        {TEXTO_REVISAR} →
      </span>
    </article>
  );
}
