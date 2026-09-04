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
import ColaAdminPage from "../src/app/admin/cola/page";
import { marcarReporteAtendidoAccion } from "../src/app/admin/registros/[id]/accion-marcar-reporte-atendido";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  BOTON_MARCAR_ATENDIDO,
  MENSAJE_REPORTE_ATENDIDO,
  MENSAJE_REPORTE_YA_ATENDIDO,
  TEXTO_COLA_VACIA,
  TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO,
  TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO,
  TEXTO_REVISAR,
  TEXTO_VER_REPORTES,
  textoConteoNegociosReportados,
  textoReportesSinAtender,
} from "../src/lib/admin/textos";
import { ETIQUETA_MOTIVO_REPORTE } from "../src/lib/reportes/motivos";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: revision-admin (delta del change `agregar-boton-reportar`) ·
// Requirements "La cola avisa qué negocios tienen reportes sin atender", "El
// detalle del negocio lista sus reportes sin atender" y "Marcar un reporte
// como atendido, una sola vez" (tasks.md #12, #13 y #14).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 4xxx.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const PREFIJO = "7710004";
const HORA_MS = 60 * 60 * 1000;

const NOMBRE_TRES = "Carnicería Ficticia Don Chuy";
const NOMBRE_UNO = "Estética Ficticia Los Rizos";
const COMENTARIO = "Fui el sábado y el local está vacío, ya no hay nadie.";
const COMENTARIO_HOSTIL = "<b>cerró</b><script>alert(1)</script>";

const normalizado = (html: string) => html.replace(/\s+/g, " ");
/** HTML sin el `<script>` de reposición de formularios que React siempre añade. */
const sinScriptsDeReact = (html: string) => html.replace(/<script>[\s\S]*?<\/script>/g, "");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let idTres = "";
let idUno = "";
let idSinReportes = "";
let idEnRevision = "";

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const abrirCola = () => render(ColaAdminPage());

const abrirDetalle = (id: string, searchParams: Record<string, string> = {}) =>
  render(
    DetalleRegistroAdminPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }),
  );

async function alta(
  nombre: string,
  whatsapp: string,
  estado: "en_revision" | "publicado",
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      coloniaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado,
      publicadoEn: estado === "publicado" ? new Date("2026-08-10T10:00:00.000Z") : null,
      registradoEn: new Date(Date.now() - 3 * HORA_MS),
    },
  });
  return creado.id;
}

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idTres = await alta(NOMBRE_TRES, `${PREFIJO}001`, "publicado");
  idUno = await alta(NOMBRE_UNO, `${PREFIJO}002`, "publicado");
  idSinReportes = await alta("Vulcanizadora Ficticia El Parche", `${PREFIJO}003`, "publicado");
  idEnRevision = await alta("Yoga Ficticia Luna", `${PREFIJO}004`, "en_revision");
});

afterAll(async () => {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarPeticion();
  conSesion();
  await prisma.reporte.deleteMany();

  const ahora = Date.now();
  const hace = (horas: number) => new Date(ahora - horas * HORA_MS);

  // El primero: tres pendientes (uno con comentario) y uno ya atendido.
  await prisma.reporte.createMany({
    data: [
      { negocioId: idTres, motivo: "cerrado", comentario: COMENTARIO, creadoEn: hace(30) },
      { negocioId: idTres, motivo: "datos_incorrectos", creadoEn: hace(2) },
      { negocioId: idTres, motivo: "no_real", creadoEn: hace(5) },
      {
        negocioId: idTres,
        motivo: "inapropiado",
        creadoEn: hace(60),
        estado: "atendido",
        atendidoEn: hace(50),
      },
      // El segundo: un solo pendiente, más reciente que el más viejo del primero.
      { negocioId: idUno, motivo: "inapropiado", creadoEn: hace(4) },
    ],
  });
});

