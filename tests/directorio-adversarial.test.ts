import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import {
  NEGOCIOS_DEMO,
  motivoParaNoSembrar,
  sembrarNegociosDemo,
} from "../prisma/seed-demo";
import ListadoCategoriaPage from "../src/app/[destino]/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import Home from "../src/app/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  listarCategorias,
  obtenerNegocioPublicado,
  obtenerNegociosPublicados,
} from "../src/lib/directorio";
import {
  construirEnlaceComoLlegar,
  construirEnlaceTelefono,
  obtenerPaginaRegistrada,
} from "../src/lib/enlaces";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { esSegmentoReservado } from "../src/lib/rutas-reservadas";
import { slugify } from "../src/lib/slug";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad y test) del change `agregar-directorio-publico`.
 *
 * Lo que el camino feliz no cubre en la superficie de LECTURA pública:
 * XSS almacenado que sobrevivió al registro y se renderiza aquí, enlaces
 * salientes envenenados, slugs y segmentos hostiles en las rutas dinámicas,
 * fuga de datos de terceros (negocios no publicados, `tokenGestion`) y
 * estados imposibles del ciclo de vida.
 *
 * TODOS los datos son ficticios (repo público + LFPDPPP): la serie de
 * WhatsApp `7719997xxx` es exclusiva de este archivo y se borra al terminar.
 */

const PREFIJO = "7719997";

/** Payloads que un registrante hostil puede dejar guardados en texto libre. */
const XSS_NOMBRE = '<script>alert("xss-nombre")</script>';
const XSS_OFRECE = '</p><img src=x onerror=alert("xss-ofrece")>';
const XSS_DIRECCION = '"><svg onload=alert("xss-direccion")>';
const XSS_HORARIO = "<b onmouseover=alert(1)>24 horas</b>";
const XSS_COLONIA = "<iframe src=javascript:alert(1)></iframe>";
const XSS_TELEFONO = '"><script>alert("xss-tel")</script>';

/** Datos de un negocio que el público NUNCA debe poder ver. */
const OCULTO = {
  nombre: "Negocio Fantasma En Revision (ficticio)",
  whatsapp: `${PREFIJO}201`,
  telefono: "7717779201",
  direccion: "Calle Secreta Inventada 999",
  token: "token-de-gestion-ficticio-9f3a2b",
};

const RECHAZADO = {
  nombre: "Negocio Rechazado Con Fecha (ficticio)",
  whatsapp: `${PREFIJO}202`,
  token: "token-de-gestion-ficticio-7c1d4e",
};

let prisma: PrismaClient;
let idPorWhatsapp: Record<string, string> = {};
let slugsCategorias: string[] = [];

const normalizado = (html: string) => html.replace(/\s+/g, " ");

