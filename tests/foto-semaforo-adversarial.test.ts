import { mkdtemp, rm, utimes, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearAlmacenLocal } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { barrerFotosHuerfanas } from "../src/lib/fotos/huerfanas";
import { PARAMETROS_VARIANTES } from "../src/lib/fotos/limites";
import { LIMITE_BYTES_FOTO, procesarFoto } from "../src/lib/fotos/procesar";
import {
  MAXIMO_FOTOS_EN_PROCESO,
  conCupoDeImagen,
  fotosEnProceso,
} from "../src/lib/fotos/semaforo";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { MENSAJES_ERROR_FOTO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { archivoDeFormulario, bytesDeRelleno, jpegDePrueba } from "./fotos-fixtures";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";

/**
 * Suite adversarial de la ENMIENDA de la iteración 2 (techo de trabajo
 * simultáneo, decodificación única y barrido de huérfanas), escrita contra el
 * riesgo que introduce un semáforo, no contra el que resuelve:
 *
 * 1. **Fuga de turnos.** Un permiso que no se libera es un DoS permanente y
 *    silencioso: a partir de N fallos, nadie vuelve a poder subir una foto.
 *    Se prueban todas las formas de salir mal que se me ocurrieron.
 * 2. **Encolado encubierto.** Si el que no cabe esperase, el semáforo no
 *    acotaría nada: seguiría habiendo N peticiones vivas.
 * 3. **Contabilidad del turno.** Lo que NO cuesta memoria (rechazo por
 *    tamaño) no debe gastar turno.
 * 4. **Regresión de la decodificación única.** Que abrir la imagen una sola
 *    vez no haya cambiado peso, tamaño ni orientación de las variantes.
 * 5. **Barrido de huérfanas.** La carrera que de verdad importa: una clave a
 *    medio escribir.
 *
 * Datos ficticios (repo público + LFPDPPP): serie 7719997xxx, TEST-NET-3.
 */

const AHORA = new Date("2026-09-04T12:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let jpeg: Buffer;
let temporal: string;

function formulario(whatsapp: string, extra: Record<string, string | File> = {}): FormData {
  const datos = new FormData();
  datos.set("nombre", "Panadería Ficticia del Semáforo");
  datos.set("categoriaId", String(categoriaId));
  datos.set("whatsapp", whatsapp);
  datos.set("coloniaId", String(coloniaId));
  datos.set("consentimiento", "on");
  // Campo oculto con la versión del aviso que pintó el formulario
  // (change `versionar-aviso-privacidad`): sin él, el envío se rechaza.
  datos.set(CAMPO_VERSION_AVISO, VERSION_AVISO);
  for (const [clave, valor] of Object.entries(extra)) datos.set(clave, valor);
  return datos;
}

/** Ocupa `cuantos` turnos y devuelve la función que los libera. */
function ocupar(cuantos: number): () => Promise<void> {
  let liberar!: () => void;
  const bloqueo = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const enVuelo = Array.from({ length: cuantos }, () => conCupoDeImagen(() => bloqueo));
  return async () => {
    liberar();
    await Promise.all(enVuelo);
  };
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "abarrotes-y-comercio" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;
  jpeg = await jpegDePrueba(900, 700);
  temporal = await mkdtemp(path.join(tmpdir(), "fotos-sem-"));
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719997" } } });
  await prisma.$disconnect();
  if (temporal) await rm(temporal, { recursive: true, force: true });
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719997" } } });
  // Ninguna prueba debe empezar con turnos prestados de la anterior.
  expect(fotosEnProceso()).toBe(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Fuga de turnos: el riesgo que introduce el propio semáforo
// ───────────────────────────────────────────────────────────────────────────

describe("ningún camino de error se queda con un turno", () => {
  // Un permiso perdido no se recupera nunca: el proceso queda con menos cupo
  // para siempre y, tras MAXIMO fallos, el campo de foto deja de funcionar
  // para todo el mundo sin que nadie se entere. Es la fuga clásica de un
  // semáforo y hay que probar todas las salidas, no solo la feliz.
  it("el trabajo que lanza en asíncrono devuelve el turno", async () => {
    await expect(
      conCupoDeImagen(async () => {
        throw new Error("truena dentro");
      }),
    ).rejects.toThrow("truena dentro");
    expect(fotosEnProceso()).toBe(0);
  });

  it("el trabajo que lanza ANTES de devolver promesa también devuelve el turno", async () => {
    await expect(
      conCupoDeImagen((() => {
        throw new Error("truena antes de la promesa");
      }) as never),
    ).rejects.toThrow("truena antes de la promesa");
    expect(fotosEnProceso()).toBe(0);
  });

  it("una promesa rechazada devuelve el turno", async () => {
    await expect(
      conCupoDeImagen(() => Promise.reject(new Error("rechazada"))),
    ).rejects.toThrow("rechazada");
    expect(fotosEnProceso()).toBe(0);
  });

  it.each([
    ["bytes que no son una imagen", () => Buffer.from("<html>no soy una foto</html>")],
    ["un byte suelto", () => Buffer.from([0xff])],
    ["un archivo vacío", () => Buffer.alloc(0)],
  ])("procesarFoto con %s devuelve el turno", async (_caso, generar) => {
    await procesarFoto(generar());
    expect(fotosEnProceso()).toBe(0);
  });

  it("procesarFoto con un JPEG truncado (truena al comprimir) devuelve el turno", async () => {
    const truncado = jpeg.subarray(0, Math.floor(jpeg.length * 0.4));
    const resultado = await procesarFoto(truncado);
    expect(resultado.ok).toBe(false);
    expect(fotosEnProceso()).toBe(0);
  });

  // La prueba de fondo: cien fallos seguidos de todos los sabores no pueden
  // dejar el cupo mermado ni un turno.
  it("cien fallos encadenados no merman el cupo", async () => {
    for (let i = 0; i < 100; i++) {
      const caso = i % 3;
      if (caso === 0) await procesarFoto(Buffer.from("basura"));
      else if (caso === 1) await procesarFoto(jpeg.subarray(0, 200));
      else await conCupoDeImagen(async () => { throw new Error("x"); }).catch(() => {});
    }
    expect(fotosEnProceso()).toBe(0);

    // Y el cupo sigue entero: una foto buena todavía entra.
    const buena = await procesarFoto(jpeg);
    expect(buena.ok).toBe(true);
    expect(fotosEnProceso()).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. No encola, y no cuenta lo que no cuesta memoria
// ───────────────────────────────────────────────────────────────────────────

describe("el que no cabe se va, no espera", () => {
  it("con el cupo lleno la respuesta llega ANTES de que se liberen los turnos", async () => {
    const liberar = ocupar(MAXIMO_FOTOS_EN_PROCESO);
    expect(fotosEnProceso()).toBe(MAXIMO_FOTOS_EN_PROCESO);

    let liberado = false;
    const resultado = await procesarFoto(jpeg);
    // Si hubiera encolado, esto solo se resolvería después de `liberar()`.
    expect(liberado).toBe(false);
    expect(resultado).toEqual({ ok: false, motivo: "servidorOcupado" });

    liberado = true;
    await liberar();
    expect(fotosEnProceso()).toBe(0);
  });

  it("aunque lleguen 50 a la vez, nunca hay más de MAXIMO adentro", async () => {
    // PNG plano de 39.4 MP: chico en bytes, enorme en píxeles. Es el ataque
    // del hallazgo A-1, ahora contra el techo.
    const bomba = await sharp({
      create: { width: 7300, height: 5400, channels: 3, background: { r: 120, g: 130, b: 140 } },
    })
      .png()
      .toBuffer();

    let pico = 0;
    const reloj = setInterval(() => {
      pico = Math.max(pico, fotosEnProceso());
    }, 1);
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => procesarFoto(bomba)),
    );
    clearInterval(reloj);

    expect(pico).toBeLessThanOrEqual(MAXIMO_FOTOS_EN_PROCESO);
    expect(fotosEnProceso()).toBe(0);

    const procesadas = resultados.filter((r) => r.ok).length;
    const ocupadas = resultados.filter(
      (r) => !r.ok && r.motivo === "servidorOcupado",
    ).length;
    expect(procesadas).toBeGreaterThan(0);
    expect(procesadas + ocupadas).toBe(50);
    // Nadie recibe un motivo raro: o se procesó, o no había turno.
    expect(procesadas).toBeLessThanOrEqual(MAXIMO_FOTOS_EN_PROCESO);
  });

  // El rechazo por tamaño no abre la imagen, así que no debe gastar turno: si
  // lo gastara, mandar archivos de 6 MB sería la forma barata de vaciar el
  // cupo sin que el servidor haga ningún trabajo real.
  it("rechazar por tamaño no consume turno: 30 archivos de 6 MB no vacían el cupo", async () => {
    const pesado = bytesDeRelleno(6 * 1024 * 1024);
    const enVuelo = Array.from({ length: 30 }, () => procesarFoto(pesado));

    // Mientras están en vuelo, el cupo sigue libre.
    expect(fotosEnProceso()).toBe(0);
    const resultados = await Promise.all(enVuelo);
    for (const resultado of resultados) {
      expect(resultado).toEqual({ ok: false, motivo: "demasiadoGrande" });
    }
    expect(fotosEnProceso()).toBe(0);
  });

  it("el envío que no cupo no crea ficha ni deja archivos, y no delata carga real", async () => {
    const liberar = ocupar(MAXIMO_FOTOS_EN_PROCESO);
    const almacen = crearAlmacenLocal(temporal);
    const antes = (await readdir(temporal).catch(() => [])).sort();

    const resultado = await procesarRegistro(
      formulario("7719997001", { foto: archivoDeFormulario(jpeg, "foto.jpg") }),
      { prisma, ip: "203.0.113.101", ahora: AHORA, almacen },
    );

    if (resultado.exito) throw new Error("sin turno no debe declararse exitoso");
    expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.servidorOcupado);
    // Conserva lo capturado (scenario "al que no cupo no se le pierde lo escrito").
    expect(resultado.estado.valores.nombre).toBe("Panadería Ficticia del Semáforo");
    expect(resultado.estado.valores.whatsapp).toBe("7719997001");
    expect(await prisma.negocio.count({ where: { whatsapp: "7719997001" } })).toBe(0);
    expect((await readdir(temporal).catch(() => [])).sort()).toEqual(antes);

    // El mensaje no cuenta nada de la máquina.
    for (const filtracion of ["memoria", "MB", "CPU", "cola", "turno", "semáforo", "2"]) {
      expect(MENSAJES_ERROR_FOTO.servidorOcupado).not.toContain(filtracion);
    }

    await liberar();
  });

  it("un envío SIN foto pasa aunque el cupo esté lleno: el directorio no se cae", async () => {
    const liberar = ocupar(MAXIMO_FOTOS_EN_PROCESO);

    const resultado = await procesarRegistro(formulario("7719997002"), {
      prisma,
      ip: "203.0.113.102",
      ahora: AHORA,
      almacen: crearAlmacenLocal(temporal),
    });

    expect(resultado).toMatchObject({ exito: true });
    await liberar();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. La decodificación única no cambió el resultado
// ───────────────────────────────────────────────────────────────────────────

describe("abrir la imagen una sola vez no degradó las variantes", () => {
  // La enmienda cambió el pipeline: antes cada intento de calidad reabría el
  // original; ahora todos trabajan sobre un mapa de píxeles ya reducido. Eso
  // es un doble redimensionado, así que hay que comprobar que ninguna entrada
  // difícil se sale del presupuesto por el camino.
  it.each([
    ["ruido 1600x1200 q92", 1600, 1200, 92, 80],
    ["ruido 2000x1500 q88", 2000, 1500, 88, 110],
    ["ruido 2400x2400 q70", 2400, 2400, 70, 120],
    ["ruido 1200x1200 q95", 1200, 1200, 95, 127],
  ])("%s cumple los dos topes de peso", async (_caso, ancho, alto, calidad, sigma) => {
    const bytes = await sharp({
      create: {
        width: ancho,
        height: alto,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: "gaussian", mean: 128, sigma },
      },
    })
      .jpeg({ quality: calidad })
      .toBuffer();
    // Si la fixture se pasara de 5 MB, se rechazaría antes y no probaría nada.
    expect(bytes.length).toBeLessThanOrEqual(LIMITE_BYTES_FOTO);

    const procesada = await procesarFoto(bytes);
    if (!procesada.ok) throw new Error(`debía aceptarse: ${procesada.motivo}`);
    expect(procesada.variantes.tarjeta.length).toBeLessThanOrEqual(
      PARAMETROS_VARIANTES.tarjeta.pesoMaximo,
    );
    expect(procesada.variantes.ficha.length).toBeLessThanOrEqual(
      PARAMETROS_VARIANTES.ficha.pesoMaximo,
    );
    expect(fotosEnProceso()).toBe(0);
  });

  // Formatos y profundidades que el doble redimensionado en crudo podría
  // haber roto: el buffer `raw` se relee declarando ancho/alto/canales, y si
  // la profundidad no fuera de 8 bits el tamaño no cuadraría.
  it.each([
    ["png de 16 bits", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .toColourspace("rgb16").png().toBuffer()],
    ["png con paleta", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .png({ palette: true }).toBuffer()],
    ["png en escala de grises", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .grayscale().png().toBuffer()],
    ["png con canal alfa", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 4, background: { r: 180, g: 120, b: 60, alpha: 0.5 } } })
        .png().toBuffer()],
    ["webp con canal alfa", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.4 } } })
        .webp().toBuffer()],
    ["jpeg cmyk", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .jpeg().toColourspace("cmyk").toBuffer()],
    ["jpeg progresivo", async () =>
      sharp({ create: { width: 1400, height: 1000, channels: 3, background: { r: 180, g: 120, b: 60 } } })
        .jpeg({ progressive: true }).toBuffer()],
    ["imagen de 1x1", async () =>
      sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .png().toBuffer()],
  ])("%s sobrevive al mapa de píxeles en crudo", async (_caso, generar) => {
    const procesada = await procesarFoto(await generar());
    if (!procesada.ok) throw new Error(`debía aceptarse: ${procesada.motivo}`);

    for (const [nombre, variante] of Object.entries(procesada.variantes)) {
      const salida = await sharp(variante).metadata();
      expect(salida.format, nombre).toBe("webp");
      expect(salida.width, nombre).toBeGreaterThan(0);
      expect(salida.height, nombre).toBeGreaterThan(0);
    }
  });

  it("la rotación del EXIF se aplica en LAS DOS variantes, no solo en la de ficha", async () => {
    // La rotación se hace ahora una sola vez, en el decodificado común. Si se
    // hubiera perdido, las fotos de celular saldrían acostadas. El test del
    // dev comprueba la variante de ficha; esta comprueba las dos, que es lo
    // que garantiza que el mapa compartido llega girado a ambas.
    const { jpegConExifYGps } = await import("./fotos-fixtures");
    const original = await jpegConExifYGps(); // 1200x1600 guardado, orientación 6
    const guardada = await sharp(original).metadata();
    expect(guardada.height, "la fixture se guarda vertical").toBeGreaterThan(
      guardada.width!,
    );
    expect(guardada.orientation, "y con orientación 6").toBe(6);

    const procesada = await procesarFoto(original);
    if (!procesada.ok) throw new Error("la fixture es un JPEG válido");

    for (const [nombre, variante] of Object.entries(procesada.variantes)) {
      const salida = await sharp(variante).metadata();
      // Orientación 6 = girar 90°: ya derecha, la imagen queda apaisada. Que
      // los lados se hayan intercambiado ES la prueba de que se giró.
      expect(salida.width, `${nombre} debe salir ya girada`).toBeGreaterThan(
        salida.height!,
      );
      // Y sin la etiqueta de orientación, o el navegador la giraría otra vez.
      expect(salida.orientation, nombre).toBeUndefined();
      // El mapa en crudo no pudo llevarse el EXIF ni queriendo.
      expect(variante.includes(Buffer.from("GPSLatitude")), nombre).toBe(false);
      expect(variante.includes(Buffer.from("MarcaFicticia")), nombre).toBe(false);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Barrido de huérfanas: la carrera que de verdad importa
// ───────────────────────────────────────────────────────────────────────────

describe("el barrido no se lleva por delante una foto viva", () => {
  const viejo = new Date(AHORA.getTime() - 60 * 60 * 1000);

  async function almacenDePrueba() {
    const directorio = await mkdtemp(path.join(tmpdir(), "barrido-adv-"));
    return { directorio, almacen: crearAlmacenLocal(directorio) };
  }

  function baseFalsa(conFicha: string[], total = 10) {
    return {
      negocio: {
        count: async () => total,
        findMany: async (args: { where: { fotoClave: { in: string[] } } }) =>
          args.where.fotoClave.in
            .filter((clave) => conFicha.includes(clave))
            .map((fotoClave) => ({ fotoClave })),
      },
    };
  }

  // LA carrera: un alta escribe `tarjeta` y `ficha` con microsegundos de
  // diferencia. Si el barrido juzgara por el archivo MÁS VIEJO, una clave a
  // medio escribir entraría a juicio y se borraría la foto de un alta en
  // curso. Tiene que mandar el archivo más reciente.
  it("una clave con una variante vieja y otra recién escrita NO se toca", async () => {
    const { directorio, almacen } = await almacenDePrueba();
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "tarjeta", Buffer.from("vieja"));
    await almacen.guardar(clave, "ficha", Buffer.from("recien nacida"));
    // La tarjeta se escribió "hace una hora"; la ficha, ahora mismo.
    await utimes(path.join(directorio, `${clave}.tarjeta.webp`), viejo, viejo);

    const resultado = await barrerFotosHuerfanas({
      prisma: baseFalsa([]),
      almacen,
      ahora: AHORA,
    });

    expect(resultado.borradas).toBe(0);
    expect(resultado.enPeriodoDeGracia).toBe(1);
    expect((await readdir(directorio)).sort()).toEqual(
      [`${clave}.ficha.webp`, `${clave}.tarjeta.webp`].sort(),
    );
    await rm(directorio, { recursive: true, force: true });
  });

  it("una clave con ficha no se borra aunque le falte una variante en disco", async () => {
    const { directorio, almacen } = await almacenDePrueba();
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "ficha", Buffer.from("solo la grande"));
    await utimes(path.join(directorio, `${clave}.ficha.webp`), viejo, viejo);

    const resultado = await barrerFotosHuerfanas({
      prisma: baseFalsa([clave]),
      almacen,
      ahora: AHORA,
    });

    expect(resultado.huerfanas).toBe(0);
    expect(resultado.borradas).toBe(0);
    expect(await readdir(directorio)).toContain(`${clave}.ficha.webp`);
    await rm(directorio, { recursive: true, force: true });
  });

  it("con --dry-run no se toca el disco ni cuando todo está huérfano", async () => {
    const { directorio, almacen } = await almacenDePrueba();
    const claves = [generarClaveFoto(), generarClaveFoto(), generarClaveFoto()];
    for (const clave of claves) {
      for (const variante of ["tarjeta", "ficha"] as const) {
        await almacen.guardar(clave, variante, Buffer.from("x"));
        await utimes(path.join(directorio, `${clave}.${variante}.webp`), viejo, viejo);
      }
    }

    const resultado = await barrerFotosHuerfanas({
      prisma: baseFalsa([]),
      almacen,
      soloInformar: true,
      ahora: AHORA,
    });

    expect(resultado.huerfanas).toBe(3);
    expect(resultado.borradas).toBe(0);
    expect(await readdir(directorio)).toHaveLength(6);
    await rm(directorio, { recursive: true, force: true });
  });

  it("los archivos que no escribió el servidor ni se cuentan como huérfanos", async () => {
    const { directorio, almacen } = await almacenDePrueba();
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "tarjeta", Buffer.from("mía"));
    await utimes(path.join(directorio, `${clave}.tarjeta.webp`), viejo, viejo);
    // Cosas ajenas con nombres que se le parecen, pero no son suyas.
    //
    // A propósito NO se usa aquí una variante de la misma clave en
    // mayúsculas: en un sistema de archivos que no distingue mayúsculas
    // (macOS, Windows) sería el MISMO archivo que el del servidor, y el test
    // daría un resultado distinto en el CI (Linux) que en local.
    const { writeFile } = await import("node:fs/promises");
    const ajenos = [
      "notas.txt",
      `${clave}.original.webp`,
      `${generarClaveFoto().toUpperCase()}.ficha.webp`,
      "0123456789abcdef.tarjeta.webp",
      `${clave}.tarjeta.webp.bak`,
    ];
    for (const ajeno of ajenos) {
      await writeFile(path.join(directorio, ajeno), "ajeno");
      await utimes(path.join(directorio, ajeno), viejo, viejo);
    }

    const resultado = await barrerFotosHuerfanas({
      prisma: baseFalsa([]),
      almacen,
      ahora: AHORA,
    });

    expect(resultado.revisadas).toBe(1);
    expect(resultado.borradas).toBe(1);
    expect(resultado.ignoradas).toBe(ajenos.length);
    // Los cinco ajenos siguen ahí, intactos.
    expect((await readdir(directorio)).sort()).toEqual([...ajenos].sort());
    await rm(directorio, { recursive: true, force: true });
  });

  it("se planta si la base está vacía pero el almacén no", async () => {
    const { directorio, almacen } = await almacenDePrueba();
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "ficha", Buffer.from("x"));
    await utimes(path.join(directorio, `${clave}.ficha.webp`), viejo, viejo);

    const resultado = await barrerFotosHuerfanas({
      prisma: baseFalsa([], 0),
      almacen,
      ahora: AHORA,
    });

    expect(resultado.barrido).toBe(false);
    expect(resultado.borradas).toBe(0);
    expect(await readdir(directorio)).toHaveLength(1);
    await rm(directorio, { recursive: true, force: true });
  });
});
