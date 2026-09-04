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
import BorradoHechoPage from "../src/app/admin/borrado-hecho/page";
import ColaAdminPage from "../src/app/admin/cola/page";
import { aprobarRegistroAccion } from "../src/app/admin/registros/[id]/accion-aprobar";
import { borrarRegistroAccion } from "../src/app/admin/registros/[id]/accion-borrar";
import { despublicarRegistroAccion } from "../src/app/admin/registros/[id]/accion-despublicar";
import ConfirmarBorradoPage from "../src/app/admin/registros/[id]/borrar/page";
import RegistroDespublicadoPage from "../src/app/admin/registros/[id]/despublicado/page";
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
  AYUDA_MOTIVO_DESPUBLICAR,
  BOTON_APROBAR,
  BOTON_AVISAR_WHATSAPP,
  BOTON_BORRAR_DEFINITIVAMENTE,
  BOTON_CONFIRMAR_BORRADO,
  BOTON_DESPUBLICAR,
  BOTON_RECHAZAR,
  ENCABEZADO_CONFIRMAR_BORRADO,
  ERROR_MOTIVO_DESPUBLICAR_VACIO,
  ERROR_PALABRA_BORRAR,
  ETIQUETA_COLA_DESPUBLICADA,
  ETIQUETA_CONFIRMAR_BORRAR,
  ETIQUETA_CUANDO_DESPUBLICO,
  ETIQUETA_MOTIVO_DESPUBLICAR,
  ETIQUETA_POR_QUE_DESPUBLICO,
  MENSAJE_BORRADO_HECHO,
  MENSAJE_DESPUBLICADO,
  MENSAJE_YA_NO_EXISTE,
  MENSAJE_YA_NO_PUBLICADA,
  RECORDATORIO_TRAMITE_ARCO,
  TEXTO_INDICADOR_ATRASADO,
  TEXTO_MEJOR_NO_REGRESAR,
  errorMotivoDespublicarLargo,
  mensajeAvisoDespublicacion,
  textoAdvertenciaBorrado,
} from "../src/lib/admin/textos";
import { LIMITE_MOTIVO_DESPUBLICACION } from "../src/lib/admin/transiciones";
import { crearClientePrueba } from "./db";
import { NoEncontradoSimulado, peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";

// Spec: revision-admin (delta `agregar-despublicar-y-borrado-arco`) ·
// Requirements de despublicar, del aviso por WhatsApp, del borrado en dos
// pasos, del borrado que se lleva todo sin dejar rastro, de la sesión
// obligatoria y del detalle por estado (tasks.md #7 a #13 y #17).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719998xxx.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const PREFIJO = "7719998";
const NOMBRE_PUBLICADO = "Tacos Ficticios del Güero";

const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let girosIds: number[];
let idPublicado = "";
let idEnRevision = "";
let idRechazado = "";

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const abrirDetalle = (id: string, searchParams: Record<string, string> = {}) =>
  render(
    DetalleRegistroAdminPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }) as Promise<React.ReactElement>,
  );

const abrirConfirmacionBorrado = (id: string, searchParams: Record<string, string> = {}) =>
  render(
    ConfirmarBorradoPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }) as Promise<React.ReactElement>,
  );

const abrirDespublicado = (id: string, searchParams: Record<string, string> = {}) =>
  render(
    RegistroDespublicadoPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve(searchParams),
    }) as Promise<React.ReactElement>,
  );

const abrirBorradoHecho = (searchParams: Record<string, string> = {}) =>
  render(
    BorradoHechoPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }) as Promise<React.ReactElement>,
  );

