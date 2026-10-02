# Etapa C · seguridad — migrar-formularios-publicos-astro (T-024, Fase 3a)

**Veredicto: PASA al validador.** 0 críticos, 0 altos, 1 medio (preexistente, no explotable), 5 observaciones.

Probado contra la salida construida (emulador `scripts/servir-salida-vercel.mjs`, `curl` y el arnés) con un PostgreSQL 16 real desechable (clúster propio en el scratchpad, ya detenido y borrado; no usé `prisma dev`). Comparé la regla con `next/dist/server/app-render/action-handler.js:351-371, 427-491`, y el candado con `astro/dist/actions/runtime/server.js:82-155` y `core/routing/handler.js:23-31`.

## Hallazgos

### Medio

**M1 · `x-astro-locals` responde `Forbidden` en texto plano, en inglés y sin las cuatro cabeceras** (`node_modules/@astrojs/vercel/dist/serverless/entrypoint.js:46-51`; existe desde la Fase 1)
- **Qué pasa:** cualquier petición con esa cabecera y sin el secreto recibe `403 Forbidden` (`text/plain`), antes del middleware y sin CSP, `nosniff`, `X-Frame-Options` ni `Referrer-Policy`.
- **Por qué no se puede explotar:**
  - un sitio ajeno no puede hacer que el navegador de un vecino mande una cabecera propia sin preflight de CORS, y ese preflight falla;
  - el cuerpo es fijo y no refleja nada.
- **Por qué cuenta:** incumple la letra del requirement ADDED ("Ninguna respuesta del sitio DEBE volver a salir así").
- **Prueba:** queda fijada con `it.fails("[c-seguridad M1] …")`. Cuando se corrija, la prueba se pone roja.
- **Propuesta de ticket:**
  - una ruta en `config.json` con `has: [{type:"header", key:"x-astro-locals"}]` hacia `/404.html` (status 404), colocada antes de `handle: filesystem`. Ahí la CDN ya pone las cuatro cabeceras. El sitio no usa el middleware de borde, así que nadie legítimo manda esa cabecera;
  - o bien envolver el punto de entrada.
- **No bloquea.**

### Observaciones (sin severidad; para el validador)

1. **Una Action pedida desde otra ruta no responde "exactamente igual que `/a/b/c`" en producción.**
   - **Qué pasa:** con `SITIO_URL` configurada, el cuerpo de `POST /?_action=reportar` (y de `/negocio/<seg>?_action=…`) no es igual al de `/a/b/c`.
     - Lo que difiere: `og:image`, `twitter:image` y `twitter:card`.
     - Por qué: `/a/b/c` es el `404.html` estático, construido sin `SITIO_URL`, y la función pinta la 404 dinámica.
     - Es byte a byte igual a `/loquesea` y no filtra nada.
   - **La prueba:** `tests/plataforma-astro-reportar.test.ts:534-544` solo compara contra `sinSitio`, así que no lo detecta.
   - **Origen:** la diferencia entre la 404 estática y la dinámica viene de 2b.
   - **Decisión pendiente:** aceptar `/loquesea` como referencia o reformular la letra.
2. **La regla compara solo el host, no el esquema.**
   - **Qué pasa:** `Origin: http://<host>` pasa sobre HTTPS. Next hace lo mismo. `checkOrigin` de Astro sí comparaba el origen completo (`url.origin`), y eso es lo único que Astro cerraba y la regla nueva no.
   - **Para explotarlo** habría que servir desde `http://<mismo host>`, es decir, un MITM sin HSTS.
   - **Pendiente:** en la tarea 19 (preview), confirmar `Strict-Transport-Security` en el dominio.
   - **Otras diferencias con Next:** `Origin: file://` (host vacío) se rechaza, y Next lo dejaba pasar; `null` y malformado responden 403 en vez de 500. Las dos son más estrictas.
