import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import RegistroPage from "../src/app/(publico)/registro/page";
import { FormularioRegistro } from "../src/components/registro/formulario-registro";
import {
  ACCEPT_FOTO,
  MENSAJES_ERROR_FOTO,
  TEXTO_CASILLA_SIN_FOTO,
  TEXTO_POLITICA_FOTO,
} from "../src/lib/registro/textos";
import { VALORES_VACIOS_REGISTRO } from "../src/lib/registro/tipos";
import { crearClientePrueba } from "./db";

/**
 * El campo de foto TAL COMO SE PINTA (etapa C del change
 * `agregar-foto-negocio`).
 *
 * Hueco que cubre esta suite: `tests/registro-pagina.test.ts` —que es quien
 * renderiza la página de registro de verdad— no se tocó en este change, así
 * que ningún test comprobaba sobre el HTML servido:
 *
 * - la etiqueta literal nº 11 del requirement "Campos obligatorios y
 *   opcionales del formulario" ("Foto de tu negocio (opcional)");
 * - la política del PRD §6.1 visible ANTES de elegir archivo, ni el `accept`
 *   que abre la galería del celular (scenario "elegir una foto desde el
 *   celular");
 * - la casilla "Dejar mi ficha sin foto" idéntica para todos (scenario "la
 *   casilla de quitar foto es igual para todos", que es una defensa contra un
 *   oráculo de "¿este número ya tiene ficha?");
 * - que el campo de archivo viaje dentro del único formulario de la página,
 *   que es lo que hace que llegue siquiera al servidor.
 *
 * Los textos literales se importan de `textos.ts`, así que si alguien los
 * cambia sin cambiar la spec, `registro-foto.test.ts` lo caza por el otro
 * lado (compara contra los .md) y esto lo caza por el del HTML.
 */

const raiz = join(__dirname, "..");
const normalizado = (html: string) => html.replace(/\s+/g, " ");

let htmlRegistro = "";

/** El `<input type="file">` del formulario, con todos sus atributos. */
function campoDeFoto(html: string): string {
  const desde = html.indexOf('id="foto"');
  expect(desde, "el formulario no pinta ningún campo con id=\"foto\"").toBeGreaterThan(-1);
  const inicio = html.lastIndexOf("<input", desde);
  return html.slice(inicio, html.indexOf(">", desde) + 1);
}

beforeAll(async () => {
  const prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.$disconnect();
  const pagina = await RegistroPage();
  htmlRegistro = renderToStaticMarkup(createElement(() => pagina));
});

describe("el campo de foto llega al HTML servido", () => {
  // Requirement "Campos obligatorios y opcionales del formulario": la etiqueta
  // nº 11 es literal y estaba sin comprobar sobre el render.
  it('muestra la etiqueta literal "Foto de tu negocio (opcional)"', () => {
    expect(normalizado(htmlRegistro)).toContain("Foto de tu negocio (opcional)");
  });

  it("la etiqueta está asociada al campo por su id", () => {
    expect(htmlRegistro).toContain('<label for="foto"');
    expect(htmlRegistro).toContain('id="foto"');
  });

  // El archivo solo llega al servidor si viaja en el ÚNICO formulario de la
  // página. (El `enctype` no se comprueba aquí a propósito: en un formulario
  // cuya `action` es una función, React lo fija él y sobrescribe el que se
  // ponga a mano — ver hallazgo M-3 de `reports/c-seguridad.md`.)
  it("el campo de archivo viaja dentro del único formulario de la página", () => {
    expect(htmlRegistro.match(/<form[\s>]/g)).toHaveLength(1);
    const form = htmlRegistro.slice(
      htmlRegistro.indexOf("<form"),
      htmlRegistro.indexOf("</form>"),
    );
    expect(form).toContain('id="foto"');
    expect(form).toContain('id="quitarFoto"');
  });

  // Scenario "elegir una foto desde el celular": el `accept` es lo que abre la
  // galería de imágenes en vez del explorador de archivos.
  it("es un campo de archivo de una sola imagen que abre la galería", () => {
    const campo = campoDeFoto(htmlRegistro);
    expect(campo).toContain('type="file"');
    expect(campo).toContain('name="foto"');
    expect(campo).toContain(`accept="${ACCEPT_FOTO}"`);
    // Una foto por ficha: nada de `multiple` en el marcado.
    expect(campo).not.toContain("multiple");
  });

  // La política se lee ANTES de elegir el archivo, no después de que rebote.
  it("la política del PRD §6.1 se ve, literal, antes del campo", () => {
    const html = normalizado(htmlRegistro);
    expect(html).toContain(TEXTO_POLITICA_FOTO);
    expect(html.indexOf(TEXTO_POLITICA_FOTO)).toBeLessThan(html.indexOf('id="foto"'));
  });

  it("el campo y su botón reservan área tocable de 44px", () => {
    const formulario = readFileSync(
      join(raiz, "src/components/registro/formulario-registro.tsx"),
      "utf8",
    );
    const bloque = formulario.slice(
      formulario.indexOf('id="foto"'),
      formulario.indexOf('id="quitarFoto"'),
    );
    expect(bloque).toMatch(/\bmin-h-11\b/); // el input
    expect(bloque).toMatch(/file:min-h-11\b/); // el botón que pinta el navegador
  });
});

