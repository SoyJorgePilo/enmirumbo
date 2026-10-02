// @ts-check
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import { defineConfig, passthroughImageService } from "astro/config";

import { cabecerasEnLaCdn } from "./src/astro/integraciones/cabeceras-en-la-cdn";
import { imagenDeMarca } from "./src/astro/integraciones/imagen-de-marca";

/**
 * Astro en la raíz (ADR-013, Fase 1; change `agregar-andamio-astro`,
 * design.md §6). En la rama `migracion-astro` este es el único build: Next
 * queda como código fuente inerte hasta el corte (design.md §1).
 *
 * Fase 2a (change `migrar-lectura-publica-astro`): el middleware de
 * cabeceras vive en `src/middleware.ts`; aquí se registran la imagen de marca
 * (generada al construir) y las cabeceras de lo que sirve la CDN.
 * `checkOrigin` y `env.schema` entran con las fases que los usan (3–5).
 *
 * Tailwind no se monta aquí: Vite carga solo `postcss.config.mjs` de la raíz,
 * el mismo `@tailwindcss/postcss` que usa Next (design.md §2).
 */
/**
 * Quita `/_image` de la tabla de rutas que el adaptador escribe en
 * `.vercel/output/config.json`. Astro inyecta esa ruta en toda salida `server`
 * (sin opción para no hacerlo) y el adaptador la toma de su hook
 * `astro:routes:resolved`; aquí se le pasa la lista sin ella. Si una versión
 * futura del adaptador deja de usar ese hook, el build se cae aquí en vez de
 * volver a publicar la ruta en silencio.
 *
 * @param {import("astro").AstroIntegration} adaptador
 * @returns {import("astro").AstroIntegration}
 */
function sinRutaDeImagen(adaptador) {
  const original = adaptador.hooks["astro:routes:resolved"];
  if (!original) {
    throw new Error("@astrojs/vercel ya no usa astro:routes:resolved: revisa sinRutaDeImagen en astro.config.mjs");
  }
  adaptador.hooks["astro:routes:resolved"] = (params) =>
    original({ ...params, routes: params.routes.filter((ruta) => ruta.pattern !== "/_image") });
  return adaptador;
}

export default defineConfig({
  // Todo por petición salvo lo que diga `prerender = true`, como hoy en la app.
  output: "server",
  adapter: sinRutaDeImagen(
    vercel({
      // La raíz de certificación de Supabase viaja en la función: `pg` la abre
      // con `fs` en tiempo de ejecución (`sslrootcert=certs/...`) y el rastreo
      // de dependencias no la ve. Equivale a `outputFileTracingIncludes` de
      // `next.config.ts`, que se queda mientras sus pruebas lo lean (T-027).
      includeFiles: ["./certs/supabase-root-2021-ca.crt"],
    }),
  ),
  // `cabecerasEnLaCdn` reescribe el `config.json` del adaptador en
  // `astro:build:done`; Astro corre ese hook primero en el adaptador y luego
  // en estas, en este orden. Si el archivo no existe aún, el build truena.
  // `cabecerasEnLaCdn` reescribe el `config.json` del adaptador en
  // `astro:build:done`; Astro corre ese hook primero en el adaptador y luego
  // en estas, en este orden. Si el archivo no existe aún, el build truena.
  integrations: [react(), imagenDeMarca(), cabecerasEnLaCdn()],
  vite: {
    // `src/app/globals.css` empieza con `@import "tailwindcss"`. En los
    // entornos de servidor de Vite (`ssr` y `prerender`) el resolvedor de
    // `@import` de CSS trata los paquetes como externos y devolvía el
    // especificador sin resolver (el build tronaba con ENOENT
    // `<raíz>/tailwindcss`). Agruparlo deja que lo resuelva por su campo
    // `style`, igual que hace Astro con `@fontsource/*`.
    environments: {
      prerender: { resolve: { noExternal: ["tailwindcss"] } },
      ssr: { resolve: { noExternal: ["tailwindcss"] } },
    },
  },
  image: {
    // Sin optimizador: las fotos ya salen en su tamaño final y en WebP (spec
    // `directorio-publico`), y ningún componente pinta `/_image`.
    service: passthroughImageService(),
    // `/_image` cerrado. El endpoint genérico de Astro, aun con este servicio,
    // reenvía rutas del MISMO sitio con la cookie de quien pide (p. ej.
    // `/_image?href=/admin/negocios` devolvía el panel) y lo marca como caché
    // pública de un año. Astro inyecta la ruta en toda salida `server` sin
    // opción para quitarla, así que: su manejador se cambia por uno que
    // responde 404 (lo único que llega a la función) y `sinRutaDeImagen` la
    // saca de la tabla de rutas de Vercel. Lo vigila
    // `tests/plataforma-astro-build.test.ts`.
    endpoint: { route: "/_image", entrypoint: "./src/astro/imagen-cerrada.ts" },
  },
});
