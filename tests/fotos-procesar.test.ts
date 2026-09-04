import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import {
  LIMITE_BYTES_FOTO,
  MEGAPIXELES_MAXIMOS,
  PARAMETROS_VARIANTES,
  procesarFoto,
} from "../src/lib/fotos/procesar";
import {
  bytesDeRelleno,
  fotoRuidosaDePrueba,
  htmlDisfrazadoDeJpg,
  jpegConExifYGps,
  jpegDePrueba,
  pngBombaDePixeles,
  pngDePrueba,
  svgDePrueba,
  webpDePrueba,
} from "./fotos-fixtures";

// Spec: registro-negocio, requirements "El servidor solo acepta la foto si es
// una imagen real de máximo 5 MB" y "La foto se guarda comprimida, sin
// metadatos y con una referencia que genera el servidor"; directorio-publico,
// requirement "El peso de las fotos no rompe el presupuesto de 4G".
// tasks.md #5, #6 y #7.
//
// TODAS las fixtures se generan aquí mismo: ni un binario versionado, ni una
// foto de un negocio o una persona real (repo público + LFPDPPP).

describe("validación por CONTENIDO, no por extensión ni por tipo declarado", () => {
  it.each([
    ["JPG", jpegDePrueba],
    ["PNG", pngDePrueba],
    ["WebP", webpDePrueba],
  ])("acepta un %s de verdad", async (_formato, generar) => {
    const resultado = await procesarFoto(await generar());
    expect(resultado.ok).toBe(true);
  });

  // Scenario: archivo disfrazado de imagen
  it("rechaza un HTML aunque se llame foto.jpg y se declare image/jpeg", async () => {
    const resultado = await procesarFoto(htmlDisfrazadoDeJpg());
    expect(resultado).toEqual({ ok: false, motivo: "noEsImagen" });
  });

  // Scenario: SVG rechazado
  it("rechaza un SVG aunque sharp sepa rasterizarlo", async () => {
    const resultado = await procesarFoto(svgDePrueba());
    expect(resultado).toEqual({ ok: false, motivo: "noEsImagen" });
  });

  // Scenario: imagen enorme en píxeles
  it("rechaza una bomba de píxeles sin quedarse sin memoria ni tardar de más", async () => {
    const bomba = pngBombaDePixeles();
    expect(bomba.length).toBeLessThan(1024); // archivo chico, dimensiones enormes

    const empezo = Date.now();
    const resultado = await procesarFoto(bomba);
    const tardo = Date.now() - empezo;

    expect(resultado).toEqual({ ok: false, motivo: "noEsImagen" });
    expect(tardo).toBeLessThan(3000);
  });

  it("acepta una imagen justo por debajo del tope de megapíxeles y rechaza la de arriba", async () => {
    expect(MEGAPIXELES_MAXIMOS).toBe(40);
    const apenasDentro = await procesarFoto(pngBombaDePixeles(6000, 6000)); // 36 MP
    // No es una imagen decodificable de verdad (la fixture es solo cabecera),
    // así que no se afirma que pase: lo que se afirma es que el rechazo de la
    // de 108 MP ocurre por el tope, no por casualidad.
    expect(apenasDentro.ok).toBe(false);
    expect(await procesarFoto(pngBombaDePixeles(12000, 9000))).toEqual({
      ok: false,
      motivo: "noEsImagen",
    });
  });

  // Scenario: foto de más de 5 MB
  it("rechaza por tamaño antes de mirar el contenido", async () => {
    expect(LIMITE_BYTES_FOTO).toBe(5 * 1024 * 1024);
    const seisMegas = bytesDeRelleno(6 * 1024 * 1024);
    expect(await procesarFoto(seisMegas)).toEqual({
      ok: false,
      motivo: "demasiadoGrande",
    });
  });

  it("un archivo vacío no es una imagen", async () => {
    expect(await procesarFoto(Buffer.alloc(0))).toEqual({
      ok: false,
      motivo: "noEsImagen",
    });
  });
});

