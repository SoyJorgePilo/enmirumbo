# Tareas: migrar-formularios-publicos-astro (Fase 3a)

Rama: `feature/astro-formularios-publicos`, que sale de `migracion-astro` en `44dd0e3`. El PR va directo a `migracion-astro`.

Reglas:

- Las tareas van en orden por dependencia y cada una se comprueba sola.
- Primero se hacen las referencias de Next y las pruebas en rojo; después, el código.
- `src/app/` no se toca.
- En `src/components/` solo cambia `FormularioReporte` (tarea 10). En `src/lib/` solo puede cambiar `rutas-reservadas.ts` (tarea 9).
- Todos los datos son ficticios del seed (series `771999xxxx`, dominios `.example`).

## Línea base y referencias

- [x] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Tabla con los 6 archivos que importan la ruta de reportar de `src/app/` (`reportes-pagina`, `reportes-adversarial`, `reportes-seguridad-adversarial`, `layout`, `responsivo-guardian` y `buscador-pagina`), con su conteo de `expect(`.
   - Los dos `it.fails` "[T-024]" (`fotos-ruta-salida`, `astro-seguridad-adversarial`).

   Comprobar: la tabla coincide con el `grep`.
- [x] 2. **Fixtures de Next (`tests/fixtures/next-3a/`).** Next de `main` en un worktree, como en 2b, con la base semilla más una ficha en revisión, una rechazada, una despublicada y una con 10 reportes pendientes. Con y sin `SITIO_URL`, capturar:
   - **Pantallas:** el formulario (sin error, con los cuatro `?error=`, con `?error=inventado`, con la cookie de borrador, y con segmento de nombre viejo), la 404 de reportar de una ficha en revisión y de una inexistente, y la confirmación (normal y con segmento hostil).
   - **Envíos:** el estado, el `Location`, el `Set-Cookie` y las cabeceras de cada uno (éxito, sin motivo con comentario, comentario de 301 caracteres, honeypot, cuarto envío de la IP, ficha en el tope, identificador inexistente, `Origin: null`, `Origin` ajeno y sin `Origin`).
   - Anotar el estado del redirect (303 esperado), su `Cache-Control` y lo que responde Next al origen ajeno.

   Comprobar: no hay datos reales y los `<id>` están anonimizados.
- [x] 3. **Arnés de envío sin JS.**
   - `scripts/enviar-formulario.mjs` (o un helper en `tests/`) que lee el `<form>` del HTML servido, manda todos sus campos con el `method`, el `action` y el `enctype` declarados, pone el `Origin` y el `Referer` de un navegador según la política de la página y sigue el 303 a mano.
   - Pruebas unitarias del arnés con formularios de muestra: el de Next con campos `$ACTION_*` y uno nativo.

   Comprobar: corrido contra Next reproduce los envíos de la tarea 2.

## Pruebas en rojo

- [x] 4. **Origen** (`tests/astro-origen.test.ts`, contra la salida servida). Cubre los scenarios del requirement de origen:
   - **ruta de página, endpoint y Action:** `Origin` propio procede; `null`, malformado y ajeno → 403;
   - **`X-Forwarded-Host`:** con lista (se compara el primer valor) y con uno distinto;
   - **sin `Origin`:** procede.

   Del 403 se exige: el documento en español, las cuatro cabeceras, `noindex`, sin medición, sin eco del `Origin` ni del host, ningún "Cross-site" y cero filas nuevas. Los dos `it.fails` "[T-024]" pasan a `it`. La prueba "el 403 de checkOrigin no filtra nada más que su frase" se sustituye por la de cuerpo sin eco, que es más estricta.

   Comprobar: fallan solo porque falta la regla.
- [x] 5. **Reportar sobre la build** (`tests/plataforma-astro-reportar.test.ts`, con el arnés de la tarea 3). Una prueba por scenario de los requirements de página, envío, confirmación, PRG y Actions por ruta:
   - **desenlaces:** los de la tarea 2 contra sus fixtures;
   - **`Referer`:** el destino no cambia con cuatro `Referer` distintos;
   - **recarga:** recargar la confirmación no duplica;
   - **cookies:** los atributos del borrador y su borrado;
   - **404:** las cinco 404 son idénticas byte a byte a la de la ficha (por `GET` y por `POST`), sin `Set-Cookie`;
   - **campos de más:** `negocioId`, `$ACTION_1:0` y `destino` se ignoran;
   - **cuerpo:** uno de 7 MiB, con `Content-Length` y sin él;
   - **Actions fuera de su ruta:** `POST /?_action=reportar`, `POST /negocio/<seg>?_action=reportar` y `/_actions/reportar` (como formulario y como JSON) responden como `/a/b/c`, con cero filas nuevas.

   Comprobar: fallan porque las rutas no existen.
