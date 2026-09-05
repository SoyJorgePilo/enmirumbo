import { describe, expect, it } from "vitest";

import {
  MENSAJE_WHATSAPP_PRELLENADO,
  construirEnlaceComoLlegar,
  construirEnlaceTelefono,
  construirEnlaceWhatsapp,
  obtenerPaginaRegistrada,
} from "../src/lib/enlaces";
import {
  construirSegmentoFicha,
  extraerIdDeSegmentoFicha,
} from "../src/lib/ficha-url";

// Spec: directorio-publico · requirements "Ficha de negocio en URL propia..."
// y "Botones de contacto de la ficha con el WhatsApp como acción principal".
// tasks.md #3 y #4 · design.md §2 y §4.

describe("directorio-publico · URL de la ficha (tasks #3)", () => {
  // Scenario: enlace viejo tras un cambio de nombre (la parte legible es
  // decorativa; lo que resuelve es el identificador).
  it("arma <nombre-en-slug>-<id> y devuelve el id de vuelta", () => {
    const segmento = construirSegmentoFicha("Plomería Hermanos Rosales", "abc123");
    expect(segmento).toBe("plomeria-hermanos-rosales-abc123");
    expect(extraerIdDeSegmentoFicha(segmento)).toBe("abc123");
  });

  it("un nombre con acentos y signos sigue dando la vuelta completa", () => {
    const segmento = construirSegmentoFicha("Café & Té ¡El Rincón!", "xyz789");
    expect(segmento).toBe("cafe-te-el-rincon-xyz789");
    expect(extraerIdDeSegmentoFicha(segmento)).toBe("xyz789");
  });

  it("un nombre que se queda vacío al slugificarse deja solo el identificador", () => {
    const segmento = construirSegmentoFicha("¿¡...!?", "soloid1");
    expect(segmento).toBe("soloid1");
    expect(extraerIdDeSegmentoFicha(segmento)).toBe("soloid1");
  });

  it("un segmento sin guiones se toma completo como identificador", () => {
    expect(extraerIdDeSegmentoFicha("abc123")).toBe("abc123");
  });

  it("un segmento sin identificador no resuelve nada", () => {
    expect(extraerIdDeSegmentoFicha("")).toBeNull();
    expect(extraerIdDeSegmentoFicha("plomeria-")).toBeNull();
    expect(extraerIdDeSegmentoFicha("-")).toBeNull();
  });
});

