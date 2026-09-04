import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { CATEGORIAS, COLONIAS, seedCatalogos } from "../prisma/seed";
import RegistroGraciasPage from "../src/app/(publico)/registro/gracias/page";
import RegistroPage from "../src/app/(publico)/registro/page";
import { AvisoConsentimiento } from "../src/components/registro/aviso-consentimiento";
import { BotonEnviar } from "../src/components/registro/boton-enviar";
import {
  FormularioRegistro,
  ORDEN_CAMPOS_PARA_FOCO,
  primerCampoConError,
} from "../src/components/registro/formulario-registro";
import { obtenerPrisma } from "../src/lib/prisma";
import {
  MENSAJES_ERROR_REGISTRO,
  MENSAJE_GRACIAS,
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_CONSENTIMIENTO,
  TEXTO_ENLACE_AVISO_INTEGRAL,
} from "../src/lib/registro/textos";
import { VALORES_VACIOS_REGISTRO } from "../src/lib/registro/tipos";
import { crearClientePrueba } from "./db";

// Spec: registro-negocio · requirements de página, campos, consentimiento,
// anti-abuso, estados del formulario y "funciona sin JavaScript".
// Los catálogos vienen de la base de prueba (misma DATABASE_URL), así que
// esto también prueba el cliente Prisma de aplicación (design.md §6).

const raiz = join(__dirname, "..");
const fuente = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");
const normalizado = (html: string) => html.replace(/\s+/g, " ");

let htmlRegistro = "";

beforeAll(async () => {
  const prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.$disconnect();
  const pagina = await RegistroPage();
  htmlRegistro = renderToStaticMarkup(createElement(() => pagina));
});

describe("registro-negocio · cliente Prisma de aplicación (design.md §6)", () => {
  it("reutiliza una sola instancia entre renders", () => {
    expect(obtenerPrisma()).toBe(obtenerPrisma());
  });

  it("la página lee los catálogos de la base, no de datos inventados", async () => {
    const categorias = await obtenerPrisma().categoria.findMany();
    expect(categorias).toHaveLength(CATEGORIAS.length);
    for (const categoria of categorias) {
      expect(htmlRegistro).toContain(`<option value="${categoria.id}"`);
    }
  });
});

describe("registro-negocio · página en una sola pantalla", () => {
  // Scenario: el dueño llega al registro desde la home
  it("tiene un solo h1 y un solo formulario", () => {
    expect(htmlRegistro.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlRegistro.match(/<form[\s>]/g)).toHaveLength(1);
    expect(htmlRegistro).toContain("Registra tu negocio gratis");
  });

  // Scenario: formulario vacío al abrir
  it("no trae ningún campo prellenado ni mensajes de error", () => {
    for (const valor of htmlRegistro.matchAll(/value="([^"]*)"/g)) {
      // Los únicos value con contenido son los de las <option> del catálogo.
      if (valor[1] === "") continue;
      expect(valor[0]).toMatch(/value="(\d+|otra)"/);
    }
    expect(htmlRegistro).not.toContain('role="alert"');
    expect(htmlRegistro).not.toContain('aria-invalid="true"');
  });

  // Scenario: formulario vacío al abrir (etiquetas literales de la spec)
  it.each([
    "¿Cómo se llama tu negocio?",
    "¿A qué se dedica?",
    "Tu WhatsApp (10 dígitos)",
    "¿En qué colonia estás?",
    "¿Qué ofreces? (opcional)",
    "¿Haces entregas o vas a domicilio? (opcional)",
    "Teléfono fijo (opcional)",
    "Dirección o referencias (opcional)",
    "Horario (opcional)",
    "Link de tu Facebook (opcional)",
  ])('muestra la etiqueta literal "%s"', (etiqueta) => {
    expect(normalizado(htmlRegistro)).toContain(etiqueta);
  });

  // Scenario: listas cerradas del catálogo
  it("ofrece las 8 categorías y las 21 colonias del catálogo, más 'Otra'", () => {
    for (const nombre of CATEGORIAS) expect(htmlRegistro).toContain(`>${nombre}<`);
    for (const nombre of COLONIAS) {
      expect(htmlRegistro).toContain(`>${nombre.replace(/\//g, "/")}<`);
    }
    // "Otra" va al final de la lista de colonias
    const selectColonias = htmlRegistro.split('id="coloniaId"')[1].split("</select>")[0];
    expect(selectColonias.trimEnd().endsWith('<option value="otra">Otra</option>')).toBe(
      true,
    );
  });
});

