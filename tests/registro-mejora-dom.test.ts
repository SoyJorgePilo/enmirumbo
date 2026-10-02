// @vitest-environment happy-dom
// @vitest-environment-options {"url": "https://enmirumbo.example/registro", "settings": {"disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "handleDisabledFileLoadingAsSuccess": true}}
/**
 * La mejora progresiva de `/registro` en un DOM de pruebas (change
 * `migrar-registro-astro`, design.md §1.4; tasks.md #8). `happy-dom` SOLO en
 * este archivo (devDependency aprobada para esto, duda 3).
 *
 * El HTML es el REAL de la build: `/registro` y la respuesta re-pintada de un
 * envío con error se piden a la salida servida (por `node:http`, sin el
 * `fetch` del DOM). El `fetch` que ve el módulo es falso y responde con esas
 * respuestas reales. Cubre: el error en el sitio sin cambiar `location`, el
 * foco, los valores, la foto vacía con su aviso, "Enviando...", el ejemplo
 * tras el reemplazo, la respuesta inesperada con el error general y sin
 * reenvío, y sin `fetch`/`DOMParser` el envío nativo.
 *
 * Todo ficticio.
 */
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { CLASE_MENSAJE_ERROR, ESPERA_MAXIMA_DEL_ENVIO_MS, TEXTO_ENVIANDO, mejorarFormularioDeRegistro, type VentanaDelRegistro } from "../src/astro/registro-cliente";
import type { PrismaClient } from "../src/generated/prisma/client";
import { EJEMPLOS_QUE_OFRECES, EJEMPLO_QUE_OFRECES_GENERICO } from "../src/lib/registro/ejemplos";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { AVISO_FOTO_NO_GUARDADA, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const ORIGEN = "https://enmirumbo.example";

let prisma: PrismaClient;
let emulador: Emulador;
let htmlRegistro = "";
let htmlRepintado = "";
let htmlConErrorGeneral = "";
let idHogar = "";
let idDeportes = "";

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

/** Un multipart armado a mano (campos de texto y un archivo opcional). */
function multipart(campos: Record<string, string>, foto?: Buffer) {
  const limite = "----limite-dom-ficticio";
  const partes: Buffer[] = Object.entries(campos).map(([k, v]) => Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (foto) {
    partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="local.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), foto, Buffer.from("\r\n"));
  }
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

/** La ventana que ve el módulo: el `fetch` falso, y `location.assign` espiado. */
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
const campo = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const enviar = () => formulario().dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  idHogar = String((await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })).id);
  idDeportes = String((await prisma.categoria.findUniqueOrThrow({ where: { slug: "clubes-y-escuelas-deportivas" } })).id);
  const coloniaId = String((await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  emulador = await levantarEmulador({ SITIO_URL: ORIGEN });
  htmlRegistro = (await pedirCrudo("/registro")).html;
  const conError = multipart(
    { nombre: "Plomería Ficticia Del DOM", categoriaId: idHogar, whatsapp: "77199", coloniaId, consentimiento: "on", avisoVersion: VERSION_AVISO, queOfreces: "destapes" },
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  );
  const r = await pedirCrudo("/registro?_action=registrar", { method: "POST", headers: { "content-type": conError.tipo, origin: emulador.base }, body: conError.cuerpo });
  expect(r.status).toBe(200);
  htmlRepintado = r.html;
  // Un cuerpo que no es formulario: el servidor repinta con el error general.
  htmlConErrorGeneral = (await pedirCrudo("/registro?_action=registrar", { method: "POST", headers: { "content-type": "text/plain", origin: emulador.base }, body: Buffer.from("x") })).html;
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await prisma.$disconnect();
});

let quitar: () => void = () => {};
/** Instala la mejora y anota cómo quitarla al terminar cada prueba. */
function mejorar(falsa: VentanaDelRegistro) {
  quitar = mejorarFormularioDeRegistro(document, falsa);
}

beforeEach(() => {
  montar(htmlRegistro);
});

afterEach(() => {
  quitar();
  quitar = () => {};
});

describe("mejora progresiva en el DOM · el ejemplo", () => {
  it("al cargar pone el genérico, al cambiar de categoría el de esa, y no borra lo escrito", () => {
    const { falsa } = ventana([]);
    const queOfreces = campo<HTMLTextAreaElement>("queOfreces");
    queOfreces.value = "lo que ya escribí";
    mejorar(falsa);
    expect(queOfreces.placeholder).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
    const categoria = campo<HTMLSelectElement>("categoriaId");
    categoria.value = idDeportes;
    categoria.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(queOfreces.placeholder).toBe(EJEMPLOS_QUE_OFRECES["clubes-y-escuelas-deportivas"]);
    expect(queOfreces.value).toBe("lo que ya escribí");
  });
});

describe("mejora progresiva en el DOM · error en el sitio", () => {
  it("'Enviando...' mientras espera; luego el formulario del servidor, con el foco en el WhatsApp, los valores, la foto vacía con su aviso y el ejemplo; sin navegar", async () => {
    const { falsa, llamadas, assign, soltar } = ventana([{ status: 200, url: `${ORIGEN}/registro?_action=registrar`, html: htmlRepintado }], { pausar: true });
    mejorar(falsa);
    const original = formulario();
    campo<HTMLInputElement>("nombre").value = "Plomería Ficticia Del DOM";
    expect(enviar()).toBe(false); // envío nativo prevenido
    const boton = original.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(boton.disabled).toBe(true);
    expect(boton.textContent).toBe(TEXTO_ENVIANDO);
    // Un segundo envío mientras espera no manda otra petición.
    enviar();
    soltar();
    await vi.waitFor(() => expect(formulario()).not.toBe(original));

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe(original.action);
    expect(new URL(llamadas[0].url).search).toBe("?_action=registrar");
    expect(llamadas[0].init.method).toBe("POST");
    expect(llamadas[0].init.body).toBeInstanceOf(window.FormData);
    expect(assign).not.toHaveBeenCalled();

    expect(campo("whatsapp-error").textContent).toContain(MENSAJES_ERROR_REGISTRO.whatsapp);
    expect(document.activeElement?.id).toBe("whatsapp");
    expect(campo<HTMLInputElement>("nombre").value).toBe("Plomería Ficticia Del DOM");
    expect(campo<HTMLTextAreaElement>("queOfreces").value).toBe("destapes");
    expect(campo<HTMLSelectElement>("categoriaId").value).toBe(idHogar);
    expect(campo<HTMLInputElement>("foto").value).toBe("");
    expect(campo("foto-error").textContent).toContain(AVISO_FOTO_NO_GUARDADA);
    expect(campo<HTMLInputElement>("consentimiento").checked).toBe(false);
    // El ejemplo vuelve a ser el de la categoría elegida.
    expect(campo<HTMLTextAreaElement>("queOfreces").placeholder).toBe(EJEMPLOS_QUE_OFRECES["servicios-del-hogar"]);
    // El formulario reemplazado es el que pintó el servidor para ese estado.
    const delServidor = new window.DOMParser().parseFromString(htmlRepintado, "text/html").querySelector("form")!;
    const sinPlaceholder = (html: string) => html.replace(/ placeholder="[^"]*"/g, "");
    expect(sinPlaceholder(formulario().outerHTML)).toBe(sinPlaceholder(delServidor.outerHTML));
    // Y el botón nuevo está en reposo.
    expect(formulario().querySelector("button")!.disabled).toBe(false);
  });

  it("tras el reemplazo, otro envío vuelve a pasar por el módulo", async () => {
    const { falsa, llamadas } = ventana([
      { status: 200, url: `${ORIGEN}/registro?_action=registrar`, html: htmlRepintado },
      { status: 200, url: `${ORIGEN}/registro/gracias`, html: "<p>gracias</p>" },
    ]);
    mejorar(falsa);
    const original = formulario();
    enviar();
    await vi.waitFor(() => expect(formulario()).not.toBe(original));
    expect(enviar()).toBe(false);
    await vi.waitFor(() => expect(llamadas).toHaveLength(2));
  });
});

describe("mejora progresiva en el DOM · éxito", () => {
  it.each(["/registro/gracias", "/registro/verificar"])("si la respuesta termina en %s del mismo origen, navega ahí", async (ruta) => {
    const { falsa, assign } = ventana([{ status: 200, url: `${ORIGEN}${ruta}`, html: "<main>gracias</main>" }]);
    mejorar(falsa);
    enviar();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(ruta));
  });
});

