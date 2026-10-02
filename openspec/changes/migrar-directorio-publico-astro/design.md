# Diseño: migrar-directorio-publico-astro

Base: `openspec/changes/migrar-lectura-publica-astro/design.md`. Sus §2, §4 y §8 ya resolvieron el enrutamiento, la regla de dinámico y prerenderizado y la ruta de fotos, y aquí no se reabren. Este documento solo agrega lo que esos apartados no cubrían o lo que la validación de 2a cambió.

## 1. 404 de las rutas dinámicas: página de no encontrado sin medición (alternativa B)

**Esto sustituye la viñeta (2b) del §1 de 2a,** la que proponía pintar `NoEncontrado` dentro de `TroncoPublico`. Esa propuesta habría empezado a medir estas 404 (hallazgo 2 de b-dev de 2a).

**Decisión del fundador, por delegación: alternativa B.** Se descartó la paridad exacta del documento de error de Next, es decir, el `<body>` vacío. La razón: en Next ese `<body>` vacío lo llena después el JavaScript del propio Next, y en Astro ese JavaScript no existe. Con la paridad exacta, la página saldría en blanco también para quien hoy ve el mensaje gracias a ese JS, que es casi todo el tráfico. Además dejarían de cumplirse cuatro scenarios de `directorio-publico` ("slug que no está en ningún catálogo", "compuesto que no existe", "ficha inexistente" y la parte de "ve la página 404 en español" de "ficha de un negocio no publicado") y la 404 de `layout-base` ("Página 404 en español dentro del layout").

**Qué manda hoy Next** (medido en 2a, `d-validacion.md`):

- **Cuándo pasa.** `notFound()` dentro de `[destino]` o de `[ficha]`: slug desconocido, compuesto inválido, identificador inexistente o malformado, ficha en revisión, rechazada, despublicada o borrada.
- **Qué responde el servidor.** Un 404 con un documento de error: `<html id="__next_error__">`, un `<head>` con metadatos, el `<body>` vacío salvo el runtime de Next, sin hoja de estilos y sin el script de la medición.
- **Qué ve el vecino.** Con JS, "No encontramos esta página" dentro del header y el footer, que es lo mismo que pinta la 404 global. Sin JS, una página en blanco.
- **Qué falta medir.** El `<head>` exacto, el `lang` y el `Cache-Control` no se han medido. La tarea 2 los captura como fixtures.

**Cómo se logra en Astro:**

1. **Un componente sin props.** `src/astro/componentes/NoEncontradoDinamico.astro` pinta `<DocumentoBase noEncontrado metadatos={…}><NoEncontrado /></DocumentoBase>`.
   - Los metadatos son **constantes**: los del sitio, más lo que Next obtiene de `generateMetadata` cuando no hay negocio, ajustados al `<head>` medido en la tarea 2.
   - No acepta props ni lee `Astro.params`, `Astro.url` ni el negocio. Así no puede filtrar nada, y el HTML sale idéntico byte a byte en todos los casos.
   - Reutiliza `NoEncontrado.astro`, el mismo componente de la 404 global, así que los dos textos no pueden divergir.
2. **Las páginas lo pintan en lugar del contenido.** En `[destino].astro` y `[ficha].astro`, el frontmatter decide si el destino o la ficha publicada existe. Si no existe:
   - pone `Astro.response.status = 404`;
   - no hace ninguna otra consulta;
   - pinta `<NoEncontradoDinamico />` en lugar de `TroncoPublico`.
3. **Sin `return new Response(…)`.** Ya no hace falta. Astro solo reencamina a `404.astro` las respuestas 404 con `body === null` (`node_modules/astro/dist/core/routing/handler.js:126-128`), y una página pintada con estado 404 siempre trae cuerpo, así que sale tal cual. La respuesta pasa por el middleware, que le pone las cuatro cabeceras, el `charset` y el `Cache-Control` dinámico, igual que a cualquier página dinámica. Si la medición de la tarea 9 mostrara que Astro sí la reencamina, el dev lo reporta antes de buscar otro mecanismo.
4. **Sin medición por estructura.** El componente usa `DocumentoBase` directo, no `TroncoPublico`, así que no puede traer `ScriptAnalitica`.
   - Lleva el comentario `// fuera de la medición: <motivo>`, y la prueba de exclusión (2a, tarea 7) lo reconoce como exclusión declarada. Las páginas `[destino].astro` y `[ficha].astro` siguen usando `TroncoPublico` para sus respuestas 200.
   - El motivo es el mismo de M-1 y el de hoy: las URLs de fichas no publicadas llevan el nombre del negocio y no deben llegarle al proveedor. Hoy estas 404 tampoco se miden.
