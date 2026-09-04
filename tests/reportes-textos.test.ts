import { describe, expect, it } from "vitest";

import {
  AYUDA_COMENTARIO_REPORTE,
  BOTON_ENVIAR_REPORTE,
  CONTROL_REPORTAR,
  ENLACE_VOLVER_A_LA_FICHA,
  ERROR_COMENTARIO_LARGO_REPORTE,
  ERROR_CUPO_REPORTES,
  ERROR_GUARDADO_REPORTE,
  ERROR_MOTIVO_REPORTE,
  ETIQUETA_COMENTARIO_REPORTE,
  ETIQUETA_QUE_PASA,
  FRASE_REPORTAR,
  LIMITE_COMENTARIO_REPORTE,
  MENSAJE_REPORTE_ENVIADO,
} from "../src/lib/reportes/textos";

// Spec: directorio-publico (delta del change `agregar-boton-reportar`) ·
// literales de los requirements del control, del mini-formulario, de la
// validación server-side, de la confirmación y del anti-abuso (tasks.md #3).
// Son contenido aprobado: se comparan carácter por carácter contra el delta.

describe("reportes · literales de la ficha y del formulario", () => {
  it.each([
    [CONTROL_REPORTAR, "Reportar este negocio"],
    [FRASE_REPORTAR, "Dinos qué pasa y lo revisamos. No te pedimos ningún dato tuyo."],
    [ETIQUETA_QUE_PASA, "¿Qué pasa?"],
    [ETIQUETA_COMENTARIO_REPORTE, "¿Nos quieres contar más? (opcional)"],
    [AYUDA_COMENTARIO_REPORTE, "Máximo 300 caracteres."],
    [BOTON_ENVIAR_REPORTE, "Enviar reporte"],
    [ENLACE_VOLVER_A_LA_FICHA, "Volver a la ficha"],
  ])("%s es el literal de la spec", (constante, literal) => {
    expect(constante).toBe(literal);
  });
});

describe("reportes · literales de confirmación y de error", () => {
  it("la confirmación es la frase aprobada, sin conteos ni promesas", () => {
    expect(MENSAJE_REPORTE_ENVIADO).toBe(
      "¡Gracias por avisarnos! Vamos a revisar este negocio.",
    );
    expect(MENSAJE_REPORTE_ENVIADO).not.toMatch(/\d/);
    expect(MENSAJE_REPORTE_ENVIADO.toLowerCase()).not.toContain("reporte");
  });

  it.each([
    [ERROR_MOTIVO_REPORTE, "Dinos qué pasa con este negocio"],
    [ERROR_COMENTARIO_LARGO_REPORTE, "El comentario es muy largo (máximo 300 caracteres)"],
    [
      ERROR_GUARDADO_REPORTE,
      "No pudimos enviar tu reporte. Vuelve a intentarlo en un momento.",
    ],
    [
      ERROR_CUPO_REPORTES,
      "Ya recibimos varios reportes desde aquí. Espera un rato y vuelve a intentar.",
    ],
  ])("%s es el literal de la spec", (constante, literal) => {
    expect(constante).toBe(literal);
  });

  it("la cota del comentario es 300 y la ayuda dice el mismo número", () => {
    expect(LIMITE_COMENTARIO_REPORTE).toBe(300);
    expect(AYUDA_COMENTARIO_REPORTE).toContain(String(LIMITE_COMENTARIO_REPORTE));
    expect(ERROR_COMENTARIO_LARGO_REPORTE).toContain(String(LIMITE_COMENTARIO_REPORTE));
  });

  it("ningún error le habla al usuario en técnico", () => {
    for (const texto of [
      ERROR_MOTIVO_REPORTE,
      ERROR_COMENTARIO_LARGO_REPORTE,
      ERROR_GUARDADO_REPORTE,
      ERROR_CUPO_REPORTES,
    ]) {
      expect(texto).not.toMatch(/error|excepci|servidor 5|null|undefined|SQL|prisma/i);
    }
  });
});
