# Etapa C · seguridad y pruebas adversariales — migrar-directorio-publico-astro (T-023, 2b)

**Veredicto: PASA al validador.** Crítico 0 · Alto 0 · Medio 1 · Bajo/observaciones 7.
El medio (M1) existía antes en Next y no bloquea. Hay que decidir si se corrige en el borde de Astro, aunque eso rompa la paridad con un error, o en `main` por `/rapido`.

Usé una base propia, `prisma dev --name audita023b`, con datos ficticios (series 77199968xx y `.example`). Ya está detenida, igual que los emuladores.

## Hallazgos

### Medio

**M1. `?colonia=` con byte NUL responde 500 en vez de ignorarse.** Archivos: `src/astro/directorio.ts:85-87` y `src/lib/directorio.ts:149-156`.
- **Cómo se reproduce:** `GET /talleres?colonia=%00` o `?colonia=a%00b`. `obtenerColoniaPorSlug` manda el NUL a PostgreSQL, que lo rechaza (`22021 invalid byte sequence`), y la página responde **500** con `500.astro`.
- **Qué incumple:** la spec dice "una colonia que no está en el catálogo se ignora". El propio `src/lib/texto.ts:24-33` también lo prohíbe: "una URL con `%00` devolvería un error del servidor… se trata en el BORDE".
- **Qué no se filtra:** el cuerpo no trae traza ni el error de la base, la respuesta lleva las cuatro cabeceras y el `Cache-Control` dinámico, y no trae medición (probado).
- **Impacto real:**
  - cualquiera genera 500s a voluntad, cada uno con una traza completa en el log de la función, así que puede llenar los logs y disparar alertas;
  - cada petición cuesta una consulta, y lo mismo pasa con `?colonia=<8000 caracteres>`, porque no se valida la forma del slug antes de consultar.
- **Es preexistente:** Next hace lo mismo (`src/app/(publico)/[destino]/page.tsx:119-122`). Por eso el diff no lo ve, aunque tampoco incluye esa ruta.
- **Arreglo sugerido (dev):** en el borde, `src/astro/directorio.ts`, no consultar si el valor trae NUL o no tiene forma de slug (`tieneByteNulo` o el mismo criterio de `resolverDestinoDeLaRaiz`). Eso separa a Astro de un 500 de Next, y lo decide el validador; la otra opción es corregir antes en `main`.
- **Prueba:** queda documentado con `it.fails` ("[M1]…") y con una prueba en verde de que el 500 no filtra nada.

### Bajo / observaciones (no bloquean)

1. **`/404` responde 200 y `/500` responde 500.** Next manda las dos a `[destino]`, que responde la 404 dinámica.
   - Las dos traen la página en español con `noindex`, las cuatro cabeceras, sin script y sin datos, así que son inocuas.
   - b-dev, "Desviaciones" 6, dice que esa URL "responde ahora 404 con las cuatro". Las cuatro sí las lleva, pero **solo `/404/` da 404; `/404` da 200**.
   - Ninguna de las dos está en las rutas del diff. Conviene mirarlas en el preview (tarea 19), porque la CDN real puede servir `404.html` distinto.
2. **Dos normalizaciones del diff son más anchas de lo necesario** (`scripts/diff-html/nucleo.mjs:264-272`).
   - "hoja-de-estilos" quita **cualquier** `<link rel=stylesheet>`, no solo `/_astro/*.css`.
   - "lang-y-class" ignora el atributo `class` completo del `<html>`.
   - En esos dos sitios, una fuga quedaría enmascarada.
   - Además, el diff en general (`extraerPagina`, l. 137-179) no ve el texto suelto fuera de `header`/`main`/`footer` ni los comentarios.
   - **No hay fuga hoy:** `NoEncontradoDinamico` no recibe props ni lee la petición, y `plataforma-astro-404-dinamica` exige cuerpo idéntico byte a byte y una lista de prohibidos.
   - Las cuatro cegueras quedan fijadas en una prueba "[límite documentado]", para que nadie confíe en el diff más de lo que ve.
   - Sugerencia: filtrar solo el `href` normalizado a `<css>` y comparar `lang` y `class` contra valores fijos (`es-MX`, `h-full antialiased`).