function formulario(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

const leer = (id: string) =>
  prisma.negocio.findUnique({ where: { id }, include: { giros: true } });

/** Ids de los giros que llegan premarcados en el formulario de aprobar. */
function girosMarcados(html: string): number[] {
  return [...html.matchAll(/<input[^>]*>/g)]
    .map((encontrado) => encontrado[0])
    .filter((etiqueta) => etiqueta.includes('name="giro"') && etiqueta.includes("checked"))
    .map((etiqueta) => Number(etiqueta.match(/value="(\d+)"/)?.[1]));
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
  girosIds = (await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 3 })).map(
    (giro) => giro.id,
  );
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
    registradoEn: new Date("2026-01-05T09:00:00.000Z"),
  };

  idPublicado = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: NOMBRE_PUBLICADO,
        whatsapp: `${PREFIJO}001`,
        telefonoFijo: "7717778001",
        direccion: "Local 3 de un andador inventado",
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-21T12:00:00.000Z"),
        giros: { connect: girosIds.map((id) => ({ id })) },
      },
    })
  ).id;

  idEnRevision = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Yoga Ficticia Luna",
        whatsapp: `${PREFIJO}002`,
        registradoEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    })
  ).id;

  idRechazado = (
    await prisma.negocio.create({
      data: {
        ...base,
        nombre: "Préstamos Ficticios Rápidos",
        whatsapp: `${PREFIJO}003`,
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-26T11:00:00.000Z"),
        motivoRechazo: "No publicamos préstamos informales",
      },
    })
  ).id;
});

afterEach(() => vi.restoreAllMocks());