describe("registro-negocio · accesibilidad del formulario", () => {
  // Scenario: errores anunciados (parte de etiquetas asociadas)
  it("cada etiqueta apunta a un control que existe", () => {
    const fores = [...htmlRegistro.matchAll(/<label for="([^"]+)"/g)].map((m) => m[1]);
    expect(fores.length).toBeGreaterThanOrEqual(11);
    for (const id of fores) {
      expect(htmlRegistro).toMatch(new RegExp(`id="${id}"`));
    }
  });

  // Scenario: teclado numérico
  it("el campo de WhatsApp pide teclado numérico", () => {
    const campo = htmlRegistro.split('id="whatsapp"')[1].split(">")[0];
    expect(campo.toLowerCase()).toContain('inputmode="numeric"');
    expect(htmlRegistro).toMatch(/<input type="tel" id="whatsapp"/);
  });

  // Scenario: mobile-first a 390px (área táctil ≥44px = min-h-11 de Tailwind)
  it("los controles tocables reservan al menos 44px", () => {
    const formulario = fuente("src/components/registro/formulario-registro.tsx");
    const aviso = fuente("src/components/registro/aviso-consentimiento.tsx");
    const boton = fuente("src/lib/estilos-boton.ts");
    // py-3 sobre texto base ⇒ 24 + 12 + 12 = 48px de alto en inputs y selects
    expect(formulario).toMatch(/\bpy-3\b/);
    expect(formulario).toMatch(/\bmin-h-11\b/); // checkbox de entregas
    expect(aviso).toMatch(/\bmin-h-11\b/); // checkbox de consentimiento
    expect(boton).toMatch(/\bmin-h-11\b/);
  });
});

describe("registro-negocio · consentimiento y aviso simplificado", () => {
  const htmlAviso = renderToStaticMarkup(createElement(AvisoConsentimiento));

  // Scenario: aviso visible sin salir del formulario
  it("el aviso simplificado se lee dentro del formulario, con el texto literal", () => {
    expect(normalizado(htmlRegistro)).toContain(TEXTO_AVISO_PRIVACIDAD);
    expect(normalizado(htmlRegistro)).toContain(TEXTO_CONSENTIMIENTO);
  });

  // Scenario: el aviso simplificado avisa que el WhatsApp y el teléfono
  // quedan públicos (E1-6 / hallazgo M3 de T-004). El literal está COPIADO de
  // `openspec/changes/agregar-paginas-legales/specs/registro-negocio/spec.md`:
  // si alguien cambia el copy sin cambiar la spec, esta suite lo caza.
  it("advierte, carácter por carácter, que los datos quedan a la vista", () => {
    expect(TEXTO_AVISO_PRIVACIDAD).toBe(
      "Aviso de privacidad (resumen): NecesitoUno Tizayuca usa los datos que escribes aquí para revisar tu negocio, contactarte por WhatsApp y publicar tu ficha en el directorio. Ojo con esto: si publicamos tu ficha, el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo. Publicamos tu colonia, no tu domicilio exacto, salvo que tú escribas la dirección. No vendemos ni compartimos tus datos con nadie más. Puedes pedirnos que corrijamos o borremos tu ficha cuando quieras, por el mismo WhatsApp con el que te contactemos; lo atendemos en máximo 20 días hábiles.",
    );
    expect(normalizado(htmlRegistro)).toContain(
      "el nombre de tu negocio, tu WhatsApp, tu teléfono fijo y lo demás que escribas quedan a la vista de cualquiera que entre al directorio, con botones para escribirte o marcarte directo",
    );
  });

  // Scenario: enlace al aviso integral (MODIFIED por `agregar-paginas-legales`:
  // antes este caso exigía cero enlaces, porque la página no existía)
  it("enlaza al aviso integral en la misma pestaña y ya no promete el enlace", () => {
    const enlaces = [...htmlAviso.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0][2].replace(/<[^>]+>/g, "").trim()).toBe(
      TEXTO_ENLACE_AVISO_INTEGRAL,
    );
    expect(TEXTO_ENLACE_AVISO_INTEGRAL).toBe("Lee el aviso de privacidad completo");
    expect(enlaces[0][1]).toContain('href="/aviso-de-privacidad"');
    expect(enlaces[0][1]).not.toContain("target="); // misma pestaña
    expect(enlaces[0][1]).toContain("min-h-11"); // área táctil ≥44px
    // El único enlace de toda la página de registro es ese.
    expect([...htmlRegistro.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "/aviso-de-privacidad",
    ]);
    // Y la frase que reservaba el hueco ya no aparece en ningún lado.
    for (const texto of [htmlAviso, htmlRegistro, TEXTO_AVISO_PRIVACIDAD]) {
      expect(texto).not.toContain(
        "Cuando publiquemos el aviso completo, aquí va a estar el enlace.",
      );
    }
  });

  it("el checkbox del consentimiento es obligatorio y no viene marcado", () => {
    const checkbox = htmlRegistro.split('id="consentimiento"')[1].split(">")[0];
    expect(checkbox).toContain('required=""');
    expect(checkbox).not.toContain("checked");
  });
});

