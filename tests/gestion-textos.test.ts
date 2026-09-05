import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADVERTENCIA_CAMBIO_WHATSAPP,
  BOTON_APLICAR_CAMBIOS,
  BOTON_DESCARTAR_CAMBIOS,
  BOTON_GENERAR_ENLACE_NUEVO,
  BOTON_MANDAR_ENLACE_WHATSAPP,
  ERROR_MOTIVO_DESCARTE_VACIO,
  ERROR_WHATSAPP_OCUPADO_EDICION,
  ETIQUETA_ALTA_NUEVA,
  ETIQUETA_EDICION,
  ETIQUETA_LO_PROPUESTO,
  ETIQUETA_LO_PUBLICADO,
  ETIQUETA_MOTIVO_DESCARTE,
  MARCA_CAMBIO,
  MENSAJE_CAMBIOS_APLICADOS,
  MENSAJE_CAMBIOS_DESCARTADOS,
  MENSAJE_EDICION_REEMPLAZADA,
  MENSAJE_EDICION_YA_RESUELTA,
  MENSAJE_ENLACE_REGENERADO,
  TITULO_CAMBIOS_POR_REVISAR,
  mensajeAvisoCambiosAplicados,
  mensajeAvisoCambiosDescartados,
  mensajeAvisoPublicacionConEnlace,
  mensajeEnlaceNuevo,
} from "../src/lib/admin/textos";
import {
  AVISO_EDICION_PENDIENTE,
  BOTON_ENVIAR_CAMBIOS,
  CONTROL_PERDI_MI_ENLACE,
  ENCABEZADO_ES_TU_NEGOCIO,
  ERROR_CUPO_EDICION,
  ERROR_GUARDAR_EDICION,
  ERROR_WHATSAPP_DUPLICADO_EDICION,
  FRASE_EDICION,
  MENSAJE_CAMBIOS_RECIBIDOS,
  NOTA_PRIVACIDAD_VIGENTE,
  TITULO_EDICION,
  mensajePerdiMiEnlace,
} from "../src/lib/gestion/textos";

/**
 * Los literales del change `agregar-enlace-de-gestion`, comparados carácter
 * por carácter contra las specs `registro-negocio`, `revision-admin` y
 * `directorio-publico` (tasks.md #8, #17 y #33). Son contenido aprobado, no
 * copy libre: si alguien los "mejora", esta suite lo dice.
 */

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

describe("registro-negocio · literales del modo edición", () => {
  it.each([
    [TITULO_EDICION, "Edita tu ficha"],
    [
      FRASE_EDICION,
      "Cambia lo que necesites y lo revisamos antes de publicarlo. Mientras tanto tu ficha sigue como está.",
    ],
    [BOTON_ENVIAR_CAMBIOS, "Enviar cambios"],
    [
      NOTA_PRIVACIDAD_VIGENTE,
      "Tus datos siguen protegidos por el mismo aviso de privacidad que aceptaste al registrarte.",
    ],
    [
      AVISO_EDICION_PENDIENTE,
      "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores.",
    ],
    [
      MENSAJE_CAMBIOS_RECIBIDOS,
      "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está.",
    ],
    [
      ERROR_GUARDAR_EDICION,
      "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento.",
    ],
    [ERROR_WHATSAPP_DUPLICADO_EDICION, "Ese número ya está en otra ficha del directorio."],
    [
      ERROR_CUPO_EDICION,
      "Ya recibimos varios cambios desde aquí. Espera un rato y vuelve a intentar.",
    ],
  ])("«%s» es el literal de la spec", (constante, literal) => {
    expect(constante).toBe(literal);
  });
});

describe("directorio-publico · literales de 'Perdí mi enlace'", () => {
  it("el encabezado y el control son los de la spec", () => {
    expect(ENCABEZADO_ES_TU_NEGOCIO).toBe("¿Es tu negocio?");
    expect(CONTROL_PERDI_MI_ENLACE).toBe("Perdí mi enlace");
  });

  // Scenario: pedir el enlace desde la ficha
  it("el mensaje al admin interpola el nombre y no promete que llegue solo", () => {
    expect(mensajePerdiMiEnlace("Tacos del Güero")).toBe(
      "Hola, soy de «Tacos del Güero» en EnMiRumbo y perdí el enlace para editar mi ficha. Les escribo desde el número que registré, ¿me lo pueden pasar?",
    );
  });
});

