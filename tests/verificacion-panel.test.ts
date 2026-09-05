import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { DetalleRegistro } from "../src/components/admin/detalle-registro";
import { TarjetaCola } from "../src/components/admin/tarjeta-cola";
import {
  contarAtrasados,
  obtenerColaDeRevision,
  obtenerRegistroParaPanel,
  type RegistroAdminDetalle,
} from "../src/lib/admin/consultas";
import {
  ETIQUETA_COLA_NUMERO_VERIFICADO_SMS,
  TEXTO_SIN_VERIFICAR_SMS,
  textoNumeroVerificadoSms,
} from "../src/lib/verificacion/textos";
import { crearClientePrueba } from "./db";

/**
 * Spec `revision-admin` (MODIFIED por T-016) · "Cola de revisión…" gana la
 * etiqueta del renglón verificado y "Detalle del registro…" gana las dos
 * líneas de verificación con su regla de aparición (tasks.md #15 y #16).
 *
 * Lo que estas pruebas fijan, además del copy: que la verificación **no
 * adelanta ninguna decisión**. Aprobar y rechazar siguen ahí, con los mismos
 * rótulos, y ninguna ficha se publica por haber verificado su número.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771996xxxx.
 */

const AHORA = new Date("2026-09-05T12:00:00.000Z");
const VERIFICADO_EN = new Date("2026-09-04T18:00:00.000Z");
const PREFIJO = "771996";

/** El mismo formateador que usa el detalle para la constancia (T-012). */
const FORMATO_FECHA_PANEL = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

let prisma: PrismaClient;
let categoriaId: number;

async function alta(
  whatsapp: string,
  nombre: string,
  numeroVerificadoEn: Date | null,
  registradoEn = new Date(AHORA.getTime() - 60 * 60 * 1000),
): Promise<string> {
  const negocio = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      consintioAvisoEn: registradoEn,
      registradoEn,
      numeroVerificadoEn,
    },
    select: { id: true },
  });
  return negocio.id;
}

const pintar = (elemento: React.ReactElement) => renderToStaticMarkup(elemento);

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

describe("revision-admin · la cola marca el renglón verificado", () => {
  // Scenario: renglón con el número verificado
  it("la etiqueta aparece SOLO en la ficha verificada, sin cambiar el orden", async () => {
    const hace3h = new Date(AHORA.getTime() - 3 * 60 * 60 * 1000);
    const hace1h = new Date(AHORA.getTime() - 1 * 60 * 60 * 1000);
    await alta(`${PREFIJO}0001`, "Panadería Ficticia La Hogaza", null, hace3h);
    await alta(`${PREFIJO}0002`, "Cerrajería Ficticia El Duplicado", VERIFICADO_EN, hace1h);

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola.map((r) => r.nombre)).toEqual([
      "Panadería Ficticia La Hogaza",
      "Cerrajería Ficticia El Duplicado",
    ]);
    expect(cola[0].numeroVerificadoEn).toBeNull();
    expect(cola[1].numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());
    // Ni el orden ni el conteo de atrasados cambian por la verificación.
    expect(contarAtrasados(cola)).toBe(0);

    const html = cola.map((renglon) => pintar(createElement(TarjetaCola, renglon)));
    expect(html[0]).not.toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);
    expect(html[1]).toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);
  });

  // Scenario: la cola del lanzamiento no cambia
  it("sin fichas verificadas ningún renglón menciona la verificación", async () => {
    await alta(`${PREFIJO}0003`, "Taller Ficticio El Perno", null);
    const cola = await obtenerColaDeRevision(prisma, AHORA);
    for (const renglon of cola) {
      const html = pintar(createElement(TarjetaCola, renglon));
      expect(html).not.toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);
      expect(html.toLowerCase()).not.toContain("verificad");
      expect(html.toLowerCase()).not.toContain("sms");
    }
  });

  it("un renglón de edición no trae la etiqueta ni un hueco en su lugar", async () => {
    const id = await alta(`${PREFIJO}0004`, "Estética Ficticia El Rulo", VERIFICADO_EN);
    await prisma.negocio.update({
      where: { id },
      data: { estado: "publicado", publicadoEn: AHORA },
    });
    await prisma.edicionPendiente.create({
      data: {
        negocioId: id,
        nombre: "Estética Ficticia El Rulo (nuevo)",
        categoriaId,
        whatsapp: `${PREFIJO}0004`,
        creadaEn: AHORA,
      },
    });

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toHaveLength(1);
    expect(cola[0].tipo).toBe("edicion");
    const html = pintar(createElement(TarjetaCola, cola[0]));
    expect(html).not.toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);
  });
});

