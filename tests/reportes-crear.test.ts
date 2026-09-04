import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearReporte } from "../src/lib/reportes/crear";
import {
  TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
  registrarReporteEnCupo,
  reiniciarCupoDeReportes,
} from "../src/lib/reportes/limite";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico · Requirements "El servidor valida el motivo y el
// comentario del reporte", "Anti-abuso del reporte sin captcha…" y "Del
// reportante no se pide ni se guarda ningún dato" (tasks.md #5).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 7xxx.

const PREFIJO = "7710007";
const IP = "203.0.113.20"; // TEST-NET-3, reservado para documentación

let prisma: PrismaClient;
let categoriaId: number;
let idPublicado = "";
let idEnRevision = "";
let idRechazado = "";

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

/** Entrada mínima de un reporte legítimo; cada test cambia lo que le importa. */
function entrada(cambios: Partial<Parameters<typeof crearReporte>[1]> = {}) {
  return {
    negocioId: idPublicado,
    motivo: "cerrado" as unknown,
    comentario: "",
    trampa: "",
    ip: IP,
    ...cambios,
  };
}

const totalDeReportes = () => prisma.reporte.count();

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idPublicado = await alta("Tortería Ficticia El Semáforo", `${PREFIJO}001`, "publicado");
  idEnRevision = await alta("Estética Ficticia La Trenza", `${PREFIJO}002`, "en_revision");
  idRechazado = await alta("Préstamos Ficticios Express", `${PREFIJO}003`, "rechazado");
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarCupoDeReportes();
  await prisma.reporte.deleteMany();
  vi.restoreAllMocks();
});

describe("reportes · un reporte legítimo se guarda", () => {
  // Scenario: reporte enviado
  it("crea la fila con motivo, estado pendiente y sin comentario", async () => {
    expect(await crearReporte(prisma, entrada())).toEqual({ resultado: "creado" });

    const guardados = await prisma.reporte.findMany();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].negocioId).toBe(idPublicado);
    expect(guardados[0].motivo).toBe("cerrado");
    expect(guardados[0].comentario).toBeNull();
    expect(guardados[0].estado).toBe("pendiente");
    expect(guardados[0].atendidoEn).toBeNull();
  });

  it.each(["cerrado", "no_real", "datos_incorrectos", "inapropiado"])(
    "acepta el motivo %s de la lista cerrada",
    async (motivo) => {
      expect(await crearReporte(prisma, entrada({ motivo }))).toEqual({
        resultado: "creado",
      });
      expect((await prisma.reporte.findMany())[0].motivo).toBe(motivo);
    },
  );

  // Scenario: comentario que parece marcado
  it("guarda el comentario tal cual, sin sanear el marcado", async () => {
    const texto = "<script>alert(1)</script>";
    expect(await crearReporte(prisma, entrada({ comentario: texto }))).toEqual({
      resultado: "creado",
    });
    expect((await prisma.reporte.findMany())[0].comentario).toBe(texto);
  });

  // Scenario: comentario de puros espacios
  it("un comentario de puros espacios queda como sin comentario", async () => {
    expect(await crearReporte(prisma, entrada({ comentario: "   \n\t  " }))).toEqual({
      resultado: "creado",
    });
    expect((await prisma.reporte.findMany())[0].comentario).toBeNull();
  });

  it("recorta los espacios de alrededor del comentario", async () => {
    await crearReporte(prisma, entrada({ comentario: "  ya cerró desde julio  " }));
    expect((await prisma.reporte.findMany())[0].comentario).toBe("ya cerró desde julio");
  });

  it("un comentario de exactamente 300 caracteres cabe", async () => {
    const justo = "a".repeat(300);
    expect(await crearReporte(prisma, entrada({ comentario: justo }))).toEqual({
      resultado: "creado",
    });
    expect((await prisma.reporte.findMany())[0].comentario).toBe(justo);
  });

  // Scenario: la confirmación no cuenta nada del negocio
  it("varios reportes sobre el mismo negocio dan el mismo resultado", async () => {
    for (let i = 0; i < 3; i++) {
      reiniciarCupoDeReportes();
      expect(await crearReporte(prisma, entrada())).toEqual({ resultado: "creado" });
    }
    expect(await totalDeReportes()).toBe(3);
  });
});

