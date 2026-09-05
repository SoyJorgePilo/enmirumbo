"use client";

import { useFormStatus } from "react-dom";

import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

export type BotonEnviarProps = {
  /**
   * Texto del botón en reposo. Por defecto "Registrar mi negocio" (spec
   * `registro-negocio`); el modo edición del enlace de gestión (change
   * `agregar-enlace-de-gestion`) pasa el literal "Enviar cambios". El texto
   * de "enviando" NO se parametriza a propósito: ninguna spec pide uno
   * distinto de "Enviando..." y `tests/registro-pagina.test.ts` ancla ese
   * literal en el código fuente de este componente.
   */
  texto?: string;
};

/**
 * Botón de envío del registro (tasks.md #12): componente cliente mínimo,
 * dedicado solo al estado "enviando" (design.md §1). Usa `useFormStatus`,
 * así que debe renderizarse dentro del `<form>` que llama a la Server
 * Action — de ahí que sea un componente aparte y no reciba `pending` por
 * prop.
 *
 * Deshabilitar el botón mientras `pending` es cierto evita el doble envío
 * (scenario "estado enviando" de la spec). Sin JavaScript, `pending` nunca
 * es cierto y el botón se comporta como un submit normal.
 */
export function BotonEnviar({ texto = "Registrar mi negocio" }: BotonEnviarProps = {}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${CLASE_BOTON_PRIMARIO} w-full disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? "Enviando..." : texto}
    </button>
  );
}
