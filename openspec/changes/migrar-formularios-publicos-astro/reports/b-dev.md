# Etapa B · dev — migrar-formularios-publicos-astro (T-024, Fase 3a)

Sin etapa UI (no hay `a-ui.md`). Rama `feature/astro-formularios-publicos`. Spec aprobada por delegación (decisiones del fundador al pie de proposal.md). Sin dependencias nuevas.

## Resumen

`/negocio/[ficha]/reportar` (con su Action) y `/reportar/gracias` ya se sirven con Astro. Se agregaron la regla de origen de Next en el middleware (con `checkOrigin` apagado), la página 403 en español, la tabla que ata cada Action a su ruta (la vía RPC queda cerrada), el PRG con destinos fijos y un tope de cuerpo de 6 MiB. **El diff contra Next de `main` da cero diferencias en las 15 rutas de 3a, en las variantes A (`SITIO_URL`), B (+ medición) y C (producción sin `SITIO_URL`). Los 8 envíos del arnés salen iguales, salvo la diferencia aceptada: con origen ajeno o `null`, Next responde 500 y Astro 403.** De `src/lib/` solo cambió una línea (`rutas-reservadas.ts`) y de `src/components/` solo la firma y el `method` de `FormularioReporte`.

## Línea base (tarea 1)

- HEAD (base `prisma dev --name t024apruebas`): 142 archivos; 3973 pasan, 3 fallan, 3 expected fail y 2 saltadas. Hubo que regenerar el cliente de Prisma, que estaba viejo: en la primera corrida reprobaban 425 pruebas.
- Las 3 que fallan son preexistentes y locales:
  - `plataforma-astro-build › .next/`: hay un `.next/BUILD_ID` de un `next build` del 1 de octubre en el árbol;
  - `admin-reportes-paginas:235` y `aviso-pendientes-tarea`: datos que deja otro archivo según el orden.
- `it.fails` "[T-024]": `fotos-ruta-salida` ("POST sin Origin…") y `astro-seguridad-adversarial` ("[brecha conocida T-024]…").

`expect(` antes → después, sin `skip`, `only` ni `todo` nuevos:

- los 6 archivos que importaban la ruta de reportar: `reportes-pagina` 83→83, `reportes-adversarial` 32→32, `reportes-seguridad-adversarial` 139→140, `layout` 159→167, `responsivo-guardian` 20→20, `buscador-pagina` 60→60;
- otros: `astro-seguridad-adversarial` 39→40, `fotos-ruta-salida` 35→35, `analitica-exclusion-admin` 62→62, `plataforma-astro-build` 55→70, `diff-html` 49→59.

`grep` de imports de `src/app/(publico)/negocio/[ficha]/reportar` en `tests/`: vacío. Quedan dos menciones que no son imports: la lista blanca de `noindex` de `buscador-pagina` y un comentario.

## Tareas

1–18 `[x]`. 19 `[~]`: preview de Vercel, paso humano. 20 `[ ]`: el PR lo abre el validador. Dejé tres correcciones anotadas en tasks.md (6, 9 y 12), explicadas abajo.

## Mapa scenario → prueba (`plataforma-astro`, 3a)

