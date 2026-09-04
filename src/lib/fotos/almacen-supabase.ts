/**
 * Adaptador de producción del almacén de fotos: **Supabase Storage**
 * (ADR-006 + ADR-004, ejecutado en la iteración 2 del change
 * `preparar-deploy-produccion` tras el hallazgo A5 de la etapa C).
 *
 * POR QUÉ ENTRÓ AHORA Y NO EN OTRO TICKET. Con el adaptador de disco en un
 * hosting serverless (ADR-007) el borrado ARCO **miente**: `almacen.borrar()`
 * borra el archivo del disco de la instancia que atiende la petición, no del
 * de la instancia que lo escribió, no falla, y el panel dice "borrado"
 * mientras la foto se sigue sirviendo desde otra instancia. Un dato personal
 * —la fachada de un negocio, la cara de su dueño— sobreviviendo a una
 * solicitud ARCO y a la purga de los 90 días, con el aviso de privacidad ya
 * publicado, es lo que hizo que esto dejara de ser "una mejora pendiente".
 *
 * SIN SDK, A PROPÓSITO. Supabase Storage tiene una API HTTP normal y aquí sólo
 * se usan cuatro llamadas. Meter `@supabase/supabase-js` para eso serían
 * megabytes de dependencia en cada función serverless y una capa más que
 * mantener al día. `fetch` es global en el runtime de Next.
 *
 * LA LLAVE. Se usa la clave de servicio (`service_role`), que salta las
 * políticas de fila: es correcto porque quien decide si una foto se puede ver
 * es NUESTRO servidor —comprueba en cada petición que el negocio esté
 * publicado— y no la base. Por eso el bucket tiene que ser **privado**: si
 * fuera público, cualquiera podría pedir la foto de un registro en revisión
 * saltándose esa comprobación. Está en `docs/despliegue.md` §7.
 */
import { esClaveFotoValida, esVarianteFoto, VARIANTES_FOTO, type VarianteFoto } from "./clave";
import type { AlmacenFotos, ObjetoAlmacenado } from "./almacen";

/** URL del proyecto de Supabase (`https://xxxx.supabase.co`). */
export const VARIABLE_SUPABASE_URL = "SUPABASE_URL";
/** Clave de servicio. ES UN SECRETO: nunca sale del servidor ni de un log. */
export const VARIABLE_SUPABASE_LLAVE = "SUPABASE_SERVICE_ROLE_KEY";
/** Bucket donde viven las fotos. Privado. */
export const VARIABLE_SUPABASE_BUCKET = "SUPABASE_BUCKET_FOTOS";

/** Nombre del bucket si no se declara otro. */
export const BUCKET_FOTOS_DEFAULT = "fotos";

export type EntornoSupabase = Record<string, string | undefined>;

export type ConfiguracionSupabase = {
  url: string;
  llave: string;
  bucket: string;
};

/** Cuántos objetos pide cada página del listado. */
const TAMANO_PAGINA = 500;

/**
 * La configuración, o `null` si no está completa.
 *
 * FAIL-SAFE, mismo criterio que el panel y la analítica: con las dos variables
 * obligatorias puestas se usa Supabase; sin ninguna, el disco local (que es lo
 * correcto en desarrollo). Con UNA sola puesta se avisa y NO se usa Supabase:
 * una configuración a medias que cayera al disco en silencio es justo el
 * despliegue que pierde las fotos sin que nadie se entere.
 */
export function configuracionSupabase(
  env: EntornoSupabase = process.env,
): ConfiguracionSupabase | null {
  const url = (env[VARIABLE_SUPABASE_URL] ?? "").trim().replace(/\/+$/, "");
  const llave = (env[VARIABLE_SUPABASE_LLAVE] ?? "").trim();
  const bucket = (env[VARIABLE_SUPABASE_BUCKET] ?? "").trim() || BUCKET_FOTOS_DEFAULT;

  if (url === "" && llave === "") return null;
  if (url === "" || llave === "") {
    avisarConfiguracionAMediasUnaVez(url === "" ? VARIABLE_SUPABASE_URL : VARIABLE_SUPABASE_LLAVE);
    return null;
  }
  if (!/^https:\/\//i.test(url)) {
    avisarConfiguracionAMediasUnaVez(`${VARIABLE_SUPABASE_URL} (tiene que ser https:)`);
    return null;
  }
  return { url, llave, bucket };
}

let yaSeAvisoConfiguracion = false;

