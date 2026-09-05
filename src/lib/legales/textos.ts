/**
 * Contenido literal de las páginas legales (spec `paginas-legales`,
 * requirements "Texto completo del aviso de privacidad integral" y "Texto
 * completo de los términos y condiciones"). Es contenido aprobado, no copy
 * libre: cambiarlo aquí cambia lo que dice la spec, así que se edita junto
 * con ella (mismo patrón que `src/lib/registro/textos.ts` y
 * `src/lib/admin/textos.ts`; design.md §2).
 *
 * Las páginas (`src/app/(publico)/aviso-de-privacidad/page.tsx`,
 * `src/app/(publico)/terminos/page.tsx`) solo pintan este contenido con
 * `DocumentoLegalView` (`src/components/legales/documento-legal.tsx`): este
 * módulo no importa React ni sabe de markup.
 *
 * Todo texto va en español mexicano coloquial, en segunda persona
 * (CLAUDE.md; requirement "nada de esto necesita conocimiento legal").
 */

/** Un párrafo, una lista de viñetas, o un enlace hacia la otra página legal. */
export type BloqueLegal =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; items: string[] }
  | { tipo: "enlace"; texto: string; href: "/aviso-de-privacidad" | "/terminos" };

export type SeccionLegal = {
  /** Texto del `h2` de la sección. */
  encabezado: string;
  bloques: BloqueLegal[];
};

export type DocumentoLegal = {
  /** Texto del único `h1` de la página. */
  h1: string;
  /** Va después de "Última actualización: ". Hoy es un placeholder (ver abajo). */
  ultimaActualizacion: string;
  /** Párrafo introductorio, antes de la primera sección. */
  introduccion: string;
  secciones: SeccionLegal[];
  /**
   * Enlace suelto al final del documento, fuera de cualquier sección
   * (el aviso de privacidad cierra así hacia los términos). Los términos no
   * lo usan: su enlace al aviso vive dentro de la sección "Tus datos
   * personales" como un bloque de tipo "enlace".
   */
  enlaceCierre?: { texto: string; href: "/aviso-de-privacidad" | "/terminos" };
};

// ── Placeholders (design.md §3, requirement "Placeholders visibles y marca
// de borrador mientras falten datos del responsable") ──────────────────────
//
// Cada dato que solo puede dar el humano vive UNA vez aquí, como el literal
// exacto entre corchetes que la spec aprobó, y se interpola en el texto de
// abajo. `PLACEHOLDERS_LEGALES` es la lista que un checklist de lanzamiento
// (o una verificación automática) puede recorrer para saber qué falta.
const NOMBRE_RESPONSABLE_PLACEHOLDER =
  "[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento]";
const DOMICILIO_RESPONSABLE_PLACEHOLDER =
  "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]";
const WHATSAPP_DIRECTORIO_PLACEHOLDER =
  "[WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]";
const FECHA_PUBLICACION_PLACEHOLDER = "[FECHA DE PUBLICACIÓN]";
const JURISDICCION_PLACEHOLDER =
  "[JURISDICCIÓN PARA CONTROVERSIAS — confirmar en la revisión legal]";

export const PLACEHOLDERS_LEGALES = [
  NOMBRE_RESPONSABLE_PLACEHOLDER,
  DOMICILIO_RESPONSABLE_PLACEHOLDER,
  WHATSAPP_DIRECTORIO_PLACEHOLDER,
  FECHA_PUBLICACION_PLACEHOLDER,
  JURISDICCION_PLACEHOLDER,
] as const;

/**
 * El correo del directorio YA NO ES UN PLACEHOLDER (T-019, requirement
 * "Placeholders visibles y marca de borrador mientras falten datos del
 * responsable"): con el dominio comprado, el canal de contacto y de ejercicio
 * de derechos ARCO existe y se publica literalmente en los tres lugares donde
 * el texto lo pide —las dos apariciones del aviso y "Si ves algo raro" de los
 * términos—.
 *
 * OJO: publicar un correo que nadie atiende sería peor que un placeholder
 * honesto. El buzón tiene que recibir ANTES de desplegar esto; el paso está en
 * la prueba de humo de `docs/despliegue.md` §9.
 *
 * Publicarlo cambia el contenido versionado del aviso, así que viaja en la
 * misma versión `2` que el rebrand. Los demás datos del responsable siguen
 * pendientes, y por eso la marca de borrador se queda.
 */
