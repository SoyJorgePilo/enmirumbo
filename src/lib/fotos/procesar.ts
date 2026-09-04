/**
 * Validación por CONTENIDO y compresión de la foto del negocio (spec
 * `registro-negocio`, requirements "El servidor solo acepta la foto si es una
 * imagen real de máximo 5 MB" y "La foto se guarda comprimida, sin metadatos
 * y con una referencia que genera el servidor"; design.md §2).
 *
 * Reglas que este módulo hace ciertas:
 *
 * 1. **Nunca se confía en la extensión ni en el tipo que declara el
 *    navegador.** Lo único que decide es si los bytes se pueden abrir como
 *    JPG, PNG o WebP. Un `.jpg` que en realidad es HTML, un PDF o un SVG se
 *    rechazan por lo que son.
 * 2. **El SVG se rechaza aunque `sharp` sepa rasterizarlo**: es un documento
 *    con scripts, no la foto de un taller.
 * 3. **Tope de píxeles**, no solo de bytes: un PNG de 60 bytes puede declarar
 *    108 megapíxeles y pedir cientos de MB al decodificar.
 * 4. **El original no se conserva** y **ningún metadato se copia**: el EXIF de
 *    un celular trae GPS, que es dato personal (PRD §8). Sí se aplica la
 *    rotación que indica el EXIF antes de tirarlo, o las fotos verticales
 *    saldrían acostadas.
 *
 * Módulo puro respecto del almacén y de la base: recibe bytes, devuelve
 * bytes. Quién los guarda y con qué clave se decide fuera.
 */
import sharp from "sharp";

import type { VarianteFoto } from "./clave";
import { MAXIMO_FOTOS_EN_PROCESO, conCupoDeImagen } from "./semaforo";
import {
  LIMITE_BYTES_FOTO,
  MEGAPIXELES_MAXIMOS,
  PARAMETROS_VARIANTES,
  type ParametrosVariante,
} from "./limites";

// Se re-exportan para que quien procesa imágenes no tenga que saber que las
// cotas viven en su propio módulo (lo hacen para que la validación de campos
// del formulario no arrastre `sharp`).
export {
  LIMITE_BYTES_FOTO,
  MEGAPIXELES_MAXIMOS,
  PARAMETROS_VARIANTES,
  type ParametrosVariante,
};

const LIMITE_PIXELES = MEGAPIXELES_MAXIMOS * 1_000_000;

/** Lo único que se acepta como foto, por contenido detectado. */
const FORMATOS_ACEPTADOS = ["jpeg", "png", "webp"] as const;

/**
 * Escalera de calidad: se empieza por la que se ve bien y se baja solo si la
 * variante no cabe en su presupuesto. Es una lista corta y acotada, no un
 * bucle abierto de búsqueda binaria.
 */
const CALIDADES = [82, 70, 58, 45, 32, 22] as const;

/** Motivos de rechazo; cada uno tiene su literal en `MENSAJES_ERROR_FOTO`. */
export type MotivoRechazoFoto =
  | "demasiadoGrande"
  | "noEsImagen"
  | "errorProcesamiento"
  /** No había turno para abrir otra imagen (spec: el techo de trabajo). */
  | "servidorOcupado";

export type ResultadoProcesoFoto =
  | { ok: true; variantes: Record<VarianteFoto, Buffer> }
  | { ok: false; motivo: MotivoRechazoFoto };

/**
 * ¿Estos bytes son una imagen aceptable? Devuelve las dimensiones ya
 * conocidas para no leer la cabecera dos veces.
 */
