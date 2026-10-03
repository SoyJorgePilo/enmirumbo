# Etapa D · validación — migrar-enlace-gestion-astro (T-025, Fase 4)

**Veredicto (segunda pasada): APROBADO.** El único bloqueante de la primera pasada (D-1, typecheck) está cerrado. 0 críticos/altos. PR **borrador** apilado sobre #38 (`--base feature/astro-verificacion-sms`); T-025 en `en-review`.

## Segunda pasada (re-validación tras D-1)

- **Diff desde la primera pasada:** por fecha de modificación, el único archivo tocado después de mi reporte es `tests/gestion-astro-c-seguridad-adversarial.test.ts`. El cambio es solo de tipos (`:320-321`):
  ```ts
  const variantes: Array<Record<string, string>> = [{ categoriaId: "999999" }, …];
  for (const extra of variantes) {
  ```
  Las aserciones (`expect(r.status, …).toBe(200)` y `pendientes(...) === 0`) no cambiaron. Mis respaldos de las mutaciones (`cabeceras.ts`, `editar.ts`, `TroncoGestion.astro`) son idénticos al árbol.
- **Base:** `origin/feature/astro-verificacion-sms` sigue en `a4d560e`, ya contenida en la rama; no hubo que fusionar. `origin/migracion-astro` sigue en `200b2a4`.
- **Compuertas desde limpio** (copia de los archivos versionados y no ignorados, sin `node_modules`, `.astro`, `dist`, `.vercel` ni `.next`):

  | Compuerta | Resultado |
  |---|---|
  | `npm ci` | exit 0 |
  | `npm run typecheck` (paso "Revisar tipos" del CI) | **448 archivos, 0 errores**, 0 warnings, 9 hints |
  | `npm run lint` | exit 0 |
  | `npm run build` con `DATABASE_URL` a `127.0.0.1:1` | Complete |
  | Archivo de C en `prisma dev d4g2c` (migrate → seed → test) | 9 pasan, 1 saltada (la ráfaga, que en PGlite salta con aviso) |
  | Archivo de C en PostgreSQL 16 real (`d4g2/pg`) | **10/10 pasan** (la ráfaga incluida) |

  No repetí la suite completa: el cambio no toca código de producción ni aserciones. La primera pasada dio 4477 pasan, 2 xfail y 0 saltadas en PG 16.
- **Diff de HTML completo 2a+2b+3a+3b-1+3b-2+4 contra Next de `origin/main` (`8d514f5`), ejecutado.**
  - Montaje:
    - Next A/B/C de `origin/main` (comprobado con `diff -r` contra `git archive origin/main`);
    - Astro A/B/C construido desde la copia limpia;
    - la misma base espejo (`db:seed` + `db:seed:demo` + extras ficticios de 2b: fotos de revisión y rechazado, un despublicado con foto y una ficha con 10 reportes);
    - Storage falso en HTTPS local;
    - Twilio falso con `--import` en los dos lados;
    - `REGISTRO_ENCABEZADO_IP=x-forwarded-for`;
    - servidores de base caída para la Fase 4;
    - `IntentoDeCupo` vaciado entre corridas.

  | Build | Encendida (rutas) | Apagada (rutas) | `--solo-4` (encendida y apagada) |
  |---|---|---|---|
  | A (`SITIO_URL`) | **0 diferencias, 109**, exit 0 | **0 diferencias, 102**, exit 0 | 0 diferencias, exit 0 |
  | B (A + Umami) | 0 diferencias, 109 | 0 diferencias, 102 | 0 diferencias |
  | C (sin `SITIO_URL`) | 0 diferencias, 80 | 0 diferencias, 73 | 0 diferencias |

  - Envíos: encendida 52 iguales + 6 ACEPTADA; apagada 28 iguales + 4 ACEPTADA. Son los mismos números que la validación de 3b-2, así que la Fase 4 no movió nada fuera de `/editar/`.
  - Fase 4: 16 rutas y 19 envíos más la base caída, con 35 ACEPTADA en cada corrida:
    - `cabecera-referrer-policy` 34;
    - `meta-referrer-en-la-404` 11;
    - `base-caida`: 500/500, y el token está en el cuerpo de Next y no en el de Astro.
  - Ninguna normalización nueva.
- **Limpieza:** al final, 0 `IntentoDeCupo` y 0 `EdicionPendiente` en la base espejo. Detuve por PID o por puerto propio (3601/3602/4601/4602, 54777, 55473, 55642, `prisma dev d4g2c`). No toqué procesos de `enmirumbo-f5` ni de `enmirumbo-vc`.

