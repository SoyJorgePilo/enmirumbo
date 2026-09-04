import {
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_CONSENTIMIENTO,
} from "@/lib/registro/textos";

/**
 * Aviso de privacidad simplificado + checkbox de consentimiento
 * (registro-negocio spec, requirement "Consentimiento con aviso simplificado
 * visible y constancia"; tasks.md #5). Server Component: sin `<a>`/`<Link>`
 * mientras la página del aviso integral (E6) no exista — cero enlaces
 * muertos, igual que el footer de T-002.
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
      {/*
        TODO(E6): cuando exista la página del aviso integral, agregar aquí
        el enlace y quitar la última oración del texto de arriba.
      */}
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
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-borde"
        />
        <span>{TEXTO_CONSENTIMIENTO}</span>
      </label>
    </div>
  );
}