async function renderListado(categoria: string, colonia?: unknown): Promise<string> {
  const elemento = await ListadoCategoriaPage({
    // El segmento dinámico de la raíz se llama `destino` desde el change
    // `agregar-seo-local` (design.md §1): la MISMA carpeta resuelve categoría,
    // giro y giro+colonia. La URL no cambió, solo el nombre del parámetro.
    params: Promise.resolve({ destino: categoria }),
    // El tipo de `searchParams` promete strings; aquí se prueba a propósito lo
    // que un cliente hostil puede mandar de verdad (repetido, vacío, ausente).
    searchParams: Promise.resolve(
      (colonia === undefined ? {} : { colonia }) as unknown as Record<string, string>,
    ),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderFicha(segmento: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: segmento }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

/**
 * El HTML sin el bloque de datos estructurados de la ficha (change
 * `agregar-seo-local`, spec `directorio-publico`: "El JSON-LD de la ficha NO
 * cuenta como JavaScript de cliente: es un bloque de datos, no código
 * ejecutable").
 *
 * Lo que estas pruebas vigilan es que NADA que escriba el negocio se
 * convierta en marcado ejecutable, y el `<script type="application/ld+json">`
 * es un bloque de datos con cada `<` escapado a `<`. Eso se prueba campo
 * por campo (y con un nombre que trae `</script>` adentro) en
 * `tests/seo-jsonld.test.ts`; aquí se descuenta para poder seguir exigiendo
 * "ni un solo `<script>` más" en el resto de la respuesta.
 */
function sinDatosEstructurados(html: string): string {
  return html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/g,
    "",
  );
}

/** Digest del 404 de Next (`NEXT_HTTP_ERROR_FALLBACK;404`), o `null` si no hubo. */
async function digestDe(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === "string" ? digest : String(error);
  }
}

const DIGEST_404 = "NEXT_HTTP_ERROR_FALLBACK;404";

async function crear(datos: {
  nombre: string;
  whatsapp: string;
  categoriaSlug: string;
  coloniaSlug?: string | null;
  coloniaOtra?: string | null;
  estado?: "publicado" | "en_revision" | "rechazado";
  publicadoEn?: Date | null;
  tokenGestion?: string | null;
  queOfreces?: string | null;
  direccion?: string | null;
  horario?: string | null;
  telefonoFijo?: string | null;
  facebookUrl?: string | null;
  entregaADomicilio?: boolean;
}): Promise<string> {
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: datos.categoriaSlug },
  });
  const colonia = datos.coloniaSlug
    ? await prisma.colonia.findUniqueOrThrow({ where: { slug: datos.coloniaSlug } })
    : null;

  const creado = await prisma.negocio.create({
    data: {
      nombre: datos.nombre,
      whatsapp: datos.whatsapp,
      categoriaId: categoria.id,
      coloniaId: colonia?.id ?? null,
      coloniaOtra: datos.coloniaOtra ?? null,
      estado: datos.estado ?? "publicado",
      publicadoEn:
        datos.publicadoEn === undefined
          ? new Date("2026-08-15T10:00:00.000Z")
          : datos.publicadoEn,
      tokenGestion: datos.tokenGestion ?? null,
      queOfreces: datos.queOfreces ?? null,
      direccion: datos.direccion ?? null,
      horario: datos.horario ?? null,
      telefonoFijo: datos.telefonoFijo ?? null,
      facebookUrl: datos.facebookUrl ?? null,
      entregaADomicilio: datos.entregaADomicilio ?? false,
      origen: "siembra",
      consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      registradoEn: new Date("2026-07-31T10:00:00.000Z"),
    },
    select: { id: true, whatsapp: true },
  });
  idPorWhatsapp[creado.whatsapp] = creado.id;
  return creado.id;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  idPorWhatsapp = {};

  // 1. Publicado hostil: HTML/script en cada campo de texto libre, teléfono
  //    que no es un número y una "página" con esquema ejecutable (una fila
  //    así no la deja el formulario de T-003, pero sí el panel de E3, un
  //    seed o alguien con acceso a la base).
  await crear({
    nombre: `Taqueria ${XSS_NOMBRE} (ficticia)`,
    whatsapp: `${PREFIJO}101`,
    categoriaSlug: "otro",
    coloniaOtra: XSS_COLONIA,
    queOfreces: XSS_OFRECE,
    direccion: XSS_DIRECCION,
    horario: XSS_HORARIO,
    telefonoFijo: XSS_TELEFONO,
    facebookUrl: "javascript:alert(document.domain)",
    entregaADomicilio: true,
  });

  // 2. Publicado con una URL que disfraza su destino con credenciales
  //    incrustadas (hallazgo M4 de T-003, por la puerta de atrás).
  await crear({
    nombre: "Estetica Disfrazada (ficticia)",
    whatsapp: `${PREFIJO}102`,
    categoriaSlug: "otro",
    coloniaSlug: "atempa",
    facebookUrl: "https://facebook.com@evil.example/perfil",
  });

  // 3. Publicado con colonia "Otra" que imita el nombre de una del catálogo:
  //    no debe colarse en el filtro por colonia.
  await crear({
    nombre: "Abarrotes Colonia Impostora (ficticia)",
    whatsapp: `${PREFIJO}103`,
    categoriaSlug: "otro",
    coloniaSlug: null,
    coloniaOtra: "Huicalco",
  });

  // 4 y 5. Dos negocios publicados con el MISMO nombre: colisión de slug.
  await crear({
    nombre: "Ferreteria Repetida (ficticia)",
    whatsapp: `${PREFIJO}104`,
    categoriaSlug: "otro",
    coloniaSlug: "huicalco",
  });
  await crear({
    nombre: "Ferreteria Repetida (ficticia)",
    whatsapp: `${PREFIJO}105`,
    categoriaSlug: "otro",
    coloniaSlug: "huicalco",
  });

  // 6. Nombre que se queda sin parte legible al slugificarse (unicode puro).
  await crear({
    nombre: "日本語 ¿?¡! ✂",
    whatsapp: `${PREFIJO}106`,
    categoriaSlug: "otro",
    coloniaSlug: "huicalco",
  });

  // 6-bis. Fijo marcable pero guardado con formato feo, en OTRA categoría
  //    (`talleres`) para no alterar los conteos de `/otro`. Sirve para exigir
  //    la forma del `tel:` servido tras la corrección de M2 (iteración 2).
  await crear({
    nombre: "Vulcanizadora Formato Feo (ficticia)",
    whatsapp: `${PREFIJO}107`,
    categoriaSlug: "talleres",
    coloniaSlug: "zona-industrial",
    telefonoFijo: "+52 (771) 999-7107",
    direccion: "Bodega inventada 7",
  });

  // 7. En revisión, con token de gestión y datos reconocibles: nada suyo
  //    puede aparecer en ninguna vista pública.
  await crear({
    nombre: OCULTO.nombre,
    whatsapp: OCULTO.whatsapp,
    categoriaSlug: "otro",
    coloniaSlug: "huicalco",
    estado: "en_revision",
    publicadoEn: null,
    tokenGestion: OCULTO.token,
    telefonoFijo: OCULTO.telefono,
    direccion: OCULTO.direccion,
    queOfreces: "Datos que el directorio público no debe enseñar.",
  });

  // 8. Rechazado que ANTES estuvo publicado: conserva `publicadoEn`. Es el
  //    estado que deja la transición publicado → rechazado del panel (E3).
  await crear({
    nombre: RECHAZADO.nombre,
    whatsapp: RECHAZADO.whatsapp,
    categoriaSlug: "otro",
    coloniaSlug: "atempa",
    estado: "rechazado",
    publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
    tokenGestion: RECHAZADO.token,
  });

  slugsCategorias = (await listarCategorias()).map((c) => c.slug);
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("adversarial · XSS almacenado que llega desde el registro al render", () => {
  let listado = "";
  let ficha = "";

  beforeAll(async () => {
    listado = await renderListado("otro");
    ficha = await renderFicha(
      construirSegmentoFicha(
        `Taqueria ${XSS_NOMBRE} (ficticia)`,
        idPorWhatsapp[`${PREFIJO}101`],
      ),
    );
  });

  it("el HTML servido no trae ninguna etiqueta ejecutable del negocio", () => {
    for (const conDatos of [listado, ficha]) {
      const html = sinDatosEstructurados(conDatos);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<iframe/i);
      expect(html).not.toMatch(/<img\s/i);
      // Ningún payload sobrevive en crudo: si aparece, aparece escapado.
      for (const payload of [
        XSS_NOMBRE,
        XSS_OFRECE,
        XSS_DIRECCION,
        XSS_HORARIO,
        XSS_COLONIA,
        XSS_TELEFONO,
      ]) {
        expect(html, payload).not.toContain(payload);
      }
      // Y ninguna etiqueta abierta trae un manejador de eventos.
      const etiquetas = [...html.matchAll(/<[a-zA-Z][^>]*>/g)].map((m) => m[0]);
      for (const etiqueta of etiquetas) {
        expect(etiqueta).not.toMatch(/\son[a-z]+\s*=/i);
      }
    }
  });

  it("los payloads salen escapados como texto, no interpretados", () => {
    expect(ficha).toContain("&lt;script&gt;");
    expect(ficha).toContain("&lt;svg onload=alert(&quot;xss-direccion&quot;)&gt;");
    expect(ficha).toContain("&lt;b onmouseover=alert(1)&gt;24 horas&lt;/b&gt;");
    expect(listado).toContain("&lt;iframe src=javascript:alert(1)&gt;&lt;/iframe&gt;");
  });

  it("el nombre hostil no rompe el aria-label del botón de WhatsApp", () => {
    const anclas = [...listado.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    const whatsapp = anclas.filter((a) => a.includes("wa.me"));
    expect(whatsapp).toHaveLength(6); // un botón por negocio publicado de /otro
    for (const ancla of whatsapp) {
      expect(ancla).toMatch(/aria-label="Enviar WhatsApp a [^"]*"/);
      expect(ancla).not.toMatch(/<script|onerror/i);
    }
  });

  it("un esquema ejecutable guardado como página nunca se pinta como enlace", () => {
    expect(ficha).not.toMatch(/href="javascript:/i);
    expect(ficha).not.toContain("Ver su página");
    expect(obtenerPaginaRegistrada("javascript:alert(document.domain)")).toBeNull();
  });

  // Actualizado al corregirse M2 (iteración 2 de la etapa B): antes esta
  // ficha pintaba un `tel:` con el valor crudo —escapado, pero marcable— y
  // el test se conformaba con que no se saliera del atributo. Ahora el fijo
  // se normaliza y, si no da 10 dígitos, no hay enlace: la comprobación se
  // endurece en vez de desaparecer.
  it("el teléfono hostil ya no se convierte en un enlace de marcado", () => {
    const anclas = [...ficha.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]);
    expect(anclas.filter((a) => a.includes('href="tel:'))).toHaveLength(0);
    expect(ficha).not.toMatch(/href="tel:/i);
    // Lo que el negocio escribió sigue visible como texto, escapado
    expect(ficha).toContain("&quot;&gt;&lt;script&gt;");
    expect(ficha).not.toContain('"><script>');
  });

  it("el mapa mete lo que escribió el negocio dentro del parámetro, no en la URL", () => {
    const href = ficha.match(/href="(https:\/\/www\.google\.com\/maps[^"]*)"/)?.[1];
    expect(href).toBeDefined();
    const url = new URL(href!.replace(/&amp;/g, "&"));
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/search/");
    expect([...url.searchParams.keys()].sort()).toEqual(["api", "query"]);
    expect(url.searchParams.get("query")).toContain(XSS_DIRECCION);
  });

  it("una referencia con separadores de consulta no inyecta parámetros al mapa", () => {
    const enlace = construirEnlaceComoLlegar(
      "x&api=1&hl=zz#frag",
      "Colonia & Compañía",
    )!;
    const url = new URL(enlace);
    expect([...url.searchParams.keys()].sort()).toEqual(["api", "query"]);
    expect(url.hash).toBe("");
    expect(url.searchParams.get("query")).toBe(
      "x&api=1&hl=zz#frag, Colonia & Compañía, Tizayuca, Hidalgo",
    );
  });
});

