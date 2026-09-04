import { readdir } from "node:fs/promises";

import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Envoltura de `sharp` que anota con qué entrada se abre cada pipeline, para
 * poder contar cuántas veces se decodifica el ORIGINAL (scenario "el trabajo
 * por foto no se multiplica"). Envuelve al `sharp` de verdad: el
 * comportamiento probado sigue siendo el de producción.
 */
const espiaSharp = vi.hoisted(() => ({ entradas: [] as unknown[] }));

vi.mock("sharp", async (importarOriginal) => {
  const modulo = await importarOriginal<{ default: typeof import("sharp").default }>();
  const real = modulo.default;
  const envoltura = ((entrada?: unknown, opciones?: unknown) => {
    espiaSharp.entradas.push(entrada);
    return (real as unknown as (a?: unknown, b?: unknown) => unknown)(entrada, opciones);
  }) as unknown as typeof real;
  Object.assign(envoltura, real);
  return { ...modulo, default: envoltura };
});

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { directorioDeFotos } from "../src/lib/fotos/almacen";
import { procesarFoto } from "../src/lib/fotos/procesar";
import {
  MAXIMO_FOTOS_EN_PROCESO,
  conCupoDeImagen,
  fotosEnProceso,
} from "../src/lib/fotos/semaforo";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { MENSAJES_ERROR_FOTO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { archivoDeFormulario, jpegDePrueba } from "./fotos-fixtures";

// Spec `registro-negocio`, requirement "El trabajo de imagen tiene un techo y
// el que no cabe se va con un mensaje, no a una cola" (enmienda de la
// iteración 2, hallazgo A-1 de `reports/c-seguridad.md`).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719989xxx.

const AHORA = new Date("2026-09-04T12:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let jpeg: Buffer;

function formulario(whatsapp: string, extra: Record<string, string | File> = {}): FormData {
  const datos = new FormData();
  datos.set("nombre", "Lavandería Ficticia del Semáforo");
  datos.set("categoriaId", String(categoriaId));
  datos.set("whatsapp", whatsapp);
  datos.set("coloniaId", String(coloniaId));
  datos.set("horario", "L-S 9am-7pm");
  datos.set("consentimiento", "on");
  for (const [clave, valor] of Object.entries(extra)) datos.set(clave, valor);
  return datos;
}

async function archivosDelAlmacen(): Promise<string[]> {
  try {
    return (await readdir(directorioDeFotos())).sort();
  } catch {
    return [];
  }
}

/** Ocupa los N turnos del semáforo hasta que se llame a la función devuelta. */
function ocuparTodoElCupo(): () => void {
  let liberar!: () => void;
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  for (let i = 0; i < MAXIMO_FOTOS_EN_PROCESO; i++) {
    void conCupoDeImagen(() => espera);
  }
  return liberar;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;
  jpeg = await jpegDePrueba(1600, 1200);
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719989" } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719989" } } });
});

afterEach(() => {
  expect(fotosEnProceso(), "el semáforo quedó ocupado tras el test").toBe(0);
});

describe("el semáforo acota cuántas fotos se abren a la vez", () => {
  it("el tope es fijo, pequeño y no depende de cuántas peticiones lleguen", () => {
    expect(MAXIMO_FOTOS_EN_PROCESO).toBe(2);
    expect(fotosEnProceso()).toBe(0);
  });

  it("deja pasar hasta el tope y cuenta los que están dentro", async () => {
    const liberar = ocuparTodoElCupo();
    expect(fotosEnProceso()).toBe(MAXIMO_FOTOS_EN_PROCESO);

    // El siguiente NO entra, y no se queda esperando.
    const empezo = Date.now();
    const sobrante = await conCupoDeImagen(async () => "no debería ejecutarse");
    expect(sobrante).toEqual({ ok: false });
    expect(Date.now() - empezo).toBeLessThan(50);

    liberar();
    await new Promise((resolve) => setImmediate(resolve));
    expect(fotosEnProceso()).toBe(0);
  });

  it("libera el turno aunque el trabajo truene", async () => {
    await expect(
      conCupoDeImagen(async () => {
        throw new Error("truena a propósito");
      }),
    ).rejects.toThrow("truena a propósito");
    expect(fotosEnProceso()).toBe(0);
  });

  // Scenario: llegan más fotos de las que caben a la vez
  it("con el cupo lleno, procesar una foto se rechaza en vez de encolarse", async () => {
    const liberar = ocuparTodoElCupo();

    const resultado = await procesarFoto(jpeg);
    expect(resultado).toEqual({ ok: false, motivo: "servidorOcupado" });

    liberar();
    await new Promise((resolve) => setImmediate(resolve));
    // Y en cuanto se libera, la misma foto se procesa sin problema.
    expect((await procesarFoto(jpeg)).ok).toBe(true);
  });
});

