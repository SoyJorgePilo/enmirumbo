// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://enmirumbo.example/registro", "settings": {"disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true}}
/**
 * c-seguridad 3b-1 (change `migrar-registro-astro`): la mejora progresiva de
 * `/registro` frente a respuestas y eventos hostiles, en el DOM de pruebas y
 * con el HTML REAL de la build. Complementa `registro-mejora-dom.test.ts`:
 *
 * - doble envío mientras el primero espera: una sola petición;
 * - un `submit` de OTRO formulario del documento (el buscador del encabezado)
 *   no se intercepta;
 * - una respuesta del mismo origen que trae un `<form>` señuelo antes del de
 *   registro: solo se inserta el que contiene `#categoriaId`;
 * - una respuesta que termina en gracias pero en otro esquema u otro puerto
 *   (otro origen): no se navega y se conserva lo capturado.
 *
 * Todo ficticio.
 */
import { request } from "node:http";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { TEXTO_ENVIANDO, mejorarFormularioDeRegistro, type VentanaDelRegistro } from "../src/astro/registro-cliente";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const ORIGEN = "https://enmirumbo.example";

let prisma: PrismaClient;
let emulador: Emulador;
let htmlRegistro = "";
let htmlRepintado = "";

function pedirCrudo(ruta: string, opciones: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}): Promise<string> {
  return new Promise((listo, falla) => {
    const peticion = request(new URL(ruta, emulador.base), { method: opciones.method ?? "GET", headers: opciones.headers ?? {}, agent: false }, (respuesta) => {
      const trozos: Buffer[] = [];
      respuesta.on("data", (t: Buffer) => trozos.push(t));
      respuesta.on("end", () => listo(Buffer.concat(trozos).toString("utf8")));
    });
    peticion.on("error", falla);
    if (opciones.body) peticion.write(opciones.body);
    peticion.end();
  });
}

function montar(html: string) {
  const cuerpo = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  document.body.innerHTML = cuerpo.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<link\b[^>]*>/g, "");
}

type Respuesta = { status: number; url: string; html?: string };

function ventana(respuestas: Respuesta[], { pausar = false } = {}) {
  const llamadas: string[] = [];
  let soltar: () => void = () => {};
  const pausa = new Promise<void>((r) => (soltar = r));
  const assign = vi.fn();
  const falsa: VentanaDelRegistro = {
    fetch: (async (url: RequestInfo | URL) => {
      llamadas.push(String(url));
      if (pausar) await pausa;
      const r = respuestas.shift();
      if (!r) throw new Error("sin respuesta preparada");
      return { status: r.status, url: r.url, text: async () => r.html ?? "" } as unknown as Response;
    }) as typeof fetch,
    FormData: window.FormData as unknown as typeof FormData,
    DOMParser: window.DOMParser as unknown as typeof DOMParser,
    location: { origin: ORIGEN, assign },
  };
  return { falsa, llamadas, assign, soltar };
}

