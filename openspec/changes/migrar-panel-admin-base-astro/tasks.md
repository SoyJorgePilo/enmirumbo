# Tareas: migrar-panel-admin-base-astro (Fase 5a)

Rama: `feature/astro-panel-admin`, que sale de `origin/feature/astro-verificacion-sms` en `a4d560e`. **El PR va como borrador apilado** hasta que se mergeen #37 y #38. Después se rebasa sobre `migracion-astro`.

Reglas:

- Las tareas van en orden de dependencia y cada una se comprueba sola.
- Primero van las referencias de Next y las pruebas en rojo; después, el código.
- Las rutas que se pueden tocar son las del requirement "La mitad 5a no pierde dureza…". En `src/lib/` solo `peticion.ts` y `entrar.ts` (nuevos) y `guarda.ts:50-58`. En `src/app/` solo `accion-acceso.ts` y `accion-salir.ts`.
- Todos los datos son ficticios: WhatsApp `771999xxxx`, dominios `.example`, y contraseña, secreto y cookies generados en la prueba.

## Línea base y referencias

- [ ] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Hacer una tabla con los archivos de `tests/` que importan o leen `src/app/admin/{page,accion-acceso,accion-salir,layout,cola/page,negocios/page,[...resto]/page}`, con su conteo de `expect(`, y separar los de "sujeto 5a" de los de la lista de excepciones (`design.md` §9).

   Comprobar: la tabla coincide con el `grep`.
- [ ] 2. **Fixtures de Next (`tests/fixtures/next-5a/`).** Montar Next de `main` con la base sembrada y la contraseña y el secreto de prueba. Capturar las rutas y estados de `design.md` §7:
   - sin sesión, con la cookie firmada a mano con `crearValorDeSesion` y con cada cookie inválida del §1.5;
   - sin configurar y sin secreto;
   - los envíos sin JS de entrar y salir;
   - `POST /admin/cola` sin `Next-Action`.

   De cada uno: estado, `Location`, atributos de `Set-Cookie`, las cuatro cabeceras, `Cache-Control`, HTML y filas de `IntentoDeCupo`. **Llenar con lo medido la tabla del §1.1** (307/303 "esperado") y la posición del `<meta name="referrer">`, y anotar si Next responde `__next_error__` en el comodín.

   Comprobar: no hay datos reales, las cookies están anonimizadas y las celdas del §1.1 dicen "medido".

## Pruebas en rojo

- [ ] 3. **Guarda por construcción** (`tests/plataforma-astro-panel-guardia.test.ts`, sobre la build):
   - la enumeración de patrones `/admin*` de la salida construida contra `POLITICAS_DEL_PANEL`;
   - el fixture `src/pages/admin/nueva.astro`, que hace fallar la prueba y, servido, responde la redirección (falla cerrada);
   - el recorrido sin sesión con cada cookie inválida y con el panel sin configurar (§1.5, punto 2);
   - las Actions del panel enumeradas desde `ACCIONES` (§1.5, punto 3);
   - el comodín igual con sesión y sin ella, sin leer la cookie;
   - el guardián de `prerender` en `src/pages/admin/`.

   Comprobar: fallan solo porque faltan las rutas y la tabla.
- [ ] 4. **Acceso, entrar y salir sin JS** (`tests/plataforma-astro-panel-acceso.test.ts`, sobre la build, con el arnés de 3a). Los scenarios de "La pantalla de acceso…" y "Entrar y salir…":
   - destinos;
   - atributos de `Set-Cookie`, seguidos con un frasco de cookies;
   - "atrás" tras salir;
   - `?error=` y `?salida=` manoseados;
   - `trasFallar`;
   - el log sin contraseña, cookie ni IP;
   - las cuatro respuestas de error idénticas para cualquier contraseña equivocada.

   Comprobar: fallan solo porque falta la ruta.