describe("el envío que no cupo recibe el literal de la spec", () => {
  // Scenario: al que no cupo no se le pierde lo escrito
  it("no se crea ficha, no queda archivo y vuelve todo lo capturado", async () => {
    const antes = await archivosDelAlmacen();
    const liberar = ocuparTodoElCupo();

    const resultado = await procesarRegistro(
      formulario("7719989001", { foto: archivoDeFormulario(jpeg) }),
      { prisma, ip: null, ahora: AHORA },
    );

    liberar();
    await new Promise((resolve) => setImmediate(resolve));

    if (resultado.exito) throw new Error("debió rechazarse por cupo de imagen");
    expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.servidorOcupado);
    // Lo capturado vuelve al formulario (salvo la foto, que nunca se repuebla).
    expect(resultado.estado.valores.nombre).toBe("Lavandería Ficticia del Semáforo");
    expect(resultado.estado.valores.horario).toBe("L-S 9am-7pm");
    // Ni ficha ni archivos.
    expect(await prisma.negocio.count({ where: { whatsapp: "7719989001" } })).toBe(0);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });

  it("el mensaje no dice nada del servidor ni de la carga real", () => {
    const mensaje = MENSAJES_ERROR_FOTO.servidorOcupado;
    expect(mensaje).toBe("Estamos recibiendo muchas fotos, intenta de nuevo en un momento");
    for (const filtracion of ["sharp", "memoria", "CPU", "semáforo", "cola"]) {
      expect(mensaje).not.toContain(filtracion);
    }
  });

  // Con el cupo libre, un envío normal no cambia en nada: la defensa no le
  // cobra nada al 99.9% de los envíos.
  it("con cupo libre el envío con foto sigue funcionando igual", async () => {
    const resultado = await procesarRegistro(
      formulario("7719989002", { foto: archivoDeFormulario(jpeg) }),
      { prisma, ip: null, ahora: AHORA },
    );
    expect(resultado).toEqual({ exito: true });
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719989002" },
    });
    expect(creado.fotoClave).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("el turno cubre solo la parte que abre el original", () => {
  /** JPEG de puro ruido: incompresible, obliga a recorrer la escalera entera. */
  async function fotoDificilDeComprimir(): Promise<Buffer> {
    return sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: "gaussian", mean: 128, sigma: 127 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  // Hallazgo M-5: con la compresión DENTRO del turno, esta foto lo retenía
  // ~1.7 s y bastaba ~1 petición por segundo para dejar el campo de foto
  // bloqueado para todo el mundo. El turno tiene que soltarse en cuanto el
  // original está abierto y reducido.
  it("una foto difícil de comprimir retiene el turno una fracción de su trabajo", async () => {
    const hostil = await fotoDificilDeComprimir();

    let desde = 0;
    let hasta = 0;
    const reloj = setInterval(() => {
      if (fotosEnProceso() > 0) {
        if (desde === 0) desde = Date.now();
        hasta = Date.now();
      }
    }, 1);

    const empezo = Date.now();
    const resultado = await procesarFoto(hostil);
    const total = Date.now() - empezo;
    clearInterval(reloj);

    expect(resultado.ok).toBe(true);
    const turnoTomado = hasta - desde;
    // La compresión es la mayor parte del trabajo y NO ocupa turno.
    expect(turnoTomado).toBeLessThan(total / 3);
  }, 30000);

  // Scenario: fotos difíciles de comprimir no bloquean el formulario
  it("mientras alguien sostiene envíos hostiles, el vecino sí sube su foto", async () => {
    const hostil = await fotoDificilDeComprimir();
    const legitima = await jpegDePrueba(1600, 1200);

    // Cuatro envíos hostiles seguidos, sin esperar a que terminen: es el ritmo
    // sostenido del hallazgo, concentrado para que el test no tarde.
    const ataque = [
      procesarFoto(hostil),
      procesarFoto(hostil),
      procesarFoto(hostil),
      procesarFoto(hostil),
    ];
    // Un respiro mínimo: los turnos de decodificación ya se soltaron.
    await new Promise((resolve) => setTimeout(resolve, 60));

    const delVecino = await procesarFoto(legitima);
    expect(delVecino.ok, "el vecino no debería toparse con el cupo lleno").toBe(true);

    await Promise.all(ataque);
    expect(fotosEnProceso()).toBe(0);
  }, 30000);
});

describe("una foto se abre una sola vez para las dos variantes", () => {
  // Scenario: el trabajo por foto no se multiplica.
  //
  // Antes de la enmienda, cada intento de la escalera de calidad volvía a
  // decodificar el ORIGINAL: hasta 12 aperturas por envío. El test cuenta
  // cuántas veces se construye un pipeline sobre los bytes originales.
  it("el original se decodifica una vez, no una por variante ni por intento", async () => {
    const original = await sharp({
      create: { width: 3000, height: 2250, channels: 3, background: { r: 90, g: 140, b: 90 } },
    })
      .jpeg()
      .toBuffer();

    // `espiaSharp` (arriba, en el `vi.mock`) anota con qué entrada se abre cada
    // pipeline. Solo cuentan las aperturas sobre los bytes ORIGINALES: las que
    // trabajan sobre el mapa de píxeles ya reducido no cuestan memoria del
    // tamaño del original.
    espiaSharp.entradas.length = 0;
    const resultado = await procesarFoto(original);
    expect(resultado.ok).toBe(true);

    const aperturasDelOriginal = espiaSharp.entradas.filter(
      (entrada) => Buffer.isBuffer(entrada) && entrada.equals(original),
    ).length;

    // Una para leer la cabecera y otra para decodificar: nunca una por
    // variante ni una por escalón de la escalera de calidad (que eran hasta 12
    // antes de la enmienda).
    expect(aperturasDelOriginal).toBeLessThanOrEqual(2);
  });

  it("las dos variantes siguen cumpliendo su presupuesto y saliendo derechas", async () => {
    const vertical = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
      .jpeg()
      .toBuffer();

    const resultado = await procesarFoto(vertical);
    if (!resultado.ok) throw new Error("debió aceptarse");

    const tarjeta = await sharp(resultado.variantes.tarjeta).metadata();
    const ficha = await sharp(resultado.variantes.ficha).metadata();
    expect(tarjeta.format).toBe("webp");
    expect(ficha.format).toBe("webp");
    // Vertical: el lado mayor es el alto, y se respeta la proporción.
    expect(ficha.height).toBeGreaterThan(ficha.width);
    expect(Math.max(ficha.width, ficha.height)).toBeLessThanOrEqual(1200);
    expect(Math.max(tarjeta.width, tarjeta.height)).toBeLessThanOrEqual(400);
  });
});
