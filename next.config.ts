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
