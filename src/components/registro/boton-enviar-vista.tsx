import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

export type BotonEnviarVistaProps = {
  /** Texto del botón en reposo ("Registrar mi negocio" o "Enviar cambios"). */
  texto: string;
  /**
   * ¿Hay un envío en curso? Lo decide quien lo pinta: `BotonEnviar` con
   * `useFormStatus`; la variante nativa lo pinta siempre en reposo y la mejora
   * progresiva cambia el botón en el navegador (change `migrar-registro-astro`,
   * design.md §2).
   */
  enviando: boolean;
};

/**
 * El botón de envío del registro, SIN hooks: el marcado exacto que pintaba
 * `boton-enviar.tsx`. Deshabilitado y con "Enviando..." mientras hay un envío
 * en curso (scenario "estado enviando"); el texto de "enviando" NO se
 * parametriza a propósito: ninguna spec pide uno distinto y
 * `tests/registro-pagina.test.ts` ancla ese literal en este archivo.
 */
export function BotonEnviarVista({ texto, enviando }: BotonEnviarVistaProps) {
  const pending = enviando;
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
