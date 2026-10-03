# Etapa C · seguridad y pruebas adversariales: migrar-tareas-programadas-astro (T-027, 6a)

Worktree `enmirumbo-f6a`, sin commits. Probado contra la salida construida (emulador del Build Output API, Resend falso, `FOTOS_DIR` temporal) sobre **PostgreSQL 16 real desechable** (`c6a`, puerto 55436, ya detenido). No se usó ningún servicio ni buzón real.

## Veredicto

**PASA al validador.** 0 críticos, 0 altos, 0 medios. 4 observaciones bajas, ninguna bloqueante.

## Hallazgos

Ninguno crítico, alto ni medio.

### Bajos / observaciones

- **B1 · `scripts/diff-html/tareas-6a.mjs:296`.** En `otro-metodo`, `compararPaso6a` acepta **cualquier** estado de Astro con tal de que Next haya dado 405/204. Un `POST` que ejecutara la tarea (200) saldría como "ACEPTADA" en ese paso. Hoy no se escapa: lo atrapan el estado final de la sesión `puerta` (`diff-html.mjs`: `despues`) y `-puerta` ("otros métodos == firma del 404 malo"). Mi mutación `POST = GET` reprobó ahí. Para endurecerlo bastaría exigir en ese paso `esElCuatrocientosCuatroVacio(a)` o el 403/404 del middleware, y que el log y el correo vengan vacíos. `diff-html-6a.test.ts` no lo cubre.
- **B2 · `scripts/sembrar-tareas.mjs:136-142`.** Siembra `rechazadoEn`, `publicadoEn` y `consintioAvisoEn` como `Date` de JS por `pg`. Las columnas son `timestamp` **sin zona**, y `pg` serializa en la hora LOCAL de la máquina, así que en CST cada edad sale corrida 6 h. Los márgenes de 89/91 días lo esconden y el CI corre en UTC. Pero un caso de límite fino (90 d ± minutos) da un falso positivo: me pasó, y en mis pruebas lo corregí con `toISOString()`. El producto no tiene el problema, porque Prisma escribe en UTC.
- **B3 · `scripts/servir-salida-vercel.mjs:106`.** Con `TRACE`, el emulador se cae entero: `new Request` lanza `TypeError` sin `catch`. Es infraestructura de pruebas, no producto, y la tarea no corre. Pero una prueba futura con `TRACE` tumbaría el emulador a la mitad de la sesión.
- **B4 · Scenario "las rutas de Next siguen igual hasta 6b".** Ya no tiene prueba automática: las 8 pruebas se re-apuntaron a Astro y la verificación contra Next fue una corrida manual (b-dev). Es aceptable porque Next no se construye en esta rama y se borra en 6b. Lo anoto para que el validador no lo cuente como cubierto por la suite.

## Auditoría por punto del encargo

1. **Compuerta del secreto.** La puerta es la primera sentencia del `GET` (`src/pages/api/tareas/*.ts`) y la vigila una regex. Lee `CRON_SECRET` en cada petición y lo recorta; si queda vacío, responde "no". Compara con `secretoDeTareaCorrecto`, sin cambios.
   - Probado, siempre con el 404 vacío idéntico, sin abrir la base (tarpit: 0 conexiones) y sin log de la aplicación: ausente, vacío, truncado, uno de más, sin `Bearer`, `bearer`, dos espacios, `Basic` y misma longitud.
   - Nuevo: un `Authorization` **duplicado** con el bueno detrás de uno malo tampoco ejecuta.
   - Sin `CRON_SECRET` en producción se avisa una sola vez y la ruta no se abre.
   - Canal de tiempo: el único es el preexistente que revela la longitud (`secreto.ts:38`, ya en la propuesta). La puerta de Astro no agrega otro.