| Scenario | Prueba |
|---|---|
| Envío ajeno; `Origin: null` no es 500; host detrás del proxy; sin `Origin` | `astro-origen` (build), `astro-origen-regla` (21 casos en tabla) |
| La brecha queda cerrada | `fotos-ruta-salida` y `astro-seguridad-adversarial` (de `it.fails` a `it`), `astro-origen` ("Cross-site") |
| RPC cerrado; Action desde una ruta ajena | `plataforma-astro-reportar` (Actions fuera de su ruta), `reportar-accion` (fuera de ruta), `plataforma-astro-build` (sin `_actions` en `config.json`) |
| El `Referer` no decide; recargar no reenvía | `plataforma-astro-reportar` (PRG) |
| Formulario igual al de hoy; el id ya no viaja; ficha no publicada; borrador hostil | `plataforma-astro-reportar` (contra fixtures, con y sin `SITIO_URL`), `reportes-*` re-apuntadas, diff A/B/C |
| Enviado; error con comentario; honeypot, tope y cupo; campos que dictan el destino; id inservible; cuerpo desmedido | `plataforma-astro-reportar` (arnés contra `respuestas.json`), `reportar-accion` (contexto falso), `reportes-*` re-apuntadas |
| Confirmación igual; segmento hostil | `plataforma-astro-reportar`, `reportes-seguridad-adversarial` |
| El primer valor no evade el cupo; nadie usa `clientAddress`; concurrencia | `plataforma-astro-cupos` (la concurrencia solo con backends independientes) |
| Cabeceras en todo el recorrido | `plataforma-astro-build` ("[3a] …") |
| Recorrido completo sin JS; mismo desenlace que Next | `plataforma-astro-reportar`, `arnes-formulario`, diff con el arnés |
| Misma dureza; el diff no toca producto | conteos de arriba, `grep`, `git diff --stat` |
| MODIFIED: `/registro` es la única excepción | `layout` (`EXCEPCIONES_FASE_3` solo con `/registro`; resuelve el `action` del formulario) |

## Decisiones técnicas

- **Mecanismo del 403, medido.** `rewrite()` con POST funciona. El middleware pone `locals.envioRechazado` y reescribe a `src/pages/envio-rechazado.astro` (`src/middleware.ts:47-56`). En la segunda pasada solo se pinta. La página fija el 403 con la marca y sin ella pinta `NoEncontradoDinamico` (404): `GET /envio-rechazado` es idéntico a `/loquesea`. El segmento entra en `SEGMENTOS_RESERVADOS`. Un `x-astro-locals` del cliente no abre el 403 (lo prueba `astro-origen`).
- **"Como dirección inexistente" no es `new Response(null, {status: 404})`.** Con ese cuerpo vacío, Astro pide la 404 prerenderizada a `http://localhost` (`core/errors/default-handler.js`, sin `allowedDomains`) y responde una 404 vacía. Por eso:
  - en la función, se reescribe a `/envio-rechazado` sin la marca (`src/astro/acciones.ts:96-98`);
  - además, `/_actions/[...path]` sale de la tabla de Vercel (`astro.config.mjs`, `RUTAS_FUERA_DE_LA_TABLA`), así que la vía RPC es literalmente la 404 de la CDN.
  - La respuesta de una Action pedida desde otra ruta tiene el mismo estado, cuerpo y cuatro cabeceras que `/a/b/c`. Su `Cache-Control` es el dinámico, más estricto que el de la CDN, que no lo trae.
- **Orden del middleware** (`src/middleware.ts:42-56`): origen → tabla y PRG → `prepararRespuesta`. El 303 se arma con cabeceras mutables (`src/astro/acciones.ts:66-69`), porque el adaptador le agrega después el `Set-Cookie`. La prueba sobre la build lo confirma.
- **`Cache-Control` medido en Next:** el 303 y la 404 de un envío llevan `no-cache, no-store, max-age=0, must-revalidate` (`CACHE_DE_ACCION`), y la página, el dinámico. El 403 no existía en Next y lleva el dinámico.
- **`ActionError` → `?error=servidor`** (`src/astro/acciones.ts:84-94`), y no solo con `CONTENT_TOO_LARGE`. Lo mismo pasa con un cuerpo que no es formulario y con una falla interna, que `callSafely` de Astro convierte en `ActionError`. Si la ficha no está publicada, responde la 404.
- **El pegamento se copió tal cual** de `accion.ts` a `src/astro/reportar.ts:112-196`. La Action (`src/actions/index.ts`) solo delega. El resultado es cerrado (`redirigir`, `no-encontrado` o `fuera-de-ruta`) y la tabla desobedece cualquier otra forma, incluida una ruta que no pase `destinoSeguro`.
- **La IP se lee con `ipDeEncabezados(contexto.request.headers)`** (`src/astro/reportar.ts:161`). Nunca se usa `clientAddress`, y lo vigila un guardián con su fixture.
- **Confirmación:** el segmento es el crudo de `Astro.url.pathname` (`gracias.astro:19`), porque Next lo devolvía sin decodificar (fixture `gracias-hostil`).
- **El formulario postea a `actions.reportar.toString()`** (`"?_action=reportar"`). Pasarle `actions.reportar` (la función) hace que React agregue el oculto `_astroAction`.
- **`resumenDelDesenlace`** compara `SameSite` sin distinguir mayúsculas (Next manda `lax`, Astro `Lax`) y no compara `Expires` (Next lo agrega y Astro no; `Max-Age` dice lo mismo).

