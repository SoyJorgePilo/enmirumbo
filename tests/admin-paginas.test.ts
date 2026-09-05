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
import { aprobarRegistroAccion } from "../src/app/admin/registros/[id]/accion-aprobar";
import { rechazarRegistroAccion } from "../src/app/admin/registros/[id]/accion-rechazar";
import RegistroAprobadoPage from "../src/app/admin/registros/[id]/aprobado/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import RegistroRechazadoPage from "../src/app/admin/registros/[id]/rechazado/page";
import RegistroYaResueltoPage from "../src/app/admin/registros/[id]/ya-resuelto/page";
import ColaAdminPage from "../src/app/admin/cola/page";
import { metadata as metadataAcceso } from "../src/app/admin/page";
import { metadata as metadataCola } from "../src/app/admin/cola/page";
import { metadata as metadataDetalle } from "../src/app/admin/registros/[id]/page";
import { metadata as metadataAprobado } from "../src/app/admin/registros/[id]/aprobado/page";
import { metadata as metadataRechazado } from "../src/app/admin/registros/[id]/rechazado/page";
import { metadata as metadataYaResuelto } from "../src/app/admin/registros/[id]/ya-resuelto/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { VERSION_AVISO } from "../src/lib/legales/version";
import {
  BOTON_APROBAR,
  BOTON_AVISAR_WHATSAPP,
  BOTON_RECHAZAR,
  BOTON_SALIR,
  BOTON_WHATSAPP_VERIFICACION,
  ETIQUETA_COLONIA_APROBAR,
  ETIQUETA_GIROS,
  ETIQUETA_MOTIVO_RECHAZO,
  ETIQUETA_ORIGEN,
  ERROR_COLONIA_PENDIENTE,
  ERROR_MAX_GIROS,
  ERROR_MOTIVO_VACIO,
  MENSAJE_APROBADO,
  MENSAJE_RECHAZADO,
  MENSAJE_YA_RESUELTO,
  OPCION_ORIGEN_ORGANICO,
  OPCION_ORIGEN_SIEMBRA,
  TEXTO_COLA_ENCABEZADO,
  TEXTO_COLA_VACIA,
  TEXTO_INDICADOR_ATRASADO,
  TEXTO_REVISAR,
  mensajeAvisoPublicacion,
  mensajeAvisoRechazo,
  mensajeVerificacion,
} from "../src/lib/admin/textos";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { crearClientePrueba } from "./db";
import {
  NoEncontradoSimulado,
  peticion,
  reiniciarPeticion,
  urlDeRedireccion,
} from "./admin-mocks";

// Spec: revision-admin · Requirements de la cola, del detalle, del botón de
// verificación, de las confirmaciones de aprobar/rechazar, de la no
// indexación y de "toda pantalla y toda acción exigen sesión válida"
// (tasks.md #11, #12, #14, #15, #16, #18, #19, #23).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719993xxx.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://enmirumbo.example";
const PREFIJO = "7719993";

const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let idCompleto = "";
let idMinimo = "";
let idColoniaPendiente = "";
let idPublicado = "";
let idRechazado = "";
let idWhatsappRaro = "";

const DATOS_COMPLETOS = {
  nombre: "Refaccionaria Ficticia El Tornillo",
  whatsapp: `${PREFIJO}001`,
  queOfreces: "Refacciones inventadas para carro y moto.",
  telefonoFijo: "7717773001",
  direccion: "Local 4 de un andador inventado",
  horario: "L-S 9am-7pm",
  facebookUrl: "https://www.facebook.com/tornilloficticio",
};

