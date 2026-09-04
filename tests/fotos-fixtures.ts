/**
 * Fixtures de imagen GENERADAS en tiempo de ejecución (spec `modelo-datos`,
 * scenario "nada de imágenes en el repositorio"; tasks.md #5 y #23).
 *
 * Regla dura del proyecto: NINGÚN binario de imagen se versiona, y ninguna
 * fixture se parece a una foto real de un negocio o de una persona. Todo lo
 * que hay aquí son rectángulos de color y cabeceras armadas a mano.
 */
import { crc32, deflateSync } from "node:zlib";

import sharp from "sharp";

/** Rectángulo de color liso, en el formato que se pida. */
async function rectangulo(
  ancho: number,
  alto: number,
  formato: "jpeg" | "png" | "webp",
  ruido = false,
): Promise<Buffer> {
  const canal = { r: 190, g: 150, b: 90 };
  let imagen = ruido
    ? sharp({
        create: {
          width: ancho,
          height: alto,
          channels: 3,
          background: canal,
          noise: { type: "gaussian", mean: 128, sigma: 60 },
        },
      })
    : sharp({
        create: { width: ancho, height: alto, channels: 3, background: canal },
      });
  // El ruido gaussiano es incompresible: a calidad alta se pasaría de los 5 MB
  // que admite la spec y la fixture dejaría de ser "una foto aceptada".
  if (formato === "jpeg") imagen = imagen.jpeg({ quality: ruido ? 62 : 92 });
  if (formato === "png") imagen = imagen.png();
  if (formato === "webp") imagen = imagen.webp();
  return imagen.toBuffer();
}

export function jpegDePrueba(ancho = 1600, alto = 1200): Promise<Buffer> {
  return rectangulo(ancho, alto, "jpeg");
}

export function pngDePrueba(ancho = 800, alto = 600): Promise<Buffer> {
  return rectangulo(ancho, alto, "png");
}

export function webpDePrueba(ancho = 800, alto = 600): Promise<Buffer> {
  return rectangulo(ancho, alto, "webp");
}

/**
 * Foto "difícil" de comprimir: ruido gaussiano a tamaño de celular. Sirve para
 * comprobar que los topes de peso por variante se cumplen incluso cuando la
 * imagen no es un degradado amable (spec `directorio-publico`, scenario "peso
 * de las variantes").
 */
export function fotoRuidosaDePrueba(ancho = 4032, alto = 3024): Promise<Buffer> {
  return rectangulo(ancho, alto, "jpeg", true);
}

/**
 * JPEG vertical marcado con orientación EXIF 6 (el "acostado" que produce un
 * celular), más EXIF de marca/modelo y coordenadas GPS INVENTADAS. Ninguna
 * variante generada debe conservar nada de esto (PRD §8: la ubicación del
 * celular es dato personal).
 */
export async function jpegConExifYGps(): Promise<Buffer> {
  return sharp({
    create: { width: 1200, height: 1600, channels: 3, background: { r: 40, g: 120, b: 90 } },
  })
    .withExif({
      IFD0: {
        Make: "MarcaFicticia",
        Model: "ModeloDeMentiras",
        Orientation: "6",
        DateTime: "2026:09:01 12:00:00",
      },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "19/1 50/1 12/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "98/1 58/1 54/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

/** Chunk PNG bien formado (longitud + tipo + datos + CRC32). */
function chunkPng(tipo: string, datos: Buffer): Buffer {
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length);
  const tipoYDatos = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(tipoYDatos) >>> 0);
  return Buffer.concat([longitud, tipoYDatos, suma]);
}

/**
 * "Bomba de píxeles": un PNG de pocos bytes que DECLARA dimensiones enormes.
 * Es el ataque real (archivo chico, memoria enorme al decodificar), y por eso
 * la fixture se arma con la cabecera a mano en vez de generar de verdad 100
 * megapíxeles —que es justo lo que no queremos que pase ni en el test.
 */
export function pngBombaDePixeles(ancho = 12000, alto = 9000): Buffer {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.writeUInt8(8, 8); // profundidad de bits
  ihdr.writeUInt8(2, 9); // color RGB
  // Datos comprimidos ridículamente cortos para el tamaño que declara: el
  // archivo pesa decenas de bytes y pide ~300 MB de memoria al decodificar.
  return Buffer.concat([
    firma,
    chunkPng("IHDR", ihdr),
    chunkPng("IDAT", deflateSync(Buffer.alloc(1000))),
    chunkPng("IEND", Buffer.alloc(0)),
  ]);
}

/** HTML con nombre y tipo declarado de imagen: el archivo disfrazado. */
export function htmlDisfrazadoDeJpg(): Buffer {
  return Buffer.from(
    "<!doctype html><html><body><script>alert('no soy una foto')</script></body></html>",
    "utf8",
  );
}

/** SVG: un documento con scripts, no una foto de un taller. */
export function svgDePrueba(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
      '<rect width="400" height="400" fill="#ccc"/><script>alert(1)</script></svg>',
    "utf8",
  );
}

/** Relleno incompresible de N bytes (para probar el tope de 5 MB). */
export function bytesDeRelleno(total: number): Buffer {
  const bytes = Buffer.alloc(total);
  for (let i = 0; i < total; i++) bytes[i] = (i * 31 + 7) % 256;
  return bytes;
}

/** `File` como el que llega en un `FormData` de un envío del formulario. */
export function archivoDeFormulario(
  bytes: Buffer,
  nombre = "foto.jpg",
  tipo = "image/jpeg",
): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}