describe("revision-admin · sección de negocios reportados en la cola", () => {
  // Scenario: cola con negocios reportados
  it("encabeza con el conteo y lista cada negocio con sus pendientes", async () => {
    const html = normalizado(await abrirCola());

    expect(html).toContain(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO);
    expect(html).toContain(textoConteoNegociosReportados(2));
    expect(html).toContain(NOMBRE_TRES);
    expect(html).toContain(textoReportesSinAtender(3));
    expect(html).toContain(NOMBRE_UNO);
    expect(html).toContain(textoReportesSinAtender(1));
    expect(html).toContain(TEXTO_VER_REPORTES);
    expect(html).toContain(`/admin/registros/${idTres}`);
    expect(html).toContain(`/admin/registros/${idUno}`);
    // Y el que no tiene reportes no sale en la sección.
    expect(html).not.toContain(idSinReportes);
  });

  it("van del que lleva más tiempo con un reporte sin atender al más reciente", async () => {
    const html = await abrirCola();
    const seccion = html.slice(html.indexOf(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO));
    expect(seccion.indexOf(NOMBRE_TRES)).toBeLessThan(seccion.indexOf(NOMBRE_UNO));
  });

  // Scenario: sin reportes pendientes no hay sección
  it("sin ningún pendiente la sección entera desaparece", async () => {
    await prisma.reporte.deleteMany();
    const html = normalizado(await abrirCola());

    expect(html).not.toContain(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO);
    expect(html).not.toContain("sin atender");
    expect(html).not.toContain(TEXTO_VER_REPORTES);
  });

  it("atendidos todos los reportes de un negocio, ese negocio sale de la sección", async () => {
    const pendientes = await prisma.reporte.findMany({
      where: { negocioId: idUno, estado: "pendiente" },
    });
    for (const reporte of pendientes) {
      await urlDeRedireccion(() =>
        marcarReporteAtendidoAccion(idUno, reporte.id, new FormData()),
      );
    }

    const html = normalizado(await abrirCola());
    expect(html).toContain(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO);
    expect(html).toContain(textoConteoNegociosReportados(1));
    expect(html).not.toContain(NOMBRE_UNO);
  });

  // Scenario: los reportes no se mezclan con los registros por revisar
  it("un negocio publicado con reportes no entra a 'Registros por revisar'", async () => {
    const html = normalizado(await abrirCola());
    const antesDeLaSeccion = html.slice(
      0,
      html.indexOf(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO),
    );

    expect(antesDeLaSeccion).toContain("Yoga Ficticia Luna"); // el en_revision
    expect(antesDeLaSeccion).toContain(TEXTO_REVISAR);
    expect(antesDeLaSeccion).not.toContain(NOMBRE_TRES);
    expect(antesDeLaSeccion).not.toContain(NOMBRE_UNO);
  });

  it("la cola vacía sigue diciendo lo mismo aunque haya reportados", async () => {
    await prisma.negocio.delete({ where: { id: idEnRevision } });
    try {
      const html = normalizado(await abrirCola());
      expect(html).toContain(TEXTO_COLA_VACIA);
      expect(html).toContain(TEXTO_NEGOCIOS_REPORTADOS_ENCABEZADO);
    } finally {
      // Se repone para los casos siguientes (la suite comparte los negocios).
      idEnRevision = await alta("Yoga Ficticia Luna", `${PREFIJO}004`, "en_revision");
    }
  });
});

