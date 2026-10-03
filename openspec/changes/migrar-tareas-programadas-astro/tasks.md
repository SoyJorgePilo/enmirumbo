# Tareas: migrar-tareas-programadas-astro (T-027, mitad 6a)

> Pruebas primero: las tareas 1 a 7 dejan la medición y las pruebas en rojo (o capturadas), y las 8 a 11 las ponen en verde. Datos 100% ficticios (`771999xxxx`, `@ejemplo.invalid`). Ninguna prueba sale a la red. Trabajo solo en el worktree `/Users/jorgepilo/Documents/enmirumbo-f6a`, rama `feature/astro-tareas-programadas`.

## Medición y andamios de prueba

- [ ] 1. **Medir Next y capturar fixtures.** Sobre Next de `main`, servido fuera del árbol (`git archive`), con la base de diff, `FOTOS_DIR` temporal, un `CRON_SECRET` de prueba y el Resend falso de la tarea 2: `--capturar-6a` en `scripts/diff-html.mjs` escribe en `tests/fixtures/next-6a/` cada caso de `design.md` §6. Cada caso guarda estado, cabeceras completas y cuerpo en base64. Quedan anotados en b-dev, sin suponer nada:
  - el `Cache-Control` del JSON y el del 404;
  - qué hace `HEAD` con el secreto correcto;
  - qué responden `POST`/`OPTIONS`;
  - qué responde la barra final.

  Además se mide `_render.func` de la build actual de Astro: archivos de `node_modules/next/` (se esperan 62) y tamaño. *Comprobable:* los fixtures existen, cada uno con su caso nombrado, y b-dev trae las mediciones.
- [ ] 2. **Resend falso** (`tests/fixtures/resend-falso.mjs`), con guion `aceptado|rechazado|repetido|error|tarda` (o `@archivo`) y un registro JSON por llamada sin el valor de `Authorization`. Cualquier host externo que no sea el suyo lanza. Se agrega su guardián `tests/resend-falso.test.ts`, que comprueba que nada de `src/` ni de la build lo menciona y que lanza ante un host ajeno. *Comprobable:* el guardián en verde, y una llamada a `https://example.com` desde un proceso con el `--import` lanza.
- [ ] 3. **Sembrador y helper.** `scripts/sembrar-tareas.mjs` deja la base y el almacén en el estado inicial de cada caso, sin datos reales y con limpieza por prefijo vía `tests/limpieza.ts`. El helper (en `tests/salida-astro.ts` o un hermano `tests/tareas-astro.ts`) levanta el emulador con estas condiciones:
  - el Resend falso obligatorio;
  - `FOTOS_DIR` temporal;
  - sin las variables del almacenamiento del proveedor;
  - `CRON_SECRET` de prueba;
  - los buzones `@ejemplo.invalid`.

  *Comprobable:* el helper falla si falta el `--import`, y una aserción confirma que el entorno del emulador no trae variables del bucket.

## Pruebas en rojo

- [ ] 4. **Paridad sobre la build** (`tests/plataforma-astro-tareas.test.ts`): cada scenario de "Las tareas programadas responden desde Astro lo mismo que Next" y de "El aviso diario servido por Astro no lleva datos de nadie…", comparando contra `tests/fixtures/next-6a/` (cuerpo byte a byte y cabeceras salvo la fecha), más la base y el almacén después. *Comprobable:* corren y fallan con 404, porque la ruta todavía no existe en Astro.
- [ ] 5. **Puerta, métodos y middleware sobre la build** (`tests/plataforma-astro-tareas-puerta.test.ts`): los scenarios de "Sin el secreto correcto, las tareas no existen", "Un método que no es GET ni HEAD no dispara ninguna tarea" y "El middleware no se interpone…". Incluye la base inalcanzable, el estado intacto con secreto malo, la indistinguibilidad contra Next y contra el 404 de fotos, cada fila de la tabla de `design.md` §4 y el aviso de arranque sin `CRON_SECRET` una sola vez. *Comprobable:* corren y fallan donde corresponde.
- [ ] 6. **Guardianes nuevos:**
  - la función sin `next`: 0 archivos bajo `node_modules/next/` en `_render.func` y ningún módulo que importe `next/*`;
  - `secreto.ts` sin imports de `next`;
  - el 404 de tareas en un solo lugar (`src/astro/tareas.ts`) y sin cabeceras propias;
  - `timingSafeEqual` presente, y ninguna comparación del secreto con `===`, `startsWith` ni `includes` en `src/astro/tareas.ts` ni en los endpoints.

  *Comprobable:* fallan hoy por los 62 archivos de `next` y porque los archivos aún no existen.
