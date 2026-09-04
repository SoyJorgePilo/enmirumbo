import Link from "next/link";

/**
 * Footer global: identificación del sitio y los dos enlaces legales (E6,
 * spec `layout-base`, requirement "Layout global con header y footer en
 * todas las páginas"). Cada enlace mide al menos 44px en su dimensión menor
 * y lleva a una página que existe de verdad. Server Component sin JS de
 * cliente.
 */
export function Footer() {
  return (
    <footer className="border-t border-borde bg-superficie">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-6 text-sm text-tinta-suave sm:px-6">
        <p className="font-semibold text-tinta">NecesitoUno Tizayuca</p>
        <p>Hecho para los vecinos de Tizayuca, Hidalgo.</p>
        <nav aria-label="Enlaces legales" className="mt-2 flex flex-wrap gap-x-4">
          <Link
            href="/aviso-de-privacidad"
            className="inline-flex min-h-11 items-center text-tinta underline underline-offset-4"
          >
            Aviso de privacidad
          </Link>
          <Link
            href="/terminos"
            className="inline-flex min-h-11 items-center text-tinta underline underline-offset-4"
          >
            Términos y condiciones
          </Link>
        </nav>
      </div>
    </footer>
  );
}
