// Módulos virtuales de `src/astro/integraciones/imagen-de-marca.ts`.

declare module "virtual:enmirumbo/versiones" {
  /** Hash del PNG de la imagen de marca (parámetro de versión de `og:image`). */
  export const versionImagenDeMarca: string;
  /** Hash de `public/favicon.ico` (parámetro de versión del icono). */
  export const versionIcono: string;
}

declare module "virtual:enmirumbo/imagen-de-marca-png" {
  /** El PNG de la imagen de marca, en base64. Solo para la ruta prerenderizada. */
  export const pngBase64: string;
}