2. **Métodos.**
   - `GET`/`HEAD` ejecutan, igual que Next.
   - Dan el 404 vacío sin tocar nada: `POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` (dev) y `PURGE`/`PROPFIND` (nuevo).
   - Un `POST` de otro origen da 403 y uno con `?_action=` da la 404 de Actions. Ninguno ejecuta.
   - `TRACE` no llega a la función (B3).
   - Rutas sin secreto: ninguna de las 15 variantes ejecuta con `GET`/`HEAD` (mayúsculas, `%70`, `%2F`, `%252F`, `%2e`, `x/%2e%2e`, `//`, `;x`, `.json`, `/x`, `/api/tareas[/]`, barra final, doble barra).
   - Con el secreto ejecutan solo la ruta exacta, la **barra final** (Next da 308) y los segmentos `%2e`. El `Request` WHATWG colapsa los `%2e` a la misma ruta, y en Vercel la tabla `^/api/tareas/purgar-rechazados/?$` ni siquiera los casa.
   - **Riesgo de la barra final: ninguno.** Exige el mismo secreto y pasa por la misma puerta, así que no abre otra vía de ejecución. Sin secreto da el mismo 404 vacío que la ruta sin barra. Queda para 6b (`trailingSlash`) solo por paridad.
3. **Purga.**
   - Comprobado sobre la build, con la columna en UTC: 90 d + 5 min se purga; 90 d − 5 min, `rechazadoEn` nulo, publicado y en revisión con fecha vieja no se tocan.
   - Dos purgas a la vez más un barrido en PostgreSQL real: dos 200, la suma de `eliminados` es exacta, 0 `fallidos`, y la foto del publicado sigue intacta (`borrarNegocioDefinitivamente` cuenta `count === 0` como `no-encontrado`, no como fallido).
   - El dev ya cubre que la foto se borra antes que la fila (`purga-foto-rota`: 500, la ficha sigue) y el almacén inalcanzable (`sin-almacen`).
4. **Barrido.**
   - No tocó: `notas.txt`, `.bak`, una variante desconocida, la clave en MAYÚSCULAS, el prefijo `..` ni el nombre con salto de línea.
   - Un enlace simbólico con forma de foto que apunta fuera de `FOTOS_DIR` no borra el destino.
   - Las fotos del publicado siguen. La respuesta no lleva claves.
   - El periodo de gracia ("reciente") y la parada con la base vacía son del dev.
   - `src/lib/fotos/` no cambió (claves `^[0-9a-f]{32}$`).
5. **Aviso diario.**
   - Fail-safe sin configuración, una línea por proceso (`sin-correo`). En `aviso-privacidad`, cero nombres en el correo.
   - Remitente y destino `@ejemplo.invalid`; no hay ningún buzón real en el diff (lo revisé con `grep` de correos, teléfonos y llaves).
   - CRLF en `AVISOS_CORREO_*`: no hay inyección. Son variables del operador, viajan como JSON a la API de Resend (no como cabeceras SMTP) y `src/lib/correo/` no cambió.
   - Doble envío: la `Idempotency-Key` del día y el 409 del falso (`purga`, `aviso-repetido-en-frio`).
   - Que una falla del aviso no tumba la purga, y al revés, lo cubren `aviso-fallido` y `base-caida`.
6. **`secreto.ts`.**
   - Contra `origin/main`, la mudanza de `respuestaDeTareaNoExistente` a `no-existe.ts` es **byte a byte** (`diff` vacío). Todo desde `secretoDeTareaCorrecto` hasta el final del archivo es idéntico (las cuatro funciones).
   - Guardián de `_render.func`, **probado con una mutación**: metí `import { notFound } from "next/navigation"` en `src/lib/fotos/clave.ts`. El guardián reprueba con 62 archivos de `next` y "módulo importa next/*".
