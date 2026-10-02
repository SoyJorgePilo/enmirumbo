/**
 * Etapa C (seguridad y pruebas adversariales) del change
 * `migrar-directorio-publico-astro` (T-023, Fase 2b).
 *
 * Todo contra la SALIDA SERVIDA (build real + emulador del Build Output API),
 * no contra componentes sueltos: lo que se audita es lo que recibe un vecino
 * (o un atacante) de `/[destino]`, `/negocio/[ficha]`, `/buscar` y
 * `/api/foto/[clave]/[variante]`.
 *
 * Bloques:
 *  1. Fotos: codificaciones que el dev no probó, las cuatro claves no
 *     publicadas (revisión, rechazada, despublicada y BORRADA con el archivo
 *     aún en disco) con GET y HEAD, y una cookie o consulta "de admin" que la
 *     ruta pública debe ignorar.
 *  2. Fichas no publicadas: variantes de URL (con el nombre real en la URL,
 *     mayúsculas, NUL, sin guion, como destino de la raíz, HEAD, consulta
 *     hostil) → mismo 404 que una inexistente, sin un solo dato.
 *  3. Escape: un negocio PUBLICADO con marcado hostil en todos sus campos de
 *     texto libre (como si hubiera saltado la validación del formulario), y
 *     `?q=`, `?colonia=` y `?pagina=` hostiles.
 *  4. Ninguna 404 lleva la medición ni datos de la petición.
 *  5. Cabeceras: URLs de la CDN que ahora caen en `/[destino]`, y la base caída.
 *  6. Las normalizaciones del diff no tapan lo que importa (y lo que sí tapan).
 *
 * Datos 100% ficticios (serie 77199968xx, dominio `.example`).
 */
import { createHash } from "node:crypto";
import path from "node:path";

import { parse } from "node-html-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { compararRespuestas } from "../scripts/diff-html/nucleo.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_SRC, VARIABLE_WEBSITE_ID } from "../src/lib/analitica/config";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { procesarFoto } from "../src/lib/fotos/procesar";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { jpegDePrueba } from "./fotos-fixtures";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FOTOS_DIR = path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test");
const URL_PUBLICA = "https://enmirumbo.example";
const SRC = "https://cloud.umami.is/script.js";
const WEBSITE_ID = "00000000-0000-4000-8000-0000000000c5";
const CLAVE_DB_FICTICIA = "claveFicticiaAuditoria2b";

/** Marcado hostil: cierre de script, atributo de evento, separador U+2028 y bidi. */
const HOSTIL = `</script><script>alert(1)</script>"><img src=x onerror=alert(2)>\u2028\u202e'&amp;`;
const NOMBRE_HOSTIL = `Taller Zx9 Hostil ${HOSTIL}`;

const W = {
  publicado: "7719996801",
  revision: "7719996802",
  rechazado: "7719996803",
  despublicado: "7719996804",
  borrado: "7719996805",
};

/** Marcadores únicos de los no publicados: si aparecen en una respuesta, se filtró. */
const NO_PUBLICADOS = {
  revision: { nombre: "Auditoriarev Qm4 Ficticio", colonia: "Colonia Auditcolrev Pz1", oferta: "Ofertaauditrev secreta" },
  rechazado: { nombre: "Auditoriarech Lw8 Ficticio", colonia: "Colonia Auditcolrech Tn5", oferta: "Ofertaauditrech secreta" },
  despublicado: { nombre: "Auditoriadesp Jr2 Ficticio", colonia: "Colonia Auditcoldesp Vb6", oferta: "Ofertaauditdesp secreta" },
  borrado: { nombre: "Auditoriaborr Hk7 Ficticio", colonia: "Colonia Auditcolborr Sx3", oferta: "Ofertaauditborr secreta" },
} as const;
type NoPublicado = keyof typeof NO_PUBLICADOS;

let prisma: PrismaClient;
let emulador: Emulador;
let baseCaida: Emulador;
const ids: Record<"publicado" | NoPublicado, string> = { publicado: "", revision: "", rechazado: "", despublicado: "", borrado: "" };
const claves: Record<"publicado" | NoPublicado, string> = { publicado: "", revision: "", rechazado: "", despublicado: "", borrado: "" };
const TOKEN_HASH_FICTICIO = "f".repeat(40) + "0123456789abcdef0123456789ab";
const MOTIVO_INTERNO = "Motivointerno auditoria nunca publico";