- [x] 6. **IP y concurrencia** (en rojo, contra la build con PostgreSQL):
   - variar el primer valor de `x-forwarded-for` no evade el cupo;
   - sin `REGISTRO_ENCABEZADO_IP` no hay cupo;
   - 14 simultáneos sobre una ficha y 8 desde una misma IP;
   - el guardián de `clientAddress` en `src/actions/`, `src/middleware.ts`, `src/pages/` y `src/astro/`;
   - limpieza con `tests/limpieza.ts` en `afterAll` (lección A1 de 2b).

   Comprobar: el guardián reprueba un archivo de prueba que use `clientAddress` (revertir).

   *Corrección (dev):* la prueba de concurrencia corre solo si la base da backends independientes, como `tests/concurrencia-real.test.ts`: `prisma dev` (PGlite) multiplexa las conexiones en una sesión y el pool de la función mezcla el protocolo (`bind message supplies 2 parameters…`). Se salta con aviso en PGlite y corre en el CI (`postgres:17`); se verificó en verde contra un PostgreSQL real local. El guardián de `clientAddress` se fija con un fixture permanente (`tests/fixtures/con-client-address/`), no con una mutación que se revierte.

## Código

- [x] 7. **Configuración.** En `astro.config.mjs`, `security.checkOrigin: false` y `security.actionBodySizeLimit: 6 * 1024 * 1024`, con su comentario (design.md §1 y §6). Quitar la nota "checkOrigin entra con las fases 3–5".
   Comprobar: el manifiesto construido trae `checkOrigin: false`, y la tarea 4 sigue en rojo solo por la página 403.
- [x] 8. **Regla de origen.** `src/astro/origen.ts`, función pura con la tabla de design.md §1, y sus pruebas unitarias en tabla (los cinco casos, `X-Forwarded-Host` con lista, IPv6 y puerto en `Host`). El middleware la llama primero, antes de la tabla de Actions.
   Comprobar: en verde las pruebas unitarias. La tarea 4 queda en verde salvo el contenido del documento 403.
- [x] 9. **Página del envío rechazado.**
   - Componente sin props en `DocumentoBase`, con "No pudimos recibir tu envío", "Vuelve a abrir la página e inténtalo otra vez." y "Ir al inicio".
   - Lleva `noindex` y el comentario `// fuera de la medición: <motivo>`.
   - Se pinta con el mecanismo de design.md §1, medido. Si `rewrite` no sirve con POST, se reporta antes de cambiar de vía.
   - Si la página publica un segmento, va a `SEGMENTOS_RESERVADOS`, y un `GET` a ese segmento responde como `/a/b/c`.
   - Extender la prueba de exclusión de la medición.

   Comprobar: la tarea 4 en verde, y una variante sin motivo hace fallar la prueba de exclusión (revertir).

   *Corrección (dev):* la página es `src/pages/envio-rechazado.astro` con `DocumentoBase` dentro (no un componente aparte): el guardián de exclusión exige que toda página fuera del tronco use `DocumentoBase` y declare su motivo. Sin la marca pinta `NoEncontradoDinamico` (404), igual que `/loquesea`.
- [x] 10. **`FormularioReporte`.** Ampliar el tipo de `action` a `string | (formData) => …` y poner `method="post"` solo con una URL (design.md §4).
   Comprobar: `npm run typecheck` en verde, `git diff src/components/` muestra solo eso, y las pruebas de render del componente siguen en verde sin cambios.
- [x] 11. **Action `reportar`** (`src/actions/index.ts`). `accept: 'form'`, sin esquema. Comprueba `routePattern`, lee el identificador de `params.ficha` y delega en `src/lib/`, con el pegamento copiado de `accion.ts` (`motivoDelEnvio`, `textoDelEnvio` y la regla de HTTPS). Devuelve un resultado cerrado: el destino o "no encontrado". Escribe o borra el borrador con `context.cookies`.
   Comprobar: pruebas unitarias de la Action con un contexto falso (los desenlaces de la tarea 2), sin `next/*`.
