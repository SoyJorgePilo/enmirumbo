/**
 * Buscador del directorio (spec `directorio-publico`, requirement "Buscador
 * en la home que funciona sin JavaScript de cliente"; change
 * `agregar-buscador`, tasks.md #9).
 *
 * Formulario GET puro hacia `/buscar?q=…`: sin directiva de cliente, sin
 * manejador de eventos, resuelto enteramente por el servidor. Se usa dos
 * veces: en la home (sin `valorInicial`) y arriba de la página de resultados
 * (`valorInicial` con lo que el vecino ya escribió, para poder corregir sin
 * regresar — requirement "Página de resultados con las mismas tarjetas del
 * listado").
 *
 * A propósito NO agrega ningún encabezado (`h1`-`h6`) propio: quien lo monta
 * decide su título. La etiqueta del campo es un `<label>` visible, no un
 * encabezado.
 */
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type BuscadorProps = {
  /** Lo que el vecino ya escribió, para prellenar el campo en `/buscar`. */
  valorInicial?: string;
};

export function Buscador({ valorInicial = "" }: BuscadorProps) {
  return (
    <form
      action="/buscar"
      method="get"
      role="search"
      className="flex items-end gap-2"
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="buscador-q"
          className="mb-1 block text-sm font-semibold text-tinta"
        >
          Busca lo que necesitas
        </label>
        <input
          type="search"
          id="buscador-q"
          name="q"
          defaultValue={valorInicial}
          placeholder="ej. plomero, tacos, futbol infantil"
          className="min-h-11 w-full rounded-lg border border-borde bg-fondo px-4 text-base text-tinta placeholder:text-tinta-suave focus:outline-none focus:ring-2 focus:ring-accion-fuerte"
        />
      </div>
      {/*
       * Botón NEUTRO (no `CLASE_BOTON_PRIMARIO`): el verde de acción se
       * reserva para "Registra tu negocio gratis" y el WhatsApp de cada
       * tarjeta (PRD §11) — dos verdes en la misma pantalla competirían.
       */}
      <button type="submit" className={`${CLASE_BOTON_SECUNDARIO} shrink-0`}>
        Buscar
      </button>
    </form>
  );
}