/** Cookie de sesión válida en el "navegador" del test. */
function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
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

  const base = {
    categoriaId,
    coloniaId,
    consintioAvisoEn: new Date("2026-09-01T09:00:00.000Z"),
  };

  idCompleto = (
    await prisma.negocio.create({
      data: {
        ...base,
        ...DATOS_COMPLETOS,
        entregaADomicilio: true,
        // 50 horas esperando: atrasado (más de 48).
        registradoEn: new Date(Date.now() - 50 * 60 * 60 * 1000),
      },
    })
  ).id;

  idMinimo = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Yoga Ficticia Luna",
        whatsapp: `${PREFIJO}002`,
        registradoEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    })
  ).id;

  idColoniaPendiente = (
    await prisma.negocio.create({
      data: {
        ...base,
        coloniaId: null,
        coloniaOtra: "Rinconada del Venado (inventada)",
        nombre: "Ficticio con colonia Otra",
        whatsapp: `${PREFIJO}003`,
        registradoEn: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    })
  ).id;

  idPublicado = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Veterinaria Ficticia Segunda Oportunidad",
        whatsapp: `${PREFIJO}004`,
        estado: "publicado",
        publicadoEn: new Date("2026-08-21T12:00:00.000Z"),
      },
    })
  ).id;

  idRechazado = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Préstamos Ficticios Rápidos",
        whatsapp: `${PREFIJO}005`,
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-26T11:00:00.000Z"),
        motivoRechazo: "No publicamos préstamos informales",
      },
    })
  ).id;

  idWhatsappRaro = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Ficticio con número imposible",
        // Guardado a mano, no por el formulario: no se normaliza a 10 dígitos.
        whatsapp: "no-es-un-numero",
        registradoEn: new Date(Date.now() - 60 * 60 * 1000),
      },
    })
  ).id;
});

afterEach(() => vi.restoreAllMocks());

describe("revision-admin · sin sesión no se abre ni se toca nada", () => {
  const paginas: Array<[string, () => Promise<unknown>]> = [
    ["la cola", () => ColaAdminPage()],
    [
      "el detalle de un registro que existe",
      () =>
        DetalleRegistroAdminPage({
          params: Promise.resolve({ id: idCompleto }),
          searchParams: Promise.resolve({}),
        }),
    ],
    [
      "el detalle de un identificador inventado",
      () =>
        DetalleRegistroAdminPage({
          params: Promise.resolve({ id: "no-existe-este-id" }),
          searchParams: Promise.resolve({}),
        }),
    ],
    [
      "la confirmación de aprobado",
      () => RegistroAprobadoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) }),
    ],
    [
      "la confirmación de rechazado",
      () => RegistroRechazadoPage({ params: Promise.resolve({ id: idRechazado }), searchParams: Promise.resolve({}) }),
    ],
    [
      "la pantalla de ya resuelto",
      () => RegistroYaResueltoPage({ params: Promise.resolve({ id: idPublicado }), searchParams: Promise.resolve({}) }),
    ],
  ];

  // Scenarios: cola sin sesión / detalle de un registro sin sesión
  it.each(paginas)("%s manda al acceso sin parámetros ni datos", async (_caso, abrir) => {
    expect(await urlDeRedireccion(abrir)).toBe("/admin");
  });

  it("una cookie manipulada vale lo mismo que ninguna", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = `${Date.now() + 100000}.firma-inventada`;
    expect(await urlDeRedireccion(() => ColaAdminPage())).toBe("/admin");
  });

  // Scenario: aprobar sin sesión
  it("aprobar sin sesión no publica nada", async () => {
    const formData = new FormData();
    formData.set("origen", "siembra");

    expect(
      await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, formData)),
    ).toBe("/admin");

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: idCompleto } });
    expect(negocio.estado).toBe("en_revision");
    expect(negocio.publicadoEn).toBeNull();
    expect(negocio.origen).toBe("organico");
  });

  // Scenario: rechazar sin sesión
  it("rechazar sin sesión no guarda motivo ni cambia el estado", async () => {
    const formData = new FormData();
    formData.set("motivo", "motivo mandado sin sesión");

    expect(
      await urlDeRedireccion(() => rechazarRegistroAccion(idCompleto, formData)),
    ).toBe("/admin");

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: idCompleto } });
    expect(negocio.estado).toBe("en_revision");
    expect(negocio.motivoRechazo).toBeNull();
    expect(negocio.rechazadoEn).toBeNull();
  });

  // Scenario: los datos personales no salen del panel (tasks.md #23)
  it("ninguna respuesta sin sesión trae nombre, WhatsApp, teléfono ni dirección", async () => {
    const capturado: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        capturado.push(args.map(String).join(" "));
      });
    }

    const destinos: string[] = [];
    for (const [, abrir] of paginas) destinos.push(await urlDeRedireccion(abrir));
    destinos.push(
      await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, new FormData())),
    );

    const respuesta = destinos.join(" ");
    const log = capturado.join("\n");
    for (const dato of [
      DATOS_COMPLETOS.nombre,
      DATOS_COMPLETOS.whatsapp,
      DATOS_COMPLETOS.telefonoFijo,
      DATOS_COMPLETOS.direccion,
      idCompleto,
    ]) {
      expect(respuesta).not.toContain(dato);
      expect(log).not.toContain(dato);
    }
  });
});

