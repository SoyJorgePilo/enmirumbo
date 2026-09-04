import { describe, expect, it } from "vitest";

import {
  AVISO_PRIVACIDAD,
  DESCRIPCION_AVISO_PRIVACIDAD,
  DESCRIPCION_TERMINOS,
  HAY_PLACEHOLDERS_PENDIENTES,
  PENDIENTES_OPERATIVOS_LEGALES,
  PLACEHOLDERS_LEGALES,
  TERMINOS,
  TEXTO_MARCA_BORRADOR,
  TITULO_AVISO_PRIVACIDAD,
  TITULO_TERMINOS,
  type DocumentoLegal,
} from "../src/lib/legales/textos";

// Spec: paginas-legales · requirement "Placeholders visibles y marca de
// borrador mientras falten datos del responsable" (tasks.md #3 y #4).
//
// Esta suite mira el MÓDULO (la fuente única del contenido legal);
// `tests/legales-paginas.test.ts` mira lo mismo ya renderizado en las dos
// páginas. La lista de pendientes tiene que poder recorrerse para el
// checklist de lanzamiento, sin que nadie los busque a ojo.

/** Todos los textos de un documento, en orden de lectura. */
function textosDe(documento: DocumentoLegal): string[] {
  const textos = [
    documento.h1,
    documento.ultimaActualizacion,
    documento.introduccion,
  ];
  for (const seccion of documento.secciones) {
    textos.push(seccion.encabezado);
    for (const bloque of seccion.bloques) {
      if (bloque.tipo === "parrafo") textos.push(bloque.texto);
      else if (bloque.tipo === "lista") textos.push(...bloque.items);
      else textos.push(bloque.texto);
    }
  }
  if (documento.enlaceCierre) textos.push(documento.enlaceCierre.texto);
  return textos;
}

const todoElTexto = [...textosDe(AVISO_PRIVACIDAD), ...textosDe(TERMINOS)].join("\n");

describe("paginas-legales · la lista de pendientes es la fuente única", () => {
  it("cada placeholder declarado es un literal entre corchetes que dice qué falta", () => {
    // Estado de hoy: el interruptor de lanzamiento sigue apagado porque falta
    // la revisión legal (E6-3). Cuando el humano complete los datos, este caso
    // y el de "los siete datos pendientes" se actualizan junto con la spec; la
    // suite no falla por el simple hecho de que existan placeholders
    // (design.md §3), falla si uno se queda sin declarar o sin usar.
    expect(PLACEHOLDERS_LEGALES.length).toBeGreaterThan(0);
    expect(new Set(PLACEHOLDERS_LEGALES).size).toBe(PLACEHOLDERS_LEGALES.length);
    for (const placeholder of PLACEHOLDERS_LEGALES) {
      expect(placeholder, placeholder).toMatch(/^\[.+\]$/);
      // Nombra el dato que falta en mayúsculas y, salvo la fecha, dice qué
      // hay que hacer con él antes del lanzamiento.
      expect(placeholder, placeholder).toMatch(/^\[[A-ZÁÉÍÓÚÑ ]{4,}/);
      if (placeholder !== "[FECHA DE PUBLICACIÓN]") {
        expect(placeholder, placeholder).toMatch(
          / — (completar antes del lanzamiento|confirmar en la revisión legal)\]$/,
        );
      }
    }
  });

  // Scenario: los pendientes son verificables
  it("todo corchete del texto está declarado, y todo declarado se usa", () => {
    const enElTexto = new Set([...todoElTexto.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]));
    for (const encontrado of enElTexto) {
      expect(PLACEHOLDERS_LEGALES, `placeholder sin declarar: ${encontrado}`).toContain(
        encontrado,
      );
    }
    for (const declarado of PLACEHOLDERS_LEGALES) {
      expect(enElTexto, `placeholder declarado que nadie usa: ${declarado}`).toContain(
        declarado,
      );
    }
  });

  // Los "seis datos" de tasks.md #3 son siete literales: el correo aparece
  // con dos textos distintos (ARCO en el aviso, contacto en los términos).
  it("los siete datos que solo puede dar el humano están en la lista", () => {
    const pendientes = PLACEHOLDERS_LEGALES.join("\n");
    expect(pendientes).toContain("NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE");
    expect(pendientes).toContain("DOMICILIO DEL RESPONSABLE");
    expect(pendientes).toContain("CORREO ARCO"); // canal ARCO por escrito
    expect(pendientes).toContain("CORREO DE CONTACTO"); // el de los términos
    expect(pendientes).toContain("WHATSAPP DEL DIRECTORIO");
    expect(pendientes).toContain("FECHA DE PUBLICACIÓN");
    expect(pendientes).toContain("JURISDICCIÓN PARA CONTROVERSIAS");
  });

  it("el interruptor de borrador es exactamente 'queda algo pendiente'", () => {
    expect(HAY_PLACEHOLDERS_PENDIENTES).toBe(PLACEHOLDERS_LEGALES.length > 0);
    expect(TEXTO_MARCA_BORRADOR).toBe(
      "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.",
    );
  });

  // Scenario: los pendientes son verificables (repo público + LFPDPPP: nada
  // de datos reales ni inventados en el texto legal)
  it("el módulo no trae ningún correo, teléfono, URL ni domicilio inventado", () => {
    const sinPlaceholders = todoElTexto.replace(/\[[^\]]+\]/g, "");
    expect(sinPlaceholders).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(sinPlaceholders).not.toMatch(/\b\d{7,}\b/);
    expect(sinPlaceholders).not.toMatch(/wa\.me|whatsapp\.com|https?:\/\//);
    expect(sinPlaceholders).not.toMatch(/\bC\.?P\.?\s*\d|\bcalle\b|\bavenida\b/i);
  });
});

