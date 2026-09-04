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
import { reportarNegocio } from "../src/app/negocio/[ficha]/reportar/accion";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { TOPE_REPORTES_PENDIENTES_POR_NEGOCIO, reiniciarCupoDeReportes } from "../src/lib/reportes/limite";
import {
  NoEncontradoSimulado,
  RedireccionSimulada,
  peticion,
  reiniciarPeticion,
} from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * Pruebas ADVERSARIALES del botón "Reportar" (tasks.md #15). No repiten el
 * camino feliz: mandan al servidor lo que el formulario nunca manda —campos
 * repetidos, del ciclo de vida, archivos en vez de texto, payloads enormes— y
 * comprueban las tres cosas que la spec exige de cada uno: que no revienta,
 * que no escribe filas indebidas y que no delata el estado interno.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): números 771000 3xxx.
 */

const PREFIJO = "7710003";
const ENCABEZADO_IP = "x-forwarded-for";
const IP = "203.0.113.40"; // TEST-NET-3, reservado para documentación

let prisma: PrismaClient;
let categoriaId: number;
let idPublicado = "";
let idEnRevision = "";
let idRechazado = "";
let segmento = "";

const NOMBRE = "Papelería Ficticia El Lápiz";

async function alta(
  nombre: string,
  whatsapp: string,
  estado: "en_revision" | "publicado" | "rechazado",
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date(),
      estado,
      publicadoEn: estado === "publicado" ? new Date() : null,
    },
  });
  return creado.id;
}

/**
 * Manda el envío al servidor y devuelve a dónde mandó, o `"404"` si respondió
 * como no encontrado. Cualquier otra excepción se propaga: un error del
 * servidor (500) es exactamente lo que esta suite no debe permitir.
 */
async function respuestaDe(formData: FormData, id = idPublicado): Promise<string> {
  try {
    await reportarNegocio(id, formData);
  } catch (error) {
    if (error instanceof RedireccionSimulada) return error.url;
    if (error instanceof NoEncontradoSimulado) return "404";
    throw error;
  }
  throw new Error("se esperaba una redirección o un 404");
}

function envio(campos: Record<string, string | string[] | Blob> = {}): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    for (const uno of Array.isArray(valor) ? valor : [valor]) {
      formData.append(clave, uno as string);
    }
  }
  return formData;
}

const CONFIRMACION = () => `/negocio/${segmento}/reportar/gracias`;

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idPublicado = await alta(NOMBRE, `${PREFIJO}001`, "publicado");
  idEnRevision = await alta("Taller Ficticio La Llave", `${PREFIJO}002`, "en_revision");
  idRechazado = await alta("Casino Ficticio Suerte", `${PREFIJO}003`, "rechazado");
  segmento = construirSegmentoFicha(NOMBRE, idPublicado);
});

afterAll(async () => {
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarPeticion();
  reiniciarCupoDeReportes();
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await prisma.reporte.deleteMany();
});

describe("reportes adversarial · envíos que el formulario nunca manda", () => {
  it.each([
    ["sin ningún campo", {}],
    ["con el motivo inventado", { motivo: "porque-si" }],
    ["con el motivo repetido dos veces", { motivo: ["cerrado", "inapropiado"] }],
    ["con el mismo motivo repetido", { motivo: ["cerrado", "cerrado"] }],
    ["con el motivo vacío", { motivo: "" }],
    ["con el motivo en otra caja", { motivo: "CERRADO" }],
    ["con el motivo con espacios", { motivo: " cerrado " }],
    ["con el motivo gigantesco", { motivo: "x".repeat(100_000) }],
    ["con un motivo del ciclo interno", { motivo: "pendiente" }],
  ])("%s vuelve al formulario con el error de motivo y sin fila", async (_caso, campos) => {
    const destino = await respuestaDe(envio(campos));
    expect(destino).toContain("error=motivo");
    expect(await prisma.reporte.count()).toBe(0);
  });

  it("un archivo en vez de texto no revienta: cuenta como campo inválido", async () => {
    const formData = new FormData();
    formData.append("motivo", new Blob(["cerrado"]), "motivo.txt");
    formData.append("comentario", new Blob(["hola"]), "comentario.txt");

    expect(await respuestaDe(formData)).toContain("error=motivo");
    expect(await prisma.reporte.count()).toBe(0);
  });

  it("un comentario larguísimo no guarda nada ni devuelve el payload entero", async () => {
    const destino = await respuestaDe(
      envio({ motivo: "cerrado", comentario: "z".repeat(500_000) }),
    );
    expect(destino).toContain("error=comentario");
    expect(destino.length).toBeLessThan(600);
    expect(await prisma.reporte.count()).toBe(0);
  });

  it("un comentario de puros espacios se guarda como sin comentario", async () => {
    expect(await respuestaDe(envio({ motivo: "cerrado", comentario: "     " }))).toBe(
      CONFIRMACION(),
    );
    expect((await prisma.reporte.findMany())[0].comentario).toBeNull();
  });

  // El formulario público solo puede crear reportes `pendiente` y no toca el
  // negocio (spec revision-admin, requirement de sesión obligatoria).
  it("los campos del ciclo interno que vengan en el envío se ignoran", async () => {
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id: idPublicado } });

    expect(
      await respuestaDe(
        envio({
          motivo: "cerrado",
          estado: "atendido",
          atendidoEn: "2026-01-01T00:00:00.000Z",
          negocioId: idEnRevision,
          id: "reporte-elegido-por-el-cliente",
          creadoEn: "1999-01-01T00:00:00.000Z",
        }),
      ),
    ).toBe(CONFIRMACION());

    const guardados = await prisma.reporte.findMany();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].estado).toBe("pendiente");
    expect(guardados[0].atendidoEn).toBeNull();
    expect(guardados[0].negocioId).toBe(idPublicado);
    expect(guardados[0].id).not.toBe("reporte-elegido-por-el-cliente");
    expect(guardados[0].creadoEn.getFullYear()).toBeGreaterThan(2000);
    // Y el negocio no cambió en nada.
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id: idPublicado } })).toEqual(
      antes,
    );
  });
});

