import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EVENTO_COMO_LLEGAR,
  EVENTO_LLAMAR,
  EVENTO_WHATSAPP_FICHA,
  EVENTO_WHATSAPP_TARJETA,
  VALOR_FUERA_DEL_CATALOGO,
  atributosDeEvento,
  type EventoDeContacto,
} from "../src/lib/analitica/eventos";

// Spec: layout-base · requirement "La medición no lleva datos personales ni el
// texto que escribe la gente"; directorio-publico · los eventos de la tarjeta
// y de la ficha (tasks.md #9 y #10).

const raiz = join(__dirname, "..");
const SLUG = /^[a-z0-9-]+$/;

describe("analitica · nombres de evento del contrato (tasks #9)", () => {
  it("son exactamente los cuatro del PRD §9, en slug", () => {
    expect(EVENTO_WHATSAPP_TARJETA).toBe("whatsapp-tarjeta");
    expect(EVENTO_WHATSAPP_FICHA).toBe("whatsapp-ficha");
    expect(EVENTO_LLAMAR).toBe("llamar");
    expect(EVENTO_COMO_LLEGAR).toBe("como-llegar");
  });

  // Scenario: los eventos de la ficha se distinguen de los de la tarjeta
  it("el WhatsApp de la tarjeta y el de la ficha son eventos distintos", () => {
    expect(EVENTO_WHATSAPP_TARJETA).not.toBe(EVENTO_WHATSAPP_FICHA);
  });
});

describe("analitica · armado de atributos (tasks #9)", () => {
  // Scenario: propiedades de un evento
  it("devuelve el nombre del evento y exactamente dos propiedades", () => {
    const atributos = atributosDeEvento(EVENTO_WHATSAPP_TARJETA, {
      categoriaSlug: "belleza",
      coloniaSlug: "haciendas-de-tizayuca",
    });
    expect(atributos).toEqual({
      "data-umami-event": "whatsapp-tarjeta",
      "data-umami-event-categoria": "belleza",
      "data-umami-event-colonia": "haciendas-de-tizayuca",
    });
    const propiedades = Object.keys(atributos).filter((clave) =>
      clave.startsWith("data-umami-event-"),
    );
    expect(propiedades).toHaveLength(2);
  });

  // Scenario: negocio con colonia "Otra" sin normalizar
  it.each([
    ["sin colonia", null],
    ["colonia indefinida", undefined],
    ["colonia vacía", ""],
    ["colonia de puros espacios", "   "],
    ["texto libre con espacios", "atrás del panteón viejo"],
    ["texto con acentos", "Fraccionamiento Los Sauces Imaginarios"],
    ["texto con signos", "calle 5 #12, ¿esquina?"],
  ])("con %s la colonia vale 'otra'", (_caso, colonia) => {
    const atributos = atributosDeEvento(EVENTO_WHATSAPP_FICHA, {
      categoriaSlug: "talleres",
      coloniaSlug: colonia as string | null | undefined,
    });
    expect(atributos["data-umami-event-colonia"]).toBe("otra");
    expect(VALOR_FUERA_DEL_CATALOGO).toBe("otra");
  });

  it("la misma regla protege a la categoría de cualquier texto raro", () => {
    const atributos = atributosDeEvento(EVENTO_LLAMAR, {
      categoriaSlug: "Restaurantes y fondas",
      coloniaSlug: "huicalco",
    });
    expect(atributos["data-umami-event-categoria"]).toBe("otra");
  });

  it("todos los valores son slugs: letras minúsculas, dígitos y guiones", () => {
    const casos = [
      { categoriaSlug: "servicios-del-hogar", coloniaSlug: "atempa" },
      { categoriaSlug: "clubes-y-escuelas-deportivas", coloniaSlug: null },
      { categoriaSlug: null, coloniaSlug: "  olmos-ampliacion-olmos  " },
      { categoriaSlug: "<script>alert(1)</script>", coloniaSlug: "7719995001" },
    ];
    const eventos: EventoDeContacto[] = [
      EVENTO_WHATSAPP_TARJETA,
      EVENTO_WHATSAPP_FICHA,
      EVENTO_LLAMAR,
      EVENTO_COMO_LLEGAR,
    ];
    for (const evento of eventos) {
      expect(evento).toMatch(SLUG);
      for (const caso of casos) {
        for (const valor of Object.values(atributosDeEvento(evento, caso))) {
          expect(valor, `${evento} · ${JSON.stringify(caso)}`).toMatch(SLUG);
        }
      }
    }
  });

  it("recorta los espacios de alrededor de un slug válido", () => {
    expect(
      atributosDeEvento(EVENTO_COMO_LLEGAR, {
        categoriaSlug: " talleres ",
        coloniaSlug: "\nhuicalco\n",
      }),
    ).toMatchObject({
      "data-umami-event-categoria": "talleres",
      "data-umami-event-colonia": "huicalco",
    });
  });
});

describe("analitica · el contrato vive en un solo archivo (tasks #10)", () => {
  it("solo `src/lib/analitica/eventos.ts` escribe el prefijo del proveedor", () => {
    const conElPrefijo = archivosDe(join(raiz, "src")).filter((ruta) =>
      readFileSync(ruta, "utf8").includes("data-umami-event"),
    );
    expect(conElPrefijo).toEqual([join(raiz, "src/lib/analitica/eventos.ts")]);
  });

  it("el módulo no toca la base ni el entorno: es puro", () => {
    const fuente = readFileSync(join(raiz, "src/lib/analitica/eventos.ts"), "utf8");
    expect(fuente).not.toContain("process.env");
    expect(fuente).not.toContain("prisma");
    expect(fuente).not.toMatch(/["']use client["']/);
  });
});

function archivosDe(dir: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "generated") continue;
      rutas.push(...archivosDe(ruta));
    } else if (/\.tsx?$/.test(entrada.name)) {
      rutas.push(ruta);
    }
  }
  return rutas;
}
