import Link from "next/link";

import { NOTA_PRIVACIDAD_VIGENTE } from "@/lib/gestion/textos";
import { TEXTO_ENLACE_AVISO_INTEGRAL } from "@/lib/registro/textos";

/**
 * Nota que sustituye al bloque de consentimiento en el modo edición (spec
 * `registro-negocio`, requirement "El enlace de gestión abre la ficha en
 * modo edición...", scenario "la edición no vuelve a pedir consentimiento").
 *
 * Se pasa como la prop `aviso` de `FormularioRegistro` — mismo hueco que
 * ocupa `AvisoConsentimiento` en el registro, pero SIN checkbox: el
 * consentimiento ya se dio al registrarse y `consintioAvisoEn` no se toca
 * (design.md §5 del change `agregar-enlace-de-gestion`). Server Component,
 * sin JS.
 */
export function AvisoPrivacidadVigente() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <p className="text-sm text-tinta-suave">{NOTA_PRIVACIDAD_VIGENTE}</p>
      <Link
        href="/aviso-de-privacidad"
        className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_ENLACE_AVISO_INTEGRAL}
      </Link>
    </div>
  );
}