describe("reportes · validación del motivo y del comentario", () => {
  // Scenario: envío sin elegir motivo + Scenario: motivo fuera de la lista
  it.each([
    ["sin motivo", undefined],
    ["motivo vacío", ""],
    ["motivo inventado", "me cae mal"],
    ["motivo repetido (arreglo)", ["cerrado", "no_real"]],
    ["motivo con otra caja", "Cerrado"],
  ])("%s no guarda nada y devuelve el error de motivo", async (_caso, motivo) => {
    expect(await crearReporte(prisma, entrada({ motivo }))).toEqual({
      resultado: "error",
      error: "motivo",
    });
    expect(await totalDeReportes()).toBe(0);
  });

  // Scenario: comentario demasiado largo
  it("un comentario de 301 caracteres no guarda nada", async () => {
    expect(
      await crearReporte(prisma, entrada({ comentario: "a".repeat(301) })),
    ).toEqual({ resultado: "error", error: "comentario" });
    expect(await totalDeReportes()).toBe(0);
  });

  it("un comentario larguísimo tampoco revienta el servidor", async () => {
    expect(
      await crearReporte(prisma, entrada({ comentario: "a".repeat(200_000) })),
    ).toEqual({ resultado: "error", error: "comentario" });
    expect(await totalDeReportes()).toBe(0);
  });

  it("el motivo se valida antes que el comentario largo (no delata el orden)", async () => {
    expect(
      await crearReporte(
        prisma,
        entrada({ motivo: "inventado", comentario: "a".repeat(500) }),
      ),
    ).toEqual({ resultado: "error", error: "motivo" });
    expect(await totalDeReportes()).toBe(0);
  });
});

describe("reportes · solo sobre negocios publicados", () => {
  // Scenario: reportar un negocio que no está publicado
  it.each([
    ["en revisión", () => idEnRevision],
    ["rechazado", () => idRechazado],
    ["un id que no existe", () => "id-que-no-existe-jamas"],
    ["id vacío", () => ""],
  ])("%s responde no encontrado, igual para los tres", async (_caso, id) => {
    expect(await crearReporte(prisma, entrada({ negocioId: id() }))).toEqual({
      resultado: "no-encontrado",
    });
    expect(await totalDeReportes()).toBe(0);
  });
});

describe("reportes · anti-abuso", () => {
  // Scenario: bot que llena el honeypot
  it("el honeypot lleno no guarda nada y devuelve el descarte silencioso", async () => {
    expect(await crearReporte(prisma, entrada({ trampa: "http://spam.example" }))).toEqual(
      { resultado: "descartado-silencioso" },
    );
    expect(await totalDeReportes()).toBe(0);
  });

  it("el honeypot se revisa antes que nada: ni con motivo inválido delata", async () => {
    expect(
      await crearReporte(
        prisma,
        entrada({ trampa: "x", motivo: "inventado", negocioId: "no-existe" }),
      ),
    ).toEqual({ resultado: "descartado-silencioso" });
    expect(await totalDeReportes()).toBe(0);
  });

  // Scenario: cupo por IP agotado
  it("el cuarto reporte de la hora desde la misma IP no guarda nada", async () => {
    const ahora = new Date("2026-09-04T12:00:00Z");
    for (let i = 0; i < 3; i++) {
      expect(await crearReporte(prisma, entrada({ ahora }))).toEqual({
        resultado: "creado",
      });
    }
    expect(await crearReporte(prisma, entrada({ ahora }))).toEqual({
      resultado: "cupo-agotado",
    });
    expect(await totalDeReportes()).toBe(3);
  });

  // Scenario: sin encabezado de IP declarado
  it("sin IP conocida el cupo no bloquea, pero el honeypot sigue operando", async () => {
    for (let i = 0; i < 6; i++) {
      expect(await crearReporte(prisma, entrada({ ip: null }))).toEqual({
        resultado: "creado",
      });
    }
    expect(await totalDeReportes()).toBe(6);
    expect(
      await crearReporte(prisma, entrada({ ip: null, trampa: "bot" })),
    ).toEqual({ resultado: "descartado-silencioso" });
    expect(await totalDeReportes()).toBe(6);
  });

  it("un envío bloqueado por el cupo no gasta cupo de nadie más", async () => {
    const ahora = new Date("2026-09-04T12:00:00Z");
    registrarReporteEnCupo(IP, ahora);
    registrarReporteEnCupo(IP, ahora);
    registrarReporteEnCupo(IP, ahora);
    expect(await crearReporte(prisma, entrada({ ahora }))).toEqual({
      resultado: "cupo-agotado",
    });
    expect(
      await crearReporte(prisma, entrada({ ip: "198.51.100.9", ahora })),
    ).toEqual({ resultado: "creado" });
  });

  // Scenario: negocio con el tope de pendientes alcanzado
  it("pasado el tope de pendientes deja de guardar, sin decírselo a nadie", async () => {
    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
      })),
    });

    expect(await crearReporte(prisma, entrada())).toEqual({
      resultado: "descartado-silencioso",
    });
    expect(await totalDeReportes()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
  });

  it("el tope cuenta solo pendientes: atender uno vuelve a abrir la ficha", async () => {
    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
      })),
    });
    const alguno = (await prisma.reporte.findFirst())!;
    await prisma.reporte.update({
      where: { id: alguno.id },
      data: { estado: "atendido", atendidoEn: new Date() },
    });

    expect(await crearReporte(prisma, entrada())).toEqual({ resultado: "creado" });
    expect(await totalDeReportes()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO + 1);
  });

  it("el tope es por negocio: otra ficha sigue admitiendo reportes", async () => {
    const otroId = await alta(
      "Panadería Ficticia La Espiga",
      `${PREFIJO}004`,
      "publicado",
    );
    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
      })),
    });

    expect(await crearReporte(prisma, entrada({ negocioId: otroId }))).toEqual({
      resultado: "creado",
    });
  });
});

