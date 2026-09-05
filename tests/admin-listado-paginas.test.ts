import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import ColaAdminPage from "../src/app/admin/cola/page";
import NegociosAdminPage, { metadata as metadataNegocios } from "../src/app/admin/negocios/page";
import { FiltrosListadoNegocios } from "../src/components/admin/filtros-listado-negocios";
import { PaginacionListadoNegocios } from "../src/components/admin/paginacion-listado-negocios";
import { RenglonListadoNegocio } from "../src/components/admin/renglon-listado-negocio";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { PORPAGINA_LISTADO } from "../src/lib/admin/listado-parametros";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  ETIQUETA_COLA_DESPUBLICADA,
  TEXTO_FILTRAR_POR_ESTADO,
  TEXTO_FILTRO_EN_REVISION,
  TEXTO_FILTRO_PUBLICADOS,
  TEXTO_FILTRO_RECHAZADOS,
  TEXTO_FILTRO_SIN_RESULTADOS,
  TEXTO_FILTRO_TODOS,
  TEXTO_LISTADO_VACIO,
  TEXTO_NEGOCIOS_ENCABEZADO,
  TEXTO_VER_DETALLE,
  TEXTO_VER_MAS_ANTIGUOS,
  TEXTO_VER_MAS_NUEVOS,
  TEXTO_VER_TODOS_LOS_NEGOCIOS,
  TEXTO_VOLVER_A_LA_COLA,
  textoConteoNegociosListado,
  textoPaginaDe,
} from "../src/lib/admin/textos";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: revision-admin (change `agregar-listado-gestion-panel`) · Requirements
// de la vista, del filtro, de la paginación, de la entrada desde la cola y de
// la herencia del acceso (tasks.md #5, #6, #7, #8 y #9).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719997xxx.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const PREFIJO = "7719997";

const normalizado = (html: string) => html.replace(/\s+/g, " ");

/** Los `href` del HTML, con las entidades del querystring ya decodificadas. */
const hrefsDe = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));

/** El `href` del enlace marcado como activo (el orden de atributos da igual). */
function hrefDelFiltroActivo(html: string): string | undefined {
  const marcado = [...html.matchAll(/<a\b[^>]*>/g)].find((etiqueta) =>
    etiqueta[0].includes('aria-current="true"'),
  );
  return marcado?.[0].match(/href="([^"]*)"/)?.[1].replaceAll("&amp;", "&");
}

/** Datos personales que el listado NO debe pintar (requirement de mínima exposición). */
const DATOS_SENSIBLES = {
  whatsapp: `${PREFIJO}001`,
  telefonoFijo: "7717779001",
  direccion: "Andador Ficticio 4, sin número",
  fotoClave: "ficticia/clave-de-prueba.webp",
  motivoRechazo: "Motivo ficticio de rechazo",
  motivoDespublicacion: "Motivo ficticio de despublicación",
};

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

const BASE = new Date("2026-09-03T18:00:00.000Z");
const DIA_MS = 24 * 60 * 60 * 1000;
const haceDias = (dias: number) => new Date(BASE.getTime() - dias * DIA_MS);

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

/** Abre `/admin/negocios` con el querystring que se le dé. */
const abrirListado = (searchParams: Record<string, string | string[]> = {}) =>
  render(
    NegociosAdminPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    } as unknown as Parameters<typeof NegociosAdminPage>[0]),
  );

async function alta(datos: {
  nombre: string;
  whatsapp: string;
  diasAtras: number;
  estado?: string;
  coloniaOtra?: string;
}) {
  return prisma.negocio.create({
    data: {
      nombre: datos.nombre,
      categoriaId,
      whatsapp: datos.whatsapp,
      coloniaId: datos.coloniaOtra ? null : coloniaId,
      coloniaOtra: datos.coloniaOtra ?? null,
      estado: datos.estado ?? "en_revision",
      consintioAvisoEn: haceDias(datos.diasAtras),
      registradoEn: haceDias(datos.diasAtras),
    },
  });
}

/** Contador de la serie ficticia 7719990xxx, para no repetir WhatsApp. */
let sembrados = 0;

