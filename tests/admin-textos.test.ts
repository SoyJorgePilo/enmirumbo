import { describe, expect, it } from "vitest";

import * as textos from "../src/lib/admin/textos";
import { construirEnlaceWhatsappPanel } from "../src/lib/admin/whatsapp";

// Spec: revision-admin · todos los literales aprobados (tasks.md #7 y #16).
// Los textos de abajo están COPIADOS de
// `openspec/changes/agregar-panel-admin/specs/revision-admin/spec.md`: si
// alguien cambia el copy sin cambiar la spec, esta suite lo caza.

describe("revision-admin · literales de la spec, carácter por carácter", () => {
  it.each([
    ["encabezado de acceso", textos.TEXTO_ENCABEZADO_ACCESO, "Panel de revisión"],
    ["etiqueta de contraseña", textos.ETIQUETA_CONTRASENA, "Contraseña"],
    ["botón de entrar", textos.BOTON_ENTRAR, "Entrar"],
    ["botón de salir", textos.BOTON_SALIR, "Salir"],
    [
      "contraseña incorrecta",
      textos.ERROR_CONTRASENA_INCORRECTA,
      "Contraseña incorrecta.",
    ],
    [
      "demasiados intentos",
      textos.ERROR_DEMASIADOS_INTENTOS,
      "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
    ],
    ["cierre de sesión", textos.MENSAJE_SESION_CERRADA, "Cerraste sesión."],
    [
      "panel no disponible",
      textos.MENSAJE_PANEL_NO_DISPONIBLE,
      "El panel no está disponible por ahora.",
    ],
    ["encabezado de la cola", textos.TEXTO_COLA_ENCABEZADO, "Registros por revisar"],
    [
      "cola vacía",
      textos.TEXTO_COLA_VACIA,
      "No hay registros esperando. Todo al día.",
    ],
    ["entrada al detalle", textos.TEXTO_REVISAR, "Revisar"],
    [
      "indicador de atraso",
      textos.TEXTO_INDICADOR_ATRASADO,
      "Lleva más de 48 horas",
    ],
    [
      "botón de verificación",
      textos.BOTON_WHATSAPP_VERIFICACION,
      "Escribirle por WhatsApp",
    ],
    [
      "rótulo de giros",
      textos.ETIQUETA_GIROS,
      "Giros (de 1 a 3, o ninguno si no embona)",
    ],
    ["rótulo de colonia", textos.ETIQUETA_COLONIA_APROBAR, "¿En qué colonia está?"],
    ["rótulo de origen", textos.ETIQUETA_ORIGEN, "¿De dónde salió?"],
    ["origen orgánico", textos.OPCION_ORIGEN_ORGANICO, "Se registró solo"],
    ["origen de siembra", textos.OPCION_ORIGEN_SIEMBRA, "Lo sembramos nosotros"],
    ["botón de aprobar", textos.BOTON_APROBAR, "Aprobar y publicar"],
    ["error de giros", textos.ERROR_MAX_GIROS, "Elige máximo 3 giros"],
    [
      "error de colonia",
      textos.ERROR_COLONIA_PENDIENTE,
      "Elige la colonia de este negocio",
    ],
    ["confirmación de aprobado", textos.MENSAJE_APROBADO, "Ya quedó publicado."],
    ["botón de avisar", textos.BOTON_AVISAR_WHATSAPP, "Avisarle por WhatsApp"],
    ["rótulo del motivo", textos.ETIQUETA_MOTIVO_RECHAZO, "¿Por qué lo rechazas?"],
    ["botón de rechazar", textos.BOTON_RECHAZAR, "Rechazar"],
    ["error de motivo", textos.ERROR_MOTIVO_VACIO, "Escribe por qué lo rechazas"],
    ["confirmación de rechazo", textos.MENSAJE_RECHAZADO, "Registro rechazado."],
    [
      "transición ya resuelta",
      textos.MENSAJE_YA_RESUELTO,
      "Este registro ya lo habías resuelto.",
    ],
  ])("el %s es exactamente el de la spec", (_caso, actual, esperado) => {
    expect(actual).toBe(esperado);
  });
});

