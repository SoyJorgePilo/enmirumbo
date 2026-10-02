import { describe, expect, it } from "vitest";

import * as textos from "../src/lib/verificacion/textos";

/**
 * Specs `registro-negocio` y `revision-admin` (T-016) · TODOS los literales de
 * la verificación por SMS, carácter por carácter (tasks.md #6 y #14).
 *
 * Los textos de abajo están COPIADOS de
 * `openspec/changes/agregar-verificacion-sms-tras-bandera/specs/`: si alguien
 * cambia el copy sin cambiar la spec, esta suite lo caza. Incluye los guiones
 * largos ("—"), los signos de apertura ("¡") y los puntos finales, que es
 * justo donde se cuelan las diferencias.
 *
 * Los tres literales del panel viven aquí y NO en `src/lib/admin/textos.ts`:
 * una sola fuente para las dos superficies, tal como pide tasks.md #6.
 */

describe("registro-negocio · literales de la pantalla del código", () => {
  it.each([
    ["encabezado", textos.TEXTO_ENCABEZADO_VERIFICAR, "Confirma tu número"],
    [
      "explicación con los últimos cuatro dígitos",
      textos.textoExplicacionVerificar("4567"),
      "Te mandamos un código por SMS al número que termina en 4567. Escríbelo aquí y confirmamos que ese WhatsApp es tuyo.",
    ],
    [
      "frase de tranquilidad",
      textos.TEXTO_TRANQUILIDAD_VERIFICAR,
      "Tu negocio ya quedó registrado y está en revisión. Esto solo nos ahorra un paso.",
    ],
    ["rótulo del campo", textos.ETIQUETA_CODIGO_VERIFICAR, "Código de 6 dígitos"],
    ["botón de confirmar", textos.BOTON_CONFIRMAR_NUMERO, "Confirmar mi número"],
    ["botón de reenviar", textos.BOTON_REENVIAR_CODIGO, "Reenviar el código"],
    ["salida", textos.BOTON_SALIR_VERIFICAR, "Mejor luego, mi registro ya quedó"],
    [
      "intentos agotados",
      textos.MENSAJE_INTENTOS_AGOTADOS_VERIFICAR,
      "Ya lo intentaste varias veces. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.",
    ],
    [
      "espera de reenvío",
      textos.TEXTO_ESPERA_REENVIO,
      "Espera un momento para pedir otro código.",
    ],
    [
      "cupo de códigos por IP",
      textos.TEXTO_CUPO_IP_CODIGOS,
      "Ya pedimos varios códigos desde aquí. Espera un rato y vuelve a intentar.",
    ],
  ])("%s", (_caso, real, esperado) => {
    expect(real).toBe(esperado);
  });

  it.each([
    ["código incompleto", "incompleto", "Escribe los 6 dígitos que te llegaron por SMS."],
    ["no coincide", "noCoincide", "Ese código no es. Revísalo y vuelve a escribirlo."],
    ["vencido", "vencido", "Ese código ya venció. Pide uno nuevo."],
    [
      "el proveedor falla",
      "proveedorFallo",
      "No pudimos confirmar tu número en este momento. No te preocupes: tu registro está en revisión y te vamos a contactar por WhatsApp.",
    ],
  ] as const)("error junto al campo: %s", (_caso, clave, esperado) => {
    expect(textos.ERRORES_CODIGO_VERIFICAR[clave]).toBe(esperado);
  });

  it("la explicación nunca lleva el número completo, solo los cuatro dígitos", () => {
    const explicacion = textos.textoExplicacionVerificar("4567");
    expect(explicacion).toContain("4567");
    expect(explicacion).not.toContain("7711234567");
  });
});

describe("registro-negocio · la línea de la pantalla de gracias", () => {
  it("es la línea aprobada, y NO sustituye el mensaje del PRD §6.1", () => {
    expect(textos.LINEA_CONFIRMACION_NUMERO_GRACIAS).toBe("¡Listo! Ya confirmamos tu número.");
  });
});

describe("revision-admin · los tres literales del panel", () => {
  it("etiqueta del renglón de la cola", () => {
    expect(textos.ETIQUETA_COLA_NUMERO_VERIFICADO_SMS).toBe("Número verificado por SMS");
  });

  it("detalle: sin verificar con la capacidad encendida", () => {
    expect(textos.TEXTO_SIN_VERIFICAR_SMS).toBe(
      "Sin verificar — confirma por WhatsApp como siempre",
    );
  });

  it("detalle: verificado, con la fecha en la forma de la constancia", () => {
    expect(textos.textoNumeroVerificadoSms("4 de septiembre de 2026")).toBe(
      "Número verificado por SMS el 4 de septiembre de 2026",
    );
  });
});
