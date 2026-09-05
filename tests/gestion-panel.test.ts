import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { aplicarEdicionAccion } from "../src/app/admin/ediciones/[id]/accion-aplicar";
import { descartarEdicionAccion } from "../src/app/admin/ediciones/[id]/accion-descartar";
import EdicionAplicadaPage from "../src/app/admin/ediciones/[id]/aplicada/page";
import EdicionDescartadaPage from "../src/app/admin/ediciones/[id]/descartada/page";
import DetalleEdicionPage from "../src/app/admin/ediciones/[id]/page";
import ColaAdminPage from "../src/app/admin/cola/page";
import { aprobarRegistroAccion } from "../src/app/admin/registros/[id]/accion-aprobar";
import RegistroAprobadoPage from "../src/app/admin/registros/[id]/aprobado/page";
import DetalleRegistroPage from "../src/app/admin/registros/[id]/page";
import { regenerarEnlaceAccion } from "../src/app/admin/registros/[id]/regenerar-enlace/accion";
import RegenerarEnlaceListoPage from "../src/app/admin/registros/[id]/regenerar-enlace/listo/page";
import RegenerarEnlacePage from "../src/app/admin/registros/[id]/regenerar-enlace/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { obtenerColaDeRevision } from "../src/lib/admin/consultas";
import { despublicarFicha } from "../src/lib/admin/transiciones";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  ADVERTENCIA_CAMBIO_WHATSAPP,
  BOTON_APLICAR_CAMBIOS,
  BOTON_DESCARTAR_CAMBIOS,
  BOTON_GENERAR_ENLACE_NUEVO,
  BOTON_MANDAR_ENLACE_WHATSAPP,
  ERROR_MOTIVO_DESCARTE_VACIO,
  ERROR_WHATSAPP_OCUPADO_EDICION,
  ETIQUETA_ALTA_NUEVA,
  ETIQUETA_EDICION,
  ETIQUETA_LO_PROPUESTO,
  ETIQUETA_LO_PUBLICADO,
  ETIQUETA_MOTIVO_DESCARTE,
  MARCA_CAMBIO,
  MENSAJE_CAMBIOS_APLICADOS,
  MENSAJE_CAMBIOS_DESCARTADOS,
  MENSAJE_EDICION_FICHA_NO_PUBLICADA,
  MENSAJE_EDICION_REEMPLAZADA,
  MENSAJE_EDICION_YA_RESUELTA,
  MENSAJE_ENLACE_REGENERADO,
  TEXTO_COLA_VACIA,
  TEXTO_INDICADOR_ATRASADO,
  TITULO_CAMBIOS_POR_REVISAR,
  mensajeAvisoCambiosAplicados,
  mensajeAvisoCambiosDescartados,
  mensajeAvisoPublicacionConEnlace,
  mensajeEnlaceNuevo,
  mensajeVerificacion,
} from "../src/lib/admin/textos";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { huellaDeToken, pareceToken } from "../src/lib/gestion/token";
import { NOMBRE_COOKIE_SOBRE } from "../src/lib/gestion/sobre";
import { crearClientePrueba } from "./db";
import {
  NoEncontradoSimulado,
  peticion,
  reiniciarPeticion,
  urlDeRedireccion,
} from "./admin-mocks";

/**
 * Spec `revision-admin` (delta del change `agregar-enlace-de-gestion`) ·
 * Requirements "Aprobar un registro genera su enlace de gestión…", "El detalle
 * de una edición compara lo publicado con lo propuesto", "Aplicar la
 * edición…", "Descartar la edición…", "Una edición se resuelve una sola vez…",
 * "El admin puede generar un enlace nuevo…", la cola mezclada, el indicador de
 * 48 horas, la sesión obligatoria y el aviso de publicación (tasks.md
 * #6, #17-#27).
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771000 7xxx.
 */

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "g".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://enmirumbo.example";
const PREFIJO = "7710007";
const AHORA = new Date("2026-09-10T12:00:00.000Z");

const normalizado = (html: string) => html.replace(/\s+/g, " ");
const horasAntes = (horas: number) => new Date(AHORA.getTime() - horas * 60 * 60 * 1000);

let prisma: PrismaClient;
let categoriaId: number;
let otraCategoriaId: number;
let coloniaId: number;

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const DATOS_PUBLICADOS = {
  nombre: "Tacos Ficticios del Güero",
  queOfreces: "Tacos inventados de suadero",
  telefonoFijo: null as string | null,
  direccion: "Esquina inventada",
  horario: "L-D 6pm-1am",
  entregaADomicilio: false,
  facebookUrl: null as string | null,
};

async function altaPublicada(whatsapp: string, extra: Record<string, unknown> = {}) {
  return prisma.negocio.create({
    data: {
      ...DATOS_PUBLICADOS,
      categoriaId,
      coloniaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      registradoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      origen: "organico",
      tokenGestionHash: huellaDeToken(`token-de-prueba-${whatsapp}`),
      tokenGestionCreadoEn: new Date("2026-08-02T10:00:00.000Z"),
      ...extra,
    },
  });
}