3. **`?_action=reportar&_action=inventada` ejecuta `reportar`.** Astro usa `searchParams.get`, que toma el primer valor, y la Action está en su propia ruta. No es un bypass: el orden inverso responde 404.
4. **El guardián `compat-seguridad-adversarial` es textual** (`revisaElOrigenAntesDeLasActions`):
   - una mutación como `if (envioDeOtroOrigen(…) && false)` lo pasa;
   - el comportamiento sí lo cubren `astro-origen(-regla)` y las pruebas nuevas sobre la build;
   - la invariante sigue protegida, aunque por otra prueba.
5. **Abuso, preexistente y sin cambio por la migración.**
   - **POST sin `Origin` al formulario:** procede, por decisión del fundador.
   - **Contra la inundación** solo hay dos topes:
     - el de 10 pendientes por ficha;
     - el cupo de 3 por hora por IP, que vive en memoria y es por instancia.
   - **Un último valor de `x-forwarded-for` con forma `[v6]:puerto`:** deja la petición sin cupo (`src/lib/registro/limite-ip.ts:183-188`). En Vercel no aplica, porque la plataforma sobrescribe el encabezado.
   - **Lo que hay que medir en el preview** (paso 4 de la tarea 19): que cuatro envíos con `x-forwarded-for` falso agotan el cupo.

## Verificado sin hallazgo (sobre la build)

- **Origen:** coincide con `parseHostHeader` de Next.
  - Primer valor de `X-Forwarded-Host`, con `trim`. Si el primer valor viene vacío, se compara contra `Host`.
  - Sin lista de orígenes permitidos.
  - Responden 403: puerto distinto, subdominio, userinfo hacia otro host, `Origin` vacío, `null`, `javascript:` y dos `Origin` juntos (en los dos órdenes).
  - Un `Origin` en mayúsculas o con `/` final procede.
  - PUT, PATCH y DELETE ajenos responden 403. Los métodos en minúsculas o inventados los corta Node con un 400.
  - `Host` y `X-Forwarded-Host` forjados por el propio cliente solo engañan al cliente mismo, igual que en Next.
- **403:**
  - documento en español con las cuatro cabeceras y `private, no-cache, no-store…`;
  - sin eco del `Origin`, del host, de la ruta ni del cuerpo;
  - `GET /envio-rechazado` responde la 404;
  - `POST /envio-rechazado?_action=reportar` no entra en bucle de rewrite, porque el rewrite descarta la consulta (`core/routing/rewrite.js:31`).
- **Candado de Actions:** todas estas responden 404 sin fila ni `Set-Cookie`:
  - nombres inyectados: `__proto__`, `constructor`, `toString`, `REPORTAR`, `reportar/`, `reportar.x` y `%20reportar`;
  - `/_actions/*` (también con `/_ACTIONS`, `%5f`, `//` y `..`), que cae en la 404 de la CDN;
  - `/_actions/*` cuando **sí** llega a la función (tabla modificada), que pinta la 404 de la función.

  JSON, `text/plain` o sin `Content-Type` en la ruta correcta: 303 a `?error=servidor`, sin escribir. PUT con `?_action`: no ejecuta. Un `_astroAction` en el cuerpo: se ignora.
- **PRG:**
  - `Location` relativo, armado con datos de la base y filtrado por `destinoSeguro` (`src/astro/acciones.ts:265-267`). El slug es ASCII, así que siempre pasa el filtro.
  - El `Referer`, el `Origin`, `destino`, `negocioId` y `$ACTION_1:0` no influyen: el reporte fue a la ficha de la URL.
  - El 303 lleva las cuatro cabeceras y conserva el `Set-Cookie`.
- **Borrador:**
  - Atributos: `HttpOnly; Secure; SameSite=Lax; Path=/negocio/<seg>/reportar; Max-Age=120`.
  - Contenido: solo el comentario que escribió el propio vecino, en base64url. Un `;` o un CRLF no inyectan atributos.
  - Validación: regex de hasta 4096 caracteres.
  - Repintado: `</textarea><script>` sale escapado y una cookie de 5000 caracteres deja el campo vacío.
  - La cookie no va firmada, pero solo se le devuelve a quien la manda y siempre escapada. La fijación desde otro sitio no es posible sin un subdominio hermano.