const CORREO_DEL_DIRECTORIO = "contacto@enmirumbo.com";

/**
 * El interruptor de lanzamiento (design.md §3): mientras haya al menos un
 * placeholder pendiente, las dos páginas muestran la marca de borrador.
 * Cuando el humano complete los datos y `PLACEHOLDERS_LEGALES` quede vacía,
 * esto se vuelve `false` solo y la marca desaparece.
 */
export const HAY_PLACEHOLDERS_PENDIENTES = PLACEHOLDERS_LEGALES.length > 0;

export const TEXTO_MARCA_BORRADOR =
  "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.";

/**
 * Lo otro que falta antes de retirar la marca de borrador (enmienda de la
 * auditoría de seguridad, hallazgo MEDIO-1): el aviso compromete una operación
 * que hoy se hace **a mano contra la base**, porque el panel solo aprueba y
 * rechaza y ninguna purga automática existe.
 *
 * Va aquí, junto a `PLACEHOLDERS_LEGALES` y en la misma forma recorrible, para
 * que la revisión legal (E6-3) y el checklist de lanzamiento lo vean sin
 * buscarlo a ojo. **No se publica en las páginas**: el texto legal dice a qué
 * se compromete el responsable, no en qué va el backlog; lo que las páginas no
 * hacen es prometer automatismos que no existen (por eso el aviso dice "lo
 * atendemos a mano, cuando tú lo pides").
 */