async function inspeccionar(
  bytes: Buffer,
): Promise<{ ok: true } | { ok: false; motivo: MotivoRechazoFoto }> {
  try {
    const metadatos = await sharp(bytes, {
      limitInputPixels: LIMITE_PIXELES,
      failOn: "error",
    }).metadata();

    // El formato es el DETECTADO por el decodificador, no el que dice la
    // extensión ni el que declara el navegador. Un SVG llega aquí como `svg` y
    // se queda fuera aunque `sharp` supiera rasterizarlo.
    if (!(FORMATOS_ACEPTADOS as readonly string[]).includes(metadatos.format)) {
      return { ok: false, motivo: "noEsImagen" };
    }
    // El tope también se comprueba a mano: `limitInputPixels` protege el
    // decodificado, esto además rechaza al leer la cabecera.
    if (metadatos.width * metadatos.height > LIMITE_PIXELES) {
      return { ok: false, motivo: "noEsImagen" };
    }
    return { ok: true };
  } catch {
    // No decodifica la cabecera, o declara más píxeles de los que aceptamos:
    // en los dos casos, para el dueño es "esa foto no se puede leer".
    return { ok: false, motivo: "noEsImagen" };
  }
}

/**
 * Mapa de píxeles ya reducido al tamaño de la variante más grande, del que
 * salen TODAS las variantes (spec, scenario "el trabajo por foto no se
 * multiplica").
 */
type ImagenBase = {
  /** Píxeles en crudo, sin comprimir, del tamaño de la variante mayor. */
  pixeles: Buffer;
  ancho: number;
  alto: number;
  canales: 1 | 2 | 3 | 4;
};

/**
 * Abre el original UNA sola vez, le aplica la rotación del EXIF, lo reduce al
 * lado mayor más grande que necesitamos y devuelve sus píxeles en crudo.
 *
 * Antes de la enmienda de la iteración 2, cada intento de la escalera de
 * calidad volvía a decodificar el original: hasta 12 aperturas del archivo
 * grande por envío, dos de ellas en paralelo. Ahora el archivo grande se abre
 * una vez y todo lo demás trabaja sobre este mapa, que a 1200px pesa como
 * mucho ~5.8 MB pase lo que pase con la entrada.
 */
async function decodificarUnaVez(bytes: Buffer): Promise<ImagenBase> {
  const ladoMayor = Math.max(
    ...Object.values(PARAMETROS_VARIANTES).map((parametros) => parametros.ladoMayor),
  );

  const { data, info } = await sharp(bytes, {
    limitInputPixels: LIMITE_PIXELES,
    failOn: "error",
  })
    // Sin argumentos: aplica la orientación del EXIF y la descarta.
    .rotate()
    .resize({ width: ladoMayor, height: ladoMayor, fit: "inside", withoutEnlargement: true })
    // En crudo: nada de volver a comprimir para descomprimir enseguida. Los
    // metadatos se quedan fuera por construcción, porque un mapa de píxeles no
    // tiene dónde llevarlos.
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixeles: data,
    ancho: info.width,
    alto: info.height,
    canales: info.channels,
  };
}

/**
 * Una variante dentro de su presupuesto, a partir del mapa ya decodificado. Si
 * ni con la calidad más baja cabe —una foto de puro ruido a 1200px—, se reduce
 * el lado mayor y se reintenta: la spec exige cumplir el tope, no conservar el
 * tamaño.
 */
async function generarVariante(
  base: ImagenBase,
  parametros: ParametrosVariante,
): Promise<Buffer> {
  let ladoMayor = parametros.ladoMayor;
  let ultimo: Buffer | null = null;

  for (let intento = 0; intento < 3; intento++) {
    for (const calidad of CALIDADES) {
      const salida = await sharp(base.pixeles, {
        raw: { width: base.ancho, height: base.alto, channels: base.canales },
      })
        .resize({
          width: ladoMayor,
          height: ladoMayor,
          fit: "inside",
          withoutEnlargement: true,
        })
        // WebP para las dos variantes: una sola por tamaño es más simple de
        // borrar, de contar y de razonar, y todo celular que importa aquí la
        // soporta. Sin `keepMetadata`/`withExif`: `sharp` descarta EXIF, XMP
        // e IPTC salvo que se le pida lo contrario, y aquí nunca se le pide.
        .webp({ quality: calidad })
        .toBuffer();

      ultimo = salida;
      if (salida.length <= parametros.pesoMaximo) return salida;
    }
    ladoMayor = Math.round(ladoMayor * 0.75);
  }

  // Inalcanzable con fotos reales; si pasara, es mejor una variante un pelo
  // más pesada que una ficha sin foto.
  return ultimo as Buffer;
}

