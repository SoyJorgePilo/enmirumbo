import type { ComponentPropsWithoutRef } from "react";

type LinkProps = ComponentPropsWithoutRef<"a"> & { href: string };

/**
 * Enlace de la capa de compatibilidad (ADR-013; change
 * `agregar-andamio-astro`, design.md §3): reemplaza a `next/link` en
 * `src/components/` para que los componentes se pinten igual desde Astro.
 *
 * Pinta el mismo `<a>` que `next/link` en servidor con las props que hoy se
 * usan (`href` de texto, `className`, `aria-*`). No reproduce la precarga ni
 * la navegación del lado del cliente de Next: no existen en el HTML servido y
 * el sitio no lleva JS propio. La paridad la comprueba
 * `tests/compat-paridad.test.ts`.
 */
export function Link({ href, ...resto }: LinkProps) {
  return <a {...resto} href={href} />;
}