/** N negocios ficticios, el 0 el más reciente. */
async function sembrar(cuantos: number, estado = "en_revision") {
  await prisma.negocio.createMany({
    data: Array.from({ length: cuantos }, (_, i) => ({
      nombre: `Ficticio ${estado} ${String(i).padStart(3, "0")}`,
      categoriaId,
      coloniaId,
      whatsapp: `7719990${String(sembrados + i).padStart(3, "0")}`,
      estado,
      consintioAvisoEn: haceDias(i),
      registradoEn: haceDias(i),
    })),
  });
  sembrados += cuantos;
}

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

afterAll(async () => {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarPeticion();
  await prisma.negocio.deleteMany();
  sembrados = 0;
});

afterEach(() => vi.restoreAllMocks());

// ── Componentes de presentación (tasks.md #5, #6, #7) ──────────────────────

describe("revision-admin · el renglón del listado", () => {
  const NOMBRE_LARGUISIMO =
    "Refaccionaria y Taller Mecánico Especializado Los Hermanos Ficticios de Tizayuca Hidalgo";
  const COLONIA_LARGA =
    "Fraccionamiento Rinconada del Venado Segunda Sección Manzana 14 (colonia inventada)";

  const renglon = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(RenglonListadoNegocio, {
        id: "reg-ficticio-largo",
        nombre: NOMBRE_LARGUISIMO,
        coloniaTexto: COLONIA_LARGA,
        registradoEn: new Date("2026-09-03T18:00:00.000Z"),
        estado: "publicado",
        vieneDeDespublicacion: false,
        ...extra,
      } as never),
    );

  // Scenario: llegar a una ficha publicada sin adivinar la URL
  it("muestra nombre, colonia, fecha completa, estado y la entrada al detalle", () => {
    const html = normalizado(renglon());
    expect(html).toContain(NOMBRE_LARGUISIMO);
    expect(html).toContain(COLONIA_LARGA);
    expect(html).toContain("Se registró el 3 de septiembre de 2026");
    expect(html).toContain("Publicado");
    expect(html).toContain(TEXTO_VER_DETALLE);
    expect(html).toContain('href="/admin/registros/reg-ficticio-largo"');
  });

  // Scenario: la lista trae los cuatro casos (la etiqueta de la despublicada)
  it("la etiqueta de despublicada solo sale cuando la ficha volvió por una despublicación", () => {
    expect(renglon({ estado: "en_revision", vieneDeDespublicacion: true })).toContain(
      ETIQUETA_COLA_DESPUBLICADA,
    );
    expect(renglon({ estado: "en_revision" })).not.toContain(ETIQUETA_COLA_DESPUBLICADA);
  });

  // Requirement "el listado se opera en el celular": nombre largo que quiebra
  // y área táctil de al menos 44px (min-h-11 = 2.75rem).
  it("el texto largo quiebra y el renglón mide al menos 44px", () => {
    const html = renglon();
    expect(html).toContain("break-words");
    expect(html).toContain("min-h-11");
  });

  // Scenario: la lista no ofrece acciones
  it("no trae ningún formulario ni botón de acción", () => {
    const html = renglon();
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });
});

describe("revision-admin · la tira de filtros", () => {
  const filtros = (filtroActivo: string) =>
    renderToStaticMarkup(
      createElement(FiltrosListadoNegocios, { filtroActivo } as never),
    );

  // Scenario: cambiar de filtro regresa a la primera página
  it("los cuatro enlaces van siempre a la primera página", () => {
    const hrefs = hrefsDe(filtros("publicado"));
    expect(hrefs).toEqual([
      "/admin/negocios",
      "/admin/negocios?estado=en_revision",
      "/admin/negocios?estado=publicado",
      "/admin/negocios?estado=rechazado",
    ]);
    for (const href of hrefs) expect(href).not.toContain("pagina=");
  });

  it("los cuatro rótulos son los literales de la spec", () => {
    const html = normalizado(filtros("todos"));
    for (const texto of [
      TEXTO_FILTRAR_POR_ESTADO,
      TEXTO_FILTRO_TODOS,
      TEXTO_FILTRO_EN_REVISION,
      TEXTO_FILTRO_PUBLICADOS,
      TEXTO_FILTRO_RECHAZADOS,
    ]) {
      expect(html).toContain(texto);
    }
  });

  // Requirement: "el filtro elegido DEBE quedar señalado de forma legible —no
  // solo por color—".
  it("el activo se distingue por atributo, no solo por una clase de color", () => {
    const html = filtros("rechazado");
    const marcados = [...html.matchAll(/<a\b[^>]*aria-current="true"[^>]*>/g)];
    expect(marcados).toHaveLength(1);
    expect(marcados[0][0]).toContain('href="/admin/negocios?estado=rechazado"');
    // Y el mismo enlace lleva un refuerzo que no es color (subrayado/negritas).
    expect(marcados[0][0]).toMatch(/underline|font-bold/);
    // Ningún otro filtro queda marcado.
    expect(filtros("todos")).toContain('aria-current="true"');
  });

  it("cada filtro es tocable a 44px", () => {
    expect([...filtros("todos").matchAll(/min-h-11/g)]).toHaveLength(4);
  });
});