/** Cada cuánto, como mucho, se avisa en el log de que el techo está lleno. */
const MS_ENTRE_AVISOS_DE_SATURACION = 60_000;
let ultimoAvisoDeSaturacion = 0;

/**
 * Avisa —una vez por minuto como mucho— de que se está rechazando trabajo de
 * imagen por falta de turno. Acotado a propósito: quien satura el servidor no
 * puede además inflar el log a voluntad (hallazgo B-2 de la auditoría), y para
 * quien opera basta con saber que está pasando, no cuántas veces.
 */
function avisarDeSaturacion(): void {
  const ahora = Date.now();
  if (ahora - ultimoAvisoDeSaturacion < MS_ENTRE_AVISOS_DE_SATURACION) return;
  ultimoAvisoDeSaturacion = ahora;
  console.warn(
    `[fotos] techo de trabajo alcanzado (${MAXIMO_FOTOS_EN_PROCESO} a la vez): se están rechazando envíos con foto`,
  );
}

/**
 * Valida y comprime. Devuelve las dos variantes listas para guardar, o el
 * motivo del rechazo (cada motivo tiene su literal en la spec).
 */
export async function procesarFoto(bytes: Buffer): Promise<ResultadoProcesoFoto> {
  // El tamaño se mira primero y sin abrir nada: es la comprobación más barata
  // y la que evita cargar a `sharp` un archivo que de todos modos se rechaza.
  // Va FUERA del semáforo porque no cuesta memoria: rechazar por tamaño no
  // debe consumir uno de los turnos.
  if (bytes.length > LIMITE_BYTES_FOTO) {
    return { ok: false, motivo: "demasiadoGrande" };
  }

  // DENTRO DEL TURNO va SOLO lo que abre el original, que es lo único que
  // cuesta memoria del tamaño de la entrada (hasta 40 MP). Si no hay turno NO
  // se espera: se responde de inmediato y el dueño reintenta (spec: "El
  // trabajo de imagen tiene un techo…").
  //
  // La compresión NO va aquí (hallazgo M-5 de la auditoría): trabaja sobre un
  // mapa ya reducido de unos pocos MB y era el 99% del tiempo que un turno
  // quedaba tomado. Con ella dentro, sostener ~1 petición por segundo bastaba
  // para dejar el campo de foto bloqueado para todo el pueblo, sin ganar ni un
  // byte de protección de memoria.
  const turno = await conCupoDeImagen(
    async (): Promise<
      { ok: true; base: ImagenBase } | { ok: false; motivo: MotivoRechazoFoto }
    > => {
      const inspeccion = await inspeccionar(bytes);
      if (!inspeccion.ok) return inspeccion;

      try {
        // Un solo decodificado del original; las dos variantes salen de él.
        return { ok: true, base: await decodificarUnaVez(bytes) };
      } catch (error) {
        // La cabecera decía que era una imagen pero los píxeles no se dejaron
        // decodificar (archivo truncado, por ejemplo). Nada del error viaja al
        // dueño: solo el literal de la spec.
        console.warn(
          `[fotos] no se pudo abrir la imagen: ${error instanceof Error ? error.name : "desconocido"}`,
        );
        return { ok: false, motivo: "errorProcesamiento" };
      }
    },
  );

  if (!turno.ok) {
    avisarDeSaturacion();
    return { ok: false, motivo: "servidorOcupado" };
  }
  if (!turno.valor.ok) return turno.valor;

  // FUERA DEL TURNO: comprimir el mapa ya reducido. El original ya se soltó.
  const base = turno.valor.base;
  try {
    const tarjeta = await generarVariante(base, PARAMETROS_VARIANTES.tarjeta);
    const ficha = await generarVariante(base, PARAMETROS_VARIANTES.ficha);
    return { ok: true, variantes: { tarjeta, ficha } };
  } catch (error) {
    console.warn(
      `[fotos] no se pudo generar la variante: ${error instanceof Error ? error.name : "desconocido"}`,
    );
    return { ok: false, motivo: "errorProcesamiento" };
  }
}
