# Tareas: migrar-enlace-gestion-astro (Fase 4)

Rama: `feature/astro-gestion`, que sale de `origin/feature/astro-verificacion-sms` en `a4d560e`. El PR va como **borrador apilado sobre #38**; se rebasa y se re-apunta a `migracion-astro` cuando #37 y #38 se mergeen.

Reglas:

- Las tareas van en orden de dependencia y cada una se comprueba sola.
- Primero van las referencias de Next y las pruebas en rojo; después, el código.
- **Cero líneas en `src/lib/`, `src/app/` y `src/components/`.** En `src/middleware.ts`, solo la línea que pasa la ruta pedida (`design.md` §1.2).
- Datos ficticios: WhatsApp `771999xxxx`, dominios `.example`, tokens generados en la prueba con `generarEnlaceDeGestion` y nunca escritos en un fixture en claro (en los fixtures, el token se reemplaza por `<T>`).

## Línea base y referencias

- [x] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Hacer una tabla con los archivos de `tests/` que importan `src/app/(gestion)/` o nombran sus rutas (`gestion-edicion`, `gestion-seguridad-adversarial`, `responsivo-guardian`, `buscador-pagina`, `analitica-exclusion-admin`, `analitica-adversarial`, entre otros), con su conteo de `expect(`.

   Comprobar: la tabla coincide con el `grep`, y `grep -r 'from "next/' src/lib/gestion` sale vacío.

   > Hecho: línea base y tabla en `reports/b-dev.md`. Los que IMPORTAN `src/app/(gestion)/` eran 4 (`gestion-edicion`, `gestion-seguridad-adversarial`, `responsivo-guardian`, `analitica-exclusion-admin`); `buscador-pagina` y `analitica-adversarial` solo nombran rutas en listas (siguen: las páginas de Next existen hasta T-027).

- [x] 2. **Fixtures de Next (`tests/fixtures/next-4/`).** Montar Next de `main` como en 3b-1 y capturar, con y sin `SITIO_URL` y con y sin medición:
   - **Pantallas:** las rutas de `design.md` §9 (válido, con pendiente, colonia "Otra", cada motivo de 404, segmentos hostiles, `/editar/`, confirmación con token válido e inventado).
   - **Envíos sin JS:** cada fila de la tabla de desenlaces del spec, campos prohibidos, foto fabricada, origen ajeno, `null` y sin `Origin`, `Referer` hostil y ausente.
   - De cada respuesta: estado, `Location`, todas las cabeceras (en especial `Referrer-Policy` y `Cache-Control`), HTML y filas de la base.
   - **Responder con datos medidos:**
     - ¿la `<meta name="referrer">` está en la 404 de un token inválido?
     - ¿qué `Cache-Control` manda la confirmación?
     - ¿la cabecera `Referrer-Policy` es la global en todas?
   - Medir el JS de `/editar/T` en Next (bytes con gzip).

   Comprobar: los fixtures no contienen ningún token en claro ni datos reales.

   > Hecho con `npx tsx scripts/diff-html.mjs --capturar-4` (Next de `origin/main` `8d514f5`). La captura falla si un prefijo de token queda en un archivo. Respuestas medidas en `reports/b-dev.md`.

- [x] 3. **Arnés.**
   - Sembrar fichas con enlace (publicada, con pendiente, colonia "Otra", en revisión, rechazada, despublicada, borrada, regenerada) con tokens generados en la prueba.
   - Un disparador de PostgreSQL **solo en la base de prueba** que hace fallar los `INSERT` en `EdicionPendiente`, para el caso "el guardado falla".
   - Capturar `stdout` y `stderr` del emulador por prueba.
   - Una función que busca un token (completo y su prefijo de 8 caracteres) en cuerpo, cabeceras y log.

   Comprobar: el arnés reproduce contra Next los envíos de la tarea 2, y el disparador hace que Next responda "No pudimos guardar tus cambios…".

   > Hecho: `tests/gestion-astro.ts` (siembra, disparador condicionado a un horario marcado, búsqueda del token), `enviosDe4`/`recorrerEnvioDe4` y el gancho `antesDelEnvio` en `scripts/enviar-formulario.mjs`. El log del emulador ya se capturaba (`Emulador.registro()`).

## Pruebas en rojo

- [x] 4. **Pantallas y 404 sobre la build** (`tests/plataforma-astro-gestion.test.ts`). Un caso por scenario de "La pantalla de edición y su confirmación…" y de "Un enlace que no resuelve…": el HTML de cada variante, `noindex`, sin campos ocultos, y cada motivo de 404 comparado byte a byte por forma de petición y contra `/loquesea`.

   Comprobar: fallan solo porque la ruta no existe en Astro.