describe("adversarial · el enlace saliente no puede mentir sobre su destino", () => {
  it("una URL con credenciales incrustadas muestra el dominio al que de verdad va", async () => {
    const ficha = await renderFicha(
      construirSegmentoFicha(
        "Estetica Disfrazada (ficticia)",
        idPorWhatsapp[`${PREFIJO}102`],
      ),
    );
    expect(ficha).toContain("Ver su página (evil.example)");
    expect(ficha).not.toContain("(facebook.com)");
    expect(ficha).not.toContain("Facebook");
  });

  it("solo se pinta enlace si el destino es http(s) interpretable", () => {
    for (const hostil of [
      "javascript:alert(1)",
      "java\nscript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html,<script>0</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example/x",
      "evil.example",
      "",
      "   ",
    ]) {
      expect(obtenerPaginaRegistrada(hostil), hostil).toBeNull();
    }
  });

  it("todo enlace que sí se pinta apunta a http(s) y muestra su host real", () => {
    for (const [url, dominio] of [
      ["https://facebook.com@evil.example/x", "evil.example"],
      ["https://user:pass@evil.example/x", "evil.example"],
      ["HTTPS://EVIL.EXAMPLE/X", "evil.example"],
      ["https://2130706433/x", "127.0.0.1"],
      ["https://xn--facbook-9gg.com/x", "xn--facbook-9gg.com"], // homógrafo cirílico
      ["https://facebook.com.evil.example/x", "facebook.com.evil.example"],
    ] as const) {
      const pagina = obtenerPaginaRegistrada(url)!;
      expect(pagina, url).not.toBeNull();
      expect(pagina.dominio, url).toBe(dominio);
      // El href pintado y el dominio mostrado tienen que resolver al mismo host.
      expect(new URL(pagina.href).hostname.replace(/^www\./, ""), url).toBe(dominio);
      expect(["http:", "https:"]).toContain(new URL(pagina.href).protocol);
    }
  });
});

