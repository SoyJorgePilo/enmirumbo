# Etapa C · seguridad — agregar-andamio-astro (T-022)

**Veredicto: PASA al validador.** 0 críticos, 0 altos, 3 medios (no bloquean; dos son latentes y deben cerrarse antes de la Fase 2). Más un aviso preexistente fuera del diff que conviene atender en `main` por separado.

Revisado: diff contra `migracion-astro` + archivos sin seguimiento, `npm audit` antes/después, lockfile, salida real de `astro build` (`.vercel/output/`), el endpoint `/_image` ejecutado, reglas efectivas de ESLint con `--print-config` antes/después.

## Hallazgos

### Medio 1 — `/_image` reenvía cualquier ruta del mismo origen con las cookies de quien pide y la marca como caché pública de 1 año (latente)

- `astro.config.mjs:26-32` (`passthroughImageService()`), endpoint inyectado `node_modules/astro/dist/assets/endpoint/generic.js` (en el bundle: `.vercel/output/functions/_render.func/dist/server/chunks/generic_*.mjs`, `GET`).
- El comentario del config dice que con este servicio "no transforma nada, y sin `image.domains` no trae imágenes de fuera". Es cierto para dominios externos (verificado: `//evil.example`, `https://…`, `http://169.254.169.254/…` → 403; las redirecciones se revisan salto por salto; no hay SSRF externo). Pero para rutas **locales** el endpoint hace `fetch(new URL(href, url.origin))` **con los encabezados de la petición original (incluida la cookie)**, y el servicio `noop` devuelve el cuerpo sin tocarlo con `Cache-Control: public, max-age=31536000`.
- Reproducido con el handler construido y un servidor ficticio: `GET /_image?href=/admin/negocios` con `Cookie: sesion_admin=ficticia` → **200**, cuerpo = HTML del panel (datos ficticios), `content-type: image/undefined`, `cache-control: public, max-age=31536000`. Sin cookie → 404.
- Explotación (cuando existan páginas Astro, Fases 2–5): se le manda al admin por WhatsApp un enlace `https://<sitio>/_image?href=/admin/negocios` (navegación de primer nivel: la cookie `SameSite=Lax` viaja). La respuesta con el HTML del panel (WhatsApp de negocios, enlaces de gestión) queda marcada como pública por un año: cualquier caché compartida intermedia (proxy corporativo/ISP, o la CDN si alguna capa añade `s-maxage`) la puede servir a terceros. Además convierte cualquier página autenticada en "imagen" y salta cabeceras que se pongan por ruta.
- Hoy no es explotable: la salida no tiene páginas (todo cae en 404 salvo `/_image`), y producción sigue en Next desde `main`.
- Propuesta (para el dev o la spec de la Fase 2, antes de añadir rutas): no exponer `/_image` (p. ej. `image.endpoint` hacia un entrypoint propio que responda 404, o bloquearlo en el middleware de la Fase 2) y agregar una prueba que pida `/_image?href=/admin` y espere 404. Corregir el comentario de `astro.config.mjs`.

### Medio 2 — `path-to-regexp@6.1.0` (GHSA-9wv6-86v2-598j, ReDoS, "high" en `npm audit`) nuevo y empaquetado en la función

- Lo trae `@astrojs/vercel@11.0.11 → @vercel/routing-utils@6.6.0` (fija `path-to-regexp: 6.1.0` y además `path-to-regexp-updated: npm:path-to-regexp@6.3.0`). Viaja en `.vercel/output/functions/_render.func/node_modules/path-to-regexp/`; `entry.mjs` hace `import "@vercel/routing-utils"`.
- No encontré camino desde la petición: las expresiones solo se construyen con rutas del propio proyecto (`superstatic.js`, al generar `config.json`), no con entrada del vecino. Por eso medio y no alto.
- `npm audit`: antes 7 avisos (1 crítico `next`, 5 altos, 1 moderado); después 10 (+`@astrojs/vercel`, `@vercel/routing-utils`, `path-to-regexp`, los tres por esta misma cadena). `npm audit fix --force` propone bajar a `@astrojs/vercel@8` (no sirve).
- Propuesta: `"overrides": { "@vercel/routing-utils": { "path-to-regexp": "6.3.0" } }` (misma mayor) o dejarlo anotado como riesgo aceptado en el ticket con esta justificación.

