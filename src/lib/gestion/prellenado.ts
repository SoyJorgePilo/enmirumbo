/**
 * De lo guardado al formulario: convierte una ficha publicada —o la edición
 * que el dueño mandó la última vez— en los valores con los que se pinta el
 * modo edición (change `agregar-enlace-de-gestion`, spec `registro-negocio`,
 * requirement "El enlace de gestión abre la ficha en modo edición con el mismo
 * formulario prellenado").
 *
 * `CamposFormularioRegistro` es todo texto porque un `FormData` siempre trae
 * texto: aquí se hace la conversión en un solo lugar, para que el formulario
 * de la edición y el del registro sigan siendo el mismo componente.
 *
 * La colonia "Otra" sin normalizar se conserva tal cual (scenario "negocio con
 * colonia 'Otra' sin normalizar"): se elige la opción "Otra" y su texto libre
 * vuelve escrito, sin inventarle una colonia del catálogo.
 *
 * Módulo puro: sin base y sin `process.env`.
 */
import { COLONIA_OTRA_VALOR } from "@/lib/registro/textos";
import type { CamposFormularioRegistro } from "@/lib/registro/tipos";

/** Lo mínimo que hace falta para prellenar: los campos editables guardados. */
export type FuenteDePrellenado = {
  nombre: string;
  categoriaId: number;
  whatsapp: string;
  coloniaId: number | null;
  coloniaOtra: string | null;
  queOfreces: string | null;
  entregaADomicilio: boolean;
  telefonoFijo: string | null;
  direccion: string | null;
  horario: string | null;
  facebookUrl: string | null;
};

export function valoresParaFormulario(
  fuente: FuenteDePrellenado,
): CamposFormularioRegistro {
  const coloniaOtra = fuente.coloniaOtra?.trim() ?? "";
  return {
    nombre: fuente.nombre,
    categoriaId: String(fuente.categoriaId),
    whatsapp: fuente.whatsapp,
    // Colonia del catálogo si la tiene; si no, "Otra" con su texto libre. Una
    // ficha sin ninguna de las dos (imposible por validación, pero no por
    // tipos) vuelve con el selector en blanco, no con una colonia inventada.
    coloniaId:
      fuente.coloniaId !== null
        ? String(fuente.coloniaId)
        : coloniaOtra !== ""
          ? COLONIA_OTRA_VALOR
          : "",
    coloniaOtra,
    queOfreces: fuente.queOfreces ?? "",
    entregaADomicilio: fuente.entregaADomicilio,
    telefonoFijo: fuente.telefonoFijo ?? "",
    direccion: fuente.direccion ?? "",
    horario: fuente.horario ?? "",
    facebookUrl: fuente.facebookUrl ?? "",
  };
}
