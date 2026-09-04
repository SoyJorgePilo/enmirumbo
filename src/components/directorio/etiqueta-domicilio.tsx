/**
 * Etiqueta "A domicilio" (PRD §6.2): la pinta el llamador SOLO cuando
 * `negocio.entregaADomicilio` es cierto — este componente no decide eso,
 * solo dibuja la etiqueta. Server Component, sin props.
 */
export function EtiquetaADomicilio() {
  return (
    <span className="inline-flex items-center rounded-full border border-borde px-2.5 py-1 text-xs font-semibold text-tinta-suave">
      A domicilio
    </span>
  );
}
