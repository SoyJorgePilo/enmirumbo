/**
 * `FormularioVerificarCodigo` con las dos formas de `action` (change
 * `migrar-verificacion-sms-astro`, design.md §1.3; tasks.md #8; spec
 * `plataforma-astro`, scenario "el diff no toca producto").
 *
 * - Con FUNCIONES (las Server Actions de Next) el HTML es idéntico, byte a
 *   byte, al de antes del change: `tests/fixtures/formulario-verificar-head/`
 *   se capturó del componente de HEAD (`696210d`) en las ocho combinaciones de
 *   errores, ANTES de tocarlo.
 * - Con TEXTO (las Actions de Astro, `"?_action=confirmar"`), cada `<form>`
 *   postea nativo a su Action, sin campos ocultos.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  FormularioVerificarCodigo,
  type ErrorFormularioVerificar,
  type ErrorReenvioVerificar,
} from "../src/components/registro/formulario-verificar-codigo";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const COMBINACIONES: Record<string, { errorCodigo?: ErrorFormularioVerificar; errorReenvio?: ErrorReenvioVerificar }> = {
  limpio: {},
  "error-incompleto": { errorCodigo: "incompleto" },
  "error-no-coincide": { errorCodigo: "no-coincide" },
  "error-vencido": { errorCodigo: "vencido" },
  "error-proveedor": { errorCodigo: "proveedor" },
  "reenvio-espera": { errorReenvio: "espera-reenvio" },
  "reenvio-cupo": { errorReenvio: "cupo" },
  ambos: { errorCodigo: "no-coincide", errorReenvio: "cupo" },
};

describe("FormularioVerificarCodigo", () => {
  it.each(Object.keys(COMBINACIONES))("con funciones (Next), %s: el mismo HTML que en HEAD, byte a byte", (nombre) => {
    const accion = async () => {};
    const html = renderToStaticMarkup(createElement(FormularioVerificarCodigo, { accionConfirmar: accion, accionReenviar: accion, ...COMBINACIONES[nombre] }));
    expect(`${html}\n`).toBe(readFileSync(path.join(raiz, "tests/fixtures/formulario-verificar-head", `${nombre}.html`), "utf8"));
    expect(html).not.toContain('method="post"');
  });

  it("con texto (Astro): cada formulario hace POST nativo a su Action, sin ocultos; el resto es el mismo HTML", () => {
    const html = renderToStaticMarkup(
      createElement(FormularioVerificarCodigo, { accionConfirmar: "?_action=confirmar", accionReenviar: "?_action=reenviar", errorCodigo: "no-coincide", errorReenvio: "cupo" }),
    );
    expect(html.match(/<form [^>]*>/g)).toEqual([
      '<form class="flex flex-col gap-3" action="?_action=confirmar" method="post">',
      '<form class="flex flex-col gap-2" action="?_action=reenviar" method="post">',
    ]);
    expect(html).not.toContain('type="hidden"');
    expect(html).not.toContain("<script");
    // Con funciones, React agrega su `<script>` de repetición de envíos; sin él, lo demás es igual.
    const sinForms = (h: string) => h.replace(/<form [^>]*>/g, "<form>").replace(/<script>[\s\S]*<\/script>$/, "");
    const conFunciones = readFileSync(path.join(raiz, "tests/fixtures/formulario-verificar-head/ambos.html"), "utf8").trimEnd();
    expect(sinForms(html)).toBe(sinForms(conFunciones));
  });
});
