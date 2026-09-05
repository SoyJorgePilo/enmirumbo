import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

/**
 * El cliente que recibe la PANTALLA queda instrumentado.
 *
 * Es la diferencia con las suites de la etapa B: ahí se comprueba por lectura
 * del código que `requerirSesionAdmin()` aparece antes que la consulta. Aquí
 * se comprueba en ejecución que sin sesión **la base no se toca ni una vez**,
 * y de paso queda anotado QUÉ le pidió la pantalla a la base (el `select`, el
 * `take`, el `where`) para poder afirmar que ni siquiera se traen los campos
 * personales, no ya que no se pinten.
 *
 * Toda escritura está minada: si algún día esta pantalla de solo lectura
 * aprendiera a escribir, la prueba revienta en el acto.
 */
vi.mock("../src/lib/prisma", async () => {
  const { crearClientePrueba } = await import("./db");
  const cliente = crearClientePrueba();
  const negocio = cliente.negocio;
  const llamadas: Array<{ metodo: string; args: Record<string, unknown> }> = [];
  const escritura = (metodo: string) => () => {
    llamadas.push({ metodo, args: {} });
    throw new Error(`escritura (${metodo}) desde una pantalla de solo lectura`);
  };
  return {
    __clienteReal: cliente,
    __llamadas: llamadas,
    obtenerPrisma: () => ({
      negocio: {
        count: (args: Record<string, unknown>) => {
          llamadas.push({ metodo: "count", args });
          return negocio.count(args as Parameters<typeof negocio.count>[0]);
        },
        findMany: (args: Record<string, unknown>) => {
          llamadas.push({ metodo: "findMany", args });
          return negocio.findMany(args as Parameters<typeof negocio.findMany>[0]);
        },
        findUnique: (args: Record<string, unknown>) => {
          llamadas.push({ metodo: "findUnique", args });
          return negocio.findUnique(args as Parameters<typeof negocio.findUnique>[0]);
        },
        create: escritura("create"),
        createMany: escritura("createMany"),
        update: escritura("update"),
        updateMany: escritura("updateMany"),
        delete: escritura("delete"),
        deleteMany: escritura("deleteMany"),
        upsert: escritura("upsert"),
      },
    }),
  };
});

import { seedCatalogos } from "../prisma/seed";
import NegociosAdminPage from "../src/app/admin/negocios/page";
import { RenglonListadoNegocio } from "../src/components/admin/renglon-listado-negocio";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import {
  FILTRO_TODOS,
  PAGINA_MAXIMA,
  PORPAGINA_LISTADO,
  normalizarFiltroEstado,
  normalizarPagina,
} from "../src/lib/admin/listado-parametros";
import { DURACION_SESION_MS, NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import * as moduloPrisma from "../src/lib/prisma";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";

// Spec: revision-admin (change `agregar-listado-gestion-panel`) · etapa C.
//
// Adversarial de la vista "Todos los negocios": lo que el camino feliz no
// cubre. La pantalla vive detrás de una sesión, no tiene escritura y solo
// recibe dos parámetros por la URL, así que la superficie hostil es corta y
// muy concreta:
//
//   1. que la guarda corra ANTES de tocar la base (en ejecución, no por
//      lectura del código) y que la base ni siquiera devuelva los campos
//      personales que la pantalla no pinta;
//   2. `estado`/`pagina` con codificaciones que no son ASCII y con tipos que
//      el runtime podría entregar aunque el tipo diga otra cosa;
//   3. contenido hostil YA GUARDADO (el nombre o la colonia de una ficha son
//      texto libre de un tercero: si algo va a traer `<script>`, es eso);
//   4. que ninguna ficha se cuele entre filtros o entre páginas;
//   5. volumen: que el corte de la base aguante la página más grande que la
//      URL admite sin desbordar el entero del OFFSET.
//
// Todo dato de prueba es ficticio (repo público + LFPDPPP): serie 7719998xxx
// y nombres inventados.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const OTRO_SECRETO = "o".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const RAIZ = join(__dirname, "..");

/** Cliente sin instrumentar: es el que siembra y limpia, nunca la pantalla. */
const prisma = (moduloPrisma as unknown as { __clienteReal: PrismaClient }).__clienteReal;
const llamadas = (
  moduloPrisma as unknown as {
    __llamadas: Array<{ metodo: string; args: Record<string, unknown> }>;
  }
).__llamadas;

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

/** Abre `/admin/negocios` con el querystring que se le dé, tal cual. */
const abrirListado = (searchParams: Record<string, unknown> = {}) =>
  render(
    NegociosAdminPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    } as unknown as Parameters<typeof NegociosAdminPage>[0]),
  );

