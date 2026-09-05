/**
 * Textos literales del panel de revisión (spec `revision-admin`) y las tres
 * plantillas de mensaje de WhatsApp aprobadas en la propuesta (duda 1). Son
 * contenido aprobado, no copy libre — se comparan carácter por carácter
 * contra la spec (tasks.md #7 y #26). Todo en español mexicano coloquial
 * (CLAUDE.md). Módulo puro: sin acceso a datos, sin lectura de sesión ni de
 * variables de entorno.
 */
import {
  ESTADO_NEGOCIO_PUBLICADO,
  ESTADO_NEGOCIO_RECHAZADO,
  type EstadoNegocio,
} from "@/lib/negocio";

// ── Acceso (requirement "Acceso al panel...") ───────────────────────────────
export const TEXTO_ENCABEZADO_ACCESO = "Panel de revisión";
export const ETIQUETA_CONTRASENA = "Contraseña";
export const BOTON_ENTRAR = "Entrar";
export const ERROR_CONTRASENA_INCORRECTA = "Contraseña incorrecta.";
export const ERROR_DEMASIADOS_INTENTOS =
  "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
export const MENSAJE_SESION_CERRADA = "Cerraste sesión.";
export const BOTON_SALIR = "Salir";

// ── Fail-safe (requirement "Sin contraseña configurada el panel no abre") ──
export const MENSAJE_PANEL_NO_DISPONIBLE = "El panel no está disponible por ahora.";

// ── Cola (requirement "Cola de revisión...") ────────────────────────────────
export const TEXTO_COLA_ENCABEZADO = "Registros por revisar";
export const TEXTO_COLA_VACIA = "No hay registros esperando. Todo al día.";
export const TEXTO_REVISAR = "Revisar";

// ── Indicador de 48 horas ────────────────────────────────────────────────────
export const TEXTO_INDICADOR_ATRASADO = "Lleva más de 48 horas";

/**
 * Conteo de atrasados en la cabecera de la cola. No hay literal en la spec
 * para esta frase (solo dice "la cola DEBE decir cuántos están en esa
 * condición") — copy propuesto, ver reports/a-ui.md.
 */
export function textoConteoAtrasados(cantidad: number): string {
  const plural = cantidad === 1 ? "registro lleva" : "registros llevan";
  return `${cantidad} ${plural} más de 48 horas esperando.`;
}

// ── Verificación por WhatsApp ────────────────────────────────────────────────
export const BOTON_WHATSAPP_VERIFICACION = "Escribirle por WhatsApp";

export function mensajeVerificacion(nombreNegocio: string): string {
  return `Hola, te escribo de NecesitoUno Tizayuca, el directorio de negocios del municipio. Recibimos el registro de «${nombreNegocio}». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?`;
}

// ── Aprobar ──────────────────────────────────────────────────────────────────
export const ETIQUETA_GIROS = "Giros (de 1 a 3, o ninguno si no embona)";
export const ETIQUETA_COLONIA_APROBAR = "¿En qué colonia está?";
export const ETIQUETA_ORIGEN = "¿De dónde salió?";
export const OPCION_ORIGEN_ORGANICO = "Se registró solo";
export const OPCION_ORIGEN_SIEMBRA = "Lo sembramos nosotros";
export const BOTON_APROBAR = "Aprobar y publicar";
export const ERROR_MAX_GIROS = "Elige máximo 3 giros";
export const ERROR_COLONIA_PENDIENTE = "Elige la colonia de este negocio";

export const MENSAJE_APROBADO = "Ya quedó publicado.";
export const BOTON_AVISAR_WHATSAPP = "Avisarle por WhatsApp";

export function mensajeAvisoPublicacion(
  nombreNegocio: string,
  linkFicha: string,
): string {
  return `¡Listo! Ya quedó publicado «${nombreNegocio}» en NecesitoUno Tizayuca. Esta es tu ficha: ${linkFicha} — compártela con tus clientes.`;
}

// ── Rechazar ─────────────────────────────────────────────────────────────────
export const ETIQUETA_MOTIVO_RECHAZO = "¿Por qué lo rechazas?";
export const BOTON_RECHAZAR = "Rechazar";
export const ERROR_MOTIVO_VACIO = "Escribe por qué lo rechazas";
export const MENSAJE_RECHAZADO = "Registro rechazado.";

export function mensajeAvisoRechazo(nombreNegocio: string, motivo: string): string {
  return `Hola, revisamos el registro de «${nombreNegocio}» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: ${motivo}. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número.`;
}

