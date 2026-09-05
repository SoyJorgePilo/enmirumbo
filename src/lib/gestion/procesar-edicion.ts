/**
 * Procesamiento de un envío del modo edición, `/editar/<token>` (change
 * `agregar-enlace-de-gestion`, spec `registro-negocio`; ticket T-014, tasks.md
 * #12, #13 y #15).
 *
 * Hermano de `src/lib/registro/procesar.ts` y con el mismo reparto: la Server
 * Action solo saca la IP de los encabezados, llama aquí y redirige. Reutiliza
 * `validarRegistro` TAL CUAL (design.md §5): mismas reglas, mismos mensajes
 * literales, sin una segunda verdad.
 *
 * Orden de las defensas, el mismo del registro (PRD §8):
 *   1. campo trampa → se finge éxito sin guardar;
 *   2. cupo propio de la IP (3 ediciones por hora, contador aparte);
 *   3. resolución del token → si no resuelve, 404 indistinguible;
 *   4. validación y normalización de todo campo;
 *   5. el WhatsApp propuesto no puede tener OTRA ficha;
 *   6. se guarda la edición, reemplazando la anterior.
 *
 * BLINDAJE (requirement "…no puede fijar lo que no le toca"): lo que se
 * escribe sale de `validarRegistro`, que construye `DatosNegocioValidados`
 * campo por campo. Un envío con `estado`, `origen`, giros, `publicadoEn`,
 * `registradoEn`, `consintioAvisoEn`, `fotoClave` o un token no llega a
 * ninguna escritura: esos nombres ni se leen del `FormData`.
 *
 * EL TOKEN NO SE ESCRIBE NUNCA EN EL LOG, ni completo ni recortado, ni en el
 * camino feliz ni al fallar. Este módulo solo registra el tipo de evento.
 */
import { VERSION_AVISO } from "@/lib/legales/version";
import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";
import type { ErroresFormularioRegistro, EstadoAccionRegistro } from "@/lib/registro/tipos";
import {
  estadoConErrores,
  leerEnvioRegistro,
  validarRegistro,
} from "@/lib/registro/validacion";

import { guardarEdicion, type ClienteEdiciones } from "./ediciones";
import { ipSinCupoDeEdiciones, registrarEnvioDeEdicion } from "./limite-ip";
import { ERROR_CUPO_EDICION, ERROR_GUARDAR_EDICION, ERROR_WHATSAPP_DUPLICADO_EDICION } from "./textos";
import { negocioDelToken, type ClienteEnlace } from "./token";

/** Lo poco que este módulo necesita de Prisma (facilita probarlo). */
export type ClienteEdicionPublica = ClienteEnlace &
  ClienteEdiciones & {
    categoria: { findMany(args?: unknown): Promise<Array<{ id: number }>> };
    colonia: { findMany(args?: unknown): Promise<Array<{ id: number }>> };
  };

export type ContextoEdicion = {
  prisma: ClienteEdicionPublica;
  /** IP del cliente según el encabezado declarado; `null` si no hay. */
  ip: string | null;
  /** Momento del envío; se inyecta en pruebas. */
  ahora?: Date;
};

export type ResultadoEdicion =
  /** Guardada (o fingida, si el campo trampa venía lleno): a la confirmación. */
  | { exito: true }
  /** El token no resuelve: la acción responde el 404 del sitio. */
  | { exito: false; noEncontrado: true }
  | { exito: false; noEncontrado?: false; estado: EstadoAccionRegistro };

/** Identificación del fallo apta para el log: nunca datos ni token. */
function resumenDeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return `código ${String((error as { code?: unknown }).code)}`;
  }
  return error instanceof Error ? error.name : "desconocido";
}

export async function procesarEdicion(
  token: string,
  formData: FormData,
  contexto: ContextoEdicion,
): Promise<ResultadoEdicion> {
  const ahora = contexto.ahora ?? new Date();
  const { campos, trampa } = leerEnvioRegistro(formData);

  const rechazo = (errores: ErroresFormularioRegistro): ResultadoEdicion => ({
    exito: false,
    estado: estadoConErrores(errores, campos),
  });

  // 1. Campo trampa: la misma confirmación que un envío legítimo, sin guardar
  //    nada y sin nombrar el token en el aviso.
  if (trampa !== "") {
    console.warn("[gestion] envío de edición descartado: campo trampa lleno");
    return { exito: true };
  }

  // 2. Cupo propio de la IP.
  if (ipSinCupoDeEdiciones(contexto.ip, ahora)) {
    console.warn("[gestion] envío de edición rechazado: cupo por IP agotado");
    return rechazo({ general: ERROR_CUPO_EDICION });
  }

  // 3. El token: si no resuelve a un negocio publicado, 404 indistinguible.
  //    Un envío nunca dice a qué negocio pertenece: lo dice el token, así que
  //    "un token solo edita su propia ficha" se cumple por construcción.
  let negocio: { id: string } | null;
  try {
    negocio = await negocioDelToken(contexto.prisma, token, ESTADO_NEGOCIO_PUBLICADO);
  } catch (error) {
    console.error(`[gestion] no se pudo resolver el enlace: ${resumenDeError(error)}`);
    return rechazo({ general: ERROR_GUARDAR_EDICION });
  }
  if (!negocio) return { exito: false, noEncontrado: true };

  // 4. Validación y normalización, con las reglas y los literales del
  //    registro. `consentimiento: true` y la versión vigente porque la edición
  //    NO vuelve a pedir el checkbox: el consentimiento ya está dado y
  //    `consintioAvisoEn` no se toca (design.md §5).
  let categorias: Array<{ id: number }>;
  let colonias: Array<{ id: number }>;
  try {
    [categorias, colonias] = await Promise.all([
      contexto.prisma.categoria.findMany(),
      contexto.prisma.colonia.findMany(),
    ]);
  } catch (error) {
    console.error(`[gestion] no se pudieron leer los catálogos: ${resumenDeError(error)}`);
    return rechazo({ general: ERROR_GUARDAR_EDICION });
  }

  const validacion = validarRegistro({
    campos,
    consentimiento: true,
    versionAvisoDeclarada: VERSION_AVISO,
    categorias,
    colonias,
  });
  if (!validacion.ok) return rechazo(validacion.errores);
  const datos = validacion.datos;

  // Solo los envíos que llegan a intentar un guardado gastan cupo: una errata
  // se puede corregir sin quedarse sin intentos.
  registrarEnvioDeEdicion(contexto.ip, ahora);

  // 5. El número propuesto no puede tener OTRA ficha (PRD §6.1). Se vuelve a
  //    comprobar al aplicar, que es la que manda.
  let ocupado: unknown;
  try {
    ocupado = await contexto.prisma.negocio.findFirst({
      where: { whatsapp: datos.whatsapp, id: { not: negocio.id } },
      select: { id: true },
    });
  } catch (error) {
    console.error(`[gestion] falló la consulta de duplicado: ${resumenDeError(error)}`);
    return rechazo({ general: ERROR_GUARDAR_EDICION });
  }
  if (ocupado) return rechazo({ whatsapp: ERROR_WHATSAPP_DUPLICADO_EDICION });

  // 6. Se guarda, reemplazando la pendiente anterior si la había.
  const guardado = await guardarEdicion(contexto.prisma, negocio.id, datos, ahora);
  if (guardado.resultado !== "guardada") {
    return rechazo({ general: ERROR_GUARDAR_EDICION });
  }

  return { exito: true };
}