describe("revision-admin · cola de revisión con sesión", () => {
  beforeEach(() => conSesion());

  // Scenario: orden de la cola + Scenario: registro atrasado
  it("encabeza, lista lo pendiente con su entrada a Revisar y marca los atrasados", async () => {
    const html = normalizado(await render(ColaAdminPage()));

    expect(html).toContain(TEXTO_COLA_ENCABEZADO);
    expect(html).toContain(DATOS_COMPLETOS.nombre);
    expect(html).toContain("Haciendas de Tizayuca");
    expect(html).toContain(TEXTO_REVISAR);
    expect(html).toContain(TEXTO_INDICADOR_ATRASADO);
    expect(html).toContain(BOTON_SALIR);
    expect(html).toContain(`/admin/registros/${idCompleto}`);

    // Publicado y rechazado no aparecen (scenario "la cola solo trae pendientes")
    expect(html).not.toContain("Veterinaria Ficticia Segunda Oportunidad");
    expect(html).not.toContain("Préstamos Ficticios Rápidos");
  });

  it("el indicador de atraso se lee como texto, no como color", async () => {
    const html = await render(ColaAdminPage());
    const indicador = html.slice(html.indexOf(TEXTO_INDICADOR_ATRASADO) - 200);
    expect(indicador).toContain(TEXTO_INDICADOR_ATRASADO);
    // El único adorno del indicador es decorativo para el lector de pantalla.
    expect(html).toContain('aria-hidden="true"');
  });

  // Scenario: cola vacía
  it("sin pendientes muestra el texto de todo al día", async () => {
    await prisma.negocio.deleteMany({ where: { estado: "en_revision" } });
    const html = normalizado(await render(ColaAdminPage()));
    expect(html).toContain(TEXTO_COLA_VACIA);
    expect(html).not.toContain(TEXTO_REVISAR);
  });
});