export const PENDIENTES_OPERATIVOS_LEGALES = [
  // ACOTADO por el change `agregar-despublicar-y-borrado-arco` (T-015). El
  // renglón original juntaba las cuatro letras de ARCO con la despublicación y
  // el borrado; el panel ya hace **cancelación y oposición** (despublicar y
  // borrar), así que esa parte salió. Lo que sigue haciéndose a mano contra la
  // base son el **acceso** y la **rectificación**, que el aviso también promete
  // ("escríbenos y los quitamos", "rectificarlos si están mal") y para los que
  // el panel no tiene ninguna pantalla (hallazgo MEDIO 2 de la etapa C).
  {
    compromiso:
      "Atender las solicitudes de acceso y rectificación: entregarle al negocio una copia de sus datos y corregirlos, o quitar un campo de su ficha, cuando lo pida.",
    hoy: "Se hace a mano contra la base: el panel no edita los datos de un negocio ni se los entrega. La cancelación sí quedó resuelta: despublicar y borrar ya son acciones del panel (T-015).",
    ticket: "E3-6 (acceso y rectificación en el panel; E8-2 lo resolvería del lado del negocio)",
  },
  // SALIÓ con el change `preparar-deploy-produccion` (T-013) el renglón de la
  // purga de rechazados a los 90 días: ya no es un pendiente operativo porque
  // el sistema la ejecuta solo (`src/lib/purga/rechazados.ts`, disparada por
  // una tarea programada diaria). Lo que ENTRA en su lugar es lo que ADR-004
  // exige antes del lanzamiento y sigue sin cumplirse.
  {
    compromiso:
      'El aviso dice que los datos los tratan "los proveedores que hacen funcionar el sitio (hospedaje y base de datos)", sin nombrarlos.',
    hoy: "ADR-004 exige nombrar al encargado del tratamiento —hoy sería Supabase, ADR-007 para el hospedaje— antes del lanzamiento, y eso solo puede escribirse cuando la cuenta exista. El texto legal aprobado no se toca hasta entonces.",
    ticket: "E6-3 (revisión legal profesional, con la cuenta ya creada)",
  },
  // ENTRA en la iteración 2 del change `preparar-deploy-produccion` (hallazgo
  // A4 de la etapa C). Es el caso raro y por eso hay que declararlo: aquí el
  // texto publicado NO promete de más, promete de menos que lo que el sistema
  // necesita para defenderse, y por eso el sistema se queda corto a propósito.
  {
    compromiso:
      'El aviso dice que la dirección IP de quien envía el formulario se usa "por menos de una hora, solo en su memoria" y que "no la guardamos en la base de datos".',
    hoy: "El sistema lo cumple: los cupos del formulario público y de los reportes cuentan en la memoria de cada proceso. El precio es que en un hosting serverless ese conteo es POR INSTANCIA, así que acota el abuso casual y no una campaña. Moverlos a un almacén compartido (como ya se hizo con los intentos de acceso al panel, que guardan un HMAC y no la IP) haría falsa esa frase del aviso, así que hace falta que la revisión legal apruebe primero la redacción nueva.",
    ticket: "E6-3 (redacción del aviso) y después E0-3 (mover los dos cupos)",
  },
  // ENTRA en la iteración 3 del change `preparar-deploy-produccion` (hallazgo
  // R3 de la etapa C). Es un tratamiento NUEVO que el aviso publicado no
  // menciona, y que no contradice nada de lo que dice —la frase de la IP habla
  // del formulario de registro, con otra finalidad y otro destinatario—, pero
  // que tampoco está declarado en ninguna parte. Se declara aquí, que es el
  // mecanismo del proyecto para eso, para que la revisión legal lo vea como
  // asunto propio y decida si el aviso necesita una línea.
  {
    compromiso:
      "El aviso no menciona que el sistema guarde nada de quien intenta entrar al panel /admin, que es una página pública: cualquiera puede abrirla y enviar el formulario.",
    hoy: "Al enviar ese formulario, el servidor guarda UNA FILA por intento con: un HMAC-SHA256 de la IP (nunca la IP, y sin el secreto del despliegue no se puede revertir), la hora, y nada más. Finalidad: frenar la fuerza bruta contra la única credencial del sitio, que es la medida de seguridad que el art. 19 LFPDPPP exige al responsable. Duración: la ventana del límite (10 minutos); lo que sale de ella se borra al volver a contar esa clave y, si nadie vuelve, lo recoge la tarea programada diaria — nada sobrevive más de una hora. Alcanza a cualquiera que envíe ese formulario, no solo al admin.",
    ticket: "E6-3 (la revisión legal decide si el aviso necesita una línea)",
  },
] as const;

// ── Metadata de cada página (requirement "Las dos páginas legales son
// indexables y tienen metadata propia"). Copy propuesto, ver reports/a-ui.md. ──
export const TITULO_AVISO_PRIVACIDAD = "Aviso de privacidad — EnMiRumbo";
export const DESCRIPCION_AVISO_PRIVACIDAD =
  "Qué datos pide EnMiRumbo al registrar un negocio, para qué los usa, qué queda público en el directorio y cómo ejercer tus derechos ARCO.";

export const TITULO_TERMINOS = "Términos y condiciones — EnMiRumbo";
export const DESCRIPCION_TERMINOS =
  "Las reglas de EnMiRumbo: qué es el directorio, el deslinde entre vecinos y negocios, qué significa \"Negocio verificado\" y las reglas de moderación.";

