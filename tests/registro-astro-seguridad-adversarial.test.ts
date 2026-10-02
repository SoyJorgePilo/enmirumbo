/**
 * c-seguridad 3b-1 (change `migrar-registro-astro`): pruebas adversariales del
 * registro contra la SALIDA SERVIDA (emulador del Build Output API). Lo que el
 * camino feliz del dev no cubre: fotos hostiles por contenido, MIME y nombre;
 * metadatos raros; fotos de ~39 MP a la vez; multipart con campos duplicados y
 * cuerpos que no son formulario; XSS reflejado al repintar; la llave del cupo
 * por IP; nombres y rutas raras de la Action; orígenes ajenos.
 *
 * `[c-seguridad M1 3b-1]`: un multipart malformado (una parte sin `name`)
 * recibe el formulario con el error general que pide la spec. Antes el
 * renderizador de React de Astro volvía a leer el cuerpo (`getFormState` →
 * `request.clone().formData()`) y la respuesta se cortaba después de mandar
 * las cabeceras; corregido en `src/astro/acciones.ts`
 * (`pintarSinReleerElCuerpo`).
 *
 * Todo ficticio: WhatsApp 77199915xx, IPs de documentación (RFC 5737), fotos
 * generadas aquí (ninguna real).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { erroresDelFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { nombreDeObjeto } from "../src/lib/fotos/almacen";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const WHATSAPP = Array.from({ length: 60 }, (_, i) => `77199915${String(i).padStart(2, "0")}`);
const ACCION = "/registro?_action=registrar";

let prisma: PrismaClient;
let emulador: Emulador;
let categoriaId = "";
let coloniaId = "";
let siguiente = 0;
let ip = 0;
const otroWhatsapp = () => WHATSAPP[siguiente++];
const otraIp = () => `198.51.100.${150 + (ip++ % 100)}`;

/** Un registro válido como `FormData`, con lo que se agregue al final. */
function formulario(whatsapp: string, extra: Array<[string, string | Blob, string?]> = []): FormData {
  const f = new FormData();
  for (const [k, v] of [
    ["sitio_web", ""],
    ["nombre", "Taller Ficticio Adversarial"],
    ["categoriaId", categoriaId],
    ["whatsapp", whatsapp],
    ["coloniaId", coloniaId],
    ["consentimiento", "on"],
    ["avisoVersion", VERSION_AVISO],
  ]) f.append(k, v);
  for (const [k, v, nombre] of extra) {
    if (typeof v === "string") f.append(k, v);
    else f.append(k, v, nombre);
  }
  return f;
}

async function enviar(cuerpo: BodyInit, cabeceras: Record<string, string> = {}, ruta = ACCION, e: Emulador = emulador) {
  const r = await e.pedir(ruta, { method: "POST", body: cuerpo, headers: { origin: e.base, "x-forwarded-for": otraIp(), ...cabeceras } });
  return { status: r.status, location: r.headers.get("location"), cabeceras: r.headers, html: await r.text() };
}