describe("directorio-publico · enlace de WhatsApp (tasks #4)", () => {
  // Requirement (ADDED por T-019) "El mensaje prellenado del WhatsApp nombra
  // al directorio con la marca vigente".
  it("usa el mensaje prellenado aprobado, tal cual", () => {
    expect(MENSAJE_WHATSAPP_PRELLENADO).toBe(
      "Hola, te vi en EnMiRumbo. ¿Me das informes?",
    );
    expect(MENSAJE_WHATSAPP_PRELLENADO).not.toMatch(/necesitouno/i);
    expect(MENSAJE_WHATSAPP_PRELLENADO).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });

  // Scenarios "el vecino escribe desde una tarjeta del listado" y "el vecino
  // escribe desde la ficha": es el MISMO mensaje porque se declara una sola
  // vez. Las cuatro superficies (tarjeta del listado, giro, resultados y
  // ficha) arman su enlace con `construirEnlaceWhatsapp`, así que no hay dos
  // literales que se puedan desincronizar.
  it("las superficies del directorio arman el enlace con la única función que lo sabe", async () => {
    const { readFileSync } = await import("node:fs");
    const superficies = [
      "src/components/directorio/lista-negocios.tsx",
      "src/app/(publico)/negocio/[ficha]/page.tsx",
      "src/app/(publico)/buscar/page.tsx",
    ];
    for (const ruta of superficies) {
      const fuente = readFileSync(ruta, "utf8");
      expect(fuente, ruta).toContain("construirEnlaceWhatsapp");
      // Ninguna se escribe su propio mensaje.
      expect(fuente, ruta).not.toContain("¿Me das informes?");
    }
  });

  it("el mensaje no lleva ningún dato del vecino", () => {
    // Es una constante: no interpola nada y no puede recibir nada.
    expect(typeof MENSAJE_WHATSAPP_PRELLENADO).toBe("string");
    expect(MENSAJE_WHATSAPP_PRELLENADO).not.toMatch(/[$«{]/);
  });

  it("normaliza un número guardado con formato raro antes de armar el enlace", () => {
    const esperado = `https://wa.me/527711234567?text=${encodeURIComponent(
      MENSAJE_WHATSAPP_PRELLENADO,
    )}`;
    expect(construirEnlaceWhatsapp("+52 (771) 123-4567")).toBe(esperado);
    expect(construirEnlaceWhatsapp("7711234567")).toBe(esperado);
    expect(construirEnlaceWhatsapp("521 771 123 4567")).toBe(esperado);
  });

  it("un número que no se puede normalizar no arma un enlace inventado", () => {
    expect(construirEnlaceWhatsapp("no tengo")).toBeNull();
    expect(construirEnlaceWhatsapp("123")).toBeNull();
  });
});

// Hallazgo M2 de la etapa C: el `tel:` se armaba con el valor crudo de la
// base. El fijo solo tiene cota de longitud en el registro, así que puede
// traer texto, secuencias de marcación (`*21*…#` desvía llamadas) o HTML.
describe("directorio-publico · enlace de llamada (hallazgo M2)", () => {
  it("normaliza el fijo a los 10 dígitos nacionales, venga como venga", () => {
    for (const guardado of [
      "7717775009",
      "771 777 50 09",
      "(771) 777-5009",
      "+52 771 777 5009",
      "52 771 777 5009",
      "521 771 777 5009",
      " 771.777.5009 ",
    ]) {
      expect(construirEnlaceTelefono(guardado), guardado).toBe("tel:+527717775009");
    }
  });

  it("un fijo que no da 10 dígitos no genera enlace", () => {
    for (const guardado of [
      "",
      "   ",
      "771777500", // nueve dígitos
      "77177750091", // once
      "no tengo",
      "800 TELMEX",
      "*21*5512345678#", // secuencia de desvío de llamadas
      '"><script>alert("xss-tel")</script>',
      "771 777 5009 ext. 12", // extensión: hoy no se puede marcar sola
    ]) {
      expect(construirEnlaceTelefono(guardado), guardado).toBeNull();
    }
    expect(construirEnlaceTelefono(null)).toBeNull();
    expect(construirEnlaceTelefono(undefined)).toBeNull();
  });

  it("el enlace nunca lleva nada fuera de los dígitos normalizados", () => {
    const enlace = construirEnlaceTelefono("77(1)-777 5009#*")!;
    expect(enlace).toBe("tel:+527717775009");
    expect(enlace).not.toMatch(/[#*()\s]/);
  });
});

describe("directorio-publico · enlace 'Cómo llegar' (tasks #4)", () => {
  // Scenario: "Cómo llegar" abre el mapa con lo que capturó el negocio
  it("busca la referencia con su colonia y Tizayuca, Hidalgo", () => {
    const enlace = construirEnlaceComoLlegar(
      "a un lado de la primaria",
      "Huicalco",
    );
    expect(enlace).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(
          "a un lado de la primaria, Huicalco, Tizayuca, Hidalgo",
        ),
    );
    // Acentos y espacios codificados: nada de URLs rotas.
    expect(construirEnlaceComoLlegar("Calle Morelos s/n", "Olmos / Ampliación Olmos")).toContain(
      encodeURIComponent("Calle Morelos s/n, Olmos / Ampliación Olmos, Tizayuca, Hidalgo"),
    );
  });

  it("sin dirección capturada no hay enlace", () => {
    expect(construirEnlaceComoLlegar("", "Huicalco")).toBeNull();
    expect(construirEnlaceComoLlegar("   ", "Huicalco")).toBeNull();
  });
});

describe("directorio-publico · página registrada por el negocio (hallazgo M4)", () => {
  // Scenario: el enlace a la página registrada no promete Facebook
  it("muestra el dominio real, sea o no de Facebook", () => {
    expect(obtenerPaginaRegistrada("https://m.facebook.com/x")).toEqual({
      href: "https://m.facebook.com/x",
      dominio: "m.facebook.com",
    });
    expect(obtenerPaginaRegistrada("https://mi-negocio.example/perfil")).toEqual({
      href: "https://mi-negocio.example/perfil",
      dominio: "mi-negocio.example",
    });
  });

  it("delata el homógrafo que el registro normalizó a punycode", () => {
    expect(obtenerPaginaRegistrada("https://xn--facebok-ejg.com/x")?.dominio).toBe(
      "xn--facebok-ejg.com",
    );
  });

  it("una cadena que no es URL no pinta enlace", () => {
    expect(obtenerPaginaRegistrada("no es una url")).toBeNull();
    expect(obtenerPaginaRegistrada("")).toBeNull();
  });

  it("solo http(s): un esquema ejecutable nunca se pinta", () => {
    expect(obtenerPaginaRegistrada("javascript:alert(1)")).toBeNull();
    expect(obtenerPaginaRegistrada("data:text/html,<script>0</script>")).toBeNull();
  });
});
