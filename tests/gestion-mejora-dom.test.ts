// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://enmirumbo.example/editar/ficticio", "settings": {"disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true}}
/**
 * La mejora progresiva de `/editar/[token]` en un DOM de pruebas (change
 * `migrar-enlace-gestion-astro`, design.md §4.2–4.3; tasks.md #7). El mismo
 * módulo de `/registro`, configurado por la página (`gestion-cliente.ts`).
 *
 * El HTML es el REAL de la build: `/editar/T` y la respuesta re-pintada de un
 * envío con error se piden a la salida servida (por `node:http`, sin el
 * `fetch` del DOM). El `fetch` que ve el módulo es falso y responde con esas
 * respuestas reales. Cubre: el error en el sitio sin cambiar `location`, el
 * foco, los valores, "Enviando...", el ejemplo genérico al abrir con una
 * categoría prellenada y el de la categoría tras un `change`, la navegación
 * solo a su propia confirmación, la 404 que recarga la misma dirección y el
 * error de la edición ante todo lo demás.
 *
 * Todo ficticio: WhatsApp 77199967xx.
 */
import { request } from "node:http";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { mejorarFormularioDeEdicion } from "../src/astro/gestion-cliente";
import { CLASE_MENSAJE_ERROR, TEXTO_ENVIANDO, type VentanaDelRegistro } from "../src/astro/registro-cliente";
import type { PrismaClient } from "../src/generated/prisma/client";
import { ERROR_GUARDAR_EDICION } from "../src/lib/gestion/textos";
import { generarTokenGestion } from "../src/lib/gestion/token";
import { EJEMPLOS_QUE_OFRECES, EJEMPLO_QUE_OFRECES_GENERICO } from "../src/lib/registro/ejemplos";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { type SembradoDe4, borrarFichasDe4, sembrarFichasDe4 } from "./gestion-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const ORIGEN = "https://enmirumbo.example";
const SERIE = "77199967";

let prisma: PrismaClient;
let emulador: Emulador;
let s: SembradoDe4;
let T = "";
let htmlEdicion = "";
let htmlRepintado = "";
let html404 = "";
let idTalleres = "";
let idDeportes = "";

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

/** Una petición al emulador con `node:http` (el `fetch` global es el de happy-dom). */
function pedirCrudo(ruta: string, opciones: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<{ status: number; html: string }> {
  return new Promise((listo, falla) => {
    const peticion = request(new URL(ruta, emulador.base), { method: opciones.method ?? "GET", headers: opciones.headers ?? {}, agent: false }, (respuesta) => {
      const trozos: Buffer[] = [];
      respuesta.on("data", (t: Buffer) => trozos.push(t));
      respuesta.on("end", () => listo({ status: respuesta.statusCode ?? 0, html: Buffer.concat(trozos).toString("utf8") }));
    });
    peticion.on("error", falla);
    if (opciones.body) peticion.write(opciones.body);
    peticion.end();
  });
}

function multipart(campos: Record<string, string>) {
  const limite = "----limite-dom-edicion";
  const partes = Object.entries(campos).map(([k, v]) => Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  partes.push(Buffer.from(`--${limite}--\r\n`));
  return { tipo: `multipart/form-data; boundary=${limite}`, cuerpo: Buffer.concat(partes) };
}

/** Pone el `<body>` del documento real, sin sus `<script>` (el módulo se llama a mano). */
function montar(html: string) {
  const cuerpo = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  document.body.innerHTML = cuerpo.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<link\b[^>]*>/g, "");
}

type Llamada = { url: string; init: RequestInit };
type RespuestaFalsa = { status: number; url: string; html?: string } | Error;

function ventana(respuestas: RespuestaFalsa[], { pausar = false } = {}) {
  const llamadas: Llamada[] = [];
  let soltar: () => void = () => {};
  const pausa = new Promise<void>((r) => (soltar = r));
  const assign = vi.fn();
  const falsa: VentanaDelRegistro = {
    fetch: (async (url: RequestInfo | URL, init: RequestInit = {}) => {
      llamadas.push({ url: String(url), init });
      if (pausar) await pausa;
      const r = respuestas.shift();
      if (!r) throw new Error("sin respuesta preparada");
      if (r instanceof Error) throw r;
      return { status: r.status, url: r.url, text: async () => r.html ?? "" } as unknown as Response;
    }) as typeof fetch,
    FormData: window.FormData as unknown as typeof FormData,
    DOMParser: window.DOMParser as unknown as typeof DOMParser,
    location: { origin: ORIGEN, assign },
  };
  return { falsa, llamadas, assign, soltar };
}

const formulario = () => document.querySelector("form")!;
const campo = <E extends HTMLElement>(id: string) => document.getElementById(id) as E;
const enviar = () => formulario().dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  idTalleres = String((await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id);
  idDeportes = String((await prisma.categoria.findUniqueOrThrow({ where: { slug: "clubes-y-escuelas-deportivas" } })).id);
  const coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  s = await sembrarFichasDe4(consultar, { categoriaId: Number(idTalleres), coloniaId, serie: SERIE });
  T = s.tokens.publicada;
  emulador = await levantarEmulador({ SITIO_URL: ORIGEN });
  htmlEdicion = (await pedirCrudo(`/editar/${T}`)).html;
  const conError = multipart({ nombre: "Cerrajería Ficticia Del DOM", categoriaId: idTalleres, whatsapp: "77199", coloniaId: String(coloniaId), horario: "L-V del DOM" });
  const r = await pedirCrudo(`/editar/${T}?_action=editar`, { method: "POST", headers: { "content-type": conError.tipo, origin: emulador.base }, body: conError.cuerpo });
  expect(r.status).toBe(200);
  htmlRepintado = r.html;
  const noEncontrado = await pedirCrudo(`/editar/${generarTokenGestion()}?_action=editar`, { method: "POST", headers: { "content-type": conError.tipo, origin: emulador.base }, body: conError.cuerpo });
  expect(noEncontrado.status).toBe(404);
  html404 = noEncontrado.html;
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await borrarFichasDe4(consultar, SERIE);
  await prisma.$disconnect();
});