describe("revision-admin · los controles de paginación", () => {
  const paginacion = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(PaginacionListadoNegocios, {
        filtroActivo: "todos",
        fueraDeRango: false,
        ...props,
      } as never),
    );

  // Scenario: la lista larga se corta
  it("en la primera página solo ofrece ir a los más antiguos", () => {
    const html = normalizado(paginacion({ paginaActual: 1, totalPaginas: 3 }));
    expect(html).toContain(textoPaginaDe(1, 3));
    expect(html).toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).not.toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).toContain('href="/admin/negocios?pagina=2"');
  });

  it("en una página intermedia ofrece los dos sentidos", () => {
    const html = normalizado(paginacion({ paginaActual: 2, totalPaginas: 3 }));
    expect(html).toContain(textoPaginaDe(2, 3));
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).toContain('href="/admin/negocios"');
    expect(html).toContain('href="/admin/negocios?pagina=3"');
  });

  it("en la última página solo ofrece regresar a los más nuevos", () => {
    const html = normalizado(paginacion({ paginaActual: 3, totalPaginas: 3 }));
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).not.toContain(TEXTO_VER_MAS_ANTIGUOS);
  });

  // Scenario: moverse entre páginas conservando el filtro
  it("los dos enlaces conservan el filtro puesto", () => {
    const hrefs = hrefsDe(
      paginacion({ filtroActivo: "publicado", paginaActual: 2, totalPaginas: 4 }),
    );
    expect(hrefs).toEqual([
      "/admin/negocios?estado=publicado",
      "/admin/negocios?estado=publicado&pagina=3",
    ]);
  });

  // Scenario: página más allá de la última
  it("fuera de rango solo ofrece la salida de regreso, a la última página real", () => {
    const html = normalizado(
      paginacion({ paginaActual: 3, totalPaginas: 3, fueraDeRango: true }),
    );
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).not.toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).toContain('href="/admin/negocios?pagina=3"');
    // Estando fuera de rango no se está "en" ninguna página: no se inventa.
    expect(html).not.toContain(textoPaginaDe(3, 3));
  });
});

// ── La pantalla completa (tasks.md #8) ─────────────────────────────────────

describe("revision-admin · el listado hereda el acceso del panel", () => {
  // Scenario: listado sin sesión
  it.each([
    ["sin querystring", {}],
    ["con filtro y página", { estado: "publicado", pagina: "2" }],
    ["con parámetros manoseados", { estado: ["a", "b"], pagina: "-3" }],
  ])("%s manda al acceso sin traer un solo dato", async (_caso, searchParams) => {
    await alta({
      nombre: "Refaccionaria Ficticia El Tornillo",
      whatsapp: DATOS_SENSIBLES.whatsapp,
      diasAtras: 1,
    });

    const destino = await urlDeRedireccion(() =>
      abrirListado(searchParams as Record<string, string | string[]>),
    );
    expect(destino).toBe("/admin");
    expect(destino).not.toContain("Refaccionaria");
    expect(destino).not.toContain("negocio");
  });

  it("una cookie manipulada vale lo mismo que ninguna", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = `${Date.now() + 100000}.firma-inventada`;
    expect(await urlDeRedireccion(() => abrirListado())).toBe("/admin");
  });

  // Scenario: listado con el panel sin configurar
  it.each([VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION])(
    "sin %s configurada no se abre",
    async (variable) => {
      const guardada = process.env[variable];
      delete process.env[variable];
      try {
        conSesion();
        expect(await urlDeRedireccion(() => abrirListado())).toBe("/admin");
      } finally {
        process.env[variable] = guardada;
      }
    },
  );

  // Scenario: el listado no se indexa ni se enlaza
  it("declara noindex, nofollow", () => {
    expect(metadataNegocios.robots).toEqual({ index: false, follow: false });
  });

  // Scenario: sin JS de cliente propio
  it("ni la pantalla ni sus componentes declaran 'use client'", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(__dirname, "..");
    for (const ruta of [
      "src/app/admin/negocios/page.tsx",
      "src/components/admin/renglon-listado-negocio.tsx",
      "src/components/admin/filtros-listado-negocios.tsx",
      "src/components/admin/paginacion-listado-negocios.tsx",
      "src/lib/admin/listado-parametros.ts",
    ]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).not.toContain("use client");
    }
  });
});

