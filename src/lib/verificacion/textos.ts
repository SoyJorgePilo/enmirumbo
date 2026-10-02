/**
 * Textos literales de la verificación por SMS (spec `registro-negocio` y
 * `revision-admin`, ADR-011, T-016, tasks.md #6: "todos los literales de la
 * spec... y los dos textos del panel"). Igual que `src/lib/registro/textos.ts`
 * y `src/lib/admin/textos.ts`: contenido aprobado, no copy libre — se compara
 * carácter por carácter contra los deltas de spec. Todo en español mexicano
 * coloquial (CLAUDE.md).
 *
 * Módulo puro: sin acceso a datos, sin cookies, sin variables de entorno.
 * Tanto la pantalla pública "Confirma tu número" como el detalle y la cola
 * del panel importan de aquí — es la fuente única, para que ningún literal se
 * desvíe entre las dos superficies.
 */

// ── Pantalla "Confirma tu número" (requirement del mismo nombre) ───────────

export const TEXTO_ENCABEZADO_VERIFICAR = "Confirma tu número";

/**
 * `ultimosCuatroDigitos` son los últimos 4 dígitos del WhatsApp capturado —
 * nunca el número completo (requirement "El número completo NO DEBE
 * aparecer en la pantalla").
 */
export function textoExplicacionVerificar(ultimosCuatroDigitos: string): string {
  return `Te mandamos un código por SMS al número que termina en ${ultimosCuatroDigitos}. Escríbelo aquí y confirmamos que ese WhatsApp es tuyo.`;
}

export const TEXTO_TRANQUILIDAD_VERIFICAR =
  "Tu negocio ya quedó registrado y está en revisión. Esto solo nos ahorra un paso.";

export const ETIQUETA_CODIGO_VERIFICAR = "Código de 6 dígitos";

export const BOTON_CONFIRMAR_NUMERO = "Confirmar mi número";
export const BOTON_REENVIAR_CODIGO = "Reenviar el código";
export const BOTON_SALIR_VERIFICAR = "Mejor luego, mi registro ya quedó";

/**
 * Se acaban los 5 intentos de código O los 2 reenvíos: mismo mensaje para
 * los dos casos (requirement "Al agotarse cualquiera de los dos..."). Se
 * pinta en `/registro/gracias`, no en la pantalla del código — cuando se
 * llega aquí ya no hay pantalla del código a la que volver.
 */
export const MENSAJE_INTENTOS_AGOTADOS_VERIFICAR =
  "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.";

/** Botón de reenviar antes de que pasen los 60 segundos de cooldown. */
export const TEXTO_ESPERA_REENVIO = "Espera un momento para pedir otro código.";

/**
 * Los cuatro errores junto al campo del código, en el orden en que la spec
 * los enumera. `noCoincide` y `vencido` SÍ cuentan como un intento contra el
 * proveedor; `proveedorFallo` (el proveedor está caído o no contesta) NO —
 * decisión anotada en `reports/a-ui.md` para que el dev la confirme al
 * escribir la Server Action real (tasks.md #11).
 */
export const ERRORES_CODIGO_VERIFICAR = {
  incompleto: "Escribe los 6 dígitos que te llegaron por SMS.",
  noCoincide: "Ese código no es. Revísalo y vuelve a escribirlo.",
  vencido: "Ese código ya venció. Pide uno nuevo.",
  proveedorFallo:
    "No pudimos confirmar tu número en este momento. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.",
} as const;

/** Reenvío bloqueado por el cupo por IP (requirement del canal de SMS). */
export const TEXTO_CUPO_IP_CODIGOS =
  "Ya pedimos varios códigos desde aquí. Espera un rato y vuelve a intentar.";

// ── Pantalla de gracias (requirement "El envío exitoso encola...") ─────────

/**
 * Línea que se agrega ARRIBA del mensaje de siempre (`MENSAJE_GRACIAS` de
 * `src/lib/registro/textos.ts`), sin tocarle ni una palabra, cuando el
 * número quedó verificado.
 */
export const LINEA_CONFIRMACION_NUMERO_GRACIAS = "¡Listo! Ya confirmamos tu número.";

// ── Panel: cola y detalle (requirements MODIFIED de `revision-admin`) ──────

/** Etiqueta del renglón de la cola, solo si la ficha trae su fecha de verificación. */
export const ETIQUETA_COLA_NUMERO_VERIFICADO_SMS = "Número verificado por SMS";

/**
 * Detalle: la ficha no trae fecha de verificación y la capacidad está
 * encendida. Con la capacidad apagada esta línea no aparece (ver
 * `capacidadVerificacionSmsEncendida` en `DetalleRegistro`).
 */
export const TEXTO_SIN_VERIFICAR_SMS = "Sin verificar — confirma por WhatsApp como siempre";

/**
 * Detalle: la ficha trae su fecha de verificación (aparece siempre, esté la
 * capacidad encendida o apagada — "un hecho comprobado no se borra porque
 * después se apague un interruptor"). `fechaFormateada` debe venir ya
 * formateada con el mismo formato que la constancia del consentimiento
 * (`FORMATO_FECHA` de `detalle-registro.tsx`), no se formatea aquí.
 */
export function textoNumeroVerificadoSms(fechaFormateada: string): string {
  return `Número verificado por SMS el ${fechaFormateada}`;
}