let sembrados = 0;

async function alta(datos: {
  nombre: string;
  diasAtras: number;
  estado?: string;
  coloniaOtra?: string;
}) {
  sembrados += 1;
  return prisma.negocio.create({
    data: {
      nombre: datos.nombre,
      categoriaId,
      whatsapp: `7719998${String(sembrados).padStart(3, "0")}`,
      coloniaId: datos.coloniaOtra ? null : coloniaId,
      coloniaOtra: datos.coloniaOtra ?? null,
      estado: datos.estado ?? "en_revision",
      consintioAvisoEn: haceDias(datos.diasAtras),
      registradoEn: haceDias(datos.diasAtras),
    },
  });
}

async function sembrar(cuantos: number, estado = "en_revision") {
  await prisma.negocio.createMany({
    data: Array.from({ length: cuantos }, (_, i) => ({
      nombre: `Ficticio ${estado} ${String(i).padStart(3, "0")}`,
      categoriaId,
      coloniaId,
      whatsapp: `7719998${String(sembrados + i).padStart(3, "0")}`,
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
  llamadas.length = 0;
});

// ── 1. La guarda, comprobada en ejecución ──────────────────────────────────

describe("adversarial · sin sesión, el listado no toca la base ni una vez", () => {
  // Scenario: listado sin sesión (requirement "La sesión se verifica ANTES de
  // leer nada de la base"). La etapa B lo amarra leyendo el orden de las
  // líneas del archivo; esto lo amarra en ejecución, que es donde se rompería
  // si alguien moviera la guarda debajo de la consulta.
  it.each([
    ["sin querystring", {}],
    ["con filtro y página", { estado: "publicado", pagina: "2" }],
    ["con parámetros manoseados", { estado: ["a", "b"], pagina: "-1" }],
    ["con una página astronómica", { pagina: "999999999999999999999" }],
  ])("%s: redirige al acceso y la base queda intacta", async (_caso, searchParams) => {
    await alta({ nombre: "Tortillería Ficticia La Espiga", diasAtras: 1 });
    llamadas.length = 0;

    expect(await urlDeRedireccion(() => abrirListado(searchParams))).toBe("/admin");
    expect(llamadas).toEqual([]);
  });

  it("una cookie firmada con OTRO secreto tampoco abre la base", async () => {
    await alta({ nombre: "Tortillería Ficticia La Espiga", diasAtras: 1 });
    llamadas.length = 0;

    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(OTRO_SECRETO);
    expect(await urlDeRedireccion(() => abrirListado())).toBe("/admin");
    expect(llamadas).toEqual([]);
  });

  it("una cookie caducada —aunque su firma sea buena— tampoco abre la base", async () => {
    await alta({ nombre: "Tortillería Ficticia La Espiga", diasAtras: 1 });
    llamadas.length = 0;

    const vencida = new Date(Date.now() - DURACION_SESION_MS - 1000);
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO, vencida);
    expect(await urlDeRedireccion(() => abrirListado())).toBe("/admin");
    expect(llamadas).toEqual([]);
  });

  // Scenario: listado con el panel sin configurar. El fail-safe apaga el panel
  // entero: ni con cookie buena se llega a la consulta.
  it.each([VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION])(
    "sin %s el panel está apagado y la base no se abre",
    async (variable) => {
      await alta({ nombre: "Tortillería Ficticia La Espiga", diasAtras: 1 });
      const guardada = process.env[variable];
      try {
        conSesion();
        delete process.env[variable];
        llamadas.length = 0;
        expect(await urlDeRedireccion(() => abrirListado())).toBe("/admin");
        expect(llamadas).toEqual([]);
      } finally {
        process.env[variable] = guardada;
      }
    },
  );
});

describe("adversarial · lo que la pantalla le pide a la base", () => {
  /** Campos personales que NI SIQUIERA deben viajar de la base a la app. */
  const CAMPOS_QUE_NO_SE_PIDEN = [
    "whatsapp",
    "telefonoFijo",
    "direccion",
    "fotoClave",
    "motivoRechazo",
    "motivoDespublicacion",
    "queOfreces",
    "horario",
    "facebookUrl",
    "latitud",
    "longitud",
    "consintioAviso",
    "reconsintioAviso",
  ];

  beforeEach(async () => {
    conSesion();
    await sembrar(3);
    llamadas.length = 0;
  });

  // Requirement de mínima exposición, un paso más adentro que "no lo pinta":
  // el `select` de la consulta es la lista blanca, así que el dato personal ni
  // sale de la base. Si alguien lo ampliara "para tenerlo a mano", esto falla.
  it("el select es una lista blanca: ningún campo personal sale de la base", async () => {
    await abrirListado();

    const consulta = llamadas.find((llamada) => llamada.metodo === "findMany");
    expect(consulta).toBeDefined();
    const select = consulta!.args.select as Record<string, unknown>;
    expect(Object.keys(select).sort()).toEqual([
      "colonia",
      "coloniaOtra",
      "despublicadoEn",
      "estado",
      "id",
      "nombre",
      "registradoEn",
    ]);
    const serializado = JSON.stringify(consulta!.args);
    for (const campo of CAMPOS_QUE_NO_SE_PIDEN) {
      expect(serializado, campo).not.toContain(campo);
    }
    // De la colonia se pide el nombre del catálogo y nada más.
    expect(select.colonia).toEqual({ select: { nombre: true } });
  });

  // Requirement: la pantalla es de SOLO LECTURA. Aquí no se lee el archivo: el
  // cliente que recibe la pantalla tiene minada toda escritura.
  it("solo lee: un count y un findMany por carga, y ninguna escritura", async () => {
    await abrirListado({ estado: "publicado", pagina: "3" });
    expect(llamadas.map((llamada) => llamada.metodo)).toEqual(["count", "findMany"]);
  });

  // Volumen: por manoseado que venga el querystring, lo que sale hacia la base
  // siempre es una página de 25 y un OFFSET que cabe en el entero de 32 bits
  // que PostgreSQL admite.
  it.each([
    ["página normal", { pagina: "2" }],
    ["página en la cota", { pagina: String(PAGINA_MAXIMA) }],
    ["página por encima de la cota", { pagina: "999999999999999999999" }],
    ["página negativa", { pagina: "-999999999" }],
    ["página repetida", { pagina: ["7", "8"] }],
    ["estado inventado", { estado: "despublicado" }],
  ])("%s: la base recibe take=25 y un skip dentro del entero", async (_caso, searchParams) => {
    await abrirListado(searchParams);

    const consulta = llamadas.find((llamada) => llamada.metodo === "findMany");
    expect(consulta).toBeDefined();
    expect(consulta!.args.take).toBe(PORPAGINA_LISTADO);
    const skip = consulta!.args.skip as number;
    expect(Number.isSafeInteger(skip)).toBe(true);
    expect(skip).toBeGreaterThanOrEqual(0);
    expect(skip).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  // Inyección por el `where`: el filtro que llega a Prisma solo puede ser el
  // objeto vacío o uno de los tres estados del modelo. Nunca lo que se tecleó.
  it.each([
    ["inventado", "despublicado"],
    ["con comilla", "publicado' OR 1=1 --"],
    ["con operador de Prisma dentro", '{"not":"publicado"}'],
    ["con byte nulo", "publicado\u0000"],
    ["en mayúsculas", "PUBLICADO"],
  ])("un estado %s llega a la base como filtro vacío", async (_caso, estado) => {
    await abrirListado({ estado });

    for (const llamada of llamadas) {
      expect(llamada.args.where).toEqual({});
    }
  });

  it("los tres estados del modelo son los únicos que sí filtran", async () => {
    for (const estado of ["en_revision", "publicado", "rechazado"]) {
      llamadas.length = 0;
      await abrirListado({ estado });
      for (const llamada of llamadas) {
        expect(llamada.args.where).toEqual({ estado });
      }
    }
  });
});

// ── 2. Codificaciones y tipos hostiles en la URL ───────────────────────────

describe("adversarial · el querystring en codificaciones que no son ASCII", () => {
  beforeEach(async () => {
    conSesion();
    await sembrar(30);
  });

  /**
   * Dígitos que NO son ASCII pero que `Number()` sí sabe leer (`Number("２")`
   * es 2, `Number("١٠")` es 10): sin una validación por expresión regular
   * ASCII, "２" sería una página válida escrita de una forma que ninguna otra
   * capa reconoce. Se exige que caigan en la primera página, como cualquier
   * otra basura.
   */
  const PAGINAS_EXOTICAS: Array<[string, string]> = [
    ["dígito de ancho completo", "２"],
    ["dígitos árabes orientales", "١٠"],
    ["dígitos devanagari", "२"],
    ["exponente en superíndice", "²"],
    ["con espacio duro delante", "\u00a02"],
    ["con byte nulo pegado", "2\u0000"],
    ["con salto de línea", "2\n"],
    ["con separador de miles de JS", "1_000"],
    ["en binario", "0b10"],
    ["con signo menos unicode", "−2"],
    ["con marca de orden de bytes", "\ufeff2"],
    ["con override de derecha a izquierda", "\u202e2"],
  ];

  it.each(PAGINAS_EXOTICAS)(
    "una página con %s se ve exactamente como la primera",
    async (_caso, pagina) => {
      const esperado = await abrirListado();
      expect(await abrirListado({ pagina })).toBe(esperado);
      expect(normalizarPagina(pagina)).toBe(1);
    },
  );

  /**
   * Homoglifos y formas unicode del nombre de un estado: si la normalización
   * usara `String.normalize()`, una comparación laxa o un `startsWith`, alguna
   * de estas colaría un filtro que la tira de filtros no puede señalar.
   */
  const ESTADOS_EXOTICOS: Array<[string, string]> = [
    ["o cirílica", "publicadо"],
    ["ancho completo", "ｐｕｂｌｉｃａｄｏ"],
    ["byte nulo al final", "publicado\u0000"],
    ["espacio duro delante", "\u00a0publicado"],
    ["con tabulador", "publicado\t"],
    ["porcentaje sin decodificar", "%70ublicado"],
    ["con guion en vez de guion bajo", "en-revision"],
    ["sin guion bajo", "en revision"],
    ["con acento", "publicádo"],
    ["dos valores en uno", "publicado,rechazado"],
  ];

  it.each(ESTADOS_EXOTICOS)(
    "un estado con %s se ve exactamente como 'Todos', y no se le devuelve al navegador",
    async (_caso, estado) => {
      const esperado = await abrirListado();
      const html = await abrirListado({ estado });
      expect(html).toBe(esperado);
      expect(html).not.toContain(estado);
      expect(normalizarFiltroEstado(estado)).toBe(FILTRO_TODOS);
    },
  );

  // Un querystring larguísimo no puede convertirse en una respuesta larguísima
  // (ni en un eco): lo que se teclea no viaja de vuelta.
  it("un parámetro de 100 KB no engorda la respuesta ni se refleja", async () => {
    const enorme = "a".repeat(100_000);
    const esperado = await abrirListado();
    const html = await abrirListado({ estado: enorme, pagina: enorme });
    expect(html).toBe(esperado);
    expect(html.length).toBeLessThan(esperado.length + 100);
  });
});

describe("adversarial · tipos que el runtime podría entregar aunque el tipo diga otra cosa", () => {
  /**
   * `searchParams` está tipado `string | string[] | undefined`, pero el tipo
   * es una promesa del framework, no una garantía del proceso: un cambio de
   * parser (o una llamada desde otro sitio) puede entregar cualquier cosa. La
   * normalización tiene que aguantarlo sin lanzar y sin dejar pasar nada.
   */
  const VALORES_HOSTILES: Array<[string, unknown]> = [
    ["null", null],
    ["número", 7],
    ["booleano", true],
    ["objeto vacío", {}],
    ["operador de Prisma", { not: "publicado" }],
    ["operador anidado", { estado: { gt: "" } }],
    ["arreglo de arreglos", [["publicado"]]],
    ["objeto con toString", { toString: () => "publicado" }],
    ["objeto sin prototipo", Object.create(null) as unknown],
    ["envoltorio String", new String("publicado")],
    ["función", () => "publicado"],
    ["fecha", new Date()],
  ];

  it.each(VALORES_HOSTILES)("un estado que es %s cae en 'Todos' sin lanzar", (_caso, valor) => {
    expect(() =>
      normalizarFiltroEstado(valor as string | string[] | undefined),
    ).not.toThrow();
    expect(normalizarFiltroEstado(valor as string | string[] | undefined)).toBe(FILTRO_TODOS);
  });

  it.each(VALORES_HOSTILES)("una página que es %s cae en la primera sin lanzar", (_caso, valor) => {
    expect(() => normalizarPagina(valor as string | string[] | undefined)).not.toThrow();
    expect(normalizarPagina(valor as string | string[] | undefined)).toBe(1);
  });

  it("ni el envoltorio String ni el objeto con toString se cuelan hasta la base", async () => {
    conSesion();
    await sembrar(2, "publicado");
    await sembrar(2, "rechazado");

    for (const valor of [new String("publicado"), { toString: () => "publicado" }]) {
      llamadas.length = 0;
      const html = await abrirListado({ estado: valor });
      for (const llamada of llamadas) expect(llamada.args.where).toEqual({});
      expect(html).toContain("4 negocios en esta lista");
    }
  });
});

// ── 3. Contenido hostil ya guardado ────────────────────────────────────────

describe("adversarial · una ficha con contenido hostil guardado", () => {
  const NOMBRE_HOSTIL = '<script>alert("xss del nombre")</script>';
  const COLONIA_HOSTIL = '"><img src=x onerror=alert(1)>';

  beforeEach(() => conSesion());

  // El nombre y la colonia son texto libre que capturó un tercero desde el
  // formulario público: es lo único de esta pantalla que puede traer HTML.
  it("el nombre y la colonia hostiles salen escapados, nunca como etiquetas", async () => {
    await alta({
      nombre: NOMBRE_HOSTIL,
      coloniaOtra: COLONIA_HOSTIL,
      diasAtras: 1,
    });

    const html = await abrirListado();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    // Ninguna ETIQUETA del documento estrena un manejador de eventos. (El
    // texto sí puede decir "onerror=" y no pasa nada: está dentro de un nodo
    // de texto, con sus `<` y `>` escapados, que es justo lo que se comprueba
    // dos líneas más abajo.)
    for (const etiqueta of html.matchAll(/<[^>]*>/g)) {
      expect(etiqueta[0]).not.toMatch(/\son[a-z]+=/i);
    }
    // Y sí se ve, escapado: el admin tiene que poder reconocer la ficha.
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });

  it("un javascript: guardado en el nombre no se convierte en enlace", async () => {
    await alta({ nombre: "javascript:alert(1) Ficticio", diasAtras: 1 });

    const html = await abrirListado();
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((coincidencia) => coincidencia[1]);
    for (const href of hrefs) {
      expect(href.startsWith("/admin/")).toBe(true);
    }
  });

  // El identificador viaja dentro de un atributo `href`. Hoy es un cuid que
  // genera la base, pero el componente no tiene por qué confiar en eso: si un
  // día ese valor viniera de fuera, no puede romper el atributo.
  it("un identificador hostil no rompe el atributo del enlace", () => {
    const html = renderToStaticMarkup(
      createElement(RenglonListadoNegocio, {
        id: 'x" onmouseover="alert(1)',
        nombre: "Ficticio de prueba",
        coloniaTexto: "Haciendas de Tizayuca",
        registradoEn: BASE,
        estado: "publicado",
        vieneDeDespublicacion: false,
      } as never),
    );
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });

  // Repo público + XSS: la vía por la que el escape de React se pierde es
  // exactamente una, y no está en ninguno de los archivos de este change.
  it("ningún archivo del listado inyecta HTML crudo", () => {
    for (const ruta of [
      "src/app/admin/negocios/page.tsx",
      "src/components/admin/renglon-listado-negocio.tsx",
      "src/components/admin/filtros-listado-negocios.tsx",
      "src/components/admin/paginacion-listado-negocios.tsx",
      "src/lib/admin/listado-parametros.ts",
      "src/lib/admin/textos.ts",
    ]) {
      const codigo = readFileSync(join(RAIZ, ruta), "utf8");
      expect(codigo, ruta).not.toContain("dangerouslySetInnerHTML");
      expect(codigo, ruta).not.toContain("$queryRaw");
      expect(codigo, ruta).not.toContain("$executeRaw");
    }
  });

  // Un nombre larguísimo (uno que se hubiera colado saltándose la validación
  // del formulario) no puede tumbar la pantalla ni desbordar el renglón.
  it("un nombre de 5000 caracteres se pinta sin romper la pantalla", async () => {
    const larguisimo = `Ficticio ${"o".repeat(5000)}`;
    await alta({ nombre: larguisimo, diasAtras: 1 });

    const html = await abrirListado();
    expect(html).toContain("1 negocio en esta lista");
    expect(html).toContain("break-words");
    expect(html).not.toContain("whitespace-nowrap");
  });
});

// ── 4. Que nada se cuele entre filtros ni entre páginas ────────────────────

describe("adversarial · ninguna ficha se cuela por el filtro ni por la paginación", () => {
  beforeEach(async () => {
    conSesion();
    await alta({ nombre: "Ficticio del estado en_revision", diasAtras: 1 });
    await alta({ nombre: "Ficticio del estado publicado", diasAtras: 2, estado: "publicado" });
    await alta({ nombre: "Ficticio del estado rechazado", diasAtras: 3, estado: "rechazado" });
  });

  it.each([
    ["en_revision", "1 negocio en esta lista"],
    ["publicado", "1 negocio en esta lista"],
    ["rechazado", "1 negocio en esta lista"],
  ])("con el filtro %s no aparece ninguna ficha de otro estado", async (estado, conteo) => {
    const html = await abrirListado({ estado });

    expect(html).toContain(conteo);
    expect(html).toContain(`Ficticio del estado ${estado}`);
    for (const otro of ["en_revision", "publicado", "rechazado"].filter((e) => e !== estado)) {
      expect(html, otro).not.toContain(`Ficticio del estado ${otro}`);
    }
  });

  // Requirement: los enlaces de paginación conservan el filtro. Fuera de rango
  // es justo donde es fácil perderlo y acabar viendo otra lista.
  it("una página fuera de rango con filtro conserva el filtro en la salida", async () => {
    const html = await abrirListado({ estado: "rechazado", pagina: "99" });

    expect(html).toContain('href="/admin/negocios?estado=rechazado"');
    expect(html).not.toContain("Ficticio del estado publicado");
    expect(html).not.toContain("Ficticio del estado en_revision");
  });

  // Sin desempate estable, una fila puede repetirse o perderse al pasar de
  // página. Aquí se recorren TODAS las páginas y se exige que la unión sea el
  // conjunto exacto, sin repetidos.
  it("recorrer todas las páginas no repite ni pierde ninguna ficha", async () => {
    await prisma.negocio.deleteMany();
    // Todas con la MISMA fecha: el peor caso para el orden.
    await prisma.negocio.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        nombre: `Ficticio empatado ${String(i).padStart(3, "0")}`,
        categoriaId,
        coloniaId,
        whatsapp: `7719998${String(100 + i).padStart(3, "0")}`,
        consintioAvisoEn: BASE,
        registradoEn: BASE,
      })),
    });

    const vistos: string[] = [];
    for (const pagina of ["1", "2", "3"]) {
      const html = await abrirListado({ pagina });
      for (const coincidencia of html.matchAll(/Ficticio empatado (\d{3})/g)) {
        vistos.push(coincidencia[1]);
      }
    }

    expect(vistos).toHaveLength(60);
    expect(new Set(vistos).size).toBe(60);
  });
});