7. **Crons en producción: no es un riesgo del adaptador.**
   - `@astrojs/vercel@11.0.11` no lee `crons` (solo mira `trailingSlash` en `vercel.json`, `dist/index.js:189`).
   - Quien los fusiona es `vercel build`, el paso que corre el despliegue desde Git: en `vercel@62.2.0`, `dist/commands/build/index.js`, `mergedCrons = mergeCrons([...localConfig.crons||[], …], buildResults)` y lo escribe en `config.json`.
   - Lo probé corriendo `vercel build` (framework `astro`, sin red ni cuenta) sobre la salida **real** de `astro build` de este worktree (sin `crons`). El `config.json` final trae las dos tareas con su horario y la ruta a `_render`.
   - Que falte `crons` en el `config.json` local es lo esperado.
   - Riesgo residual: que alguien despliegue con `vercel deploy --prebuilt` desde una salida de `astro build` sin pasar por `vercel build`. Ahí sí desaparecerían en silencio.
   - **El humano verifica en el corte:** (a) *Settings → Cron Jobs* del preview lista las dos rutas y horarios; (b) la primera corrida real en *Observability → Crons* (decisión 3 del fundador); (c) que el deploy no sea `--prebuilt`.
8. **Guardianes y pruebas re-apuntadas.**
   - Revisé el `git diff tests/`: ninguna aserción se relajó.
   - Las de `NEXT_HTTP_ERROR_FALLBACK;404` se cambiaron por estado 404, cuerpo vacío, sin `content-type` y **sin ninguna cabecera**, que es más estricto.
   - `despliegue` ahora además exige `prerender = false` y `GET`.
   - **Mutaciones mías, las tres reprueban:**
     - `obtenerPrisma().negocio.count()` antes de la puerta: tarpit (timeout), `puerta` y el regex de la primera sentencia.
     - `export const POST = GET`: el paso de otros métodos y el estado final de `puerta`.
     - El import de `next` (punto 6).
   - `diff-html-6a.test.ts` cubre que no haya secretos ni rutas de la máquina en los fixtures, la `Vary` y la excepción solo para no-GET/HEAD. Le falta lo de B1.
9. **Alcance.**
   - Contra `HEAD`: en `src/lib/` solo cambia `tareas/secreto.ts`; en `src/app/` solo los tres archivos autorizados.
   - Sin diff en `src/middleware.ts`, `vercel.json`, `prisma/`, `openspec/specs/`, `astro.config.mjs` ni `package*.json`.
   - Ningún secreto. Datos ficticios (`77199966xx`, `@ejemplo.invalid`, `re_prueba_falsa`, `enmirumbo.example`).

## Mapa scenario → prueba

Revisé el de b-dev y todo scenario automatizable tiene prueba, salvo B4. "Preview (`curl`, lista de crons)" es manual, del humano, y ahora con el punto 7 como guía.

## Pruebas adversariales añadidas

`tests/plataforma-astro-tareas-adversarial.test.ts`, sobre la build, 7 pruebas, **7/7 pasan**:

| Prueba | Resultado |
|---|---|
| `PURGE`/`PROPFIND`/`TRACE` con el secreto | 404 vacío; `TRACE` no llega; no se ejecuta |
| `Authorization` duplicado (malo, bueno) | 404 vacío; no se ejecuta |
| 15 variantes de la ruta × `GET`/`HEAD`, sin secreto | 404 (o 308); no se ejecuta |
| Las variantes con el secreto | solo `%2e` (misma ruta) y la barra final; nada más |
| Límite de 90 d ± 5 min, nulo, publicado y en revisión | solo se purga el de 90 d + 5 min, sin su foto |
| 2 purgas y 1 barrido concurrentes (PG real) | suma exacta; 0 fallidos; la foto viva queda intacta |
| Nombres hostiles y enlace simbólico en `FOTOS_DIR` | nada ajeno se toca; el destino del enlace sobrevive |

## Compuertas (PG 16 real, `c6a`)

Sobre la base ya migrada y sembrada:

- `npm run lint`: 0.
- `npm run typecheck`: 0.
- `npm run build`: completo.
- `npm test`: **175 archivos, 4443 pasan, 2 expected fail**. Son las 4436 del dev más las 7 nuevas. [A1]/[A2] no aparecieron.

No hice commits. Al terminar no queda nada corriendo: el clúster PG 16 del scratchpad está detenido, y los emuladores también.