5. **Sin rastros del marco.** No se copia `id="__next_error__"`. En el documento no aparecen "Next", "Astro" ni una traza.
6. **Diferencias aceptadas contra Next.** Se aplican solo a las respuestas que responden 404 en las dos versiones y cuya URL está en la lista de 404 dinámicas del §7. `scripts/diff-html.mjs` las trata con una lista explícita, `NORMALIZACIONES_404_DINAMICA`, que tiene exactamente estas tres entradas:
   - **`<body>`:** el de Next (vacío salvo el runtime) no se compara. En su lugar, el `<body>` de Astro se compara contra el `<body>` de Next para `/a/b/c`, que es lo que Next pinta como 404 en el servidor y lo que ve hoy el vecino con JS. Tiene que coincidir sin diferencias.
   - **Hoja de estilos:** se ignora el `<link rel="stylesheet">` que Astro agrega al `<head>` y que el documento de error de Next no trae. Cualquier otra diferencia de `<link>` se reporta.
   - **Atributos de `<html>`:** se ignoran `lang` y `class` del `<html>`, porque el documento de error de Next no trae los del layout. `id="__next_error__"` ya era ruido de Next en 2a.

   Todo lo demás se sigue comparando y cualquier diferencia se reporta: el estado, las cabeceras, `<title>`, `<meta>`, la canónica, la ausencia del script de la medición y la ausencia de JSON-LD. El script imprime en su salida cuántas veces aplicó cada normalización y en qué URLs, para que el validador vea el alcance. Si aparece una cuarta diferencia, no se agrega a la lista: el dev la reporta.
7. **Qué prueba lo fija:**
   - `tests/plataforma-astro-404-dinamica.test.ts` (tarea 3) verifica el contenido visible, el 404, el `noindex`, que no haya medición ni datos del negocio, y que una ficha no publicada y una inexistente respondan igual (detalle en la tarea 3).
   - El diff con `--incluir-2b`, con las tres normalizaciones del punto 6 y nada más, es la red final.

## 2. Precarga de la foto prioritaria

- Next pone en el `<head>` un `<link rel="preload" as="image" …>` para la imagen prioritaria (React 19 a partir de `Imagen` sin `loading`). Hay una por ficha con foto y una por listado o resultados cuya primera tarjeta tiene foto.
- Con Astro, React pinta cada componente con `renderToString` y deja ese `<link>` **en línea**, donde se pinta el componente. Esto se mide en la tarea 6.
- Regla: el conjunto de `<link>` del `<head>` y la secuencia del `<body>` deben coincidir con Next.
- Si React lo deja en línea, el dev lo resuelve **en la capa de Astro** (layout o página): calcula la URL prioritaria con `urlDeFoto`, sin tocar `src/components/`, y la emite en el `<head>`.
- **Decisión del fundador, por delegación:** si la precarga no se puede igualar sin tocar `src/components/`, el dev lo reporta en `reports/b-dev.md` y se **acepta como diferencia documentada**. Hay que anotar qué `<link>` queda dónde y en qué rutas. Esta decisión **no autoriza** cambios a la capa `Imagen` ni a ningún otro archivo de `src/components/`. La diferencia se acepta solo con la posición de la precarga: la URL, la variante, el `loading` y el resto del documento siguen exigiendo paridad. Si la diferencia queda aceptada, se agrega como una entrada más del diff, limitada a las rutas con foto prioritaria, y se anota en la descripción del PR.

## 3. Ruta de fotos: lo que se agrega al §8 de 2a

- **Bytes:** el endpoint devuelve los bytes del almacén tal cual (`servirFoto`). No reprocesa la imagen ni redirige al almacén. El cuerpo nunca trae una URL del bucket ni una firma. Como las variantes se generaron sin EXIF al registrarlas, servir los mismos bytes conserva esa garantía. La prueba compara el hash del cuerpo de Next y el de Astro para la misma clave.
- **Cabeceras:**
  - El middleware solo agrega las que faltan. Así se conservan `Cache-Control: private, max-age=3600` (publicada) y `no-store` (404), además del `X-Content-Type-Options` que ya pone `servirFoto`.
  - `Content-Type` y `Content-Length` quedan iguales.
  - El 404 no lleva `Content-Type: text/html`, porque `ajustar` solo toca HTML.