- [ ] 5. **Límite de intentos con PostgreSQL** (`tests/plataforma-astro-panel-intentos.test.ts`):
   - la ráfaga de 20 con el primer valor rotado;
   - dos procesos contra la misma base;
   - sin `REGISTRO_ENCABEZADO_IP`;
   - la ventana vencida envejeciendo filas;
   - la base caída al contar.

   Limpiar con `tests/limpieza.ts` en `afterAll`.

   Comprobar: fallan solo por la ruta; la concurrencia se salta con aviso en PGlite.
- [ ] 6. **Cabeceras, referente, caché, no indexación y medición del panel.** Sobre 200, 303, 307, 403, 404 (comodín y Action desde otra ruta) y 500 bajo `/admin`:
   - las cuatro cabeceras;
   - `Referrer-Policy: strict-origin`;
   - `no-store`;
   - `<meta name="referrer">` y `noindex, nofollow` en cada documento;
   - ningún script de medición con la medición configurada;
   - `/admin*` fuera del sitemap.

   Comprobar: fallan solo por las rutas.
- [ ] 7. **Cola y listado** (`tests/plataforma-astro-panel-cola-listado.test.ts`). Los scenarios de `revision-admin` de cola, atrasados, reportados, listado, filtros, paginación y "hereda el acceso", pintados por la build con PostgreSQL. Incluye "el HTML no crece con la base" (30 contra 500) y "nada se escribe desde el listado".

   Comprobar: fallan solo por las rutas.

## Código

- [ ] 8. **`src/lib/` sin Next** (`design.md` §2.3):
   - `peticion.ts` (`esPeticionHttps`, `AlmacenCookiesPanel`);
   - `entrar.ts` (`ejecutarAcceso` y `ejecutarSalida`, con el mismo orden y las mismas líneas de log);
   - `guarda.ts:50-58` delega;
   - `accion-acceso.ts` y `accion-salir.ts` quedan como envoltorios;
   - `admin-acceso` deja de simular `next/*` para la lógica.

   Comprobar: `admin-acceso` igual o con más `expect(`, en verde; `grep "from \"next/" src/lib/admin/{peticion,entrar}.ts` sale vacío; `npm run typecheck` en verde. Mutación: comparar antes de apartar hace fallar la ráfaga de la tarea 5 (revertir).
- [ ] 9. **`DocumentoPanel.astro` y `NoEncontradoDelPanel.astro`**, con `referrer` en `src/astro/metadatos.ts` (en la posición medida) y el comentario `// fuera de la medición: …`. `analitica-exclusion-admin` suma los dos a la lista exacta.

   Comprobar: unitarias de metadatos; un fixture sin motivo reprueba.
- [ ] 10. **La guarda y el referente en el middleware** (`src/astro/panel/guardia.ts`):
   - `POLITICAS_DEL_PANEL` congelada y con falla cerrada;
   - las dos excepciones de Action;
   - la respuesta sin sesión del §1.3 con los estados medidos;
   - `exigirSesionAdmin(contexto)`, que relee la cookie;
   - el paso en `src/middleware.ts`, después del origen y antes de las Actions;
   - `Referrer-Policy: strict-origin` antes de `prepararRespuesta`.

   Comprobar: la tarea 3 en verde. Mutación: mover la guarda después de `atenderAcciones` hace fallar la sonda de lecturas (revertir).
- [ ] 11. **Actions `entrar` y `salir`:**
   - `src/actions/index.ts`;
   - `src/astro/panel/acceso.ts`: adaptador de `Astro.cookies`, `ipDeEncabezados(request.headers)`, auto-comprobación de ruta;
   - entradas en `src/astro/acciones.ts` con `DESTINOS_DEL_ACCESO` y `trasFallar` a `/admin`;
   - el guardián de `clientAddress` cubre los archivos nuevos.

   Comprobar: unitarias con contexto falso. Mutación: un destino fuera de la lista se obedece → falla (revertir).
