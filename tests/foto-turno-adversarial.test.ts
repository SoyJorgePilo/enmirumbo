import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { crearAlmacenLocal } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import {
  MAXIMO_BORRADO_SIN_FORZAR,
  MUESTRA_MINIMA_PARA_SOSPECHAR,
  PROPORCION_SOSPECHOSA,
  barrerFotosHuerfanas,
} from "../src/lib/fotos/huerfanas";
import { procesarFoto } from "../src/lib/fotos/procesar";
import { MAXIMO_FOTOS_EN_PROCESO, fotosEnProceso } from "../src/lib/fotos/semaforo";

/**
 * Suite adversarial de la iteración 3: qué se rompería si alguien deshiciera
 * las dos últimas correcciones.
 *
 * 1. **El turno cubre solo abrir la imagen.** El arreglo de M-5 fue mover la
 *    compresión fuera del semáforo. Lo compruebo de forma ESTRUCTURAL —con el
 *    contador de turnos, no con relojes ni con `sleep`—: mientras una
 *    compresión lenta sigue en vuelo, el cupo tiene que estar entero. Si
 *    alguien devuelve la escalera de calidad al interior del turno, esto falla
 *    aunque la máquina del CI vaya despacio.
 * 2. **Las guardas del barrido en sus bordes.** El dev cubrió el caso central;
 *    aquí van los límites exactos y el caso que de verdad importa no romper:
 *    una limpieza legítima y grande no debe quedar bloqueada por la
 *    proporción, y una legítima y pequeña no debe pedir `--forzar`.
 *
 * Datos ficticios (repo público + LFPDPPP).
 */

const AHORA = new Date("2026-09-04T12:00:00.000Z");
const viejo = new Date(AHORA.getTime() - 60 * 60 * 1000);

let hostil: Buffer;
let temporal: string;