describe("reportes adversarial · las defensas no delatan nada", () => {
  it("honeypot y tope de pendientes responden EXACTAMENTE como un reporte bueno", async () => {
    const bueno = await respuestaDe(envio({ motivo: "cerrado" }));
    await prisma.reporte.deleteMany();
    reiniciarCupoDeReportes();

    const conTrampa = await respuestaDe(
      envio({ motivo: "cerrado", sitio_web: "http://spam.example" }),
    );
    expect(await prisma.reporte.count()).toBe(0);

    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
      })),
    });
    const conTope = await respuestaDe(envio({ motivo: "cerrado" }));

    expect(conTrampa).toBe(bueno);
    expect(conTope).toBe(bueno);
    expect(await prisma.reporte.count()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
  });

  it("el tope no se puede rebasar ni mandando muchos envíos seguidos", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    for (let i = 0; i < 25; i++) {
      // IP distinta en cada envío: se salta el cupo por IP a propósito, para
      // ver que el tope por negocio aguanta solo.
      peticion.encabezados[ENCABEZADO_IP] = `198.51.100.${i + 1}`;
      await respuestaDe(envio({ motivo: "cerrado" }));
    }
    expect(await prisma.reporte.count()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
  });

  // Scenario: reportar un negocio que no está publicado
  it.each([
    ["en revisión", () => idEnRevision],
    ["rechazado", () => idRechazado],
    ["un id inventado", () => "id-que-no-existe-jamas"],
    ["un id vacío", () => ""],
  ])("un envío contra %s responde el mismo 404, sin fila", async (_caso, id) => {
    expect(await respuestaDe(envio({ motivo: "cerrado" }), id())).toBe("404");
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario: sin encabezado de IP declarado
  it("sin la variable declarada el cupo no opera, pero las otras dos defensas sí", async () => {
    peticion.encabezados[ENCABEZADO_IP] = IP;
    peticion.encabezados["x-real-ip"] = IP;

    for (let i = 0; i < 8; i++) {
      expect(await respuestaDe(envio({ motivo: "cerrado" }))).toBe(CONFIRMACION());
    }
    expect(await prisma.reporte.count()).toBe(8);

    // Honeypot: sigue descartando.
    expect(await respuestaDe(envio({ motivo: "cerrado", sitio_web: "bot" }))).toBe(
      CONFIRMACION(),
    );
    expect(await prisma.reporte.count()).toBe(8);

    // Y el tope por negocio sigue siendo el techo.
    for (let i = 0; i < 5; i++) await respuestaDe(envio({ motivo: "cerrado" }));
    expect(await prisma.reporte.count()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
  });

  it("un encabezado de IP elegido por el cliente no le da cupo infinito ni se lo quita a otro", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    // Cadena de saltos: solo el último valor —el que pone el proxy de
    // confianza— cuenta, así que los inventados de la izquierda no cambian
    // de cupo al cliente.
    peticion.encabezados[ENCABEZADO_IP] = `1.2.3.4, 5.6.7.8, ${IP}`;
    for (let i = 0; i < 3; i++) {
      expect(await respuestaDe(envio({ motivo: "cerrado" }))).toBe(CONFIRMACION());
    }
    peticion.encabezados[ENCABEZADO_IP] = `9.9.9.9, ${IP}`;
    expect(await respuestaDe(envio({ motivo: "cerrado" }))).toContain("error=cupo");
    expect(await prisma.reporte.count()).toBe(3);
  });
});
