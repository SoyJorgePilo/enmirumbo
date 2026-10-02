# ADR-013 · Reporte del spike (Fase 0)

**Fecha:** 2026-10-01 · **Ticket:** T-021 · **Change:** `explorar-migracion-astro` · **Código:** `spikes/astro/`
**Versiones:** Astro 7.3.5, `@astrojs/vercel` 11.0.11, `@astrojs/react` 7.0.0, React 19.2.8, Prisma 7.10.0, Tailwind 4.3.3.

## Estado: incompleto — sin recomendación go/no-go todavía

La spec exige evidencia **en un preview de Vercel**. Ese preview no existe aún (tarea 3: proyecto de Vercel aparte y base desechable, paso humano). Todo lo de abajo se midió **en local**, contra la salida REAL de `astro build` (`.vercel/output/`) servida por un emulador mínimo del Build Output API (`spikes/astro/scripts/servidor-local.mjs`), no por Vercel. Por eso **ningún punto lleva todavía "pasa" o "falla" en el veredicto**: la columna local es indicio, no veredicto. Cuando el humano corra los pasos de [Pendiente humano](#pendiente-humano), se llena la columna del preview y se escribe la recomendación.

## Veredicto por punto

| # | Punto | Local (emulado) | Preview (lo que cuenta) |
|---|---|---|---|
| 1 | Formulario sin JS | pasa con costo (Chrome; Firefox no disponible) | sin evidencia aún |
| 2 | Sesión por cookie firmada | pasa | sin evidencia aún |
| 3 | Cabeceras y CSP | pasa con costo | sin evidencia aún |
| 4 | Base con `verify-full` | pasa en lo verificable (certificado empaquetado, fallos visibles); conexión TLS real sin probar | sin evidencia aún |
| 5 | Rendimiento | 0 JS propio: pasa. Lighthouse local 100 (indicativo) | sin evidencia aún |

## Evidencia y costos

### 1. Formulario sin JavaScript

- Chrome 154 headless, **JS apagado**, envío nativo del `<form method="POST" action={actions.reportar}>` desde `/reportar` (servida con `Referrer-Policy: strict-origin`). Registro del servidor:
  ```
  POST /reportar?_action=reportar origin=http://localhost:4321 referer=http://localhost:4321/ → 303 /reportar
  GET  /reportar                                                                             → 200  (muestra "⚠ Dinos qué pasa con este negocio")
  POST /reportar?_action=reportar origin=http://localhost:4321 referer=http://localhost:4321/ → 303 /reportar/gracias
  GET  /reportar/gracias                                                                      → 200  (contador de la instancia: 1)
  GET  /reportar/gracias  (recarga)                                                           → 200  (contador sigue en 1)
  ```
  `Origin` del propio sitio (no `null`), ningún 500, PRG con 303, recargar no reenvía. El error viaja en una cookie de un solo uso con un **código cerrado** (`motivo`|`comentario`), nunca con texto del vecino; la URL queda limpia (`/reportar`).
- **Costo 1a — el 403 de Astro.** `security.checkOrigin` (activo por defecto) rechaza un POST con `Origin: null`, sin `Origin` o de otro origen **antes** del middleware: responde `403` en texto plano, en inglés ("Cross-site POST form submissions are forbidden") y **sin ninguna de las cuatro cabeceras de seguridad**. La regresión de T-010/T-014 ya no sería un 500 sino un 403, pero el vecino seguiría viendo un formulario roto. Para Fase 3: o se apaga `checkOrigin` y se hace la misma comprobación en el middleware (mensaje en español + cabeceras), o se acepta ese 403.
- **Costo 1b — no se puede usar el patrón PRG de la doc de Astro tal cual.** El ejemplo oficial vuelve al formulario con `context.redirect(Referer)`; con `strict-origin` el `Referer` es solo el origen y la vuelta cae en la portada. El middleware del spike redirige a rutas fijas por Action.
- **Costo 1c — sin almacén de sesión.** En Vercel las sesiones de Astro requieren configurar un driver (p. ej. Redis). El spike pasa el aviso por cookie; los formularios con muchos campos a repoblar (registro, Fase 3) necesitarán otra cosa o reenviar el formulario renderizado en el POST.

### 2. Sesión por cookie

Action `entrar` emite y el middleware verifica (`spikes/astro/src/middleware.ts`, firma HMAC-SHA256 en `src/lib/sesion.ts`):
```
POST /acceso?_action=entrar → 303 /protegida
  set-cookie: spike_sesion=1790930947860.<firma>; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax
GET /protegida con la cookie           → 200 "Contenido protegido"
GET /protegida caducidad alterada (+1) → 307 location: /acceso
GET /protegida firma alterada          → 307 location: /acceso
GET /protegida sin cookie              → 307 location: /acceso   (sin contenido protegido)
Sin SPIKE_SESION_SECRETO: POST entrar  → 303 /acceso, sin cookie de sesión; GET /acceso → 503 "⚠ El acceso no está disponible por ahora."
```
Sin costo apreciable: `Astro.cookies` y el middleware cubren lo que hoy hacen `cookies()` y la guarda del panel.

### 3. Cabeceras y CSP

Las cuatro cabeceras salen de `cabecerasDeSeguridad()` importada en solo lectura de `src/lib/seguridad/csp.ts`. CSP idéntica a `politicaDeSeguridadDeContenido()`, sin `nonce-` (prueba `tests/cabeceras.test.ts`). Capturado con `curl -D -`:

| Respuesta | Estado | CSP | nosniff | DENY | Referrer-Policy |
|---|---|---|---|---|---|
| `/` (por petición) | 200 | sí | sí | sí | strict-origin-when-cross-origin |
| `/estatica` (prerenderizada, CDN) | 200 | sí | sí | sí | strict-origin-when-cross-origin |
| `/no-existe` | 404 | sí | sí | sí | strict-origin-when-cross-origin |
| `/protegida` sin cookie | 307 | sí | sí | sí | strict-origin-when-cross-origin |
| `/reportar` (formulario) | 200 | sí | sí | sí | **strict-origin** |
| POST del formulario | 303 | sí | sí | sí | **strict-origin** |
| `/_astro/*.css` | 200 | sí | sí | sí | strict-origin-when-cross-origin |
| POST con `Origin: null` | 403 | **no** | **no** | **no** | **no** (costo 1a) |

- Consola de Chrome (JS encendido) en `/`, `/estatica`, `/componente-react`, `/reportar`, `/negocios`, `/acceso`: **vacía**, ninguna violación de CSP. `/componente-react` renderiza `SelloVerificado` y `EtiquetaADomicilio` de `src/components/` en servidor, sin directiva `client:`.
- **Costo 3a — páginas prerenderizadas.** En Vercel el middleware no corre para lo que sirve la CDN, y `@astrojs/vercel` solo copia a `config.json` la CSP **que genera `security.csp` de Astro** (con `staticHeaders`), no cabeceras propias. El spike lo resuelve con una integración de ~40 líneas (`src/integraciones/cabeceras-en-la-cdn.ts`) que agrega rutas `{src, headers, continue: true}` al `config.json` tras el adaptador. Que Vercel las aplique es comportamiento documentado del Build Output API (el propio adaptador lo usa para `cache-control` de `/_astro/`), **pero solo el preview lo confirma**.
- **Costo 3b — componentes no tan "React puro" como dice ADR-013.** De 44 componentes, **20 importan `next/link` (19) o `next/image` (1)** y **9 reciben una Server Action como prop** (`action={fn}`), que en Astro tiene que ser una URL. Por eso el spike no pudo renderizar `FormularioReporte` ni `TarjetaNegocio` y escribió el formulario en `.astro` con los literales de `src/lib/reportes/`. ADR-013 estimaba "solo 2 de cliente"; el acoplamiento real a Next en `src/components/` es mayor y su reescritura (y la de sus pruebas de render) no está en el plan de fases.

### 4. Base con `sslmode=verify-full`

- `includeFiles: ["./certs/supabase-root-2021-ca.crt"]` → el build deja `.vercel/output/functions/_render.func/certs/supabase-root-2021-ca.crt`, junto a `dist/server/entry.mjs` (handler de `.vc-config.json`). Con el proceso en la raíz de la función, `sslrootcert=certs/supabase-root-2021-ca.crt` lo encuentra.
- Lectura con Prisma 7 + `@prisma/adapter-pg` contra la base local (`npm run db:local`, tabla propia `spike_negocio` con 3 negocios ficticios): `/negocios` → 200 con los tres.
- Fallos visibles (503, "⚠ No pudimos leer los negocios en este momento.", sin datos), verificados: sin URL; remota sin `verify-full`; `verify-full` con certificado ausente; `verify-full` con certificado presente y host inalcanzable. `?host=`/`?hostaddr=` se rechazan.
- **Sin evidencia:** el saludo TLS `verify-full` contra Supabase real desde la función de Vercel.

### 5. Rendimiento

- Ninguna página trae `<script>`, `modulepreload` ni `astro-island`; Chrome solo pide el documento y una hoja `/_astro/*.css` (14.8 KB, los mismos tokens de Tailwind que la app).
- Nota: el build emite `/_astro/client.*.js` (191 KB, el runtime de React para islas) aunque ninguna página lo carga. No cuesta a la red; sí ocupa el despliegue.
- Lighthouse 13.5.0 móvil (throttling simulado) contra el emulador local: `/negocios` rendimiento 100 (FCP 0.9 s, LCP 0.9 s, TBT 0 ms). **Indicativo**: no es la misma corrida ni la misma red que la portada de producción, que es lo que pide la spec.

## Pendiente humano

1. **Preview (tarea 3).** Base desechable en Supabase (proyecto nuevo, nunca el de producción); en su SQL editor correr `spikes/astro/prisma/semilla.sql`. Proyecto nuevo de Vercel sobre este repo con *Root Directory* `spikes/astro`, *Build Command* `npm run build`, Node 24, y variables `SPIKE_SESION_SECRETO` (`openssl rand -base64 32`) y `DATABASE_URL=postgresql://…?sslmode=verify-full&sslrootcert=certs/supabase-root-2021-ca.crt`. Desplegar la rama `feature/explorar-migracion-astro`.
2. **Cabeceras (punto 3)** en el preview, con `curl -sD - -o /dev/null` a `/`, `/estatica`, `/no-existe`, `/protegida`, `/reportar` y al POST `curl -sD - -o /dev/null -X POST "$URL/reportar?_action=reportar" -H "Origin: $URL" -d motivo=cerrado`. Lo decisivo: que `/estatica` (CDN) traiga las cuatro.
3. **Formulario (punto 1)** con JS apagado en Chrome **y Firefox** (`about:config` → `javascript.enabled=false`): DevTools → Red con "Conservar registro"; enviar sin motivo y con motivo; capturar `Origin` del POST, el 303, la URL final y recargar `/reportar/gracias`.
4. **Sesión (punto 2):** `/acceso` → "Entrar"; capturar `Set-Cookie`; editar la cookie en DevTools y pedir `/protegida` (307); quitar `SPIKE_SESION_SECRETO`, redesplegar y ver el 503.
5. **CSP (punto 3):** `/componente-react` en Chrome con la consola abierta; captura.
6. **Base (punto 4):** `/negocios` muestra los tres negocios ficticios; luego quitar `sslrootcert` de la URL → 503.
7. **Lighthouse (punto 5):** en la misma sesión de Chrome, modo incógnito, móvil, `/negocios` del preview y la portada de producción; anotar las dos puntuaciones.
8. Llenar la columna "Preview", escribir la recomendación go/no-go aquí y, si algún punto falla, ADR-013 a `rechazada` (tarea 12).