### Medio 3 — Scenarios automatizables sin prueba

Verificados a mano por el dev (reporte b-dev), pero sin nada que los vigile en CI:
- "el certificado viaja con la función": si `includeFiles` se rompe, el despliegue arranca sin la raíz de Supabase y falla la conexión TLS en producción. Bastaría un paso de CI tras el build: `test -f .vercel/output/functions/_render.func/certs/supabase-root-2021-ca.crt`.
- "ningún componente importa Next": el `grep` no está en pruebas; una prueba de Vitest que recorra `src/components/` cuesta poco.
- "el build no es el de Next" (sin `.next/`, ninguna ruta viene de `src/app/`): mismo paso de CI.
- "PR a la rama de la migración": pendiente del CI real (lo sabe el dev; lo cierra el validador).
- Además, la letra de "la foto se pinta igual" pide `fetchpriority="high"` y `next/image` no lo emite (hallazgo 1 del dev): necesita `/spec` antes de archivar.

## Revisión por punto pedido

1. **Cadena de suministro.** 323 paquetes nuevos en el lockfile: todos de `registry.npmjs.org`, todos con `integrity`, **ninguno con `hasInstallScript`** (no hay lifecycle scripts nuevos; el único `postinstall` sigue siendo `prisma generate`). Revisé los nombres poco comunes (`am-i-vibing`, `find-proc`, `process-ancestry`, `tinyclip`, `verkit`, `piccolore`, `fontkitten`, `satteri`): todos cuelgan de `astro@7.3.5` u oficiales `@astrojs/*`; no vi typosquatting. `npm ls` limpio y coherente con `package.json`. Avisos de audit: Medio 2.
2. **CI.** Solo se agregó el paso `npm run typecheck`. Disparadores sin cambios (`push` a `main`, `pull_request`); **no hay `pull_request_target`** ni secretos nuevos. El build usa `DATABASE_URL` hacia un puerto muerto; compilé con un canario en `DATABASE_URL` y en otra variable: **no aparece en `dist/` ni en `.vercel/output/`**.
3. **`Link`/`Imagen`.** `Link` = `<a {...resto} href>`; `Imagen` = `<img>` con el `src` tal cual. Frente a `next/link`/`next/image` no pierden protección: React 19 bloquea `javascript:` (también con mayúsculas, tabulador, salto de línea o un carácter de control antes) en `href` y `src`, y escapa atributos e hijos. `//evil`, `/\evil`, `vbscript:` y `data:` pasan igual que en Next: el `href` no es una frontera de seguridad y quien lo arme con datos del usuario debe validarlo antes (hoy todos salen de slugs e IDs internos). `Imagen` no reescribe nunca a `/_image` ni a `/_next/image` y no emite `srcset`: el servidor no descarga nada por `src` (sin SSRF desde la capa). Única diferencia con Next: con `src` `data:` o vacío, Next omite `loading="lazy"` y `Imagen` no; no afecta la seguridad y `MarcadorFoto` siempre pasa `/api/foto/…`.
4. **`astro.config.mjs`.** `includeFiles` = solo `./certs/supabase-root-2021-ca.crt` (certificado público). Sin `PUBLIC_`, `envPrefix`, `vite.define` ni `env.schema`. `checkOrigin` no se toca: el manifiesto construido lleva `"checkOrigin":true` y el middleware de origen está activo. `middlewareSecret` y `key` del manifiesto los genera cada build y viven solo en la salida ignorada (`.vercel`, `dist` en `.gitignore`). El relevo de `/_image` es el Medio 1.
5. **Diff de `src/components/` y `tests/`.** Los 20 archivos cambian exactamente una línea de `import` (19 `Link`, 1 `Imagen as Image`). `git diff migracion-astro -- tests/` está vacío: ninguna prueba existente cambió. Nada en `src/lib`, `src/app`, `prisma/`, `vercel.json` ni `openspec/specs`.
6. **Secretos y datos reales.** No hay credenciales, teléfonos ni nombres reales en el diff ni en los archivos nuevos (solo un ID hexadecimal ficticio y "Taller Ficticio"). Las salidas de build están ignoradas.
7. **ESLint.** Comparé `--print-config` antes y después (`src/components/header.tsx`, `src/app/layout.tsx`): solo desaparecen las `@next/next/*` y `jsx-a11y/alt-text` sube a `error`. Ninguna `@next/next/*` protege la seguridad de este código (la más cercana, `no-unwanted-polyfillio`, avisa de scripts de polyfill.io; no hay ninguno). **Recomendación (no bloquea):** como las Fases 2–5 escriben `.astro`, activar `astro/no-set-html-directive` (el equivalente de `dangerouslySetInnerHTML`, no viene en `flat/recommended`) y `react/no-danger`.