let quitar: () => void = () => {};
function mejorar(falsa: VentanaDelRegistro) {
  quitar = mejorarFormularioDeEdicion(document, falsa);
}

beforeEach(() => {
  window.history.replaceState(null, "", `/editar/${T}`);
  montar(htmlEdicion);
});

afterEach(() => {
  quitar();
  quitar = () => {};
});

describe("mejora de la edición en el DOM · el ejemplo", () => {
  it("al abrir con una categoría prellenada pone el genérico (como Next); tras un change, el de la categoría; sin borrar lo escrito", () => {
    const { falsa } = ventana([]);
    const queOfreces = campo<HTMLTextAreaElement>("queOfreces");
    // La categoría viene elegida desde el servidor (se mira el atributo: el `value`
    // de un <select> montado con innerHTML no es fiable en happy-dom).
    expect(document.querySelector("#categoriaId option[selected]")?.getAttribute("value")).toBe(idTalleres);
    mejorar(falsa);
    expect(queOfreces.placeholder).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
    const escrito = queOfreces.value;
    const categoria = campo<HTMLSelectElement>("categoriaId");
    categoria.value = idDeportes;
    categoria.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(queOfreces.placeholder).toBe(EJEMPLOS_QUE_OFRECES["clubes-y-escuelas-deportivas"]);
    expect(queOfreces.value).toBe(escrito);
  });
});

describe("mejora de la edición en el DOM · errores en el sitio", () => {
  it("'Enviando...', luego el formulario del servidor con el error junto al WhatsApp, el foco ahí y lo demás en su lugar; la URL no cambia", async () => {
    const { falsa, llamadas, assign, soltar } = ventana([{ status: 200, url: `${ORIGEN}/editar/${T}?_action=editar`, html: htmlRepintado }], { pausar: true });
    mejorar(falsa);
    const original = formulario();
    expect(enviar()).toBe(false);
    const boton = original.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(boton.disabled).toBe(true);
    expect(boton.textContent).toBe(TEXTO_ENVIANDO);
    enviar();
    soltar();
    await vi.waitFor(() => expect(formulario()).not.toBe(original));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe(`${ORIGEN}/editar/${T}?_action=editar`);
    expect(llamadas[0].init.method).toBe("POST");
    expect(assign).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(`/editar/${T}`);
    expect(campo("whatsapp-error").textContent).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
    expect(document.activeElement?.id).toBe("whatsapp");
    expect(campo<HTMLInputElement>("nombre").value).toBe("Cerrajería Ficticia Del DOM");
    expect(campo<HTMLInputElement>("horario").value).toBe("L-V del DOM");
    expect(formulario().querySelector("button")!.disabled).toBe(false);
    // Sin un change antes, el ejemplo sigue siendo el genérico (como Next tras un error).
    expect(campo<HTMLTextAreaElement>("queOfreces").placeholder).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
  });

  it("si hubo un change antes del envío, el ejemplo de la categoría se re-aplica en el formulario nuevo", async () => {
    const { falsa } = ventana([{ status: 200, url: `${ORIGEN}/editar/${T}?_action=editar`, html: htmlRepintado }]);
    mejorar(falsa);
    const original = formulario();
    const categoria = campo<HTMLSelectElement>("categoriaId");
    categoria.value = idTalleres;
    categoria.dispatchEvent(new window.Event("change", { bubbles: true }));
    enviar();
    await vi.waitFor(() => expect(formulario()).not.toBe(original));
    expect(campo<HTMLTextAreaElement>("queOfreces").placeholder).toBe(EJEMPLOS_QUE_OFRECES.talleres);
  });
});

