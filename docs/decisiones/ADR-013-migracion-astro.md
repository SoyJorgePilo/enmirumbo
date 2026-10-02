# ADR-013 · Migración de Next.js a Astro

**Fecha:** 2026-10-01 · **Estado:** propuesta — se decide con el spike de la Fase 0 · Reemplazaría a ADR-001 en lo que toca al marco web (Prisma, PostgreSQL, Vercel y Supabase se quedan).

## Contexto

PRD v2 §10 declara reemplazable todo lo técnico mientras §2–§7 queden intactos, y nombra a `openspec/specs/` (~1,400 scenarios) como el contrato contra el que se valida cualquier reescritura. Esta propuesta usa ese contrato como red.

### Lo que hay hoy (medido en el repo al 2026-10-01)

| Pieza | Tamaño | Acoplamiento a Next |
|---|---|---|
| `src/lib/` | 77 archivos | **Bajo**: solo 4 importan `next/*`. Dominio, Prisma, fotos, cupos, legales, SEO y seguridad se mudan tal cual |
| `src/components/` | 44 `.tsx` | **Bajo**: React puro; solo 2 son de cliente (`formulario-registro`, `boton-enviar`, con `useActionState`/`useFormStatus`) |
| `src/app/` | ~50 archivos, ~3,900 líneas | **Total**: rutas, layouts por grupo `(publico)`/`(gestion)`/`admin`, 13 Server Actions, 3 rutas API, `sitemap`, `robots`, `opengraph-image` (`next/og`), `not-found` |
| Usos de API de Next | `redirect` 88, `notFound` 46, `headers` 37, `cookies` 25, `next/link` 37 | Se traducen 1 a 1 (`Astro.redirect`, `404`, `Astro.cookies`, `Astro.request.headers`, `<a>`) |
| `next.config.ts` | cabeceras de seguridad (CSP sin nonce) + `outputFileTracingIncludes` del certificado de Supabase | Pasa a middleware/adaptador de Vercel |
| Pruebas | 117 archivos | 41 renderizan con `react-dom/server` (sobreviven si los componentes siguen en React); 46 importan `src/app` y ~24 mockean `next/headers`/`next/navigation` (se reescriben); 2 leen el build de Next (`despliegue`, `tls-certificado-supabase`) |

**Rendimiento actual:** 1.3 s en 4G y Lighthouse 100 (PRD v2 §2.7), con solo 2 componentes de cliente. **La migración no compra velocidad visible**: Next ya entrega casi cero JS en las páginas públicas.

## Pendiente del fundador: el porqué

Este ADR no puede aceptarse sin un motivo escrito, porque el de rendimiento no se sostiene con los datos. Motivos válidos posibles (elige uno o más al aprobar):

- Menos rotación del marco: Next cambia APIs entre versiones (ver `AGENTS.md`), y cada actualización cuesta revisión.
- Modelo mental más simple: páginas `.astro` + formularios HTML, sin RSC ni Server Actions.
- Costo/portabilidad del hosting.
- Aprendizaje / building in public.

## Decisión propuesta

**Migración en una rama larga, por fases, con React conservado para los componentes y paridad verificada contra las specs y contra el HTML servido.** Sin convivencia de dos apps en producción: el corte es un solo deploy con rollback instantáneo de Vercel.

Claves técnicas:

1. **Astro con `output: 'server'` + `@astrojs/vercel`**; páginas estáticas (legales, gracias) con `prerender = true`, como hoy salen de la CDN.
2. **`@astrojs/react` sin directiva `client:`**: los 42 componentes de servidor se renderizan a HTML sin JS, así que su código y sus 41 pruebas de render se mantienen. Solo el formulario de registro lleva `client:load` (o se reescribe como formulario HTML puro, lo que exige el requirement de envío sin JS).
3. **Server Actions → Astro Actions** (`accept: 'form'`) llamadas desde `<form method="POST" action={actions.x}>`, que funcionan sin JavaScript. Las 13 acciones ya delegan en `src/lib/`; el cambio es el envoltorio. Patrón POST/Redirect/GET en middleware para no reenviar formularios.
4. **Middleware único** (`src/middleware.ts`) para: cabeceras de seguridad (se conserva `cabecerasDeSeguridad()` de `src/lib/seguridad/csp.ts`), `Referrer-Policy: strict-origin` en gestión y admin, sesión del panel y exclusión de analítica en admin/gestión.
5. **Certificado de Supabase**: `includeFiles` del adaptador de Vercel en lugar de `outputFileTracingIncludes`; la prueba de `.nft.json` se reescribe contra la salida del adaptador.
6. **OG image**: `satori` + `@resvg/resvg-js` en un endpoint (lo que `next/og` usa por dentro), o imagen estática si la spec lo permite.
7. **`sitemap`/`robots`/fotos/tareas** → endpoints `.ts` en `src/pages/`. Los crons de `vercel.json` no cambian de ruta.

