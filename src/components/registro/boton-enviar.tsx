"use client";

import { useFormStatus } from "react-dom";

import { BotonEnviarVista } from "@/components/registro/boton-enviar-vista";

export type BotonEnviarProps = {
  /**
   * Texto del botón en reposo. Por defecto "Registrar mi negocio" (spec
   * `registro-negocio`); el modo edición del enlace de gestión (change
   * `agregar-enlace-de-gestion`) pasa el literal "Enviar cambios". El texto
   * de "enviando" NO se parametriza a propósito: vive, literal, en
   * `boton-enviar-vista.tsx`.
   */
  texto?: string;
};

/**
 * Botón de envío del registro (tasks.md #12): componente cliente mínimo,
 * dedicado solo al estado "enviando" (design.md §1). Usa `useFormStatus`,
 * así que debe renderizarse dentro del `<form>` que llama a la Server
 * Action — de ahí que sea un componente aparte y no reciba `pending` por
 * prop. El marcado es el de `BotonEnviarVista` (sin hooks, change
 * `migrar-registro-astro`, design.md §2).
 *
 * Deshabilitar el botón mientras `pending` es cierto evita el doble envío
 * (scenario "estado enviando" de la spec). Sin JavaScript, `pending` nunca
 * es cierto y el botón se comporta como un submit normal.
 */
export function BotonEnviar({ texto = "Registrar mi negocio" }: BotonEnviarProps = {}) {
  const { pending } = useFormStatus();
  return <BotonEnviarVista texto={texto} enviando={pending} />;
}
