type ImagenProps = {
  src: string;
  alt: string;
  /** Solo se admite el modo de relleno: el único que usa `MarcadorFoto`. */
  fill: true;
  priority?: boolean;
  /** Siempre sin optimizar: no hay optimizador (design.md §6). */
  unoptimized: true;
  /**
   * Se acepta para no tocar a quien llama, pero no se pinta: sin optimizador
   * no hay `srcset`, y `next/image` tampoco emite `sizes` en ese caso.
   */
  sizes?: string;
  className?: string;
};

/** El posicionamiento de relleno que `next/image` pone con `fill`. */
const ESTILO_RELLENO = {
  position: "absolute",
  height: "100%",
  width: "100%",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  color: "transparent",
} as const;

/**
 * Imagen de la capa de compatibilidad (ADR-013; change
 * `agregar-andamio-astro`, design.md §3): reemplaza a `next/image` en
 * `MarcadorFoto`, con el mismo HTML que `next/image` 16 pinta en servidor
 * para `fill` + `unoptimized`:
 *
 * - sin prioridad, `loading="lazy"` (carga diferida, spec
 *   `directorio-publico`, "El peso de las fotos no rompe el presupuesto de
 *   4G");
 * - con prioridad, sin `loading`. La precarga `<link rel="preload"
 *   as="image">` que acompaña a la foto prioritaria no la pone este
 *   componente (ni `next/image`): React 19 la emite solo al pintar en
 *   servidor un `<img>` que no es diferido. `next/image` 16 tampoco pinta
 *   `fetchpriority` en este caso.
 *
 * El `src` se respeta tal cual: no hay `/_next/image` ni otro optimizador.
 * La paridad la comprueba `tests/compat-paridad.test.ts`.
 */
export function Imagen({ src, alt, priority = false, className }: ImagenProps) {
  return (
    <img
      alt={alt}
      loading={priority ? undefined : "lazy"}
      decoding="async"
      data-nimg="fill"
      className={className}
      style={ESTILO_RELLENO}
      src={src}
    />
  );
}