/** Foto legítima, barata de comprimir: entra y sale enseguida. */
function fotoFacil(): Promise<Buffer> {
  return sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 90, g: 140, b: 190 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Espera a que el semáforo quede libre, sin dormir a ciegas.
 *
 * Con un plazo de reloj y no con un número de vueltas: `setImmediate` gira en
 * microsegundos, así que contar vueltas mediría la velocidad del bucle, no el
 * tiempo que tarda `sharp` en soltar el turno.
 */
async function esperarCupoLibre(plazoMs = 20000): Promise<void> {
  const limite = Date.now() + plazoMs;
  while (fotosEnProceso() > 0) {
    if (Date.now() > limite) throw new Error("el cupo no se liberó nunca");
    await new Promise((resolver) => setTimeout(resolver, 1));
  }
}

beforeAll(async () => {
  // Ruido gaussiano a 1200x1200: incompresible, así que recorre casi entera la
  // escalera de calidad. Es la foto que en la iteración 2 retenía un turno 1.8 s.
  hostil = await sharp({
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
  temporal = await mkdtemp(path.join(tmpdir(), "fotos-turno-"));
  // Calentamiento de libvips: que no se cuele en la primera medición.
  await procesarFoto(await fotoFacil());
});

afterAll(async () => {
  if (temporal) await rm(temporal, { recursive: true, force: true });
});

beforeEach(() => {
  expect(fotosEnProceso()).toBe(0);
});

describe("el turno cubre abrir la imagen, no comprimirla", () => {
  // LA prueba de la corrección de M-5, sin depender de tiempos: se lanza una
  // foto cara de comprimir, se espera a que el cupo quede libre (o sea, a que
  // ya solo quede la compresión) y se comprueba que el trabajo SIGUE en vuelo.
  // Con la escalera dentro del turno esto es imposible: el cupo no se liberaría
  // hasta que la compresión terminara.
  it("el cupo vuelve a estar libre mientras la compresión sigue trabajando", async () => {
    let terminada = false;
    const enVuelo = procesarFoto(hostil).then((resultado) => {
      terminada = true;
      return resultado;
    });

    await esperarCupoLibre();

    // El turno ya se soltó...
    expect(fotosEnProceso()).toBe(0);
    // ...y sin embargo el trabajo no ha terminado: lo que queda es la
    // compresión, que corre fuera del semáforo.
    expect(terminada, "la compresión debería seguir en vuelo").toBe(false);

    const resultado = await enVuelo;
    expect(resultado.ok).toBe(true);
    expect(fotosEnProceso()).toBe(0);
  }, 30000);

  // Consecuencia directa para el vecino: por muchas fotos caras que haya
  // comprimiéndose, el cupo de ENTRADA está libre.
  it("con varias compresiones caras en vuelo, el cupo de entrada sigue entero", async () => {
    const ataque: Array<Promise<unknown>> = [];
    for (let i = 0; i < MAXIMO_FOTOS_EN_PROCESO * 2; i++) {
      ataque.push(procesarFoto(hostil));
      await esperarCupoLibre();
    }

    // Cuatro compresiones hostiles en vuelo y el semáforo, vacío.
    expect(fotosEnProceso()).toBe(0);

    // Y el vecino entra sin toparse con "servidor ocupado".
    const delVecino = await procesarFoto(await fotoFacil());
    expect(delVecino.ok, "el vecino no debería toparse con el cupo lleno").toBe(true);

    await Promise.all(ataque);
    expect(fotosEnProceso()).toBe(0);
  }, 60000);
});

describe("las guardas del barrido en sus bordes exactos", () => {
  async function almacenCon(claves: string[]) {
    const directorio = await mkdtemp(path.join(tmpdir(), "barrido-borde-"));
    const almacen = crearAlmacenLocal(directorio);
    for (const clave of claves) {
      await almacen.guardar(clave, "tarjeta", Buffer.from("x"));
      await utimes(path.join(directorio, `${clave}.tarjeta.webp`), viejo, viejo);
    }
    return { directorio, almacen };
  }

  /** Base que reconoce como suyas las claves que se le pasen. */
  function baseCon(conFicha: string[]) {
    return {
      negocio: {
        count: async () => 500,
        findMany: async (args: { where: { fotoClave: { in: string[] } } }) =>
          args.where.fotoClave.in
            .filter((clave) => conFicha.includes(clave))
            .map((fotoClave) => ({ fotoClave })),
      },
    };
  }

  async function barrer(
    huerfanas: number,
    conFicha: number,
    opciones: { forzar?: boolean; soloInformar?: boolean } = {},
  ) {
    const sinDuenio = Array.from({ length: huerfanas }, generarClaveFoto);
    const vivas = Array.from({ length: conFicha }, generarClaveFoto);
    const { directorio, almacen } = await almacenCon([...sinDuenio, ...vivas]);
    const resultado = await barrerFotosHuerfanas({
      prisma: baseCon(vivas),
      almacen,
      directorio,
      ahora: AHORA,
      ...opciones,
    });
    const quedan = (await readdir(directorio)).length;
    await rm(directorio, { recursive: true, force: true });
    return { ...resultado, quedan };
  }

  // El caso que NO se puede romper: una limpieza de verdad, con muchas fotos
  // vivas y unas pocas huérfanas, tiene que correr sola. Si la guarda fuera
  // demasiado celosa, el barrido no se ejecutaría nunca y volvería M-3 por la
  // puerta de atrás.
  it("una limpieza legítima (pocas huérfanas entre muchas vivas) corre sin --forzar", async () => {
    const resultado = await barrer(8, 200);
    expect(resultado.barrido).toBe(true);
    expect(resultado.borradas).toBe(8);
    expect(resultado.quedan).toBe(200);
  });

  // Por debajo de la muestra mínima no se sospecha: con dos claves en el
  // almacén, "el 100 % es huérfano" no significa nada.
  it(`con menos de ${MUESTRA_MINIMA_PARA_SOSPECHAR} huérfanas no se sospecha aunque sea el 100 %`, async () => {
    const resultado = await barrer(MUESTRA_MINIMA_PARA_SOSPECHAR - 1, 0);
    expect(resultado.barrido).toBe(true);
    expect(resultado.borradas).toBe(MUESTRA_MINIMA_PARA_SOSPECHAR - 1);
  });

  it(`justo en la muestra mínima y por encima de la proporción, se planta`, async () => {
    const resultado = await barrer(MUESTRA_MINIMA_PARA_SOSPECHAR, 0);
    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.quedan).toBe(MUESTRA_MINIMA_PARA_SOSPECHAR);
    expect(resultado.mensaje).toContain("DATABASE_URL");
    expect(resultado.mensaje).toContain("--forzar");
  });

  // Justo en el umbral de proporción (50 %) NO se planta: la condición es
  // `> PROPORCION_SOSPECHOSA`, no `>=`. Se fija para que nadie lo cambie sin
  // darse cuenta de que mueve el borde.
  it(`justo en el ${PROPORCION_SOSPECHOSA * 100} % de huérfanas todavía barre`, async () => {
    const resultado = await barrer(10, 10);
    expect(resultado.barrido).toBe(true);
    expect(resultado.borradas).toBe(10);
  });

  it(`por encima del ${PROPORCION_SOSPECHOSA * 100} % se planta`, async () => {
    const resultado = await barrer(11, 9);
    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.quedan).toBe(20);
  });

  // La otra guarda es de volumen puro, y es independiente de la proporción:
  // llevarse más de 50 fotos de golpe siempre merece una confirmación humana,
  // aunque sean el 5 % del almacén.
  it(`${MAXIMO_BORRADO_SIN_FORZAR} huérfanas con proporción baja pasan`, async () => {
    const resultado = await barrer(MAXIMO_BORRADO_SIN_FORZAR, 500);
    expect(resultado.barrido).toBe(true);
    expect(resultado.borradas).toBe(MAXIMO_BORRADO_SIN_FORZAR);
  });

  it(`${MAXIMO_BORRADO_SIN_FORZAR + 1} huérfanas se plantan aunque la proporción sea mínima`, async () => {
    const resultado = await barrer(MAXIMO_BORRADO_SIN_FORZAR + 1, 500);
    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.quedan).toBe(MAXIMO_BORRADO_SIN_FORZAR + 1 + 500);
  });

  // Informar nunca se bloquea: es justo la forma de descubrir que la base es
  // la equivocada ANTES de borrar. Si `--dry-run` se plantara, el operador se
  // quedaría sin la herramienta de diagnóstico precisamente cuando la necesita.
  it("--dry-run informa incluso cuando la guarda bloquearía el borrado", async () => {
    const resultado = await barrer(40, 0, { soloInformar: true });
    expect(resultado.barrido).toBe(true);
    expect(resultado.huerfanas).toBe(40);
    expect(resultado.borradas).toBe(0);
    expect(resultado.quedan).toBe(40);
  });

  it("--forzar borra lo que la guarda había parado", async () => {
    const resultado = await barrer(40, 0, { forzar: true });
    expect(resultado.barrido).toBe(true);
    expect(resultado.borradas).toBe(40);
    expect(resultado.quedan).toBe(0);
  });

  // El escenario de M-6, ya cerrado: base poblada pero equivocada.
  it("la base equivocada pero poblada ya no se lleva las fotos por delante", async () => {
    const resultado = await barrer(10, 0); // ninguna clave coincide
    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(resultado.quedan).toBe(10);
  });
});