describe("registro-negocio · campo trampa (honeypot)", () => {
  // Scenario: el honeypot no molesta a las personas
  it("está fuera de pantalla, no es enfocable ni se anuncia, y no se autocompleta", () => {
    const contenedor = htmlRegistro.split('aria-hidden="true"')[1].split("</div>")[0];
    expect(contenedor).toContain('id="sitio_web"');
    expect(contenedor).toContain('tabindex="-1"');
    expect(contenedor.toLowerCase()).toContain('autocomplete="off"');
    expect(htmlRegistro).toMatch(/left-\[-9999px\]/);
  });
});

describe("registro-negocio · estado de error por campo", () => {
  const valores = {
    ...VALORES_VACIOS_REGISTRO,
    nombre: "Plomería Ficticia El Tubo Feliz",
    categoriaId: "2",
    whatsapp: "no tengo",
    coloniaId: "12",
    queOfreces: "plomería y destapes",
    entregaADomicilio: true,
    horario: "L-S 9am-7pm",
  };
  const htmlConErrores = renderToStaticMarkup(
    createElement(FormularioRegistro, {
      categorias: [{ id: 2, nombre: "Servicios del hogar", slug: "servicios-del-hogar" }],
      colonias: [{ id: 12, nombre: "Haciendas de Tizayuca", slug: "haciendas-de-tizayuca" }],
      honeypot: null,
      aviso: null,
      estadoInicial: {
        errores: { whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp },
        valores,
      },
    }),
  );

  // Scenario: errores anunciados
  it("asocia el mensaje al campo para los lectores de pantalla", () => {
    const campo = htmlConErrores.split('id="whatsapp"')[1].split(">")[0];
    expect(campo).toContain('aria-invalid="true"');
    expect(campo).toContain('aria-describedby="whatsapp-error"');
    expect(htmlConErrores).toContain('id="whatsapp-error"');
    expect(normalizado(htmlConErrores)).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
  });

  // Scenario: no se pierde lo capturado
  it("vuelve a pintar todo lo capturado, menos el checkbox de consentimiento", () => {
    expect(htmlConErrores).toContain('value="Plomería Ficticia El Tubo Feliz"');
    expect(htmlConErrores).toContain('value="no tengo"');
    expect(htmlConErrores).toContain('value="L-S 9am-7pm"');
    expect(htmlConErrores).toContain(">plomería y destapes</textarea>");
    // categoría y colonia elegidas siguen seleccionadas
    expect(htmlConErrores).toContain('<option value="2" selected="">');
    expect(htmlConErrores).toContain('<option value="12" selected="">');
    // el checkbox de entregas conserva su marca; el de consentimiento vive en
    // el bloque del aviso y siempre vuelve sin marcar
    expect(htmlConErrores.split('id="entregaADomicilio"')[1].split(">")[0]).toContain(
      'checked=""',
    );
  });

  // Scenario: obligatorios vacíos (foco en el primero)
  it("el orden de búsqueda del foco es el mismo que el de la pantalla", () => {
    const enPantalla = [...htmlRegistro.matchAll(/ id="([a-zA-Z]+)"/g)]
      .map((m) => m[1])
      .filter((id) => (ORDEN_CAMPOS_PARA_FOCO as readonly string[]).includes(id));
    expect(enPantalla).toEqual([...ORDEN_CAMPOS_PARA_FOCO]);
  });

  // Scenario: errores anunciados (el foco va al PRIMER campo con error).
  // La elección del campo es una función pura; lo único que queda sin
  // automatizar es la llamada a `.focus()`, que necesita navegador.
  it("elige el primer campo con error según el orden de la pantalla", () => {
    expect(
      primerCampoConError({
        whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp,
        nombre: MENSAJES_ERROR_REGISTRO.nombre,
        consentimiento: MENSAJES_ERROR_REGISTRO.consentimiento,
      }),
    ).toBe("nombre");

    // Un opcional va antes que el consentimiento, que se pinta al final
    expect(
      primerCampoConError({
        consentimiento: MENSAJES_ERROR_REGISTRO.consentimiento,
        queOfreces: MENSAJES_ERROR_REGISTRO.queOfreces,
      }),
    ).toBe("queOfreces");

    expect(primerCampoConError({})).toBeUndefined();
    // El error general no es un campo enfocable: no roba el foco
    expect(
      primerCampoConError({ general: MENSAJES_ERROR_REGISTRO.servidor }),
    ).toBeUndefined();
  });

  it("el error general se pinta arriba de todo", () => {
    const conFalla = renderToStaticMarkup(
      createElement(FormularioRegistro, {
        categorias: [],
        colonias: [],
        honeypot: null,
        aviso: null,
        estadoInicial: {
          errores: { general: MENSAJES_ERROR_REGISTRO.servidor },
          valores: VALORES_VACIOS_REGISTRO,
        },
      }),
    );
    expect(normalizado(conFalla)).toContain(MENSAJES_ERROR_REGISTRO.servidor);
    expect(conFalla.indexOf("general-error")).toBeLessThan(conFalla.indexOf("nombre"));
  });
});

