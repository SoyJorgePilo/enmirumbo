/**
 * Barrido de reconciliación: fotos en el almacén que ya no son de nadie.
 *
 * Por qué existe (hallazgo M-3 de la auditoría de seguridad): el alta escribe
 * primero los archivos y después la fila, y compensa el almacén si la
 * escritura no se concreta. Ese `try/catch` cubre el fallo *lógico*, no la
 * muerte del proceso: un `kill -9`, un OOM o un redeploy justo en medio dejan
 * dos WebP sin ninguna ficha que los apunte. Y una foto sin fila es
 * **inalcanzable para el borrado**, porque `borrarNegocioDefinitivamente()`
 * llega a los archivos a través de `fotoClave`: dejaría un dato personal
 * (PRD §8) fuera del alcance de cualquier operación ARCO.
 *
 * Se corre con `npm run fotos:barrer-huerfanos` (o `-- --dry-run` para solo
 * mirar). En producción le toca un cron; queda anotado para T-013 junto con
 * la purga de rechazados a los 90 días, que es el otro barrido periódico.
 *
 * Cuatro salvaguardas, porque un barrido que se equivoca borra fotos vivas:
 *
 * 1. **Periodo de gracia**: un archivo recién escrito no se toca, porque
 *    puede ser un alta en curso a la que todavía le falta el `INSERT`.
 * 2. **Solo lo que escribió el servidor**: los archivos que no tienen la forma
 *    `<clave>.<variante>.webp` —o que ni siquiera son archivos— se cuentan y
 *    se dejan en paz.
 * 3. **Base plausible**: si en la base no hay ni un negocio pero en el almacén
 *    sí hay fotos, lo más probable es que se esté apuntando a la base
 *    equivocada. No se borra nada y se dice.
 * 4. **Guarda de proporción**: si "casi todo" o "demasiado" parece huérfano,
 *    tampoco se borra nada sin `--forzar`. Es la que cubre el error de
 *    operación que de verdad destruye datos: apuntar a otra base POBLADA
 *    (staging, `test.db`), donde ninguna clave coincide y todo parece basura.
 * 5. **Almacén implausible** (iteración 2, hallazgo A5 de la etapa C): si el
 *    almacén está vacío pero la base sí tiene fichas con foto, el barrido NO
 *    dice "nada que barrer": dice que está mirando al almacén equivocado. Es
 *    justo lo que pasaba con el adaptador de disco en serverless —cada
 *    instancia nueva arrancaba con el directorio vacío y el cron informaba
 *    éxito todos los días sin haber revisado nada—.
 *
 * DÓNDE MIRA: se lo pregunta al PUERTO (`almacen.listar()`), no al sistema de
 * archivos. Antes leía el directorio con `readdir`, y eso lo ataba al
 * adaptador local: al cambiar de almacén el barrido se quedaba mirando a un
 * sitio vacío e informando éxito.
 */
import { almacenDeFotos, type AlmacenFotos } from "./almacen";
import { esClaveFotoValida, VARIANTES_FOTO } from "./clave";

/** Un archivo tiene que llevar escrito al menos esto para considerarse huérfano. */
export const EDAD_MINIMA_PARA_BARRER_MS = 15 * 60 * 1000;

/**
 * A partir de esta proporción de huérfanas, el barrido sospecha que el
 * problema no son las fotos sino la base a la que se le está preguntando
 * (hallazgo M-6). En una limpieza normal las huérfanas son una rareza.
 */
export const PROPORCION_SOSPECHOSA = 0.5;

/**
 * …pero solo con una muestra que signifique algo: con una o dos claves en el
 * almacén, "el 100 % es huérfano" no dice nada.
 */
export const MUESTRA_MINIMA_PARA_SOSPECHAR = 5;

/** Y por volumen: borrar de golpe más que esto siempre merece confirmación. */
export const MAXIMO_BORRADO_SIN_FORZAR = 50;

/** Lo poco que el barrido necesita de Prisma (facilita probarlo). */
export type ClienteBarrido = {
  negocio: {
    count(args?: unknown): Promise<number>;
    findMany(args: {
      where: { fotoClave: { in: string[] } };
      select: { fotoClave: true };
    }): Promise<Array<{ fotoClave: string | null }>>;
  };
};

