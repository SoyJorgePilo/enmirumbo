/**
 * Qué puede editar un negocio desde su enlace de gestión, en UNA sola lista
 * (change `agregar-enlace-de-gestion`, design.md §1; ticket T-014, tasks.md
 * #3).
 *
 * Esta constante es el contrato entre tres cosas que tienen que decir lo
 * mismo: los campos del formulario de registro, las columnas de
 * `EdicionPendiente` y la lista blanca con la que "Aplicar los cambios" copia
 * a la ficha publicada. Duplicar columnas es el precio asumido de guardar el
 * snapshot en una tabla propia (design.md §1); el pago es que agregar un campo
 * obliga a nombrarlo aquí, y `tests/gestion-modelo.test.ts` falla si la lista
 * y la tabla se desincronizan.
 *
 * Lo que NO está aquí no se puede editar ni aunque llegue en el envío:
 * `estado`, `origen`, los giros, `publicadoEn`, `registradoEn`,
 * `consintioAvisoEn` (con su versión y su reaceptación), `fotoClave` y la
 * huella del enlace. `CAMPOS_PROHIBIDOS_EN_EDICION` los nombra para que el
 * guardián pueda comprobarlo, no para usarlos.
 *
 * Módulo puro: solo tipos y constantes.
 */
import type { DatosNegocioValidados } from "@/lib/registro/tipos";

/**
 * Los campos capturables del formulario de registro, uno por uno. Es
 * exactamente `keyof DatosNegocioValidados` —lo que `validarRegistro`
 * construye a mano— y el `satisfies` lo hace cumplir al compilar: si el
 * registro estrena un campo, esta lista deja de compilar hasta que lo nombre.
 */
export const CAMPOS_EDITABLES = [
  "nombre",
  "categoriaId",
  "whatsapp",
  "coloniaId",
  "coloniaOtra",
  "queOfreces",
  "entregaADomicilio",
  "telefonoFijo",
  "direccion",
  "horario",
  "facebookUrl",
] as const satisfies ReadonlyArray<keyof DatosNegocioValidados>;

export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

/**
 * Lo demás que guarda una edición: su identidad, a qué negocio pertenece y su
 * propio ciclo de vida. `estado` aquí es el de la EDICIÓN (`pendiente |
 * aplicada | descartada`, `src/lib/gestion/estados.ts`), que no tiene nada que
 * ver con el estado del negocio —ese sigue siendo intocable—.
 */
export const COLUMNAS_CICLO_EDICION = [
  "id",
  "negocioId",
  "estado",
  "creadaEn",
  "resueltaEn",
  "motivoDescarte",
] as const;

/**
 * Columnas de `Negocio` que una edición NO puede tocar nunca, ni al guardarse
 * ni al aplicarse. Están aquí solo para que el guardián las pueda nombrar: el
 * código que aplica una edición no las menciona, copia por lista blanca.
 */
export const CAMPOS_PROHIBIDOS_EN_EDICION = [
  "estado",
  "origen",
  "giros",
  "publicadoEn",
  "registradoEn",
  "consintioAvisoEn",
  "consintioAvisoVersion",
  "reconsintioAvisoEn",
  "reconsintioAvisoVersion",
  "rechazadoEn",
  "motivoRechazo",
  "despublicadoEn",
  "motivoDespublicacion",
  "fotoClave",
  "tokenGestionHash",
  "tokenGestionCreadoEn",
] as const;

/**
 * Copia por lista blanca: de un objeto cualquiera —una fila de
 * `EdicionPendiente`, que podría traer columnas de más— saca SOLO los campos
 * editables. Nombrar cada campo dos veces (al guardar y al aplicar) es la
 * fricción que aquí protege: lo que no esté en `CAMPOS_EDITABLES` no se copia
 * aunque alguien logre escribirlo en la fila (design.md §1).
 */
export function soloCamposEditables(
  origen: Readonly<Record<string, unknown>>,
): Record<CampoEditable, unknown> {
  const copia = {} as Record<CampoEditable, unknown>;
  for (const campo of CAMPOS_EDITABLES) copia[campo] = origen[campo];
  return copia;
}