describe("la casilla de quitar foto no delata si el número ya tenía ficha", () => {
  it('está siempre visible con el texto literal "Dejar mi ficha sin foto"', () => {
    expect(normalizado(htmlRegistro)).toContain(TEXTO_CASILLA_SIN_FOTO);
    expect(htmlRegistro).toContain('id="quitarFoto"');
    expect(htmlRegistro).toContain('name="quitarFoto"');
  });

  it("no viene marcada de fábrica: no borra una foto por descuido", () => {
    const campo = htmlRegistro.slice(
      htmlRegistro.lastIndexOf("<input", htmlRegistro.indexOf('id="quitarFoto"')),
      htmlRegistro.indexOf(">", htmlRegistro.indexOf('id="quitarFoto"')) + 1,
    );
    expect(campo).toContain('type="checkbox"');
    expect(campo).not.toContain("checked");
  });

  // Scenario "la casilla de quitar foto es igual para todos": el formulario no
  // recibe el número ni consulta nada, así que el bloque de la foto tiene que
  // salir idéntico en un formulario vacío y en uno que rebotó con errores. Si
  // alguna vez se personalizara ("quitar la foto que ya tenías"), el HTML
  // delataría qué números tienen ficha a quien pruebe uno por uno.
  it("el bloque de la foto es idéntico en un formulario vacío y en uno con errores", () => {
    const vacio = renderToStaticMarkup(
      createElement(FormularioRegistro, {
        categorias: [{ id: 1, nombre: "Comida", slug: "comida" }],
        colonias: [{ id: 1, nombre: "Huicalco", slug: "huicalco" }],
        honeypot: null,
        aviso: null,
        estadoInicial: { errores: {}, valores: VALORES_VACIOS_REGISTRO },
      }),
    );
    const conErrores = renderToStaticMarkup(
      createElement(FormularioRegistro, {
        categorias: [{ id: 1, nombre: "Comida", slug: "comida" }],
        colonias: [{ id: 1, nombre: "Huicalco", slug: "huicalco" }],
        honeypot: null,
        aviso: null,
        estadoInicial: {
          errores: { whatsapp: "Revisa tu número de WhatsApp: deben ser 10 dígitos" },
          valores: { ...VALORES_VACIOS_REGISTRO, whatsapp: "123" },
        },
      }),
    );

    const bloque = (html: string) =>
      html.slice(html.indexOf("Foto de tu negocio"), html.indexOf('id="quitarFoto"'));

    expect(bloque(vacio)).toBe(bloque(conErrores));
    // Y ninguno de los dos insinúa que exista una foto anterior.
    for (const html of [vacio, conErrores]) {
      expect(html).not.toContain("foto que ya");
      expect(html).not.toContain("foto actual");
      expect(html).not.toContain("tu foto anterior");
    }
  });

  // El campo de archivo no se puede repoblar: si el envío rebotó, el aviso de
  // la spec tiene que aparecer junto al campo y asociado a él.
  it("el aviso de reponer la foto se pinta junto al campo y se le asocia", () => {
    const html = renderToStaticMarkup(
      createElement(FormularioRegistro, {
        categorias: [{ id: 1, nombre: "Comida", slug: "comida" }],
        colonias: [{ id: 1, nombre: "Huicalco", slug: "huicalco" }],
        honeypot: null,
        aviso: null,
        estadoInicial: {
          errores: { foto: MENSAJES_ERROR_FOTO.demasiadoGrande },
          valores: VALORES_VACIOS_REGISTRO,
        },
      }),
    );

    expect(normalizado(html)).toContain(MENSAJES_ERROR_FOTO.demasiadoGrande);
    const campo = html.slice(
      html.lastIndexOf("<input", html.indexOf('id="foto"')),
      html.indexOf(">", html.indexOf('id="foto"')) + 1,
    );
    expect(campo).toContain('aria-invalid="true"');
    expect(campo).toContain('aria-describedby="foto-error"');
    expect(html).toContain('id="foto-error"');
    // Nunca se repuebla un campo de archivo (ningún navegador lo permite y
    // fingirlo sería mentirle al dueño sobre lo que va a enviar).
    expect(campo).not.toContain("value=");
  });
});

describe("el campo de foto no trajo JavaScript de cliente nuevo", () => {
  // Requirement "El registro funciona sin JavaScript de cliente": la foto
  // viaja en el envío normal, sin vista previa, recorte ni compresión.
  it("no hay handlers ni previsualización asociados al campo de archivo", () => {
    const formulario = readFileSync(
      join(raiz, "src/components/registro/formulario-registro.tsx"),
      "utf8",
    );
    const bloque = formulario.slice(
      formulario.indexOf("Foto de tu negocio"),
      formulario.indexOf("{aviso}"),
    );
    expect(bloque.length).toBeGreaterThan(0);
    for (const prohibido of [
      "onChange",
      "onInput",
      "URL.createObjectURL",
      "FileReader",
      "canvas",
      "useState",
      "useRef",
    ]) {
      expect(bloque, `el campo de foto no debe usar ${prohibido}`).not.toContain(prohibido);
    }
  });
});