export type EntradaBarrido = {
  prisma: ClienteBarrido;
  almacen?: AlmacenFotos;
  /** No borra nada: solo cuenta e informa (`--dry-run`). */
  soloInformar?: boolean;
  /**
   * Salta la guarda de proporción (`--forzar`). Se escribe a mano, después de
   * haber mirado el `--dry-run`: es la forma de decir "sí, ya sé que se va a
   * llevar casi todo, y es lo que quiero".
   */
  forzar?: boolean;
  /** Momento de referencia para el periodo de gracia; se inyecta en pruebas. */
  ahora?: Date;
};

export type ResultadoBarrido = {
  /** `false` cuando la salvaguarda de base plausible lo detuvo. */
  barrido: boolean;
  /** Claves con la forma del servidor que se llegaron a revisar. */
  revisadas: number;
  /** De esas, cuántas no tienen ninguna ficha. */
  huerfanas: number;
  /** Cuántas se borraron de verdad (0 con `--dry-run`). */
  borradas: number;
  /** Claves demasiado recientes para juzgarlas todavía. */
  enPeriodoDeGracia: number;
  /** Archivos del directorio que no escribió el servidor: ni se tocan. */
  ignoradas: number;
  /** Claves que se quiso borrar y no se dejaron (p. ej. un directorio ahí). */
  noBorrables: number;
  mensaje: string;
};

/** `<clave>.<variante>.webp`, que es lo único que escribe el adaptador. */
const FORMA_ARCHIVO = new RegExp(`^([0-9a-f]{32})\\.(${VARIANTES_FOTO.join("|")})\\.webp$`);

/** Prisma no admite un `IN` gigante: se pregunta por tandas. */
const TAMANO_TANDA = 400;

async function clavesConFicha(
  prisma: ClienteBarrido,
  claves: string[],
): Promise<Set<string>> {
  const encontradas = new Set<string>();
  for (let i = 0; i < claves.length; i += TAMANO_TANDA) {
    const tanda = claves.slice(i, i + TAMANO_TANDA);
    const filas = await prisma.negocio.findMany({
      where: { fotoClave: { in: tanda } },
      select: { fotoClave: true },
    });
    for (const fila of filas) {
      if (fila.fotoClave) encontradas.add(fila.fotoClave);
    }
  }
  return encontradas;
}