## Guardianes ajustados (antes → después, para el validador)

1. **`compat-seguridad-adversarial`** ("revisión de origen"). Antes exigía `checkOrigin` distinto de `false`. Ahora exige que, si Astro no revisa el origen, el middleware lo haga antes de la tabla de Actions (`revisaElOrigenAntesDeLasActions`). La invariante sigue siendo que el origen siempre se revisa. Mutación: si se quita la llamada, el guardián reprueba (revertida).
2. **`astro-middleware` y `astro-seguridad-adversarial` (§3):** el contexto falso suma `request` (GET), `locals` y `routePattern`, porque el middleware ahora los lee. No cambió ninguna aserción.
3. **`astro-seguridad-adversarial`:** "el 403 no filtra nada más que su frase" (`length < 80`) pasa a "es la página en español y no repite nada de la petición", que es más estricta (lo pedía la tarea 4).
4. **`plataforma-astro-build`, `componentesDeLaFuncion`:** el manifiesto ahora sale en un trozo compartido. Se leen `entry.mjs` y `chunks/` y se conservan las aserciones.
5. **`layout`:**
   - `problemasDeEnlaces` y `problemasDeEnlacesEnAstro` resuelven un `action="?…"` contra la ruta de la página. Sin la ruta sigue siendo un problema, y una prueba fija las dos cosas.
   - El destino inexistente `…/reportar/gracias` se cambió por `…/reportar/enviado`, porque la confirmación ya existe en Astro.
6. **`reportes-pagina`:**
   - Los tres "basura en vez de formulario" pasan de 404 a `?error=servidor`. El `.bind` con más argumentos no existe en Astro, y se mantienen "sin fila" y "nunca 500".
   - "Liga un solo argumento" pasa a "no liga ninguno", sobre la fuente `.astro`.
7. **`reportes-seguridad-adversarial`:**
   - El espía de `notFound()` pasa a "la 404 de revisión es idéntica a la de un id inexistente y no trae el nombre".
   - En la confirmación hostil se exige el `href` codificado, como en Next servido. La prueba vieja pasaba el valor ya decodificado.
8. **`analitica-exclusion-admin`** suma `envio-rechazado.astro` con su motivo. Mutación: sin el motivo reprueban 2 pruebas (revertida).

## Diff y envíos contra Next (tarea 17)

Next de `main` (`git archive`, solo lectura) con `next start`, y la salida de Astro con el emulador. Las dos usaron la misma base `prisma dev --name t024aparidad`, con `db:seed`, `db:seed:demo` y 4 fichas ficticias más (en revisión, rechazada, despublicada y una con 10 reportes).

```
node scripts/diff-html.mjs <next> <astro> --datos datos.json --solo-3a
A (SITIO_URL), B (+ NEXT_PUBLIC_UMAMI_*), C (producción sin SITIO_URL): "Cero diferencias en 15 rutas." (exit 0 en las tres)
- NORMALIZACIONES_FORMULARIO: atributos-del-form 7 y campos-action-de-next 7 → las 7 del formulario (sin error, 5 ?error=, nombre viejo)
- NORMALIZACIONES_404_DINAMICA (las tres de 2b): 5 → las 5 404 de reportar
Envíos del arnés: igual éxito, sin motivo, comentario 301, honeypot, tope y sin Origin; ACEPTADA Origin ajeno y null (Next 200→500, Astro 200→403)
```

