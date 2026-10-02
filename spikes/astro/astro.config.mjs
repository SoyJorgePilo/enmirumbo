// @ts-check
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField } from "astro/config";

import { cabecerasEnLaCdn } from "./src/integraciones/cabeceras-en-la-cdn";

// Spike de ADR-013 (T-021). Todo por petición salvo lo que diga
// `prerender = true`, como hoy en la app.
export default defineConfig({
  output: "server",
  adapter: vercel({
    // La raíz de certificación de Supabase viaja en la función: `pg` la abre
    // con `fs` en tiempo de ejecución (sslrootcert=...), y el rastreo de
    // dependencias no la ve. Equivale a `outputFileTracingIncludes` de Next.
    includeFiles: ["./certs/supabase-root-2021-ca.crt"],
  }),
  integrations: [react(), cabecerasEnLaCdn()],
  env: {
    schema: {
      SPIKE_SESION_SECRETO: envField.string({ context: "server", access: "secret", optional: true }),
      DATABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // El spike importa en solo lectura de `src/lib` y `src/components` de la
      // app (dos niveles arriba). Solo afecta a `astro dev`.
      fs: { allow: ["../.."] },
    },
  },
});
