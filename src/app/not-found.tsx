import Link from "next/link";

/**
 * 404 global en español (spec layout-base, requirement "Página 404 en
 * español dentro del layout"): se muestra para cualquier URL desconocida y
 * para las categorías/negocios que el directorio marca inexistentes vía
 * `notFound()`. Vive dentro del layout raíz (header/footer), así que no
 * necesita repetirlos. Server Component, sin JS.
 *
 * El enlace de regreso usa el estilo de texto subrayado (no el verde de
 * acción): el verde se reserva para la acción de contactar por WhatsApp
 * (PRD §11), y "Ir al inicio" es navegación, no esa acción.
 */
export default function NotFound() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
        No encontramos esta página
      </h1>
      <p className="max-w-md text-tinta-suave">
        A lo mejor el negocio ya no está publicado o la dirección quedó mal
        escrita.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        Ir al inicio
      </Link>
    </section>
  );
}
