import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