- [x] 5. **Envíos sin JS sobre la build** (`tests/plataforma-astro-gestion-envio.test.ts`). Los scenarios de "El envío de la edición sin JavaScript…":
   - la tabla entera contra los fixtures;
   - campos prohibidos y foto fabricada (cero escrituras en el almacén falso de 3b-1);
   - "un token solo edita su propia ficha";
   - envíos simultáneos con PostgreSQL: dos → dos 303; cinco → UNA pendiente, ningún 500 ni detalle técnico, y cada respuesta 303 o "No pudimos guardar tus cambios…" (en PGlite se salta con aviso);
   - el cupo con el primer valor de `x-forwarded-for` rotado y los cupos separados;
   - el guardado que falla y la base caída (500 por O1);
   - recargar la confirmación;
   - la constancia del consentimiento intacta (fila de `Negocio` igual columna por columna).

   Limpiar con `tests/limpieza.ts` en `afterAll`.

   > Corrección (medido): "cinco simultáneos → cinco 303" NO se cumple ni en Next de `main`: `guardarEdicion` reintenta una sola vez y en la segunda vuelta vuelven a chocar (10 rondas: Next 2–3 de 5 con "No pudimos guardar tus cambios…"; Astro igual). Sin tocar `src/lib/`, la prueba exige dos simultáneos → dos 303 y, con cinco, UNA pendiente, ningún 500 y cada respuesta 303 o ese mensaje. La limpieza es por serie (`borrarFichasDe4`, las ediciones caen en cascada), no con `tests/limpieza.ts`.

   Comprobar: fallan solo porque falta la ruta.

- [x] 6. **No-fuga del token y referente sobre la build** (`tests/plataforma-astro-gestion-fugas.test.ts`). Los scenarios de "El token del enlace no sale por ningún canal", "Las pantallas del enlace llevan su política…" y "Editar el WhatsApp no toca la verificación…" (con el Twilio falso):
   - recorrido completo con búsqueda de `T` en cuerpos, cabeceras y log;
   - `Referrer-Policy: strict-origin` en las siete formas de respuesta, y la global en `/` y `/loquesea`;
   - la `<meta>` en las 200;
   - la medición configurada sin script en ninguna pantalla del enlace;
   - `sitemap.xml` y `robots.txt` sin `/editar`;
   - `Cache-Control` sin caché compartida;
   - el envío con `Referer` reducido al origen llega al 303.

   Anotar en `reports/b-dev.md` qué escribe el marco al log en el 500 (duda 3).

   Comprobar: fallan solo porque falta la ruta (las de log, si el marco escribe la ruta, se reportan antes de seguir).

- [x] 7. **El módulo con JS.**
   - Funciones puras de la configuración de edición: cada desenlace, destinos ajenos (otro token, `/registro/gracias`, otro origen, `//evil.example`), 404 → recargar, 500/403 → error de edición.
   - En el DOM de pruebas (`happy-dom`), con las respuestas reales de la build: error en el sitio sin cambiar `location`, foco, valores, "Enviando...", ejemplo genérico al abrir con categoría prellenada y el de la categoría tras un `change`.
   - Las pruebas de `/registro` no se tocan.
   - Peso por página ≤ 5 KB con gzip.

   Comprobar: las de edición fallan, las de `/registro` siguen en verde.

## Código

- [x] 8. **Metadatos y tronco.**
   - `src/astro/metadatos.ts`: el campo `referrer`, en la posición que mide la tarea 2.
   - `src/layouts/TroncoGestion.astro`: `DocumentoBase` sin medición, con su `// fuera de la medición: …` y `referrer: "strict-origin"`.
   - `EXCLUSIONES_DE_ASTRO` y el guardián estático ampliado (`design.md` §2).

   Comprobar: unitarias de `resolverMetadatos` y guardianes en verde. Mutación: `TroncoPublico` en una página de prueba bajo `editar/` falla (revertir).

- [x] 9. **Política de referente del grupo** (`src/astro/cabeceras.ts` y la línea de `src/middleware.ts`): `prepararRespuesta(respuesta, rutaPedida)`; bajo `PREFIJO_DE_GESTION` fija `strict-origin` pisando lo que venga; fuera, nada cambia. Guardián: el prefijo es la carpeta de `src/pages/editar/`.

   Comprobar: unitarias en verde y las de 2a sin tocar. Mutación: quitar la rama de gestión hace fallar la tarea 6 (revertir).