describe("revision-admin · las tres plantillas de WhatsApp", () => {
  // Scenario: abrir la conversación de verificación
  it("verificación, con el nombre del negocio interpolado", () => {
    expect(textos.mensajeVerificacion("Tacos del Güero")).toBe(
      "Hola, te escribo de NecesitoUno Tizayuca, el directorio de negocios del municipio. Recibimos el registro de «Tacos del Güero». ¿Nos confirmas que el negocio es tuyo y que este es tu WhatsApp?",
    );
  });

  // Scenario: aviso de publicación
  it("aviso de publicación, con el nombre y el link de la ficha", () => {
    expect(
      textos.mensajeAvisoPublicacion(
        "Estética Lupita",
        "https://necesitouno.example/negocio/estetica-lupita-abc123",
      ),
    ).toBe(
      "¡Listo! Ya quedó publicado «Estética Lupita» en NecesitoUno Tizayuca. Esta es tu ficha: https://necesitouno.example/negocio/estetica-lupita-abc123 — compártela con tus clientes.",
    );
  });

  // Scenario: sin enlace de gestión todavía
  it("el aviso de publicación no promete ningún enlace de gestión", () => {
    const mensaje = textos.mensajeAvisoPublicacion("Negocio Ficticio", "https://x.example/f");
    expect(mensaje.toLowerCase()).not.toContain("gestion");
    expect(mensaje.toLowerCase()).not.toContain("gestión");
    expect(mensaje.toLowerCase()).not.toContain("editar");
  });

  // Scenario: aviso de rechazo por WhatsApp
  it("aviso de rechazo, con el nombre y el motivo", () => {
    expect(
      textos.mensajeAvisoRechazo(
        "Préstamos Rápidos",
        "No publicamos préstamos informales",
      ),
    ).toBe(
      "Hola, revisamos el registro de «Préstamos Rápidos» en NecesitoUno Tizayuca y por ahora no lo pudimos publicar: No publicamos préstamos informales. Si lo corriges, lo puedes volver a enviar desde el mismo formulario con este mismo número.",
    );
  });
});

describe("revision-admin · conteo de atrasados (copy propuesto, sin literal en la spec)", () => {
  it("concuerda en singular y en plural", () => {
    expect(textos.textoConteoAtrasados(1)).toBe(
      "1 registro lleva más de 48 horas esperando.",
    );
    expect(textos.textoConteoAtrasados(3)).toBe(
      "3 registros llevan más de 48 horas esperando.",
    );
  });
});

describe("revision-admin · enlace de WhatsApp del panel", () => {
  // Scenario: abrir la conversación de verificación
  it("arma el wa.me con el número normalizado y el mensaje codificado", () => {
    const mensaje = textos.mensajeVerificacion("Tacos del Güero");
    expect(construirEnlaceWhatsappPanel("7719990001", mensaje)).toBe(
      `https://wa.me/527719990001?text=${encodeURIComponent(mensaje)}`,
    );
  });

  it("normaliza el número aunque venga con lada, espacios o guiones", () => {
    const mensaje = "hola";
    const esperado = `https://wa.me/527719990001?text=${encodeURIComponent(mensaje)}`;
    expect(construirEnlaceWhatsappPanel("+52 771 999 0001", mensaje)).toBe(esperado);
    expect(construirEnlaceWhatsappPanel("771-999-0001", mensaje)).toBe(esperado);
  });

  // Scenario: número que no se puede interpretar
  it.each(["no-es-un-numero", "", "12345", "5511122233344455"])(
    "sin número interpretable (%s) no inventa enlace",
    (whatsapp) => {
      expect(construirEnlaceWhatsappPanel(whatsapp, "hola")).toBeNull();
    },
  );
});

// ── Literales del change agregar-despublicar-y-borrado-arco (tasks.md #3 y #19) ──
// Copiados del delta de `revision-admin` de ese change.

