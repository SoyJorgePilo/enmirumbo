import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import BuscarPage from "../src/app/(publico)/buscar/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import Home from "../src/app/(publico)/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { obtenerNegocioPublicado } from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { slugify } from "../src/lib/slug";
import { huellaDeToken } from "../src/lib/gestion/token";
import { crearClientePrueba } from "./db";

/**
 * Spec `directorio-publico` (delta del change `agregar-enlace-de-gestion`) ·
 * Requirements "Una edición esperando revisión no se asoma a ninguna
 * superficie pública" y "Se publica la colonia, nunca el domicilio exacto ni
 * los datos internos de la ficha" (tasks.md #30).
 *
 * Un negocio publicado CON enlace de gestión y CON una edición pendiente que
 * le cambia el nombre, el horario y el teléfono. Ninguna superficie pública
 * —home, listado, filtro por colonia, ficha, resultados de búsqueda— puede
 * mostrar un valor propuesto, la huella del enlace, una URL de edición ni
 * ninguna señal de que hay cambios esperando.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771000 5xxx.
 */

const PREFIJO = "7710005";

/** Lo que el vecino SÍ debe seguir viendo (lo publicado). */
const PUBLICADO = {
  nombre: "Estética Ficticia Lupita",
  queOfreces: "Corte y peinado inventado",
  telefonoFijo: "7717775001",
  horario: "L-S 10am-7pm",
  direccion: "Andador inventado 3",
};

/** Lo que el dueño propuso y que NO puede asomarse a ningún lado. */
const PROPUESTO = {
  nombre: "Estética Ficticia Lupita y Asociados",
  queOfreces: "Corte, peinado y uñas inventadas",
  telefonoFijo: "7717779999",
  horario: "L-D 8am-11pm",
  direccion: "Otro andador inventado 99",
};

const HUELLA = huellaDeToken("token-ficticio-de-privacidad");

let prisma: PrismaClient;
let idConEdicion = "";
let idSinEdicion = "";
let categoriaSlug = "";
let coloniaSlug = "";

