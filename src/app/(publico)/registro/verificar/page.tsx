import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { confirmarCodigoVerificarAccion } from "@/app/(publico)/registro/verificar/accion-confirmar";
import { reenviarCodigoVerificarAccion } from "@/app/(publico)/registro/verificar/accion-reenviar";
import {
  FormularioVerificarCodigo,
  type ErrorFormularioVerificar,
  type ErrorReenvioVerificar,
} from "@/components/registro/formulario-verificar-codigo";
import { leerConfiguracionVerificacion } from "@/lib/verificacion/config";
import { COOKIE_PASO, leerPaso } from "@/lib/verificacion/paso";
import {
  TEXTO_ENCABEZADO_VERIFICAR,
  TEXTO_TRANQUILIDAD_VERIFICAR,
  textoExplicacionVerificar,
} from "@/lib/verificacion/textos";

/** La pantalla no se indexa (requirement "...NO DEBE ser indexable"). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

const ERRORES_CODIGO_VALIDOS: readonly ErrorFormularioVerificar[] = [
  "incompleto",
  "no-coincide",
  "vencido",
  "proveedor",
];
const ERRORES_REENVIO_VALIDOS: readonly ErrorReenvioVerificar[] = ["espera-reenvio", "cupo"];

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Pantalla "Confirma tu número" (spec `registro-negocio`, requirement del
 * mismo nombre; ADR-011). Solo se alcanza cuando la capacidad está encendida
 * Y quien llega trae la cookie de paso que puso el servidor al pedir el
 * código.
 *
 * Dos guardas, en este orden: primero la configuración (con la capacidad
 * apagada la ruta NO EXISTE, requirement "la ruta del código no existe cuando
 * la capacidad está apagada") y después la cookie de paso FIRMADA
 * (`src/lib/verificacion/paso.ts`). Sin cualquiera de las dos, `notFound()` —
 * y no dice si el registro existe (requirement "la pantalla no se abre de a
 * gratis").
 *
 * Los errores viajan por `?error`/`?errorReenvio`, un código cerrado que
 * pone el propio servidor (nunca el código de verificación, el número ni el
 * identificador de la ficha) — mismo patrón que `/negocio/[ficha]/reportar`.
 * Server Component, sin JavaScript de cliente: las tres acciones de la
 * pantalla son envíos de formulario normales.
 */
export default async function RegistroVerificarPage({
  searchParams,
}: PageProps<"/registro/verificar">) {
  // FAIL-SAFE, el requirement rey: con la capacidad apagada o mal configurada
  // esta ruta responde como cualquier dirección inventada del sitio, sin
  // ninguna pista de que exista. Se pregunta ANTES de mirar la cookie.
  const configuracion = leerConfiguracionVerificacion();
  if (!configuracion) notFound();

  const cookieStore = await cookies();
  const paso = leerPaso(cookieStore.get(COOKIE_PASO)?.value, configuracion.secreto);
  if (!paso) notFound();

  const sp = await searchParams;

  const errorCrudo = primeraCadena(sp.error);
  const errorCodigo = (ERRORES_CODIGO_VALIDOS as readonly string[]).includes(errorCrudo ?? "")
    ? (errorCrudo as ErrorFormularioVerificar)
    : undefined;

  const errorReenvioCrudo = primeraCadena(sp.errorReenvio);
  const errorReenvio = (ERRORES_REENVIO_VALIDOS as readonly string[]).includes(
    errorReenvioCrudo ?? "",
  )
    ? (errorReenvioCrudo as ErrorReenvioVerificar)
    : undefined;

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {TEXTO_ENCABEZADO_VERIFICAR}
        </h1>
        <p className="text-tinta-suave">
          {textoExplicacionVerificar(paso.ultimosCuatroDigitos)}
        </p>
        <p className="text-tinta-suave">{TEXTO_TRANQUILIDAD_VERIFICAR}</p>
      </div>

      <FormularioVerificarCodigo
        accionConfirmar={confirmarCodigoVerificarAccion}
        accionReenviar={reenviarCodigoVerificarAccion}
        errorCodigo={errorCodigo}
        errorReenvio={errorReenvio}
      />
    </section>
  );
}