describe("revision-admin · la acción de despublicar", () => {
  // Scenario: despublicar con motivo
  it("con motivo deja la ficha en revisión y lleva a la pantalla de confirmación", async () => {
    conSesion();
    const motivo = "El dueño nos pidió por WhatsApp que la bajáramos";

    expect(
      await urlDeRedireccion(() =>
        despublicarRegistroAccion(idPublicado, formulario({ motivo })),
      ),
    ).toBe(`/admin/registros/${idPublicado}/despublicado`);

    const negocio = await leer(idPublicado);
    expect(negocio?.estado).toBe("en_revision");
    expect(negocio?.motivoDespublicacion).toBe(motivo);
    expect(negocio?.despublicadoEn).toBeInstanceOf(Date);
  });

  // Scenario: despublicar sin motivo
  it.each([["vacío", ""], ["de puros espacios", "   "]])(
    "con el motivo %s vuelve al detalle con el error y sin tocar la base",
    async (_caso, motivo) => {
      conSesion();

      expect(
        await urlDeRedireccion(() =>
          despublicarRegistroAccion(idPublicado, formulario({ motivo })),
        ),
      ).toBe(`/admin/registros/${idPublicado}?errorDespublicar=motivo`);

      const negocio = await leer(idPublicado);
      expect(negocio?.estado).toBe("publicado");
      expect(negocio?.despublicadoEn).toBeNull();

      const html = await abrirDetalle(idPublicado, { errorDespublicar: "motivo" });
      expect(normalizado(html)).toContain(ERROR_MOTIVO_DESPUBLICAR_VACIO);
    },
  );

  // Scenario: despublicar algo que ya no estaba publicado
  it("sobre una ficha que ya no estaba publicada avisa con el literal de la spec", async () => {
    conSesion();

    const destino = await urlDeRedireccion(() =>
      despublicarRegistroAccion(idEnRevision, formulario({ motivo: "Motivo ficticio" })),
    );
    expect(destino).toBe(
      `/admin/registros/${idEnRevision}?avisoDespublicar=ya-no-publicada`,
    );

    const negocio = await leer(idEnRevision);
    expect(negocio?.despublicadoEn).toBeNull();
    expect(negocio?.motivoDespublicacion).toBeNull();

    const html = await abrirDetalle(idEnRevision, {
      avisoDespublicar: "ya-no-publicada",
    });
    expect(normalizado(html)).toContain(MENSAJE_YA_NO_PUBLICADA);
  });

  // Scenario: doble despublicación
  it("la segunda despublicación desde otra pestaña no pisa la primera", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "Primera bajada" })),
    );

    const destino = await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "Segunda bajada" })),
    );
    expect(destino).toBe(
      `/admin/registros/${idPublicado}?avisoDespublicar=ya-no-publicada`,
    );
    expect((await leer(idPublicado))?.motivoDespublicacion).toBe("Primera bajada");
  });

  it("un identificador inexistente vuelve a la cola sin decir si existía", async () => {
    conSesion();
    expect(
      await urlDeRedireccion(() =>
        despublicarRegistroAccion("no-existe-este-id", formulario({ motivo: "Motivo" })),
      ),
    ).toBe("/admin/cola");
  });

  // Hallazgo BAJO 3 de la etapa C: la cota no se aplica en silencio.
  it("un motivo que se pasa de la cota vuelve al detalle con su propio error", async () => {
    conSesion();
    expect(
      await urlDeRedireccion(() =>
        despublicarRegistroAccion(
          idPublicado,
          formulario({ motivo: "x".repeat(LIMITE_MOTIVO_DESPUBLICACION + 1) }),
        ),
      ),
    ).toBe(`/admin/registros/${idPublicado}?errorDespublicar=longitud`);

    const negocio = await leer(idPublicado);
    expect(negocio?.estado).toBe("publicado");
    expect(negocio?.motivoDespublicacion).toBeNull();

    const html = normalizado(await abrirDetalle(idPublicado, { errorDespublicar: "longitud" }));
    expect(html).toContain(errorMotivoDespublicarLargo(LIMITE_MOTIVO_DESPUBLICACION));
    expect(html).not.toContain(ERROR_MOTIVO_DESPUBLICAR_VACIO);
  });

  it("el textarea declara la cota, para no perder lo escrito antes de enviar", async () => {
    conSesion();
    const html = await abrirDetalle(idPublicado);
    expect(html).toMatch(
      new RegExp(`name="motivo"[^>]*maxLength="${LIMITE_MOTIVO_DESPUBLICACION}"`),
    );
  });

  it("un errorDespublicar inventado en la URL no pinta ningún error", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idPublicado, { errorDespublicar: "inventado" }));
    expect(html).not.toContain(ERROR_MOTIVO_DESPUBLICAR_VACIO);
    expect(html).not.toContain(errorMotivoDespublicarLargo(LIMITE_MOTIVO_DESPUBLICACION));
  });

  it("un motivo que no es texto (campo ausente) se trata como vacío", async () => {
    conSesion();
    expect(
      await urlDeRedireccion(() => despublicarRegistroAccion(idPublicado, formulario({}))),
    ).toBe(`/admin/registros/${idPublicado}?errorDespublicar=motivo`);
    expect((await leer(idPublicado))?.estado).toBe("publicado");
  });
});

