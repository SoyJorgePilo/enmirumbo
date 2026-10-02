# Propuesta: agregar-andamio-astro

**Ticket:** `docs/tickets/T-022-andamio-astro.md` (P1, épica E9)
**PRD:** v2 §10 (lo técnico es reemplazable si §2–§7 quedan intactos; las specs consolidadas son el contrato de cualquier reescritura)
**Decisión que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 1. Aprendizajes del spike: `docs/decisiones/ADR-013-spike.md` y `openspec/changes/explorar-migracion-astro/reports/b-dev.md`.

## Por qué

ADR-013 migra el marco web de Next.js a Astro por fases, en la rama larga `migracion-astro`, sin cambio de comportamiento. T-022 es la Fase 1: dejar Astro instalado y construyendo en la raíz, con la suite, el lint y el CI funcionando con él, antes de mover cualquier ruta (T-022, contexto). El spike encontró que 20 de 44 componentes importan `next/link`/`next/image` (ADR-013-spike, costo 3b), así que este andamio incluye la capa que los desacopla sin tocar su marcado.

## Qué cambia

- **Astro en la raíz** (`output: 'server'`, `@astrojs/vercel`, `@astrojs/react`, Tailwind 4) como build oficial de la rama: `npm run build` pasa a `astro build`. El certificado de Supabase viaja en la función con `includeFiles` (patrón del spike).
- **Next queda instalado pero sin construirse** hasta el corte (T-027): `src/app/`, `next.config.ts` y el paquete `next` se conservan porque la suite actual los importa. Cómo conviven sin chocar: `design.md` §1.
- **Capa de compatibilidad** en `src/components/compat/`: `Link` e `Imagen`, que producen el mismo HTML que `next/link` y `next/image` con las props que hoy se usan. Los 20 componentes solo cambian su línea de `import`.
- **Vitest** capaz de renderizar `.astro` (además de todo lo que ya corre), con una prueba de humo que demuestra que un componente de React se pinta en servidor sin JS.
- **ESLint sin `eslint-config-next`**, con las mismas reglas que hoy aplican fuera de `@next/next/*` (TypeScript, React, hooks, accesibilidad) y soporte para `.astro`.
- **CI**: lint, revisión de tipos, `astro build` sin base, migraciones, seed y suite, sobre la misma base efímera de hoy.
- **Ningún comportamiento de producto, ninguna ruta y ningún texto de UI cambia.** No se modifica ninguna spec de `openspec/specs/`.

## Capacidades afectadas

- **`plataforma-astro`** (nueva) — ADDED: build, render de React sin JS, capa de compatibilidad, paridad de la suite, lint y CI del nuevo marco.
- **Ninguna capacidad existente cambia en este change.**

### Enmiendas necesarias (NO se editan aquí; van por `/spec` con aprobación humana en la fase que las toque)

Requirements consolidados que hoy describen algo propio de Next y que la migración volverá falsos en su letra, aunque no en su comportamiento:

| Spec | Requirement | Qué dice de Next | Fase que lo toca |
|---|---|---|---|
| `despliegue` | "El build de producción no necesita la base de datos" | "`next build` DEBE completarse sin ninguna base…" | **Esta (T-022)**: el build ya es `astro build`. El scenario de este change exige lo mismo para `astro build`; la letra del requirement queda desfasada hasta enmendarla |
| `layout-base` | "Server Component con documento en es-MX y metadata base" (+ su mención en el encabezado del requirement del header) | "El layout global DEBE ser un Server Component"; scenario "sin JS de cliente en el layout" con la directiva `"use client"` | T-023 |
| `layout-base` | "La medición cookieless se carga solo si está configurada…" | Variables `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID`; Astro solo expone al cliente el prefijo `PUBLIC_` (renombrarlas toca Vercel y `.env.example`) | T-023 |
| `layout-base` | "Un solo script diferido y cero JavaScript propio de cliente" | `"use client"` | T-023 |
| `directorio-publico` | "Directorio en Server Components, mobile-first y usable sin JavaScript" | Server Components, `"use client"` | T-023 |
| `paginas-legales` | "Las páginas legales son Server Components mobile-first sin JavaScript de cliente" | Server Components, `"use client"` | T-023 |
| `revision-admin` | "El panel se opera desde el celular y sin JavaScript de cliente innecesario" | Server Component, `"use client"` | T-026 |
| `despliegue` | "El 404 de las tareas programadas no las delata" | "el 404 vacío que el marco de trabajo emite": neutral en la letra, pero la prueba compara contra el 404 de Next | T-027 (verificar, quizá sin enmienda) |

## Impacto en código (alto nivel)

- **Nuevo:** `astro.config.mjs`; `src/components/compat/` (`Link`, `Imagen`) con sus pruebas de paridad; una prueba de humo de `.astro` con su fixture en `tests/`.
- **Modificado:** `package.json` (dependencias de Astro y de ESLint, scripts `dev`/`build`/`start`/tipos), `package-lock.json`, `tsconfig.json` (tipos de Astro, sin quitar lo de Next), `vitest.config.mts`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `.gitignore` (`/dist/`, `/.astro/`); en 20 componentes de `src/components/`, solo la línea de `import` de `next/link`/`next/image`.
- **Sin tocar:** `src/lib/`, `src/app/`, `next.config.ts`, `vercel.json`, `prisma/`, `openspec/specs/`, `spikes/astro/`.

## Fuera de este change

- Cualquier ruta, página, layout, endpoint, middleware o Astro Action (Fases 2–5).
- Cabeceras de seguridad en Astro (middleware e integración para prerenderizadas del spike) y la decisión sobre el 403 de `checkOrigin` (Fases 2–3).
- Los 9 componentes que reciben una Server Action como prop: se adaptan en la fase de su formulario (3–5).
- Retirar `next`, `eslint-config-next`, `next.config.ts`, `AGENTS.md`, y reescribir `tests/despliegue.test.ts`/`tests/tls-certificado-supabase.test.ts` contra la salida del adaptador (T-027). Al retirar `next`, las pruebas de paridad de la capa contra `next/link`/`next/image` deben convertirse en expectativas literales.
- Previews de Vercel de la rama `migracion-astro` (configuración del proyecto o `vercel.json`): ver dudas.
- Descubierto al escribir la spec, sin especificar aquí:
  - `engines` de Node: CI usa 22, el runtime de Vercel 24 y el spike corrió en 26 (b-dev, hallazgo 4).
  - El build de Astro emite `/_astro/client.*.js` (191 KB) aunque ninguna página lo cargue (b-dev, hallazgo 3).
  - Deuda de `src/lib/base-datos/conexion.ts` (`modoTlsDeclarado`, primera coincidencia de `sslmode`) señalada en b-dev: ticket aparte.
  - `openspec/project.md` y `CLAUDE.md` siguen diciendo "Next.js": se actualizan en el corte.
