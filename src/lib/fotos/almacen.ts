/**
 * Dónde viven los bytes de las fotos (ADR-006 aplicado, design.md §1).
 *
 * Un puerto de tres operaciones —`guardar`, `leer`, `borrar`— con un
 * adaptador local para desarrollo que escribe en el directorio de `FOTOS_DIR`
 * (por defecto `.fotos/`, ignorado por git). Nada en `public/`: si las fotos
 * las sirviera el servidor estático, la comprobación de estado del negocio
 * —que es lo que impide ver la foto de un registro sin publicar— quedaría
 * fuera del camino.
 *
 * ITERACIÓN 2 del change `preparar-deploy-produccion` (hallazgo A5 de la etapa
 * C): ya hay dos adaptadores. El local sigue siendo el de desarrollo; en
 * producción entra el de **Supabase Storage** (ADR-006 + ADR-004), y se elige
 * por variables de entorno. No es una mejora opcional: con el adaptador local
 * en un hosting serverless, el borrado ARCO **miente** —borra el archivo del
 * disco de la instancia que atiende la petición, no del que lo escribió— y el
 * barrido de huérfanas informa "nada que barrer" todos los días sobre un
 * directorio recién nacido. Con el aviso de privacidad ya publicado, eso no se
 * puede desplegar.
 *
 * El puerto ganó dos operaciones que el barrido necesitaba y que antes leía
 * del sistema de archivos por su cuenta (`readdir`/`stat`): `listar` y
 * `descripcion`. Ningún requirement de spec cambia: el comportamiento
 * observable —una dirección interna que sirve la foto si el negocio está
 * publicado— es el mismo con cualquier almacén.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { esBaseLocal } from "@/lib/base-datos/conexion";
import { esProduccion } from "@/lib/sitio";

import {
  configuracionSupabase,
  crearAlmacenSupabase,
  VARIABLE_SUPABASE_LLAVE,
  VARIABLE_SUPABASE_URL,
} from "./almacen-supabase";
import { esClaveFotoValida, esVarianteFoto, VARIANTES_FOTO, type VarianteFoto } from "./clave";

/** Un archivo guardado, tal como lo ve el barrido de huérfanas. */
export type ObjetoAlmacenado = {
  /** Nombre tal cual: `<clave>.<variante>.webp` si lo escribió el servidor. */
  nombre: string;
  /** Cuándo se escribió. El barrido no juzga lo recién subido. */
  modificadoEn: Date;
};

export type AlmacenFotos = {
  guardar(clave: string, variante: VarianteFoto, bytes: Buffer): Promise<void>;
  leer(clave: string, variante: VarianteFoto): Promise<Buffer | null>;
  /** Borra TODAS las variantes de esa clave. Si ya no estaban, no truena. */
  borrar(clave: string): Promise<void>;
  /**
   * Todo lo que hay guardado, con su fecha. Lo usa el barrido de huérfanas,
   * que antes leía el directorio por su cuenta: con eso, cambiar de almacén
   * dejaba el barrido mirando a un sitio vacío e informando éxito.
   */
  listar(): Promise<ObjetoAlmacenado[]>;
  /** Cómo se nombra este almacén en un log. Nunca lleva credenciales. */
  descripcion(): string;
};

/** El nombre del archivo de una variante, sin ninguna ruta delante. */
export function nombreDeObjeto(clave: string, variante: VarianteFoto): string {
  if (!esClaveFotoValida(clave) || !esVarianteFoto(variante)) {
    throw new Error("clave o variante de foto inválida");
  }
  return `${clave}.${variante}.webp`;
}

/** Variable de entorno con el directorio del almacén (ver `.env.example`). */
export const VARIABLE_DIRECTORIO_FOTOS = "FOTOS_DIR";

/** Directorio por defecto, fuera del control de versiones (`.gitignore`). */
export const DIRECTORIO_FOTOS_DEFAULT = ".fotos";

/** Mismo molde que `EntornoPanel`: lo que hay en el entorno, sin prometer más. */
export type EntornoFotos = Record<string, string | undefined>;

/** Directorio configurado, siempre en forma absoluta. */
export function directorioDeFotos(env: EntornoFotos = process.env): string {
  const configurado = env[VARIABLE_DIRECTORIO_FOTOS]?.trim();
  return path.resolve(configurado && configurado !== "" ? configurado : DIRECTORIO_FOTOS_DEFAULT);
}

/**
 * Ruta del archivo de una variante, o un error si la clave o la variante no
 * son de las que genera el servidor.
 *
 * La clave ya es `[0-9a-f]{32}` por construcción, así que no hay forma de
 * meter `..` ni un separador; la comprobación de que la ruta resultante cae
 * dentro del directorio es el cinturón sobre los tirantes (si algún día la
 * forma de la clave cambia, esto sigue sujetando).
 */
function rutaDeVariante(
  directorio: string,
  clave: string,
  variante: VarianteFoto,
): string {
  if (!esClaveFotoValida(clave) || !esVarianteFoto(variante)) {
    throw new Error("clave o variante de foto inválida");
  }
  const ruta = path.join(directorio, `${clave}.${variante}.webp`);
  if (path.dirname(ruta) !== directorio) {
    throw new Error("la ruta de la foto se sale del almacén");
  }
  return ruta;
}