describe("revision-admin · la confirmación de la despublicación", () => {
  // Scenario: aviso de despublicación
  it("muestra el literal y el wa.me con el mensaje exacto de la spec", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const html = await abrirDespublicado(idPublicado);
    expect(normalizado(html)).toContain(MENSAJE_DESPUBLICADO);
    expect(html).toContain(BOTON_AVISAR_WHATSAPP);

    const mensaje = mensajeAvisoDespublicacion(NOMBRE_PUBLICADO, "El negocio cerró");
    expect(mensaje).toBe(
      "Hola, te escribo de NecesitoUno Tizayuca. Bajamos del directorio la ficha de «Tacos Ficticios del Güero»: El negocio cerró. Si quieres que la volvamos a publicar o tienes alguna duda, contéstame por aquí.",
    );
    expect(html).toContain(
      `https://wa.me/52${PREFIJO}001?text=${encodeURIComponent(mensaje)}`
        .replaceAll("&", "&amp;"),
    );
  });

  // Requirement de no fuga: el motivo sale de la fila guardada, nunca de la URL
  it("ignora cualquier motivo que venga por la URL", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const html = await abrirDespublicado(idPublicado, {
      motivo: "MOTIVO-INYECTADO-POR-LA-URL",
      motivoMock: "MOTIVO-INYECTADO-POR-LA-URL",
    });
    expect(html).not.toContain("MOTIVO-INYECTADO-POR-LA-URL");
    expect(html).toContain(encodeURIComponent("El negocio cerró"));
  });

  // Scenario: recargar después de despublicar
  it("recargarla no ejecuta ninguna acción: no hay ningún formulario en la pantalla", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const primera = await abrirDespublicado(idPublicado);
    const segunda = await abrirDespublicado(idPublicado);
    expect(primera).not.toContain("<form");
    expect(segunda).toBe(primera);
    expect((await leer(idPublicado))?.motivoDespublicacion).toBe("El negocio cerró");
  });

  // Scenario: número que no se puede interpretar
  it("con un número que no se normaliza muestra el número tal cual, sin enlace", async () => {
    conSesion();
    const raro = await prisma.negocio.create({
      data: {
        nombre: "Ficticio con número imposible",
        categoriaId,
        coloniaId,
        whatsapp: "no-es-un-numero",
        consintioAvisoEn: new Date(),
        estado: "publicado",
        publicadoEn: new Date(),
      },
    });
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(raro.id, formulario({ motivo: "El negocio cerró" })),
    );

    const html = await abrirDespublicado(raro.id);
    expect(html).toContain("no-es-un-numero");
    expect(html).not.toContain("wa.me");
  });

  it("sobre una ficha que sigue publicada devuelve al detalle", async () => {
    conSesion();
    expect(await urlDeRedireccion(() => abrirDespublicado(idPublicado))).toBe(
      `/admin/registros/${idPublicado}`,
    );
  });

  /**
   * Hallazgo BAJO 1 de la etapa C: la guarda miraba solo el estado, así que un
   * alta recién llegada del formulario público (que es `en_revision`) la
   * satisfacía. El admin veía "Ya la despublicaste." y un botón de WhatsApp
   * cargado con el mensaje a medias —"Bajamos del directorio la ficha de «…»:
   * ." con el motivo vacío— a un toque de mandárselo a un negocio que nunca
   * estuvo publicado.
   */
  it("sobre un alta que nunca estuvo publicada devuelve al detalle, sin ofrecer el aviso", async () => {
    conSesion();
    const negocio = await leer(idEnRevision);
    expect(negocio?.estado).toBe("en_revision");
    expect(negocio?.despublicadoEn).toBeNull();

    expect(await urlDeRedireccion(() => abrirDespublicado(idEnRevision))).toBe(
      `/admin/registros/${idEnRevision}`,
    );
  });

  it("con estado de despublicada pero sin rastro guardado tampoco se abre", async () => {
    conSesion();
    // Fila inconsistente (alguien tocó la base a mano, o una migración a
    // medias): el estado dice `en_revision`, pero no hay despublicación que
    // confirmar, así que el mensaje saldría con el motivo vacío.
    await prisma.negocio.update({
      where: { id: idPublicado },
      data: { estado: "en_revision", despublicadoEn: null, motivoDespublicacion: null },
    });

    expect(await urlDeRedireccion(() => abrirDespublicado(idPublicado))).toBe(
      `/admin/registros/${idPublicado}`,
    );
  });

  it("con fecha pero con el motivo en blanco tampoco arma un aviso a medias", async () => {
    conSesion();
    await prisma.negocio.update({
      where: { id: idPublicado },
      data: {
        estado: "en_revision",
        despublicadoEn: new Date(),
        motivoDespublicacion: "   ",
      },
    });

    expect(await urlDeRedireccion(() => abrirDespublicado(idPublicado))).toBe(
      `/admin/registros/${idPublicado}`,
    );
  });
});

