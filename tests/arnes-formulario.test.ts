/**
 * El arnés de envío sin JS (change `migrar-formularios-publicos-astro`,
 * tasks.md #3): sus piezas puras, con formularios de muestra. Uno es el de
 * Next tal como lo capturó la tarea 2 (con los campos ocultos `$ACTION_*`) y
 * otro nativo, como lo pinta Astro. Todo ficticio.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  Frasco,
  cabecerasDeNavegador,
  camposAEnviar,
  cuerpoDelEnvio,
  enviarFormulario,
  leerFormulario,
  leerSetCookie,
  resumenDelDesenlace,
} from "../scripts/enviar-formulario.mjs";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HTML_NEXT = readFileSync(path.join(raiz, "tests/fixtures/next-3a/con-sitio-url/formulario.html"), "utf8");
const URL_NEXT = "https://enmirumbo.example/negocio/x-cficticio/reportar?error=motivo";

const HTML_NATIVO = `<main><form class="f" action="?_action=reportar" method="post">
  <input type="text" name="sitio_web">
  <input type="radio" name="motivo" value="cerrado"><input type="radio" name="motivo" value="no_real" checked>
  <input type="checkbox" name="acepto" value="si">
  <input type="hidden" name="oculto" value="x" disabled>
  <select name="colonia"><option value="a">A</option><option value="b" selected>B</option></select>
  <textarea name="comentario">hola &amp; adiós</textarea>
  <input type="file" name="foto"><button type="submit" name="boton" value="1">Enviar</button>
</form></main>`;

describe("arnés · leer el formulario", () => {
  it("el de Next: POST multipart a la propia URL (con su consulta) y sus campos $ACTION_* incluidos", () => {
    const f = leerFormulario(HTML_NEXT, URL_NEXT);
    expect(f.metodo).toBe("POST");
    expect(f.codificacion).toBe("multipart/form-data");
    expect(f.accion).toBe(URL_NEXT);
    const nombres = f.campos.map((c) => c.nombre);
    expect(nombres.filter((n) => n.startsWith("$ACTION_"))).toEqual(["$ACTION_REF_1", "$ACTION_1:0", "$ACTION_1:1"]);
    expect(nombres).toContain("sitio_web");
    expect(nombres.filter((n) => n === "motivo")).toHaveLength(4);
    expect(nombres).toContain("comentario");
  });

  it("el nativo: el destino relativo se resuelve contra la página y reemplaza su consulta", () => {
    const f = leerFormulario(HTML_NATIVO, URL_NEXT);
    expect(f.metodo).toBe("POST");
    expect(f.codificacion).toBe("application/x-www-form-urlencoded");
    expect(f.accion).toBe("https://enmirumbo.example/negocio/x-cficticio/reportar?_action=reportar");
  });

  it("sin method es GET, y sin formulario lanza", () => {
    expect(leerFormulario("<form><input name=q></form>", "https://enmirumbo.example/").metodo).toBe("GET");
    expect(() => leerFormulario("<p>sin formulario</p>", "https://enmirumbo.example/")).toThrow();
  });
});

describe("arnés · lo que manda el navegador", () => {
  it("solo el radio marcado, el checkbox sin marcar no va, lo deshabilitado y el archivo tampoco", () => {
    const pares = camposAEnviar(leerFormulario(HTML_NATIVO, URL_NEXT));
    expect(pares).toEqual([
      ["sitio_web", ""],
      ["motivo", "no_real"],
      ["colonia", "b"],
      ["comentario", "hola & adiós"],
    ]);
  });

  it("las elecciones marcan otro radio y escriben en el texto; los extras van al final", () => {
    const pares = camposAEnviar(leerFormulario(HTML_NATIVO, URL_NEXT), { motivo: "cerrado", comentario: "otro" }, [["negocioId", "c1"]]);
    expect(pares).toEqual([
      ["sitio_web", ""],
      ["motivo", "cerrado"],
      ["colonia", "b"],
      ["comentario", "otro"],
      ["negocioId", "c1"],
    ]);
  });

  it("el formulario de Next manda sus tres campos ocultos tal cual", () => {
    const pares = camposAEnviar(leerFormulario(HTML_NEXT, URL_NEXT), { motivo: "cerrado" });
    expect(pares.filter(([n]) => n.startsWith("$ACTION_")).map(([n]) => n)).toEqual(["$ACTION_REF_1", "$ACTION_1:0", "$ACTION_1:1"]);
    expect(pares.filter(([n]) => n === "motivo")).toEqual([["motivo", "cerrado"]]);
  });

  it("el cuerpo lleva la codificación declarada", () => {
    expect(cuerpoDelEnvio([["a", "1"]], "multipart/form-data")).toBeInstanceOf(FormData);
    expect(String(cuerpoDelEnvio([["a", "1 2"]], "application/x-www-form-urlencoded"))).toBe("a=1+2");
    expect(() => cuerpoDelEnvio([], "text/plain")).toThrow();
  });

  it("Origin y Referer según la política de la página", () => {
    const pagina = "https://enmirumbo.example/negocio/x/reportar?error=motivo#ancla";
    const destino = "https://enmirumbo.example/negocio/x/reportar?_action=reportar";
    expect(cabecerasDeNavegador(pagina, destino)).toEqual({
      origin: "https://enmirumbo.example",
      referer: "https://enmirumbo.example/negocio/x/reportar?error=motivo",
    });
    expect(cabecerasDeNavegador(pagina, destino, "strict-origin")).toEqual({
      origin: "https://enmirumbo.example",
      referer: "https://enmirumbo.example/",
    });
    expect(cabecerasDeNavegador(pagina, destino, "no-referrer")).toEqual({ origin: "null" });
    expect(cabecerasDeNavegador(pagina, "https://otro.example/", "strict-origin-when-cross-origin").referer).toBe(
      "https://enmirumbo.example/",
    );
  });
});

describe("arnés · cookies y desenlace", () => {
  it("lee los atributos del Set-Cookie sin distinguir mayúsculas", () => {
    expect(leerSetCookie("nu=abc; Path=/negocio/x/reportar; Max-Age=120; HttpOnly; SameSite=Lax; Secure")).toEqual({
      nombre: "nu",
      valor: "abc",
      atributos: { path: "/negocio/x/reportar", "max-age": "120", httponly: "", samesite: "Lax", secure: "" },
    });
  });

  it("el frasco respeta el Path y borra con Max-Age=0", () => {
    const frasco = new Frasco();
    frasco.guardar(["nu=abc; Path=/negocio/x/reportar; Max-Age=120"]);
    expect(frasco.cabecera("https://e.example/negocio/x/reportar?error=motivo")).toBe("nu=abc");
    expect(frasco.cabecera("https://e.example/negocio/x/reportar/gracias")).toBe("nu=abc");
    expect(frasco.cabecera("https://e.example/negocio/x")).toBeUndefined();
    expect(frasco.cabecera("https://e.example/negocio/x/reportarlo")).toBeUndefined();
    frasco.guardar(["nu=; Path=/negocio/x/reportar; Max-Age=0"]);
    expect(frasco.tiene("nu")).toBe(false);
  });

  it("recorre página → POST → 303 → GET con un servidor de mentira y resume sin valores ni Expires", async () => {
    const pedidos: Array<{ url: string; init: RequestInit }> = [];
    const pedir = async (url: string | URL | Request, init: RequestInit = {}) => {
      pedidos.push({ url: String(url), init });
      if (init.method === "POST") {
        return new Response(null, {
          status: 303,
          headers: [
            ["location", "/negocio/x/reportar?error=motivo"],
            ["set-cookie", "nu=abc; Path=/negocio/x/reportar; Expires=Thu, 01 Jan 2099 00:00:00 GMT; Max-Age=120; HttpOnly"],
          ],
        });
      }
      return new Response(HTML_NATIVO, { status: 200, headers: { "referrer-policy": "strict-origin-when-cross-origin" } });
    };
    const resultado = await enviarFormulario({
      urlPagina: "https://enmirumbo.example/negocio/x/reportar",
      elecciones: { motivo: "cerrado" },
      cabecerasExtra: { origin: null },
      pedir: pedir as typeof fetch,
    });
    expect(resultado.cadena.map((p) => `${p.metodo} ${p.status}`)).toEqual(["GET 200", "POST 303", "GET 200"]);
    const post = pedidos[1].init.headers as Record<string, string>;
    expect(post.origin).toBeUndefined();
    expect(post.referer).toBe("https://enmirumbo.example/negocio/x/reportar");
    expect((pedidos[2].init.headers as Record<string, string>).cookie).toBe("nu=abc");
    expect(resumenDelDesenlace(resultado)[1]).toEqual({
      metodo: "POST",
      status: 303,
      location: "/negocio/x/reportar?error=motivo",
      cookies: [{ nombre: "nu", httponly: "", "max-age": "120", path: "/negocio/x/reportar" }],
    });
  });
});
