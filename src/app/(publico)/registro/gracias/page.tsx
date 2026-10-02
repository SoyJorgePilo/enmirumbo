import Link from "next/link";

import { MENSAJE_GRACIAS } from "@/lib/registro/textos";
import {
  LINEA_CONFIRMACION_NUMERO_GRACIAS,
  MENSAJE_INTENTOS_AGOTADOS_VERIFICAR,
} from "@/lib/verificacion/textos";

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Pantalla de gracias (registro-negocio spec, PRD §6.1; tasks.md #13).
 * Destino del `redirect` tras un registro exitoso (patrón
 * POST-Redirect-GET, design.md §1): recargar esta página no reenvía el
 * formulario porque aquí ya no hay ningún `<form>` que lo haga. Server
 * Component, sin JS.
 *
 * El `h1` es el mensaje literal completo del PRD §6.1, y **NO cambia ni una
 * palabra** con la verificación por SMS (requirement "El envío exitoso
 * encola el negocio y muestra la pantalla de gracias"): una comparación
 * "carácter por carácter" (tasks.md #13) no depende de dónde se parta el
 * texto entre encabezado y párrafo.
 *
 * `?verificado=1` y `?agotado=1` son banderas de PRESENTACIÓN, sin dato
 * personal ni identificador (design.md §2, paso 5: "una bandera de
 * presentación"), que ponen las Server Actions de `/registro/verificar`
 * (`accion-confirmar.ts` y `accion-reenviar.ts`) tras `redirect`. Recargar
 * esta pantalla no vuelve a marcar ni a crear
 * nada: los dos parámetros solo deciden qué línea EXTRA se pinta arriba del
 * mensaje de siempre, nunca lo sustituyen. Con la capacidad apagada nunca
 * llega ninguno de los dos, así que la pantalla queda idéntica a la de hoy.
 */
export default async function RegistroGraciasPage({
  searchParams,
}: PageProps<"/registro/gracias">) {
  const sp = await searchParams;
  const verificado = primeraCadena(sp.verificado) === "1";
  const agotado = primeraCadena(sp.agotado) === "1";

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="flex max-w-md flex-col gap-2">
        {verificado && (
          <p role="status" className="text-lg font-semibold text-tinta">
            {LINEA_CONFIRMACION_NUMERO_GRACIAS}
          </p>
        )}
        {agotado && (
          <p role="status" className="text-lg font-semibold text-tinta">
            {MENSAJE_INTENTOS_AGOTADOS_VERIFICAR}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {MENSAJE_GRACIAS}
        </h1>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center px-4 text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
