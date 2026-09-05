import type { Metadata } from "next";
import Link from "next/link";

import { FiltrosListadoNegocios } from "@/components/admin/filtros-listado-negocios";
import { PaginacionListadoNegocios } from "@/components/admin/paginacion-listado-negocios";
import { RenglonListadoNegocio } from "@/components/admin/renglon-listado-negocio";
import { obtenerListadoDeNegocios } from "@/lib/admin/consultas";
import { requerirSesionAdmin } from "@/lib/admin/guarda";
import {
  FILTRO_TODOS,
  PORPAGINA_LISTADO,
  normalizarFiltroEstado,
  normalizarPagina,
} from "@/lib/admin/listado-parametros";
import {
  TEXTO_FILTRO_SIN_RESULTADOS,
  TEXTO_LISTADO_VACIO,
  TEXTO_NEGOCIOS_ENCABEZADO,
  TEXTO_VOLVER_A_LA_COLA,
  textoConteoNegociosListado,
} from "@/lib/admin/textos";
import { obtenerPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Todos los negocios — Panel de revisión",
  robots: { index: false, follow: false },
};

/**
 * Vista "Todos los negocios" (delta `revision-admin`, requirement "Vista
 * 'Todos los negocios' con el estado a la vista y entrada al detalle"): la
 * puerta de entrada que le faltaba al panel para llegar a cualquier ficha,
 * publicada o no, tenga o no reportes. Solo lectura: filtrar, cambiar de
 * página y abrir un detalle son las únicas tres cosas que se pueden hacer
 * aquí (ningún botón de aprobar, rechazar, despublicar, borrar ni marcar
 * reportes).
 *
 * La guarda va ANTES de leer nada, igual que el resto del panel: sin sesión
 * válida no se calcula ni un conteo y la respuesta es la redirección a la
 * pantalla de acceso.
 *
 * `estado` y `pagina` son las únicas dos cosas que viajan en la URL de esta
 * pantalla (requirement "ningún dato personal DEBE ir en el querystring");
 * su normalización (`normalizarFiltroEstado`/`normalizarPagina`) nunca
 * lanza, así que un parámetro manoseado cae al valor por defecto en vez de
 * producir un error del servidor.
 */
export default async function NegociosAdminPage({
  searchParams,
}: PageProps<"/admin/negocios">) {
  await requerirSesionAdmin();

  const sp = await searchParams;
  const filtroActivo = normalizarFiltroEstado(sp.estado);
  const paginaPedida = normalizarPagina(sp.pagina);

  const { registros, total } = await obtenerListadoDeNegocios(obtenerPrisma(), {
    estado: filtroActivo,
    pagina: paginaPedida,
    porPagina: PORPAGINA_LISTADO,
  });

  // Una `pagina` más allá de la última no es error: se ve la lista vacía y
  // "Ver más nuevos" para regresar (requirement "página más allá de la
  // última"). `totalPaginas` nunca baja de 1 para que "Página 1 de 1" tenga
  // sentido incluso sin ningún registro.
  const totalPaginas = Math.max(1, Math.ceil(total / PORPAGINA_LISTADO));
  const paginaActual = Math.min(paginaPedida, totalPaginas);
  const fueraDeRango = paginaPedida > totalPaginas;

  // Los dos textos de vacío hablan de LA LISTA (por eso miran `total`, no los
  // renglones de esta página): "Todavía no hay negocios registrados." si la
  // base está vacía, "No hay negocios con ese estado." si el filtro no dejó
  // nada. Una página más allá de la última no es ninguno de los dos casos —la
  // lista sí tiene registros, solo que no en esa página— así que ahí no se
  // pinta ninguno de los dos: lo que explica esa pantalla, y da la salida, es
  // el "Ver más nuevos" de la paginación (requirement "página más allá de la
  // última", que pide exactamente eso y ningún texto nuevo).
  const hayFiltro = filtroActivo !== FILTRO_TODOS;
  const listaVacia = total === 0;

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {TEXTO_NEGOCIOS_ENCABEZADO}
        </h1>
      </div>

      <p className="text-sm font-semibold text-tinta-suave">
        {textoConteoNegociosListado(total)}
      </p>

      <FiltrosListadoNegocios filtroActivo={filtroActivo} />

      {listaVacia && (
        <p className="text-tinta-suave">
          {hayFiltro ? TEXTO_FILTRO_SIN_RESULTADOS : TEXTO_LISTADO_VACIO}
        </p>
      )}

      {registros.length > 0 && (
        <ul className="flex flex-col gap-3">
          {registros.map((registro) => (
            <li key={registro.id}>
              <RenglonListadoNegocio {...registro} />
            </li>
          ))}
        </ul>
      )}

      {(totalPaginas > 1 || fueraDeRango) && (
        <PaginacionListadoNegocios
          filtroActivo={filtroActivo}
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          fueraDeRango={fueraDeRango}
        />
      )}

      <Link
        href="/admin/cola"
        className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
      >
        {TEXTO_VOLVER_A_LA_COLA}
      </Link>
    </section>
  );
}