// ── Transición sobre un registro ya resuelto ────────────────────────────────
export const MENSAJE_YA_RESUELTO = "Este registro ya lo habías resuelto.";

// ── Despublicar (spec agregar-despublicar-y-borrado-arco, revision-admin) ──
export const BOTON_DESPUBLICAR = "Despublicar";
export const ETIQUETA_MOTIVO_DESPUBLICAR = "¿Por qué la despublicas?";
/** Texto de ayuda del campo (duda 2 de la propuesta): evita que una nota
 * interna viaje por accidente al negocio dentro del aviso de WhatsApp. */
export const AYUDA_MOTIVO_DESPUBLICAR =
  "Este motivo se le enviará al negocio por WhatsApp.";
export const ERROR_MOTIVO_DESPUBLICAR_VACIO = "Escribe por qué la despublicas";
/**
 * Sin literal en la spec: copy propuesto (enmienda del hallazgo BAJO 3 de la
 * etapa C). El motivo no se recorta en silencio porque viaja dentro del
 * WhatsApp que se le manda al negocio, y una frase cortada a media palabra es
 * un mensaje roto a un tercero. El número sale de la constante para que texto y
 * cota no se puedan desincronizar.
 */
export function errorMotivoDespublicarLargo(limite: number): string {
  return `El motivo no puede pasar de ${limite} caracteres. Recórtalo un poco: así, completo, es como le va a llegar al negocio.`;
}
export const MENSAJE_DESPUBLICADO = "Ya la despublicaste.";
export const MENSAJE_YA_NO_PUBLICADA = "Esta ficha ya no estaba publicada.";
export const ETIQUETA_CUANDO_DESPUBLICO = "Cuándo la despublicaste";
export const ETIQUETA_POR_QUE_DESPUBLICO = "Por qué la despublicaste";

export function mensajeAvisoDespublicacion(
  nombreNegocio: string,
  motivo: string,
): string {
  return `Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «${nombreNegocio}»: ${motivo}. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí.`;
}

// ── Cola: ficha que llegó por una despublicación ────────────────────────────
export const ETIQUETA_COLA_DESPUBLICADA = "Ya estaba publicada, la despublicaste";

// ── Borrado definitivo (operación ARCO) ─────────────────────────────────────
export const BOTON_BORRAR_DEFINITIVAMENTE = "Borrar definitivamente";
export const ENCABEZADO_CONFIRMAR_BORRADO = "¿Seguro que quieres borrar esta ficha?";

export function textoAdvertenciaBorrado(nombreNegocio: string): string {
  return `Esto borra para siempre el registro de «${nombreNegocio}», sus giros y sus reportes. No hay papelera y no se puede deshacer.`;
}

export const RECORDATORIO_TRAMITE_ARCO =
  "Antes de borrar: confirma por WhatsApp, desde el número con el que se registró, que quien lo pide es el dueño del negocio. Tienes 20 días hábiles para contestarle.";
export const ETIQUETA_CONFIRMAR_BORRAR = "Escribe BORRAR para confirmar";
export const BOTON_CONFIRMAR_BORRADO = "Sí, borrar para siempre";
export const TEXTO_MEJOR_NO_REGRESAR = "Mejor no, regresar";
export const ERROR_PALABRA_BORRAR = "Para borrar, escribe BORRAR en el campo.";
export const MENSAJE_BORRADO_HECHO = "Ya se borró para siempre.";
export const MENSAJE_YA_NO_EXISTE = "Esta ficha ya no existe.";
/**
 * La ficha tiene foto y el almacén no se dejó alcanzar, así que NO se borró
 * nada (iteración 4 del change `preparar-deploy-produccion`, hallazgo R4;
 * decisión del fundador: el borrado se niega a mentir).
 *
 * Dice las tres cosas que el admin necesita, en ese orden: qué NO pasó, por
 * qué, y qué hacer. No dice "error" ni nombra variables de entorno: quien lee
 * esta pantalla está atendiendo una solicitud ARCO por WhatsApp, no depurando
 * un despliegue.
 */
export const MENSAJE_BORRADO_SIN_ALMACEN =
  "La ficha no se borró: no pude alcanzar el almacén de fotos. Revisa la configuración y vuelve a intentar.";
/** Palabra exacta que el admin debe teclear (se compara sin mayúsculas ni
 * espacios de sobra — design.md §4). Vive aquí para que el formulario y la
 * futura Server Action del dev usen la misma constante. */