- [ ] 7. **Re-apuntar las pruebas existentes**: `tareas-programadas`, `purga-rechazados`, `aviso-pendientes-tarea`, `aviso-pendientes-adversarial`, `despliegue` ("cada ruta declarada existe", que ahora busca en `src/pages/`, y "el aviso viaja encima…") y `buscador-pagina`. Pasan de `src/app/api/tareas/*/route.ts` a `src/pages/api/tareas/*.ts`. Las aserciones `rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)` pasan a "404, cuerpo vacío, sin `Content-Type`". **Antes de re-apuntar**, se corren una vez contra Next tras la tarea 8 para confirmar que la mudanza no cambió nada. *Comprobable:* el conteo de `expect(` por archivo es igual o mayor (antes/después en b-dev), no hay `skip` nuevos, y el `grep` de imports de `src/app/api/tareas` en `tests/` sale vacío.

## Implementación

- [ ] 8. **`src/lib/tareas/secreto.ts` sin Next** (`design.md` §2):
  - se borra el import de `next/navigation`;
  - `respuestaDeTareaNoExistente` se muda sin cambios a `src/app/api/tareas/no-existe.ts`;
  - una línea de import en cada ruta de Next;
  - una frase en el comentario de cabecera.

  Nada más en `src/lib/` ni en `src/app/`. *Comprobable:* `git diff --stat src/lib src/app` muestra solo esos archivos; `npm run typecheck` en verde; las pruebas de Next sin re-apuntar siguen en verde (tarea 7).
- [ ] 9. **`src/astro/tareas.ts`**: `tareaAutorizada(request, env?)`, que lee `CRON_SECRET` en cada petición, aplica `trim`, trata el vacío como `false` y delega en `secretoDeTareaCorrecto`; y `respuestaDeTareaNoExistente(): Response`, el 404 vacío con exactamente las cabeceras medidas en la tarea 1. Su comentario cita las medidas de Next y de Astro. *Comprobable:* pruebas unitarias de los once casos de secreto de `design.md` §3.4 en verde, y el guardián del 404 en un solo lugar en verde.
- [ ] 10. **Los dos endpoints** `src/pages/api/tareas/{purgar-rechazados,barrer-fotos-huerfanas}.ts`:
  - `prerender = false`;
  - `GET` con la puerta como primera sentencia y el cuerpo copiado de Next (mismo orden, logs, JSON y estados);
  - `HEAD` según lo medido;
  - `ALL` con el 404 vacío;
  - el `Cache-Control` del JSON según lo medido.

  *Comprobable:* las tareas 4 y 5 en verde y `npm run typecheck` en verde.
- [ ] 11. **Middleware y aviso de arranque**: sin cambios de código. Se confirma que las filas de `design.md` §4 pasan y que el aviso "[tareas] falta CRON_SECRET" sale una sola vez en la build. Si alguna fila falla, se reporta en lugar de parchar el middleware. *Comprobable:* la tarea 5 en verde y `git diff src/middleware.ts src/astro/acciones.ts src/astro/origen.ts src/astro/cabeceras.ts` vacío.

## Verificación

- [ ] 12. **Diff contra Next** (`--solo-6a`) con los dos servidores, la misma base resembrada por caso, el mismo `FOTOS_DIR`, el mismo `CRON_SECRET` de prueba y el Resend falso en los dos. Solo se acepta la diferencia de otros métodos, y únicamente si el humano la aprueba (duda 1); el script imprime dónde la aplicó. *Comprobable:* sale con código 0, y su salida va pegada en b-dev.
- [ ] 13. **Función y crons en la salida**: medir de nuevo `_render.func` (archivos de `next` → 0, tamaño antes/después en b-dev), revisar si `.vercel/output/config.json` trae `crons` y anotarlo. `vercel.json` no se toca salvo lo que diga `design.md` §1.4 después del preview. *Comprobable:* el guardián de la tarea 6 en verde y b-dev con las cifras.
- [ ] 14. **Suite completa y preview.**
  - `npm test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde, y la sonda final de base limpia ("cola vacía", "nada que barrer").
  - En el preview del PR, a mano por el humano con el secreto del preview:
    - `curl -sD -` a las dos rutas con el secreto correcto, con uno equivocado y sin encabezado;
    - `POST` con el secreto;
    - captura de la lista de crons del panel del proyecto.

    Vercel Cron no dispara previews (duda 3).
  - La fila en `docs/metricas-pipeline.md`.

  *Comprobable:* las salidas de los comandos y las capturas van en d-validacion.
- [ ] 15. **PR en BORRADOR** apilado sobre `feature/astro-verificacion-sms`. La descripción lleva:
  - las mediciones de las tareas 1 y 13;
  - la salida del diff;
  - la diferencia aceptada;
  - la lista de lo que se retira en 6b (`design.md` §7).

  Se rebasa contra `migracion-astro` y sale de borrador cuando se mergeen #37 y #38. T-027 sigue `en-desarrollo` hasta 6b. *Comprobable:* el PR existe en borrador con el CI en verde y el enlace en el ticket.
