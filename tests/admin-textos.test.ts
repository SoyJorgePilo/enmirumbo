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
    // Reportes (change `agregar-boton-reportar`, delta de revision-admin)
    [
      "encabezado de negocios reportados",
      textos.TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO,
      "Negocios reportados",
    ],
    ["entrada a los reportes", textos.TEXTO_VER_REPORTES, "Ver reportes"],
    [
      "encabezado de los reportes del detalle",
      textos.TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO,
      "Reportes sin atender",
    ],
    ["botón de atender", textos.BOTON_MARCAR_ATENDIDO, "Marcar como atendido"],
    [
      "confirmación de atendido",
      textos.MENSAJE_REPORTE_ATENDIDO,
      "Reporte atendido.",
    ],
    [
      "reporte ya atendido",
      textos.MENSAJE_REPORTE_YA_ATENDIDO,
      "Este reporte ya lo habías atendido.",
    ],
  ])("el %s es exactamente el de la spec", (_caso, actual, esperado) => {
    expect(actual).toBe(esperado);
  });
});

describe("revision-admin · conteos de reportes (literales del delta)", () => {
  // Requirement "La cola avisa qué negocios tienen reportes sin atender"
  it("el conteo de la sección concuerda en singular y en plural", () => {
    expect(textos.textoConteoNegociosReportados(1)).toBe(
      "1 negocio tiene reportes sin atender.",
    );
    expect(textos.textoConteoNegociosReportados(2)).toBe(
      "2 negocios tienen reportes sin atender.",
    );
  });

  it("el renglón dice cuántos reportes sin atender tiene el negocio", () => {
    expect(textos.textoReportesSinAtender(1)).toBe("1 reporte sin atender");
    expect(textos.textoReportesSinAtender(3)).toBe("3 reportes sin atender");
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