describe("revision-admin · literales del panel de ediciones", () => {
  it.each([
    [ETIQUETA_ALTA_NUEVA, "Alta nueva"],
    [ETIQUETA_EDICION, "Edición"],
    [TITULO_CAMBIOS_POR_REVISAR, "Cambios por revisar"],
    [ETIQUETA_LO_PUBLICADO, "Lo que está publicado"],
    [ETIQUETA_LO_PROPUESTO, "Lo que quiere cambiar"],
    [MARCA_CAMBIO, "Cambió"],
    [
      ADVERTENCIA_CAMBIO_WHATSAPP,
      "Ojo: está cambiando su WhatsApp. Confirma con el número nuevo antes de aplicar.",
    ],
    [BOTON_APLICAR_CAMBIOS, "Aplicar los cambios"],
    [MENSAJE_CAMBIOS_APLICADOS, "Listo, la ficha ya se actualizó."],
    [
      ERROR_WHATSAPP_OCUPADO_EDICION,
      "Ese número ya está en otra ficha: no se pudieron aplicar los cambios.",
    ],
    [ETIQUETA_MOTIVO_DESCARTE, "¿Por qué no aplicas los cambios?"],
    [BOTON_DESCARTAR_CAMBIOS, "Descartar los cambios"],
    [ERROR_MOTIVO_DESCARTE_VACIO, "Escribe por qué descartas los cambios"],
    [MENSAJE_CAMBIOS_DESCARTADOS, "Cambios descartados."],
    [MENSAJE_EDICION_YA_RESUELTA, "Estos cambios ya los habías resuelto."],
    [
      MENSAJE_EDICION_REEMPLAZADA,
      "Estos cambios ya no son los últimos: el negocio mandó otros más nuevos.",
    ],
    [BOTON_GENERAR_ENLACE_NUEVO, "Generar un enlace nuevo"],
    [MENSAJE_ENLACE_REGENERADO, "Listo, el enlace anterior ya no sirve."],
    [BOTON_MANDAR_ENLACE_WHATSAPP, "Mandarle el enlace por WhatsApp"],
  ])("«%s» es el literal de la spec", (constante, literal) => {
    expect(constante).toBe(literal);
  });

  it("el aviso de cambios aplicados interpola nombre y link", () => {
    expect(
      mensajeAvisoCambiosAplicados("Estética Lupita", "https://ejemplo.example/negocio/x"),
    ).toBe(
      "¡Listo! Ya actualizamos la ficha de «Estética Lupita» en EnMiRumbo. Así quedó: https://ejemplo.example/negocio/x",
    );
  });

  it("el aviso del descarte interpola nombre y motivo", () => {
    expect(
      mensajeAvisoCambiosDescartados(
        "Préstamos Rápidos",
        "No publicamos préstamos informales",
      ),
    ).toBe(
      "Hola, revisamos los cambios que mandaste para «Préstamos Rápidos» en EnMiRumbo y por ahora no los pudimos aplicar: No publicamos préstamos informales. Tu ficha sigue publicada como estaba y puedes mandarlos otra vez con tu mismo enlace.",
    );
  });

  it("el mensaje del enlace nuevo lleva la instrucción del PRD §6.4", () => {
    expect(mensajeEnlaceNuevo("Tacos del Güero", "https://ejemplo.example/editar/abc")).toBe(
      "Hola, te mandamos un enlace nuevo para editar tu ficha de «Tacos del Güero» en EnMiRumbo: https://ejemplo.example/editar/abc. El anterior ya no sirve. Guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras.",
    );
  });

  it("el aviso de publicación lleva los dos links y la instrucción del PRD §6.4", () => {
    expect(
      mensajeAvisoPublicacionConEnlace(
        "Estética Lupita",
        "https://ejemplo.example/negocio/x",
        "https://ejemplo.example/editar/abc",
      ),
    ).toBe(
      "¡Listo! Ya quedó publicado «Estética Lupita» en EnMiRumbo. Esta es tu ficha: https://ejemplo.example/negocio/x — compártela con tus clientes. Y este es tu enlace para editarla: https://ejemplo.example/editar/abc — guarda este mensaje (puedes destacarlo con la estrella), con ese enlace actualizas tus datos cuando quieras.",
    );
  });
});

describe("directorio-publico · el WhatsApp del admin no vive en el repo", () => {
  /**
   * Scenario "el número del admin no vive en el repo": ni el código, ni los
   * seeds, ni las suites traen un número real del admin. Lo único que hay es
   * la LECTURA de la variable de entorno, y `.env.example` la declara vacía.
   */
  it(".env.example no le asigna ningún valor y el código no le pone respaldo", () => {
    const ejemplo = readFileSync(path.join(raiz, ".env.example"), "utf8");
    const activas = ejemplo
      .split("\n")
      .filter((linea) => !linea.trimStart().startsWith("#"))
      .filter((linea) => linea.includes("WHATSAPP_ADMIN"));
    expect(activas).toEqual([]);
    // Y la variable está documentada, aunque sea comentada.
    expect(ejemplo).toContain("WHATSAPP_ADMIN");

    const config = readFileSync(path.join(raiz, "src/lib/gestion/config.ts"), "utf8");
    // Ningún `??` con un número de respaldo: sin variable, no hay número.
    expect(config).not.toMatch(/\?\?\s*["'`]\d/);
    expect(config).not.toMatch(/\b\d{10}\b/);
  });
});