// ── Aviso de privacidad integral ─────────────────────────────────────────────
export const AVISO_PRIVACIDAD: DocumentoLegal = {
  h1: "Aviso de privacidad",
  ultimaActualizacion: FECHA_PUBLICACION_PLACEHOLDER,
  introduccion:
    "Este aviso explica, sin rodeos, qué datos nos das cuando registras tu negocio en EnMiRumbo, el directorio de negocios de Tizayuca, para qué los usamos, qué queda público y cómo puedes pedirnos que los corrijamos o los borremos.",
  secciones: [
    {
      encabezado: "Quién es responsable de tus datos",
      bloques: [
        {
          tipo: "parrafo",
          texto: `El responsable del directorio EnMiRumbo y de los datos personales que nos das es ${NOMBRE_RESPONSABLE_PLACEHOLDER}, con domicilio en ${DOMICILIO_RESPONSABLE_PLACEHOLDER}, Tizayuca, Hidalgo, México.`,
        },
        {
          tipo: "parrafo",
          texto: `Para cualquier cosa relacionada con tus datos escríbenos al correo ${CORREO_DEL_DIRECTORIO} o por WhatsApp al ${WHATSAPP_DIRECTORIO_PLACEHOLDER}.`,
        },
      ],
    },
    {
      encabezado: "Qué datos recogemos",
      bloques: [
        { tipo: "parrafo", texto: "Los que tú escribes en el formulario de registro:" },
        {
          tipo: "lista",
          items: [
            "Obligatorios: el nombre de tu negocio, la categoría, tu número de WhatsApp de 10 dígitos y tu colonia.",
            // Enmienda aprobada (T-012): el elemento (2) de la LFPDPPP pide
            // enumerar TODOS los datos que se tratan, y desde T-008 el
            // formulario captura una foto que esta lista no nombraba.
            "Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario, el link de tu Facebook y, si la subes, una foto de tu negocio.",
          ],
        },
        {
          tipo: "parrafo",
          texto:
            "No te pedimos CURP, RFC, credencial de elector ni datos bancarios. Si nos los mandas por WhatsApp, no los guardamos.",
        },
        {
          tipo: "parrafo",
          texto:
            "Guardamos también la fecha y la hora en que aceptaste este aviso: es la constancia de que nos diste tu permiso para usar tus datos.",
        },
        {
          tipo: "parrafo",
          texto:
            "Cuando envías el formulario, el servidor usa tu dirección IP por menos de una hora, solo en su memoria, para frenar registros automatizados. No la guardamos en la base de datos ni la ligamos a tu ficha.",
        },
      ],
    },
    {
      encabezado: "Para qué usamos tus datos",
      bloques: [
        {
          tipo: "lista",
          items: [
            "Para revisar que tu negocio existe y que el número que registraste es tuyo: te escribimos o te llamamos por WhatsApp antes de publicar.",
            "Para publicar tu ficha en el directorio, que es a lo que vino todo esto: que los vecinos te encuentren y te contacten.",
            "Para avisarte cuando publicamos tu ficha, para mandarte su link y para decirte, si fuera el caso, por qué no la publicamos.",
            "Para contar cuántos negocios se registran y cuántos se publican, en números generales, y saber si el directorio está sirviendo.",
          ],
        },
        {
          tipo: "parrafo",
          texto:
            "No usamos tus datos para publicidad de terceros ni para nada distinto de tener el directorio funcionando.",
        },
      ],
    },
    {
      encabezado: "Qué queda público y qué no",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            'Cuando aprobamos tu registro, tu ficha se publica y cualquier persona con internet puede verla: el nombre de tu negocio, la categoría, tu colonia, lo que escribiste en "¿Qué ofreces?", tu horario, si haces entregas, el link de tu Facebook y —esto es lo más importante— tu WhatsApp y tu teléfono fijo, con botones para escribirte o marcarte directo. Trátalos como números de contacto de tu negocio: quien sea puede verlos y usarlos.',
        },
        {
          tipo: "parrafo",
          texto:
            "Publicamos tu colonia, no tu domicilio exacto. Si tú escribes una dirección o referencias en el formulario, eso también se publica tal cual: piénsalo si atiendes desde tu casa.",
        },
        // Enmienda de la auditoría de seguridad (MEDIO-2): la enumeración
        // tiene que cuadrar con lo que la ficha sirve de verdad. La dirección
        // alimenta el botón "Cómo llegar" (`construirEnlaceComoLlegar` en
        // `src/lib/enlaces.ts`).
        //
        // Enmienda de T-008 (`agregar-foto-negocio`, delta `paginas-legales`):
        // el formulario YA pide fotos, así que aquí se escribe la política que
        // este mismo aviso prometía —qué se puede retratar, qué no y qué pasa
        // si no cumple (PRD §6.1 y §6.3)—, más lo que hacemos con los
        // metadatos. Es el mismo texto de `TEXTO_POLITICA_FOTO`
        // (`src/lib/registro/textos.ts`) contado desde el aviso.
        {
          tipo: "parrafo",
          texto:
            'Esa dirección también alimenta el botón "Cómo llegar" de tu ficha: quien lo toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu colonia y "Tizayuca, Hidalgo".',
        },
        {
          tipo: "parrafo",
          texto:
            "Si subes una foto de tu negocio, esa foto es pública igual que lo demás. La foto es opcional y debe mostrar tu local, tus productos o tu trabajo: que no salgan personas que se puedan reconocer, porque este aviso cubre tus datos y no la imagen de otras personas. Si una foto no cumple, no la publicamos y te decimos por qué al revisar tu registro. Antes de guardarla la comprimimos y le quitamos los datos ocultos que trae el archivo —como la ubicación GPS de dónde se tomó—: eso no se publica ni se conserva.",
        },
        {
          tipo: "parrafo",
          texto:
            "Buscadores como Google pueden encontrar tu ficha y mostrarla en sus resultados. Para eso está hecho el directorio.",
        },
        {
          tipo: "parrafo",
          texto:
            "Lo que nunca se publica: la fecha en que te registraste, las notas internas de la revisión y el motivo por el que, en su caso, no publicamos tu ficha. Eso solo lo ve quien administra el directorio.",
        },
      ],
    },
    {
      encabezado: "Con quién compartimos tus datos",
      bloques: [
        {
          tipo: "parrafo",
          texto: "Con nadie. No vendemos, no rentamos ni intercambiamos tus datos.",
        },
        {
          tipo: "parrafo",
          texto:
            "Los únicos terceros que participan son los proveedores que hacen funcionar el sitio (hospedaje y base de datos), que tratan los datos por cuenta nuestra y nada más para eso.",
        },
        {
          tipo: "parrafo",
          texto:
            "Solo entregaríamos datos a una autoridad que nos los pida por escrito y conforme a la ley.",
        },
      ],
    },
    {
      encabezado: "Cómo limitar el uso o la divulgación de tus datos",
      // Enmienda de la auditoría de seguridad (ALTO-1 y MEDIO-1): el plazo de
      // 90 días es el de los registros RECHAZADOS —lo que dicen el PRD §6.3 y
      // §8, lo mismo que `/terminos`, y lo único que el modelo puede fechar
      // (`rechazadoEn`; una ficha en revisión no tiene reloj de purga)—, y
      // aquí no se promete ningún automatismo: todo se atiende a mano y a
      // petición.
      //
      // Actualizado por T-015 (`agregar-despublicar-y-borrado-arco`): de los
      // tres renglones de esta lista, "despubliquemos tu ficha" y "borremos
      // todo" ya son dos acciones del panel; "quitar un campo de la ficha"
      // sigue siendo edición a mano contra la base, igual que la purga de los
      // rechazados a los 90 días. Los dos pendientes que quedan están
      // declarados en `PENDIENTES_OPERATIVOS_LEGALES`.
      bloques: [
        {
          tipo: "lista",
          items: [
            "Dinos qué no quieres publicar: si prefieres que tu teléfono fijo, tu horario o tu dirección no aparezcan en la ficha, escríbenos y los quitamos.",
            "Pide que despubliquemos tu ficha: en cuanto nos llega tu mensaje la bajamos del directorio, sin trámites ni explicaciones.",
            "Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos.",
            "Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días.",
          ],
        },
        {
          tipo: "parrafo",
          texto:
            "Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo. Escríbenos por WhatsApp o por correo y te confirmamos que quedó hecho en un máximo de 20 días hábiles.",
        },
      ],
    },
    {
      encabezado: "Tus derechos ARCO",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Tienes derecho a acceder a tus datos, a rectificarlos si están mal, a cancelarlos (que los borremos) y a oponerte a que los usemos. Eso son los derechos ARCO.",
        },
        {
          tipo: "parrafo",
          texto: `Para ejercerlos escríbenos al correo ${CORREO_DEL_DIRECTORIO} o por WhatsApp al ${WHATSAPP_DIRECTORIO_PLACEHOLDER} y dinos:`,
        },
        {
          tipo: "lista",
          items: [
            "qué quieres: ver tus datos, corregirlos, borrarlos u oponerte a que los usemos;",
            "el nombre de tu negocio y el número de WhatsApp con el que lo registraste;",
            "si es una corrección, qué debe decir.",
          ],
        },
        {
          tipo: "parrafo",
          texto:
            "Te contestamos en un máximo de 20 días hábiles y, si tu solicitud procede, la aplicamos en cuanto te respondemos. No cobramos nada por esto.",
        },
        {
          tipo: "parrafo",
          texto:
            "Como el registro no usa cuentas ni contraseñas, antes de cambiar o borrar algo confirmamos que la solicitud viene del mismo número de WhatsApp con el que se registró el negocio. Es para que nadie más pueda tocar tu ficha.",
        },
      ],
    },
    {
      encabezado: "Cookies y datos de navegación",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "El directorio público no usa cookies de publicidad ni rastrea a los vecinos que lo visitan. La única cookie del sitio es la de la sesión de quien administra el directorio. Si más adelante agregamos alguna herramienta para medir visitas, lo decimos aquí antes de encenderla.",
        },
      ],
    },
    {
      encabezado: "Cambios a este aviso",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Si cambiamos este aviso, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Si el cambio es importante —por ejemplo, si empezamos a usar tus datos para algo nuevo—, te avisamos por WhatsApp al número que registraste antes de aplicarlo. Darle una repasada a esta página de vez en cuando es la forma de estar al tanto.",
        },
      ],
    },
    {
      encabezado: "Si crees que no respetamos tus derechos",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, que desde 2025 es la autoridad en materia de protección de datos personales en México.",
        },
      ],
    },
  ],
  enlaceCierre: { texto: "Términos y condiciones", href: "/terminos" },
};