describe("revision-admin · reportes sin atender en el detalle", () => {
  // Scenario: detalle con reportes
  it("los lista del más antiguo al más reciente, con motivo, espera y comentario", async () => {
    const html = normalizado(await abrirDetalle(idTres));

    expect(html).toContain(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO);
    const seccion = html.slice(html.indexOf(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO));
    expect(seccion).toContain(ETIQUETA_MOTIVO_REPORTE.cerrado);
    expect(seccion).toContain(ETIQUETA_MOTIVO_REPORTE.no_real);
    expect(seccion).toContain(ETIQUETA_MOTIVO_REPORTE.datos_incorrectos);
    // El atendido no aparece.
    expect(seccion).not.toContain(ETIQUETA_MOTIVO_REPORTE.inapropiado);
    // Orden por antigüedad: 30h, 5h, 2h.
    expect(seccion.indexOf(ETIQUETA_MOTIVO_REPORTE.cerrado)).toBeLessThan(
      seccion.indexOf(ETIQUETA_MOTIVO_REPORTE.no_real),
    );
    expect(seccion.indexOf(ETIQUETA_MOTIVO_REPORTE.no_real)).toBeLessThan(
      seccion.indexOf(ETIQUETA_MOTIVO_REPORTE.datos_incorrectos),
    );
    // Desde cuándo espera, en la misma forma en palabras que la cola.
    expect(seccion).toContain("Hace 30 horas");
    expect(seccion).toContain("Hace 5 horas");
    // Y el comentario solo en el que lo trae.
    expect(seccion).toContain(COMENTARIO);
    expect(seccion.match(new RegExp(BOTON_MARCAR_ATENDIDO, "g"))).toHaveLength(3);
  });

  // Scenario: comentario con marcado
  it("un comentario con etiquetas se pinta como texto, sin interpretarse", async () => {
    await prisma.reporte.deleteMany();
    await prisma.reporte.create({
      data: { negocioId: idTres, motivo: "cerrado", comentario: COMENTARIO_HOSTIL },
    });

    const html = sinScriptsDeReact(await abrirDetalle(idTres));
    expect(html).not.toContain(COMENTARIO_HOSTIL);
    expect(html).toContain("&lt;b&gt;cerró&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
  });

  it("una palabra larguísima no se sale de la pantalla del celular", async () => {
    await prisma.reporte.deleteMany();
    await prisma.reporte.create({
      data: { negocioId: idTres, motivo: "cerrado", comentario: "a".repeat(300) },
    });

    const html = await abrirDetalle(idTres);
    const seccion = html.slice(html.indexOf(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO));
    expect(seccion).toMatch(/break-words/);
  });

  // Scenario: negocio sin reportes
  it.each([
    ["un negocio publicado sin reportes", () => idSinReportes],
    ["un registro en revisión", () => idEnRevision],
  ])("%s no muestra la sección ni un hueco vacío", async (_caso, id) => {
    const html = normalizado(await abrirDetalle(id()));
    expect(html).not.toContain(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO);
    expect(html).not.toContain(BOTON_MARCAR_ATENDIDO);
  });

  // Scenario: revisar desde el celular (lo automatizable)
  it("cada botón de atender reserva al menos 44px de área táctil", async () => {
    const html = await abrirDetalle(idTres);
    const seccion = html.slice(html.indexOf(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO));
    expect(seccion.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("el detalle no muestra ningún dato de quien reportó, porque no existe", async () => {
    const html = normalizado(await abrirDetalle(idTres));
    const seccion = html.slice(html.indexOf(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO));
    expect(seccion).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // ninguna IP
    expect(seccion).not.toMatch(/report(ó|o) |an[óo]nimo|vecino/i);
  });
});

describe("revision-admin · marcar como atendido desde el panel", () => {
  const pendientesDe = (negocioId: string) =>
    prisma.reporte.findMany({
      where: { negocioId, estado: "pendiente" },
      orderBy: { creadoEn: "asc" },
    });

  // Scenario: atender un reporte
  it("confirma en el detalle, saca ese reporte y deja los demás", async () => {
    const [primero, segundo] = await pendientesDe(idTres);

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idTres, primero.id, new FormData()),
    );
    expect(destino).toBe(`/admin/registros/${idTres}?reporte=atendido`);

    const html = normalizado(await abrirDetalle(idTres, { reporte: "atendido" }));
    expect(html).toContain(MENSAJE_REPORTE_ATENDIDO);
    expect(html).not.toContain(COMENTARIO); // era el del reporte atendido
    const seccion = html.slice(html.indexOf(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO));
    expect(seccion.match(new RegExp(BOTON_MARCAR_ATENDIDO, "g"))).toHaveLength(2);
    expect((await pendientesDe(idTres))[0].id).toBe(segundo.id);

    // Y la cola cuenta un reporte menos para ese negocio.
    const cola = normalizado(await abrirCola());
    expect(cola).toContain(textoReportesSinAtender(2));
  });

  // Scenario: atender un reporte, en la rama del ÚNICO pendiente (hallazgo M1
  // de la etapa D: el aviso vivía dentro de la sección "Reportes sin atender",
  // que desaparece justo cuando se atiende el último, así que el admin se
  // quedaba sin ninguna respuesta del sistema).
  it("atender el ÚNICO pendiente confirma, aunque la sección ya no aparezca", async () => {
    const [unico] = await pendientesDe(idUno);

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idUno, unico.id, new FormData()),
    );
    expect(destino).toBe(`/admin/registros/${idUno}?reporte=atendido`);

    const html = normalizado(await abrirDetalle(idUno, { reporte: "atendido" }));
    expect(html).toContain(MENSAJE_REPORTE_ATENDIDO);
    // La sección sí desaparece: ya no queda nada por atender.
    expect(html).not.toContain(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO);
    expect(html).not.toContain(BOTON_MARCAR_ATENDIDO);
    expect(await pendientesDe(idUno)).toHaveLength(0);
  });

  // Scenario: doble marcado, en la misma rama del único pendiente
  it("el doble marcado del ÚNICO pendiente avisa y conserva la fecha original", async () => {
    const [unico] = await pendientesDe(idUno);
    const cuando = new Date("2026-09-03T09:00:00.000Z");
    await prisma.reporte.update({
      where: { id: unico.id },
      data: { estado: "atendido", atendidoEn: cuando },
    });

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idUno, unico.id, new FormData()),
    );
    expect(destino).toBe(`/admin/registros/${idUno}?reporte=ya-atendido`);

    const html = normalizado(await abrirDetalle(idUno, { reporte: "ya-atendido" }));
    expect(html).toContain(MENSAJE_REPORTE_YA_ATENDIDO);
    expect(html).not.toContain(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO);
    // Y la fecha de la primera vez no se movió.
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: unico.id } })).atendidoEn?.toISOString(),
    ).toBe(cuando.toISOString());
  });

  it("sin ningún reporte, el detalle sigue confirmando lo que dice la URL", async () => {
    await prisma.reporte.deleteMany();

    const html = normalizado(await abrirDetalle(idSinReportes, { reporte: "atendido" }));
    expect(html).toContain(MENSAJE_REPORTE_ATENDIDO);
    expect(html).not.toContain(TEXTO_REPORTES_SIN_ATENDER_ENCABEZADO);
  });

  // Scenario: doble marcado
  it("la segunda vez avisa que ya estaba atendido y no pisa la fecha", async () => {
    const [primero] = await pendientesDe(idTres);

    await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idTres, primero.id, new FormData()),
    );
    const guardado = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idTres, primero.id, new FormData()),
    );
    expect(destino).toBe(`/admin/registros/${idTres}?reporte=ya-atendido`);

    const releido = await prisma.reporte.findUniqueOrThrow({ where: { id: primero.id } });
    expect(releido.atendidoEn?.toISOString()).toBe(guardado.atendidoEn?.toISOString());

    const html = normalizado(await abrirDetalle(idTres, { reporte: "ya-atendido" }));
    expect(html).toContain(MENSAJE_REPORTE_YA_ATENDIDO);
  });

  // Scenario: reporte inexistente
  it("un identificador de reporte inventado no cambia nada ni filtra datos", async () => {
    const antes = await prisma.reporte.findMany({ orderBy: { id: "asc" } });

    const destino = await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idTres, "reporte-que-no-existe", new FormData()),
    );
    expect(destino).toBe(`/admin/registros/${idTres}?reporte=ya-atendido`);
    expect(destino).not.toContain(COMENTARIO);
    expect(await prisma.reporte.findMany({ orderBy: { id: "asc" } })).toEqual(antes);
  });

  // Scenario: atender no cambia el negocio
  it("el negocio sigue publicado, con sus mismos datos y su misma fecha", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({
      where: { id: idTres },
      include: { giros: true },
    });
    const [primero] = await pendientesDe(idTres);

    await urlDeRedireccion(() =>
      marcarReporteAtendidoAccion(idTres, primero.id, new FormData()),
    );

    expect(
      await prisma.negocio.findUniqueOrThrow({
        where: { id: idTres },
        include: { giros: true },
      }),
    ).toEqual(antes);
  });

  it("un valor inventado en ?reporte no pinta ninguna confirmación", async () => {
    const html = normalizado(await abrirDetalle(idTres, { reporte: "loquesea" }));
    expect(html).not.toContain(MENSAJE_REPORTE_ATENDIDO);
    expect(html).not.toContain(MENSAJE_REPORTE_YA_ATENDIDO);
  });
});