const foto = (bytes: Buffer, tipo: string) => new Blob([new Uint8Array(bytes)], { type: tipo });
const archivosDelAlmacen = () => (existsSync(FOTOS_DIR) ? readdirSync(FOTOS_DIR).filter((n) => statSync(path.join(FOTOS_DIR, n)).isFile()) : []);
const fichas = (whatsapp: string) => prisma.negocio.findMany({ where: { whatsapp } });

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = String((await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  coloniaId = String((await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id);
  emulador = await levantarEmulador({ NODE_ENV: "development", SITIO_URL: "https://enmirumbo.example", FOTOS_DIR, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" });
}, 300_000);

afterAll(async () => {
  emulador?.detener();
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
});

describe("c-seguridad 3b-1 · fotos hostiles sobre la build", () => {
  it("lo que no es JPG, PNG o WebP por CONTENIDO no pasa, diga lo que diga el MIME o la extensión", async () => {
    const pngValido = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#00f" } }).png().toBuffer();
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#f00" } }).gif().toBuffer();
    const casos: Array<[string, Buffer, string, string]> = [
      ["polyglot GIF/JS", Buffer.from("GIF89a/*\x01\x00\x01\x00\x00\x00\x00*/=1;alert(1)//;"), "x.jpg", "image/jpeg"],
      ["GIF de verdad", gif, "x.gif", "image/gif"],
      ["SVG con script como JPEG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.jpg", "image/jpeg"],
      ["PDF", Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), "x.pdf", "application/pdf"],
      ["HTML como PNG", Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png"],
      ["PNG con la cabecera y nada más", pngValido.subarray(0, 40), "x.png", "image/png"],
    ];
    const antes = archivosDelAlmacen().length;
    for (const [nombre, bytes, archivo, tipo] of casos) {
      const whatsapp = otroWhatsapp();
      const r = await enviar(formulario(whatsapp, [["foto", foto(bytes, tipo), archivo]]));
      expect(r.status, nombre).toBe(200);
      expect([MENSAJES_ERROR_FOTO.noEsImagen, MENSAJES_ERROR_FOTO.errorProcesamiento], nombre).toContain(erroresDelFormulario(r.html).foto);
      expect(await fichas(whatsapp), nombre).toHaveLength(0);
    }
    expect(archivosDelAlmacen().length).toBe(antes);
  }, 60_000);

  it("un JPEG truncado no tumba nada: vuelve con el mensaje de la foto, sin ficha ni archivos", async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#0a0", noise: { type: "gaussian", mean: 128, sigma: 30 } } }).jpeg().toBuffer();
    const whatsapp = otroWhatsapp();
    const antes = archivosDelAlmacen().length;
    const r = await enviar(formulario(whatsapp, [["foto", foto(jpg.subarray(0, jpg.length >> 1), "image/jpeg"), "a.jpg"]]));
    expect(r.status).toBe(200);
    expect([MENSAJES_ERROR_FOTO.noEsImagen, MENSAJES_ERROR_FOTO.errorProcesamiento]).toContain(erroresDelFormulario(r.html).foto);
    expect(await fichas(whatsapp)).toHaveLength(0);
    expect(archivosDelAlmacen().length).toBe(antes);
  });

  it("nombres de archivo hostiles (traversal, NUL, RTL, 5000 caracteres) no deciden dónde ni cómo se guarda", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#00f" } }).png().toBuffer();
    for (const nombre of ["../../../../seg-3b1-traversal.jpg", "a\0b.jpg", "ñ😀‮gpj.exe", `${"x".repeat(5000)}.jpg`, "..\\..\\seg-3b1-win.jpg"]) {
      const whatsapp = otroWhatsapp();
      const antes = new Set(archivosDelAlmacen());
      const r = await enviar(formulario(whatsapp, [["foto", foto(png, "image/png"), nombre]]));
      expect(r.status, nombre.slice(0, 20)).toBe(303);
      const [ficha] = await fichas(whatsapp);
      expect(ficha.fotoClave, nombre.slice(0, 20)).toMatch(/^[0-9a-f]{32}$/);
      expect(archivosDelAlmacen().filter((n) => !antes.has(n)).sort()).toEqual(
        [nombreDeObjeto(ficha.fotoClave!, "ficha"), nombreDeObjeto(ficha.fotoClave!, "tarjeta")].sort(),
      );
    }
    for (const fuera of [path.resolve(FOTOS_DIR, "../../../../seg-3b1-traversal.jpg"), path.resolve(FOTOS_DIR, "..", "seg-3b1-traversal.jpg"), path.join(raiz, "seg-3b1-win.jpg")]) {
      expect(existsSync(fuera), fuera).toBe(false);
    }
  }, 60_000);

  it("WebP con EXIF (GPS), XMP e ICC, y un JPEG CMYK: las variantes salen sin ningún metadato", async () => {
    const conMetadatos = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#808080" } })
      .withMetadata({ icc: "p3" })
      .withExif({ IFD0: { Make: "MarcaFicticia", Model: "ModeloDeMentiras" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 50/1 12/1" } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="19,50.2N" exif:Make="MarcaFicticia"/></rdf:RDF></x:xmpmeta>')
      .webp()
      .toBuffer();
    const entrada = await sharp(conMetadatos).metadata();
    expect([Boolean(entrada.exif), Boolean(entrada.xmp), Boolean(entrada.icc)]).toEqual([true, true, true]);
    const cmyk = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#c80" } })
      .withExif({ IFD0: { Make: "MarcaFicticia" } })
      .toColourspace("cmyk")
      .jpeg()
      .toBuffer();
    for (const [nombre, bytes, tipo] of [["webp", conMetadatos, "image/webp"], ["cmyk", cmyk, "image/jpeg"]] as const) {
      const whatsapp = otroWhatsapp();
      const r = await enviar(formulario(whatsapp, [["foto", foto(bytes, tipo), `m.${nombre}`]]));
      expect(r.status, nombre).toBe(303);
      const [ficha] = await fichas(whatsapp);
      for (const variante of ["ficha", "tarjeta"] as const) {
        const guardado = readFileSync(path.join(FOTOS_DIR, nombreDeObjeto(ficha.fotoClave!, variante)));
        const meta = await sharp(guardado).metadata();
        expect([meta.format, meta.exif, meta.xmp, meta.icc], `${nombre} ${variante}`).toEqual(["webp", undefined, undefined, undefined]);
        expect(guardado.includes("MarcaFicticia"), `${nombre} ${variante}`).toBe(false);
        expect(guardado.includes("GPSLatitude"), `${nombre} ${variante}`).toBe(false);
      }
    }
  }, 60_000);

  it("ocho fotos de ~39 MP (válidas, pocos bytes) a la vez: el semáforo de la función sigue vigente, sin 500 ni huérfanos; 40.2 MP no pasa", async () => {
    const lado = 6240; // 38.9 MP: justo bajo el tope de 40 MP.
    const bomba = await sharp({ create: { width: lado, height: lado, channels: 3, background: "#777" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomba.length).toBeLessThan(1024 * 1024);
    const numeros = Array.from({ length: 8 }, () => otroWhatsapp());
    const antes = new Set(archivosDelAlmacen());
    const resultados = await Promise.all(numeros.map((w) => enviar(formulario(w, [["foto", foto(bomba, "image/png"), "b.png"]]))));
    expect(resultados.map((r) => r.status).filter((s) => s !== 303 && s !== 200)).toEqual([]);
    const aceptados = resultados.filter((r) => r.status === 303);
    const ocupados = resultados.filter((r) => r.status === 200);
    expect(aceptados.length).toBeGreaterThanOrEqual(1);
    expect(ocupados.length).toBeGreaterThanOrEqual(1);
    for (const r of ocupados) expect(erroresDelFormulario(r.html)).toEqual({ foto: MENSAJES_ERROR_FOTO.servidorOcupado });
    const claves = (await prisma.negocio.findMany({ where: { whatsapp: { in: numeros } } })).map((f) => f.fotoClave);
    expect(claves).toHaveLength(aceptados.length);
    expect(archivosDelAlmacen().filter((n) => !antes.has(n))).toHaveLength(2 * aceptados.length);

    const lado2 = 6340; // 40.2 MP
    const encima = await sharp({ create: { width: lado2, height: lado2, channels: 3, background: "#777" } }).png({ compressionLevel: 9 }).toBuffer();
    const whatsapp = otroWhatsapp();
    const r = await enviar(formulario(whatsapp, [["foto", foto(encima, "image/png"), "e.png"]]));
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(r.html).foto).toBe(MENSAJES_ERROR_FOTO.noEsImagen);
    expect(await fichas(whatsapp)).toHaveLength(0);
  }, 120_000);
});

describe("c-seguridad 3b-1 · cuerpos raros sobre la build", () => {
  it("campos duplicados, __proto__, constructor y estado: manda el primero, y nada fija estado, origen ni versión", async () => {
    const whatsapp = otroWhatsapp();
    const segundo = otroWhatsapp();
    const r = await enviar(
      formulario(whatsapp, [["whatsapp", segundo], ["avisoVersion", "0"], ["estado", "publicado"], ["origen", "importado"], ["__proto__", "x"], ["constructor", "y"]]),
    );
    expect(r.status).toBe(303);
    expect(r.location).toBe("/registro/gracias");
    const [ficha] = await fichas(whatsapp);
    expect(ficha).toMatchObject({ estado: "en_revision", origen: "organico", consintioAvisoVersion: VERSION_AVISO });
    expect(await fichas(segundo)).toHaveLength(0);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("un cuerpo que no es formulario (JSON, text/plain o sin tipo): 200 con el formulario y el error general, sin escribir", async () => {
    const antes = await prisma.negocio.count();
    for (const [nombre, cuerpo, tipo] of [
      ["json", JSON.stringify({ nombre: "X", whatsapp: otroWhatsapp() }), "application/json"],
      ["texto", "nombre=X", "text/plain"],
      ["xml", "<a/>", "application/xml"],
    ] as const) {
      const r = await enviar(cuerpo, { "content-type": tipo });
      expect(r.status, nombre).toBe(200);
      expect(erroresDelFormulario(r.html), nombre).toEqual({ general: MENSAJES_ERROR_REGISTRO.servidor });
      expect(r.html, nombre).toContain('action="?_action=registrar"');
    }
    expect(await prisma.negocio.count()).toBe(antes);
  });

  it("[c-seguridad M1 3b-1] un multipart con una parte sin `name`: 200 con el formulario y el error general (antes la respuesta se cortaba tras las cabeceras)", async () => {
    // Emulador propio: antes esta petición también tumbaba al emulador
    // (`scripts/servir-salida-vercel.mjs` escribía la cabecera y luego fallaba
    // al leer el cuerpo de la respuesta).
    const propio = await levantarEmulador({ NODE_ENV: "development", FOTOS_DIR });
    try {
      const limite = "limite-adversarial";
      const cuerpo = `--${limite}\r\nContent-Disposition: form-data\r\n\r\nsin nombre\r\n--${limite}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\nX\r\n--${limite}--\r\n`;
      const r = await enviar(cuerpo, { "content-type": `multipart/form-data; boundary=${limite}` }, ACCION, propio);
      expect(r.status).toBe(200);
      expect(erroresDelFormulario(r.html)).toEqual({ general: MENSAJES_ERROR_REGISTRO.servidor });
    } finally {
      propio.detener();
    }
  }, 60_000);
});

describe("c-seguridad 3b-1 · XSS reflejado al repintar", () => {
  it("lo capturado vuelve escapado en el formulario, y nada se refleja en las cabeceras", async () => {
    const carga = `"><script>alert(1)</script><img src=x onerror=alert(2)><form id=categoriaId>`;
    const f = formulario("12345", [["direccion", carga], ["horario", carga.slice(0, 90)], ["coloniaOtra", carga.slice(0, 70)], ["facebookUrl", "javascript:alert(1)"]]);
    f.set("nombre", carga.slice(0, 80));
    const r = await enviar(f);
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(r.html)).toMatchObject({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp });
    expect(r.html).not.toContain("<script>alert(1)");
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).not.toContain("<form id=categoriaId");
    expect(r.html).not.toMatch(/href="javascript:/i);
    expect(r.html.match(/<form\b/g)).toHaveLength(1);
    for (const [k, v] of r.cabeceras) expect(`${k}: ${v}`).not.toContain("alert");
    expect(r.cabeceras.get("set-cookie")).toBeNull();
  });
});

describe("c-seguridad 3b-1 · la llave del cupo por IP", () => {
  it("rotar x-real-ip, x-vercel-forwarded-for y el primer valor, o escribir la misma IP con puerto o corchetes, no da más cupo", async () => {
    const ipFija = "203.0.113.161";
    const estados: number[] = [];
    for (const [i, ultimo] of [ipFija, `${ipFija}:1234`, `[${ipFija}]`].entries()) {
      const r = await enviar(formulario(otroWhatsapp()), {
        "x-forwarded-for": `192.0.2.${10 + i}, ${ultimo}`,
        "x-real-ip": `192.0.2.${50 + i}`,
        "x-vercel-forwarded-for": `192.0.2.${90 + i}`,
      });
      estados.push(r.status);
    }
    expect(estados).toEqual([303, 303, 303]);
    const whatsapp = otroWhatsapp();
    const cuarto = await enviar(formulario(whatsapp), { "x-forwarded-for": ` ${ipFija} `, "x-real-ip": "192.0.2.99" });
    expect(cuarto.status).toBe(200);
    expect(erroresDelFormulario(cuarto.html)).toEqual({ general: MENSAJES_ERROR_REGISTRO.limiteIp });
    expect(await fichas(whatsapp)).toHaveLength(0);
  });
});

describe("c-seguridad 3b-1 · la Action solo corre en /registro, por POST y con su nombre", () => {
  it("rutas y nombres raros no crean ficha ni responden 500", async () => {
    for (const ruta of [
      "/REGISTRO?_action=registrar",
      "/registro/gracias?_action=registrar",
      "/404?_action=registrar",
      "/registro?_action=REGISTRAR",
      "/registro?_action=registrar%00",
      "/registro?_action=__proto__",
      "/registro?_action=reportar",
      "/_actions/registrar/",
    ]) {
      const whatsapp = otroWhatsapp();
      const r = await enviar(formulario(whatsapp), {}, ruta);
      expect(r.status, ruta).not.toBe(500);
      expect(r.status, ruta).not.toBe(303);
      expect(await fichas(whatsapp), ruta).toHaveLength(0);
    }
  });

  it("GET /registro?_action=registrar solo pinta el formulario vacío", async () => {
    const r = await emulador.pedir("/registro?_action=registrar");
    expect(r.status).toBe(200);
    expect(erroresDelFormulario(await r.text())).toEqual({});
  });

  it("orígenes ajenos (null, otro sitio, sufijo del host, Origin vacío): 403 y sin ficha", async () => {
    for (const origen of ["null", "https://evil.example", `${emulador.base}.evil.example`, ""]) {
      const whatsapp = otroWhatsapp();
      const r = await enviar(formulario(whatsapp), { origin: origen });
      expect(r.status, origen).toBe(403);
      expect(await fichas(whatsapp), origen).toHaveLength(0);
    }
  });
});
