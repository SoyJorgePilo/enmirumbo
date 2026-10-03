// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://enmirumbo.example/editar/ficticio", "settings": {"disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true}}
/**
 * Etapa C (seguridad) del change `migrar-enlace-gestion-astro`: lo que las
 * pruebas del DOM de la edición no cubrían del módulo generalizado.
 *
 * - Con la configuración de la EDICIÓN (no solo la de `/registro`), vencido el
 *   tiempo de espera no se reenvía nada (V1 de 3b-1) y no se navega.
 * - La configuración sale del formulario del enlace aunque el documento tenga
 *   otro formulario antes (p. ej. un buscador en el encabezado); si el primer
 *   `<form>` no es el del enlace, no se mejora nada (falla cerrada).
 * - Un 200 que termina en la confirmación de OTRO token o en la misma ruta con
 *   consulta distinta no navega; la 404 de otra ruta no recarga.
 *
 * Todo ficticio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { configDeEdicion, mejorarFormularioDeEdicion } from "../src/astro/gestion-cliente";
import { ESPERA_MAXIMA_DEL_ENVIO_MS, decidirTrasEnvio, type VentanaDelRegistro } from "../src/astro/registro-cliente";
import { ERROR_GUARDAR_EDICION } from "../src/lib/gestion/textos";

const ORIGEN = "https://enmirumbo.example";
const T = "Tok3n_Ficticio-de-la-etapa-C_0123456789abcd".slice(0, 43);

function montar(antes = "") {
  document.body.innerHTML = `${antes}<form method="post" action="/editar/${T}?_action=editar" enctype="multipart/form-data">
    <select id="categoriaId" name="categoriaId" data-ejemplos='{"":"genérico"}'><option value="1" selected>Uno</option></select>
    <textarea id="queOfreces" name="queOfreces"></textarea>
    <input id="horario" name="horario" value="L-V">
    <button type="submit">Enviar cambios</button></form>`;
}

function ventana(fetch: VentanaDelRegistro["fetch"]) {
  const assign = vi.fn();
  return {
    assign,
    falsa: {
      fetch,
      FormData: window.FormData as unknown as typeof FormData,
      DOMParser: window.DOMParser as unknown as typeof DOMParser,
      location: { origin: ORIGEN, assign },
    } as VentanaDelRegistro,
  };
}

const enviar = () => document.querySelector(`form[action*="_action=editar"]`)!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

let quitar: () => void = () => {};
afterEach(() => {
  quitar();
  quitar = () => {};
  vi.useRealTimers();
});

describe("C · mejora de la edición: tiempo de espera", () => {
  it("vencido el tiempo: UNA sola petición, sin navegar, el error de la edición y lo capturado", async () => {
    vi.useFakeTimers();
    montar();
    let llamadas = 0;
    const { falsa, assign } = ventana((() => {
      llamadas++;
      return new Promise<Response>(() => {});
    }) as typeof fetch);
    quitar = mejorarFormularioDeEdicion(document, falsa);
    (document.getElementById("horario") as HTMLInputElement).value = "lo capturado";
    enviar();
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DEL_ENVIO_MS + 1);
    expect(document.getElementById("general-error")?.textContent).toBe(`⚠ ${ERROR_GUARDAR_EDICION}`);
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DEL_ENVIO_MS * 3);
    expect(llamadas).toBe(1);
    expect(assign).not.toHaveBeenCalled();
    expect((document.getElementById("horario") as HTMLInputElement).value).toBe("lo capturado");
  });
});

describe("C · mejora de la edición: de dónde sale la configuración", () => {
  it("si el primer <form> del documento no es el del enlace (un buscador antes), no se mejora: el envío es el nativo", () => {
    montar(`<form action="/buscar" method="get"><input name="q"></form>`);
    const fetch = vi.fn();
    const { falsa } = ventana(fetch as unknown as typeof fetch);
    quitar = mejorarFormularioDeEdicion(document, falsa);
    expect(enviar()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("configDeEdicion: solo /editar/<segmento>; nada con barra final, subrutas, otro prefijo o protocolo raro", () => {
    for (const accion of [
      `${ORIGEN}/editar/${T}/?_action=editar`,
      `${ORIGEN}/editar/${T}/gracias?_action=editar`,
      `${ORIGEN}//editar/${T}?_action=editar`,
      `${ORIGEN}/EDITAR/${T}?_action=editar`,
      `javascript:alert(1)//editar/${T}`,
      `${ORIGEN}/editar/%2F%2Fevil.example`,
      "",
    ]) {
      expect(configDeEdicion(accion, ERROR_GUARDAR_EDICION), accion).toBeNull();
    }
  });

  it("un 200 en la confirmación de otro token o con consulta/fragmento extra en otra ruta no navega; la 404 de otra ruta no recarga", () => {
    const config = configDeEdicion(`${ORIGEN}/editar/${T}?_action=editar`, ERROR_GUARDAR_EDICION)!;
    const otro = `${T.slice(0, 42)}X`;
    const casos: Array<[number, string]> = [
      [200, `${ORIGEN}/editar/${otro}/gracias`],
      [200, `${ORIGEN}/editar/${T}/gracias/`],
      [200, `${ORIGEN}/editar/${T}/gracias/../../${otro}/gracias`],
      [200, `${ORIGEN.replace("https", "http")}/editar/${T}/gracias`],
      [404, `${ORIGEN}/editar/${otro}`],
      [404, `${ORIGEN}/registro`],
    ];
    for (const [status, url] of casos) {
      const decision = decidirTrasEnvio({ status, url, tieneFormulario: false }, ORIGEN, config);
      expect(decision.tipo, `${status} ${url}`).toBe("error");
    }
  });
});