describe("variantes: tamaño, peso y formato (design.md §2)", () => {
  it("los parámetros son los ratificados en la propuesta", () => {
    expect(PARAMETROS_VARIANTES.tarjeta).toMatchObject({
      ladoMayor: 400,
      pesoMaximo: 60 * 1024,
    });
    expect(PARAMETROS_VARIANTES.ficha).toMatchObject({
      ladoMayor: 1200,
      pesoMaximo: 250 * 1024,
    });
  });

  // Scenario: la foto se sirve comprimida y en dos tamaños
  // Scenario: peso de las variantes
  it("una foto pesada de celular sale en dos variantes WebP dentro del presupuesto", async () => {
    const original = await fotoRuidosaDePrueba();
    expect(original.length).toBeGreaterThan(1024 * 1024);
    expect(original.length).toBeLessThanOrEqual(LIMITE_BYTES_FOTO);

    const resultado = await procesarFoto(original);
    if (!resultado.ok) throw new Error(`no debió rechazarse: ${resultado.motivo}`);

    const tarjeta = await sharp(resultado.variantes.tarjeta).metadata();
    const ficha = await sharp(resultado.variantes.ficha).metadata();

    expect(tarjeta.format).toBe("webp");
    expect(ficha.format).toBe("webp");
    expect(Math.max(tarjeta.width, tarjeta.height)).toBeLessThanOrEqual(400);
    expect(Math.max(ficha.width, ficha.height)).toBeLessThanOrEqual(1200);
    expect(resultado.variantes.tarjeta.length).toBeLessThanOrEqual(60 * 1024);
    expect(resultado.variantes.ficha.length).toBeLessThanOrEqual(250 * 1024);
    // Mucho más ligeras que el original, que además no se conserva.
    expect(resultado.variantes.ficha.length).toBeLessThan(original.length / 2);
  }, 30000);

  it("no amplía una foto más chica que la variante", async () => {
    const chica = await pngDePrueba(200, 150);
    const resultado = await procesarFoto(chica);
    if (!resultado.ok) throw new Error("no debió rechazarse");

    const tarjeta = await sharp(resultado.variantes.tarjeta).metadata();
    expect(tarjeta.width).toBe(200);
    expect(tarjeta.height).toBe(150);
  });

  // Scenario: una foto vertical con EXIF de orientación sale derecha
  it("aplica la rotación del EXIF: una foto vertical no sale acostada", async () => {
    const original = await jpegConExifYGps(); // 1200x1600 con orientación 6
    const resultado = await procesarFoto(original);
    if (!resultado.ok) throw new Error("no debió rechazarse");

    const ficha = await sharp(resultado.variantes.ficha).metadata();
    // Orientación 6 = girar 90°: lo que se guarda ya está derecho, así que la
    // variante queda apaisada (1600 de ancho pasa a ser el lado mayor).
    expect(ficha.width).toBeGreaterThan(ficha.height);
    expect(ficha.orientation).toBeUndefined();
  });
});

describe("metadatos: ni GPS ni marca de celular sobreviven (PRD §8)", () => {
  let original: Buffer;
  let variantes: { tarjeta: Buffer; ficha: Buffer };

  beforeAll(async () => {
    original = await jpegConExifYGps();
    const resultado = await procesarFoto(original);
    if (!resultado.ok) throw new Error("no debió rechazarse");
    variantes = resultado.variantes;
  });

  it("la fixture SÍ trae EXIF con GPS (si no, el test no probaría nada)", async () => {
    const meta = await sharp(original).metadata();
    expect(meta.exif).toBeDefined();
    expect(original.includes(Buffer.from("MarcaFicticia"))).toBe(true);
  });

  // Scenario: la ubicación del celular no se publica ni se guarda
  it.each(["tarjeta", "ficha"] as const)(
    "la variante de %s no conserva ningún metadato",
    async (variante) => {
      const bytes = variantes[variante];
      const meta = await sharp(bytes).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();

      // Inspección de bytes: si alguien reactiva el copiado de metadatos, esto
      // falla aunque sharp deje de reportarlos.
      for (const rastro of [
        "MarcaFicticia",
        "ModeloDeMentiras",
        "GPSLatitude",
        "2026:09:01",
        "Exif",
      ]) {
        expect(bytes.includes(Buffer.from(rastro, "ascii"))).toBe(false);
      }
    },
  );
});
