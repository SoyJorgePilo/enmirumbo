# Etapa C · seguridad — migrar-enlace-gestion-astro (T-025, Fase 4)

Worktree `enmirumbo-f4` (sin commits del dev). Auditado contra la salida construida (emulador de Vercel), con un PostgreSQL 16 desechable (`c4gestion`, puerto 55471, ya detenido y borrado). Ningún servicio real.

**Veredicto: PASA al validador.** 0 críticos, 0 altos, 1 medio (funcional, ya reportado por el dev; decisión humana) y 3 bajos/observaciones.

## Hallazgos

### Medio

- **M-1 · scenario "dos envíos casi simultáneos" incumplido tal como está escrito** (`specs/plataforma-astro/spec.md:81-84`: "los cinco responden 303"). Medido: con 5 o 10 simultáneos, 2–4 responden 200 "No pudimos guardar tus cambios…" (`[gestion] no se pudo guardar la edición ni al reintentar: código P2002`); igual en Next (desviación 1 del dev). Lo invariante de seguridad SÍ se cumple: en 3 rondas de 10 queda exactamente una pendiente, cero 500 y ningún detalle técnico. No es explotable por un tercero (hace falta el token). Antes del PR el humano decide: enmendar la letra del scenario a lo que exige `plataforma-astro-gestion-envio.test.ts:298` o abrir el ticket de reintentos en `src/lib/gestion/ediciones.ts`. No bloquea por seguridad.

### Bajo / observaciones (no bloquean)

- **B-1 · variantes de la ruta que no llegan a la función salen con la política global.** `//editar/T`, `/EDITAR/T`, `/Editar/T`, `/%65ditar/T`, `/editar%2FT`, `/editar//T`, `/editar/T/x/y` y `/editar/T/gracias/x` responden la 404 estática de la CDN con `strict-origin-when-cross-origin` y sin `no-store`. Si alguien abre esa URL a mano y toca un enlace del encabezado, la ruta (con el token) viajaría como referente del mismo origen a una página medida. No pinta el formulario, no mide y no hace eco. Ningún generador del sitio produce esas formas: `construirEnlaceDeGestion` usa `urlSitio()`, que devuelve `URL.origin`. Es igual que en Next. Si se quiere cerrar: una regla `headers` de la CDN con `(?i)^/+(%65|e)ditar` en `src/astro/integraciones/cabeceras-en-la-cdn.ts`, en otro ticket. Las variantes que SÍ llegan a la página (`/editar/T/`, `/./editar/T`, `/x/../editar/T` y el token codificado `%41%42…`) llevan la cabecera, la `<meta>` y el 303 canónico `/editar/T/gracias`.
- **B-2 · sin canal de tiempo útil.** Medianas de 60 GET por motivo en el emulador: inexistente 2.17–2.61 ms, despublicada 2.33–2.34 ms, rechazada 2.22–2.42 ms. El ruido domina, y los dos caminos hacen una sola búsqueda indexada por huella (`src/lib/gestion/token.ts`, `negocioDelToken`; sin cambios). Con 256 bits de token, un oráculo de tiempo no acorta nada.
- **B-3 · `/editar/<cualquier cosa>/gracias` responde 200 sin validar** (paridad con Next). No abre nada:
  - no consulta la base y no hace eco del segmento (probado con `<script>`, `onerror`, 4000 caracteres, `%00`, unicode y codificación rota);
  - va con `no-store`, `strict-origin` y sin script;
  - no sirve para enumerar, y su costo por petición es el de una página estática dinámica.

  El flooding de esa ruta es el mismo que el de cualquier URL del sitio.
- **Observación · campo trampa:** `sitio_web` lleno con un segmento que parece token, aunque sea inventado, da el 303 a `/editar/<seg>/gracias` (`src/lib/gestion/procesar-edicion.ts:87`, antes del token; igual que Next). No delata validez, porque siempre responde igual. Con un segmento sin forma, `destinoDeEditar` (`src/astro/editar.ts:62`) lo convierte en 404.

## Confirmado sin hallazgo (probado sobre la build)