describe("registro-negocio · estado enviando", () => {
  // Scenario: estado enviando
  it("fuera de un envío el botón está activo con su texto normal", () => {
    const html = renderToStaticMarkup(createElement(BotonEnviar));
    expect(html).toContain("Registrar mi negocio");
    expect(html).not.toContain('disabled=""'); // "disabled:" del class sí puede estar
  });

  it("durante el envío muestra 'Enviando...' y se deshabilita (useFormStatus)", () => {
    const boton = fuente("src/components/registro/boton-enviar.tsx");
    expect(boton).toContain("useFormStatus");
    expect(boton).toMatch(/disabled=\{pending\}/);
    expect(boton).toMatch(/pending \? "Enviando\.\.\."/);
  });
});

describe("registro-negocio · el registro funciona sin JavaScript de cliente", () => {
  // Scenario: JS acotado al campo del ejemplo
  it('solo el formulario y el botón declaran "use client"', () => {
    const conUseClient = [
      "src/app/(publico)/registro/page.tsx",
      "src/app/(publico)/registro/gracias/page.tsx",
      "src/components/registro/aviso-consentimiento.tsx",
      "src/components/registro/campo-honeypot.tsx",
      "src/components/registro/formulario-registro.tsx",
      "src/components/registro/boton-enviar.tsx",
    ].filter((ruta) => /["']use client["']/.test(fuente(ruta)));

    expect(conUseClient).toEqual([
      "src/components/registro/formulario-registro.tsx",
      "src/components/registro/boton-enviar.tsx",
    ]);
  });

  // Scenario: envío sin JS · el <form> apunta a la Server Action, no a un fetch
  it("el envío es un <form> con Server Action, sin onSubmit ni fetch", () => {
    const formulario = fuente("src/components/registro/formulario-registro.tsx");
    expect(formulario).toContain("<form action={accionFormulario}");
    expect(formulario).not.toMatch(/onSubmit|fetch\(|preventDefault/);
  });

  // Scenario: el ejemplo cambia al cambiar de categoría (sin borrar lo escrito)
  it("los campos son no controlados: cambiar de categoría no borra lo escrito", () => {
    const formulario = fuente("src/components/registro/formulario-registro.tsx");
    expect(formulario).toContain('name="queOfreces"');
    expect(formulario).not.toMatch(/value=\{valores\./); // defaultValue, no value
    expect(formulario).toMatch(/placeholder=\{ejemplo\}/);
  });
});

// ADDED por el change `agregar-analitica-cookieless` · spec registro-negocio,
// requirements "El embudo del registro se mide con las vistas de sus dos
// pantallas" y "Ningún dato del formulario viaja a la medición" (tasks.md #19).
describe("registro-negocio · el embudo se mide con vistas, no con eventos", () => {
  const htmlGraciasMedicion = renderToStaticMarkup(
    createElement(RegistroGraciasPage),
  );

  // Scenario: sin instrumentación en el botón
  it('el botón "Enviar" no lleva ningún atributo de evento', () => {
    const html = renderToStaticMarkup(createElement(BotonEnviar));
    expect(html).toContain("Registrar mi negocio");
    expect(html).not.toContain("data-umami");
    expect(fuente("src/components/registro/boton-enviar.tsx")).not.toContain("analitica");
  });

  it("ninguna de las dos pantallas del registro instrumenta nada", () => {
    for (const html of [htmlRegistro, htmlGraciasMedicion]) {
      expect(html).not.toContain("data-umami");
      expect(html).not.toContain("umami");
      // Tampoco el script: lo pone el layout del grupo público, no la página.
      expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
    }
    for (const ruta of [
      "src/app/(publico)/registro/page.tsx",
      "src/app/(publico)/registro/gracias/page.tsx",
      "src/components/registro/formulario-registro.tsx",
      "src/components/registro/boton-enviar.tsx",
      "src/components/registro/campo-honeypot.tsx",
      "src/components/registro/aviso-consentimiento.tsx",
    ]) {
      expect(fuente(ruta), ruta).not.toContain("analitica");
      expect(fuente(ruta), ruta).not.toContain("umami");
    }
  });

  // Scenario: las URLs del registro no llevan datos
  it("las dos pantallas viven en URLs sin parámetros", () => {
    // El formulario envía con Server Action (POST a la misma URL) y la página
    // de gracias es una ruta fija: ninguna de las dos arma una URL con datos.
    const formulario = fuente("src/components/registro/formulario-registro.tsx");
    expect(formulario).not.toMatch(/\/registro\?[^"']/);
    expect(fuente("src/app/(publico)/registro/accion.ts")).toContain(
      '"/registro/gracias"',
    );
  });
});

describe("registro-negocio · pantalla de gracias", () => {
  const htmlGracias = renderToStaticMarkup(createElement(RegistroGraciasPage));

  // Scenario: registro exitoso (mensaje literal del PRD §6.1)
  it("muestra el mensaje literal del PRD", () => {
    expect(normalizado(htmlGracias)).toContain(MENSAJE_GRACIAS);
  });

  // Scenario: recarga tras el éxito
  it("no tiene ningún formulario que se pueda reenviar al recargar", () => {
    expect(htmlGracias).not.toMatch(/<form[\s>]/);
  });
});