`next start` agrega por su cuenta `x-forwarded-for` en local, así que a partir del cuarto envío de una corrida Next cuenta cupo y Astro (sin ese encabezado) no. Por eso se reinicia Next antes de cada variante. En Vercel los dos lo reciben igual.

## Compuertas (tarea 18)

- `npm run lint`: 0. `npm run typecheck`: 423 archivos, 0 errores.
- `npm run build` con `DATABASE_URL` a `127.0.0.1:1` y sin `SITIO_URL`: Complete. El manifiesto trae `checkOrigin:false` y `actionBodySizeLimit:6291456`.
- `npm test` con PGlite (`t024apruebas`): 148 archivos; 4086 pasan, 1 expected fail ([M1]) y 3 saltadas (2 preexistentes más la de concurrencia). **1 falla preexistente:** el `.next/BUILD_ID` local de la línea base. No lo borré; con un checkout limpio pasa.
- `npm test` contra un PostgreSQL 14 real local (clúster desechable en el scratchpad): 4089 pasan y 0 saltadas, la de concurrencia incluida. La única falla es la misma de `.next/`.
- **Orden del CI (lección A1):** corrí con secuenciador fijo (configuración temporal, ya borrada) `astro-origen` → `-reportar` → `-cupos` → `reportar-accion` → `-build` → `admin-reportes-paginas` → `iteracion2…` → `fotos-huerfanas`. Pasaron todos salvo `.next`, y quedaron 0 negocios, 0 reportes y 0 fotos.
- `git diff --stat`: en `src/lib/` solo `rutas-reservadas.ts` (+1) y en `src/components/` solo `formulario-reporte.tsx`. No hay cambios en `src/app`, `vercel.json`, `prisma/`, `openspec/specs`, `spikes/`, `next.config.ts` ni `package*.json`.
- Bases `t024apruebas` y `t024aparidad`, Next, emuladores y el clúster de PostgreSQL: todo detenido.

## Hallazgos y propuestas (fuera de alcance)

1. **El 403 del adaptador de Vercel con `x-astro-locals`** (`@astrojs/vercel/dist/serverless/entrypoint.js:46-51`, preexistente desde la Fase 1):
   - qué pasa: cualquier petición con esa cabecera y sin el secreto recibe `Forbidden` en texto plano, en inglés y sin las cuatro cabeceras;
   - por qué no se arregla aquí: sale antes del middleware;
   - propuesta: un ticket que envuelva el punto de entrada o quite la cabecera en la CDN;
   - el validador decide si choca con "ninguna respuesta del sitio debe volver a salir así".
2. **Un `Origin` sin host** (`file://…`): Next lo trata como si no hubiera `Origin` y procede; aquí se rechaza. Lo dejé así porque la spec rechaza todo host distinto (`src/astro/origen.ts:40`).
3. **La foto de 4.5–6 MB en Vercel y el 500 de `Origin: null` en producción de `main`:** siguen como los describe proposal.md.

## Pendientes humanos

- **Tarea 19 (preview de Vercel):**
  - con el JS apagado en Chrome **y** Firefox, recorrer ficha → reportar → sin motivo → corregir → enviar → recargar;
  - con `curl`, revisar las cuatro cabeceras en el formulario, el 303, el 403 (`-H "Origin: https://ajeno.example"`) y la 404;
  - confirmar que `/_actions/reportar` responde la 404 de la CDN;
  - enviar 4 reportes con un `x-forwarded-for` falso distinto cada vez: el cuarto debe agotar el cupo.
- **CI:** la de concurrencia solo corre ahí (`postgres:17`).
- **Diff completo (2a + 2b + 3a):** solo corrí `--solo-3a`; las rutas de 2b necesitan el Storage falso de fotos. El middleware cambió para todas las rutas, pero las suites de 2a y 2b pasan. Conviene que el validador corra el diff completo.
