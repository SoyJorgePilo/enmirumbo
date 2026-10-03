/**
 * La variante NATIVA del formulario de registro (change
 * `migrar-registro-astro`, design.md §2; tasks.md #10): sin hooks, pinta el
 * MISMO cuerpo que `FormularioRegistro` (el de Next y del modo edición) más
 * `autofocus` en el primer campo con error y la tabla `data-ejemplos`. Todo
 * ficticio.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvisoConsentimiento } from "../src/components/registro/aviso-consentimiento";
import { BotonEnviarVista } from "../src/components/registro/boton-enviar-vista";
import { CampoHoneypot } from "../src/components/registro/campo-honeypot";
import { FormularioRegistro } from "../src/components/registro/formulario-registro";
import {
  FormularioRegistroNativo,
  ejemplosPorCategoria,
} from "../src/components/registro/formulario-registro-nativo";
import { EJEMPLOS_QUE_OFRECES, EJEMPLO_QUE_OFRECES_GENERICO } from "../src/lib/registro/ejemplos";
import { MENSAJES_ERROR_REGISTRO, MENSAJES_ERROR_FOTO } from "../src/lib/registro/textos";
import { VALORES_VACIOS_REGISTRO, type EstadoAccionRegistro } from "../src/lib/registro/tipos";

const raiz = join(__dirname, "..");
const fuente = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

const CATEGORIAS = [
  { id: 2, nombre: "Servicios del hogar", slug: "servicios-del-hogar" },
  { id: 7, nombre: "Clubes y escuelas deportivas", slug: "clubes-y-escuelas-deportivas" },
];
const COLONIAS = [{ id: 12, nombre: "Haciendas de Tizayuca", slug: "haciendas-de-tizayuca" }];
const CON_ERRORES: EstadoAccionRegistro = {
  errores: {
    whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp,
    queOfreces: MENSAJES_ERROR_REGISTRO.queOfreces,
    foto: MENSAJES_ERROR_FOTO.noEsImagen,
  },
  valores: { ...VALORES_VACIOS_REGISTRO, nombre: "Fonda Ficticia <La Prueba>", categoriaId: "7", whatsapp: "77199", coloniaId: "12", entregaADomicilio: true },
};

const props = { categorias: CATEGORIAS, colonias: COLONIAS };
const nativo = (estado?: EstadoAccionRegistro, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(FormularioRegistroNativo, { action: "?_action=registrar", ...props, estado, ...extra }));
const deCliente = (estadoInicial?: EstadoAccionRegistro, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(FormularioRegistro, {
      ...props,
      honeypot: createElement(CampoHoneypot),
      aviso: createElement(AvisoConsentimiento),
      estadoInicial,
      ...extra,
    }),
  );

/** Lo que hay dentro del `<form>`, sin `data-ejemplos` ni `autofocus` (lo único que agrega la nativa). */
const cuerpo = (html: string) =>
  html
    // React agrega al de cliente su script de "repetir el envío" al hidratar.
    .replace(/<script>[\s\S]*<\/script>$/, "")
    .replace(/^<form[^>]*>/, "")
    .replace(/<\/form>$/, "")
    .replace(/ data-ejemplos="[^"]*"/, "")
    .replace(/ autofocus=""/g, "");