// ── Términos y condiciones ───────────────────────────────────────────────────
export const TERMINOS: DocumentoLegal = {
  h1: "Términos y condiciones",
  ultimaActualizacion: FECHA_PUBLICACION_PLACEHOLDER,
  introduccion:
    "Estas son las reglas de EnMiRumbo, el directorio de negocios de Tizayuca, para los negocios que se registran y para los vecinos que los buscan. Al usar el sitio o registrar tu negocio, aceptas lo que dice aquí.",
  secciones: [
    {
      encabezado: "Qué es EnMiRumbo",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Es un directorio de negocios y servicios de Tizayuca, Hidalgo. Sirve para dos cosas: que un negocio publique su ficha gratis y que un vecino lo encuentre y le escriba por WhatsApp. Nada más.",
        },
        {
          tipo: "parrafo",
          texto:
            "No cobramos por registrarse, no vendemos nada, no cobramos comisiones y no hay cuentas ni contraseñas.",
        },
      ],
    },
    {
      encabezado: "Somos un intermediario informativo, no el negocio",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "EnMiRumbo solo muestra información. No prestamos los servicios ni vendemos los productos que aparecen en las fichas.",
        },
        {
          tipo: "parrafo",
          texto:
            "Cuando le escribes a un negocio por WhatsApp, sales de este sitio. Lo que pase después —el precio, el trabajo, la entrega, el pago, la garantía, los tiempos y cualquier problema— es un trato directo entre tú y ese negocio. EnMiRumbo no es parte de ese trato, no lo garantiza, no lo supervisa y no responde por él.",
        },
        {
          tipo: "parrafo",
          texto:
            "Tampoco respondemos por daños, pérdidas o desacuerdos que salgan de un servicio o una compra contratados con alguien que encontraste aquí. Si algo sale mal, resuélvelo con el negocio; y avísanos, porque nos sirve para moderar el directorio.",
        },
      ],
    },
    {
      encabezado: "Qué verificamos y qué no",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            'Antes de publicar una ficha le escribimos o le llamamos al número registrado para confirmar dos cosas: que el negocio existe y que el número es de quien lo registró. Eso, y nada más que eso, es lo que significa el sello "Negocio verificado".',
        },
        {
          tipo: "parrafo",
          texto:
            "Lo que no verificamos: la calidad del trabajo, los precios, que el negocio tenga licencias, permisos o seguros, ni que lo que dice su ficha siga siendo cierto con el tiempo. Esa información la escribe cada negocio y es su responsabilidad que sea verdadera y esté al día.",
        },
        {
          tipo: "parrafo",
          texto:
            "Si un negocio cierra o cambia sus datos y no nos avisa, su ficha puede quedar desactualizada. Avísanos y la corregimos o la bajamos.",
        },
      ],
    },
    {
      encabezado: "Reglas para registrar un negocio",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Revisamos a mano cada registro antes de publicarlo. Rechazamos —o retiramos, si ya estaba publicada— cualquier ficha que caiga en esto:",
        },
        {
          tipo: "lista",
          items: [
            "Actividades ilegales, o que necesitan una licencia o un permiso que no se pueda demostrar: venta de medicamentos controlados, armas, préstamos informales y parecidos.",
            "Contenido ofensivo, discriminatorio o sexual.",
            "Fichas de negocios ajenos registradas por alguien sin autorización del negocio: solo lo registra su dueño o alguien con su permiso.",
            "Fotos que no cumplan las reglas de publicación del directorio.",
            "Datos falsos, un número de contacto que no es del negocio, o registrar la misma ficha varias veces.",
          ],
        },
        {
          tipo: "parrafo",
          texto:
            "Rechazar no es para siempre: te avisamos por WhatsApp con el motivo y puedes corregir y volver a enviar tu registro. Los datos de los registros rechazados se borran a los 90 días.",
        },
      ],
    },
    {
      encabezado: "Podemos retirar una ficha",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Nos reservamos el derecho de no publicar o de retirar cualquier ficha que rompa estas reglas o que ya no corresponda a un negocio real de Tizayuca. Y si el propio negocio nos pide que la bajemos, la bajamos de inmediato.",
        },
      ],
    },
    {
      encabezado: "Si ves algo raro",
      bloques: [
        {
          tipo: "parrafo",
          texto: `Si encuentras una ficha falsa, un negocio que ya cerró o algo que rompe estas reglas, escríbenos al correo ${CORREO_DEL_DIRECTORIO} o por WhatsApp al ${WHATSAPP_DIRECTORIO_PLACEHOLDER}. Lo revisamos y actuamos.`,
        },
      ],
    },
    {
      encabezado: "Uso de la información del directorio",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Los datos del directorio están para que los vecinos contacten a los negocios uno por uno. Copiarlos de forma masiva —a mano o con programas— para armar otra base de datos, revenderlos o mandar publicidad no está permitido.",
        },
      ],
    },
    {
      encabezado: "Tus datos personales",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Qué datos guardamos, para qué los usamos y qué queda público está explicado en el aviso de privacidad.",
        },
        { tipo: "enlace", texto: "Aviso de privacidad", href: "/aviso-de-privacidad" },
      ],
    },
    {
      encabezado: "Cambios a estos términos",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            "Si cambiamos estas reglas, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Seguir usando el sitio después de un cambio significa que lo aceptas.",
        },
      ],
    },
    {
      encabezado: "Ley aplicable",
      bloques: [
        {
          tipo: "parrafo",
          texto: `Estos términos se rigen por las leyes mexicanas. ${JURISDICCION_PLACEHOLDER}.`,
        },
      ],
    },
  ],
};
