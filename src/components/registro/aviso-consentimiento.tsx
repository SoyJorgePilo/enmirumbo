import Link from "next/link";

import { VERSION_AVISO } from "@/lib/legales/version";
import {
  CAMPO_VERSION_AVISO,
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_CONSENTIMIENTO,
  TEXTO_ENLACE_AVISO_INTEGRAL,
  textoVersionAceptada,
} from "@/lib/registro/textos";

/**
 * Aviso de privacidad simplificado + checkbox de consentimiento
 * (registro-negocio spec, requirement "Consentimiento con aviso simplificado
 * visible y constancia"; tasks.md #5 y, del delta de `agregar-paginas-legales`,
 * tasks.md #23). Server Component: el enlace al aviso integral
 * (`/aviso-de-privacidad`, E6) ya existe, así que deja de ser un enlace
 * muerto.
 *
 * Se compone dentro del formulario de cliente como `children`/prop (ver
 * `formulario-registro.tsx`), así que este texto largo NO viaja en el
 * bundle de JS del cliente: se renderiza en el servidor y se pasa ya hecho.
 *
 * El mensaje de error del checkbox (si falta marcarlo) lo pinta el
 * formulario padre, asociado por `aria-describedby="consentimiento-error"`
 * — ese `id` puede no existir en el DOM (sin error) y los lectores de
 * pantalla simplemente lo ignoran en ese caso.
 */
export function AvisoConsentimiento() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      <p className="text-sm text-tinta-suave">{TEXTO_AVISO_PRIVACIDAD}</p>
      <Link
        href="/aviso-de-privacidad"
        className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_ENLACE_AVISO_INTEGRAL}
      </Link>
      {/*
        Qué versión del aviso se está aceptando (change
        `versionar-aviso-privacidad`): es TEXTO, no un campo que el dueño
        tenga que llenar o elegir. La versión sale del módulo que la declara,
        la misma que muestra `/aviso-de-privacidad`.
      */}
      <p className="text-sm font-semibold text-tinta">
        {textoVersionAceptada(VERSION_AVISO)}
      </p>
      {/*
        La versión con la que se pintó este formulario, de vuelta al servidor
        (design.md §3). Se usa SOLO para comparar: si el aviso estrenó versión
        mientras el dueño llenaba, el envío no se guarda y se le pide releer.
        La versión que se sella siempre es la del servidor, así que mandar
        cualquier cosa aquí solo consigue que se vuelva a pedir la casilla.
        Va renderizado en el servidor: viaja en el HTML y funciona sin JS.
      */}
      <input type="hidden" name={CAMPO_VERSION_AVISO} value={VERSION_AVISO} />
      <label
        htmlFor="consentimiento"
        className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-tinta"
      >
        <input
          type="checkbox"
          id="consentimiento"
          name="consentimiento"
          required
          defaultChecked={false}
          aria-describedby="consentimiento-error"
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-borde-control"
        />
        <span>{TEXTO_CONSENTIMIENTO}</span>
      </label>
    </div>
  );
}
