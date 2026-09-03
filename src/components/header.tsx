import Link from "next/link";

/**
 * Header global: wordmark tipográfico "NecesitoUno" + posicionamiento
 * "Tizayuca" (PRD §11), enlazado a la home. Server Component sin JS de
 * cliente. El logo gráfico definitivo se decide fuera del código.
 */
export function Header() {
  return (
    <header className="border-b border-borde bg-fondo">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-baseline gap-2 py-2"
        >
          <span className="text-xl font-bold tracking-tight text-tinta">
            NecesitoUno
          </span>
          <span className="text-sm font-medium text-tinta-suave">Tizayuca</span>
        </Link>
      </div>
    </header>
  );
}