describe("revision-admin · el borrado se confirma en dos pasos", () => {
  // Scenario: llegar a la confirmación no borra nada
  it("la pantalla de confirmación trae los literales en orden y no borra nada", async () => {
    conSesion();
    const html = normalizado(await abrirConfirmacionBorrado(idPublicado));

    const advertencia = textoAdvertenciaBorrado(NOMBRE_PUBLICADO);
    expect(advertencia).toBe(
      "Esto borra para siempre el registro de «Tacos Ficticios del Güero», sus giros y sus reportes. No hay papelera y no se puede deshacer.",
    );
    for (const literal of [
      ENCABEZADO_CONFIRMAR_BORRADO,
      advertencia,
      RECORDATORIO_TRAMITE_ARCO,
      ETIQUETA_CONFIRMAR_BORRAR,
      BOTON_CONFIRMAR_BORRADO,
      TEXTO_MEJOR_NO_REGRESAR,
    ]) {
      expect(html).toContain(literal);
    }
    // En el orden que pide el requirement.
    const posiciones = [
      ENCABEZADO_CONFIRMAR_BORRADO,
      advertencia,
      RECORDATORIO_TRAMITE_ARCO,
      ETIQUETA_CONFIRMAR_BORRAR,
      BOTON_CONFIRMAR_BORRADO,
      TEXTO_MEJOR_NO_REGRESAR,
    ].map((literal) => html.indexOf(literal));
    expect(posiciones).toEqual([...posiciones].sort((uno, otro) => uno - otro));

    expect(await leer(idPublicado)).not.toBeNull();
  });

  // Scenario: ningún GET borra
  it("abrirla y recargarla varias veces deja el registro intacto", async () => {
    conSesion();
    await abrirConfirmacionBorrado(idPublicado);
    await abrirConfirmacionBorrado(idPublicado);
    await abrirConfirmacionBorrado(idPublicado);
    expect(await leer(idPublicado)).not.toBeNull();
  });

  // Scenario: arrepentirse
  it("'Mejor no, regresar' apunta al detalle del mismo registro", async () => {
    conSesion();
    const html = await abrirConfirmacionBorrado(idPublicado);
    expect(html).toContain(`href="/admin/registros/${idPublicado}"`);
  });

  it("un identificador inexistente responde como no encontrado", async () => {
    conSesion();
    await expect(abrirConfirmacionBorrado("no-existe-este-id")).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
  });

  // Scenario: la confirmación funciona sin JavaScript y en el celular
  it("la pantalla es un Server Component: ningún archivo nuevo declara el modo cliente", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(__dirname, "..");
    for (const archivo of [
      "src/app/admin/registros/[id]/borrar/page.tsx",
      "src/app/admin/registros/[id]/despublicado/page.tsx",
      "src/app/admin/borrado-hecho/page.tsx",
      "src/app/admin/registros/[id]/accion-borrar.ts",
      "src/app/admin/registros/[id]/accion-despublicar.ts",
      "src/components/admin/confirmacion-borrado.tsx",
      "src/components/admin/control-borrar.tsx",
      "src/components/admin/formulario-despublicar.tsx",
    ]) {
      expect(readFileSync(join(raiz, archivo), "utf8"), archivo).not.toContain(
        '"use client"',
      );
    }
  });
});

