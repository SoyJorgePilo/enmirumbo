# Propuesta: explorar-migracion-astro

**Ticket:** `docs/tickets/T-021-spike-astro.md` (P1, épica E9)
**PRD:** v2 §10 (lo técnico es reemplazable si §2–§7 quedan intactos); §2.1 (sin cuentas: el único login es el del panel), §2.5 (honestidad estructural: falla a la vista), §2.7 (mobile-first, <2 s en 4G, hoy Lighthouse 100)
**Decisión que alimenta:** `docs/decisiones/ADR-013-migracion-astro.md` (Fase 0)

## Por qué

ADR-013 propone migrar de Next.js a Astro, pero la condiciona a un spike que pruebe los cinco puntos donde la migración podría romper un principio no negociable del PRD v2 §2: envío de formularios sin JavaScript, sesión del panel, cabeceras de seguridad, conexión verificada a la base y rendimiento (T-021, contexto). El PRD v2 §10 permite cambiar toda la técnica solo si §2–§7 quedan intactos; este change produce la evidencia para decidirlo, no código reutilizable.

## Qué cambia

- **Una mini-app Astro aislada en `spikes/astro/`**, desplegada en un preview de Vercel propio, que NO toca `src/`, el `package.json` raíz, el CI, `vercel.json`, el despliegue de producción ni la base de producción.
- **Cinco pruebas observables en ese preview**, una por punto del ticket:
  1. Formulario `POST` resuelto por una Astro Action que funciona con JS apagado, con POST/Redirect/GET y error de validación en español, sin `Origin: null` ni 500 (la regresión de T-010 y T-014).
  2. Cookie de sesión firmada, `HttpOnly` y `SameSite` emitida y leída en middleware; ruta protegida que responde 307 sin ella.
  3. Las cabeceras de `cabecerasDeSeguridad()` (`src/lib/seguridad/csp.ts`) en todas las respuestas, CSP sin `nonce`, y una página con componente React renderizado en servidor sin violaciones de CSP.
  4. Lectura de PostgreSQL con Prisma sobre `sslmode=verify-full` y el certificado de Supabase empaquetado con `includeFiles`, contra una base desechable con datos ficticios.
  5. Lighthouse móvil ≥ al de la portada actual (100) y 0 KB de JS propio en páginas sin formulario interactivo.
- **Un reporte de veredicto** en `docs/decisiones/ADR-013-spike.md`: pasa / falla / pasa con costo por punto, evidencia y recomendación go/no-go. Si algún punto falla, ADR-013 pasa a `rechazada`.
- **Ningún comportamiento de producto existente cambia.** Ninguna spec de `openspec/specs/` se modifica.

## Capacidades afectadas

- **`spike-astro`** (nueva, temporal) — ADDED: aislamiento del spike, los cinco puntos y el reporte de veredicto.
- **Ninguna capacidad existente cambia.** Los literales que el spike reutiliza (p. ej. "Dinos qué pasa con este negocio", de `directorio-publico`) se usan como muestra, sin alterar su spec.

**Al archivar este change, los deltas de `spike-astro` NO se consolidan a `openspec/specs/`.** El spike es desechable: describe un experimento, no comportamiento del sistema. Se archiva el change con su reporte, y la capacidad no nace en la verdad consolidada. Si ADR-013 se acepta, el comportamiento real lo fijarán las specs de las fases 1–6, que dirán "sin cambio de comportamiento" contra las capacidades actuales.

## Impacto en código (alto nivel)

- **Nuevo:** `spikes/astro/` con su propio `package.json`, `astro.config` (`output: 'server'`, `@astrojs/vercel`, `@astrojs/react`), middleware, una Action, unas pocas páginas y su propio esquema Prisma mínimo. Puede importar de `src/lib/` en solo lectura (p. ej. `cabecerasDeSeguridad()`) sin modificarlo.
- **Raíz, mínimo y sin efecto en producción:** excluir `spikes/` del `tsconfig.json` (hoy incluye `**/*.ts`) y de los `globalIgnores` de `eslint.config.mjs`, para que `next build`, `tsc` y ESLint de la app no intenten compilar código de Astro. Ninguna otra línea fuera de `spikes/` cambia.
- **Infraestructura fuera del repo:** un proyecto de Vercel aparte con *Root Directory* `spikes/astro`, y una base PostgreSQL desechable; credenciales solo en variables de entorno de ese proyecto.
- **Docs:** `docs/decisiones/ADR-013-spike.md` (nuevo) y, según el veredicto, el estado de ADR-013 y su fila en `docs/decisiones/README.md`.

## Fuera de este change

- Migrar cualquier ruta, componente o prueba real (Fases 1–6 de ADR-013).
- Cambiar `package.json` raíz, CI, `vercel.json` o el despliegue de producción.
- Reescribir componentes sin React.
- **El porqué de la migración** (ADR-013 §Pendiente del fundador): el spike mide viabilidad, no justifica la decisión.
- Descubierto al escribir la spec, sin especificar aquí:
  - El formulario multipart con foto del registro (cupos por IP, compresión) no se prueba; es el envío sin JS más pesado y es de la Fase 3.
  - `Referrer-Policy: strict-origin` por ruta en gestión/admin se prueba solo en la página del formulario del spike, no como esquema completo de rutas.
  - OG image con `satori`, `sitemap`, `robots` y crons no se prueban.