## Primera pasada (resumen)

- **D-1 (bloqueante, cerrado):** `npm run typecheck` fallaba con ts(2345) en `tests/gestion-astro-c-seguridad-adversarial.test.ts:320-321`. El arreglo se infería como una unión con `coloniaId?: undefined`. Lo introdujo seguridad-test, que no corrió `typecheck`.
- **Compuertas:**
  - lint 0;
  - build sin base: completa;
  - `npm test` en PG 16, en el orden del CI: 176 archivos, 4477 pasan, 2 xfail, 0 saltadas;
  - en `prisma dev`: 4468 pasan, 2 xfail y 9 saltadas (las ráfagas).
- **`--solo-4` A/B/C:** cero diferencias (16 rutas, 19 envíos, base caída). `--solo-3b` A: cero.
- **Reproducciones propias** (sonda sobre la build A, serie ficticia `77199968xx`, borrada):
  - **no-fuga:** `Referrer-Policy` en 200/303/403/404/500; el token no está en cuerpos, cabeceras, `Location` (exacto `/editar/T/gracias`), sitemap, robots ni el log del 500; Umami no se carga en `/editar`;
  - **404 indistinguible:** byte a byte en 7 motivos, en GET y POST;
  - **campos ajenos:** fila completa idéntica antes y después;
  - **concurrencia en PG real:** 2 simultáneos siempre dan 303,303; con 5, 8 y 10, cada respuesta es 303 o el mensaje de reintento, sin 500 y con una sola pendiente;
  - **peso gzip:** `/registro` 3178 B, `/editar/T` 3671 B, con un solo `<script src>` propio.
- **Mutaciones mías, revertidas:**
  - sin la regla de `referrer-policy` (`src/astro/cabeceras.ts:63`): 25 pruebas rojas;
  - sin `pareceToken` (`src/astro/editar.ts:63`): 4 rojas;
  - `<ScriptAnalitica />` en `TroncoGestion.astro`: 11 rojas.
- **Guardianes:** `expect(` igual o mayor por archivo, sin `skip`/`only`/`todo` nuevos. El único aflojamiento ("0 `<script src>`" pasa a "1 propio") lo exige el requirement de JS.
- **Alcance:**
  - 0 líneas en `src/lib`, `src/app`, `src/components`, `prisma/`, `openspec/specs/`, `package*.json` y configs;
  - 1 línea en `src/middleware.ts:44`;
  - sin dependencias nuevas, `any` ni secretos;
  - teléfonos solo de series ficticias.
- **Spec, ticket y tasks:**
  - cada scenario tiene su prueba, salvo "el aviso no recibe la ruta" (tarea 19, humana);
  - los 3 criterios de T-025 se cumplen;
  - tareas 1–18 `[x]`, 19 `[~]` humana, 20 la cierra este PR.
- **Observaciones de C, confirmadas igual que Next:** B-1, B-2, B-3 y el campo trampa.
- **Limpieza de la base:** queda 1 `IntentoDeCupo` preexistente (`AHORA` fijo de `registro-limite-ip`); no es de este change.

## Para el cuerpo del PR (incluido)

- **Tarea 19 (humana, preview de Vercel):**
  - Chrome y Firefox con y sin JS;
  - la 404 que recarga tras regenerar;
  - con DevTools, el `Referer` del aviso;
  - Umami sin ninguna ruta `/editar`;
  - Lighthouse móvil;
  - regenerar el enlace usado.
- **Notas de archivado:**
  - `registro-negocio`: "mismo estado y mismo documento"; difieren la cabecera y el `Cache-Control`;
  - Next deja el token en claro en `$ACTION_1:1` y en su 500; Astro no.
- **Candidatos a ticket:**
  - reintentos de `guardarEdicion` (`src/lib/gestion/ediciones.ts`);
  - cupo por IP no atómico y sin canonizar (3b-1, aplica también al de ediciones);
  - el middleware no pisa las cabeceras presentes fuera de `/editar/`;
  - la regla de la CDN para las formas de B-1;
  - el M1 de 3b-2 (tope de códigos no atómico).

**PR [#41](https://github.com/SoyJorgePilo/enmirumbo/pull/41) (borrador):** el check `ci` de GitHub Actions pasó (4m36s). El check `Vercel` falla igual que en #37, #38 y #39: es el `vercel.json` sin `framework: astro`, que corrige #40 (allí pasa). La tarea 19 (preview) espera a #40. El CI de GitHub Actions debe quedar en verde en el PR; esta validación local no lo sustituye. El merge lo hace un humano, después de #37 y #38.