describe("revision-admin · el listado con sesión", () => {
  beforeEach(() => conSesion());

  // Scenario: base sin negocios
  it("con la base vacía muestra el texto de todavía no hay negocios", async () => {
    const html = normalizado(await abrirListado());
    expect(html).toContain(TEXTO_NEGOCIOS_ENCABEZADO);
    expect(html).toContain(TEXTO_LISTADO_VACIO);
    expect(html).not.toContain(TEXTO_VER_DETALLE);
    expect(html).toContain(textoConteoNegociosListado(0));
  });

  // Scenario: la lista trae los cuatro casos
  it("trae los cuatro casos con su estado escrito y la etiqueta de la despublicada", async () => {
    const enRevision = await alta({
      nombre: "Ficticio en revisión",
      whatsapp: `${PREFIJO}101`,
      diasAtras: 1,
    });
    await alta({
      nombre: "Ficticio publicado",
      whatsapp: `${PREFIJO}102`,
      diasAtras: 2,
      estado: "publicado",
    });
    await alta({
      nombre: "Ficticio rechazado",
      whatsapp: `${PREFIJO}103`,
      diasAtras: 3,
      estado: "rechazado",
    });
    const despublicado = await alta({
      nombre: "Ficticio despublicado",
      whatsapp: `${PREFIJO}104`,
      diasAtras: 4,
    });
    await prisma.negocio.update({
      where: { id: despublicado.id },
      data: {
        despublicadoEn: haceDias(0),
        motivoDespublicacion: DATOS_SENSIBLES.motivoDespublicacion,
      },
    });

    const html = normalizado(await abrirListado());

    expect(html).toContain(textoConteoNegociosListado(4));
    for (const nombre of [
      "Ficticio en revisión",
      "Ficticio publicado",
      "Ficticio rechazado",
      "Ficticio despublicado",
    ]) {
      expect(html).toContain(nombre);
    }
    expect(html).toContain("Publicado");
    expect(html).toContain("Rechazado");
    expect(html).toContain(ETIQUETA_COLA_DESPUBLICADA);
    // Scenario: llegar a una ficha publicada sin adivinar la URL
    expect(html).toContain(`/admin/registros/${enRevision.id}`);
    // Y el orden es el de la consulta: lo más reciente arriba.
    expect(html.indexOf("Ficticio en revisión")).toBeLessThan(
      html.indexOf("Ficticio despublicado"),
    );
  });

  // Scenario: el conteo dice cuántos hay
  it("el conteo del encabezado dice cuántos trae el filtro", async () => {
    await sembrar(34);
    const html = normalizado(await abrirListado());
    expect(html).toContain("34 negocios en esta lista");
  });

  // Scenario: la lista no ofrece acciones
  it("no ofrece ninguna acción: ni formularios ni botones", async () => {
    await sembrar(3);
    const html = await abrirListado();
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    for (const accion of ["Aprobar", "Rechazar", "Despublicar", "Borrar", "atendido"]) {
      expect(html, accion).not.toContain(accion);
    }
  });

  // Scenario: regresar a la cola
  it("ofrece la vuelta a la cola", async () => {
    const html = normalizado(await abrirListado());
    expect(html).toContain(TEXTO_VOLVER_A_LA_COLA);
    expect(html).toContain('href="/admin/cola"');
  });

  // Scenario: el listado no pinta más datos de los necesarios
  it("no pinta WhatsApp, teléfono, dirección, foto ni motivos", async () => {
    const ficha = await alta({
      nombre: "Refaccionaria Ficticia El Tornillo",
      whatsapp: DATOS_SENSIBLES.whatsapp,
      diasAtras: 1,
      estado: "rechazado",
    });
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: {
        telefonoFijo: DATOS_SENSIBLES.telefonoFijo,
        direccion: DATOS_SENSIBLES.direccion,
        fotoClave: DATOS_SENSIBLES.fotoClave,
        motivoRechazo: DATOS_SENSIBLES.motivoRechazo,
        despublicadoEn: haceDias(0),
        motivoDespublicacion: DATOS_SENSIBLES.motivoDespublicacion,
      },
    });

    const html = await abrirListado();
    expect(html).toContain("Refaccionaria Ficticia El Tornillo");
    for (const [campo, valor] of Object.entries(DATOS_SENSIBLES)) {
      expect(html, campo).not.toContain(valor);
    }
    expect(html).not.toContain("<img");
  });
});