- **Métodos y rutas raras:** `HEAD`, `POST` y las rutas adversariales (`../`, `%2F`, `%00`, `%2e%2e`, variante inexistente, clave de otro negocio, mayúsculas) se comparan contra Next en el diff. Para los cuatro casos de la spec (en revisión, rechazado, inexistente e inventada con forma válida), la respuesta debe ser el 404 vacío idéntico. Si una ruta malformada no casa con el endpoint, en los dos marcos puede acabar en la 404 global. Eso es aceptable solo si Next hace lo mismo, y cualquier diferencia se reporta.
- **Fallo de la base o del almacén:** sigue siendo el 404 vacío (`servirFoto`), nunca un 500 de `500.astro`.

## 4. Lectura de parámetros

- `?colonia=` y `?q=` se leen con `Astro.url.searchParams.get`, que devuelve el primer valor, igual que hoy con `primerValorDeConsulta`.
- `/buscar` conserva `recortarConsulta` y la limpieza de invisibles. Se mueven sin cambios a un módulo de `src/astro/` para que la página `.astro` y sus pruebas los compartan.
- `params` llega decodificado en los dos marcos. El identificador se sigue extrayendo con `extraerIdDeSegmentoFicha`.

## 5. `"404"` y `"500"` en `SEGMENTOS_RESERVADOS`

- Astro publica `/404` y `/500` como rutas. Un giro o una categoría con ese slug quedaría tapado.
- En 2a esto se compensó con una aserción sobre el catálogo de hoy, que es más débil (d-validacion, guardianes).
- Agregar las dos cadenas a `src/lib/rutas-reservadas.ts` es un cambio de datos que no altera ninguna URL ni ningún comportamiento de Next. Es la **única** línea de `src/lib/` que toca este change.
- La prueba que exigía el catálogo sin "404" ni "500" se conserva y además se exige que las dos estén reservadas.

## 6. Despublicar no espera a ninguna caché

- Las cuatro rutas son dinámicas. Las páginas mandan `private, no-cache, no-store, max-age=0, must-revalidate` y la foto `private`, así que ninguna CDN ni proxy guarda nada.
- El guardián de `despliegue` (2a) sigue impidiendo que una prerenderizada importe `@/lib/directorio`, `@/lib/prisma` o `@/lib/fotos/*`. Así ninguna de estas páginas puede quedar congelada en el build.

## 7. Rutas del diff en 2b

Para el diff, `--incluir-2b` deja de ser opcional y se agregan:

- las URLs del sitemap de Next que caen en `/[destino]` y `/negocio/…`;
- una categoría con `?colonia=` válida, otra con una colonia inventada y otra con la colonia repetida;
- un giro vacío y un giro+colonia vacío (`noindex`);
- `/buscar`: sin `q`, con resultados, sin resultados, con `q` repetido y con `q` hostil;
- las 404 dinámicas: slug, compuesto, ficha inexistente y ficha en revisión;
- una foto publicada, una en revisión y una inventada;
- `/negocio`, `/api` y `/api/foto` a secas, cuyo estado se mide y no se supone.

Las normalizaciones de §1, punto 6, se aplican **solo** a las URLs de la viñeta de 404 dinámicas y a `/no-existe`. No se aplican a `/a/b/c` ni a ninguna otra ruta.

## 8. Enlaces a rutas de fases posteriores

**Decisión del fundador, por delegación:** los enlaces que pinta la ficha a `/registro` y a `/negocio/<…>/reportar` esperan a la Fase 3 (T-024). En la build de Astro de 2b responden la 404 global, el HTML de la ficha no cambia y el guardián de enlaces los acepta como excepción explícita por fase. No se crean páginas provisionales.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| **404 dinámica (alternativa B):** el `<body>` difiere a propósito del documento de error de Next, y una normalización del diff demasiado amplia podría esconder una diferencia real o una fuga de datos del negocio. | La lista es explícita y tiene tres entradas (§1, punto 6). Solo aplica a 404 en las dos versiones y en las URLs del §7. El `<body>` de Astro se compara contra el de Next en `/a/b/c`, no se ignora. El script imprime cada normalización aplicada. La tarea 3 exige sin dependencia del diff que la ficha no publicada y la inexistente respondan igual, sin medición y sin datos del negocio. |
| **404 dinámica:** que Astro reencamine la respuesta a `404.astro` (prerenderizada, sin `Cache-Control` dinámico). | Una página pintada siempre trae cuerpo (`handler.js:126-128`). La tarea 9 lo comprueba sobre la build, y si falla el dev lo reporta. |
| **Precarga:** React deja el `<link rel="preload">` en línea y no se puede mover sin tocar `src/components/`. | Se acepta como diferencia documentada (§2), sin cambios a `Imagen`. |