- **Cuerpo:**
  - 7 MiB con y sin `Content-Length`, multipart roto o sin `boundary`, y un archivo en `motivo`/`comentario`: `?error=servidor` o `?error=motivo`, sin 500 ni escritura.
  - `__proto__` como nombre de campo: sin contaminación del prototipo.
  - Una bomba de 200 000 a 300 000 campos responde 303 en ~60 ms.
  - Un `Content-Length` mentiroso lo corta Node (y Vercel, a 4.5 MB).
- **Reportes a fichas que no se pueden reportar:** en revisión, rechazada, id inexistente, sin identificador, `%00` y `'%3B--` dan cuerpos idénticos por md5 entre sí y con el GET, sin cookie y sin fila.
- **Cupos:**
  - la llave es el último valor de `x-forwarded-for`, también cuando llega en dos líneas;
  - rotar `x-real-ip`, `x-vercel-forwarded-for` o el primer valor no evade el cupo;
  - la concurrencia sobre la build (14 envíos → 10 y 8 → 3) **corrió y pasó** con PostgreSQL real.
- **Confirmación:** el `href` siempre empieza con `/negocio/` y el segmento crudo sale escapado, sin `//`.
- **Diff permitido:**
  - `src/lib/`: +1 línea (`rutas-reservadas.ts:41`);
  - `src/components/`: solo `formulario-reporte.tsx`;
  - sin cambios en `src/app/`, `vercel.json`, `prisma/`, `next.config.ts`, `openspec/specs/`, `spikes/` ni `package*.json`;
  - sin secretos ni variables nuevas (`.env.example` no cambia);
  - WhatsApp `77199…` y nombres ficticios en los fixtures y en las pruebas.
- **Guardianes ajustados** (`compat`, contextos falsos, manifiesto, `layout`, `reportes-pagina`, `reportes-seguridad-adversarial`): ninguna aserción menos ni más laxa. El cambio en `gracias-hostil` (exigir el `href` codificado) es más fiel al servidor real.

## Scenarios sin prueba

Ninguno de los automatizables. El mapa de `b-dev.md` está completo. La tarea 19 (preview de Vercel con JS apagado, CDN real, `x-forwarded-for`, HSTS y la 404 de `/_actions`) es humana.

## Pruebas adversariales añadidas

`tests/formularios-seguridad-adversarial.test.ts` (sobre la build, PostgreSQL real): **15 pasan y 1 es expected fail** ([c-seguridad M1]). Cubre:
- orígenes raros (9 valores);
- PUT, PATCH y DELETE ajenos;
- `X-Forwarded-Host` con el primer valor vacío;
- `/envio-rechazado?_action` sin bucle;
- 9 nombres de Action inyectados;
- JSON, `text/plain` y cuerpo sin tipo;
- PUT con `?_action`;
- `_astroAction` en el cuerpo;
- RPC que llega a la función (salida con la tabla modificada por enlaces simbólicos en un directorio temporal);
- multipart roto;
- `__proto__`;
- archivos en lugar de texto;
- una bomba de 200 000 campos;
- rotación de `x-real-ip`, `x-vercel-forwarded-for` y `x-forwarded-for` en dos líneas;
- el guardián de `clientAddress`/`getClientIpAddress` en **todo** `src/`.

## Compuertas

- `npm test` contra PostgreSQL 16 real: 149 archivos, **4105 pasan, 2 expected fail** ([M1] preexistente y [c-seguridad M1]), 0 saltadas, la de concurrencia incluida. La falla del `.next/BUILD_ID` que reportó el dev ya no aparece.
- `npm run lint`: 0.
- `npm run build`: Complete.
- Sin commits. Emuladores y clúster detenidos.
