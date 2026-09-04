/**
 * Etiqueta "A domicilio" (PRD §6.2): la pinta el llamador SOLO cuando
 * `negocio.entregaADomicilio` es cierto — este componente no decide eso,
 * solo dibuja la etiqueta. Server Component, sin props.
 *
 * `w-fit` (enmienda aprobada por el fundador, revisión visual lote 2): dentro
 * de la tarjeta, que es una columna flex, el `align-items: stretch` estiraba
 * esta pastilla a TODO el ancho de la tarjeta y "A domicilio" se leía como un
 * campo vacío larguísimo. La etiqueta mide lo que su texto, aquí y en la ficha.
 */
export function EtiquetaADomicilio() {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-borde px-2.5 py-1 text-xs font-semibold text-tinta-suave">
      A domicilio
    </span>
  );
}
