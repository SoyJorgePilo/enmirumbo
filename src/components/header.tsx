import Link from "next/link";

/**
 * Header global: wordmark tipográfico "EnMiRumbo" solo, enlazado a la home.
 * Server Component sin JS de cliente. El logo gráfico definitivo se decide
 * fuera del código.
 *
 * ENMENDADO (encargo del fundador, fix `fix/contorno-controles`): el header
 * ya NO lleva "Tizayuca" junto al wordmark — queda limpio. El posicionamiento
 * hiperlocal no desaparece del producto: vive en el `h1` de la home
 * ("¿Qué necesitas en Tizayuca?"), en el footer ("Hecho para los vecinos de
 * Tizayuca, Hidalgo.") y en toda la metadata SEO (title/description/OG), que
 * esta enmienda deja intactos — son para Google, no para la vista del header.
 */
export function Header() {
  return (
    <header className="border-b border-borde bg-fondo">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center py-2">
          <span className="text-xl font-bold tracking-tight text-tinta">
            EnMiRumbo
          </span>
        </Link>
      </div>
    </header>
  );
}