3. **Desviación de `?colonia=` repetida: sin riesgo.** Confirmé en el código de Next que solo filtra con `typeof === "string"`, así que la paridad del dev es correcta.
   - Repetida, el listado sale sin filtro, solo con publicados y con la canónica sin consulta. Probé el orden válido+hostil y hostil+válido.
   - La letra "se usa el primer valor" de la spec (l. 17) y del design §4 hay que corregirla al archivar.
4. **Brecha conocida T-024:** `POST` sin `Origin` a `/api/foto/…` responde 403 de `checkOrigin`, sin las cuatro cabeceras. Sigue con `it.fails`.
5. **`DocumentoBase.astro:62`:** `etiquetas.slice(0, 2)` supone que `resolverMetadatos` devuelve primero `charset` y `viewport`, y si no son `meta` las descarta en silencio. Hoy se cumple (`metadatos.ts:141-144`), pero es frágil. Conviene que `resolverMetadatos` exponga el punto de inserción.
6. **`scripts/diff-html.mjs` (`capturar2b`, `anonimizar`)** no sustituye `fotoRechazada`. Hoy no sale en ningún fixture, pero si mañana se captura su cabecera quedaría una clave (ficticia) sin anonimizar.
7. **Superficie de abuso, sin cambio respecto a Next:**
   - `/[destino]`, `/negocio/…`, `/buscar` y `/api/foto/…` consultan la base en cada petición, sin caché compartida (por diseño) y sin límite de frecuencia.
   - Una inundación pega directo en la base. `/api/foto` además lee el almacén por cada petición válida.
   - No hay formularios nuevos en 2b.

## Auditoría por punto del encargo

1. **Ruta de fotos** (salida servida, emulador).
   - **Clave validada antes de consultar:** `servirFoto` exige 32 caracteres hex en minúsculas y una variante `tarjeta`/`ficha` antes de tocar la base.
   - **Lo no publicado da el mismo 404 vacío** que una clave inventada, con `GET` y `HEAD` y en las dos variantes: revisión, rechazada, despublicada y **borrada con el archivo aún en disco**. Va con `no-store`, sin `Content-Type` y sin `Location`.
   - **Ni cookie ni consulta "de admin" la abren:** `cookie`, `authorization` o `?admin=1` no abren la de revisión por la ruta pública.
   - **Rutas adversariales: nunca 200, nunca bytes RIFF/WEBP ni de archivo, siempre las cuatro.** Probé además lo del dev:
     - doble codificación (`%252e…`) y `..%5c`;
     - `%0a`, `%20`, sufijos `.webp`, NUL en la variante y la variante en ancho completo;
     - clave de 31 y de 33 caracteres, mayúsculas parciales, una clave de 5000 caracteres y codificación rota.
   - **Foto publicada:** sin `Exif`, `GPS` ni `XMP`, con `nosniff`, sin `Set-Cookie` y sin rastro del almacén en las cabeceras. La paridad de bytes con Next en producción la midió el diff del dev (hash y `Content-Length`).
2. **Fichas no publicadas.** Probé nueve variantes de URL por estado, en los cuatro estados (revisión, rechazado, despublicado y borrado):
   - el nombre real en la URL, el id en mayúsculas, sin guion, `%00` y consulta hostil;
   - el nombre codificado y el id o el segmento pedidos como `/[destino]`.

   Todas devuelven un 404 **idéntico byte a byte** al de un id inexistente, con las mismas cabeceras salvo la fecha. No aparece ni id, ni clave de foto, ni nombre, colonia, oferta o WhatsApp, ni en el cuerpo ni en las cabeceras. `HEAD` responde 404 vacío.
   - Las sub-rutas (`/reportar`, la barra final y `/a/b`) tampoco delatan nada.
   - Nada de lo no publicado sale en `/buscar` (buscando su nombre exacto), en el listado con o sin filtro ni en `sitemap.xml`.