describe("revision-admin · detalle del registro con sesión", () => {
  beforeEach(() => conSesion());

  const abrirDetalle = (id: string, searchParams: Record<string, string | string[]> = {}) =>
    render(
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve(searchParams),
      }),
    );

  // Scenario: detalle completo
  it("muestra todo lo capturado más estado, origen y las dos fechas internas", async () => {
    const html = normalizado(await abrirDetalle(idCompleto));

    for (const valor of Object.values(DATOS_COMPLETOS)) {
      expect(html).toContain(valor);
    }
    expect(html).toContain("Haciendas de Tizayuca");
    expect(html).toContain("Servicios del hogar");
    expect(html).toContain("Fecha de registro");
    expect(html).toContain("Consentimiento del aviso de privacidad");
  });

  // ── La versión del consentimiento (change versionar-aviso-privacidad) ─────

  // Scenario: detalle completo (la constancia con su versión)
  it("muestra la constancia como fecha y, entre paréntesis, la versión aceptada", async () => {
    await prisma.negocio.update({
      where: { id: idCompleto },
      data: { consintioAvisoVersion: VERSION_AVISO },
    });

    const html = normalizado(await abrirDetalle(idCompleto));
    expect(html).toContain("Consentimiento del aviso de privacidad");
    expect(html).toMatch(
      new RegExp(`2026[^<]*\\(versión ${VERSION_AVISO}\\)`),
    );
    expect(html).not.toContain("versión no registrada");
    // Sin reaceptación, esa línea no aparece.
    expect(html).not.toContain("El reenvío aceptó la versión");
  });

  // Requirement (ADDED por T-019) "El rebrand estrena la versión 2 del aviso,
  // sin tocar la evidencia de la 1" · Scenario: una constancia vieja no se
  // reescribe. Con la `2` ya vigente, una ficha que consintió la `1` sigue
  // diciendo `1`: nadie migra constancias.
  it("una constancia de antes del rebrand sigue mostrando la versión 1", async () => {
    await prisma.negocio.update({
      where: { id: idCompleto },
      data: { consintioAvisoVersion: "1" },
    });

    const html = normalizado(await abrirDetalle(idCompleto));
    expect(VERSION_AVISO).toBe("2");
    expect(html).toMatch(/2026[^<]*\(versión 1\)/);
    expect(html).not.toMatch(/\(versión 2\)/);
    // Y sin reenvío, tampoco se le fabrica una reaceptación.
    expect(html).not.toContain("El reenvío aceptó la versión");
  });

  // Scenario: registro anterior al versionado
  it("una ficha sin versión registrada lo dice, en vez de inventar una", async () => {
    // `idMinimo` se sembró sin versión: es una ficha anterior al versionado.
    const html = normalizado(await abrirDetalle(idMinimo));
    expect(html).toContain("Consentimiento del aviso de privacidad");
    expect(html).toContain("(versión no registrada)");
    expect(html).not.toMatch(/\(versión \d/);
    expect(html).not.toContain("El reenvío aceptó la versión");
  });

  // Scenario: registro cuyo reenvío aceptó una versión posterior
  //
  // ITERACIÓN 2 (hallazgo MEDIO-4 de la etapa C): la etiqueta describe EL
  // HECHO —un reenvío del formulario público aceptó la versión N— y ya no se
  // lo atribuye al titular ("Aceptó…"), porque ese formulario es anónimo.
  it("muestra la reaceptación aparte, atribuida al reenvío y no al titular", async () => {
    await prisma.negocio.update({
      where: { id: idCompleto },
      data: {
        consintioAvisoVersion: "0",
        reconsintioAvisoEn: new Date("2026-09-20T11:30:00.000Z"),
        reconsintioAvisoVersion: VERSION_AVISO,
      },
    });

    const html = normalizado(await abrirDetalle(idCompleto));
    // La constancia original, con su versión de siempre.
    expect(html).toMatch(/2026[^<]*\(versión 0\)/);
    // Y la reaceptación, con su etiqueta literal y la fecha del reenvío.
    expect(html).toContain(`El reenvío aceptó la versión ${VERSION_AVISO} del aviso`);
    expect(html).toMatch(/El reenvío aceptó la versión[^<]*<\/dt><dd[^>]*>[^<]*2026/);
    // No se le atribuye al titular ni se afirma la dirección del cambio sin
    // haberla comprobado.
    expect(html).not.toContain("Aceptó una versión más nueva");
  });

  // Scenario: detalle de un registro con solo obligatorios
  it("marca los opcionales vacíos como no capturados, sin inventar contenido", async () => {
    const html = normalizado(await abrirDetalle(idMinimo));
    expect(html).toContain("Yoga Ficticia Luna");
    expect(html.match(/No capturado/g)?.length).toBeGreaterThanOrEqual(5);
  });

  // Scenario: registro inexistente
  it("un identificador que no existe responde como no encontrado", async () => {
    await expect(abrirDetalle("no-existe-este-id")).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
  });

  // Scenario: abrir la conversación de verificación
  it("ofrece el botón de WhatsApp con el mensaje de verificación prellenado", async () => {
    const html = await abrirDetalle(idCompleto);
    const esperado = `https://wa.me/52${DATOS_COMPLETOS.whatsapp}?text=${encodeURIComponent(
      mensajeVerificacion(DATOS_COMPLETOS.nombre),
    )}`;

    expect(html).toContain(BOTON_WHATSAPP_VERIFICACION);
    expect(html).toContain(esperado);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  // Scenario: número que no se puede interpretar
  it("con un número que no se normaliza muestra el número tal cual, sin enlace", async () => {
    const html = normalizado(await abrirDetalle(idWhatsappRaro));
    expect(html).toContain("no-es-un-numero");
    expect(html).not.toContain("https://wa.me/52no-es-un-numero");
    expect(html).not.toContain(BOTON_WHATSAPP_VERIFICACION);
  });

  // Requirement "Aprobar asigna giros…": rótulos literales del formulario
  it("trae los formularios de aprobar y rechazar con sus rótulos literales", async () => {
    const html = normalizado(await abrirDetalle(idCompleto));
    for (const literal of [
      ETIQUETA_GIROS,
      ETIQUETA_ORIGEN,
      OPCION_ORIGEN_ORGANICO,
      OPCION_ORIGEN_SIEMBRA,
      BOTON_APROBAR,
      ETIQUETA_MOTIVO_RECHAZO,
      BOTON_RECHAZAR,
    ]) {
      expect(html).toContain(literal);
    }
    // La colonia solo se pide cuando está pendiente de normalizar.
    expect(html).not.toContain(ETIQUETA_COLONIA_APROBAR);
  });

  // Scenario: normalizar la colonia "Otra"
  it("con colonia Otra enseña lo que escribió el negocio y la lista del catálogo", async () => {
    const html = normalizado(await abrirDetalle(idColoniaPendiente));
    expect(html).toContain("Rinconada del Venado (inventada)");
    expect(html).toContain(ETIQUETA_COLONIA_APROBAR);
    expect(html).toContain("Haciendas de Tizayuca");
  });

  // Scenario: más de tres giros (el error vuelve y conserva lo elegido)
  it("el error de giros vuelve con las casillas como estaban", async () => {
    const giros = await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 4 });
    const html = await abrirDetalle(idCompleto, {
      errorAprobar: "giros",
      giro: giros.map((giro) => String(giro.id)),
      origen: "siembra",
    });

    expect(normalizado(html)).toContain(ERROR_MAX_GIROS);
    for (const giro of giros) {
      expect(html).toMatch(
        new RegExp(`value="${giro.id}"[^>]*checked|checked[^>]*value="${giro.id}"`),
      );
    }
    expect(html).toMatch(/value="siembra"[^>]*checked|checked[^>]*value="siembra"/);
  });

  it("los errores de colonia y de motivo se pintan con su texto literal", async () => {
    expect(
      normalizado(await abrirDetalle(idColoniaPendiente, { errorAprobar: "colonia" })),
    ).toContain(ERROR_COLONIA_PENDIENTE);
    expect(
      normalizado(await abrirDetalle(idCompleto, { errorRechazar: "motivo" })),
    ).toContain(ERROR_MOTIVO_VACIO);
  });

  it("un registro ya resuelto no ofrece aprobar ni rechazar", async () => {
    const html = normalizado(await abrirDetalle(idPublicado));
    expect(html).not.toContain(BOTON_APROBAR);
    expect(html).not.toContain(BOTON_RECHAZAR);
  });
});