- **Referer:**
  - cabecera `strict-origin` fijada por la ruta pedida en 200, 303, 403, 404, 500 (base caída y excepción forzada) y en el re-pintado;
  - `<meta>` en las 200;
  - todo `href`/`src`/`action` de la pantalla es relativo al sitio y sin el token;
  - ningún `referrerpolicy`, `prefetch` ni `preconnect`;
  - `/registro` y `/` conservan la global.
- **Analítica:** con Umami configurado, ninguna variante bajo `/editar` (200, re-pintado, gracias, 404, variantes de ruta) trae el script. La mutación "`<ScriptAnalitica />` dentro de `TroncoGestion.astro`" reprobó 7 pruebas en 4 archivos.
- **Metadatos/cabeceras:** sin `canonical`, `og:url` ni JSON-LD; sitemap y robots sin `/editar`. El 303 no lleva `Set-Cookie` ni `Link`, y su `Location` es exactamente `/editar/T/gracias` (también desde `/editar/T/` y desde el token codificado). `no-store` en todas las de la función.
- **Eco:** `?error=`, `?next=` y `?redirect=` con script o URL ajena, en la edición, en gracias, en la 404 y en el POST: sin eco y sin `Location`.
- **Log ante 500:**
  - base caída (prueba del dev) y, además, tabla `Colonia` renombrada después de resolver el token (GET y POST): 500 genérico;
  - el cuerpo no trae `Colonia_c4g`, `prisma` ni `postgres`;
  - el log no trae el token ni su prefijo de 8.
- **404 indistinguible:** 12 segmentos hostiles (4000 caracteres, `ñ`, `%C3%B1`×43, `%00`, `A×42+%00`, `__proto__`, `constructor`, `%E0%A4%A`, `<script>`, `"><img onerror>`), en GET, en POST con campo trampa y en `/gracias`. Ninguno da 500 ni eco. Cada GET 404 de la función es byte a byte el de un token inventado.
- **Action:**
  - `?_action=` con `registrar`, `reportar`, `confirmar`, `reenviar`, `EDITAR`, `editar%00`, `registrar&_action=editar` o `editar.extra` contra `/editar/T`: nada se escribe, ni 500 ni 303;
  - `editar&_action=registrar`: el middleware y Astro leen el primero, así que corre `editar` (303 propio) y nunca `registrar`;
  - `_action` en el cuerpo, `PUT`, `PATCH` y `DELETE`: nada;
  - categoría o colonia inexistentes, `-1`, `1e3`, `6.0` o `0x1`: error junto al campo y sin pendiente;
  - multipart sin boundary, malformado, con boundary que no casa, o JSON: ni 500 ni 303;
  - chunked de 7 MiB sin `Content-Length`: re-pintado 200 en 9 ms, sin escritura y sin el token en el log.
- **Campos prohibidos y foto** (prueba del dev, `plataforma-astro-gestion-envio.test.ts:226`): la fila de cada ficha queda idéntica, la constancia y la versión del aviso intactas y cero archivos en el almacén. Revisada: suficiente.
- **SMS (C-1 de T-016):** la marca se limpia solo al aplicar y solo si cambia el número (prueba del dev con el Twilio falso). Revisada.
- **Cliente:** importa solo el `<form>` que contiene `#categoriaId` de una respuesta del mismo origen. Navega únicamente a `${form.action.pathname}/gracias`, comparado por igualdad. El atacante no influye en ese destino: lo arma el servidor con `destinoValidoDeEditar` y el cliente lo compara contra su propio `action`. Con la 404, `recargar` hace `location.assign` a la misma ruta, del mismo origen y bajo `strict-origin`. Peso: `/editar/T` 3671 B gzip; `/registro` 3178 B y sus pruebas sin cambios.
- **Next deja el token en claro** (confirmado en `tests/fixtures/next-4/con-sitio-url/editar-publicada.html:48`: `$ACTION_1:1` = `["<T>",{…}]`, y en su 500). Astro no lo escribe en ningún lado. En `main` es redundancia y no fuga activa: la página ya se sirve a quien tiene la URL, no mide y no tiene scripts de terceros. Sí es una copia más del secreto en el DOM (extensiones, "guardar página"). La migración lo cierra; conviene anotarlo al archivar.
- **Alcance:**
  - `git diff` contra la base sin cambios en `src/lib`, `src/app`, `src/components`, `vercel.json`, `prisma/`, `openspec/specs/`, `package*.json` ni `astro.config.mjs`;
  - `src/middleware.ts`: solo la línea de `prepararRespuesta`;
  - sin secretos;
  - los teléfonos de los fixtures son la serie ficticia `77199966xx` y los `771777…` preexistentes de T-004/T-014;
  - los tokens salen como `<T>`.
