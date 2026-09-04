import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { reportarNegocio } from "@/app/negocio/[ficha]/reportar/accion";
import {
  FormularioReporte,
  type ErrorFormularioReporte,
} from "@/components/reportes/formulario-reporte";
import { obtenerNegocioPublicado } from "@/lib/directorio";
import {
  construirSegmentoFicha,
  extraerIdDeSegmentoFicha,
} from "@/lib/ficha-url";
import {
  NOMBRE_COOKIE_BORRADOR,
  decodificarBorrador,
} from "@/lib/reportes/borrador";
import {
  CONTROL_REPORTAR,
  ENLACE_VOLVER_A_LA_FICHA,
  FRASE_REPORTAR,
  LIMITE_COMENTARIO_REPORTE,
} from "@/lib/reportes/textos";

/** La página no se indexa (requirement "La página de reporte no se indexa"). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

const ERRORES_VALIDOS: readonly ErrorFormularioReporte[] = [
  "motivo",
  "comentario",
  "cupo",
  "servidor",
];

function primeraCadena(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function errorDelFormulario(
  valor: string | string[] | undefined,
): ErrorFormularioReporte | undefined {
  const cadena = primeraCadena(valor);
  return (ERRORES_VALIDOS as readonly string[]).includes(cadena ?? "")
    ? (cadena as ErrorFormularioReporte)
    : undefined;
}

/**
 * Página propia del mini-formulario de reporte (spec `directorio-publico`,
 * requirement "Mini-formulario de reporte..."; design.md §1: página aparte,
 * no un bloque dentro de la ficha, para no meterle un `<form>` a la ficha que
 * el 99% de las visitas no usa y para poder marcar `noindex` sin tocar la
 * indexabilidad de la ficha).
 *
 * El identificador se extrae con `extraerIdDeSegmentoFicha`, el mismo helper
 * de la ficha (design.md §1): un enlace viejo con el nombre anterior del
 * negocio también abre el reporte. Si el negocio no existe o no está
 * `publicado`, la página responde el MISMO 404 que una ficha inexistente —
 * `obtenerNegocioPublicado` ya filtra por estado, así que un negocio
 * `en_revision` o `rechazado` cae en la misma rama sin delatar nada
 * (requirement "reportar un negocio que no está publicado").
 *
 * Server Component, sin JavaScript de cliente: los errores viajan por
 * `searchParams` tras el `redirect` (POST→GET) de la Server Action.
 */
export default async function ReportarNegocioPage({
  params,
  searchParams,
}: PageProps<"/negocio/[ficha]/reportar">) {
  const { ficha } = await params;
  const sp = await searchParams;

  const id = extraerIdDeSegmentoFicha(ficha);
  const negocio = id ? await obtenerNegocioPublicado(id) : null;
  if (!negocio) notFound();

  const hrefFicha = `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}`;
  const error = errorDelFormulario(sp.error);

  // Lo que el vecino ya había escrito vuelve por la cookie de borrador, NO por
  // la URL: una query string acaba en el log de acceso del proxy y en el
  // historial del teléfono, y el comentario es contenido del reporte (spec de
  // privacidad; hallazgo M2 de la etapa C). En la URL solo viaja `?error`.
  const cookieStore = await cookies();
  const comentarioPrevio = decodificarBorrador(
    cookieStore.get(NOMBRE_COOKIE_BORRADOR)?.value,
    LIMITE_COMENTARIO_REPORTE,
  );

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {CONTROL_REPORTAR}
        </h1>
        <p className="break-words font-semibold text-tinta">{negocio.nombre}</p>
        <p className="text-tinta-suave">{FRASE_REPORTAR}</p>
      </div>

      {/* Se liga SOLO el identificador, y porque la acción lo valida contra
          la base antes de usarlo para nada: lo que va aquí viaja al navegador
          como un campo oculto sin firmar y vuelve tal como el cliente quiera
          (hallazgo M3 de la etapa C). La ruta de la ficha ya no se liga: la
          reconstruye el servidor. */}
      <FormularioReporte
        action={reportarNegocio.bind(null, negocio.id)}
        comentarioPrevio={comentarioPrevio}
        error={error}
      />

      <Link
        href={hrefFicha}
        className="inline-flex min-h-11 items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {ENLACE_VOLVER_A_LA_FICHA}
      </Link>
    </section>
  );
}