describe("adversarial · un negocio sin publicar es indistinguible de uno inexistente", () => {
  it("ningún dato suyo aparece en ningún listado del sitio", async () => {
    const listados = await Promise.all(
      slugsCategorias.map((slug) => renderListado(slug)),
    );
    const todo = listados.join("\n");
    for (const dato of [
      OCULTO.nombre,
      OCULTO.whatsapp,
      OCULTO.telefono,
      OCULTO.direccion,
      OCULTO.token,
      RECHAZADO.nombre,
      RECHAZADO.whatsapp,
      RECHAZADO.token,
      idPorWhatsapp[OCULTO.whatsapp],
      idPorWhatsapp[RECHAZADO.whatsapp],
    ]) {
      expect(todo, dato).not.toContain(dato);
    }
  });

  it("un rechazado que alguna vez estuvo publicado tampoco vuelve al listado", async () => {
    // La transición publicado → rechazado del panel (E3) deja `publicadoEn`
    // puesta: el filtro no puede depender de esa fecha, solo del estado.
    const publicados = await obtenerNegociosPublicados("otro");
    expect(publicados.map((n) => n.nombre)).not.toContain(RECHAZADO.nombre);
    expect(await obtenerNegocioPublicado(idPorWhatsapp[RECHAZADO.whatsapp])).toBeNull();
  });

  it("las cuatro maneras de pedir una ficha que no se puede ver dan el mismo 404", async () => {
    const idOculto = idPorWhatsapp[OCULTO.whatsapp];
    const idRechazado = idPorWhatsapp[RECHAZADO.whatsapp];
    const digests = await Promise.all([
      digestDe(renderFicha("negocio-que-no-existe-cmzzzzzzzzzzzzzzzzzzzzzzzz")),
      digestDe(renderFicha(construirSegmentoFicha(OCULTO.nombre, idOculto))),
      digestDe(renderFicha(idOculto)), // sin parte legible: mismo resultado
      digestDe(renderFicha(construirSegmentoFicha(RECHAZADO.nombre, idRechazado))),
    ]);
    expect(new Set(digests)).toEqual(new Set([DIGEST_404]));
  });

  it("el token de gestión no viaja ni siquiera en la ficha de un publicado", async () => {
    // El módulo de consultas no lee `tokenGestion`; este test lo comprueba con
    // un token realmente guardado en la base (el seed de demo los deja nulos).
    await prisma.negocio.update({
      where: { whatsapp: `${PREFIJO}104` },
      data: { tokenGestion: "token-de-gestion-ficticio-1a2b3c" },
    });
    const ficha = await renderFicha(
      construirSegmentoFicha(
        "Ferreteria Repetida (ficticia)",
        idPorWhatsapp[`${PREFIJO}104`],
      ),
    );
    const listado = await renderListado("otro");
    for (const html of [ficha, listado]) {
      expect(html).not.toContain("token-de-gestion-ficticio-1a2b3c");
      expect(html).not.toContain("tokenGestion");
      expect(html).not.toContain("consintioAvisoEn");
      expect(html).not.toContain("2026-07-31");
    }
    const publicado = await obtenerNegocioPublicado(idPorWhatsapp[`${PREFIJO}104`]);
    expect(Object.keys(publicado!)).not.toContain("tokenGestion");
  });

  it("la base rechaza un estado inventado: no hay cuarto estado publicable", async () => {
    const id = idPorWhatsapp[`${PREFIJO}104`];
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Negocio" SET "estado" = 'publicado ' WHERE "id" = ?`,
        id,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Negocio" SET "estado" = 'PUBLICADO' WHERE "id" = ?`,
        id,
      ),
    ).rejects.toThrow();
  });
});