3. **Escape.** Usé un negocio **publicado** con `</script><script>`, `"><img onerror>`, U+2028, U+202E y `&amp;` en el nombre, la oferta, la dirección, el horario y el teléfono, más `facebookUrl` con `javascript:`.
   - **Ficha, listado y `/buscar`:** el árbol parseado no gana `<script>`, `<img src=x>` ni atributos `on*`, y no hay ningún `href="javascript:`. Lo hostil solo aparece escapado, salvo dentro de atributos entre comillas, donde es inerte.
   - **JSON-LD:** no contiene `<` (sale `<`), se parsea y conserva el nombre literal, sin WhatsApp.
   - **Head:** un solo `<title>` y solo `meta`, `link` y `title`.
   - **Datos internos:** el hash del token y el motivo interno no aparecen.
   - **`/buscar`:** con `q` hostil o repetido, el título es estático, sale `noindex, follow` (también sin `q`), la consulta no llega al `<head>` y el script lleva `data-exclude-search`.
   - **`?colonia=` y `?pagina=`:** hostiles, repetidos o de 8000 caracteres no tienen eco y la canónica queda sin consulta (salvo M1).
   - **Diez slugs hostiles en `/[destino]`** responden la misma 404 que `/loquesea`.
4. **404 sin medición.** Con la medición configurada, ninguna de estas trae `<script>`, `umami`, el ID del sitio ni el eco de la consulta: las dinámicas, `/a/b/c`, `/404`, `/404/`, `/registro`, `/negocio`, `/negocio/`, `/api`, `/api/foto`, `/api/foto/x/y/z` y las sub-rutas de una ficha en revisión. El 500 de M1 tampoco la trae.
5. **Middleware y CDN.**
   - **Rutas raras:** `/opengraph-image/`, `/404`, `/404/`, `/500`, `/terminos/`, `/aviso-de-privacidad/` y `/favicon.ico/` llevan las cuatro, sin cabeceras del marco.
   - **Base caída:** listado, ficha, `/buscar`, `/loquesea` y foto responden con las cuatro, sin traza, sin la URL ni la clave de la base y sin medición. El log tampoco trae la clave.
   - **Rutas de la CDN nuevas:** quedan acotadas a `^/<sin extensión>/$` y `^/404/?$`. Ninguna alcanza una ruta de la función con una política más estricta, y el middleware no pisa cabeceras que ya vengan en la respuesta.
6. **Analítica.**
   - La exclusión se extendió a `src/astro/` con su motivo, y un fixture sin motivo reprueba.
   - En la ficha hostil, los atributos `data-umami-event*` solo llevan los nombres permitidos y valores `^[a-z0-9-]+$`, sin id, nombre ni WhatsApp. Hay un solo script externo.
7. **Normalizaciones del diff.**
   - Solo se aplican si la ruta está en `rutas404Dinamicas`, o si es `medir404` y Next devolvió `__next_error__`, y siempre que **las dos** respondan 404.
   - El `<body>` de Astro sí se compara, contra el `/a/b/c` de Next.
   - Probé que una fuga en `<main>`, un atributo, un `<meta>`, `<title>`, JSON-LD o la canónica **sí se reporta**. Las cegueras están en la obs. 2.
   - La comparación nueva de `Location` y la de hash y tamaño de las fotos refuerzan el diff. El 404 vacío de fotos se compara byte a byte (rama `cuerpo distinto`).
