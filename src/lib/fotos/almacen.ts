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
 * Cuando E0-3 confirme proveedor de almacenamiento se escribe el adaptador
 * correspondiente y se cambia la variable de entorno: ningún requirement de
 * spec cambia, porque el comportamiento observable (una dirección interna que
 * sirve la foto si el negocio está publicado) es el mismo con cualquier
 * almacén. Consecuencia anotada: en un hosting serverless el adaptador local
 * no sirve (filesystem efímero), así que el despliegue CON fotos depende de
 * esa decisión.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { esClaveFotoValida, esVarianteFoto, VARIANTES_FOTO, type VarianteFoto } from "./clave";

export type AlmacenFotos = {
  guardar(clave: string, variante: VarianteFoto, bytes: Buffer): Promise<void>;
  leer(clave: string, variante: VarianteFoto): Promise<Buffer | null>;
  /** Borra TODAS las variantes de esa clave. Si ya no estaban, no truena. */
  borrar(clave: string): Promise<void>;
};

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
  };
}

let almacenCompartido: AlmacenFotos | undefined;

/** Almacén de la aplicación, creado una sola vez por proceso. */
export function almacenDeFotos(): AlmacenFotos {
  almacenCompartido ??= crearAlmacenLocal();
  return almacenCompartido;
}