describe("revision-admin · literales de despublicar y del borrado definitivo", () => {
  it.each([
    ["botón de despublicar", textos.BOTON_DESPUBLICAR, "Despublicar"],
    [
      "rótulo del motivo de la despublicación",
      textos.ETIQUETA_MOTIVO_DESPUBLICAR,
      "¿Por qué la despublicas?",
    ],
    [
      "texto de ayuda del motivo (duda 2 de la propuesta)",
      textos.AYUDA_MOTIVO_DESPUBLICAR,
      "Este motivo se le enviará al negocio por WhatsApp.",
    ],
    [
      "error del motivo vacío",
      textos.ERROR_MOTIVO_DESPUBLICAR_VACIO,
      "Escribe por qué la despublicas",
    ],
    ["confirmación de la despublicación", textos.MENSAJE_DESPUBLICADO, "Ya la despublicaste."],
    [
      "ficha que ya no estaba publicada",
      textos.MENSAJE_YA_NO_PUBLICADA,
      "Esta ficha ya no estaba publicada.",
    ],
    [
      "etiqueta de la cola",
      textos.ETIQUETA_COLA_DESPUBLICADA,
      "Ya estaba publicada, la despublicaste",
    ],
    [
      "rótulo de cuándo se despublicó",
      textos.ETIQUETA_CUANDO_DESPUBLICO,
      "Cuándo la despublicaste",
    ],
    [
      "rótulo de por qué se despublicó",
      textos.ETIQUETA_POR_QUE_DESPUBLICO,
      "Por qué la despublicaste",
    ],
    [
      "control de borrado",
      textos.BOTON_BORRAR_DEFINITIVAMENTE,
      "Borrar definitivamente",
    ],
    [
      "encabezado de la confirmación",
      textos.ENCABEZADO_CONFIRMAR_BORRADO,
      "¿Seguro que quieres borrar esta ficha?",
    ],
    [
      "recordatorio del trámite ARCO",
      textos.RECORDATORIO_TRAMITE_ARCO,
      "Antes de borrar: confirma por WhatsApp, desde el número con el que se registró, que quien lo pide es el dueño del negocio. Tienes 20 días hábiles para contestarle.",
    ],
    [
      "rótulo del campo de confirmación",
      textos.ETIQUETA_CONFIRMAR_BORRAR,
      "Escribe BORRAR para confirmar",
    ],
    ["botón de confirmar el borrado", textos.BOTON_CONFIRMAR_BORRADO, "Sí, borrar para siempre"],
    ["salida de la confirmación", textos.TEXTO_MEJOR_NO_REGRESAR, "Mejor no, regresar"],
    [
      "error de la palabra de confirmación",
      textos.ERROR_PALABRA_BORRAR,
      "Para borrar, escribe BORRAR en el campo.",
    ],
    ["confirmación del borrado", textos.MENSAJE_BORRADO_HECHO, "Ya se borró para siempre."],
    ["ficha que ya no existe", textos.MENSAJE_YA_NO_EXISTE, "Esta ficha ya no existe."],
    ["palabra de confirmación", textos.PALABRA_CONFIRMACION_BORRADO, "BORRAR"],
  ])("el %s es exactamente el de la spec", (_caso, actual, esperado) => {
    expect(actual).toBe(esperado);
  });

  // Scenario: aviso de despublicación
  it("el aviso de despublicación por WhatsApp interpola nombre y motivo", () => {
    expect(textos.mensajeAvisoDespublicacion("Tacos del Güero", "El negocio cerró")).toBe(
      "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «Tacos del Güero»: El negocio cerró. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí.",
    );
  });

  // Sin literal en la spec (copy propuesto, enmienda del hallazgo BAJO 3 de la
  // etapa C): el motivo ya no se recorta en silencio.
  it("el error de motivo largo dice la cota y por qué importa", () => {
    expect(textos.errorMotivoDespublicarLargo(500)).toBe(
      "El motivo no puede pasar de 500 caracteres. Recórtalo un poco: así, completo, es como le va a llegar al negocio.",
    );
    // La cota sale del parámetro: texto y límite no se pueden desincronizar.
    expect(textos.errorMotivoDespublicarLargo(200)).toContain("200 caracteres");
    // Y no es el mismo mensaje que el del motivo vacío.
    expect(textos.errorMotivoDespublicarLargo(500)).not.toBe(
      textos.ERROR_MOTIVO_DESPUBLICAR_VACIO,
    );
  });

  it("la advertencia del borrado nombra el negocio y dice que no hay vuelta atrás", () => {
    expect(textos.textoAdvertenciaBorrado("Tacos del Güero")).toBe(
      "Esto borra para siempre el registro de «Tacos del Güero», sus giros y sus reportes. No hay papelera y no se puede deshacer.",
    );
  });
});