8. **Guardianes.** Revisé el `git diff` de `tests/`: en los 35 archivos, el conteo de `expect(` antes y después es igual o mayor, y no hay `skip`, `only` ni `todo` nuevos. Los cambios semánticos que vi:
   - El `digest` de Next pasa a `status === 404` más un documento idéntico byte a byte, que es más estricto.
   - "Costo por petición": dejan de contarse dos llamadas (`generateMetadata` + página) y se cuenta un solo pintado, con los mismos umbrales (`≤3`, y `0` en caliente). Es equivalente.
   - `_image`: cambia la ruta de comparación y se agrega `status 404`.
   - `directorio-consultas`: ahora exige que "404" y "500" estén reservados.

   No encontré nada más laxo.
9. **Rutas prohibidas, secretos y datos reales.**
   - `git status` y `git diff` salen vacíos en `src/components`, `src/app`, `vercel.json`, `prisma/` y `openspec/specs`. En `src/lib` solo cambia `rutas-reservadas.ts` (+1).
   - En las líneas añadidas no hay secretos ni teléfonos reales: solo las series ficticias 7719995xxx y 7719996xxx.
   - Los fixtures `next-2b/` usan `enmirumbo.example`, el negocio ficticio del seed demo y `<id>`/`<clave>` anonimizados.
   - No hay variables de entorno nuevas.

## Mapa scenario → prueba (revisado)

Todos los scenarios automatizables del delta tienen prueba. Las excepciones son las declaradas: Lighthouse, el preview de Vercel y "producción no se entera", que es del PR. Encontré tres puntos débiles y los reforcé:
- "rutas adversariales" de fotos: no estaban despublicada ni borrada, ni la doble codificación;
- "ficha no publicada indistinguible": solo había una variante de URL por estado;
- "consulta hostil": no se probaba escape con datos hostiles **de la base** sobre la salida servida.

## Pruebas adversariales añadidas

`tests/directorio-astro-seguridad-adversarial.test.ts`: 24 pruebas, todas contra la salida servida salvo las del diff. Resultado: **23 en verde y 1 `it.fails` ([M1])**.

| Bloque | Qué ataca | Resultado |
|---|---|---|
| Fotos de lo no publicado | revisión, rechazada, despublicada y borrada con archivo × variantes × GET/HEAD; cookie, `authorization` y consulta "de admin" | verde (2) |
| Fotos con codificaciones | 17 rutas: `%252e`, `%5c`, `%0a`, `%20`, `.webp`, NUL, ancho completo, largo ±1, 5000 caracteres, codificación rota; EXIF/GPS/XMP y almacén en cabeceras | verde (2) |
| Fichas no publicadas | 9 variantes × 4 estados contra la inexistente, byte a byte; HEAD; sub-rutas; buscador, listado y sitemap | verde (3) |
| Escape | ficha, listado y `/buscar` con un negocio hostil; JSON-LD; `<title>` y `<meta>`; datos internos; atributos de medición; `q`, `colonia`, `pagina` y slugs hostiles | verde (9) |
| 404 sin medición | 12 URLs de 404, más `/404` (200) | verde (1) |
| Cabeceras | CDN y función cruzadas; base caída en las cuatro rutas | verde (2) |
| M1 | `?colonia=%00` → 200 (`it.fails`); el 500 no filtra nada | 1 `it.fails`, 1 verde |
| Diff | referencia limpia; seis fugas que sí se reportan; cuatro cegueras documentadas | verde (3) |

## Cierre

- `npm test` (base `audita023b`): **126/126 archivos**; 3497 pasan, 3 `expected fail` y 2 saltadas.
  - Los `expected fail` son T-024 de 2a, el `POST` sin `Origin` y mi [M1].
  - Contra b-dev: +1 archivo, +23 que pasan y +1 `it.fails`, todos míos.
  - [A1], [A2] y `admin-listado-paginas` no salieron en esta corrida.
- `npm run lint`: 0 errores.
- `npm run build` sin base alcanzable y sin `SITIO_URL`: Complete.
- No hice commits. La base `audita023b` está detenida y no queda ningún emulador corriendo.