- [x] 10. **`src/astro/editar.ts`:** el manejador (auto-comprobación de ruta, token del segmento, `ipDeEncabezados`, `procesarEdicion`, resultado cerrado), el validador del destino (`pareceToken` y el mismo token), `trasFallar` y `cargarEdicion` (token primero, luego el resultado de la Action). Unitarias con un contexto falso.

   Comprobar: unitarias en verde. Mutación: obedecer un destino con otro token falla (revertir).

- [x] 11. **Action y tabla.** `src/actions/index.ts`: `editar` con `accept: 'form'`. `src/astro/acciones.ts`: la entrada `editar` y el validador de destino por entrada.

    Comprobar: unitarias de la tabla y el MODIFIED de "Cada Action…" (RPC, rutas ajenas) en verde.

- [x] 12. **Páginas.** `src/pages/editar/[token].astro` (`prerender = false`, `TroncoGestion`, 404 con `NoEncontradoDinamico`, `FormularioRegistroNativo` en modo edición y el `<script>` del módulo) y `src/pages/editar/[token]/gracias.astro` (`prerender = false`, `TroncoGestion`, sin base).

    Comprobar: tareas 4, 5 y 6 en verde. Mutación: pintar el formulario cuando el resultado de la Action es `repintar` sin resolver el token falla (revertir).

- [x] 13. **Módulo configurado** (`src/astro/registro-cliente.ts`, `design.md` §4.2–4.4): la configuración, con `/registro` exactamente igual que hoy.

    Comprobar: tarea 7 en verde, pruebas de `/registro` intactas y peso ≤ 5 KB por página.

    > Hecho con el punto de entrada de §4.4 a medias: el motor configurable vive en `registro-cliente.ts` y la configuración de la edición y su texto en `src/astro/gestion-cliente.ts`. El módulo de `/registro` creció 166 B gzip (total de la página 2870 → 3178 B gzip); sus pruebas no cambiaron.

## Verificación

- [x] 14. **Diff de la Fase 4** (`scripts/diff-html.mjs`): las rutas y envíos de la tarea 2, las normalizaciones existentes ampliadas en alcance a `/editar/T`, la 404 del enlace en la lista de 404 dinámicas, las diferencias aceptadas de `design.md` §9 impresas y **ninguna normalización nueva**.

    Comprobar: un oculto o un `data-` inyectados a mano salen como diferencia (revertir).

- [x] 15. **Re-apuntar pruebas y guardianes** (la tabla de la tarea 1): pasan a las páginas de Astro; se suman las pantallas del enlace a las listas de `noindex`, responsivo (390 px, áreas de 44 px) y medición; el guardián de `clientAddress` cubre `src/astro/editar.ts`.

    Comprobar: `expect(` igual o mayor por archivo, sin `skip` nuevos, y el `grep` de imports de `src/app/(gestion)` en `tests/` vacío.

- [x] 16. **Diff y envíos contra Next.** Correr A (`SITIO_URL`), B (+ medición) y C (sin `SITIO_URL`) con las rutas de la Fase 4 y el arnés contra las dos versiones. Pegar las salidas en `reports/b-dev.md` con el JS de Next de la tarea 2 frente al de Astro.

    Comprobar: cero diferencias fuera de las normalizaciones declaradas y de las aceptadas en `design.md` §9.

## Cierre

- [x] 17. **Compuertas.** `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test` (PGlite y PostgreSQL real), todo en verde. `git diff --stat` solo con las rutas permitidas. Al final no queda ninguna ficha, edición, foto ni disparador de prueba.

- [x] 18. **Mutaciones de cierre**, cada una revertida y anotada en `reports/b-dev.md`:
    - `data-token` en la pantalla → falla la no-fuga;
    - `TroncoPublico` en edición → fallan los dos guardianes;
    - sin la cabecera del grupo → falla el referente;
    - destino con otro token → 404;
    - `clientAddress` en `editar.ts` → falla el guardián.

- [~] 19. **Preview de Vercel (paso humano).**
    - En Chrome y Firefox **sin JS**: abrir un enlace de una ficha ficticia, mandar un error, corregir y llegar a la confirmación; recargar.
    - **Con JS:** error en el sitio, "Enviando..." y confirmación; regenerar el enlace en otra pestaña y enviar (duda 2).
    - Con DevTools: `Referer` de "Lee el aviso de privacidad completo" = solo el origen; cabeceras de la 404 de un token inventado.
    - Umami sin ninguna ruta `/editar` y Lighthouse móvil de la pantalla.
    - Regenerar el enlace usado al terminar.

- [x] 20. **PR borrador apilado sobre #38**, con las salidas de las tareas 16, 18 y 19, las diferencias aceptadas y lo que T-027 quita de Next. Se enlaza en T-025, que pasa a `en-review`. Al mergearse #37 y #38, se rebasa y se re-apunta a `migracion-astro`.