async function edicionDe(
  negocioId: string,
  whatsapp: string,
  cambios: Record<string, unknown> = {},
  creadaEn: Date = horasAntes(5),
) {
  return prisma.edicionPendiente.create({
    data: {
      negocioId,
      nombre: DATOS_PUBLICADOS.nombre,
      categoriaId,
      whatsapp,
      coloniaId,
      queOfreces: DATOS_PUBLICADOS.queOfreces,
      entregaADomicilio: false,
      direccion: DATOS_PUBLICADOS.direccion,
      horario: DATOS_PUBLICADOS.horario,
      creadaEn,
      ...cambios,
    },
  });
}

const abrirDetalleEdicion = (id: string, sp: Record<string, string> = {}) =>
  render(
    DetalleEdicionPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(sp),
    } as Parameters<typeof DetalleEdicionPage>[0]),
  );

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "restaurantes-y-fondas" } })
  ).id;
  otraCategoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
  reiniciarPeticion();
});

// ── Aprobar genera el enlace ────────────────────────────────────────────────

describe("revision-admin · aprobar genera el enlace de gestión", () => {
  async function enRevision(whatsapp: string) {
    return prisma.negocio.create({
      data: {
        ...DATOS_PUBLICADOS,
        categoriaId,
        coloniaId,
        whatsapp,
        consintioAvisoEn: new Date("2026-09-01T10:00:00.000Z"),
        registradoEn: new Date("2026-09-01T10:00:00.000Z"),
      },
    });
  }

  const aprobar = (id: string) => {
    const datos = new FormData();
    datos.set("origen", "organico");
    return urlDeRedireccion(() => aprobarRegistroAccion(id, datos));
  };

  // Scenario: cada aprobación estrena enlace
  it("dos aprobaciones distintas dejan dos huellas distintas", async () => {
    conSesion();
    const uno = await enRevision(`${PREFIJO}101`);
    const otro = await enRevision(`${PREFIJO}102`);

    await aprobar(uno.id);
    await aprobar(otro.id);

    const [a, b] = await Promise.all([
      prisma.negocio.findUniqueOrThrow({ where: { id: uno.id } }),
      prisma.negocio.findUniqueOrThrow({ where: { id: otro.id } }),
    ]);
    expect(a.tokenGestionHash).toBeTruthy();
    expect(b.tokenGestionHash).toBeTruthy();
    expect(a.tokenGestionHash).not.toBe(b.tokenGestionHash);
    expect(a.tokenGestionCreadoEn).not.toBeNull();
  });

  it("el token en claro nunca se guarda: lo guardado es su huella", async () => {
    conSesion();
    const registro = await enRevision(`${PREFIJO}103`);
    await aprobar(registro.id);

    const sobre = peticion.puestas.find((cookie) => cookie.nombre === NOMBRE_COOKIE_SOBRE);
    expect(sobre).toBeDefined();
    const token = sobre!.valor.slice(sobre!.valor.indexOf(".") + 1);
    expect(pareceToken(token)).toBe(true);
    // La cookie del sobre no viaja a ninguna ruta pública y no la lee el JS.
    expect(sobre!.opciones.httpOnly).toBe(true);
    expect(sobre!.opciones.path).toBe("/admin");

    const fila = await prisma.negocio.findUniqueOrThrow({ where: { id: registro.id } });
    expect(fila.tokenGestionHash).toBe(huellaDeToken(token));
    expect(JSON.stringify(fila)).not.toContain(token);
  });

  // Scenario: aprobar dos veces no cambia el enlace
  it("una aprobación repetida no genera un token nuevo", async () => {
    conSesion();
    const registro = await enRevision(`${PREFIJO}104`);
    await aprobar(registro.id);
    const primera = await prisma.negocio.findUniqueOrThrow({ where: { id: registro.id } });

    expect(await aprobar(registro.id)).toBe(`/admin/registros/${registro.id}/ya-resuelto`);

    const segunda = await prisma.negocio.findUniqueOrThrow({ where: { id: registro.id } });
    expect(segunda.tokenGestionHash).toBe(primera.tokenGestionHash);
    expect(segunda.tokenGestionCreadoEn).toEqual(primera.tokenGestionCreadoEn);
  });

  // Scenario: aviso de publicación con los dos links
  it("la confirmación ofrece el mensaje con el link de la ficha y el de gestión", async () => {
    conSesion();
    const registro = await enRevision(`${PREFIJO}105`);
    await aprobar(registro.id);

    // El sobre que dejó la acción llega a la pantalla como cookie del request.
    const sobre = peticion.puestas.find((cookie) => cookie.nombre === NOMBRE_COOKIE_SOBRE)!;
    peticion.cookies[NOMBRE_COOKIE_SOBRE] = sobre.valor;
    const token = sobre.valor.slice(sobre.valor.indexOf(".") + 1);

    const html = await render(
      RegistroAprobadoPage({
        params: Promise.resolve({ id: registro.id }),
      } as Parameters<typeof RegistroAprobadoPage>[0]),
    );

    const linkFicha = `${URL_SITIO}/negocio/${construirSegmentoFicha(
      DATOS_PUBLICADOS.nombre,
      registro.id,
    )}`;
    const esperado = encodeURIComponent(
      mensajeAvisoPublicacionConEnlace(
        DATOS_PUBLICADOS.nombre,
        linkFicha,
        `${URL_SITIO}/editar/${token}`,
      ),
    );
    expect(html).toContain(esperado);
    // La instrucción del PRD §6.4 viaja dentro del mensaje (ya codificado).
    expect(decodeURIComponent(esperado)).toContain(
      "guarda este mensaje (puedes destacarlo con la estrella)",
    );
  });

  // Scenario: el enlace no se queda a la vista
  it("sin el sobre, la confirmación sigue ofreciendo el aviso pero sin enlace", async () => {
    conSesion();
    const registro = await enRevision(`${PREFIJO}106`);
    await aprobar(registro.id);
    // Sin cookie del sobre: es lo que pasa al volver al detalle y regresar.
    const html = await render(
      RegistroAprobadoPage({
        params: Promise.resolve({ id: registro.id }),
      } as Parameters<typeof RegistroAprobadoPage>[0]),
    );
    expect(html).not.toContain("editar");
    expect(html).toContain("Ya quedó publicado");
  });

  // Scenario: aprobar sin sesión
  it("sin sesión no se publica ni se genera ningún enlace", async () => {
    const registro = await enRevision(`${PREFIJO}107`);
    const datos = new FormData();
    datos.set("origen", "organico");
    expect(await urlDeRedireccion(() => aprobarRegistroAccion(registro.id, datos))).toBe(
      "/admin",
    );

    const fila = await prisma.negocio.findUniqueOrThrow({ where: { id: registro.id } });
    expect(fila.estado).toBe("en_revision");
    expect(fila.tokenGestionHash).toBeNull();
    expect(peticion.puestas).toHaveLength(0);
  });
});