describe("revision-admin · el detalle dice si el número está verificado", () => {
  const detalleDe = async (id: string): Promise<RegistroAdminDetalle> => {
    const registro = await obtenerRegistroParaPanel(prisma, id);
    if (!registro) throw new Error("no se encontró el registro de la prueba");
    return registro;
  };

  // Scenario: registro con el número verificado
  it("con fecha, la línea aparece SIEMPRE, con la capacidad encendida o apagada", async () => {
    const id = await alta(`${PREFIJO}0010`, "Veterinaria Ficticia El Colmillo", VERIFICADO_EN);
    const registro = await detalleDe(id);
    expect(registro.numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());

    // Scenario: la verificación no se borra al apagar la bandera
    for (const encendida of [true, false]) {
      const html = pintar(
        createElement(DetalleRegistro, {
          registro,
          capacidadVerificacionSmsEncendida: encendida,
        }),
      );
      // La fecha va "con la misma forma que la constancia del
      // consentimiento", que es lo que el requirement fija entre paréntesis:
      // el `FORMATO_FECHA` que ya usa el detalle (`04 sep 2026, 12:00 p.m.`),
      // no una segunda forma solo para esta línea. El ejemplo en prosa de la
      // spec ("4 de septiembre de 2026") describe la fecha, no un formateador
      // distinto del que el panel viene usando desde T-012.
      expect(html, `encendida=${encendida}`).toContain("Número verificado por SMS el ");
      expect(html, `encendida=${encendida}`).toContain(
        textoNumeroVerificadoSms(FORMATO_FECHA_PANEL.format(VERIFICADO_EN)),
      );
      expect(html).not.toContain(TEXTO_SIN_VERIFICAR_SMS);
      // Y el WhatsApp sigue estando, con su rótulo de siempre.
      expect(html).toContain("WhatsApp");
      expect(html).toContain(`${PREFIJO}0010`);
    }
  });

  // Scenario: registro sin verificar con la capacidad encendida
  it("sin fecha y con la capacidad encendida, la línea de 'Sin verificar'", async () => {
    const id = await alta(`${PREFIJO}0011`, "Fonda Ficticia El Guiso", null);
    const html = pintar(
      createElement(DetalleRegistro, {
        registro: await detalleDe(id),
        capacidadVerificacionSmsEncendida: true,
      }),
    );
    expect(html).toContain(TEXTO_SIN_VERIFICAR_SMS);
  });

  // Scenario: el detalle del lanzamiento no cambia
  it("sin fecha y con la capacidad apagada, ninguna de las dos líneas", async () => {
    const id = await alta(`${PREFIJO}0012`, "Ferretería Ficticia El Clavo", null);
    const registro = await detalleDe(id);
    const apagada = pintar(
      createElement(DetalleRegistro, {
        registro,
        capacidadVerificacionSmsEncendida: false,
      }),
    );
    expect(apagada).not.toContain(TEXTO_SIN_VERIFICAR_SMS);
    expect(apagada).not.toContain("Número verificado por SMS");
    expect(apagada.toLowerCase()).not.toContain("sms");

    // Y es EXACTAMENTE el mismo HTML que sin la prop (el detalle de hoy).
    const deHoy = pintar(createElement(DetalleRegistro, { registro }));
    expect(apagada).toBe(deHoy);
  });

  // Scenario: verificar no adelanta la decisión
  it("una ficha verificada sigue en revisión y sin publicar", async () => {
    const id = await alta(`${PREFIJO}0013`, "Papelería Ficticia El Renglón", VERIFICADO_EN);
    const registro = await detalleDe(id);
    expect(registro.estado).toBe("en_revision");
    expect(registro.publicadoEn).toBeNull();
    expect(registro.girosIds).toEqual([]);
  });
});