describe("registro · formulario nativo (sin hooks)", () => {
  it("pinta el mismo cuerpo que FormularioRegistro, al abrir y con errores, en registro y en edición", () => {
    for (const estado of [undefined, CON_ERRORES]) {
      expect(cuerpo(nativo(estado))).toBe(cuerpo(deCliente(estado)));
      expect(cuerpo(nativo(estado, { modo: "edicion", textoBoton: "Enviar cambios" }))).toBe(
        cuerpo(deCliente(estado, { modo: "edicion", textoBoton: "Enviar cambios" })),
      );
    }
  });

  it("es un POST multipart a su action, sin campos ocultos propios", () => {
    const html = nativo();
    const form = html.match(/^<form[^>]*>/)![0];
    for (const atributo of ['method="post"', 'enctype="multipart/form-data"', 'action="?_action=registrar"', 'class="flex flex-col gap-6"']) {
      // React escribe `encType` en camello; en HTML los atributos no distinguen mayúsculas.
      expect(form.toLowerCase()).toContain(atributo.toLowerCase());
    }
    const ocultos = [...html.matchAll(/<input type="hidden" name="([^"]+)"/g)].map((m) => m[1]);
    expect(ocultos).toEqual(["avisoVersion"]);
    expect(html).not.toContain("$ACTION");
  });

  it("autofocus solo en el primer campo con error, y en ninguno al abrir", () => {
    expect(nativo()).not.toContain("autofocus");
    const html = nativo(CON_ERRORES);
    expect(html.match(/autofocus=""/g)).toHaveLength(1);
    expect(html.split('id="whatsapp"')[1].split(">")[0]).toContain('autofocus=""');
    // Un error general no es un campo: no roba el foco.
    expect(nativo({ errores: { general: MENSAJES_ERROR_REGISTRO.servidor }, valores: VALORES_VACIOS_REGISTRO })).not.toContain("autofocus");
    // El consentimiento vive en el aviso, que no cambia: ahí no hay autofocus del servidor.
    expect(nativo({ errores: { consentimiento: MENSAJES_ERROR_REGISTRO.consentimiento }, valores: VALORES_VACIOS_REGISTRO })).not.toContain("autofocus");
    // Con la foto como único error, el foco va al campo de foto.
    const foto = nativo({ errores: { foto: MENSAJES_ERROR_FOTO.demasiadoGrande }, valores: VALORES_VACIOS_REGISTRO });
    expect(foto.split('id="foto"')[1].split(">")[0]).toContain('autofocus=""');
  });

  it("los valores capturados vuelven escapados, sin la foto ni la casilla", () => {
    const html = nativo(CON_ERRORES);
    expect(html).toContain('value="Fonda Ficticia &lt;La Prueba&gt;"');
    expect(html).not.toContain("<La Prueba>");
    expect(html).toContain('<option value="7" selected="">');
    expect(html.split('id="consentimiento"')[1].split(">")[0]).not.toContain("checked");
  });

  it("data-ejemplos: la tabla id → ejemplo que calcula el servidor, con el genérico en la clave vacía", () => {
    const tabla = JSON.parse(ejemplosPorCategoria(CATEGORIAS));
    expect(tabla).toEqual({
      "": EJEMPLO_QUE_OFRECES_GENERICO,
      "2": EJEMPLOS_QUE_OFRECES["servicios-del-hogar"],
      "7": EJEMPLOS_QUE_OFRECES["clubes-y-escuelas-deportivas"],
    });
    const select = nativo().split('id="categoriaId"')[1].split(">")[0];
    expect(select).toContain("data-ejemplos=");
    // El placeholder que pinta el servidor es el genérico, como en Next.
    expect(nativo(CON_ERRORES).split('id="queOfreces"')[1].split(">")[0]).toContain(`placeholder="${EJEMPLO_QUE_OFRECES_GENERICO}"`);
  });

  it("el botón en reposo, activo y con su texto", () => {
    const html = nativo();
    expect(html).toMatch(/<button type="submit" class="[^"]*">Registrar mi negocio<\/button>/);
    expect(renderToStaticMarkup(createElement(BotonEnviarVista, { texto: "Registrar mi negocio", enviando: true }))).toMatch(
      /<button type="submit" disabled="" class="[^"]*">Enviando...<\/button>/,
    );
  });

  it("ni el nativo, ni el cuerpo, ni la vista del botón usan hooks ni 'use client'", () => {
    for (const ruta of [
      "src/components/registro/formulario-registro-nativo.tsx",
      "src/components/registro/cuerpo-formulario-registro.tsx",
      "src/components/registro/boton-enviar-vista.tsx",
    ]) {
      const texto = fuente(ruta);
      expect(texto, ruta).not.toMatch(/["']use client["']/);
      expect(texto, ruta).not.toMatch(/\buse(State|Effect|ActionState|FormStatus)\s*\(/);
      expect(texto, ruta).not.toContain("@/app/");
    }
  });
});