describe("revision-admin · la acción del borrado definitivo", () => {
  // Scenario: confirmar con la palabra correcta
  it("con la palabra correcta borra la fila y confirma sin datos del negocio", async () => {
    conSesion();

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
      ),
    ).toBe("/admin/borrado-hecho?resultado=borrado");

    expect(await leer(idPublicado)).toBeNull();

    const html = await abrirBorradoHecho({ resultado: "borrado" });
    expect(normalizado(html)).toContain(MENSAJE_BORRADO_HECHO);
  });

  // Scenario: minúsculas y espacios de sobra
  it.each([[" borrar "], ["borrar"], ["  BoRrAr  "]])(
    "acepta %s: solo se ignoran mayúsculas y espacios sobrantes",
    async (escrito) => {
      conSesion();
      expect(
        await urlDeRedireccion(() =>
          borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: escrito })),
        ),
      ).toBe("/admin/borrado-hecho?resultado=borrado");
      expect(await leer(idPublicado)).toBeNull();
    },
  );

  // Scenario: la palabra no coincide
  it.each([["borra"], [""], ["eliminar"], ["BORRA R"], ["BORRARLO"]])(
    "con %s no borra nada y muestra el error de la spec",
    async (escrito) => {
      conSesion();
      expect(
        await urlDeRedireccion(() =>
          borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: escrito })),
        ),
      ).toBe(`/admin/registros/${idPublicado}/borrar?errorBorrar=palabra`);
      expect(await leer(idPublicado)).not.toBeNull();

      const html = normalizado(
        await abrirConfirmacionBorrado(idPublicado, { errorBorrar: "palabra" }),
      );
      expect(html).toContain(ERROR_PALABRA_BORRAR);
    },
  );

  it("sin el campo de confirmación tampoco borra", async () => {
    conSesion();
    expect(
      await urlDeRedireccion(() => borrarRegistroAccion(idPublicado, formulario({}))),
    ).toBe(`/admin/registros/${idPublicado}/borrar?errorBorrar=palabra`);
    expect(await leer(idPublicado)).not.toBeNull();
  });

  // Scenario: borrar dos veces
  it("el segundo envío desde otra pestaña no truena y dice que ya no existe", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
    );

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
      ),
    ).toBe("/admin/borrado-hecho?resultado=ya-no-existe");

    const html = await abrirBorradoHecho({ resultado: "ya-no-existe" });
    expect(normalizado(html)).toContain(MENSAJE_YA_NO_EXISTE);
  });

  // Scenario: borrar en cualquier estado
  it.each([
    ["en revisión", () => idEnRevision],
    ["rechazado", () => idRechazado],
  ])("borra igual un registro %s", async (_caso, obtenerId) => {
    conSesion();
    const id = obtenerId();
    await urlDeRedireccion(() =>
      borrarRegistroAccion(id, formulario({ confirmarBorrado: "BORRAR" })),
    );
    expect(await leer(id)).toBeNull();
  });

  // Scenario: la confirmación del borrado no filtra nada
  it("ni la URL final ni la pantalla traen nombre, WhatsApp, dirección ni id", async () => {
    conSesion();
    const negocio = await leer(idPublicado);

    const url = await urlDeRedireccion(() =>
      borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
    );
    const html = await abrirBorradoHecho({ resultado: "borrado" });

    for (const dato of [
      idPublicado,
      NOMBRE_PUBLICADO,
      negocio!.whatsapp,
      negocio!.telefonoFijo!,
      negocio!.direccion!,
    ]) {
      expect(url, `la URL final filtra ${dato}`).not.toContain(dato);
      expect(html, `la pantalla final filtra ${dato}`).not.toContain(dato);
    }
  });

  // Scenario: el registro borrado desaparece de la cola
  it("un registro borrado ya no aparece en la cola", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      borrarRegistroAccion(idEnRevision, formulario({ confirmarBorrado: "BORRAR" })),
    );
    const html = await render(ColaAdminPage() as Promise<React.ReactElement>);
    expect(html).not.toContain("Yoga Ficticia Luna");
  });
});