describe("mejora progresiva en el DOM · respuesta inesperada", () => {
  const casos: Array<[string, RespuestaFalsa]> = [
    ["500", { status: 500, url: `${ORIGEN}/registro?_action=registrar`, html: "<p>Algo falló de nuestro lado</p>" }],
    ["403", { status: 403, url: `${ORIGEN}/registro?_action=registrar`, html: "<p>no</p>" }],
    ["413 de la plataforma", { status: 413, url: `${ORIGEN}/registro?_action=registrar`, html: "Request Entity Too Large" }],
    ["otro origen", { status: 200, url: "https://evil.example/registro/gracias", html: "<p>x</p>" }],
    ["//evil.example", { status: 200, url: "https://evil.example/", html: "<p>x</p>" }],
    ["/negocios", { status: 200, url: `${ORIGEN}/negocios`, html: "<p>x</p>" }],
    ["sin formulario", { status: 200, url: `${ORIGEN}/registro?_action=registrar`, html: "<main>otra cosa</main>" }],
    ["falla de red", new TypeError("Failed to fetch")],
  ];

  for (const [nombre, respuesta] of casos) {
    it(`${nombre}: el formulario se queda con lo capturado, el error general arriba, el botón reactivado y sin reenviar`, async () => {
      const { falsa, llamadas, assign } = ventana([respuesta]);
      mejorar(falsa);
      const original = formulario();
      campo<HTMLInputElement>("nombre").value = "Fonda Ficticia Inesperada";
      const boton = original.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const texto = boton.textContent;
      enviar();
      await vi.waitFor(() => expect(document.getElementById("general-error")).not.toBeNull());
      expect(formulario()).toBe(original);
      expect(campo<HTMLInputElement>("nombre").value).toBe("Fonda Ficticia Inesperada");
      expect(boton.disabled).toBe(false);
      expect(boton.textContent).toBe(texto);
      expect(assign).not.toHaveBeenCalled();
      await esperar();
      expect(llamadas).toHaveLength(1);
      const mensaje = campo("general-error");
      expect(mensaje.textContent).toBe(`⚠ ${MENSAJES_ERROR_REGISTRO.servidor}`);
      expect(mensaje.getAttribute("role")).toBe("alert");
      expect(mensaje.className).toBe(CLASE_MENSAJE_ERROR);
      // Va donde lo pinta el servidor: justo después del campo trampa.
      expect(mensaje.previousElementSibling?.querySelector("#sitio_web")).not.toBeNull();
    });
  }

  it("el error general que pone el módulo tiene el mismo marcado que el que pinta el servidor", () => {
    const delServidor = new window.DOMParser().parseFromString(htmlConErrorGeneral, "text/html").getElementById("general-error")!;
    expect(delServidor).not.toBeNull();
    expect(delServidor.className).toBe(CLASE_MENSAJE_ERROR);
    expect(delServidor.getAttribute("role")).toBe("alert");
    expect(delServidor.textContent).toBe(`⚠ ${MENSAJES_ERROR_REGISTRO.servidor}`);
  });
});