describe("revision-admin · el listado se filtra por estado", () => {
  beforeEach(async () => {
    conSesion();
    await sembrar(3, "en_revision");
    await sembrar(2, "publicado");
  });

  // Scenario: ver solo lo publicado
  it("filtrar por publicados deja solo esos y cuenta solo esos", async () => {
    const html = normalizado(await abrirListado({ estado: "publicado" }));
    expect(html).toContain(textoConteoNegociosListado(2));
    expect(html).toContain("Ficticio publicado 000");
    expect(html).not.toContain("Ficticio en_revision 000");
    // La opción activa queda señalada.
    expect(hrefDelFiltroActivo(html)).toBe("/admin/negocios?estado=publicado");
  });

  // Scenario: filtro inventado en la URL
  it.each([
    ["palabra inventada", { estado: "xyz" }],
    ["vacío", { estado: "" }],
    ["repetido", { estado: ["publicado", "rechazado"] }],
    ["con inyección", { estado: "publicado' OR 1=1 --" }],
  ])("un estado %s se ve igual que 'Todos', sin error", async (_caso, searchParams) => {
    const html = normalizado(
      await abrirListado(searchParams as Record<string, string | string[]>),
    );
    expect(html).toContain(textoConteoNegociosListado(5));
    expect(hrefDelFiltroActivo(html)).toBe("/admin/negocios");
    // Nada del parámetro se le devuelve al navegador.
    expect(html).not.toContain("OR 1=1");
    expect(html).not.toContain("xyz");
  });

  // Scenario: un filtro sin resultados
  it("un filtro sin resultados avisa y deja los demás filtros a la vista", async () => {
    const html = normalizado(await abrirListado({ estado: "rechazado" }));
    expect(html).toContain(TEXTO_FILTRO_SIN_RESULTADOS);
    expect(html).not.toContain(TEXTO_LISTADO_VACIO);
    expect(html).toContain(TEXTO_FILTRO_TODOS);
    expect(html).toContain(TEXTO_FILTRO_PUBLICADOS);
    expect(html).toContain(TEXTO_FILTRO_EN_REVISION);
  });

  // Scenario: la URL del listado no lleva datos personales
  it("ninguna URL de la pantalla lleva más que estado y pagina", async () => {
    const hrefs = hrefsDe(await abrirListado({ estado: "publicado", pagina: "1" }));
    for (const href of hrefs) {
      if (!href.startsWith("/admin/negocios")) continue;
      const url = new URL(href, "https://ejemplo.mx");
      for (const clave of url.searchParams.keys()) {
        expect(["estado", "pagina"], href).toContain(clave);
      }
    }
  });
});