// Enmienda de la auditoría de seguridad (hallazgo MEDIO-1) · Scenario: los
// pendientes operativos también están declarados.
describe("paginas-legales · los pendientes operativos están declarados y no publicados", () => {
  it("cada pendiente dice qué se prometió, cómo se hace hoy y qué ticket lo resuelve", () => {
    expect(PENDIENTES_OPERATIVOS_LEGALES.length).toBeGreaterThan(0);
    for (const pendiente of PENDIENTES_OPERATIVOS_LEGALES) {
      expect(pendiente.compromiso.trim(), pendiente.ticket).not.toBe("");
      expect(pendiente.hoy.trim(), pendiente.ticket).not.toBe("");
      expect(pendiente.ticket, pendiente.compromiso).toMatch(/^E\d-\d/);
    }
    const tickets = PENDIENTES_OPERATIVOS_LEGALES.map((p) => p.ticket).join(" ");
    // El encargado del tratamiento que ADR-004 exige nombrar antes del
    // lanzamiento (change `preparar-deploy-produccion`).
    expect(tickets).toContain("E6-3");
  });

  // Scenario: el pendiente del flujo ARCO ya no aparece (change
  // `agregar-despublicar-y-borrado-arco`, T-015).
  //
  // "Ya no aparece" es exactamente lo que el panel ya sabe hacer: despublicar
  // y borrar. El renglón NO se retiró entero (hallazgo MEDIO 2 de la etapa C)
  // porque juntaba las cuatro letras de ARCO, y el panel sigue sin poder
  // atender el ACCESO ni la RECTIFICACIÓN, que el aviso también promete. Un
  // pendiente que se borra antes de estar resuelto es justo lo que esta lista
  // existe para evitar.
  it("despublicar y borrar ya no se declaran como pendientes", () => {
    const lista = PENDIENTES_OPERATIVOS_LEGALES.map(
      (pendiente) => `${pendiente.compromiso} ${pendiente.hoy}`,
    ).join(" ");
    // Ningún COMPROMISO pendiente puede ser ya despublicar o borrar.
    for (const pendiente of PENDIENTES_OPERATIVOS_LEGALES) {
      expect(pendiente.compromiso, pendiente.ticket).not.toMatch(
        /despublicar|borrar de forma definitiva|borrado definitivo/i,
      );
    }
    expect(lista).not.toContain("el panel solo aprueba y rechaza");
  });

  // Enmienda de la etapa C (MEDIO 2): lo que el panel todavía NO hace sigue
  // declarado, para que la revisión legal no concluya que ya no falta nada.
  it("el acceso y la rectificación siguen declarados como pendientes", () => {
    const arco = PENDIENTES_OPERATIVOS_LEGALES.find((pendiente) =>
      /acceso y rectificación/i.test(pendiente.compromiso),
    );
    expect(arco, "falta el pendiente de acceso y rectificación").toBeDefined();
    expect(arco!.hoy).toContain("a mano contra la base");
    // Y dice, para que nadie lo lea de más, qué parte SÍ quedó resuelta.
    expect(arco!.hoy).toMatch(/T-015/);
    expect(arco!.ticket).toMatch(/^E\d-\d/);
  });

  // Scenario: la purga ya no es un pendiente (change
  // `preparar-deploy-produccion`, T-013): el sistema la ejecuta sin
  // intervención humana, así que declararla como pendiente sería mentirle a la
  // revisión legal en el otro sentido.
  it("la purga de los rechazados a los 90 días ya no aparece como pendiente", () => {
    for (const pendiente of PENDIENTES_OPERATIVOS_LEGALES) {
      expect(pendiente.compromiso, pendiente.ticket).not.toMatch(/90 d[ií]as/i);
      expect(pendiente.hoy, pendiente.ticket).not.toMatch(/no hay purga/i);
    }
  });

  // Scenario: los pendientes operativos también están declarados (el nuevo).
  it("el encargado del tratamiento sin nombrar sí está declarado, con su ticket", () => {
    const encargado = PENDIENTES_OPERATIVOS_LEGALES.find((pendiente) =>
      /proveedores que hacen funcionar el sitio/i.test(pendiente.compromiso),
    );
    expect(encargado, "falta el pendiente del encargado del tratamiento").toBeDefined();
    expect(encargado!.hoy).toContain("ADR-004");
    expect(encargado!.ticket).toMatch(/^E6-3/);
  });

  it("no se publican en las páginas: el texto legal no cuenta el backlog", () => {
    for (const pendiente of PENDIENTES_OPERATIVOS_LEGALES) {
      expect(todoElTexto, pendiente.ticket).not.toContain(pendiente.hoy);
      expect(todoElTexto, pendiente.ticket).not.toContain(pendiente.ticket);
    }
    expect(todoElTexto).not.toMatch(/E3-6|E0-3|backlog|ticket/i);
  });

  it("y el aviso, en su lugar, dice que todo se atiende a mano y a petición", () => {
    expect(todoElTexto).toContain(
      "Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo.",
    );
    // Ninguna promesa de automatismo sobre los datos del titular.
    expect(todoElTexto).not.toMatch(/se borran? (solos?|automáticamente)|de forma automática/i);
  });
});

describe("paginas-legales · metadata declarada en el módulo", () => {
  it("cada documento tiene su título y su descripción, distintos entre sí", () => {
    for (const texto of [
      TITULO_AVISO_PRIVACIDAD,
      TITULO_TERMINOS,
      DESCRIPCION_AVISO_PRIVACIDAD,
      DESCRIPCION_TERMINOS,
    ]) {
      expect(texto.trim()).not.toBe("");
    }
    expect(TITULO_AVISO_PRIVACIDAD).not.toBe(TITULO_TERMINOS);
    expect(DESCRIPCION_AVISO_PRIVACIDAD).not.toBe(DESCRIPCION_TERMINOS);
  });
});