export const PALABRA_CONFIRMACION_BORRADO = "BORRAR";

// ── Navegación y avisos operativos del panel ────────────────────────────────
// Sin literal en la spec: copy propuesto (ver reports/a-ui.md y b-dev.md).
export const TEXTO_VOLVER_A_LA_COLA = "Volver a la cola";

/**
 * Falta la URL pública del sitio en producción, así que no se puede armar el
 * link absoluto de la ficha. El panel lo dice a la vista en vez de mandarle a
 * un negocio real un enlace a `localhost` (design.md §7).
 */
export const MENSAJE_SIN_URL_DEL_SITIO =
  "No se pudo armar el link de la ficha porque falta configurar la dirección pública del sitio. El negocio ya quedó publicado; avísale cuando esté configurada.";

// ── Reportes (change `agregar-boton-reportar`, spec `revision-admin`) ──────

export const TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO = "Negocios reportados";

/**
 * Conteo de negocios con reportes pendientes, encabezado de la sección de la
 * cola (requirement "La cola avisa qué negocios tienen reportes sin atender").
 */
export function textoConteoNegociosReportados(cantidad: number): string {
  const plural = cantidad === 1 ? "negocio tiene" : "negocios tienen";
  return `${cantidad} ${plural} reportes sin atender.`;
}

/** Renglón de la cola y encabezado de cada reporte del detalle: "1 reporte sin atender" / "<n> reportes sin atender". */
export function textoReportesSinAtender(cantidad: number): string {
  const plural = cantidad === 1 ? "reporte" : "reportes";
  return `${cantidad} ${plural} sin atender`;
}

export const TEXTO_VER_REPORTES = "Ver reportes";
export const TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO = "Reportes sin atender";
export const BOTON_MARCAR_ATENDIDO = "Marcar como atendido";
export const MENSAJE_REPORTE_ATENDIDO = "Reporte atendido.";
export const MENSAJE_REPORTE_YA_ATENDIDO = "Este reporte ya lo habías atendido.";

// ── Listado "Todos los negocios" (change agregar-listado-gestion-panel) ────

export const TEXTO_NEGOCIOS_ENCABEZADO = "Todos los negocios";
export const TEXTO_VER_TODOS_LOS_NEGOCIOS = "Ver todos los negocios";
export const TEXTO_VER_DETALLE = "Ver detalle";

export const TEXTO_FILTRAR_POR_ESTADO = "Filtrar por estado";
export const TEXTO_FILTRO_TODOS = "Todos";
export const TEXTO_FILTRO_EN_REVISION = "En revisión";
export const TEXTO_FILTRO_PUBLICADOS = "Publicados";
export const TEXTO_FILTRO_RECHAZADOS = "Rechazados";

/** Estado escrito con palabras, tal cual lo pinta cada renglón del listado. */
export function textoEstadoNegocio(estado: EstadoNegocio): string {
  if (estado === ESTADO_NEGOCIO_PUBLICADO) return "Publicado";
  if (estado === ESTADO_NEGOCIO_RECHAZADO) return "Rechazado";
  return "En revisión";
}

/**
 * "Se registró el 3 de septiembre de 2026" (delta `revision-admin`, ejemplo
 * literal del requirement de la vista). El formato de fecha completa —día,
 * mes en palabras, año— no tiene helper propio todavía en el panel
 * (`detalle-registro.tsx` usa un formato corto con hora, pensado para el
 * dato interno, no para el renglón de una lista); este es nuevo a propósito.
 */
export function textoFechaDeRegistro(registradoEn: Date): string {
  const fecha = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(registradoEn);
  return `Se registró el ${fecha}`;
}

export const TEXTO_LISTADO_VACIO = "Todavía no hay negocios registrados.";
export const TEXTO_FILTRO_SIN_RESULTADOS = "No hay negocios con ese estado.";

/** "1 negocio en esta lista" / "<n> negocios en esta lista". */
export function textoConteoNegociosListado(cantidad: number): string {
  const plural = cantidad === 1 ? "negocio" : "negocios";
  return `${cantidad} ${plural} en esta lista`;
}

export const TEXTO_VER_MAS_ANTIGUOS = "Ver más antiguos";
export const TEXTO_VER_MAS_NUEVOS = "Ver más nuevos";

/** "Página 2 de 5". */
export function textoPaginaDe(paginaActual: number, totalPaginas: number): string {
  return `Página ${paginaActual} de ${totalPaginas}`;
}