describe("revision-admin · el listado se corta en páginas de 25", () => {
  beforeEach(() => conSesion());

  /** Cuántos renglones trae el HTML (uno por "Ver detalle"). */
  const renglones = (html: string) =>
    [...html.matchAll(new RegExp(TEXTO_VER_DETALLE, "g"))].length;

  // Scenario: la lista larga se corta
  it("con 60 registros muestra 25, dice 'Página 1 de 3' y solo ofrece los antiguos", async () => {
    await sembrar(60);
    const html = normalizado(await abrirListado());

    expect(renglones(html)).toBe(PORPAGINA_LISTADO);
    expect(html).toContain(textoPaginaDe(1, 3));
    expect(html).toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).not.toContain(TEXTO_VER_MAS_NUEVOS);
    // El conteo es del total del filtro, no de la página.
    expect(html).toContain(textoConteoNegociosListado(60));
  });

  // Scenario: el HTML no crece con la base
  it("con 30 y con 500 registros el HTML pesa prácticamente lo mismo", async () => {
    await sembrar(30);
    const conPocos = await abrirListado();

    await prisma.negocio.deleteMany();
    await sembrar(500);
    const conMuchos = await abrirListado();

    expect(renglones(conPocos)).toBe(PORPAGINA_LISTADO);
    expect(renglones(conMuchos)).toBe(PORPAGINA_LISTADO);
    // La diferencia es el conteo y el número de páginas, no 470 renglones.
    expect(Math.abs(conMuchos.length - conPocos.length)).toBeLessThan(200);
  });

  // Scenario: una sola página
  it("con 10 registros no hay ningún control de paginación", async () => {
    await sembrar(10);
    const html = normalizado(await abrirListado());
    expect(renglones(html)).toBe(10);
    expect(html).not.toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).not.toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).not.toContain("Página 1 de 1");
  });

  // Scenario: moverse entre páginas conservando el filtro
  it("la segunda página de un filtro es la de ese filtro, y se regresa", async () => {
    await sembrar(30, "publicado");
    await sembrar(5, "rechazado");

    const html = normalizado(await abrirListado({ estado: "publicado", pagina: "2" }));
    expect(renglones(html)).toBe(5);
    expect(html).toContain(textoPaginaDe(2, 2));
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).not.toContain(TEXTO_VER_MAS_ANTIGUOS);
    expect(html).toContain('href="/admin/negocios?estado=publicado"');
    expect(html).not.toContain("Ficticio rechazado");
  });

  // Scenario: página inventada en la URL
  it.each([
    ["cero", "0"],
    ["negativa", "-3"],
    ["con letras", "dos"],
    ["decimal", "1.5"],
    ["repetida", ["2", "3"]],
    ["vacía", ""],
  ])("una página %s se ve como la primera", async (_caso, pagina) => {
    await sembrar(30);
    const html = normalizado(await abrirListado({ pagina } as Record<string, string>));
    expect(html).toContain(textoPaginaDe(1, 2));
    expect(html).toContain("Ficticio en_revision 000");
  });

  // Scenario: página más allá de la última
  it("la página 99 de una lista de 3 se ve vacía, sin error, con la salida de regreso", async () => {
    await sembrar(60);
    const html = normalizado(await abrirListado({ pagina: "99" }));
    expect(renglones(html)).toBe(0);
    // La lista NO está vacía (dice "60 negocios en esta lista"): ninguno de
    // los dos textos de vacío aplica aquí, y no se inventa un tercero.
    expect(html).toContain(textoConteoNegociosListado(60));
    expect(html).not.toContain(TEXTO_FILTRO_SIN_RESULTADOS);
    expect(html).not.toContain(TEXTO_LISTADO_VACIO);
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
    expect(html).toContain('href="/admin/negocios?pagina=3"');
    expect(html).not.toContain(TEXTO_VER_MAS_ANTIGUOS);
  });

  it("una página astronómica tampoco produce un error del servidor", async () => {
    await sembrar(30);
    const html = normalizado(await abrirListado({ pagina: "999999999999999999999" }));
    expect(renglones(html)).toBe(0);
    expect(html).toContain(TEXTO_VER_MAS_NUEVOS);
  });
});

// ── El listado a 390px, sin JavaScript (tasks.md #13) ──────────────────────