- **Guardianes ajustados:**
  - los conteos de `expect(` coinciden con los del reporte del dev, ninguno baja;
  - no hay `skip`, `only` ni `todo` nuevos;
  - el paso "cero `<script src>`" → "exactamente 1, del mismo origen, con `editar`" es el único aflojamiento y lo exige el requirement de JS;
  - `cadenaDeTroncos` solo sigue imports `@/layouts/…` o `./…`; un `../layouts/TroncoPublico.astro` lo cubren el guardián de `analitica-exclusion-admin` (prohíbe `<TroncoPublico`/`ScriptAnalitica` en `src/pages/editar`) y la prueba sobre la build.

## Mutaciones propias (revertidas; `cmp` contra la copia previa)

| Mutación | Reprobó |
|---|---|
| Sin `cabeceras.set("referrer-policy", …)` para `/editar/` (`src/astro/cabeceras.ts:63`) | 8 pruebas: 4 mías, `fugas` (siete formas) y 3 de `astro-middleware` |
| `destinoDeEditar` sin `pareceToken` (`src/astro/editar.ts:63`) | 4 pruebas: mía (segmento hostil con campo trampa → 303), 3 de `editar-accion` |
| `<ScriptAnalitica />` dentro de `TroncoGestion.astro` | 7 pruebas: mía, `fugas`, `analitica-exclusion-admin` ×4 y `astro-seguridad-adversarial` |

## Mapa scenario → prueba

Completo. El único scenario sin prueba automática es "el aviso de privacidad no recibe la ruta" (tarea 19, preview humano). Su parte automatizable ya quedó cubierta: enlaces relativos, sin `referrerpolicy` y con la cabecera y la `<meta>`. "Dos envíos casi simultáneos" tiene prueba, pero con la letra cambiada (M-1).

## Pruebas adversariales añadidas

- `tests/gestion-astro-c-seguridad-adversarial.test.ts`, 10 pruebas sobre la build:
  - variantes de ruta, también por POST;
  - segmentos y consultas hostiles;
  - XSS en lo prellenado (ficha y pendiente) y en el re-pintado, más el canal `Referer` por elemento;
  - otras Actions, `_action` raros y métodos;
  - categoría y colonia inexistentes;
  - cuerpos rotos y chunked de 7 MiB (en un emulador aparte: `node:http` resetea la conexión keep-alive con el cuerpo sin leer, un artefacto del emulador; en Vercel el cuerpo se corta en 4.5 MB);
  - ráfaga de 3×10 (solo con PostgreSQL real);
  - excepción tras resolver el token.

  Resultado: 10/10 en verde.
- `tests/gestion-mejora-c-seguridad-adversarial.test.ts`, 4 pruebas en happy-dom:
  - el tiempo de espera con la configuración de la EDICIÓN: una sola petición y sin navegar (V1 de 3b-1 solo estaba probado en `/registro`);
  - con otro `<form>` antes, no se mejora (falla cerrada);
  - `configDeEdicion` rechaza barra final, subrutas, `//`, mayúsculas y `javascript:`;
  - destinos casi iguales no navegan.

  Resultado: 4/4 en verde.

## Compuertas

- `npm test` (PG 16 real, sin caché): 176 archivos, **4477 pasan, 2 xfail**, 0 fallas. Son los 174 del dev más los 2 nuevos.
- `npm run lint`: 0.
- `npm run build`: completa.
- Limpieza:
  - el clúster desechable está detenido y borrado (se usó un PG 16 de Homebrew y no `prisma dev`, porque la ráfaga pide sesiones independientes);
  - se borró la marca `.vercel/output/.salida-de-pruebas`, así que la próxima corrida reconstruye la salida;
  - el único emulador vivo es de `enmirumbo-f6a` y no se tocó;
  - no se hicieron commits.
