import type { NextConfig } from "next";

import { cabecerasDeSeguridad } from "./src/lib/seguridad/csp";

const nextConfig: NextConfig = {
  /**
   * `X-Powered-By: Next.js` fuera de todas las respuestas.
   *
   * No es una defensa —quien quiera saber qué corre aquí lo averigua igual—,
   * es no regalar el trabajo: la versión del marco es lo primero que consulta
   * un escáner automatizado contra su lista de vulnerabilidades conocidas.
   */
  poweredByHeader: false,

  /**
   * Cabeceras de seguridad en TODAS las respuestas (change
   * `preparar-deploy-produccion`): la Content-Security-Policy y, desde la
   * iteración 2, las tres que la acompañan. Todas y su porqué viven en
   * `src/lib/seguridad/csp.ts`, que es lo que la suite comprueba.
   *
   * Van en la configuración y no en un proxy porque la CSP no lleva `nonce`:
   * así las páginas estáticas —las legales, la de gracias— siguen sirviéndose
   * desde la CDN sin renderizarse por petición.
   */
  headers() {
    return Promise.resolve([{ source: "/:ruta*", headers: cabecerasDeSeguridad() }]);
  },

  /**
   * La raíz de certificación de Supabase viaja en el paquete de la función.
   *
   * Supabase firma su PostgreSQL con una CA propia que Node no trae en su
   * almacén de confianza: bajo `sslmode=require`, `pg` corta con
   * "self-signed certificate in certificate chain". La cadena de producción
   * usa `sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`
   * (`docs/despliegue.md` §3.4), y esa ruta la abre **`pg` con `fs` en tiempo
   * de ejecución**, a partir del directorio de trabajo del proceso.
   *
   * El rastreo de archivos de Next sigue `import`, `require` y usos ESTÁTICOS
   * de `fs`: un nombre que solo existe dentro de una variable de entorno le es
   * invisible. Sin esta línea, el build pasa, el repositorio tiene el
   * certificado y la función desplegada revienta al primer `SELECT`.
   *
   * La clave es `**` y no el `/*` de los ejemplos: Next compara la clave con
   * la ruta usando picomatch con `contains: true`, y con `/*` la portada `/`
   * —que se rinde por petición y lee la base— se queda fuera. `**` no deja
   * ninguna. El valor apunta al archivo concreto, y no a un comodín de la
   * raíz del repositorio, para no engordar el paquete.
   */
  outputFileTracingIncludes: {
    "**": ["certs/supabase-root-2021-ca.crt"],
  },

  experimental: {
    serverActions: {
      /**
       * El cuerpo de una Server Action viene capado a 1 MB de fábrica: con ese
       * default, una foto de 3 MB fallaba con el error genérico de Next ANTES
       * de llegar a nuestra validación, y el dueño veía un error feo en vez de
       * "Esa foto pesa más de 5 MB. Sube una más ligera." (change
       * `agregar-foto-negocio`, design.md §6).
       *
       * 6 MB deja margen para los 5 MB que admite la spec más lo que el
       * `multipart/form-data` suma en fronteras y encabezados de cada parte.
       * NO es una puerta abierta: el tope real lo sigue poniendo la validación
       * del servidor (`LIMITE_BYTES_FOTO`, `src/lib/fotos/procesar.ts`).
       */
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