describe("adversarial · el número de terceros solo sale donde la spec lo pide", () => {
  it("el WhatsApp publicado aparece únicamente dentro del enlace de wa.me", async () => {
    const listado = await renderListado("otro");
    const numero = `${PREFIJO}104`;
    const apariciones = listado.split(numero).length - 1;
    const enWaMe = listado.split(`wa.me/52${numero}`).length - 1;
    expect(apariciones).toBeGreaterThan(0);
    expect(apariciones).toBe(enWaMe); // ni como texto visible ni en otro atributo
  });

  // Actualizado al corregirse M2: un fijo marcable sí se pinta como acción
  // ("Llamar", nunca el número como texto) —eso lo cubre
  // `tests/directorio-paginas.test.ts`—; lo que esta ficha tiene guardado no
  // es marcable, así que aquí se exige lo contrario: sin botón, y sin filtrar
  // el fijo del negocio que ni siquiera está publicado.
  it("un fijo no marcable no genera botón, y el fijo del negocio oculto no se filtra", async () => {
    const ficha = await renderFicha(
      construirSegmentoFicha(
        `Taqueria ${XSS_NOMBRE} (ficticia)`,
        idPorWhatsapp[`${PREFIJO}101`],
      ),
    );
    expect(normalizado(ficha)).not.toContain(">Llamar</a>");
    expect(ficha).not.toContain(OCULTO.telefono);
    expect(ficha).not.toMatch(/>[^<]*7717779201/);
  });
});

describe("adversarial · slugs hostiles en la ruta de categoría", () => {
  const NULO = String.fromCharCode(0);
  const ANCHO_CERO = String.fromCharCode(0x200b);
  const A_CIRILICA = String.fromCharCode(0x430);

  const hostiles: Array<[string, string]> = [
    ["traversal relativo", "../registro"],
    ["traversal codificado", "..%2f..%2fetc%2fpasswd"],
    ["traversal crudo", "../../etc/passwd"],
    ["byte nulo", `belleza${NULO}`],
    ["espacio al final", "belleza "],
    ["mayúsculas", "BELLEZA"],
    ["homógrafo cirílico", `bellez${A_CIRILICA}`],
    ["ancho cero", `belleza${ANCHO_CERO}`],
    ["comodín SQL", "%"],
    ["inyección SQL", "' OR '1'='1"],
    ["etiqueta", "<script>alert(1)</script>"],
    ["ruta propia", "registro"],
    ["ruta propia futura", "admin"],
    ["segmento larguísimo", "a".repeat(5000)],
    ["vacío", ""],
  ];

  it.each(hostiles)("%s responde 404 y no filtra nada", async (_caso, slug) => {
    expect(await digestDe(renderListado(slug))).toBe(DIGEST_404);
  });

  it("un comodín SQL no arrastra los negocios de todas las categorías", async () => {
    expect(await obtenerNegociosPublicados("%")).toEqual([]);
    expect(await obtenerNegociosPublicados("' OR '1'='1")).toEqual([]);
  });

  it("la lista de segmentos reservados resiste la normalización de un nombre", () => {
    for (const nombre of ["Registro", "REGISTRO", "Regístro", " registro "]) {
      expect(esSegmentoReservado(slugify(nombre)), nombre).toBe(true);
    }
    expect(esSegmentoReservado(slugify("Aviso de Privacidad"))).toBe(true);
    expect(esSegmentoReservado(slugify("Belleza"))).toBe(false);
  });
});