describe("mejora progresiva en el DOM · sin las APIs del navegador", () => {
  for (const falta of ["fetch", "DOMParser", "FormData"] as const) {
    it(`sin ${falta}: no instala nada y el envío es el nativo`, () => {
      const { falsa, llamadas } = ventana([]);
      const incompleta = { ...falsa, [falta]: undefined } as unknown as VentanaDelRegistro;
      mejorar(incompleta);
      expect(campo<HTMLTextAreaElement>("queOfreces").placeholder).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
      expect(enviar()).toBe(true); // nadie previno el envío nativo
      expect(llamadas).toEqual([]);
      expect(formulario().querySelector("button")!.textContent).not.toBe(TEXTO_ENVIANDO);
    });
  }
});

describe("mejora progresiva en el DOM · la red se cuelga", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("si no hay respuesta en el tiempo de espera, cancela el fetch y regresa al envío nativo (una sola vez)", async () => {
    vi.useFakeTimers();
    const { falsa, llamadas, assign } = ventana([], { pausar: true });
    mejorar(falsa);
    const original = formulario();
    const nativo = vi.spyOn(original, "submit").mockImplementation(() => {});
    enviar();
    expect(llamadas).toHaveLength(1);
    const senal = llamadas[0].init.signal;
    expect(senal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DEL_ENVIO_MS - 1);
    expect(nativo).not.toHaveBeenCalled();
    expect(original.querySelector("button")!.textContent).toBe(TEXTO_ENVIANDO);

    await vi.advanceTimersByTimeAsync(1);
    expect(senal?.aborted).toBe(true);
    expect(nativo).toHaveBeenCalledTimes(1);
    // Sin otro fetch, sin navegar por su cuenta y sin el error general: el
    // navegador ya está enviando el formulario.
    expect(llamadas).toHaveLength(1);
    expect(assign).not.toHaveBeenCalled();
    expect(document.getElementById("general-error")).toBeNull();
    // Un envío más mientras el nativo está en curso no manda nada más.
    enviar();
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DEL_ENVIO_MS);
    expect(llamadas).toHaveLength(1);
    expect(nativo).toHaveBeenCalledTimes(1);
  });

  it("es razonable: entre 30 s y 2 min (una foto de 5 MB en una red lenta cabe)", () => {
    expect(ESPERA_MAXIMA_DEL_ENVIO_MS).toBeGreaterThanOrEqual(30_000);
    expect(ESPERA_MAXIMA_DEL_ENVIO_MS).toBeLessThanOrEqual(120_000);
  });

  it("si la respuesta llega a tiempo, el reloj no dispara el envío nativo después", async () => {
    vi.useFakeTimers();
    const { falsa, assign } = ventana([{ status: 200, url: `${ORIGEN}/registro/gracias`, html: "<main>gracias</main>" }]);
    mejorar(falsa);
    const nativo = vi.spyOn(formulario(), "submit").mockImplementation(() => {});
    enviar();
    await vi.advanceTimersByTimeAsync(0);
    expect(assign).toHaveBeenCalledWith("/registro/gracias");
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_DEL_ENVIO_MS * 2);
    expect(nativo).not.toHaveBeenCalled();
  });
});

describe("el DOM de pruebas no sale a la red (c-seguridad 3b-1, observación 3)", () => {
  it("las <link> y <script src> de un documento de DOMParser o del documento no se piden", async () => {
    let pedidas = 0;
    const servidor = createServer((_peticion, respuesta) => {
      pedidas += 1;
      respuesta.end("");
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    try {
      const html = `<html><head><link rel="stylesheet" href="${base}/hoja.css"><script src="${base}/codigo.js"></script></head><body><link rel="stylesheet" href="${base}/otra.css"></body></html>`;
      new window.DOMParser().parseFromString(html, "text/html");
      const enLaPagina = document.createElement("link");
      enLaPagina.rel = "stylesheet";
      enLaPagina.href = `${base}/de-la-pagina.css`;
      document.head.append(enLaPagina);
      const script = document.createElement("script");
      script.src = `${base}/de-la-pagina.js`;
      document.head.append(script);
      await new Promise((r) => setTimeout(r, 300));
      expect(pedidas).toBe(0);
      enLaPagina.remove();
      script.remove();
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });
});
