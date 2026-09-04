import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import BuscarPage from "../src/app/(publico)/buscar/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MAXIMA_CONSULTA,
  LONGITUD_RAIZ,
  MAXIMO_TERMINOS,
  datosDeBusqueda,
  terminosDeBusqueda,
} from "../src/lib/busqueda";
import { buscarNegociosPublicados } from "../src/lib/directorio";
import { obtenerPrisma } from "../src/lib/prisma";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { slugify } from "../src/lib/slug";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad-test) del change `agregar-buscador`.
 *
 * Complementa `tests/buscador-adversarial.test.ts` (etapa B), que ataca la
 * CONSULTA. Aquí se ataca lo que la etapa B no cubrió:
 *
 * 1. **Dato hostil ya guardado** que llega a la página nueva: un negocio
 *    publicado cuyo nombre, colonia y campos internos son maliciosos. La
 *    superficie nueva (`/buscar`) pinta las mismas tarjetas del listado, así
 *    que hay que probar que no ensancha la proyección pública.
 * 2. **Transiciones de estado ilegales**: fichas a medio publicar (`rechazado`
 *    o `en_revision` con `publicadoEn` puesto) y estados fuera del catálogo.
 *    De paso verifica que los `CHECK` de `estado` y `origen` SIGUEN VIVOS
 *    después de la migración escrita a mano de este change (decisión 1 del
 *    reporte b-dev): si Prisma hubiera redefinido la tabla, estos casos
 *    pasarían y nadie se enteraría.
 * 3. **Oráculo**: que la respuesta de un término que solo coincide con una
 *    ficha sin publicar sea indistinguible de la de un término inexistente.
 * 4. **Mass assignment extremo a extremo**: un alta pública que intenta
 *    auto-publicarse y colarse al buscador.
 * 5. **Cotas del eco de `?q`** (el hallazgo de b-dev sobre el eco truncado) y
 *    de la consulta que llega a la base (DoS barato).
 * 6. **Normalización**: que extraer `quitarAcentos` a `src/lib/texto.ts` no
 *    movió el comportamiento de `slugify`, y que NFC/NFD no abren un hueco.
 *
 * TODO dato es ficticio (repo público + LFPDPPP): serie de WhatsApp
 * `7719996xxx`, exclusiva de este archivo y borrada en el `afterAll`; IP de
 * TEST-NET-3; ningún nombre, dirección ni número corresponde a un negocio
 * real de Tizayuca.
 */

const PREFIJO = "7719996";
const IP = "203.0.113.77"; // TEST-NET-3, reservada para documentación

/** Ficha publicada con datos hostiles en cada campo que la tarjeta toca. */
const HOSTIL = {
  whatsapp: `${PREFIJO}101`,
  nombre: 'Cerrajería <img src=x onerror="alert(1)"> "Ficticia" & Co',
  queOfreces: "<script>alert('cerrajeria')</script> aperturas ficticias",
  coloniaOtra: "</li></ul><script>alert(2)</script>",
  telefonoFijo: "*21*7710000000#", // secuencia de desvío (hallazgo M2 de T-003)
  direccion: "Calle Inventada 1 <b>oculta</b>",
  token: "token-gestion-ficticio-c0ffee",
};

/** Ficha publicada sin `publicadoEn`: el panel (T-005) podría dejarla así. */
const SIN_FECHA = {
  whatsapp: `${PREFIJO}102`,
  nombre: "Cerrajería Sin Fecha (ficticia)",
  queOfreces: "Aperturas y duplicado de llaves.",
};

/** `rechazado` con `publicadoEn` puesto: media transición, nunca publicada. */
const RECHAZADO = {
  whatsapp: `${PREFIJO}103`,
  nombre: "Cerrajería Rechazada Fantasma (ficticia)",
  queOfreces: "Aperturas de autos (ficha rechazada).",
  telefonoFijo: "7717776103",
  direccion: "Domicilio Inventado 103",
  token: "token-gestion-ficticio-rechazado",
};

/** `en_revision` con `publicadoEn` puesto: la otra media transición. */
const EN_REVISION = {
  whatsapp: `${PREFIJO}104`,
  nombre: "Cerrajería En Revisión Fantasma (ficticia)",
  queOfreces: "Aperturas a domicilio (ficha en revisión).",
  telefonoFijo: "7717776104",
  direccion: "Domicilio Inventado 104",
  token: "token-gestion-ficticio-revision",
};

/** Campos que la ficha pública NUNCA necesita y que no deben salir al HTML. */
const CONTRATO_PUBLICO_DEL_LISTADO = [
  "id",
  "nombre",
  // Sumado por el change `agregar-analitica-cookieless`: el slug de la
  // categoría del negocio, que la tarjeta necesita para el evento de medición.
  "categoriaSlug",
  "coloniaNombre",
  "coloniaSlug",
  "entregaADomicilio",
  "whatsapp",
  "fotoUrl",
];

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

const compacto = (html: string) => html.replace(/\s+/g, " ");