async function guardarFoto(): Promise<string> {
  const clave = generarClaveFoto();
  const procesada = await procesarFoto(await jpegDePrueba(800, 600));
  if (!procesada.ok) throw new Error(procesada.motivo);
  await almacenDeFotos().guardar(clave, "tarjeta", procesada.variantes.tarjeta);
  await almacenDeFotos().guardar(clave, "ficha", procesada.variantes.ficha);
  return clave;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.negocio.deleteMany({ where: { whatsapp: { in: Object.values(W) } } });
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { slug: "talleres" } });
  const colonia = await prisma.colonia.findFirstOrThrow({ where: { slug: "huitzila" } });

  claves.publicado = await guardarFoto();
  const oferta = `Ofrezco ${HOSTIL} reparaciones`;
  const publicado = await prisma.negocio.create({
    data: {
      nombre: NOMBRE_HOSTIL,
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      whatsapp: W.publicado,
      estado: "publicado",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      queOfreces: oferta,
      direccion: `Calle ${HOSTIL} 1`,
      horario: `Lunes ${HOSTIL}`,
      telefonoFijo: `no marcable ${HOSTIL}`,
      facebookUrl: "javascript:alert(document.domain)//https://facebook.com/x",
      fotoClave: claves.publicado,
      tokenGestionHash: TOKEN_HASH_FICTICIO,
      motivoRechazo: MOTIVO_INTERNO,
      ...datosDeBusqueda(NOMBRE_HOSTIL, oferta),
    },
  });
  ids.publicado = publicado.id;

  for (const tipo of Object.keys(NO_PUBLICADOS) as NoPublicado[]) {
    const m = NO_PUBLICADOS[tipo];
    claves[tipo] = await guardarFoto();
    const creado = await prisma.negocio.create({
      data: {
        nombre: m.nombre,
        categoriaId: categoria.id,
        coloniaOtra: m.colonia,
        whatsapp: W[tipo],
        estado: tipo === "rechazado" ? "rechazado" : "en_revision",
        consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
        queOfreces: m.oferta,
        fotoClave: claves[tipo],
        ...datosDeBusqueda(m.nombre, m.oferta),
        ...(tipo === "despublicado"
          ? { publicadoEn: new Date("2026-08-02T10:00:00.000Z"), despublicadoEn: new Date("2026-09-01T10:00:00.000Z") }
          : {}),
      },
    });
    ids[tipo] = creado.id;
  }
  // Borrado (ARCO) en el peor caso: el registro ya no existe pero sus archivos
  // siguen en el almacén.
  await prisma.negocio.delete({ where: { id: ids.borrado } });

  construirSiHaceFalta();
  const medicion = { [VARIABLE_SRC]: SRC, [VARIABLE_WEBSITE_ID]: WEBSITE_ID };
  emulador = await levantarEmulador({ NODE_ENV: "development", SITIO_URL: URL_PUBLICA, FOTOS_DIR, ...medicion });
  baseCaida = await levantarEmulador({
    SITIO_URL: URL_PUBLICA,
    DATABASE_URL: `postgresql://usuario:${CLAVE_DB_FICTICIA}@127.0.0.1:1/ninguna`,
    ...medicion,
  });
}, 240_000);

afterAll(async () => {
  emulador?.detener();
  baseCaida?.detener();
  // Los negocios y TODAS sus fotos (también las del borrado, que ya no tiene
  // registro): la base y el almacén son compartidos (hallazgo A1).
  if (prisma) await borrarNegociosSembrados(prisma, Object.values(W), Object.values(claves));
  await prisma?.$disconnect();
});

const foto = (clave: string, variante: string) => `/api/foto/${clave}/${variante}`;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function lasCuatro(r: Response, etiqueta: string) {
  for (const { key, value } of cabecerasDeSeguridad()) expect(r.headers.get(key), `${etiqueta} · ${key}`).toBe(value);
  expect(r.headers.get("x-powered-by"), etiqueta).toBeNull();
}

async function huella(r: Response) {
  return {
    status: r.status,
    cabeceras: [...r.headers.entries()].filter(([n]) => n !== "date").sort(),
    cuerpo: sha(new Uint8Array(await r.arrayBuffer())),
  };
}

