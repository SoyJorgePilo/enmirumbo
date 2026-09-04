import Link from "next/link";

/** Una opción del filtro: su nombre, a dónde lleva y si es la actual. */
export type OpcionDeColonia = {
  nombre: string;
  href: string;
  activa: boolean;
};

export type NavegacionColoniasProps = {
  /** Destino de "Todas las colonias" (el listado o la página del giro). */
  hrefTodas: string;
  /** `true` cuando no hay ninguna colonia aplicada. */
  todasActiva: boolean;
  opciones: OpcionDeColonia[];
};

function claseFiltro(activo: boolean): string {
  const base =
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors";
  return activo
    ? `${base} border-accion-fuerte bg-superficie text-tinta`
    : `${base} border-borde text-tinta-suave hover:bg-superficie`;
}

/**
 * Navegación por colonia del listado por categoría y de las páginas de giro
 * (spec `directorio-publico`, requirements "Filtro por colonia…" y "Página
 * indexable por giro en la raíz…").
 *
 * Son enlaces, no un `<select>`: funciona con el JavaScript de cliente
 * deshabilitado y cada opción es una URL que se puede compartir. Lo que
 * cambia entre las dos páginas es a dónde llevan (un `?colonia=` en el
 * listado por categoría, una URL propia `/giro-colonia` en las de giro), así
 * que este componente recibe los `href` ya armados y no los inventa.
 *
 * Sin opciones no se pinta nada: un filtro con una sola salida es un control
 * muerto. Server Component, sin JS.
 */
export function NavegacionColonias({
  hrefTodas,
  todasActiva,
  opciones,
}: NavegacionColoniasProps) {
  if (opciones.length === 0) return null;

  return (
    <nav aria-label="Filtrar por colonia" className="flex flex-wrap gap-2">
      <Link
        href={hrefTodas}
        aria-current={todasActiva ? "true" : undefined}
        className={claseFiltro(todasActiva)}
      >
        Todas las colonias
      </Link>
      {opciones.map((opcion) => (
        <Link
          key={opcion.href}
          href={opcion.href}
          aria-current={opcion.activa ? "true" : undefined}
          className={claseFiltro(opcion.activa)}
        >
          {opcion.nombre}
        </Link>
      ))}
    </nav>
  );
}