describe("revision-admin · el detalle ofrece las acciones que corresponden al estado", () => {
  // Scenario: detalle de una ficha publicada
  it("una ficha publicada ofrece despublicar y borrar, nunca aprobar ni rechazar", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idPublicado));

    expect(html).toContain(ETIQUETA_MOTIVO_DESPUBLICAR);
    expect(html).toContain(AYUDA_MOTIVO_DESPUBLICAR);
    expect(html).toContain(BOTON_DESPUBLICAR);
    expect(html).toContain(BOTON_BORRAR_DEFINITIVAMENTE);
    expect(html).not.toContain(BOTON_APROBAR);
    expect(html).not.toContain(`>${BOTON_RECHAZAR}<`);
  });

  // Scenario: detalle de un registro en revisión
  it("un registro en revisión ofrece aprobar, rechazar y borrar, nunca despublicar", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idEnRevision));

    expect(html).toContain(BOTON_APROBAR);
    expect(html).toContain(BOTON_RECHAZAR);
    expect(html).toContain(BOTON_BORRAR_DEFINITIVAMENTE);
    expect(html).not.toContain(ETIQUETA_MOTIVO_DESPUBLICAR);
  });

  // Scenario: detalle de un registro rechazado
  it("un registro rechazado solo ofrece borrar", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idRechazado));

    expect(html).toContain(BOTON_BORRAR_DEFINITIVAMENTE);
    expect(html).not.toContain(BOTON_APROBAR);
    expect(html).not.toContain(ETIQUETA_MOTIVO_DESPUBLICAR);
  });

  it("el control de borrar va después de los datos del registro", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idPublicado));
    expect(html.indexOf(BOTON_BORRAR_DEFINITIVAMENTE)).toBeGreaterThan(
      html.indexOf(NOMBRE_PUBLICADO),
    );
    expect(html.indexOf(BOTON_BORRAR_DEFINITIVAMENTE)).toBeGreaterThan(
      html.indexOf(BOTON_DESPUBLICAR),
    );
  });

  // Scenario: detalle de una ficha despublicada
  it("una ficha despublicada muestra cuándo y por qué se despublicó", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const html = normalizado(await abrirDetalle(idPublicado));
    expect(html).toContain(ETIQUETA_CUANDO_DESPUBLICO);
    expect(html).toContain(ETIQUETA_POR_QUE_DESPUBLICO);
    expect(html).toContain("El negocio cerró");
  });

  // Scenario: detalle de una ficha que nunca se despublicó
  it("un registro sin despublicación no pinta esos rótulos", async () => {
    conSesion();
    const html = normalizado(await abrirDetalle(idEnRevision));
    expect(html).not.toContain(ETIQUETA_CUANDO_DESPUBLICO);
    expect(html).not.toContain(ETIQUETA_POR_QUE_DESPUBLICO);
  });
});

describe("revision-admin · republicar no borra los giros en silencio", () => {
  // Scenario: republicar conserva los giros
  it("tras despublicar, el formulario de aprobar llega con los 3 giros marcados", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const html = await abrirDetalle(idPublicado);
    expect(girosMarcados(html).sort()).toEqual([...girosIds].sort());
  });

  it("aprobar sin tocar nada conserva los 3 giros y estrena fecha de publicación", async () => {
    conSesion();
    const antes = (await leer(idPublicado))!.publicadoEn!;
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const datos = formulario({ origen: "siembra" });
    for (const giroId of girosIds) datos.append("giro", String(giroId));
    await urlDeRedireccion(() => aprobarRegistroAccion(idPublicado, datos));

    const negocio = await leer(idPublicado);
    expect(negocio?.estado).toBe("publicado");
    expect(negocio?.giros.map((giro) => giro.id).sort()).toEqual([...girosIds].sort());
    expect(negocio!.publicadoEn!.getTime()).toBeGreaterThan(antes.getTime());
    // El rastro de la despublicación no se limpia: es historia del panel.
    expect(negocio?.motivoDespublicacion).toBe("El negocio cerró");
  });

  it("un registro nuevo sigue llegando sin ningún giro marcado", async () => {
    conSesion();
    const html = await abrirDetalle(idEnRevision);
    expect(girosMarcados(html)).toEqual([]);
  });
});