/** Todo lo que no puede salir de un negocio no publicado. */
function prohibidosDe(tipo: NoPublicado): string[] {
  const m = NO_PUBLICADOS[tipo];
  return [ids[tipo], claves[tipo], m.nombre, m.colonia, m.oferta, W[tipo], "Auditoria", "auditoria"];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fotos
// ─────────────────────────────────────────────────────────────────────────────

describe("c-seguridad 2b · fotos de lo no publicado", () => {
  it("revisión, rechazada, despublicada y borrada (archivo aún en disco), GET y HEAD: el mismo 404 vacío que una clave inventada", async () => {
    const referencia = await huella(await emulador.pedir(foto("0123456789abcdef0123456789abcdef", "ficha")));
    expect(referencia.status).toBe(404);
    for (const tipo of Object.keys(NO_PUBLICADOS) as NoPublicado[]) {
      for (const variante of ["tarjeta", "ficha"]) {
        for (const method of ["GET", "HEAD"]) {
          const ruta = foto(claves[tipo], variante);
          const r = await emulador.pedir(ruta, { method });
          lasCuatro(r, `${method} ${tipo} ${variante}`);
          expect(r.headers.get("cache-control"), ruta).toBe("no-store");
          expect(r.headers.get("location"), ruta).toBeNull();
          const h = await huella(r);
          if (method === "GET") expect(h, `${tipo} ${variante}`).toEqual(referencia);
          else expect(h.status, `HEAD ${tipo}`).toBe(404);
        }
      }
    }
  });

  it("una cookie o una consulta 'de admin' no abren la foto de un registro en revisión por la ruta pública", async () => {
    for (const [ruta, init] of [
      [`${foto(claves.revision, "ficha")}?admin=1&sesion=1`, {}],
      [foto(claves.revision, "ficha"), { headers: { cookie: "sesion_admin=1; admin=1; enmirumbo_admin=cualquiera" } }],
      [foto(claves.revision, "ficha"), { headers: { authorization: "Bearer cualquiera" } }],
    ] as const) {
      const r = await emulador.pedir(ruta, init as RequestInit);
      expect(r.status, ruta).toBe(404);
      expect((await r.arrayBuffer()).byteLength, ruta).toBe(0);
    }
  });
});

describe("c-seguridad 2b · fotos con codificaciones hostiles", () => {
  it("doble codificación, NUL, salto de línea, barra invertida, sufijos y ancho completo: nada responde 200 ni sale un byte de imagen o de archivo", async () => {
    const p = () => claves.publicado;
    const rutas = [
      "/api/foto/%252e%252e%252f%252e%252e%252fpackage.json/ficha",
      "/api/foto/..%5c..%5cpackage.json/ficha",
      `/api/foto/${p()}%0a/ficha`,
      `/api/foto/${p()}%20/ficha`,
      `/api/foto/%20${p()}/ficha`,
      `/api/foto/${p()}.webp/ficha`,
      `/api/foto/${p()}.ficha.webp/ficha`,
      `/api/foto/${p()}/ficha.webp`,
      `/api/foto/${p()}/ficha%00`,
      `/api/foto/${p()}/ficha%0a`,
      `/api/foto/${p()}/%EF%BD%86%EF%BD%89%EF%BD%83%EF%BD%88%EF%BD%81`, // "ｆｉｃｈａ"
      `/api/foto/${p().slice(0, 31)}/ficha`,
      `/api/foto/${p()}0/ficha`,
      `/api/foto/${p().slice(0, 16).toUpperCase()}${p().slice(16)}/ficha`,
      `/api/foto/${claves.revision}%2F..%2F${p()}/ficha`,
      `/api/foto/${"a".repeat(5000)}/ficha`,
      "/api/foto/%E0%A4%A/ficha",
    ];
    for (const ruta of rutas) {
      const r = await emulador.pedir(ruta);
      const cuerpo = Buffer.from(await r.arrayBuffer());
      expect(r.status, ruta).not.toBe(200);
      expect(r.status, ruta).toBeGreaterThanOrEqual(400);
      expect(r.status, ruta).toBeLessThan(500);
      expect(cuerpo.includes(Buffer.from("RIFF")), ruta).toBe(false);
      expect(cuerpo.includes(Buffer.from("WEBP")), ruta).toBe(false);
      expect(cuerpo.toString(), ruta).not.toMatch(/"dependencies"|DATABASE_URL|\.fotos-test|node_modules/);
      expect(r.headers.get("location"), ruta).toBeNull();
      lasCuatro(r, ruta);
    }
  });

  it("la foto publicada no trae EXIF/GPS ni nada del almacén en cabeceras", async () => {
    const r = await emulador.pedir(foto(claves.publicado, "ficha"));
    expect(r.status).toBe(200);
    const cuerpo = Buffer.from(await r.arrayBuffer());
    for (const marca of ["Exif", "EXIF", "GPS", "XMP ", "<x:xmpmeta"]) expect(cuerpo.includes(Buffer.from(marca)), marca).toBe(false);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(JSON.stringify([...r.headers.entries()])).not.toMatch(/supabase|storage|fotos-test|\.webp/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fichas no publicadas
// ─────────────────────────────────────────────────────────────────────────────

describe("c-seguridad 2b · fichas no publicadas por cualquier variante de URL", () => {
  it("con el nombre real en la URL, mayúsculas, NUL, sin guion, consulta hostil o como destino: el mismo 404 byte a byte, sin un solo dato", async () => {
    const referencia = await emulador.pedir("/negocio/x-cnoexiste0000000000000000");
    expect(referencia.status).toBe(404);
    const cuerpoReferencia = await referencia.text();
    const cabecerasReferencia = [...referencia.headers.entries()].filter(([n]) => n !== "date").sort();

    for (const tipo of Object.keys(NO_PUBLICADOS) as NoPublicado[]) {
      const id = ids[tipo];
      const variantes = [
        `/negocio/${construirSegmentoFicha(NO_PUBLICADOS[tipo].nombre, id)}`,
        `/negocio/x-${id}`,
        `/negocio/x-${id.toUpperCase()}`,
        `/negocio/${id}`,
        `/negocio/x-${id}%00`,
        `/negocio/x-${id}?q=%3Cscript%3E&colonia=huitzila&pagina=2`,
        `/negocio/x-${encodeURIComponent(NO_PUBLICADOS[tipo].nombre)}-${id}`,
        `/${id}`,
        `/${construirSegmentoFicha(NO_PUBLICADOS[tipo].nombre, id)}`,
      ];
      for (const ruta of variantes) {
        const r = await emulador.pedir(ruta);
        const cuerpo = await r.text();
        expect(r.status, ruta).toBe(404);
        expect(cuerpo, ruta).toBe(cuerpoReferencia);
        expect([...r.headers.entries()].filter(([n]) => n !== "date").sort(), ruta).toEqual(cabecerasReferencia);
        const cabeceras = JSON.stringify([...r.headers.entries()]);
        for (const dato of prohibidosDe(tipo)) {
          expect(cuerpo, `${ruta} · ${dato}`).not.toContain(dato);
          expect(cabeceras, `${ruta} · ${dato}`).not.toContain(dato);
        }
      }
      const head = await emulador.pedir(`/negocio/x-${id}`, { method: "HEAD" });
      expect(head.status, `HEAD ${tipo}`).toBe(404);
      expect(await head.text(), `HEAD ${tipo}`).toBe("");
    }
  });

  it("las sub-rutas y la barra final de una ficha no publicada no delatan nada", async () => {
    for (const tipo of Object.keys(NO_PUBLICADOS) as NoPublicado[]) {
      for (const ruta of [`/negocio/x-${ids[tipo]}/`, `/negocio/x-${ids[tipo]}/reportar`, `/negocio/x-${ids[tipo]}/a/b`]) {
        const r = await emulador.pedir(ruta);
        expect([404, 308], ruta).toContain(r.status);
        const cuerpo = await r.text();
        for (const dato of prohibidosDe(tipo).filter((d) => d !== ids[tipo])) expect(cuerpo, `${ruta} · ${dato}`).not.toContain(dato);
        expect(cuerpo, ruta).not.toContain("<script");
        lasCuatro(r, ruta);
      }
    }
  });

  it("lo no publicado no aparece en el buscador, el listado ni el sitemap, ni buscado por su nombre exacto", async () => {
    for (const tipo of Object.keys(NO_PUBLICADOS) as NoPublicado[]) {
      for (const ruta of [
        `/buscar?q=${encodeURIComponent(NO_PUBLICADOS[tipo].nombre)}`,
        `/buscar?q=${encodeURIComponent(NO_PUBLICADOS[tipo].oferta)}`,
        "/talleres",
        "/talleres?colonia=huitzila",
        "/sitemap.xml",
      ]) {
        const cuerpo = await (await emulador.pedir(ruta)).text();
        for (const dato of prohibidosDe(tipo)) {
          // El eco de la consulta en /buscar es el texto que escribió el vecino, no un dato de la base.
          if (ruta.startsWith("/buscar") && (dato === NO_PUBLICADOS[tipo].nombre || dato === NO_PUBLICADOS[tipo].oferta || /uditoria/.test(dato))) continue;
          expect(cuerpo, `${ruta} · ${dato}`).not.toContain(dato);
        }
        if (ruta.startsWith("/buscar")) expect(cuerpo, ruta).not.toContain(`/negocio/`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Escape
// ─────────────────────────────────────────────────────────────────────────────

/** Etiquetas y atributos peligrosos en el árbol parseado. */
function peligros(html: string): string[] {
  const raizHtml = parse(html, { comment: false, blockTextElements: { script: true, style: true } });
  const salida: string[] = [];
  for (const nodo of raizHtml.querySelectorAll("*")) {
    const etiqueta = nodo.rawTagName.toLowerCase();
    if (etiqueta === "script") {
      const tipo = (nodo.getAttribute("type") ?? "").toLowerCase();
      const src = nodo.getAttribute("src");
      if (tipo === "application/ld+json") continue;
      if (src === SRC) continue;
      salida.push(`script ${nodo.toString().slice(0, 80)}`);
    }
    if (etiqueta === "img" && nodo.getAttribute("src") === "x") salida.push("img src=x");
    for (const nombre of Object.keys(nodo.attributes)) {
      if (/^on/i.test(nombre)) salida.push(`${etiqueta}[${nombre}]`);
      const valor = nodo.getAttribute(nombre) ?? "";
      if (/^(href|src|action|formaction)$/i.test(nombre) && /^\s*javascript:/i.test(valor)) salida.push(`${etiqueta}[${nombre}=javascript:]`);
    }
  }
  return salida;
}

describe("c-seguridad 2b · escape en la ficha publicada con texto hostil", () => {
  it("el HTML servido no gana scripts, imágenes ni atributos de evento, y no enlaza a javascript:", async () => {
    const r = await emulador.pedir(`/negocio/${construirSegmentoFicha(NOMBRE_HOSTIL, ids.publicado)}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(peligros(html)).toEqual([]);
    // Fuera de los valores de atributo entre comillas (donde `<` es inerte), el
    // marcado hostil solo puede aparecer escapado.
    const sinAtributos = html.replace(/="[^"]*"/g, '=""');
    expect(sinAtributos).not.toContain("<script>alert");
    expect(sinAtributos).not.toContain("<img src=x");
    expect(html).not.toMatch(/href="\s*javascript:/i);
  });

  it("el JSON-LD no rompe su <script>, se parsea y conserva el nombre literal, sin WhatsApp ni datos internos", async () => {
    const html = await (await emulador.pedir(`/negocio/x-${ids.publicado}`)).text();
    const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).not.toMatch(/<\/script/i);
    expect(bloques[0]).not.toContain("<");
    const datos = JSON.parse(bloques[0]);
    expect(datos.name).toBe(NOMBRE_HOSTIL);
    expect(JSON.stringify(datos)).not.toContain(W.publicado);
  });

  it("<title> y <meta> llevan el texto literal (escapado), y la ficha no expone WhatsApp en metadatos ni datos internos en ningún lado", async () => {
    const html = await (await emulador.pedir(`/negocio/x-${ids.publicado}`)).text();
    const doc = parse(html);
    expect(doc.querySelector("title")?.text).toContain("Taller Zx9 Hostil");
    expect(doc.querySelectorAll("head title")).toHaveLength(1);
    const ogTitulo = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
    expect(ogTitulo).toContain(HOSTIL.replace("\u2028", "\u2028"));
    const cabeza = doc.querySelector("head")?.toString() ?? "";
    expect(cabeza).not.toContain(W.publicado);
    expect(html).not.toContain(TOKEN_HASH_FICTICIO);
    expect(html).not.toContain(MOTIVO_INTERNO);
    // El <head> no gana elementos: solo meta, link y title (y ningún script).
    const etiquetasDelHead = new Set((doc.querySelector("head")?.childNodes ?? []).filter((n) => n.nodeType === 1).map((n) => (n as unknown as { rawTagName: string }).rawTagName.toLowerCase()));
    for (const e of etiquetasDelHead) expect(["meta", "link", "title"], e).toContain(e);
  });

  it("los atributos de medición solo llevan slugs (ni nombre, ni WhatsApp, ni id) aunque el nombre sea hostil", async () => {
    const html = await (await emulador.pedir(`/negocio/x-${ids.publicado}`)).text();
    const atributos = [...html.matchAll(/(data-umami-event(?:-[a-z-]+)?)="([^"]*)"/g)].map((m) => [m[1], m[2]]);
    expect(atributos.length).toBeGreaterThan(0);
    for (const [nombre, valor] of atributos) {
      expect(["data-umami-event", "data-umami-event-categoria", "data-umami-event-colonia"], nombre).toContain(nombre);
      expect(valor, nombre).toMatch(/^[a-z0-9-]+$/);
      expect(valor).not.toContain(ids.publicado);
      expect(valor).not.toContain(W.publicado);
    }
    expect(html.match(/<script\b[^>]*\bsrc=/g)).toHaveLength(1);
  });

  it("en el listado y en /buscar la tarjeta del negocio hostil tampoco inyecta nada", async () => {
    for (const ruta of ["/talleres", "/talleres?colonia=huitzila", "/buscar?q=Zx9"]) {
      const r = await emulador.pedir(ruta);
      expect(r.status, ruta).toBe(200);
      const html = await r.text();
      expect(html, ruta).toContain("Zx9");
      expect(peligros(html), ruta).toEqual([]);
    }
  });
});

describe("c-seguridad 2b · escape de lo que manda el vecino en la URL", () => {
  const CONSULTA = `"><script>alert(7777)</script></title><img src=y onerror=alert(8888)>`;

  it("/buscar: título estático, noindex,follow, una sola etiqueta <title>, sin script ni evento inyectado", async () => {
    for (const q of [CONSULTA, `${CONSULTA}&q=otra`, "Zx9", "zzzzqqqqnohay"]) {
      const r = await emulador.pedir(`/buscar?q=${q === `${CONSULTA}&q=otra` ? `${encodeURIComponent(CONSULTA)}&q=otra` : encodeURIComponent(q)}`);
      expect(r.status, q).toBe(200);
      const html = await r.text();
      const doc = parse(html);
      expect(doc.querySelectorAll("title"), q).toHaveLength(1);
      expect(doc.querySelector("title")?.text, q).toBe("Buscar — EnMiRumbo — EnMiRumbo");
      expect(doc.querySelector('meta[name="robots"]')?.getAttribute("content"), q).toBe("noindex, follow");
      expect(peligros(html), q).toEqual([]);
      expect(html.replace(/="[^"]*"/g, '=""'), q).not.toContain("<script>alert(7777)");
    }
    // Sin consulta también es no indexable.
    const sin = parse(await (await emulador.pedir("/buscar")).text());
    expect(sin.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow");
  });

  it("/buscar: el texto del vecino no llega al <head> ni a la medición (data-exclude-search)", async () => {
    const html = await (await emulador.pedir(`/buscar?q=${encodeURIComponent("Marcadorconsulta divorcio")}`)).text();
    const cabeza = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
    expect(cabeza).not.toContain("Marcadorconsulta");
    const script = /<script\b[^>]*src="[^"]*"[^>]*>/.exec(html)?.[0] ?? "";
    expect(script).toContain('data-exclude-search="true"');
  });

  it("?colonia= y ?pagina= hostiles, repetidos o enormes: 200, sin eco y canónica sin consulta", async () => {
    const hostiles = [
      `?colonia=${encodeURIComponent(CONSULTA)}`,
      `?colonia=huitzila&colonia=${encodeURIComponent(CONSULTA)}`,
      `?colonia=${encodeURIComponent(CONSULTA)}&colonia=huitzila`,
      `?colonia=${"a".repeat(8000)}`,
      `?pagina=${encodeURIComponent(CONSULTA)}`,
      "?pagina=-1&pagina=99999999999999999999",
      "?colonia=%E2%80%AE%EF%BB%BF",
    ];
    for (const consulta of hostiles) {
      const r = await emulador.pedir(`/talleres${consulta}`);
      expect(r.status, consulta).toBe(200);
      const html = await r.text();
      expect(peligros(html), consulta).toEqual([]);
      expect(html, consulta).not.toContain("7777");
      expect(html, consulta).not.toContain("8888");
      expect(html, consulta).not.toContain("a".repeat(100));
      const canonica = parse(html).querySelector('link[rel="canonical"]')?.getAttribute("href");
      expect(canonica, consulta).toBe(`${URL_PUBLICA}/talleres`);
    }
  });

  // Hallazgo M1 de c-seguridad 2b (preexistente en Next, mismo `src/lib`):
  // `obtenerColoniaPorSlug` manda el NUL a PostgreSQL, que lo rechaza
  // (22021), y la página responde 500 en vez de ignorar la colonia como dice
  // la spec. Cuando se corrija, esta prueba se pone roja y pasa a `it`.
  it.fails("[M1] ?colonia= con byte NUL se ignora como cualquier colonia fuera del catálogo (200)", async () => {
    const r = await emulador.pedir("/talleres?colonia=%00");
    expect(r.status).toBe(200);
  });

  it("[M1] mientras tanto, el 500 de ?colonia=%00 no trae traza, ni el error de la base, ni la medición, y sí las cuatro", async () => {
    for (const consulta of ["?colonia=%00", "?colonia=a%00b", "?colonia=huitzila%00"]) {
      const r = await emulador.pedir(`/talleres${consulta}`);
      const cuerpo = await r.text();
      lasCuatro(r, consulta);
      expect(cuerpo, consulta).not.toMatch(/22021|invalid byte|Prisma|\bat\s+\S+\s+\(|node_modules/);
      expect(cuerpo, consulta).not.toContain("umami");
      expect(r.headers.get("cache-control"), consulta).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    }
  });

  it("slugs hostiles en /[destino]: la misma 404 dinámica que /loquesea, sin eco", async () => {
    const referencia = await (await emulador.pedir("/loquesea")).text();
    for (const ruta of [
      "/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "/%22%3E%3Csvg%20onload%3Dalert(1)%3E",
      "/%E2%80%AEplomeria",
      "/plomeria%00",
      "/PLOMERIA",
      "/talleres%2F..%2Fadmin",
      `/${"a".repeat(5000)}`,
      "/plomeria-huitzila-huitzila",
      "/404.html.bak",
      "/loquesea?x=%3Cscript%3EMarcadorconsulta",
    ]) {
      const r = await emulador.pedir(ruta);
      expect(r.status, ruta).toBe(404);
      const html = await r.text();
      expect(html, ruta).toBe(referencia);
      lasCuatro(r, ruta);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Ninguna 404 se mide
// ─────────────────────────────────────────────────────────────────────────────

describe("c-seguridad 2b · ninguna 404 lleva la medición ni datos de la petición", () => {
  it("dinámicas, global, /404, /registro, sub-rutas y prefijos sueltos: sin script, sin umami y sin eco de la consulta", async () => {
    for (const ruta of [
      "/loquesea?utm_source=Marcadoreco",
      "/a/b/c?Marcadoreco=1",
      "/404",
      "/404/",
      "/registro",
      "/negocio",
      "/negocio/",
      "/api",
      "/api/foto",
      "/api/foto/x/y/z",
      `/negocio/x-${ids.revision}/reportar`,
      `/negocio/x-${ids.revision}?Marcadoreco=1`,
    ]) {
      const r = await emulador.pedir(ruta);
      // `/404` responde 200 con la página de no encontrado (hallazgo B1 de c-seguridad 2b).
      expect(ruta === "/404" ? [200] : [404, 308], ruta).toContain(r.status);
      const html = await r.text();
      expect(html, ruta).not.toContain("<script");
      expect(html, ruta).not.toContain("umami");
      expect(html, ruta).not.toContain(WEBSITE_ID);
      expect(html, ruta).not.toContain("Marcadoreco");
      lasCuatro(r, ruta);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cabeceras en rutas atípicas y con la base caída
// ─────────────────────────────────────────────────────────────────────────────

describe("c-seguridad 2b · cabeceras donde la CDN y la función se cruzan", () => {
  it("barras finales de prerenderizadas, /404 y /500: las cuatro, sin cabeceras del marco", async () => {
    for (const ruta of ["/opengraph-image/", "/404", "/404/", "/500", "/terminos/", "/aviso-de-privacidad/", "/favicon.ico/"]) {
      const r = await emulador.pedir(ruta);
      lasCuatro(r, `${ruta} (${r.status})`);
      for (const nombre of r.headers.keys()) expect(nombre, ruta).not.toMatch(/^x-(astro|nextjs|vercel-cache)/);
      expect(await r.text(), ruta).not.toContain("<script");
    }
  });

  it("con la base caída, las cuatro rutas responden sin traza, sin la URL de la base y con las cuatro cabeceras", async () => {
    for (const ruta of ["/talleres", `/negocio/x-${ids.publicado}`, "/buscar?q=plomero", "/loquesea", foto(claves.publicado, "ficha")]) {
      const r = await baseCaida.pedir(ruta);
      const cuerpo = await r.text();
      expect(r.status, ruta).not.toBe(200);
      lasCuatro(r, `${ruta} (${r.status})`);
      expect(cuerpo, ruta).not.toContain(CLAVE_DB_FICTICIA);
      expect(cuerpo, ruta).not.toMatch(/127\.0\.0\.1:1|postgresql:|PrismaClient|ECONNREFUSED|\bat\s+\S+\s+\(|node_modules/);
      expect(cuerpo, ruta).not.toContain("umami");
    }
    expect(baseCaida.registro()).not.toContain(CLAVE_DB_FICTICIA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Las normalizaciones de la 404 dinámica no tapan una fuga
// ─────────────────────────────────────────────────────────────────────────────

describe("c-seguridad 2b · lo que las normalizaciones del diff sí y no ven", () => {
  const CABECERAS = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
    ...Object.fromEntries(cabecerasDeSeguridad().map(({ key, value }) => [key.toLowerCase(), value])),
  };
  const NEXT_ERROR =
    '<!DOCTYPE html><html id="__next_error__"><head><meta charSet="utf-8"><meta name="robots" content="noindex"><title>EnMiRumbo</title></head><body></body></html>';
  const REFERENCIA = '<!DOCTYPE html><html lang="es-MX"><head></head><body class="b"><header>H</header><main class="m"><h1>No encontramos esta página</h1></main><footer>F</footer></body></html>';
  const astro = (head: string, body: string, html = '<html lang="es-MX" class="h-full">') =>
    `<!DOCTYPE html>${html}<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>EnMiRumbo</title><link rel="stylesheet" href="/_astro/a.css">${head}</head>${body}</html>`;
  const BUENO = '<body class="b"><header>H</header><main class="m"><h1>No encontramos esta página</h1></main><footer>F</footer></body>';
  const comparar = (html: string) =>
    compararRespuestas(
      "/negocio/x-id",
      { status: 404, headers: CABECERAS, cuerpo: NEXT_ERROR },
      { status: 404, headers: CABECERAS, cuerpo: html },
      { dinamica: true, referencia404: REFERENCIA, aplicadas: [] },
    );

  it("la referencia limpia sale sin diferencias", () => {
    expect(comparar(astro("", BUENO))).toEqual([]);
  });

  it("una fuga en el <main>, en un atributo, en un <meta>, en el título o en un JSON-LD se reporta", () => {
    const fuga = "Auditoriarev Qm4 Ficticio";
    for (const html of [
      astro("", BUENO.replace("</h1>", `</h1><p>${fuga}</p>`)),
      astro("", BUENO.replace('<main class="m">', `<main class="m" data-x="${fuga}">`)),
      astro(`<meta name="description" content="${fuga}">`, BUENO),
      astro("", BUENO).replace("<title>EnMiRumbo</title>", `<title>${fuga}</title>`),
      astro("", BUENO.replace("</footer>", `</footer><script type="application/ld+json">{"name":"${fuga}"}</script>`)),
      astro(`<link rel="canonical" href="https://enmirumbo.example/negocio/${fuga}">`, BUENO),
    ]) {
      expect(comparar(html).length, html).toBeGreaterThan(0);
    }
  });

  // Hallazgos B2/B3 de c-seguridad 2b: el diff es la red FINAL, no la única;
  // estas tres zonas solo las vigila `plataforma-astro-404-dinamica` (cuerpo
  // byte a byte y lista de prohibidos). Se documentan para que nadie
  // amplíe la confianza en el diff más allá de lo que ve.
  it("[límite documentado] texto suelto fuera de los landmarks, un comentario, la hoja de estilos o lang/class no los ve el diff", () => {
    const fuga = "Auditoriarev Qm4 Ficticio";
    const invisibles = [
      astro("", BUENO.replace("</header>", `</header>${fuga}`)),
      astro("", BUENO.replace("</header>", `</header><!-- ${fuga} -->`)),
      astro(`<link rel="stylesheet" href="/_astro/b.css?n=${encodeURIComponent(fuga)}">`, BUENO),
      astro("", BUENO, `<html lang="es-MX" class="h-full ${fuga.replace(/ /g, "-")}">`),
    ];
    for (const html of invisibles) expect(comparar(html), html).toEqual([]);
  });
});