- [ ] 12. **`src/pages/admin/index.astro`** (acceso, fail-safe con aviso una vez por proceso, 307 a la cola con sesión, mensajes por lista cerrada) y **`src/pages/admin/[...resto].astro`**.

   Comprobar: las tareas 4 y 5 en verde, y el comodín de la tarea 3.
- [ ] 13. **`BotonSalir`**, `src/pages/admin/cola.astro` y `src/pages/admin/negocios.astro`:
   - `BotonSalir.action` pasa a `string | función`, con `method="post"` solo con texto;
   - las dos páginas llaman a `exigirSesionAdmin` antes de leer la base.

   Comprobar:
   - el HTML de `BotonSalir` con función es idéntico byte a byte al de HEAD;
   - `git diff src/components/` muestra solo ese archivo;
   - las tareas 6 y 7 en verde.

## Verificación

- [ ] 14. **Re-apuntar pruebas y guardianes** (la tabla de la tarea 1, `design.md` §9):
   - los de sujeto 5a pasan a Astro;
   - la disciplina por archivo (§1.5, punto 4) reemplaza a la de `src/app/admin` para las piezas de 5a;
   - `iteracion2-seguridad-adversarial` y `despliegue` leen `DocumentoPanel` y el middleware;
   - `marca-guardian` lee `TITULO_PANEL` de Astro.

   Comprobar:
   - `expect(` igual o mayor por archivo, sin `skip` nuevos;
   - el `grep` del §9 sale como dice el diseño;
   - un `href` público hacia `/admin` sigue haciendo fallar el guardián de enlaces.
- [ ] 15. **Diff de 5a** (`scripts/diff-html.mjs`): las rutas, estados y envíos de la tarea 2, con las normalizaciones existentes en alcance (formulario y 404 dinámica), **ninguna nueva** y la salida impresa. Pegar la salida en `reports/b-dev.md`.

   Comprobar: cero diferencias fuera de las declaradas y de las tres aceptadas del §7. Un oculto o un `data-` inyectados a mano en el formulario de acceso salen como diferencia (revertir).
- [ ] 16. **Lectura del revision-admin MODIFIED.** Comprobar que ninguna prueba ni guardián depende del texto "Server Components" y que la del scenario "sin JS de cliente propio" busca también `client:` en `src/pages/admin/` y en `src/astro/panel/`.

   Comprobar: un `client:load` inyectado en `cola.astro` reprueba (revertir).

## Cierre

- [ ] 17. **Compuertas.**
   - `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test` (PGlite y PostgreSQL real), todo en verde.
   - `git diff --stat` solo con las rutas permitidas.
   - Al final, cero negocios, cero fotos y cero filas de `IntentoDeCupo`.
   - Fila en `docs/metricas-pipeline.md`.
- [ ] 18. **Preview de Vercel (paso humano):**
   - en Chrome **y** Firefox sin JS: `/admin` → contraseña equivocada → correcta → cola → "Todos los negocios" con un filtro y una página → "Salir" → "atrás";
   - seis intentos equivocados para ver "Demasiados intentos…";
   - `curl -sD -` de `/admin`, `/admin/cola` sin cookie, el 303 de entrar y `/admin/x` (cuatro cabeceras, `strict-origin`, `no-store`);
   - un `x-forwarded-for` falso distinto en cada intento no da más de 5;
   - Lighthouse móvil de `/admin/cola`.
- [ ] 19. **PR borrador apilado** sobre `feature/astro-verificacion-sms`. Lleva en la descripción:
   - las salidas de las tareas 15 y 18;
   - las diferencias aceptadas;
   - la partición 5b–5d;
   - lo que T-027 quita del Next.

   Pasa a listo y se rebasa sobre `migracion-astro` cuando se mergeen #37 y #38. **El CI de GitHub Actions tiene que quedar en verde.** El merge lo hace un humano. T-026 no pasa a `hecho` hasta 5d.