## Informativos (sin severidad)

- **Preexistente, fuera del diff y relevante para producción:** `next@16.3.3` tiene un aviso **crítico** (GHSA-vcvr-r3jv-pc5j, RCE en `next/og` `ImageResponse`, rango `>=16.2.0 <16.3.6`) y `main` lo usa en `src/app/opengraph-image.tsx`. No lo introduce este change, pero conviene un `/rapido` en `main` para subir a `16.3.6` o posterior.
- `ci.yml` no declara `permissions:` (antes tampoco): el token de los `push` a `main` usa los permisos por defecto del repo. Sugerido: `permissions: { contents: read }`.
- Astro manda telemetría anónima por defecto (`@astrojs/telemetry`), también desde el CI. Sugerido: `ASTRO_TELEMETRY_DISABLED=1` en el job.
- La salida del build guarda rutas absolutas del equipo local (`/Users/...`) en el manifiesto; no se commitea (ignorada) y en Vercel se construye en su máquina.

## Pruebas adversariales añadidas

`tests/compat-seguridad-adversarial.test.ts`: 23 casos, **23 pasan**.
- `Link`: 5 variantes de `javascript:` bloqueadas igual que `next/link`; `href` que intenta cerrar el atributo, escapado; hijos con `<img onerror>`, como texto; `//evil`, `/\evil`, `vbscript:` y `data:` idénticos a Next (no es más permisivo); unicode/`‮`/`&<>` escapados igual.
- `Imagen`: `javascript:` bloqueado; `//evil`, `169.254.169.254`, `127.0.0.1:5432` y `file:///` se pintan tal cual (con y sin prioridad), sin `/_image`, `/_next/image` ni `srcset`; `src` con `" onerror="` sin atributo real; `alt` con comillas y etiquetas, escapado.
- `astro.config.mjs`: `includeFiles` solo con el certificado; sin `PUBLIC_`/`import.meta.env`/`process.env`; `checkOrigin` sin desactivar; servicio `noop`, sin `domains` ni `remotePatterns`.

## Intermitentes preexistentes (confirmadas, sin arreglar)

- `[A1]`/`[A2]` de `tests/reportes-seguridad-adversarial.test.ts`: carreras contra el cupo en `src/lib/reportes`, que no cambia; el archivo de pruebas tampoco cambió. Fallaron en mi corrida igual que en la línea base del dev.
- `tests/admin-listado-paginas.test.ts:561`: `not.toContain("xyz")` sobre HTML con IDs `cuid()` en los `href`; archivo sin cambios y el fallo depende del azar del ID, no de `Link` (que pinta el mismo `href`). Pasó en mi corrida.

## Cierre

- `npm run lint`: 0 errores (exit 0). `npm run typecheck`: 0 errores, 0 avisos.
- `npm run build` sin base: Complete.
- `npm test`: 113 archivos (112 pasan, 1 falla), 3276 pasan, 2 fallan (solo [A1]/[A2]), 2 saltadas. Respecto a b-dev: +1 archivo y +23 pruebas, las mías.
- Sin commits. Archivo nuevo: `tests/compat-seguridad-adversarial.test.ts`.
