/**
 * Contrato compartido entre el formulario de registro (cliente) y la Server
 * Action (servidor): mismo shape en los dos lados. Solo tipos y constantes,
 * sin acceso a datos, para que pueda viajar al bundle de cliente.
 */

/** Fila de catálogo tal como la devuelve Prisma (`categoria` / `colonia`). */
export type ElementoCatalogo = {
  id: number;
  nombre: string;
  slug: string;
};

/**
 * Lo que el dueño capturó, tal cual, en texto (FormData siempre trae
 * strings). Se devuelve al formulario cuando el envío se rechaza para no
 * perder nada de lo escrito.
 */
export type CamposFormularioRegistro = {
  nombre: string;
  categoriaId: string;
  whatsapp: string;
  /** id de catálogo en texto, o `COLONIA_OTRA_VALOR` */
  coloniaId: string;
  coloniaOtra: string;
  queOfreces: string;
  entregaADomicilio: boolean;
  telefonoFijo: string;
  direccion: string;
  horario: string;
  facebookUrl: string;
};

/**
 * Un mensaje por campo. `consentimiento` no es un campo capturado (el
 * checkbox siempre se vuelve a marcar) y `general` es el error de servidor
 * que se pinta arriba del formulario. `foto` tampoco es un campo de
 * `CamposFormularioRegistro` (un `<input type="file">` no se puede repoblar
 * con `defaultValue`, y por eso nunca viaja en el eco del formulario, spec
 * `registro-negocio`), pero sí necesita su propio mensaje junto al campo: los
 * cuatro literales de la spec ("Esa foto pesa más de 5 MB...", "No pudimos
 * leer esa foto...", "No pudimos preparar tu foto..." y "Tu foto no se quedó
 * guardada: vuelve a elegirla antes de enviar.") se muestran todos en este
 * mismo slot, según cuál aplique.
 */
export type ErroresFormularioRegistro = Partial<
  Record<
    keyof CamposFormularioRegistro | "consentimiento" | "general" | "foto",
    string
  >
>;

/** Lo que `useActionState` recibe de vuelta en el camino de error. */
export type EstadoAccionRegistro = {
  errores: ErroresFormularioRegistro;
  valores: CamposFormularioRegistro;
};

export const VALORES_VACIOS_REGISTRO: CamposFormularioRegistro = {
  nombre: "",
  categoriaId: "",
  whatsapp: "",
  coloniaId: "",
  coloniaOtra: "",
  queOfreces: "",
  entregaADomicilio: false,
  telefonoFijo: "",
  direccion: "",
  horario: "",
  facebookUrl: "",
};

export const ESTADO_INICIAL_REGISTRO: EstadoAccionRegistro = {
  errores: {},
  valores: VALORES_VACIOS_REGISTRO,
};

/**
 * Datos ya validados y normalizados, listos para el modelo. El WhatsApp
 * viene siempre en su forma de 10 dígitos (`normalizarWhatsapp`) y los
 * opcionales vacíos como `null`, no como cadena vacía.
 *
 * Ojo: aquí NO hay `estado`, `origen`, `publicadoEn`, `tokenGestion` ni
 * `consintioAvisoEn`. Esos los fija el servidor y por construcción no pueden
 * llegar del cliente.
 */
export type DatosNegocioValidados = {
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
