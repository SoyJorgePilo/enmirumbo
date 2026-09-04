"use client";

import { useFormStatus } from "react-dom";

import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

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
export function BotonEnviar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${CLASE_BOTON_PRIMARIO} w-full disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? "Enviando..." : "Registrar mi negocio"}
    </button>
  );
}