// ── La cola mezclada ────────────────────────────────────────────────────────

describe("revision-admin · la cola mezcla altas y ediciones", () => {
  // Scenario: orden de la cola mezclada
  it("las ordena por antigüedad de entrada, cada una con su tipo y su destino", async () => {
    const publicado = await altaPublicada(`${PREFIJO}201`);
    await prisma.negocio.create({
      data: {
        ...DATOS_PUBLICADOS,
        nombre: "Alta Ficticia Reciente",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}202`,
        consintioAvisoEn: horasAntes(3),
        registradoEn: horasAntes(3),
      },
    });
    await prisma.negocio.create({
      data: {
        ...DATOS_PUBLICADOS,
        nombre: "Alta Ficticia Antigua",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}203`,
        consintioAvisoEn: horasAntes(200),
        registradoEn: horasAntes(200),
      },
    });
    const edicion = await edicionDe(publicado.id, `${PREFIJO}201`, {}, horasAntes(49));

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((item) => item.nombre)).toEqual([
      "Alta Ficticia Antigua",
      DATOS_PUBLICADOS.nombre,
      "Alta Ficticia Reciente",
    ]);
    expect(cola.map((item) => item.tipo)).toEqual(["alta", "edicion", "alta"]);
    expect(cola[1].hrefDetalle).toBe(`/admin/ediciones/${edicion.id}`);
    expect(cola[0].hrefDetalle).toBe(`/admin/registros/${cola[0].id}`);
  });

  // Scenario: edición atrasada / registro dentro de la meta
  it.each([
    [3, false],
    [47, false],
    [49, true],
    [200, true],
  ])("una edición de %i horas se marca atrasada: %s", async (horas, atrasada) => {
    const publicado = await altaPublicada(`${PREFIJO}21${horas}`);
    await edicionDe(publicado.id, `${PREFIJO}21${horas}`, {}, horasAntes(horas));

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toHaveLength(1);
    expect(cola[0].atrasado).toBe(atrasada);
  });

  // Scenario: un negocio publicado con edición pendiente
  it("un negocio publicado con edición aparece una sola vez, como Edición", async () => {
    const publicado = await altaPublicada(`${PREFIJO}220`);
    await edicionDe(publicado.id, `${PREFIJO}220`);

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toHaveLength(1);
    expect(cola[0].tipo).toBe("edicion");
  });

  /**
   * HALLAZGO MEDIO 1b de la etapa C, corregido en la iteración 2: un negocio
   * despublicado con edición pendiente ocupaba DOS renglones —"Alta nueva" y
   * "Edición"—, y el segundo llevaba a una edición que ya no se podía aplicar.
   */
  it("un negocio despublicado con edición pendiente aparece una sola vez, como Alta nueva", async () => {
    const publicado = await altaPublicada(`${PREFIJO}223`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}223`);
    await despublicarFicha(prisma, publicado.id, "Motivo inventado de la prueba", AHORA);

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    const suyos = cola.filter((item) => item.nombre === DATOS_PUBLICADOS.nombre);
    expect(suyos).toHaveLength(1);
    expect(suyos[0].tipo).toBe("alta");
    expect(suyos[0].hrefDetalle).toBe(`/admin/registros/${publicado.id}`);

    // La edición no se perdió: sigue pendiente y vuelve a la cola en cuanto la
    // ficha regresa al directorio.
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");

    await prisma.negocio.update({
      where: { id: publicado.id },
      data: { estado: "publicado" },
    });
    const despues = await obtenerColaDeRevision(prisma, AHORA);
    expect(despues.map((item) => item.id)).toEqual([edicion.id]);
    expect(despues[0].tipo).toBe("edicion");
  });

  // Scenario: la cola solo trae lo pendiente
  it("las ediciones aplicadas y descartadas no aparecen", async () => {
    const publicado = await altaPublicada(`${PREFIJO}221`);
    await edicionDe(publicado.id, `${PREFIJO}221`, {
      estado: "aplicada",
      resueltaEn: new Date(),
    });
    await edicionDe(publicado.id, `${PREFIJO}221`, {
      estado: "descartada",
      resueltaEn: new Date(),
      motivoDescarte: "no",
    });

    expect(await obtenerColaDeRevision(prisma, AHORA)).toHaveLength(0);
  });

  // Scenario: el reloj de la edición se reinicia al reemplazarla
  it("reemplazar una edición atrasada por otra nueva la saca del atraso", async () => {
    const publicado = await altaPublicada(`${PREFIJO}222`);
    const vieja = await edicionDe(publicado.id, `${PREFIJO}222`, {}, horasAntes(50));
    expect((await obtenerColaDeRevision(prisma, AHORA))[0].atrasado).toBe(true);

    await prisma.edicionPendiente.update({
      where: { id: vieja.id },
      data: { estado: "descartada", resueltaEn: AHORA },
    });
    await edicionDe(publicado.id, `${PREFIJO}222`, {}, horasAntes(1));

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toHaveLength(1);
    expect(cola[0].atrasado).toBe(false);
  });

  it("la pantalla de la cola pinta las dos etiquetas y el indicador de atraso", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}230`);
    await edicionDe(publicado.id, `${PREFIJO}230`, {}, new Date(Date.now() - 60 * 3600_000));
    await prisma.negocio.create({
      data: {
        ...DATOS_PUBLICADOS,
        nombre: "Alta Ficticia en Cola",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}231`,
        consintioAvisoEn: new Date(),
        registradoEn: new Date(),
      },
    });

    const html = normalizado(await render(ColaAdminPage()));
    expect(html).toContain(ETIQUETA_ALTA_NUEVA);
    expect(html).toContain(ETIQUETA_EDICION);
    expect(html).toContain(TEXTO_INDICADOR_ATRASADO);
    expect(html).toContain("/admin/ediciones/");
  });

  // Scenario: cola vacía
  it("sin altas ni ediciones muestra el literal de cola vacía", async () => {
    conSesion();
    await altaPublicada(`${PREFIJO}240`);
    const html = normalizado(await render(ColaAdminPage()));
    expect(html).toContain(TEXTO_COLA_VACIA);
  });
});

// ── El detalle comparativo ──────────────────────────────────────────────────

describe("revision-admin · el detalle compara lo publicado con lo propuesto", () => {
  // Scenario: comparación campo por campo
  it("marca 'Cambió' solo en los campos distintos", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}301`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}301`, {
      horario: "L-D 5pm-2am",
      direccion: "Esquina inventada, junto al parque",
    });

    const html = normalizado(await abrirDetalleEdicion(edicion.id));
    expect(html).toContain(TITULO_CAMBIOS_POR_REVISAR);
    expect(html).toContain(ETIQUETA_LO_PUBLICADO);
    expect(html).toContain(ETIQUETA_LO_PROPUESTO);
    expect(html).toContain("L-D 5pm-2am");
    expect(html).toContain("Esquina inventada, junto al parque");
    // Exactamente dos marcas "Cambió": horario y dirección.
    expect(html.split(MARCA_CAMBIO)).toHaveLength(3);
    expect(html).not.toContain(ADVERTENCIA_CAMBIO_WHATSAPP);
  });

  // Scenario: cambio de WhatsApp advertido
  it("advierte el cambio de WhatsApp y escribe al número NUEVO", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}302`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}303`);

    const html = normalizado(await abrirDetalleEdicion(edicion.id));
    expect(html).toContain(ADVERTENCIA_CAMBIO_WHATSAPP);
    expect(html).toContain(`${PREFIJO}302`);
    expect(html).toContain(`${PREFIJO}303`);
    // El botón de verificación apunta al propuesto.
    expect(html).toContain(
      `https://wa.me/52${PREFIJO}303?text=${encodeURIComponent(
        mensajeVerificacion(DATOS_PUBLICADOS.nombre),
      )}`,
    );
  });

  // Scenario: edición inexistente
  it("un identificador inventado responde no encontrado", async () => {
    conSesion();
    await expect(abrirDetalleEdicion("no-existe-esta-edicion")).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
  });

  /**
   * HALLAZGO MEDIO 2 de la etapa C, corregido en la iteración 2: un `%00` en
   * la URL llegaba a la consulta, PostgreSQL abortaba y la pantalla respondía
   * un error del servidor en vez del "no encontrado" de cualquier otro
   * identificador inventado. Mismo filtro de borde que `extraerIdDeSegmentoFicha`.
   */
  it.each([
    ["con byte nulo", `clx${String.fromCharCode(0)}000`],
    ["vacío", ""],
    ["gigantesco", "a".repeat(100_000)],
    ["con comillas de SQL", `' OR 1=1 --`],
  ])("un identificador %s responde no encontrado, nunca un error del servidor", async (
    _caso,
    id,
  ) => {
    conSesion();
    await expect(abrirDetalleEdicion(id)).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("el detalle de un REGISTRO con byte nulo tampoco revienta", async () => {
    conSesion();
    await expect(
      render(
        DetalleRegistroPage({
          params: Promise.resolve({ id: `clx${String.fromCharCode(0)}000` }),
          searchParams: Promise.resolve({}),
        } as Parameters<typeof DetalleRegistroPage>[0]),
      ),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  // Scenario: detalle de una edición sin sesión
  it("sin sesión redirige al acceso sin pintar ni un dato", async () => {
    const publicado = await altaPublicada(`${PREFIJO}304`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}304`);
    expect(await urlDeRedireccion(() => abrirDetalleEdicion(edicion.id))).toBe("/admin");
  });
});

// ── Aplicar ─────────────────────────────────────────────────────────────────

describe("revision-admin · aplicar la edición", () => {
  // Scenario: aplicar los cambios · aplicar no toca lo que no es editable
  it("copia los campos editables y deja intacto todo lo demás", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}401`);
    const giro = await prisma.giro.findFirstOrThrow({ orderBy: { id: "asc" } });
    await prisma.negocio.update({
      where: { id: publicado.id },
      data: { giros: { set: [{ id: giro.id }] } },
    });
    const antes = await prisma.negocio.findUniqueOrThrow({
      where: { id: publicado.id },
      include: { giros: true },
    });

    const edicion = await edicionDe(publicado.id, `${PREFIJO}401`, {
      nombre: "Plomería Ficticia Güicho",
      queOfreces: "destape de drenajes inventado",
      horario: "L-D 5pm-2am",
      categoriaId: otraCategoriaId,
    });

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe(
      `/admin/ediciones/${edicion.id}/aplicada`,
    );

    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { id: publicado.id },
      include: { giros: true },
    });
    expect(despues.nombre).toBe("Plomería Ficticia Güicho");
    expect(despues.horario).toBe("L-D 5pm-2am");
    expect(despues.categoriaId).toBe(otraCategoriaId);
    // Nada de lo no editable se movió.
    expect(despues.estado).toBe(antes.estado);
    expect(despues.origen).toBe(antes.origen);
    expect(despues.publicadoEn).toEqual(antes.publicadoEn);
    expect(despues.registradoEn).toEqual(antes.registradoEn);
    expect(despues.consintioAvisoEn).toEqual(antes.consintioAvisoEn);
    expect(despues.tokenGestionHash).toBe(antes.tokenGestionHash);
    expect(despues.tokenGestionCreadoEn).toEqual(antes.tokenGestionCreadoEn);
    expect(despues.giros.map((g) => g.id)).toEqual(antes.giros.map((g) => g.id));

    // Scenario: la ficha editada se sigue encontrando.
    expect(despues.nombreNormalizado).toContain("plomeria");
    expect(despues.queOfrecesNormalizado).toContain("drenajes");

    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("aplicada");
    expect(fila.resueltaEn).not.toBeNull();
  });

  // Scenario: aviso de que la ficha ya se actualizó
  it("la confirmación ofrece el aviso por WhatsApp con el link de la ficha", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}402`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}402`, { horario: "nuevo" });
    await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id));

    const html = await render(
      EdicionAplicadaPage({
        params: Promise.resolve({ id: edicion.id }),
      } as Parameters<typeof EdicionAplicadaPage>[0]),
    );
    const linkFicha = `${URL_SITIO}/negocio/${construirSegmentoFicha(
      DATOS_PUBLICADOS.nombre,
      publicado.id,
    )}`;
    expect(normalizado(html)).toContain(MENSAJE_CAMBIOS_APLICADOS);
    expect(html).toContain(
      encodeURIComponent(
        mensajeAvisoCambiosAplicados(DATOS_PUBLICADOS.nombre, linkFicha),
      ),
    );
  });

  it("la confirmación no confirma nada si la edición no está aplicada", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}403`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}403`);
    expect(
      await urlDeRedireccion(() =>
        EdicionAplicadaPage({
          params: Promise.resolve({ id: edicion.id }),
        } as Parameters<typeof EdicionAplicadaPage>[0]),
      ),
    ).toBe(`/admin/ediciones/${edicion.id}`);
  });

  // Scenario: el número propuesto se lo ganó otra ficha
  it("un número que ya tiene otra ficha no se aplica y la edición sigue pendiente", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}404`);
    await altaPublicada(`${PREFIJO}405`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}405`);

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe(
      `/admin/ediciones/${edicion.id}?errorAplicar=whatsapp`,
    );

    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.whatsapp).toBe(`${PREFIJO}404`);

    const html = normalizado(
      await abrirDetalleEdicion(edicion.id, { errorAplicar: "whatsapp" }),
    );
    expect(html).toContain(ERROR_WHATSAPP_OCUPADO_EDICION);
  });

  /**
   * HALLAZGO MEDIO 1 de la etapa C, corregido en la iteración 2: aplicar sobre
   * una ficha que dejó de estar publicada **no** se declara aplicada. Antes la
   * edición se cerraba, los cambios del dueño se perdían para siempre y el
   * panel decía "Listo, la ficha ya se actualizó" ofreciendo avisarle.
   */
  it("si la ficha dejó de estar publicada no se aplica nada y la edición sigue esperando", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}407`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}407`, {
      horario: "el horario nuevo del dueño",
    });

    // Otra pestaña la despublica mientras el admin miraba la comparación.
    await despublicarFicha(prisma, publicado.id, "Cerró, según un vecino");

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe(
      `/admin/ediciones/${edicion.id}?errorAplicar=no-publicada`,
    );

    // Ni la ficha revive, ni cambia de datos…
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.estado).not.toBe("publicado");
    expect(ficha.horario).toBe(DATOS_PUBLICADOS.horario);
    // …ni los cambios del dueño se pierden: siguen pendientes para cuando la
    // ficha vuelva al directorio.
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");
    expect(fila.resueltaEn).toBeNull();

    // Y el panel lo dice, en vez de celebrar una publicación que no ocurrió.
    const html = normalizado(
      await abrirDetalleEdicion(edicion.id, { errorAplicar: "no-publicada" }),
    );
    expect(html).toContain(MENSAJE_EDICION_FICHA_NO_PUBLICADA);
    expect(html).not.toContain(MENSAJE_CAMBIOS_APLICADOS);
  });

  it("al volver a publicar la ficha, esos mismos cambios se pueden aplicar", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}408`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}408`, { horario: "recuperado" });
    await despublicarFicha(prisma, publicado.id, "Motivo inventado");
    await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id));

    // El admin la vuelve a publicar y ahora sí aplica.
    await prisma.negocio.update({
      where: { id: publicado.id },
      data: { estado: "publicado" },
    });
    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe(
      `/admin/ediciones/${edicion.id}/aplicada`,
    );
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.horario).toBe("recuperado");
  });

  // Scenario: resolver una edición sin sesión
  it("sin sesión no se aplica nada", async () => {
    const publicado = await altaPublicada(`${PREFIJO}406`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}406`, { horario: "nuevo" });

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe("/admin");

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.horario).toBe(DATOS_PUBLICADOS.horario);
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");
  });
});

// ── Descartar ───────────────────────────────────────────────────────────────

describe("revision-admin · descartar la edición", () => {
  const descartar = (id: string, motivo: string) => {
    const datos = new FormData();
    datos.set("motivo", motivo);
    return urlDeRedireccion(() => descartarEdicionAccion(id, datos));
  };

  // Scenario: descarte con motivo
  it("guarda el motivo y su fecha, y la ficha sigue idéntica", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}501`);
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    const edicion = await edicionDe(publicado.id, `${PREFIJO}501`, { horario: "nuevo" });

    const MOTIVO = "El texto que pusiste en «¿Qué ofreces?» no lo podemos publicar";
    expect(await descartar(edicion.id, MOTIVO)).toBe(
      `/admin/ediciones/${edicion.id}/descartada`,
    );

    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("descartada");
    expect(fila.motivoDescarte).toBe(MOTIVO);
    expect(fila.resueltaEn).not.toBeNull();

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(despues).toEqual(antes);
    // Scenario: el enlace sigue sirviendo tras un descarte.
    expect(despues.tokenGestionHash).toBe(antes.tokenGestionHash);
    // Y sale de la cola.
    expect(await obtenerColaDeRevision(prisma, AHORA)).toHaveLength(0);
  });

  // Scenario: descarte sin motivo
  it("sin motivo no cambia nada y muestra su literal", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}502`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}502`);

    expect(await descartar(edicion.id, "   ")).toBe(
      `/admin/ediciones/${edicion.id}?errorDescartar=motivo`,
    );
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");

    const html = normalizado(
      await abrirDetalleEdicion(edicion.id, { errorDescartar: "motivo" }),
    );
    expect(html).toContain(ERROR_MOTIVO_DESCARTE_VACIO);
    expect(html).toContain(ETIQUETA_MOTIVO_DESCARTE);
  });

  // Scenario: aviso del descarte por WhatsApp
  it("la confirmación lee el motivo GUARDADO y arma el mensaje", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}503`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}503`);
    const MOTIVO = "No publicamos préstamos informales";
    await descartar(edicion.id, MOTIVO);

    const html = await render(
      EdicionDescartadaPage({
        params: Promise.resolve({ id: edicion.id }),
      } as Parameters<typeof EdicionDescartadaPage>[0]),
    );
    expect(normalizado(html)).toContain(MENSAJE_CAMBIOS_DESCARTADOS);
    expect(html).toContain(
      encodeURIComponent(mensajeAvisoCambiosDescartados(DATOS_PUBLICADOS.nombre, MOTIVO)),
    );
    // El motivo NO viaja por la URL: la pantalla no recibe searchParams.
  });

  it("una edición reemplazada por el dueño no se anuncia como descarte del admin", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}504`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}504`);
    await prisma.edicionPendiente.update({
      where: { id: edicion.id },
      data: { estado: "descartada", resueltaEn: new Date() },
    });

    expect(
      await urlDeRedireccion(() =>
        EdicionDescartadaPage({
          params: Promise.resolve({ id: edicion.id }),
        } as Parameters<typeof EdicionDescartadaPage>[0]),
      ),
    ).toBe(`/admin/ediciones/${edicion.id}`);
  });

  it("sin sesión no se guarda ningún motivo", async () => {
    const publicado = await altaPublicada(`${PREFIJO}505`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}505`);
    expect(await descartar(edicion.id, "porque sí")).toBe("/admin");
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.estado).toBe("pendiente");
    expect(fila.motivoDescarte).toBeNull();
  });
});

// ── Concurrencia ────────────────────────────────────────────────────────────

describe("revision-admin · una edición se resuelve una sola vez", () => {
  // Scenario: doble aplicación
  it("la segunda aplicación no se aplica y dice 'ya los habías resuelto'", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}601`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}601`, { horario: "primero" });

    await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id));
    await prisma.negocio.update({
      where: { id: publicado.id },
      data: { horario: "editado a mano" },
    });

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(edicion.id))).toBe(
      `/admin/ediciones/${edicion.id}?aviso=ya-resuelta`,
    );
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.horario).toBe("editado a mano");

    const html = normalizado(await abrirDetalleEdicion(edicion.id, { aviso: "ya-resuelta" }));
    expect(html).toContain(MENSAJE_EDICION_YA_RESUELTA);
    // Y ya no ofrece resolverla otra vez.
    expect(html).not.toContain(BOTON_APLICAR_CAMBIOS);
    expect(html).not.toContain(BOTON_DESCARTAR_CAMBIOS);
  });

  it("el doble descarte tampoco pisa el primer motivo", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}602`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}602`);
    const datos = new FormData();
    datos.set("motivo", "el primero");
    await urlDeRedireccion(() => descartarEdicionAccion(edicion.id, datos));

    const otros = new FormData();
    otros.set("motivo", "el segundo");
    expect(await urlDeRedireccion(() => descartarEdicionAccion(edicion.id, otros))).toBe(
      `/admin/ediciones/${edicion.id}?aviso=ya-resuelta`,
    );
    const fila = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(fila.motivoDescarte).toBe("el primero");
  });

  // Scenario: el negocio mandó otros mientras tanto
  it("una edición reemplazada no se aplica y lo dice con su propio literal", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}603`);
    const vieja = await edicionDe(publicado.id, `${PREFIJO}603`, { horario: "vieja" });
    // El dueño manda otra: la vieja se cierra y la nueva ocupa su lugar.
    await prisma.edicionPendiente.update({
      where: { id: vieja.id },
      data: { estado: "descartada", resueltaEn: new Date() },
    });
    const nueva = await edicionDe(publicado.id, `${PREFIJO}603`, { horario: "nueva" });

    expect(await urlDeRedireccion(() => aplicarEdicionAccion(vieja.id))).toBe(
      `/admin/ediciones/${vieja.id}?aviso=reemplazada`,
    );
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(ficha.horario).toBe(DATOS_PUBLICADOS.horario);

    // La nueva sigue esperando en la cola.
    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((item) => item.id)).toEqual([nueva.id]);

    const html = normalizado(await abrirDetalleEdicion(vieja.id, { aviso: "reemplazada" }));
    expect(html).toContain(MENSAJE_EDICION_REEMPLAZADA);
  });
});