describe("revision-admin · la cola marca las fichas que llegaron por una despublicación", () => {
  // Scenario: una ficha despublicada aparece marcada y con su espera nueva
  it("la despublicada trae la etiqueta y no nace atrasada; los renglones normales no cambian", async () => {
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "El negocio cerró" })),
    );

    const html = normalizado(await render(ColaAdminPage() as Promise<React.ReactElement>));

    expect(html).toContain(ETIQUETA_COLA_DESPUBLICADA);
    expect(html).toContain(NOMBRE_PUBLICADO);
    expect(html).toContain("Yoga Ficticia Luna");
    // Registrada en enero, pero despublicada hace un instante: no atrasada.
    expect(html).not.toContain(TEXTO_INDICADOR_ATRASADO);
    // El renglón del alta nueva no estrena etiqueta.
    expect(html.match(new RegExp(ETIQUETA_COLA_DESPUBLICADA, "g"))).toHaveLength(1);
  });
});

describe("revision-admin · sin sesión no se despublica, no se borra y no se confirma nada", () => {
  // Scenario: despublicar sin sesión
  it("despublicar sin cookie deja la ficha publicada y no responde nada del negocio", async () => {
    const url = await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo: "Motivo sin sesión" })),
    );
    expect(url).toBe("/admin");
    expect(url).not.toContain(idPublicado);

    const negocio = await leer(idPublicado);
    expect(negocio?.estado).toBe("publicado");
    expect(negocio?.despublicadoEn).toBeNull();
    expect(negocio?.motivoDespublicacion).toBeNull();
  });

  // Scenario: borrar sin sesión
  it("borrar sin cookie, con la palabra correcta y todo, deja el registro completo", async () => {
    const url = await urlDeRedireccion(() =>
      borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
    );
    expect(url).toBe("/admin");
    expect(await leer(idPublicado)).not.toBeNull();
  });

  // Scenario: la pantalla de confirmación sin sesión
  it.each([
    ["un registro que existe", () => idPublicado],
    ["un identificador inventado", () => "no-existe-este-id"],
  ])(
    "la pantalla de confirmación de %s manda al acceso sin revelar si existe",
    async (_caso, obtenerId) => {
      expect(await urlDeRedireccion(() => abrirConfirmacionBorrado(obtenerId()))).toBe(
        "/admin",
      );
    },
  );

  it("la confirmación de la despublicación y la del borrado hecho también exigen sesión", async () => {
    expect(await urlDeRedireccion(() => abrirDespublicado(idPublicado))).toBe("/admin");
    expect(await urlDeRedireccion(() => abrirBorradoHecho({ resultado: "borrado" }))).toBe(
      "/admin",
    );
  });
});

describe("revision-admin · ni la despublicación ni el borrado escriben datos en el log", () => {
  // Scenario: la confirmación del borrado no filtra nada
  it("nada de lo que pasa por las dos acciones aparece en la salida del servidor", async () => {
    conSesion();
    const capturado: string[] = [];
    for (const nivel of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        capturado.push(args.map(String).join(" "));
      });
    }

    const negocio = await leer(idPublicado);
    const motivo = "El dueño nos pidió por WhatsApp que la bajáramos";

    await urlDeRedireccion(() =>
      despublicarRegistroAccion(idPublicado, formulario({ motivo })),
    );
    await abrirDespublicado(idPublicado);
    await abrirConfirmacionBorrado(idPublicado);
    await urlDeRedireccion(() =>
      borrarRegistroAccion(idPublicado, formulario({ confirmarBorrado: "BORRAR" })),
    );
    await abrirBorradoHecho({ resultado: "borrado" });

    const salida = capturado.join("\n");
    for (const dato of [
      NOMBRE_PUBLICADO,
      negocio!.whatsapp,
      negocio!.telefonoFijo!,
      negocio!.direccion!,
      motivo,
    ]) {
      expect(salida, `el log filtra ${dato}`).not.toContain(dato);
    }
  });
});
