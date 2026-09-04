/**
 * Los tokens de color de `src/app/globals.css` en JavaScript.
 *
 * Existe por UN solo caso: la imagen de marca para compartir
 * (`src/app/opengraph-image.tsx`) la dibuja `next/og` con estilos en línea,
 * fuera del CSS del sitio, así que no puede usar las clases de Tailwind.
 * Copiar los hexadecimales dentro del componente rompería la regla del
 * proyecto ("la única fuente de color es @theme"), así que viven aquí y
 * `tests/seo-artefactos.test.ts` falla si dejan de coincidir con globals.css.
 *
 * Ningún componente del sitio debe importar esto: para pintar en pantalla
 * están los tokens de Tailwind (`bg-fondo`, `text-tinta`, `bg-accion`…).
 */
export const COLORES_MARCA = {
  fondo: "#ffffff",
  superficie: "#f4f4f5",
  tinta: "#171717",
  "tinta-suave": "#52525b",
  accion: "#25d366",
  "accion-fuerte": "#0f7a41",
} as const;