/** ¿El fallo es "ese archivo no está"? */
function esArchivoAusente(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Adaptador de desarrollo: un archivo por variante en un directorio local. */
export function crearAlmacenLocal(
  directorio: string = directorioDeFotos(),
): AlmacenFotos {
  const raiz = path.resolve(directorio);

  // Los `turbopackIgnore` de abajo son la salida que documenta el propio
  // Next.js para el acceso a archivos con ruta dinámica: sin ellos, el
  // empaquetador asume lo peor y traza TODO el proyecto (incluido `public/`)
  // dentro del bundle del servidor. Aquí la ruta no es un módulo que haya que
  // incluir: es un directorio de datos, configurado por `FOTOS_DIR` y ajeno al
  // árbol del código (ADR-006).
  return {
    async guardar(clave, variante, bytes) {
      const ruta = rutaDeVariante(raiz, clave, variante);
      await mkdir(/* turbopackIgnore: true */ raiz, { recursive: true });
      await writeFile(/* turbopackIgnore: true */ ruta, bytes);
    },

    async leer(clave, variante) {
      let ruta: string;
      try {
        ruta = rutaDeVariante(raiz, clave, variante);
      } catch {
        // Una clave que no tiene la forma del servidor no puede corresponder a
        // ningún archivo: se responde como si no existiera, sin tocar disco.
        return null;
      }
      try {
        return await readFile(/* turbopackIgnore: true */ ruta);
      } catch (error) {
        if (esArchivoAusente(error)) return null;
        throw error;
      }
    },

    async borrar(clave) {
      for (const variante of VARIANTES_FOTO) {
        let ruta: string;
        try {
          ruta = rutaDeVariante(raiz, clave, variante);
        } catch {
          return; // nada que borrar: esa clave no la escribió el servidor
        }
        // `force` hace que un archivo ya ausente no sea un error: el borrado
        // definitivo de un negocio tiene que completarse igual (spec
        // `modelo-datos`, scenario "borrado con el archivo ya ausente").
        await rm(/* turbopackIgnore: true */ ruta, { force: true });
      }
    },

    async listar() {
      let nombres: string[];
      try {
        nombres = await readdir(/* turbopackIgnore: true */ raiz);
      } catch {
        // Todavía no existe el directorio: no hay nada guardado.
        return [];
      }
      const objetos: ObjetoAlmacenado[] = [];
      for (const nombre of nombres) {
        try {
          const info = await stat(/* turbopackIgnore: true */ path.join(raiz, nombre));
          // Un DIRECTORIO con nombre de variante —un artefacto de `rsync`, una
          // restauración a medias— no es una foto. Se lista igual para que el
          // barrido lo cuente como ajeno y no lo toque.
          objetos.push({
            nombre: info.isFile() ? nombre : `${nombre}/`,
            modificadoEn: new Date(info.mtimeMs),
          });
        } catch {
          // Desapareció mientras mirábamos: no es nuestro problema.
        }
      }
      return objetos;
    },

    descripcion() {
      return `disco local (${raiz})`;
    },
  };
}

/**
 * ¿Esto es un despliegue de verdad, y no la laptop de alguien?
 *
 * Dos señales, y basta una: el hosting dice que es producción, o la base de
 * datos no está en esta máquina —que es lo que distingue un `staging` real de
 * un `npm run dev`—. Se reutiliza el mismo criterio de host efectivo que las
 * guardas de los comandos que escriben en masa (hallazgo A1), para que no haya
 * dos definiciones de "esto va en serio" que puedan discrepar.
 *
 * Sin `DATABASE_URL` se asume local, igual que `apuntaABaseLocal`: un clon
 * recién hecho no tiene que configurar nada.
 */
function esDespliegueDeVerdad(env: EntornoFotos): boolean {
  if (esProduccion(env)) return true;
  const url = (env.DATABASE_URL ?? "").trim();
  return url !== "" && !esBaseLocal(url);
}

/**
 * El almacén que NO se puede usar: el que se devuelve cuando el sistema está
 * desplegado y nadie configuró dónde viven las fotos.
 *
 * Iteración 3, hallazgo R2 de la etapa C. Con las dos variables de Supabase
 * ausentes —el olvido probable, porque son nuevas—, la versión anterior caía
 * al disco local **en silencio**, y en un hosting serverless eso es el hallazgo
 * A5 entero otra vez: las fotos no sobreviven un despliegue y el borrado ARCO
 * responde "borrado" sin borrar. Es exactamente lo que el requirement "En
 * producción ninguna configuración requerida falta en silencio" prohíbe, y lo
 * que este change ya resuelve tres veces (`DATABASE_URL`, `SITIO_URL`,
 * `CRON_SECRET`).
 *
 * Qué hace cada operación, y por qué no todas lanzan:
 *
 * - `guardar` **lanza**: es el único camino por el que se perderían datos en
 *   silencio. Y lanzar aquí NO deja el alta a medias: `procesarRegistro`
 *   atrapa el fallo y **rechaza el alta completa** con el error de foto
 *   (`MENSAJES_ERROR_FOTO.errorProcesamiento`), sin crear la ficha —lo fija
 *   `tests/foto-seguridad-adversarial.test.ts`, que además comprueba que no
 *   quede ninguna fila—. El vecino vuelve al formulario con sus datos y puede
 *   reintentar; lo que no pasa es que quede una ficha prometiendo una foto que
 *   no existe.
 * - `listar` **lanza**: el barrido de huérfanas tiene que distinguir "no hay
 *   nada" de "no pude mirar". Su cron responde 500, que es lo que se ve.
 * - `leer` devuelve `null`: aquí no se puede servir nada, y reventar una
 *   página pública no protegería a nadie. La ficha muestra su marcador.
 * - `borrar` **lanza** (iteración 4, hallazgo R4; decisión del fundador).
 *   Durante una iteración no lo hizo, con este razonamiento: "aquí nunca se
 *   escribió nada, así que no hay archivo que borrar y el borrado ARCO no
 *   miente al completarse". El razonamiento tenía un agujero: sólo vale si el
 *   almacén NUNCA estuvo configurado, y desde aquí **eso no se puede saber**.
 *   El caso que este almacén existe para atrapar es justo el otro —estuvo
 *   configurado, se subieron fotos, y la configuración se perdió (una llave
 *   rotada y no propagada, un deploy sin las variables)—, y ahí la foto SÍ
 *   está en el bucket. Callarse habría borrado la fila, contestado "borrado" y
 *   dejado un dato personal vivo **sin ninguna fila que lo nombre**, o sea
 *   fuera del alcance incluso del barrido de huérfanas. Ahora lanza, y
 *   `borrarNegocioDefinitivamente` se niega a tocar la fila.
 *
 *   La ficha SIN foto no pasa por aquí: no hay nada que alcanzar, así que se
 *   borra normal aunque el almacén esté caído.
 */
export function crearAlmacenSinConfigurar(): AlmacenFotos {
  const queFalta =
    `las fotos no tienen dónde vivir: faltan ${VARIABLE_SUPABASE_URL} y ` +
    `${VARIABLE_SUPABASE_LLAVE} (ver docs/despliegue.md §7)`;

  return {
    guardar: () => Promise.reject(new Error(queFalta)),
    leer: () => Promise.resolve(null),
    borrar: () => Promise.reject(new Error(queFalta)),
    listar: () => Promise.reject(new Error(queFalta)),
    descripcion: () => `SIN CONFIGURAR (${queFalta})`,
  };
}

let yaSeAvisoSinAlmacen = false;

/**
 * Deja constancia en el log —UNA SOLA VEZ por proceso, al ARRANCAR— de que el
 * sistema está desplegado y las fotos no tienen dónde vivir. Mismo patrón y
 * mismo sitio que los avisos de `SITIO_URL`, `DATABASE_URL` y `CRON_SECRET`
 * (`src/app/layout.tsx`).
 */
export function avisarSinAlmacenDeFotosUnaVez(env: EntornoFotos = process.env): void {
  if (yaSeAvisoSinAlmacen) return;
  if (!esDespliegueDeVerdad(env) || configuracionSupabase(env) !== null) return;
  yaSeAvisoSinAlmacen = true;
  console.error(
    `[fotos] faltan ${VARIABLE_SUPABASE_URL} y ${VARIABLE_SUPABASE_LLAVE}: en un despliegue de ` +
      "verdad el disco es efímero, así que NO se cae a él. Ninguna foto se puede guardar hasta " +
      "que se configure el almacenamiento (ver docs/despliegue.md §7).",
  );
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeAlmacenDeFotos(): void {
  yaSeAvisoSinAlmacen = false;
}

let almacenCompartido: AlmacenFotos | undefined;

/**
 * Almacén de la aplicación, creado una sola vez por proceso.
 *
 * Tres caminos, y el tercero es el que este change añadió (hallazgo R2):
 *
 * 1. Con las variables de Supabase configuradas → Supabase Storage.
 * 2. Sin ellas y en la máquina de alguien → el disco local, que es lo correcto
 *    en desarrollo.
 * 3. Sin ellas y en un despliegue de verdad → **el almacén que no se puede
 *    usar**, que falla a la vista, en vez del disco efímero en silencio.
 *
 * La elección se hace UNA vez y en un solo lugar: nadie más decide dónde viven
 * las fotos.
 */
export function almacenDeFotos(env: EntornoFotos = process.env): AlmacenFotos {
  almacenCompartido ??=
    crearAlmacenSupabase(env) ??
    (esDespliegueDeVerdad(env)
      ? crearAlmacenSinConfigurar()
      : crearAlmacenLocal(directorioDeFotos(env)));
  return almacenCompartido;
}

/** Solo para pruebas: obliga a volver a elegir almacén. */
export function reiniciarAlmacenDeFotos(): void {
  almacenCompartido = undefined;
}
