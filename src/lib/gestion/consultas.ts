/**
 * Lo que la página de edición necesita leer para pintarse (change
 * `agregar-enlace-de-gestion`, spec `registro-negocio`; ticket T-014, tasks.md
 * #10 y #14).
 *
 * Una sola función: resolver el token y devolver o `null` —que la página
 * traduce en el 404 del sitio— o lo justo para prellenar el formulario. Nada
 * de datos internos de la ficha (estado, origen, fechas, consentimiento,
 * huella) sale de aquí: solo los campos capturables.
 *
 * El token no se escribe en el log en ninguna rama.
 */
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import type { CamposFormularioRegistro } from "@/lib/registro/tipos";

import { obtenerEdicionPendiente, type ClienteEdiciones } from "./ediciones";
import { valoresParaFormulario } from "./prellenado";
import { negocioDelToken, type ClienteEnlace } from "./token";

export type ClienteFormularioEdicion = ClienteEnlace &
  ClienteEdiciones & {
    negocio: { findUnique(args: unknown): Promise<unknown> };
  };

export type FormularioEdicion = {
  negocioId: string;
  /** Para el título de la pestaña; nunca sale a un buscador (noindex). */
  negocioNombre: string;
  /** Lo publicado, o lo último que el dueño mandó si hay pendiente. */
  valores: CamposFormularioRegistro;
  /** Pinta el aviso "Ojo: ya tienes cambios esperando revisión…". */
  tieneEdicionPendiente: boolean;
};

type FilaNegocio = {
  id: string;
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

/**
 * El formulario de edición que abre este token, o `null` para todo lo que la
 * spec exige indistinguible (token inventado, alterado, invalidado, de una
 * ficha que ya no está publicada o de una borrada).
 */
export async function obtenerFormularioDeEdicion(
  prisma: ClienteFormularioEdicion,
  token: string,
): Promise<FormularioEdicion | null> {
  const negocio = await negocioDelToken(prisma, token, ESTADO_NEGOCIO_PUBLICADO);
  if (!negocio) return null;

  const fila = (await prisma.negocio.findUnique({
    where: { id: negocio.id },
    select: {
      id: true,
      nombre: true,
      categoriaId: true,
      whatsapp: true,
      coloniaId: true,
      coloniaOtra: true,
      queOfreces: true,
      entregaADomicilio: true,
      telefonoFijo: true,
      direccion: true,
      horario: true,
      facebookUrl: true,
    },
  })) as FilaNegocio | null;
  if (!fila) return null;

  // Si ya mandó cambios, el formulario se prellena con LO QUE ÉL MANDÓ, no con
  // lo publicado: si no, tendría que volver a capturar todo (design.md §2).
  const pendiente = await obtenerEdicionPendiente(prisma, fila.id);

  return {
    negocioId: fila.id,
    negocioNombre: fila.nombre,
    valores: valoresParaFormulario(pendiente ?? fila),
    tieneEdicionPendiente: pendiente !== null,
  };
}