function avisarConfiguracionAMediasUnaVez(queFalta: string): void {
  if (yaSeAvisoConfiguracion) return;
  yaSeAvisoConfiguracion = true;
  console.error(
    `[fotos] configuración de Supabase Storage incompleta (${queFalta}): se usa el disco local. ` +
      "En un hosting serverless eso significa que las fotos NO sobreviven un despliegue y que el " +
      "borrado ARCO no borra de verdad (ver docs/despliegue.md §7).",
  );
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeSupabase(): void {
  yaSeAvisoConfiguracion = false;
}

/** Lo que este adaptador necesita del mundo: se inyecta para poder probarlo. */
export type PedirHttp = (url: string, opciones: RequestInit) => Promise<Response>;

function nombreDe(clave: string, variante: VarianteFoto): string {
  if (!esClaveFotoValida(clave) || !esVarianteFoto(variante)) {
    throw new Error("clave o variante de foto inválida");
  }
  return `${clave}.${variante}.webp`;
}

/**
 * Adaptador de Supabase Storage, o `null` si no está configurado.
 *
 * `pedir` se inyecta en las pruebas: así la suite ejercita el adaptador entero
 * —las cuatro llamadas, sus cabeceras y cómo interpreta cada respuesta— sin
 * tocar la red. Las llamadas de verdad se comprueban en la prueba de humo del
 * despliegue (`docs/despliegue.md` §9).
 */
export function crearAlmacenSupabase(
  env: EntornoSupabase = process.env,
  pedir: PedirHttp = (url, opciones) => fetch(url, opciones),
): AlmacenFotos | null {
  const configuracion = configuracionSupabase(env);
  if (!configuracion) return null;
  return almacenSupabase(configuracion, pedir);
}

/** El adaptador con la configuración ya resuelta (lo usan las pruebas). */
export function almacenSupabase(
  { url, llave, bucket }: ConfiguracionSupabase,
  pedir: PedirHttp = (destino, opciones) => fetch(destino, opciones),
): AlmacenFotos {
  const autorizacion = { Authorization: `Bearer ${llave}`, apikey: llave };
  const objeto = (nombre: string) =>
    `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(nombre)}`;

  /** Nunca deja escapar la llave ni la URL firmada en el mensaje de error. */
  const fallo = (que: string, respuesta: Response) =>
    new Error(`Supabase Storage: ${que} respondió ${respuesta.status}`);

  return {
    async guardar(clave, variante, bytes) {
      const respuesta = await pedir(objeto(nombreDe(clave, variante)), {
        method: "POST",
        headers: {
          ...autorizacion,
          "Content-Type": "image/webp",
          // Subir una foto nueva sobre la misma clave no puede fallar por
          // "ya existe": las claves se regeneran en cada subida, pero un
          // reintento del mismo alta sí repite la clave.
          "x-upsert": "true",
        },
        body: new Uint8Array(bytes),
      });
      if (!respuesta.ok) throw fallo("guardar", respuesta);
    },

    async leer(clave, variante) {
      let nombre: string;
      try {
        nombre = nombreDe(clave, variante);
      } catch {
        // Una clave que no tiene la forma del servidor no puede corresponder a
        // ningún archivo: se responde como si no existiera, sin salir a la red.
        return null;
      }
      const respuesta = await pedir(objeto(nombre), {
        method: "GET",
        headers: autorizacion,
      });
      if (respuesta.status === 404) return null;
      if (!respuesta.ok) throw fallo("leer", respuesta);
      return Buffer.from(await respuesta.arrayBuffer());
    },

    async borrar(clave) {
      let nombres: string[];
      try {
        nombres = VARIANTES_FOTO.map((variante) => nombreDe(clave, variante));
      } catch {
        return; // esa clave no la escribió el servidor: nada que borrar
      }
      // Borrado en lote: una sola llamada para las dos variantes. Un archivo
      // que ya no estaba NO es un error (spec `modelo-datos`, scenario
      // "borrado con el archivo ya ausente"): Supabase devuelve 200 con la
      // lista de lo que sí borró.
      const respuesta = await pedir(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: { ...autorizacion, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: nombres }),
      });
      if (!respuesta.ok && respuesta.status !== 404) throw fallo("borrar", respuesta);
    },

    async listar() {
      const objetos: ObjetoAlmacenado[] = [];
      for (let pagina = 0; ; pagina += 1) {
        const respuesta = await pedir(
          `${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`,
          {
            method: "POST",
            headers: { ...autorizacion, "Content-Type": "application/json" },
            body: JSON.stringify({
              prefix: "",
              limit: TAMANO_PAGINA,
              offset: pagina * TAMANO_PAGINA,
              sortBy: { column: "name", order: "asc" },
            }),
          },
        );
        if (!respuesta.ok) throw fallo("listar", respuesta);

        const tanda = (await respuesta.json()) as Array<{
          name?: unknown;
          updated_at?: unknown;
          created_at?: unknown;
        }>;
        if (!Array.isArray(tanda) || tanda.length === 0) return objetos;

        for (const entrada of tanda) {
          if (typeof entrada?.name !== "string") continue;
          const fecha = entrada.updated_at ?? entrada.created_at;
          objetos.push({
            nombre: entrada.name,
            // Sin fecha, se trata como recién escrito: el barrido no juzga lo
            // que no puede fechar, que es lo seguro.
            modificadoEn: typeof fecha === "string" ? new Date(fecha) : new Date(),
          });
        }
        if (tanda.length < TAMANO_PAGINA) return objetos;
      }
    },

    descripcion() {
      // Ni la llave ni el dominio completo: sólo lo que sirve para saber
      // dónde está mirando el barrido.
      return `Supabase Storage (bucket "${bucket}")`;
    },
  };
}