describe("revision-admin · el listado se opera en el celular", () => {
  beforeEach(() => conSesion());

  /**
   * Mismas clases prohibidas que el guardián del colapso responsivo de las
   * pantallas públicas (`tests/responsivo-guardian.test.ts`), aplicadas al
   * HTML servido del listado: el requirement MODIFIED de esta spec mete la
   * vista nueva —con sus filtros y su paginación— en la promesa mobile-first
   * del panel. Lo que necesita ojos humanos (contraste AA, la foto a
   * 390/768/1280px) queda anotado para el PR.
   */
  const CLASES_PROHIBIDAS: Array<[RegExp, string]> = [
    [/\bwhitespace-nowrap\b/, "fuerza el texto a una sola línea"],
    [/\btext-nowrap\b/, "fuerza el texto a una sola línea"],
    [/\btruncate\b/, "amputa la etiqueta con puntos suspensivos"],
    [/\btext-ellipsis\b/, "amputa la etiqueta con puntos suspensivos"],
    [/\boverflow-x-(auto|scroll)\b/, "esconde el desbordamiento en vez de colapsar"],
    [/\bflex-nowrap\b/, "impide que la fila baje a la siguiente línea"],
    [/(^|:)min-w-(?!0\b)/, "fija un ancho mínimo que impide colapsar"],
    [/(^|:)(min-|max-)?w-\[[^\]]*px\]/, "fija un ancho en píxeles"],
  ];

  // Scenario: el listado también se opera en el celular
  it("con nombres largos y colonia libre larga, nada impide el colapso", async () => {
    await prisma.negocio.create({
      data: {
        nombre:
          "Refaccionaria y Taller Mecánico Especializado Los Hermanos Ficticios de Tizayuca",
        categoriaId,
        whatsapp: `${PREFIJO}401`,
        coloniaId: null,
        coloniaOtra:
          "Fraccionamiento Rinconada del Venado Segunda Sección Manzana 14 (inventada)",
        consintioAvisoEn: haceDias(1),
        registradoEn: haceDias(1),
      },
    });
    await sembrar(40);

    const html = await abrirListado({ pagina: "2" });
    const clases = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
      m[1].split(/\s+/).filter(Boolean),
    );
    const hallazgos: string[] = [];
    for (const clase of clases) {
      for (const [patron, porque] of CLASES_PROHIBIDAS) {
        if (patron.test(clase)) hallazgos.push(`"${clase}" ${porque}`);
      }
    }
    expect(hallazgos).toEqual([]);
    expect(html).toContain("break-words");
  });

  // Scenario: el listado se filtra y se pagina sin JavaScript
  it("filtrar y paginar son enlaces, no controles con JavaScript", async () => {
    await sembrar(30);
    const html = await abrirListado();
    // Ni un `<script src>` propio, ni un manejador de eventos en línea.
    expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
    expect(html).not.toMatch(/\son[a-z]+="/);
    // Todo lo que mueve la vista es un `<a href>`.
    for (const control of [TEXTO_FILTRO_PUBLICADOS, TEXTO_VER_MAS_ANTIGUOS]) {
      const indice = html.indexOf(control);
      expect(indice, control).toBeGreaterThan(-1);
      expect(html.lastIndexOf("<a", indice)).toBeGreaterThan(html.lastIndexOf("<button", indice));
    }
  });

  it("cada control tocable del listado mide al menos 44px", async () => {
    await sembrar(30);
    const html = await abrirListado();
    // 4 filtros + 1 paginación + "Volver a la cola" + un renglón por negocio.
    expect([...html.matchAll(/min-h-11/g)].length).toBeGreaterThanOrEqual(
      4 + 1 + 1 + PORPAGINA_LISTADO,
    );
  });
});

// ── La entrada desde la cola (tasks.md #9) ─────────────────────────────────

describe("revision-admin · la cola enlaza al listado y no cambia en nada más", () => {
  beforeEach(() => conSesion());

  // Scenario: entrar al listado desde la cola
  it("la cola ofrece 'Ver todos los negocios' hacia el listado sin filtro", async () => {
    await sembrar(2);
    const html = normalizado(await render(ColaAdminPage()));
    expect(html).toContain(TEXTO_VER_TODOS_LOS_NEGOCIOS);
    expect(html).toContain('href="/admin/negocios"');
    expect(html).not.toContain('href="/admin/negocios?');
  });

  // Scenario: la cola no cambia
  it("la cola sigue mostrando sus pendientes del más antiguo al más reciente", async () => {
    await alta({ nombre: "Ficticio viejo", whatsapp: `${PREFIJO}301`, diasAtras: 5 });
    await alta({ nombre: "Ficticio nuevo", whatsapp: `${PREFIJO}302`, diasAtras: 1 });
    await alta({
      nombre: "Ficticio publicado",
      whatsapp: `${PREFIJO}303`,
      diasAtras: 2,
      estado: "publicado",
    });

    const html = normalizado(await render(ColaAdminPage()));
    expect(html).toContain("Registros por revisar");
    expect(html.indexOf("Ficticio viejo")).toBeLessThan(html.indexOf("Ficticio nuevo"));
    // La cola sigue siendo solo pendientes: el publicado no se coló.
    expect(html).not.toContain("Ficticio publicado");
  });
});