describe("revision-admin · pantallas de confirmación", () => {
  beforeEach(() => conSesion());

  // Scenario: aviso de publicación + el link del aviso abre la ficha real
  it("tras aprobar ofrece avisar por WhatsApp con la URL absoluta de la ficha", async () => {
    const formData = new FormData();
    formData.set("origen", "organico");
    expect(await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, formData))).toBe(
      `/admin/registros/${idCompleto}/aprobado`,
    );

    const html = normalizado(
      await render(RegistroAprobadoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) })),
    );

    const linkFicha = `${URL_SITIO}/negocio/${construirSegmentoFicha(
      DATOS_COMPLETOS.nombre,
      idCompleto,
    )}`;
    expect(html).toContain(MENSAJE_APROBADO);
    expect(html).toContain(BOTON_AVISAR_WHATSAPP);
    expect(html).toContain(
      encodeURIComponent(mensajeAvisoPublicacion(DATOS_COMPLETOS.nombre, linkFicha)),
    );
    // Scenario: sin enlace de gestión todavía
    expect(html).not.toContain("gestion");
  });

  // Scenario: recargar después de resolver
  it("recargar la confirmación no repite la transición", async () => {
    const formData = new FormData();
    formData.set("origen", "organico");
    await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, formData));
    const publicado = await prisma.negocio.findUniqueOrThrow({ where: { id: idCompleto } });

    await render(RegistroAprobadoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) }));
    await render(RegistroAprobadoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) }));

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: idCompleto } });
    expect(despues.publicadoEn?.toISOString()).toBe(publicado.publicadoEn?.toISOString());
  });

  // Scenario: aviso de rechazo por WhatsApp
  it("tras rechazar ofrece avisar con el motivo leído de la base, no de la URL", async () => {
    const formData = new FormData();
    formData.set("motivo", "No publicamos préstamos informales");
    expect(await urlDeRedireccion(() => rechazarRegistroAccion(idMinimo, formData))).toBe(
      `/admin/registros/${idMinimo}/rechazado`,
    );

    const html = normalizado(
      await render(RegistroRechazadoPage({ params: Promise.resolve({ id: idMinimo }), searchParams: Promise.resolve({}) })),
    );

    expect(html).toContain(MENSAJE_RECHAZADO);
    expect(html).toContain(
      encodeURIComponent(
        mensajeAvisoRechazo("Yoga Ficticia Luna", "No publicamos préstamos informales"),
      ),
    );
  });

  // Scenario: doble aprobación / rechazar algo ya publicado
  it("una transición sobre algo ya resuelto lleva a la pantalla de ya resuelto", async () => {
    const formData = new FormData();
    formData.set("origen", "organico");
    await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, formData));

    expect(await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, formData))).toBe(
      `/admin/registros/${idCompleto}/ya-resuelto`,
    );

    const rechazo = new FormData();
    rechazo.set("motivo", "ya no me gustó");
    expect(await urlDeRedireccion(() => rechazarRegistroAccion(idCompleto, rechazo))).toBe(
      `/admin/registros/${idCompleto}/ya-resuelto`,
    );

    const html = normalizado(
      await render(
        RegistroYaResueltoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) }),
      ),
    );
    expect(html).toContain(MENSAJE_YA_RESUELTO);
  });

  /**
   * Hallazgo de la prueba a mano con el sitio corriendo: abrir a pelo
   * `/admin/registros/<id>/rechazado` sobre un registro que seguía en
   * revisión pintaba "Registro rechazado." y un WhatsApp con el motivo vacío.
   * Una pantalla de confirmación tiene que confirmar algo que pasó: si el
   * estado no corresponde, se vuelve al detalle.
   */
  it("una confirmación que no corresponde al estado real regresa al detalle", async () => {
    expect(
      await urlDeRedireccion(() =>
        RegistroRechazadoPage({
          params: Promise.resolve({ id: idCompleto }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).toBe(`/admin/registros/${idCompleto}`);

    expect(
      await urlDeRedireccion(() =>
        RegistroAprobadoPage({
          params: Promise.resolve({ id: idCompleto }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).toBe(`/admin/registros/${idCompleto}`);

    expect(
      await urlDeRedireccion(() =>
        RegistroYaResueltoPage({
          params: Promise.resolve({ id: idCompleto }),
          searchParams: Promise.resolve({}),
        }),
      ),
    ).toBe(`/admin/registros/${idCompleto}`);

    // Y la de "ya resuelto" sí se ve sobre algo de verdad resuelto.
    const html = normalizado(
      await render(
        RegistroYaResueltoPage({
          params: Promise.resolve({ id: idPublicado }),
          searchParams: Promise.resolve({}),
        }),
      ),
    );
    expect(html).toContain(MENSAJE_YA_RESUELTO);
  });

  it("los errores de validación regresan al detalle conservando lo elegido", async () => {
    const giros = await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 4 });
    const formData = new FormData();
    for (const giro of giros) formData.append("giro", String(giro.id));
    formData.set("origen", "siembra");

    const destino = await urlDeRedireccion(() =>
      aprobarRegistroAccion(idCompleto, formData),
    );
    expect(destino).toContain(`/admin/registros/${idCompleto}?`);
    expect(destino).toContain("errorAprobar=giros");
    expect(destino).toContain("origen=siembra");
    for (const giro of giros) expect(destino).toContain(`giro=${giro.id}`);

    const sinMotivo = new FormData();
    sinMotivo.set("motivo", "   ");
    expect(await urlDeRedireccion(() => rechazarRegistroAccion(idCompleto, sinMotivo))).toBe(
      `/admin/registros/${idCompleto}?errorRechazar=motivo`,
    );
  });
});

// Scenario: los datos personales no salen del panel (tasks.md #23)
describe("revision-admin · el log del servidor no guarda datos personales", () => {
  beforeEach(() => conSesion());

  it("ningún flujo del panel (cola, detalle, aprobar, rechazar) los escribe", async () => {
    const capturado: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        capturado.push(args.map(String).join(" "));
      });
    }

    await render(ColaAdminPage());
    await render(
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id: idCompleto }),
        searchParams: Promise.resolve({}),
      }),
    );

    const aprobacion = new FormData();
    aprobacion.set("origen", "organico");
    await urlDeRedireccion(() => aprobarRegistroAccion(idCompleto, aprobacion));
    await render(RegistroAprobadoPage({ params: Promise.resolve({ id: idCompleto }), searchParams: Promise.resolve({}) }));

    const rechazo = new FormData();
    rechazo.set("motivo", "Motivo ficticio de prueba");
    await urlDeRedireccion(() => rechazarRegistroAccion(idMinimo, rechazo));
    await render(RegistroRechazadoPage({ params: Promise.resolve({ id: idMinimo }), searchParams: Promise.resolve({}) }));

    const log = capturado.join("\n");
    for (const dato of [
      DATOS_COMPLETOS.nombre,
      DATOS_COMPLETOS.whatsapp,
      DATOS_COMPLETOS.telefonoFijo,
      DATOS_COMPLETOS.direccion,
      "Yoga Ficticia Luna",
      "Motivo ficticio de prueba",
    ]) {
      expect(log, `el log no debe traer "${dato}"`).not.toContain(dato);
    }
  });
});

// Scenario: metadata de no indexación
describe("revision-admin · el panel no se indexa", () => {
  it.each([
    ["acceso", metadataAcceso],
    ["cola", metadataCola],
    ["detalle", metadataDetalle],
    ["aprobado", metadataAprobado],
    ["rechazado", metadataRechazado],
    ["ya resuelto", metadataYaResuelto],
  ])("la pantalla de %s declara noindex, nofollow", (_caso, metadata) => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