async function renderBuscar(q?: string | string[]): Promise<string> {
  const elemento = await BuscarPage({
    // El tipo promete strings; un cliente hostil manda lo que se le ocurra.
    searchParams: Promise.resolve(
      (q === undefined ? {} : { q }) as unknown as Record<string, string>,
    ),
  } as unknown as Parameters<typeof BuscarPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

/** FormData igual al que manda el navegador en el registro público. */
function envioRegistro(campos: Record<string, string>): FormData {
  const formData = new FormData();
  const base: Record<string, string> = {
    nombre: "Negocio Impostor (ficticio)",
    categoriaId: String(categoriaId),
    coloniaId: String(coloniaId),
    consentimiento: "on",
    ...campos,
  };
  for (const [clave, valor] of Object.entries(base)) {
    if (valor !== "") formData.append(clave, valor);
  }
  return formData;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;

  const comun = {
    categoriaId,
    consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
    registradoEn: new Date("2026-07-31T10:00:00.000Z"),
  };

  await prisma.negocio.create({
    data: {
      ...comun,
      nombre: HOSTIL.nombre,
      queOfreces: HOSTIL.queOfreces,
      ...datosDeBusqueda(HOSTIL.nombre, HOSTIL.queOfreces),
      coloniaOtra: HOSTIL.coloniaOtra,
      telefonoFijo: HOSTIL.telefonoFijo,
      direccion: HOSTIL.direccion,
      tokenGestion: HOSTIL.token,
      whatsapp: HOSTIL.whatsapp,
      estado: "publicado",
      origen: "siembra",
      publicadoEn: new Date("2026-08-20T10:00:00.000Z"),
    },
  });

  await prisma.negocio.create({
    data: {
      ...comun,
      nombre: SIN_FECHA.nombre,
      queOfreces: SIN_FECHA.queOfreces,
      ...datosDeBusqueda(SIN_FECHA.nombre, SIN_FECHA.queOfreces),
      whatsapp: SIN_FECHA.whatsapp,
      estado: "publicado",
      origen: "siembra",
      publicadoEn: null,
    },
  });

  for (const [ficha, estado] of [
    [RECHAZADO, "rechazado"],
    [EN_REVISION, "en_revision"],
  ] as const) {
    await prisma.negocio.create({
      data: {
        ...comun,
        nombre: ficha.nombre,
        queOfreces: ficha.queOfreces,
        ...datosDeBusqueda(ficha.nombre, ficha.queOfreces),
        telefonoFijo: ficha.telefonoFijo,
        direccion: ficha.direccion,
        tokenGestion: ficha.token,
        whatsapp: ficha.whatsapp,
        estado,
        origen: "organico",
        // Media transición: la fecha de publicación puesta sin estado
        // `publicado`. El buscador no debe mirar esta columna para decidir.
        publicadoEn: new Date("2026-08-25T10:00:00.000Z"),
      },
    });
  }

  reiniciarLimitePorIp();
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("adversarial C · una ficha hostil ya guardada no rompe la página de resultados", () => {
  it("el nombre y la colonia con marcado salen escapados, sin crear etiquetas", async () => {
    const html = await renderBuscar("cerrajeria");
    expect(compacto(html)).toContain("Cerrajer");

    // Nada de lo que el negocio escribió se convirtió en marcado ejecutable.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror=\"alert");
    expect(html).not.toContain("</li></ul><script>");
    expect(html).toContain("&lt;img");
  });

  it("el enlace de la ficha solo lleva caracteres de slug y el identificador", async () => {
    const html = await renderBuscar("cerrajeria");
    const hrefs = [...html.matchAll(/href="(\/negocio\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^\/negocio\/[a-z0-9-]+$/);
    }
  });

  it("el enlace de WhatsApp es siempre wa.me con 52 y diez dígitos", async () => {
    const html = await renderBuscar("cerrajeria");
    const hrefs = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^https:\/\/wa\.me\/52\d{10}\?text=/);
    }
  });

  it("ningún href de la página abre un esquema que no sea http(s), tel o mailto", async () => {
    const html = await renderBuscar("cerrajeria");
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      expect(href, href).not.toMatch(/^\s*javascript:/i);
      expect(href, href).not.toMatch(/^\s*data:/i);
      expect(href, href).toMatch(/^(\/|https:\/\/|http:\/\/|tel:|mailto:|#)/);
    }
  });

  it("los campos internos de la ficha hostil no viajan al HTML de resultados", async () => {
    const html = await renderBuscar("cerrajeria");
    for (const interno of [
      HOSTIL.token,
      HOSTIL.telefonoFijo,
      HOSTIL.direccion,
      HOSTIL.queOfreces,
      "queOfrecesNormalizado",
      "nombreNormalizado",
      "tokenGestion",
      "publicadoEn",
      "registradoEn",
      "consintioAvisoEn",
    ]) {
      expect(html, interno).not.toContain(interno);
    }
    // El "¿Qué ofreces?" es de la ficha, no de la tarjeta: ni siquiera
    // normalizado debe asomar en el listado de resultados.
    expect(html).not.toContain("aperturas ficticias");
  });
});

describe("adversarial C · la proyección de la búsqueda no crece", () => {
  it("cada resultado trae exactamente los campos del contrato público", async () => {
    const resultados = await buscarNegociosPublicados("cerrajeria");
    expect(resultados.length).toBeGreaterThan(0);
    for (const resultado of resultados) {
      expect(Object.keys(resultado).sort()).toEqual(
        [...CONTRATO_PUBLICO_DEL_LISTADO].sort(),
      );
    }
  });

  it("la consulta que llega a Prisma no selecciona las columnas derivadas", async () => {
    const espia = vi.spyOn(obtenerPrisma().negocio, "findMany");
    await buscarNegociosPublicados("cerrajeria");
    const argumentos = espia.mock.calls.at(-1)?.[0] as
      | { select?: Record<string, unknown>; where?: Record<string, unknown> }
      | undefined;
    espia.mockRestore();

    expect(Object.keys(argumentos?.select ?? {})).not.toContain("nombreNormalizado");
    expect(Object.keys(argumentos?.select ?? {})).not.toContain("queOfrecesNormalizado");
    expect(Object.keys(argumentos?.select ?? {})).not.toContain("tokenGestion");
    expect(Object.keys(argumentos?.select ?? {})).not.toContain("estado");
    // Y el filtro de estado va por construcción, no por disciplina de quien llama.
    expect(argumentos?.where).toMatchObject({ estado: "publicado" });
  });
});

describe("adversarial C · transiciones de estado ilegales no publican nada", () => {
  it.each([
    ["rechazado con fecha de publicación", RECHAZADO],
    ["en revisión con fecha de publicación", EN_REVISION],
  ])("%s sigue invisible en la búsqueda", async (_caso, ficha) => {
    for (const q of ["cerrajeria", "cerrajero", "fantasma", "aperturas"]) {
      const resultados = await buscarNegociosPublicados(q);
      expect(resultados.map((n) => n.nombre), q).not.toContain(ficha.nombre);
      expect(resultados.map((n) => n.whatsapp), q).not.toContain(ficha.whatsapp);

      const html = await renderBuscar(q);
      for (const secreto of [
        ficha.nombre,
        ficha.whatsapp,
        ficha.telefonoFijo,
        ficha.direccion,
        ficha.token,
      ]) {
        expect(html, `${q} → ${secreto}`).not.toContain(secreto);
      }
    }
  });

  it("un publicado sin fecha de publicación sí aparece y no rompe el orden", async () => {
    const resultados = await buscarNegociosPublicados("cerrajeria");
    const nombres = resultados.map((n) => n.nombre);
    expect(nombres).toContain(SIN_FECHA.nombre);
    expect(nombres).toContain(HOSTIL.nombre);
    // Determinista: repetir la búsqueda da el mismo orden.
    expect((await buscarNegociosPublicados("cerrajeria")).map((n) => n.nombre)).toEqual(
      nombres,
    );
  });

  it.each([
    "Publicado",
    "publicado ",
    " publicado",
    "PUBLICADO",
    "publicado' OR '1'='1",
    "en_revision,publicado",
    "",
  ])(
    "la base rechaza el estado %j (los CHECK sobrevivieron a la migración de este change)",
    async (estado) => {
      const nombre = "Negocio De Estado Inválido (ficticio)";
      await expect(
        prisma.negocio.create({
          data: {
            nombre,
            ...datosDeBusqueda(nombre, null),
            categoriaId,
            whatsapp: `${PREFIJO}${String(200 + estado.length)}`,
            estado,
            origen: "organico",
            consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
          },
        }),
      ).rejects.toThrow();
    },
  );

  it.each(["Siembra", "organico ", "manual", ""])(
    "la base rechaza el origen %j",
    async (origen) => {
      const nombre = "Negocio De Origen Inválido (ficticio)";
      await expect(
        prisma.negocio.create({
          data: {
            nombre,
            ...datosDeBusqueda(nombre, null),
            categoriaId,
            whatsapp: `${PREFIJO}${String(300 + origen.length)}`,
            estado: "publicado",
            origen,
            consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
          },
        }),
      ).rejects.toThrow();
    },
  );

  it("ningún estado inválido se coló a la tabla durante los intentos", async () => {
    const estados = await prisma.negocio.findMany({ select: { estado: true, origen: true } });
    for (const fila of estados) {
      expect(["en_revision", "publicado", "rechazado"]).toContain(fila.estado);
      expect(["siembra", "organico"]).toContain(fila.origen);
    }
  });
});

describe("adversarial C · el buscador no es un oráculo de fichas sin publicar", () => {
  it("un término que solo coincide con una ficha sin publicar responde igual que uno inexistente", async () => {
    // "revision" solo aparece en el "¿Qué ofreces?" de la ficha EN_REVISION.
    const conFichaOculta = await renderBuscar("revisionficticia");
    const sinNada = await renderBuscar("zzzqqqvvvficticia");

    // Las dos son la misma página de "no encontramos nada": la única
    // diferencia posible es el eco de la consulta.
    const neutralizar = (html: string, q: string) => html.split(q).join("<CONSULTA>");
    expect(neutralizar(conFichaOculta, "revisionficticia")).toEqual(
      neutralizar(sinNada, "zzzqqqvvvficticia"),
    );
    expect(compacto(conFichaOculta)).toContain("No encontramos negocios para");
  });

  it("un término del nombre de la ficha en revisión no cambia el conteo de resultados", async () => {
    expect(await buscarNegociosPublicados("Cerrajería En Revisión Fantasma")).toEqual([]);
    expect(await buscarNegociosPublicados("Cerrajería Rechazada Fantasma")).toEqual([]);
  });
});

describe("adversarial C · el alta pública no puede auto-publicarse ni fijar su texto de búsqueda", () => {
  it("los campos extra del formulario se ignoran y la ficha no aparece en el buscador", async () => {
    reiniciarLimitePorIp();
    const resultado = await procesarRegistro(
      envioRegistro({
        nombre: "Herrería Impostora Zzyzx (ficticia)",
        whatsapp: `${PREFIJO}401`,
        queOfreces: "Portones y barandales.",
        // Todo lo que un cliente hostil intentaría inyectar:
        estado: "publicado",
        origen: "siembra",
        publicadoEn: "2020-01-01T00:00:00.000Z",
        tokenGestion: "token-inyectado-ficticio",
        id: "id-inyectado",
        nombreNormalizado: "plomero tacos futbol doctor",
        queOfrecesNormalizado: "plomero tacos futbol doctor",
      }),
      { prisma, ip: IP },
    );
    expect(resultado.exito).toBe(true);

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}401` },
    });
    expect(creado.estado).toBe("en_revision");
    expect(creado.origen).toBe("organico");
    expect(creado.publicadoEn).toBeNull();
    expect(creado.tokenGestion).toBeNull();
    expect(creado.id).not.toBe("id-inyectado");
    expect(creado.nombreNormalizado).toBe("herreria impostora zzyzx ficticia");
    expect(creado.queOfrecesNormalizado).toBe("portones y barandales");

    // Y lo que importa de verdad: no se coló al directorio por la puerta nueva.
    for (const q of ["herreria", "impostora", "zzyzx", "portones", "plomero", "tacos"]) {
      const nombres = (await buscarNegociosPublicados(q)).map((n) => n.nombre);
      expect(nombres, q).not.toContain("Herrería Impostora Zzyzx (ficticia)");
    }
    const html = await renderBuscar("zzyzx");
    expect(html).not.toContain("Zzyzx");
  });
});

describe("adversarial C · lo que llega a la base está acotado pase lo que pase", () => {
  const CONSULTAS_CARAS = [
    "a".repeat(60_000),
    "cerrajero ".repeat(6_000),
    Array.from({ length: 2_000 }, (_, i) => `termino${i}`).join(" "),
    Array.from({ length: 2_000 }, () => "%_").join(""),
    "́".repeat(20_000), // marcas combinantes sueltas (texto "zalgo")
    "🎉".repeat(20_000),
    "cerrajero" + "\u0000".repeat(5_000),
  ];

  it.each(CONSULTAS_CARAS.map((q, i) => [i, q] as const))(
    "la consulta cara #%i produce como mucho %s términos de %s letras seguras",
    async (_i, q) => {
      const terminos = terminosDeBusqueda(q);
      expect(terminos.length).toBeLessThanOrEqual(MAXIMO_TERMINOS);
      for (const termino of terminos) {
        expect(termino, termino).toMatch(/^[a-z0-9]+$/);
        expect(termino.length).toBeLessThanOrEqual(LONGITUD_RAIZ);
      }
    },
  );

  it("una consulta gigante hace UNA sola consulta a la base, o ninguna", async () => {
    for (const q of CONSULTAS_CARAS) {
      const espia = vi.spyOn(obtenerPrisma().negocio, "findMany");
      await buscarNegociosPublicados(q);
      expect(espia.mock.calls.length, q.slice(0, 20)).toBeLessThanOrEqual(1);
      const argumentos = espia.mock.calls.at(-1)?.[0] as
        | { where?: { AND?: unknown[] } }
        | undefined;
      if (argumentos) {
        expect(argumentos.where?.AND?.length ?? 0).toBeLessThanOrEqual(MAXIMO_TERMINOS);
      }
      espia.mockRestore();
    }
  });

  it("nada de lo que va al where lleva comodines de LIKE ni comillas", async () => {
    for (const q of ["%cerraj%", "_cerraj_", "cerraj' OR '1'='1", "cerraj\\%"]) {
      const espia = vi.spyOn(obtenerPrisma().negocio, "findMany");
      await buscarNegociosPublicados(q);
      const serializado = JSON.stringify(espia.mock.calls.at(-1)?.[0] ?? {});
      espia.mockRestore();
      expect(serializado, q).not.toMatch(/"contains":"[^"]*[%_\\']/);
    }
  });

  // M-3 CORREGIDO (iteración 2): las muletillas con las que se enuncia la
  // pregunta ("quien", "me", "la", "arregla") ya no gastan la cuota de 4
  // términos ni se exigen con AND. La frase natural del Flujo B encuentra lo
  // mismo que la palabra sola.
  it("una frase natural del vecino encuentra lo mismo que la palabra sola", async () => {
    expect(terminosDeBusqueda("quien me arregla la cerrajeria")).toEqual(["cerra"]);
    expect(terminosDeBusqueda("de la el en plomero")).toEqual(["plome"]);

    const conFrase = await buscarNegociosPublicados("quien me arregla la cerrajeria");
    const conPalabra = await buscarNegociosPublicados("cerrajeria");
    expect(conPalabra.length).toBeGreaterThan(0);
    expect(conFrase).toEqual(conPalabra);
  });

  it("las palabras con contenido sí se siguen exigiendo todas", () => {
    // La muletilla no se lleva por delante el requirement "varias palabras se
    // exigen todas": lo que se descarta es solo el enunciado de la pregunta.
    expect(terminosDeBusqueda("cerrajeria de autos")).toEqual(["cerra", "autos"]);
    expect(terminosDeBusqueda("futbol infantil")).toEqual(["futbo", "infan"]);
  });

  it('"cerrajeria en Tizayuca" encuentra lo mismo que "cerrajeria"', async () => {
    // El sitio entero es de Tizayuca: la palabra no discrimina ningún negocio,
    // y exigirla con AND dejaba en cero una consulta perfectamente legítima.
    const conCiudad = await buscarNegociosPublicados("cerrajeria en Tizayuca");
    const sinCiudad = await buscarNegociosPublicados("cerrajeria");
    expect(sinCiudad.length).toBeGreaterThan(0);
    expect(conCiudad).toEqual(sinCiudad);
  });

  it('buscar solo "tizayuca" responde una página normal, sin tronar', async () => {
    expect(terminosDeBusqueda("tizayuca")).toEqual(["tizay"]);
    const html = await renderBuscar("tizayuca");
    expect(html).toContain("<section");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(compacto(html)).not.toContain("¿Qué estás buscando?");
    // Y sigue sin colar fichas que no están publicadas.
    expect(compacto(html)).not.toContain(RECHAZADO.whatsapp);
    expect(compacto(html)).not.toContain(EN_REVISION.whatsapp);
  });

  it("una consulta de puras muletillas se busca tal cual, no se vacía", async () => {
    // Si al quitar las muletillas no queda nada, se usan como términos: el
    // vecino escribió algo, así que ve "no encontramos", no "¿qué buscas?".
    expect(terminosDeBusqueda("quien me la hace")).toEqual(["quien", "me", "la", "hace"]);
    expect(compacto(await renderBuscar("quien me la hace"))).toContain(
      "No encontramos negocios para",
    );
  });

  it("un solo carácter nunca llega a la base", () => {
    for (const q of ["a", "1", "ñ", "%", "-", " a "]) {
      expect(terminosDeBusqueda(q), q).toEqual([]);
    }
  });

  it("la consulta solo mira sus primeros caracteres: lo que sigue no cambia el where", () => {
    const base = "cerrajero urgente".padEnd(LONGITUD_MAXIMA_CONSULTA, "z");
    expect(terminosDeBusqueda(base)).toEqual(terminosDeBusqueda(`${base}plomero tacos`));
  });

  // M-2 CORREGIDO (iteración 2): el tope de 60 se aplica al texto YA
  // normalizado, así que el relleno (espacios, puntuación, emojis, otro
  // alfabeto) desaparece antes de gastar la cuota y el término real sobrevive.
  it("un relleno hostil al principio ya no se come la consulta", async () => {
    expect(terminosDeBusqueda("cerrajero")).toEqual(["cerra"]);
    for (const relleno of [
      " ".repeat(60),
      ".".repeat(64),
      "🎉".repeat(30),
      "Привет ".repeat(20),
      "%_".repeat(50),
    ]) {
      expect(
        terminosDeBusqueda(`${relleno}cerrajero`),
        JSON.stringify(relleno.slice(0, 4)),
      ).toEqual(["cerra"]);
    }

    const html = await renderBuscar(`${" ".repeat(60)}cerrajero`);
    expect(compacto(html)).toContain("Resultados para");
    expect(compacto(html)).not.toContain("¿Qué estás buscando?");
    // Lo que estaba garantizado antes y sigue estándolo: las fichas sin
    // publicar no se cuelan aunque su nombre coincida con el término.
    expect(compacto(html)).not.toContain(RECHAZADO.whatsapp);
    expect(compacto(html)).not.toContain(EN_REVISION.whatsapp);
    expect(compacto(html)).not.toContain(RECHAZADO.token);
    expect(compacto(html)).not.toContain(EN_REVISION.token);
  });

  it("la cota sigue viva: el relleno no deja pasar más términos de la cuenta", () => {
    // Que el relleno ya no cuente no significa que la consulta sea ilimitada:
    // sobre el texto normalizado siguen valiendo los 60 caracteres y los 4
    // términos (la razón de la cota es no normalizar ni buscar de más).
    const larga = "cerrajero plomero tacos futbol natacion estetica taller";
    expect(terminosDeBusqueda(larga)).toHaveLength(MAXIMO_TERMINOS);
    expect(terminosDeBusqueda("a".repeat(200_000))).toEqual(["aaaaa"]);
    expect(terminosDeBusqueda(`${"🎉".repeat(50_000)}cerrajero`)).toEqual(["cerra"]);
  });
});

describe("adversarial C · el eco de ?q está acotado y sigue siendo texto", () => {
  const CORTE = 80; // LONGITUD_MAXIMA_CONSULTA_MOSTRADA de src/app/(publico)/buscar/page.tsx

  const valorDelCampo = (html: string) =>
    html.match(/<input[^>]*\bvalue="([^"]*)"/)?.[1] ?? "";
  const textoDelH1 = (html: string) => html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";

  it("en la frontera exacta no se recorta ni se agrega el carácter de puntos", async () => {
    const q = "q".repeat(CORTE);
    const html = await renderBuscar(q);
    expect(valorDelCampo(html)).toBe(q);
    expect(textoDelH1(html)).toBe(`Resultados para &quot;${q}&quot;`);
    expect(textoDelH1(html)).not.toContain("…");
  });

  it("un carácter más se recorta, y el campo no se lleva los puntos suspensivos", async () => {
    const q = "q".repeat(CORTE + 1);
    const html = await renderBuscar(q);
    expect(valorDelCampo(html)).toBe("q".repeat(CORTE));
    expect(textoDelH1(html)).toBe(`Resultados para &quot;${"q".repeat(CORTE)}…&quot;`);
  });

  it("con 5 000 caracteres el HTML no crece: el eco está acotado a dos copias de 80", async () => {
    const chico = await renderBuscar("q".repeat(CORTE));
    const enorme = await renderBuscar("q".repeat(5_000));
    // El hallazgo de b-dev (el `value` devolvía la cadena entera) sigue cerrado:
    // la respuesta a 5 000 caracteres no es más grande que la de 80.
    expect(enorme.length).toBeLessThanOrEqual(chico.length + 4);
    expect(enorme).not.toContain("q".repeat(CORTE + 2));
  });

  it("una consulta rellena de espacios no desborda la respuesta", async () => {
    const html = await renderBuscar(`${" ".repeat(500)}cerrajero${" ".repeat(500)}`);
    expect(html.length).toBeLessThan(20_000);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  // M-1 CORREGIDO (iteración 2): el eco sanea ANTES de recortar.
  it("los caracteres de control y las marcas bidi no vuelven en el eco", async () => {
    const basura = "\u0000\u0008\u202E";
    const html = await renderBuscar(`cerrajero${basura}odartsigeron`);
    // Ni byte NUL crudo en el cuerpo (respuesta no conforme para WAFs y
    // pipelines de log) ni RIGHT-TO-LEFT OVERRIDE (spoofing visual del `h1`
    // sirviéndose desde el dominio legítimo).
    const eco = `${textoDelH1(html)} ${valorDelCampo(html)}`;
    expect(eco).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    for (const caracter of [...basura]) expect(html).not.toContain(caracter);
    // Y lo que ya estaba garantizado sigue estándolo: es texto, no marcado.
    expect(html).not.toContain("<script");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    // La palabra buscable no se pierde por venir acompañada de basura.
    expect(compacto(html)).toContain("Resultados para");
  });

  it.each([
    ["NUL", "\u0000"],
    ["RLO", "\u202E"],
    ["LRO", "\u202D"],
    ["espacio de ancho cero", "\u200B"],
    ["unión de ancho cero", "\u200D"],
    ["marca de orden de bytes", "\uFEFF"],
    ["salto de línea y tabulador", "\r\n\t"],
  ])("el invisible %s no llega ni al h1 ni al value", async (_caso, basura) => {
    const html = await renderBuscar(`cerrajero${basura}urgente`);
    const eco = `${textoDelH1(html)} ${valorDelCampo(html)}`;
    expect(eco).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    for (const caracter of [...basura]) expect(eco).not.toContain(caracter);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("el recorte de 80 no parte una pareja suplente", async () => {
    const q = `${"q".repeat(79)}🎉cerrajero`;
    const html = await renderBuscar(q);
    // Se corta por puntos de código, así que nunca queda medio emoji suelto
    // en el `h1` ni dentro del `value` que el vecino reenvía al corregir.
    expect(html).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(html).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("<section");
  });
});

describe("adversarial C · la normalización compartida no abrió huecos", () => {
  it("NFC y NFD del mismo nombre dan el mismo slug y el mismo texto de búsqueda", () => {
    const nfc = "Plomería Güicho Ñoño";
    const nfd = nfc.normalize("NFD");
    expect(nfc).not.toBe(nfd); // de verdad son cadenas distintas
    expect(slugify(nfd)).toBe(slugify(nfc));
    expect(datosDeBusqueda(nfd, nfd)).toEqual(datosDeBusqueda(nfc, nfc));
    expect(terminosDeBusqueda(nfd)).toEqual(terminosDeBusqueda(nfc));
  });

  it("un negocio guardado en NFD se encuentra escribiendo en NFC y al revés", async () => {
    const nombre = "Cerrajería Ñandú Descompuesta (ficticia)".normalize("NFD");
    await prisma.negocio.create({
      data: {
        nombre,
        ...datosDeBusqueda(nombre, null),
        categoriaId,
        whatsapp: `${PREFIJO}501`,
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-01T10:00:00.000Z"),
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });

    for (const q of ["ñandú", "ñandú".normalize("NFD"), "nandu", "ÑANDÚ"]) {
      const nombres = (await buscarNegociosPublicados(q)).map((n) => n.nombre);
      expect(nombres, q).toContain(nombre);
    }
  });

  it("slugify no cambió al mudarse el quitado de acentos a src/lib/texto.ts", () => {
    const casos: Array<[string, string]> = [
      ["Plomería", "plomeria"],
      ["Fonda / comida corrida", "fonda-comida-corrida"],
      ["Haciendas de Tizayuca", "haciendas-de-tizayuca"],
      ["  ---Ñoño Güero---  ", "nono-guero"],
      ["Ｐｌｏｍｅｒｏ", ""], // ancho completo: no es a-z, no deja slug
      ["🎉🎈", ""],
      ["Plomería".normalize("NFD"), "plomeria"],
    ];
    for (const [entrada, esperado] of casos) {
      expect(slugify(entrada), entrada).toBe(esperado);
    }
  });

  it("dos nombres que solo difieren en acentos no colisionan en la ficha: el id manda", async () => {
    // El slug del segmento es el mismo; lo que resuelve la ficha es el id.
    expect(slugify("Cerrajería Ñandú")).toBe(slugify("Cerrajeria Nandu"));
    const html = await renderBuscar("cerrajeria");
    const hrefs = [...html.matchAll(/href="(\/negocio\/[^"]*)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(hrefs.length); // ninguna URL repetida
  });
});

describe("adversarial C · ningún camino de escritura se salta datosDeBusqueda", () => {
  const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  function fuentes(directorio: string): string[] {
    const encontrados: string[] = [];
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completa = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "generated" || entrada.name === "node_modules") continue;
        encontrados.push(...fuentes(completa));
        continue;
      }
      if (entrada.name.endsWith(".ts") || entrada.name.endsWith(".tsx")) {
        encontrados.push(completa);
      }
    }
    return encontrados;
  }

  it("todo archivo que crea o actualiza un Negocio importa datosDeBusqueda", () => {
    const archivos = [
      ...fuentes(path.join(raiz, "src")),
      ...fuentes(path.join(raiz, "prisma")),
    ];
    const escritores = archivos.filter((archivo) =>
      /negocio\.(create|update|upsert|createMany|updateMany)\b/.test(
        readFileSync(archivo, "utf8"),
      ),
    );
    expect(escritores.length).toBeGreaterThan(0);
    // El panel de revisión (transiciones.ts) actualiza Negocio pero nunca
    // escribe `nombre` ni `queOfreces` (aprobar/rechazar tocan estado, giros,
    // colonia, origen y el rastro de rechazo): no necesita recalcular el
    // texto normalizado. La aserción de abajo mantiene honesta la excepción:
    // si algún día escribe esos campos, este test truena y obliga a sumar
    // `datosDeBusqueda` ahí también.
    const exentos = [path.join(raiz, "src/lib/admin/transiciones.ts")];
    for (const archivo of escritores) {
      const codigo = readFileSync(archivo, "utf8");
      if (exentos.includes(archivo)) {
        expect(codigo, archivo).not.toMatch(/\bnombre\s*:|\bqueOfreces\s*:/);
        continue;
      }
      expect(codigo, archivo).toContain("datosDeBusqueda");
    }
  });
});

/**
 * Iteración 2 · residuo del hallazgo M-1.
 *
 * `recortarConsulta` sanea el eco RENDERIZADO (el `h1` y el `value`), pero
 * Next serializa además los `searchParams` CRUDOS dentro del payload RSC que
 * inlina en un `<script>` (`__PAGE__?{"q":"…"}`). Eso no lo controla la
 * página. El veredicto de la etapa C es que ese residuo es inocuo —no es
 * texto renderizado, así que no hay spoofing bidi—, pero eso solo vale si la
 * cadena NO puede salirse de su literal ni del `<script>`. Esto es lo que
 * fija esa condición, que es la que de verdad importa: si una versión futura
 * de Next dejara de escapar `<`, `\`, las comillas o los terminadores de
 * línea de JavaScript, aquí habría un XSS y esta suite tiene que gritarlo.
 *
 * Se prueba sobre el HTML servido de verdad por `renderToStaticMarkup`, que
 * no incluye el payload; por eso el chequeo del payload va contra el marcado
 * completo que produce la página en el test de integración de arriba y aquí
 * se acota a lo que sí se puede afirmar sin servidor: que ningún carácter
 * peligroso sobreviva sin escapar en NINGUNA parte de la respuesta.
 */
describe("adversarial C · el eco no puede salirse de su literal ni del script", () => {
  const VECTORES: Array<[string, string]> = [
    ["cierre de script", "</script><script>alert(1)</script>"],
    ["cierre con mayúsculas", "</ScRiPt ><img src=x onerror=alert(2)>"],
    ["comentario HTML", "<!--><script>alert(3)</script>"],
    ["separador de línea JS (U+2028)", "cerrajero alert(4)"],
    ["separador de párrafo JS (U+2029)", "cerrajero alert(5)"],
    ["comilla y barra invertida", 'cerrajero\\"+alert(6)+\\"'],
    ["comilla simple", "cerrajero'+alert(7)+'"],
    ["entidad ya escapada", "&lt;/script&gt;"],
    ["CDATA", "]]></script><script>alert(8)</script>"],
  ];

  it.each(VECTORES)("%s no abre marcado nuevo en la respuesta", async (_caso, q) => {
    const html = await renderBuscar(q);

    // Ninguna etiqueta nueva: todo lo del cliente quedó como texto escapado.
    expect(html).not.toMatch(/<\/?script/i);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<!--");
    // Los terminadores de línea de JavaScript nunca salen crudos: si el eco
    // acabara dentro de un literal de script, romperían la cadena.
    expect(html).not.toContain(" ");
    expect(html).not.toContain(" ");
    // La página sigue siendo la página.
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("<section");
  });

  it("el marcado del vector viaja escapado, no desaparecido", async () => {
    const html = await renderBuscar("</script><script>alert(1)</script>");
    expect(html).toContain("&lt;/script&gt;");
  });
});

/**
 * Iteración 2 · verificación del arreglo de M-3 (muletillas).
 *
 * Descartar palabras antes del `AND` es un cambio que solo puede DEVOLVER
 * MÁS. Lo que hay que probar no es que encuentre más, sino que no rompa las
 * dos cosas que la spec sí exige: que las palabras CON contenido se sigan
 * exigiendo todas, y que ninguna consulta pueda quedarse sin términos y
 * terminar listando el directorio.
 */
describe("adversarial C · las muletillas no debilitan la búsqueda", () => {
  it("una frase enunciada como pregunta ya encuentra lo mismo que la palabra sola", async () => {
    const solo = (await buscarNegociosPublicados("cerrajeria")).map((n) => n.nombre);
    expect(solo.length).toBeGreaterThan(0);
    // Estas frases son PURO enunciado + la palabra útil: la lista de
    // muletillas las cubre y el resultado es idéntico al de la palabra sola.
    for (const frase of [
      "quien me arregla la cerrajeria",
      "necesito una cerrajeria",
      "¿quién repara cerrajeria?",
      "donde hay cerrajeria",
    ]) {
      const conFrase = (await buscarNegociosPublicados(frase)).map((n) => n.nombre);
      expect(conFrase, frase).toEqual(expect.arrayContaining(solo));
    }
  });

  it("RESIDUO M-3 (pin): un adjetivo o complemento que el negocio no escribió sigue devolviendo cero", async () => {
    // La lista de muletillas cubre el ENUNCIADO de la pregunta, pero el `AND`
    // se sigue aplicando a cualquier otra palabra: adjetivos y complementos
    // que el negocio no tiene por qué haber escrito. Ver "Residuo de M-3" en
    // el reporte c-seguridad; es conforme a la spec (duda 3 de la propuesta:
    // "exigir todas") y por eso se deja, documentado como deuda de PRODUCTO
    // en b-dev.md. Si se decide corregirlo, este test debe invertirse.
    //
    // El caso del municipio ("cerrajeria en Tizayuca") SÍ se corrigió en la
    // iteración 2: el sitio entero es de Tizayuca, así que esa palabra no
    // discrimina nada y pasó a la lista de muletillas. Su test vive arriba.
    expect((await buscarNegociosPublicados("cerrajeria")).length).toBeGreaterThan(0);
    for (const frase of [
      "cerrajeria en Huicalco", // la colonia es relación, no texto (fuera de alcance)
      "cerrajeria barata", // adjetivo
      "cerrajeria 24 horas", // complemento
    ]) {
      expect(await buscarNegociosPublicados(frase), frase).toEqual([]);
    }
    // La mitigación que la spec sí exige está puesta: no es un error, y
    // ofrece las categorías como salida.
    const html = await renderBuscar("cerrajeria barata");
    expect(compacto(html)).toContain("No encontramos negocios para");
    expect(compacto(html)).toContain("Prueba con otra palabra o elige una categoría:");
  });

  it("las palabras con contenido se siguen exigiendo TODAS (scenario de la spec)", async () => {
    // "futbol infantil": ninguna de las dos es muletilla, así que el AND sigue.
    expect(terminosDeBusqueda("futbol infantil")).toEqual(["futbo", "infan"]);
    // Y el caso que la spec usa para "sin resultados" no se debilita: si
    // "espacial" se descartara, "veterinario" solo empezaría a traer cosas.
    expect(terminosDeBusqueda("veterinario espacial")).toEqual(["veter", "espac"]);
    // Dos palabras con contenido que no conviven en ningún negocio → nada.
    expect(await buscarNegociosPublicados("cerrajeria natacion")).toEqual([]);
  });

  it("quitar muletillas nunca puede vaciar la lista de términos", () => {
    // Si todo fuera muletilla se usan tal cual: el vecino ve "no encontramos",
    // no el aviso de consulta vacía, que sería mentira.
    for (const q of ["quien me la hace", "de la el en", "necesito uno", "que hay aqui"]) {
      expect(terminosDeBusqueda(q).length, q).toBeGreaterThan(0);
    }
  });

  it("una consulta de puras muletillas sigue sin devolver el directorio entero", async () => {
    const publicados = await prisma.negocio.count({ where: { estado: "publicado" } });
    for (const q of ["de la el en", "quien me la hace"]) {
      const resultados = await buscarNegociosPublicados(q);
      expect(resultados.length, q).toBeLessThan(publicados);
    }
  });

  it("las muletillas no son un atajo a las fichas sin publicar", async () => {
    for (const q of [
      "quien me arregla la cerrajeria fantasma",
      "necesito la cerrajeria en revision",
      "donde hay cerrajeria rechazada",
    ]) {
      const nombres = (await buscarNegociosPublicados(q)).map((n) => n.nombre);
      expect(nombres, q).not.toContain(RECHAZADO.nombre);
      expect(nombres, q).not.toContain(EN_REVISION.nombre);
      const html = await renderBuscar(q);
      for (const secreto of [RECHAZADO.token, EN_REVISION.token, EN_REVISION.direccion]) {
        expect(html, `${q} → ${secreto}`).not.toContain(secreto);
      }
    }
  });
});

/**
 * Iteración 2 · verificación del arreglo de M-2.
 *
 * El arreglo quitó el recorte de la cadena CRUDA (decisión 3 del reporte
 * original) y ahora se normaliza la consulta entera. Eso está bien —es lo que
 * corrige el defecto— pero mueve la cota: lo que acota el tamaño de entrada ya
 * no es la aplicación, es el límite de la línea de petición de Node (medido:
 * 431 a partir de ~20 KB). Aquí se fija que la cota que SÍ depende de este
 * código —lo que llega a la base— sigue en pie pase lo que pase.
 */
describe("adversarial C · el arreglo de M-2 no aflojó la cota real", () => {
  it("el relleno hostil ya no se come la consulta, pero tampoco cuela más términos", () => {
    for (const relleno of [
      " ".repeat(200),
      ".".repeat(200),
      "🎉".repeat(200),
      "Привет ".repeat(50),
      "%_".repeat(200),
    ]) {
      // Corregido: la palabra real sobrevive al relleno.
      expect(terminosDeBusqueda(`${relleno}cerrajero`), relleno.slice(0, 4)).toEqual([
        "cerra",
      ]);
      // Y la cota sigue viva: el relleno no abre la puerta a más términos.
      const muchos = `${relleno}${Array.from({ length: 50 }, (_, i) => `palabra${i}`).join(" ")}`;
      expect(terminosDeBusqueda(muchos).length).toBeLessThanOrEqual(MAXIMO_TERMINOS);
    }
  });

  it("el tope de 60 se aplica al texto ya normalizado, no a la cadena cruda", () => {
    // 60 caracteres normalizados de palabras de 6 → 10 palabras, tope de 4.
    const normalizables = Array.from({ length: 40 }, () => "abcde").join(" ");
    const terminos = terminosDeBusqueda(normalizables);
    expect(terminos.length).toBeLessThanOrEqual(MAXIMO_TERMINOS);
    // Y lo que quedó fuera del tope de 60 de verdad no se busca.
    expect(terminosDeBusqueda(`${"za ".repeat(30)}cerrajero`)).not.toContain("cerra");
  });

  it("normalizar la consulta entera sigue siendo barato en el peor caso alcanzable", () => {
    // ~16 KB es lo máximo que deja pasar la línea de petición HTTP de Node
    // (más allá responde 431 antes de tocar este código). El peor caso de
    // coste es texto con acentos, que obliga a descomponer en NFD.
    const peorCaso = "é".repeat(16_000);
    const inicio = performance.now();
    for (let i = 0; i < 10; i++) terminosDeBusqueda(peorCaso);
    const porLlamada = (performance.now() - inicio) / 10;
    expect(porLlamada).toBeLessThan(20); // holgado: medido en ~0.36 ms
    // Y por caro que sea normalizar, a la base sigue llegando UNA raíz.
    expect(terminosDeBusqueda(peorCaso)).toEqual(["eeeee"]);
  });
});