describe("adversarial · filtro de colonia hostil en la URL", () => {
  it("un payload en ?colonia no se refleja en la página ni la rompe", async () => {
    const html = await renderListado("otro", '<script>alert("colonia")</script>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("alert(&quot;colonia&quot;)");
    expect(html).not.toContain("xss-colonia");
    // Se ignora el filtro desconocido: el listado sale completo.
    expect(html.match(/<article[\s>]/g)).toHaveLength(6);
  });

  it("un parámetro repetido, vacío o larguísimo no rompe el listado", async () => {
    const repetido = await renderListado("otro", ["atempa", "huicalco"]);
    const vacio = await renderListado("otro", "");
    const largo = await renderListado("otro", "z".repeat(10_000));
    for (const html of [repetido, vacio, largo]) {
      expect(html.match(/<article[\s>]/g)).toHaveLength(6);
      expect(html).toContain("Todas las colonias");
    }
  });

  it("una colonia 'Otra' que imita a una del catálogo no se cuela en su filtro", async () => {
    const conFiltro = await renderListado("otro", "huicalco");
    expect(conFiltro).not.toContain("Abarrotes Colonia Impostora (ficticia)");
    const sinFiltro = await renderListado("otro");
    expect(sinFiltro).toContain("Abarrotes Colonia Impostora (ficticia)");
  });
});

describe("adversarial · segmentos hostiles en la URL de la ficha", () => {
  it("la parte legible es decorativa y jamás se refleja en la respuesta", async () => {
    const id = idPorWhatsapp[`${PREFIJO}105`];
    const html = await renderFicha(`<script>alert(1)</script>-marca-hostil-${id}`);
    expect(html).toContain("Ferreteria Repetida (ficticia)");
    expect(sinDatosEstructurados(html)).not.toMatch(/<script/i);
    expect(html).not.toContain("marca-hostil");
  });

  it("dos negocios con el mismo nombre tienen fichas distintas y correctas", async () => {
    const idA = idPorWhatsapp[`${PREFIJO}104`];
    const idB = idPorWhatsapp[`${PREFIJO}105`];
    expect(idA).not.toBe(idB);
    const segmentoA = construirSegmentoFicha("Ferreteria Repetida (ficticia)", idA);
    const segmentoB = construirSegmentoFicha("Ferreteria Repetida (ficticia)", idB);
    expect(segmentoA).not.toBe(segmentoB);
    expect(await renderFicha(segmentoA)).toContain(`wa.me/52${PREFIJO}104`);
    expect(await renderFicha(segmentoB)).toContain(`wa.me/52${PREFIJO}105`);
  });

  it("un nombre sin letras latinas deja una URL con solo el identificador", async () => {
    const id = idPorWhatsapp[`${PREFIJO}106`];
    expect(construirSegmentoFicha("日本語 ¿?¡! ✂", id)).toBe(id);
    expect(await renderFicha(id)).toContain(`wa.me/52${PREFIJO}106`);
  });

  it.each([
    ["guion solo", "-"],
    ["varios guiones", "---"],
    ["vacío", ""],
    ["traversal", "../../etc/passwd"],
    ["byte nulo", `x-${String.fromCharCode(0)}`],
    ["identificador con sufijo", "SUFIJO"],
    ["identificador en mayúsculas", "MAYUSCULAS"],
    ["identificador larguísimo", "LARGO"],
  ])("%s no abre ninguna ficha", async (_caso, segmento) => {
    const id = idPorWhatsapp[`${PREFIJO}104`];
    const real =
      segmento === "SUFIJO"
        ? `${id}x`
        : segmento === "MAYUSCULAS"
          ? id.toUpperCase()
          : segmento === "LARGO"
            ? `${id}${"0".repeat(4000)}`
            : segmento;
    expect(await digestDe(renderFicha(real))).toBe(DIGEST_404);
  });
});

describe("adversarial · el recorrido completo funciona sin JavaScript de cliente", () => {
  // Scenario "navegación sin JavaScript" (spec directorio-publico): hasta
  // ahora solo estaba verificado a mano con `curl` (reports/b-dev.md). Cada
  // paso tiene que ser un enlace del servidor tomado del HTML del paso previo.
  it("ninguna página del directorio necesita un control con JavaScript", async () => {
    const home = await Home();
    const paginas = [
      renderToStaticMarkup(createElement(() => home)),
      await renderListado("otro"),
      await renderListado("otro", "huicalco"),
      await renderFicha(
        construirSegmentoFicha(
          "Ferreteria Repetida (ficticia)",
          idPorWhatsapp[`${PREFIJO}104`],
        ),
      ),
    ];
    for (const html of paginas) {
      // MODIFIED por el change `agregar-buscador`: la home ya trae un
      // formulario (el buscador), y eso NO es JavaScript de cliente. Lo que
      // se prohíbe es el control que solo funciona con JS: un manejador de
      // eventos, o un formulario sin destino resuelto por el servidor.
      expect(html).not.toMatch(/\son(click|change|submit|input)\s*=/i);
      for (const form of [...html.matchAll(/<form\s[^>]*>/g)].map((m) => m[0])) {
        expect(form).toMatch(/action="\/[^"]*"/);
        expect(form).toMatch(/method="(get|post)"/i);
      }
      // Ningún control fuera de un formulario (un botón suelto necesitaría JS).
      const sinFormularios = html.replace(/<form\s[^>]*>[\s\S]*?<\/form>/g, "");
      expect(sinFormularios).not.toMatch(/<button|<input|<select|<textarea/i);
    }
  });

  it("cada paso del recorrido sale del HTML del paso anterior", async () => {
    const listado = await renderListado("otro");

    // 1. Del listado se llega al filtro por colonia con un enlace.
    const filtro = [...listado.matchAll(/href="(\/otro\?colonia=[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(filtro.length).toBeGreaterThan(0);
    const coloniaDelFiltro = new URL(`http://x${filtro[0]}`).searchParams.get(
      "colonia",
    )!;

    // 2. Del listado filtrado se llega a una ficha con un enlace.
    const filtrado = await renderListado("otro", coloniaDelFiltro);
    const aFicha = [...filtrado.matchAll(/href="\/negocio\/([^"]+)"/g)].map((m) => m[1]);
    expect(aFicha.length).toBeGreaterThan(0);

    // 3. La ficha existe y su acción principal es un enlace a wa.me.
    const ficha = await renderFicha(aFicha[0]);
    expect(ficha).toMatch(/<a href="https:\/\/wa\.me\/52\d{10}\?text=/);
    expect(ficha).toContain("Enviar WhatsApp");
  });
});

// ── Iteración 2: re-verificación de las correcciones de M2 y M4 ────────────

describe("adversarial · el tel: ya no lo escribe el negocio (M2 corregido)", () => {
  const FORMA_ESTRICTA = /^tel:\+52\d{10}$/;

  it("todo href tel: servido es exactamente '+52' más diez dígitos", async () => {
    const paginas = [
      await renderListado("otro"),
      await renderListado("talleres"),
      await renderFicha(
        construirSegmentoFicha(
          "Vulcanizadora Formato Feo (ficticia)",
          idPorWhatsapp[`${PREFIJO}107`],
        ),
      ),
      await renderFicha(
        construirSegmentoFicha(
          `Taqueria ${XSS_NOMBRE} (ficticia)`,
          idPorWhatsapp[`${PREFIJO}101`],
        ),
      ),
    ];
    const hrefs = paginas.flatMap((html) =>
      [...html.matchAll(/href="(tel:[^"]*)"/g)].map((m) => m[1]),
    );
    // El fijo feo sí produce enlace; el hostil no. Debe haber exactamente uno.
    expect(hrefs).toEqual([`tel:+52${PREFIJO}107`]);
    for (const href of hrefs) expect(href).toMatch(FORMA_ESTRICTA);
  });

  it("ningún valor guardado, por hostil que sea, produce otra forma de tel:", () => {
    const hostiles = [
      '"><script>alert(1)</script>',
      "*21*5512345678#",
      "##002#",
      "tel:+525512345678",
      "800 TELMEX",
      "771 999 7107 ext. 12",
      "77199971",
      "7719997107999999",
      "٧٧١٩٩٩٧١٠٧",
      `771999710${String.fromCharCode(0)}7`,
      `${"9".repeat(4000)}`,
      "771-999-7107\nX-Inyectado: 1",
      "  ",
      null,
      undefined,
    ];
    for (const hostil of hostiles) {
      const enlace = construirEnlaceTelefono(hostil as string);
      if (enlace !== null) expect(enlace, String(hostil)).toMatch(FORMA_ESTRICTA);
    }
    // Los que claramente no son un número nacional no generan enlace
    for (const sinEnlace of [
      '"><script>alert(1)</script>',
      "*21*5512345678#",
      "##002#",
      "800 TELMEX",
      "771 999 7107 ext. 12",
      "77199971",
      "٧٧١٩٩٩٧١٠٧",
      "  ",
    ]) {
      expect(construirEnlaceTelefono(sinEnlace), sinEnlace).toBeNull();
    }
  });

  it("el fijo no marcable se muestra como dato escapado y nunca dentro de un atributo", async () => {
    const ficha = await renderFicha(
      construirSegmentoFicha(
        `Taqueria ${XSS_NOMBRE} (ficticia)`,
        idPorWhatsapp[`${PREFIJO}101`],
      ),
    );
    expect(ficha).not.toMatch(/href="tel:/i);
    expect(ficha).not.toContain(">Llamar</a>");
    // Se muestra como texto escapado, fuera de toda etiqueta abierta
    expect(ficha).toContain("&quot;&gt;&lt;script&gt;");
    expect(ficha).not.toContain(XSS_TELEFONO);
    const etiquetas = [...ficha.matchAll(/<[a-zA-Z][^>]*>/g)].map((m) => m[0]);
    for (const etiqueta of etiquetas) {
      expect(etiqueta).not.toContain("xss-tel");
      expect(etiqueta).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  it("el componente de botones ya no concatena nada dentro de un href", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fuente = readFileSync(
      join(__dirname, "..", "src/components/directorio/botones-contacto.tsx"),
      "utf8",
    );
    // Todo href del componente es una prop ya armada (identificador o acceso
    // a propiedad), nunca una plantilla ni una concatenación: el esquema del
    // enlace se decide en `src/lib/enlaces.ts`, no en el JSX.
    const expresiones = [...fuente.matchAll(/href=\{([^}]*)\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(expresiones.length).toBeGreaterThanOrEqual(3);
    for (const expresion of expresiones) {
      expect(expresion, expresion).toMatch(/^[A-Za-z_$][\w$]*(\.[\w$]+)*$/);
    }
  });
});

describe("adversarial · la guarda del seed de demo falla cerrada (M4 corregido)", () => {
  const REMOTA = "postgresql://usuario:clave@servidor.example:5432/necesitouno";

  it("una base remota se bloquea salvo con el permiso exacto '1'", () => {
    for (const permiso of [undefined, "", "0", "true", "yes", "si", "sí", "01", "11", "on"]) {
      expect(
        motivoParaNoSembrar({ DATABASE_URL: REMOTA, SEED_DEMO_PERMITIR: permiso }),
        `permiso=${String(permiso)}`,
      ).not.toBeNull();
    }
    expect(
      motivoParaNoSembrar({ DATABASE_URL: REMOTA, SEED_DEMO_PERMITIR: " 1 " }),
    ).toBeNull();
  });

  it("el permiso explícito nunca abre la puerta de producción", () => {
    for (const env of [
      { NODE_ENV: "production" },
      { VERCEL_ENV: "production" },
      { NODE_ENV: " PRODUCTION " },
      { VERCEL_ENV: "Production" },
    ]) {
      const motivo = motivoParaNoSembrar({
        ...env,
        DATABASE_URL: "file:./prisma/dev.db",
        SEED_DEMO_PERMITIR: "1",
      });
      expect(motivo, JSON.stringify(env)).toContain("producción");
    }
  });

  it("otros esquemas remotos también se bloquean", () => {
    for (const url of [
      "postgres://x@y/z",
      "mysql://x@y/z",
      "prisma://acelerado.example/z",
      "libsql://base.example",
      "https://base.example/db",
      "  POSTGRESQL://X@Y/Z  ",
    ]) {
      expect(motivoParaNoSembrar({ DATABASE_URL: url }), url).not.toBeNull();
    }
    // Un archivo local sí puede, venga como venga escrito
    expect(motivoParaNoSembrar({ DATABASE_URL: "  FILE:./prisma/dev.db  " })).toBeNull();
    expect(motivoParaNoSembrar({})).toBeNull();
  });

  it("bloqueada de verdad: contra una base remota no escribe ni una fila", async () => {
    const antes = await prisma.negocio.count();
    const resultado = await sembrarNegociosDemo(prisma, { DATABASE_URL: REMOTA });
    expect(resultado.sembrado).toBe(false);
    expect(resultado.mensaje).toContain("DATABASE_URL");
    expect(await prisma.negocio.count()).toBe(antes);

    const enProduccion = await sembrarNegociosDemo(prisma, {
      NODE_ENV: "production",
      DATABASE_URL: "file:./prisma/test.db",
      SEED_DEMO_PERMITIR: "1",
    });
    expect(enProduccion.sembrado).toBe(false);
    expect(await prisma.negocio.count()).toBe(antes);
  });
});

describe("adversarial · el seed de demostración no puede llevar datos reales", () => {
  const MARCAS = /ficticio|ficticia|mentira|imaginari|inventad|fantasma/i;

  it("cada negocio sembrado se lee como inventado en su propio nombre", () => {
    for (const negocio of NEGOCIOS_DEMO) {
      expect(negocio.nombre, negocio.nombre).toMatch(MARCAS);
    }
  });

  it("ningún negocio sembrado trae token de gestión ni coordenadas", () => {
    for (const negocio of NEGOCIOS_DEMO) {
      expect(Object.keys(negocio)).not.toContain("tokenGestion");
      expect(Object.keys(negocio)).not.toContain("latitud");
      expect(Object.keys(negocio)).not.toContain("longitud");
      expect(Object.keys(negocio)).not.toContain("fotoUrl");
    }
  });

  it("las páginas sembradas apuntan a dominios interpretables y http(s)", () => {
    for (const negocio of NEGOCIOS_DEMO) {
      if (!negocio.facebookUrl) continue;
      const pagina = obtenerPaginaRegistrada(negocio.facebookUrl);
      expect(pagina, negocio.facebookUrl).not.toBeNull();
      expect(negocio.facebookUrl.startsWith("https://")).toBe(true);
    }
  });
});