## Plan por fases

Cada fase es un ticket con su spec. Como el comportamiento NO cambia, cada delta solo debe decir "sin cambio de comportamiento" + los scenarios que la fase debe seguir cumpliendo. Todas corren la ruta completa del pipeline (`/implementar`), porque tocan las superficies sensibles.

| Fase | Alcance | Criterio de salida |
|---|---|---|
| **0. Spike (go/no-go)** | Rama desechable: home, una ficha, el formulario de reportar con su Action **sin JS**, cookies de sesión, CSP por cabecera, conexión `verify-full` a Supabase desde un preview de Vercel | Los 5 puntos funcionan en preview, Lighthouse ≥ el actual. Si alguno no, se archiva este ADR como `rechazada` con el porqué |
| **1. Andamio** | Astro + adaptador + React + Tailwind 4 + Vitest; `src/lib` y `src/components` sin tocar; ESLint sin `eslint-config-next`; CI con `astro build` | `npm test` de `src/lib` en verde; build en verde |
| **2. Superficie pública de lectura** | `/`, `/[destino]`, `/negocio/[ficha]`, `/buscar`, legales, 404, `sitemap`, `robots`, OG, ruta de fotos | Scenarios de `directorio`, `buscador`, `seo-local`, `paginas-legales`, `layout-base` en verde; diff de HTML vs. producción sin diferencias de contenido |
| **3. Formularios públicos** | Registro (multipart con foto, cupos por IP, versión del aviso), reportar | Scenarios de `registro`, `foto`, `reportes`; envío sin JS probado; pruebas adversariales de cupos y foto en verde |
| **4. Enlace de gestión** | `/editar/[token]` y su Action | Scenarios de `gestion`; el token no aparece en referente ni en analítica (guardianes) |
| **5. Panel admin** | Acceso, sesión, cola, detalle, 7 acciones, listado, ediciones | Scenarios de `panel-admin`; sesión y límite de acceso en verde contra Postgres real |
| **6. Corte** | Tareas programadas, cabeceras finales, retiro de Next (`next`, `eslint-config-next`, `AGENTS.md`), docs (`CLAUDE.md`, `despliegue.md`, PRD v2 §10, ADR-001 → `reemplazada`) | Suite completa en verde; prueba de humo de `despliegue.md` en preview; deploy con rollback a la mano |

### Paridad

- **Contrato:** las specs consolidadas. Ninguna se edita para que la migración pase; si una describe algo propio de Next (p. ej. `layout-base`, 2 menciones), se enmienda por `/spec` con aprobación humana.
- **Guardianes:** marca, huella legal, sesión, responsivo y no-fuga de analítica se migran **antes** que la fase que vigilan, nunca se aflojan.
- **Diff de HTML:** script que pide cada ruta del sitemap + rutas de admin/gestión con datos semilla a la build vieja y a la nueva, normaliza (atributos de Next, hashes de assets) y compara texto, enlaces, `<meta>` y JSON-LD.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Comportamiento de envío sin JS distinto (`Origin: null`, 500) — ya mordió dos veces (T-010, T-014) | Fase 0 lo prueba primero; guardián de `Referrer-Policy` por ruta |
| CSP: Astro inyecta scripts/estilos propios que la política actual no permite | Fase 0 con la CSP real; hashes vía `security.csp` si hace falta |
| Pruebas que mockean Next se reescriben y pueden perder dureza | El validador compara conteo de aserciones por archivo antes/después; ninguna se borra sin su reemplazo |
| Rama larga contra un `main` que sigue moviéndose | Congelar features durante las fases 2–6, o fusionar `main` al cierre de cada fase (proceso §5c) |
| Diferencias de caché/ISR en Vercel | Hoy casi todo es dinámico por petición; verificar cabeceras `Cache-Control` en el diff de la fase 2 |

## Alternativas consideradas

- **Quedarse en Next y solo actualizar:** cero riesgo de paridad; mantiene la rotación del marco. Es la opción por defecto si la Fase 0 falla o si el porqué no se escribe.
- **Reescritura sin React (componentes `.astro`):** más idiomático, pero tira 41 archivos de pruebas de render y ~44 componentes probados. Se puede hacer después, componente por componente.
- **Convivencia por rutas (strangler con rewrites de Vercel):** dos apps, dos builds y sesión compartida entre ellas; demasiado andamiaje para ~50 rutas.

## Cuándo revisarla

Al cerrar la Fase 0. Si el spike pasa, se acepta y se crean los tickets T-021 a T-026. Si falla, pasa a `rechazada` con la evidencia del spike.
