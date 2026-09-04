/**
 * Sello "Negocio verificado" (PRD §6.2): la verificación manual por
 * WhatsApp del admin es el diferenciador del directorio, así que se marca
 * en cada ficha. Server Component, sin props: el sello es igual siempre que
 * se pinta (solo se renderiza en negocios publicados, que ya pasaron la
 * revisión — la página decide cuándo mostrarlo, no este componente).
 */
export function SelloVerificado() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-superficie px-3 py-1 text-sm font-semibold text-tinta">
      <span aria-hidden="true">✓</span>
      Negocio verificado
    </span>
  );
}