const formularioDeRegistro = () => document.getElementById("categoriaId")!.closest("form")!;
const enviar = (f: HTMLFormElement) => f.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const categoriaId = String((await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  const coloniaId = String((await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  emulador = await levantarEmulador({ SITIO_URL: ORIGEN });
  htmlRegistro = await pedirCrudo("/registro");
  const limite = "----limite-dom-adversarial";
  const campos = { nombre: "Cerrajería Ficticia Adversarial", categoriaId, whatsapp: "77199", coloniaId, consentimiento: "on", avisoVersion: VERSION_AVISO };
  const cuerpo = Buffer.from(
    Object.entries(campos).map(([k, v]) => `--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join("") + `--${limite}--\r\n`,
  );
  htmlRepintado = await pedirCrudo("/registro?_action=registrar", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${limite}`, origin: emulador.base },
    body: cuerpo,
  });
  expect(htmlRepintado).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
  // Sin `<link>`: happy-dom, a diferencia de un navegador, sí pide las hojas
  // de un documento de `DOMParser`.
  htmlRepintado = htmlRepintado.replace(/<link\b[^>]*>/g, "");
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await prisma.$disconnect();
});

let quitar: () => void = () => {};
beforeEach(() => montar(htmlRegistro));
afterEach(() => {
  quitar();
  quitar = () => {};
});

describe("c-seguridad 3b-1 · mejora progresiva frente a lo hostil", () => {
  it("doble envío mientras el primero espera: una sola petición y el botón en 'Enviando...'", async () => {
    const v = ventana([{ status: 200, url: `${ORIGEN}/registro?_action=registrar`, html: htmlRepintado }], { pausar: true });
    quitar = mejorarFormularioDeRegistro(document, v.falsa);
    const f = formularioDeRegistro();
    enviar(f);
    enviar(f);
    f.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await esperar();
    expect(v.llamadas).toHaveLength(1);
    expect(f.querySelector('button[type="submit"]')!.textContent).toBe(TEXTO_ENVIANDO);
    v.soltar();
    await esperar();
    await esperar();
    expect(v.llamadas).toHaveLength(1);
    expect(v.assign).not.toHaveBeenCalled();
  });

  it("un submit de otro formulario del documento no se intercepta ni se manda por fetch", async () => {
    const v = ventana([]);
    quitar = mejorarFormularioDeRegistro(document, v.falsa);
    const otro = document.createElement("form");
    otro.action = "/buscar";
    otro.innerHTML = '<input name="q" value="cerrajería">';
    document.body.prepend(otro);
    const evento = new window.Event("submit", { bubbles: true, cancelable: true });
    otro.dispatchEvent(evento);
    await esperar();
    expect(evento.defaultPrevented).toBe(false);
    expect(v.llamadas).toEqual([]);
  });

  it("una respuesta con un <form> señuelo antes del de registro: solo entra el que trae #categoriaId", async () => {
    const senuelo = '<form action="https://evil.example/robar" method="post" id="senuelo"><input name="whatsapp" value="x"></form>';
    const html = htmlRepintado.replace(/<body([^>]*)>/, `<body$1>${senuelo}`);
    const v = ventana([{ status: 200, url: `${ORIGEN}/registro?_action=registrar`, html }]);
    quitar = mejorarFormularioDeRegistro(document, v.falsa);
    const formulariosAntes = document.querySelectorAll("form").length;
    enviar(formularioDeRegistro());
    await esperar();
    await esperar();
    expect(document.getElementById("senuelo")).toBeNull();
    expect(document.querySelectorAll("form")).toHaveLength(formulariosAntes);
    expect(formularioDeRegistro().getAttribute("action")).toBe("?_action=registrar");
    expect(document.body.innerHTML).not.toContain("evil.example");
    expect(document.getElementById("whatsapp-error")?.textContent).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
  });

  it.each([
    ["otro esquema", "http://enmirumbo.example/registro/gracias"],
    ["otro puerto", "https://enmirumbo.example:8443/registro/verificar"],
    ["subdominio", "https://registro.enmirumbo.example/registro/gracias"],
  ])("terminar en gracias desde %s no navega y conserva lo capturado", async (_nombre, url) => {
    const v = ventana([{ status: 200, url, html: "<html><body><h1>¡Gracias!</h1></body></html>" }]);
    quitar = mejorarFormularioDeRegistro(document, v.falsa);
    (document.getElementById("nombre") as HTMLInputElement).value = "Lo Que Escribí";
    enviar(formularioDeRegistro());
    await esperar();
    await esperar();
    expect(v.assign).not.toHaveBeenCalled();
    expect((document.getElementById("nombre") as HTMLInputElement).value).toBe("Lo Que Escribí");
    expect(document.getElementById("general-error")?.textContent).toContain(MENSAJES_ERROR_REGISTRO.servidor);
    expect((formularioDeRegistro().querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