// ── Regenerar el enlace ─────────────────────────────────────────────────────

describe("revision-admin · generar un enlace nuevo", () => {
  // Scenario: regenerar invalida el anterior
  it("sobrescribe la huella y ofrece el mensaje con el enlace nuevo", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}701`);
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });

    expect(await urlDeRedireccion(() => regenerarEnlaceAccion(publicado.id))).toBe(
      `/admin/registros/${publicado.id}/regenerar-enlace/listo`,
    );

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(despues.tokenGestionHash).not.toBe(antes.tokenGestionHash);
    // Scenario: regenerar no toca la ficha ni la cola.
    expect(despues.nombre).toBe(antes.nombre);
    expect(despues.whatsapp).toBe(antes.whatsapp);
    expect(despues.estado).toBe(antes.estado);

    const sobre = peticion.puestas.find((cookie) => cookie.nombre === NOMBRE_COOKIE_SOBRE)!;
    peticion.cookies[NOMBRE_COOKIE_SOBRE] = sobre.valor;
    const token = sobre.valor.slice(sobre.valor.indexOf(".") + 1);
    expect(huellaDeToken(token)).toBe(despues.tokenGestionHash);

    const html = await render(
      RegenerarEnlaceListoPage({
        params: Promise.resolve({ id: publicado.id }),
      } as Parameters<typeof RegenerarEnlaceListoPage>[0]),
    );
    expect(normalizado(html)).toContain(MENSAJE_ENLACE_REGENERADO);
    expect(html).toContain(BOTON_MANDAR_ENLACE_WHATSAPP);
    expect(html).toContain(
      encodeURIComponent(
        mensajeEnlaceNuevo(DATOS_PUBLICADOS.nombre, `${URL_SITIO}/editar/${token}`),
      ),
    );
  });

  // Scenario: regenerar no toca la ficha ni la cola
  it("una edición pendiente sigue esperando después de regenerar", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}702`);
    const edicion = await edicionDe(publicado.id, `${PREFIJO}702`);

    await urlDeRedireccion(() => regenerarEnlaceAccion(publicado.id));

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((item) => item.id)).toEqual([edicion.id]);
  });

  // Scenario: el enlace se muestra una sola vez
  it("sin el sobre, la pantalla del enlace ya no muestra nada y vuelve al detalle", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}703`);
    await urlDeRedireccion(() => regenerarEnlaceAccion(publicado.id));
    // Sin la cookie del sobre (caducó, o el admin volvió después).
    expect(
      await urlDeRedireccion(() =>
        RegenerarEnlaceListoPage({
          params: Promise.resolve({ id: publicado.id }),
        } as Parameters<typeof RegenerarEnlaceListoPage>[0]),
      ),
    ).toBe(`/admin/registros/${publicado.id}`);
  });

  it("el sobre de otro negocio no sirve para ver este enlace", async () => {
    conSesion();
    const uno = await altaPublicada(`${PREFIJO}704`);
    const otro = await altaPublicada(`${PREFIJO}705`);
    await urlDeRedireccion(() => regenerarEnlaceAccion(uno.id));
    const sobre = peticion.puestas.find((cookie) => cookie.nombre === NOMBRE_COOKIE_SOBRE)!;
    peticion.cookies[NOMBRE_COOKIE_SOBRE] = sobre.valor;

    expect(
      await urlDeRedireccion(() =>
        RegenerarEnlaceListoPage({
          params: Promise.resolve({ id: otro.id }),
        } as Parameters<typeof RegenerarEnlaceListoPage>[0]),
      ),
    ).toBe(`/admin/registros/${otro.id}`);
  });

  it("solo se ofrece para una ficha publicada", async () => {
    conSesion();
    const enRevision = await prisma.negocio.create({
      data: {
        ...DATOS_PUBLICADOS,
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}706`,
        consintioAvisoEn: new Date(),
      },
    });

    expect(
      await urlDeRedireccion(() =>
        RegenerarEnlacePage({
          params: Promise.resolve({ id: enRevision.id }),
        } as Parameters<typeof RegenerarEnlacePage>[0]),
      ),
    ).toBe(`/admin/registros/${enRevision.id}`);
    expect(await urlDeRedireccion(() => regenerarEnlaceAccion(enRevision.id))).toBe(
      `/admin/registros/${enRevision.id}`,
    );
    expect(
      (await prisma.negocio.findUniqueOrThrow({ where: { id: enRevision.id } }))
        .tokenGestionHash,
    ).toBeNull();
  });

  // Scenario: el panel no muestra el enlace vigente
  it("el detalle de un publicado ofrece el control pero no el enlace", async () => {
    conSesion();
    const publicado = await altaPublicada(`${PREFIJO}707`);
    const html = normalizado(
      await render(
        DetalleRegistroPage({
          params: Promise.resolve({ id: publicado.id }),
          searchParams: Promise.resolve({}),
        } as Parameters<typeof DetalleRegistroPage>[0]),
      ),
    );
    expect(html).toContain(BOTON_GENERAR_ENLACE_NUEVO);
    expect(html).toContain("Tiene enlace de gestión");
    expect(html).not.toContain("/editar/");
  });

  // Scenario: generar un enlace sin sesión
  it("sin sesión el enlace no cambia y no se devuelve ningún token", async () => {
    const publicado = await altaPublicada(`${PREFIJO}708`);
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(await urlDeRedireccion(() => regenerarEnlaceAccion(publicado.id))).toBe("/admin");
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id: publicado.id } });
    expect(despues.tokenGestionHash).toBe(antes.tokenGestionHash);
    expect(peticion.puestas).toHaveLength(0);
  });
});