describe("mejora de la edición en el DOM · éxito y la 404", () => {
  it("si la respuesta termina en /editar/<el mismo token>/gracias del mismo origen, navega ahí", async () => {
    const { falsa, assign } = ventana([{ status: 200, url: `${ORIGEN}/editar/${T}/gracias`, html: "<main>gracias</main>" }]);
    mejorar(falsa);
    enviar();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(`/editar/${T}/gracias`));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("si la respuesta es la 404 de no encontrado (el enlace se regeneró), carga la misma dirección", async () => {
    const { falsa, assign, llamadas } = ventana([{ status: 404, url: `${ORIGEN}/editar/${T}?_action=editar`, html: html404 }]);
    mejorar(falsa);
    enviar();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(`/editar/${T}`));
    expect(llamadas).toHaveLength(1);
    expect(document.getElementById("general-error")).toBeNull();
  });
});

describe("mejora de la edición en el DOM · destinos fuera de la lista", () => {
  const otro = "0tro_Token-Ficticio-0123456789abcdefghijklmn".slice(0, 43);
  const casos: Array<[string, () => RespuestaFalsa]> = [
    ["otro token", () => ({ status: 200, url: `${ORIGEN}/editar/${otro}/gracias`, html: "<p>x</p>" })],
    ["/registro/gracias", () => ({ status: 200, url: `${ORIGEN}/registro/gracias`, html: "<p>x</p>" })],
    ["otro origen", () => ({ status: 200, url: `https://evil.example/editar/${T}/gracias`, html: "<p>x</p>" })],
    ["500", () => ({ status: 500, url: `${ORIGEN}/editar/${T}?_action=editar`, html: "<p>Algo falló de nuestro lado</p>" })],
    ["403", () => ({ status: 403, url: `${ORIGEN}/editar/${T}?_action=editar`, html: "<p>no</p>" })],
    ["falla de red", () => new TypeError("Failed to fetch")],
  ];

  for (const [nombre, respuesta] of casos) {
    it(`${nombre}: no navega, conserva lo capturado y muestra el error de la edición, sin reenviar`, async () => {
      const { falsa, llamadas, assign } = ventana([respuesta()]);
      mejorar(falsa);
      const original = formulario();
      campo<HTMLInputElement>("horario").value = "lo que capturé";
      const boton = original.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const texto = boton.textContent;
      enviar();
      await vi.waitFor(() => expect(document.getElementById("general-error")).not.toBeNull());
      expect(formulario()).toBe(original);
      expect(campo<HTMLInputElement>("horario").value).toBe("lo que capturé");
      expect(boton.disabled).toBe(false);
      expect(boton.textContent).toBe(texto);
      expect(assign).not.toHaveBeenCalled();
      await esperar();
      expect(llamadas).toHaveLength(1);
      const mensaje = campo("general-error");
      expect(mensaje.textContent).toBe(`⚠ ${ERROR_GUARDAR_EDICION}`);
      expect(mensaje.getAttribute("role")).toBe("alert");
      expect(mensaje.className).toBe(CLASE_MENSAJE_ERROR);
    });
  }
});

describe("mejora de la edición en el DOM · sin las APIs del navegador", () => {
  it("sin fetch: no instala nada y el envío es el nativo", () => {
    const { falsa, llamadas } = ventana([]);
    mejorar({ ...falsa, fetch: undefined } as unknown as VentanaDelRegistro);
    expect(enviar()).toBe(true);
    expect(llamadas).toEqual([]);
  });

  it("en un documento sin el formulario de un enlace (p. ej. la 404) no hace nada", () => {
    montar(html404);
    const { falsa } = ventana([]);
    expect(() => mejorar(falsa)).not.toThrow();
    expect(document.querySelector("form")).toBeNull();
  });
});