// ── 5. Volumen ─────────────────────────────────────────────────────────────

describe("adversarial · la página más grande que la URL admite", () => {
  beforeEach(async () => {
    conSesion();
    await sembrar(60);
  });

  // Scenario: página más allá de la última, en su versión extrema. El OFFSET
  // que sale hacia PostgreSQL es (1.000.000 - 1) × 25 = 24.999.975: cabe en el
  // entero de 32 bits, y la base responde vacío en vez de reventar.
  it("la cota de páginas no desborda el OFFSET ni produce un error del servidor", async () => {
    llamadas.length = 0;
    const html = await abrirListado({ pagina: String(PAGINA_MAXIMA) });

    expect(html).toContain("60 negocios en esta lista");
    expect(html).not.toContain("Ver detalle");
    expect(html).toContain("Ver más nuevos");
    const consulta = llamadas.find((llamada) => llamada.metodo === "findMany");
    expect(consulta!.args.skip).toBe((PAGINA_MAXIMA - 1) * PORPAGINA_LISTADO);
    expect(consulta!.args.skip as number).toBeLessThan(2 ** 31 - 1);
  });

  it("pedir la cota no devuelve más HTML que pedir la primera página", async () => {
    const primera = await abrirListado();
    const enLaCota = await abrirListado({ pagina: String(PAGINA_MAXIMA) });
    expect(enLaCota.length).toBeLessThan(primera.length);
  });
});