- [x] 12. **Tabla de Actions y PRG en el middleware** (`src/astro/acciones.ts`):
   - tabla `reportar → /negocio/[ficha]/reportar`;
   - RPC y rutas ajenas responden como dirección inexistente;
   - el 303 se arma mutable y exige que el `Location` empiece con `/` y no con `//`;
   - el `ActionError` de tamaño va a `?error=servidor`;
   - "no encontrado" sigue con `next()` y el resultado ya fijado;
   - todo sale por `prepararRespuesta` sin perder `Set-Cookie`.

   Comprobar: de la tarea 5 pasan los bloques de PRG, Actions por ruta y cookies.

   *Corrección (dev):* además, `/_actions/[...path]` sale de la tabla de rutas de Vercel (`astro.config.mjs`, junto a `/_image`), así que la vía RPC es literalmente la 404 de la CDN, igual que `/a/b/c`. "Como dirección inexistente" en la función es un `rewrite` a `/envio-rechazado` sin marca: devolver `new Response(null, {status: 404})` hacía que Astro pidiera la 404 prerenderizada a `http://localhost` y saliera vacía.
- [x] 13. **Páginas.** `src/pages/negocio/[ficha]/reportar.astro` (en `TroncoPublico`; si la ficha no está publicada, `Astro.response.status = 404` y `<NoEncontradoDinamico />`; borrador desde `Astro.cookies`; `?error=` con la lista cerrada; metadatos `noindex, nofollow`) y `reportar/gracias.astro` (sin base de datos).
   Comprobar: la tarea 5 completa y la tarea 6 en verde.

## Verificación

- [x] 14. **Diff de 3a.** Agregar a `scripts/diff-html.mjs`:
   - las rutas de la tarea 2;
   - `NORMALIZACIONES_FORMULARIO`, con exactamente las dos entradas de design.md §4, aplicadas solo al formulario de reportar y con su salida impresa;
   - la comparación de los envíos del arnés (estados, ruta del `Location` y atributos de cookie).

   Comprobar: un campo oculto extra inyectado a mano en el formulario de Astro sale como diferencia (revertir).
- [x] 15. **Re-apuntar pruebas y guardianes.**
   - Pasar a Astro los 6 archivos de la tarea 1.
   - Quitar `/negocio/<…>/reportar` de `EXCEPCIONES_FASE_3` (`tests/layout.test.ts`).
   - Actualizar las listas de no indexables (`buscador-pagina`) y de pantallas medidas (`responsivo-guardian`).

   Comprobar: `expect(` igual o mayor por archivo, sin `skip` nuevos, el `grep` de imports de la ruta de reportar en `tests/` sale vacío, y un `href` inventado sigue haciendo fallar el guardián.
- [x] 16. **Cabeceras y cero JS sobre la build.** Ampliar `tests/plataforma-astro-build.test.ts` con las respuestas del scenario "cabeceras en todo el recorrido" y con el HTML del formulario y de la confirmación sin `<script>` propio, `modulepreload` ni `astro-island`.
   Comprobar: en verde.
- [x] 17. **Diff y envíos contra Next.** Correr el diff con las rutas de 3a, sin medición y con ella, y el arnés contra las dos versiones. Pegar las salidas en `reports/b-dev.md`.
   Comprobar: cero diferencias fuera de `NORMALIZACIONES_FORMULARIO`, de las tres de la 404 dinámica de 2b y de la diferencia aceptada (500 de Next frente al 403 de Astro con origen ajeno).

## Cierre

- [x] 18. **Compuertas.**
   - `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test`, todo en verde.
   - `git diff --stat`: en `src/components/` solo cambia `formulario-reporte.tsx`; en `src/lib/` como mucho `rutas-reservadas.ts`; y nada en `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/` ni `spikes/`.
- [~] 19. **Preview de Vercel (paso humano).**
   - Con el JS desactivado en Chrome **y** Firefox, recorrer ficha → reportar → enviar sin motivo → corregir → enviar → recargar la confirmación. Capturar con DevTools ("Conservar registro") el `Origin` del POST, el 303 y la URL final.
   - Con `curl`, revisar las cuatro cabeceras en el formulario, el 303, el 403 (`-H "Origin: https://ajeno.example"`) y la 404 de una ficha no publicada.
   - Mandar cuatro reportes con un `x-forwarded-for` falso distinto y confirmar que el cuarto agota el cupo (Vercel sobrescribe el encabezado).
   - Anotarlo en el ticket.
- [x] 20. **PR hacia `migracion-astro`.** Lleva en la descripción las salidas de las tareas 17 y 19, las diferencias aceptadas (el 403 en lugar del 500 y `NORMALIZACIONES_FORMULARIO`) y la lista de 3b pendiente. Se enlaza en T-024.
