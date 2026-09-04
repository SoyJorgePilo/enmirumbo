import Link from "next/link";

import { MENSAJE_GRACIAS } from "@/lib/registro/textos";

/**
 * Pantalla de gracias (registro-negocio spec, PRD §6.1; tasks.md #13).
 * Destino del `redirect` tras un registro exitoso (patrón
 * POST-Redirect-GET, design.md §1): recargar esta página no reenvía el
 * formulario porque aquí ya no hay ningún `<form>` que lo haga. Server
 * Component, sin JS.
 *
 * El `h1` es el mensaje literal completo del PRD §6.1 — así una comparación
 * "carácter por carácter" (tasks.md #13) no depende de dónde se parta el
 * texto entre encabezado y párrafo.
 */
export default function RegistroGraciasPage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
        {MENSAJE_GRACIAS}
      </h1>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