async function renderHome(): Promise<string> {
  const elemento = await Home();
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderListado(destino: string, colonia?: string): Promise<string> {
  const elemento = await ListadoCategoriaPage({
    params: Promise.resolve({ destino }),
    searchParams: Promise.resolve(colonia === undefined ? {} : { colonia }),
  } as Parameters<typeof ListadoCategoriaPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderFicha(segmento: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: segmento }),
    searchParams: Promise.resolve({}),
  } as Parameters<typeof FichaNegocioPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderBuscar(q: string): Promise<string> {
  const elemento = await BuscarPage({
    searchParams: Promise.resolve({ q }),
  } as unknown as Parameters<typeof BuscarPage>[0]);
  return renderToStaticMarkup(createElement(() => elemento));
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  const categoria = await prisma.categoria.findUniqueOrThrow({
    where: { slug: "belleza" },
  });
  const colonia = await prisma.colonia.findUniqueOrThrow({
    where: { slug: "haciendas-de-tizayuca" },
  });
  categoriaSlug = categoria.slug;
  coloniaSlug = colonia.slug;

  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  const conEdicion = await prisma.negocio.create({
    data: {
      ...PUBLICADO,
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      whatsapp: `${PREFIJO}001`,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      origen: "organico",
      nombreNormalizado: "estetica ficticia lupita",
      queOfrecesNormalizado: "corte y peinado inventado",
      tokenGestionHash: HUELLA,
      tokenGestionCreadoEn: new Date("2026-08-02T10:00:00.000Z"),
    },
  });
  idConEdicion = conEdicion.id;

  const sinEdicion = await prisma.negocio.create({
    data: {
      ...PUBLICADO,
      nombre: "Estética Ficticia Sin Cambios",
      telefonoFijo: "7717775002",
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      whatsapp: `${PREFIJO}002`,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      origen: "organico",
      nombreNormalizado: "estetica ficticia sin cambios",
      queOfrecesNormalizado: "corte y peinado inventado",
    },
  });
  idSinEdicion = sinEdicion.id;

  await prisma.edicionPendiente.create({
    data: {
      negocioId: idConEdicion,
      ...PROPUESTO,
      // El número propuesto es el mismo: lo que cambia son nombre, horario y
      // teléfono (los tres del scenario).
      whatsapp: `${PREFIJO}001`,
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      entregaADomicilio: true,
    },
  });
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("directorio-publico · una edición pendiente no se asoma a nada público", () => {
  // Scenario: la ficha sigue mostrando lo publicado
  it("ninguna superficie pública contiene un valor propuesto", async () => {
    const segmento = construirSegmentoFicha(PUBLICADO.nombre, idConEdicion);
    const superficies = {
      home: await renderHome(),
      listado: await renderListado(categoriaSlug),
      filtro: await renderListado(categoriaSlug, coloniaSlug),
      ficha: await renderFicha(segmento),
      busqueda: await renderBuscar("estetica"),
    };

    for (const [donde, html] of Object.entries(superficies)) {
      for (const propuesto of Object.values(PROPUESTO)) {
        expect(html, `${donde} filtra «${propuesto}»`).not.toContain(propuesto);
      }
      // Ni la huella, ni una URL de edición, ni el nombre de la tabla.
      expect(html, donde).not.toContain(HUELLA);
      expect(html, donde).not.toContain("/editar/");
      expect(html, donde).not.toContain("EdicionPendiente");
      expect(html, donde).not.toContain("edicionPendiente");
      expect(html, donde).not.toContain("tokenGestion");
    }

    // Y lo publicado sí se ve, para que lo de arriba signifique algo.
    expect(superficies.ficha).toContain(PUBLICADO.horario);
    expect(superficies.ficha).toContain(PUBLICADO.nombre);
  });

  // Scenario: la búsqueda no encuentra lo propuesto
  it("la búsqueda no lo encuentra por lo propuesto y sí por lo publicado", async () => {
    expect(await renderBuscar("asociados")).not.toContain(PUBLICADO.nombre);
    expect(await renderBuscar("estetica")).toContain(PUBLICADO.nombre);
  });

  // Scenario: nada delata que hay cambios esperando
  it("la ficha con edición pendiente no se distingue de una sin ella", async () => {
    const conEdicion = await renderFicha(
      construirSegmentoFicha(PUBLICADO.nombre, idConEdicion),
    );
    const sinEdicion = await renderFicha(
      construirSegmentoFicha("Estética Ficticia Sin Cambios", idSinEdicion),
    );

    // Se comparan las dos fichas quitando lo que legítimamente las diferencia
    // (nombre, id y teléfono): lo que queda tiene que ser idéntico. Cualquier
    // etiqueta, aviso o marca de "hay cambios en revisión" rompería esto.
    const neutral = (
      html: string,
      nombre: string,
      id: string,
      telefono: string,
      whatsapp: string,
    ) =>
      html
        .replaceAll(nombre, "NEGOCIO")
        // También codificado: el nombre viaja dentro de los `wa.me`
        // prellenados (contactar al negocio y —si `WHATSAPP_ADMIN` está
        // configurado— "Perdí mi enlace"). Sin esto la comparación dependería
        // del entorno, que es justo lo contrario de lo que este test afirma.
        .replaceAll(encodeURIComponent(nombre), "NEGOCIO_CODIFICADO")
        .replaceAll(slugify(nombre), "SLUG")
        .replaceAll(id, "ID")
        .replaceAll(telefono, "TELEFONO")
        .replaceAll(encodeURIComponent(telefono), "TELEFONO")
        .replaceAll(whatsapp, "WHATSAPP");

    expect(
      neutral(
        conEdicion,
        PUBLICADO.nombre,
        idConEdicion,
        PUBLICADO.telefonoFijo,
        `${PREFIJO}001`,
      ),
    ).toBe(
      neutral(
        sinEdicion,
        "Estética Ficticia Sin Cambios",
        idSinEdicion,
        "7717775002",
        `${PREFIJO}002`,
      ),
    );
  });

  // Scenario: sin datos internos en la respuesta
  it("la consulta pública no devuelve la huella del enlace ni nada de la edición", async () => {
    const publicado = await obtenerNegocioPublicado(idConEdicion);
    expect(publicado).not.toBeNull();
    for (const campo of [
      "tokenGestionHash",
      "tokenGestionCreadoEn",
      "ediciones",
      "estado",
      "origen",
      "registradoEn",
      "consintioAvisoEn",
    ]) {
      expect(Object.keys(publicado!), campo).not.toContain(campo);
    }
  });
});