// Iteración 2 (hallazgos A1, A2 y M1 de la etapa C): las dos defensas de
// volumen tienen que valer también cuando las peticiones llegan juntas, que es
// lo que hace cualquier cliente HTTP/2 sin proponérselo.
describe("reportes · las defensas aguantan peticiones simultáneas", () => {
  it("catorce altas simultáneas sobre la misma ficha dejan exactamente el tope", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 14 }, () => crearReporte(prisma, entrada({ ip: null }))),
    );

    expect(await totalDeReportes()).toBe(TOPE_REPORTES_PENDIENTES_POR_NEGOCIO);
    expect(resultados.filter((r) => r.resultado === "creado")).toHaveLength(
      TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
    );
    // Los cuatro sobrantes se descartan en silencio: misma respuesta que un
    // reporte guardado de cara al vecino.
    expect(resultados.filter((r) => r.resultado === "descartado-silencioso")).toHaveLength(4);
  });

  it("ocho altas simultáneas desde la misma IP solo gastan el cupo de tres", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => crearReporte(prisma, entrada())),
    );

    expect(await totalDeReportes()).toBe(3);
    expect(resultados.filter((r) => r.resultado === "creado")).toHaveLength(3);
    expect(resultados.filter((r) => r.resultado === "cupo-agotado")).toHaveLength(5);
  });

  it("cada IP conserva su cupo aunque lleguen todas a la vez", async () => {
    const ips = ["203.0.113.21", "203.0.113.22", "203.0.113.23"];
    const resultados = await Promise.all(
      ips.flatMap((ip) =>
        Array.from({ length: 4 }, () => crearReporte(prisma, entrada({ ip }))),
      ),
    );

    expect(resultados.filter((r) => r.resultado === "creado")).toHaveLength(9); // 3 por IP
    expect(resultados.filter((r) => r.resultado === "cupo-agotado")).toHaveLength(3);
  });
});

describe("reportes · el campo trampa se compara sin espacios (hallazgo M1)", () => {
  it.each([
    ["un espacio", " "],
    ["varios espacios", "    "],
    ["tabulador y salto de línea", "\t\n"],
  ])("%s en la trampa NO tira el reporte de una persona", async (_caso, trampa) => {
    expect(await crearReporte(prisma, entrada({ trampa }))).toEqual({ resultado: "creado" });
    expect(await totalDeReportes()).toBe(1);
  });

  it.each([
    ["texto", "http://spam.example"],
    ["texto con espacios alrededor", "  spam  "],
  ])("%s en la trampa sí descarta, en silencio", async (_caso, trampa) => {
    expect(await crearReporte(prisma, entrada({ trampa }))).toEqual({
      resultado: "descartado-silencioso",
    });
    expect(await totalDeReportes()).toBe(0);
  });
});

describe("reportes · fallas del servidor", () => {
  it("si la escritura falla, el vecino ve el error de guardado y no hay fila", async () => {
    const roto = {
      negocio: prisma.negocio,
      $executeRaw: () => Promise.reject(new Error("base caída")),
    } as unknown as PrismaClient;

    expect(await crearReporte(roto, entrada())).toEqual({
      resultado: "error",
      error: "servidor",
    });
    expect(await totalDeReportes()).toBe(0);
  });

  // El alta es un `INSERT` condicionado: 0 filas escritas significa "el
  // negocio ya estaba en el tope", y eso NO es un error, es el descarte
  // silencioso. Se fija aquí para que nadie confunda los dos caminos.
  it("cero filas escritas se responde como descarte silencioso, no como error", async () => {
    const alTope = {
      negocio: prisma.negocio,
      $executeRaw: () => Promise.resolve(0),
    } as unknown as PrismaClient;

    expect(await crearReporte(alTope, entrada())).toEqual({
      resultado: "descartado-silencioso",
    });
    expect(await totalDeReportes()).toBe(0);
  });

  it("si la lectura del negocio falla, tampoco revienta", async () => {
    const roto = {
      negocio: { findUnique: () => Promise.reject(new Error("base caída")) },
      reporte: prisma.reporte,
    } as unknown as PrismaClient;

    expect(await crearReporte(roto, entrada())).toEqual({
      resultado: "error",
      error: "servidor",
    });
    expect(await totalDeReportes()).toBe(0);
  });
});