export async function barrerFotosHuerfanas({
  prisma,
  almacen = almacenDeFotos(),
  soloInformar = false,
  forzar = false,
  ahora = new Date(),
}: EntradaBarrido): Promise<ResultadoBarrido> {
  const vacio: ResultadoBarrido = {
    barrido: true,
    revisadas: 0,
    huerfanas: 0,
    borradas: 0,
    enPeriodoDeGracia: 0,
    ignoradas: 0,
    noBorrables: 0,
    mensaje: "El almacén de fotos está vacío: nada que barrer.",
  };

  const objetos = await almacen.listar();

  if (objetos.length === 0) {
    // Salvaguarda de almacén plausible (hallazgo A5): un almacén vacío es
    // normal en un proyecto recién estrenado, y una MENTIRA en cuanto hay
    // fichas con foto en la base. Distinguirlas es lo que impide que el cron
    // informe éxito todos los días sin haber revisado nada.
    const conFoto = await prisma.negocio.count({ where: { fotoClave: { not: null } } });
    if (conFoto === 0) return vacio;
    return {
      barrido: false,
      revisadas: 0,
      huerfanas: 0,
      borradas: 0,
      enPeriodoDeGracia: 0,
      ignoradas: 0,
      noBorrables: 0,
      mensaje:
        `El almacén (${almacen.descripcion()}) está vacío pero ${conFoto} fichas de la base dicen ` +
        "tener foto: no es que no haya nada que barrer, es que se está mirando al almacén equivocado " +
        "(revisa la configuración de fotos en docs/despliegue.md §7). No se borró nada.",
    };
  }

  // Se agrupan las variantes por clave, y la clave solo entra a juicio cuando
  // TODOS sus archivos superan el periodo de gracia.
  const limite = ahora.getTime() - EDAD_MINIMA_PARA_BARRER_MS;
  const maduras = new Set<string>();
  const recientes = new Set<string>();
  let ignoradas = 0;

  for (const { nombre, modificadoEn } of objetos) {
    const coincidencia = FORMA_ARCHIVO.exec(nombre);
    if (!coincidencia || !esClaveFotoValida(coincidencia[1])) {
      // Lo que no tiene la forma que escribe el servidor —incluido un
      // DIRECTORIO, que el adaptador local lista con una barra al final
      // (artefacto de `rsync`, restauración a medias; hallazgo B-6)— se
      // cuenta como ajeno y no se toca.
      if (nombre.endsWith("/")) {
        console.warn(
          `[fotos] en el almacén hay algo que no es un archivo con nombre de foto: se ignora (${nombre})`,
        );
      }
      ignoradas += 1;
      continue;
    }
    const clave = coincidencia[1];
    if (modificadoEn.getTime() > limite) recientes.add(clave);
    else maduras.add(clave);
  }

  for (const clave of recientes) maduras.delete(clave);
  const claves = [...maduras];

  // Salvaguarda de base plausible: si hay fotos pero la base no tiene ni un
  // negocio, casi seguro se está apuntando a la base equivocada.
  const negocios = await prisma.negocio.count();
  if (negocios === 0 && claves.length > 0) {
    return {
      barrido: false,
      revisadas: claves.length,
      huerfanas: 0,
      borradas: 0,
      enPeriodoDeGracia: recientes.size,
      ignoradas,
      noBorrables: 0,
      mensaje:
        `La base no tiene ningún negocio pero el almacén (${almacen.descripcion()}) sí tiene fotos: ` +
        "parece la base equivocada (revisa DATABASE_URL y la configuración de fotos). No se borró nada.",
    };
  }

  const conFicha = await clavesConFicha(prisma, claves);
  const huerfanas = claves.filter((clave) => !conFicha.has(clave));
  const proporcion = claves.length === 0 ? 0 : huerfanas.length / claves.length;

  // Guarda de proporción (hallazgo M-6). El error de operación que destruye
  // datos NO es apuntar a una base vacía —eso se nota enseguida— sino apuntar
  // a OTRA base poblada: staging, `test.db`, el `.env` de otro entorno. Ahí
  // ninguna clave coincide, todo parece huérfano y el barrido se lleva las
  // fotos de todos los negocios publicados, sin vuelta atrás.
  //
  // En una limpieza normal las huérfanas son una rareza suelta, así que
  // "casi todo es huérfano" es mucho mejor señal de "base equivocada" que de
  // "hubo muchos procesos muertos". Informar (`--dry-run`) nunca se bloquea:
  // es justo la forma de descubrir el problema antes de borrar.
  const demasiadaProporcion =
    huerfanas.length >= MUESTRA_MINIMA_PARA_SOSPECHAR && proporcion > PROPORCION_SOSPECHOSA;
  const demasiadoVolumen = huerfanas.length > MAXIMO_BORRADO_SIN_FORZAR;

  if (!soloInformar && !forzar && (demasiadaProporcion || demasiadoVolumen)) {
    const porcentaje = Math.round(proporcion * 100);
    return {
      barrido: false,
      revisadas: claves.length,
      huerfanas: huerfanas.length,
      borradas: 0,
      enPeriodoDeGracia: recientes.size,
      ignoradas,
      noBorrables: 0,
      mensaje:
        `De ${claves.length} fotos del almacén, ${huerfanas.length} (${porcentaje}%) no tienen ficha. ` +
        "Eso no se parece a una limpieza: se parece a estar preguntándole a la base equivocada " +
        "(revisa DATABASE_URL y la configuración de fotos, y mira antes con --dry-run). No se borró nada. " +
        "Si de verdad hay que borrarlas, vuelve a correrlo con --forzar.",
    };
  }

  let borradas = 0;
  let noBorrables = 0;
  if (!soloInformar) {
    for (const clave of huerfanas) {
      try {
        await almacen.borrar(clave);
        borradas += 1;
      } catch (error) {
        // Una clave que no se deja borrar (por ejemplo, un directorio donde
        // debería haber un archivo) no puede tumbar la pasada entera y dejar
        // el barrido inservible para siempre (hallazgo B-6): se cuenta, se
        // avisa y se sigue con las demás.
        noBorrables += 1;
        console.warn(
          `[fotos] no se pudo borrar una foto sin dueño: ${error instanceof Error ? error.name : "desconocido"}`,
        );
      }
    }
  }

  const aviso = noBorrables > 0 ? ` ${noBorrables} no se dejaron borrar (revisa el almacén).` : "";
  return {
    barrido: true,
    revisadas: claves.length,
    huerfanas: huerfanas.length,
    borradas,
    enPeriodoDeGracia: recientes.size,
    ignoradas,
    noBorrables,
    mensaje: soloInformar
      ? `Revisadas ${claves.length} fotos: ${huerfanas.length} sin ficha (no se borró nada, --dry-run).`
      : `Revisadas ${claves.length} fotos: ${borradas} sin ficha borradas.${aviso}`,
  };
}
