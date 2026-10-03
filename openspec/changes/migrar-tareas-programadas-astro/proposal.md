# Propuesta: migrar-tareas-programadas-astro

**Ticket:** `docs/tickets/T-027-astro-corte-produccion.md` (P1, épica E9). Es la **mitad 6a** del ticket: las dos tareas programadas y la deuda de `src/lib/tareas/secreto.ts`. La mitad 6b (corte y retiro de Next) es otro change, listado al final.
**PRD:** v2 §10 (lo técnico se puede reemplazar si §2–§7 quedan intactos; las specs son el contrato) y §8 (purga de rechazados a los 90 días, compromiso publicado en el aviso de privacidad; no conservar datos sin finalidad).
**Decisiones que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 6, clave técnica 7 ("`sitemap`/`robots`/fotos/tareas → endpoints `.ts` en `src/pages/`. Los crons de `vercel.json` no cambian de ruta"); ADR-007 (nada exclusivo del hosting).
**Contrato:** spec `despliegue` (requirements "La purga de rechazados se dispara sola en producción", "El barrido de fotos huérfanas también corre solo, y se nota cuando no barre", "El 404 de las tareas programadas no las delata", "Lo que se guarda para contar cupos no se queda para siempre", "El borrado definitivo se niega a decir que borró lo que no borró", "En producción ninguna configuración requerida falta en silencio"); spec `modelo-datos` (purga a los 90 días); los requirements del aviso diario de `agregar-aviso-diario-pendientes` (T-020) y los de cupos de `agregar-verificacion-sms-tras-bandera` (T-016), los dos sin archivar. Este change no edita ninguno.
**Rama:** `feature/astro-tareas-programadas`, que sale de `origin/feature/astro-verificacion-sms` en `a4d560e` (trae 3a, 3b-1 y 3b-2; #37 y #38 siguen en review). **El PR se abre como BORRADOR apilado** sobre esa rama y se rebasa contra `migracion-astro` cuando se mergeen #37 y #38. Nada llega a `main` antes del corte.

## Por qué

T-027 exige que "los crons de `vercel.json` respondan igual (404 a extraños)". Hoy, en la build de `migracion-astro` (que ya es `astro build`), `/api/tareas/purgar-rechazados` y `/api/tareas/barrer-fotos-huerfanas` no existen: las dos solo viven en `src/app/`, que ya no se construye. Si la rama se desplegara así, la purga de los 90 días que promete el aviso de privacidad (PRD §8) dejaría de correr sin que nadie se enterara. Además, `src/lib/tareas/secreto.ts` importa `next/navigation`. Como el middleware de Astro importa ese módulo para el aviso de arranque, 62 archivos del paquete `next` viajan hoy dentro de `_render.func` (d-validacion de 2a, `migrar-lectura-publica-astro`).

## Qué cambia

- **Dos endpoints de Astro con la misma ruta** (`design.md` §1): `src/pages/api/tareas/purgar-rechazados.ts` y `src/pages/api/tareas/barrer-fotos-huerfanas.ts`, con `prerender = false`. Traen el mismo cuerpo, el mismo orden, los mismos registros en el log y el mismo JSON que los Route Handlers de Next. `vercel.json` no cambia.
- **La puerta del secreto, antes que nada** (`design.md` §3). Es lo primero que hace cada endpoint: no se construye el cliente de la base, no se lee ningún archivo y no se arma el correo. Sin `CRON_SECRET`, con un secreto equivocado, truncado o de más, sin `Bearer` o sin encabezado, la respuesta es el mismo 404 vacío, idéntico entre todos esos casos y al que hoy emite Next. La comparación sigue siendo de tiempo constante (`secretoDeTareaCorrecto`, sin cambios).
- **Métodos** (`design.md` §1.3). `HEAD` se comporta como `GET`, igual que en Next. Cualquier otro método responde ese mismo 404 vacío sin mirar el secreto (ver duda 1: Next hoy responde 405/204 ahí).
- **`src/lib/tareas/secreto.ts` sin `next/navigation`** (`design.md` §2). Se quita el import y se muda `respuestaDeTareaNoExistente` (el único export que dependía de Next) tal cual a `src/app/api/tareas/no-existe.ts`, que es solo de Next y se borra en 6b. Los otros cuatro exports conservan su firma. Después de esto, `next` ya no viaja en `_render.func`, y eso se mide antes y después.
- **El middleware no se interpone** (`design.md` §4). A `GET` y `HEAD` no les aplica la regla de origen ni la tabla de Actions: pasan directo al endpoint y salen con las cuatro cabeceras de seguridad. Un `POST` nunca ejecuta una tarea.
- **Pruebas sin servicios reales** (`design.md` §5). Hay un **Resend falso** (`tests/fixtures/resend-falso.mjs`, del mismo molde que el Twilio falso), un buzón y un remitente en `@ejemplo.invalid`, el almacén local de fotos en un directorio temporal y la base de pruebas. Ninguna prueba sale a la red.
- **Diff contra Next** (`design.md` §6) con el mismo `CRON_SECRET` de prueba, la misma base sembrada y el mismo Resend falso. Compara estado, cuerpo byte a byte y cabeceras en cada caso. La única diferencia aceptada es la de la duda 1.
- **Pruebas re-apuntadas** de la ruta de Next a la de Astro, con el mismo número de aserciones o más por archivo y sin `skip` nuevos.
- **Ningún texto de UI cambia.** Estas rutas no tienen UI. Los mensajes del log y los JSON son los de hoy, letra por letra.

## Capacidades afectadas

- **`plataforma-astro`**, solo **ADDED**:
  - las tareas responden desde Astro lo mismo que Next;
  - sin el secreto correcto, las tareas no existen;
  - un método que no es `GET` ni `HEAD` no dispara nada;
  - el middleware no se interpone en el disparo;
  - el aviso diario sigue sin datos de nadie y sin servicios reales en las pruebas;
  - `next` ya no viaja en la función de Astro;
  - dureza y límites de 6a.
- **Sin MODIFIED** en `despliegue`, `modelo-datos`, `revision-admin`, `registro-negocio` ni en los changes sin archivar (T-016, T-020). Sus requirements se cumplen tal como están escritos. La letra "el 404 vacío que el marco de trabajo emite" (`despliegue`) es neutral y se cumple: ese 404 es el mismo en estado, cuerpo y cabeceras que el de Next. Si hace falta precisar la redacción, eso va con las enmiendas acumuladas de 6b, como ya anotó el andamio (`agregar-andamio-astro/proposal.md`, tabla de enmiendas).

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/pages/api/tareas/purgar-rechazados.ts` y `src/pages/api/tareas/barrer-fotos-huerfanas.ts`;
  - `src/astro/tareas.ts`: la puerta y el 404 vacío, en un solo lugar;
  - `src/app/api/tareas/no-existe.ts`: `respuestaDeTareaNoExistente` mudada sin cambios, solo para Next, hasta 6b;
  - `tests/fixtures/resend-falso.mjs` y su prueba de guardia;
  - `tests/fixtures/next-6a/`: las respuestas medidas en Next;
  - las pruebas nuevas sobre la build;
  - el modo `--solo-6a` / `--capturar-6a` de `scripts/diff-html.mjs`.
- **Modificado:**
  - `src/lib/tareas/secreto.ts`: solo las líneas listadas en `design.md` §2;
  - `src/app/api/tareas/{purgar-rechazados,barrer-fotos-huerfanas}/route.ts`: una línea de import cada uno (excepción a "no tocar `src/app/`", con el mismo criterio que 3b-1, para que Next siga compilando hasta 6b);
  - las pruebas que importan esas rutas o leen sus archivos: `tareas-programadas`, `purga-rechazados`, `aviso-pendientes-tarea`, `aviso-pendientes-adversarial`, `despliegue`, `buscador-pagina`;
  - `scripts/diff-html.mjs`.
- **Sin tocar:**
  - `src/lib/` fuera de `secreto.ts` (en particular `purga/`, `avisos/`, `correo/`, `fotos/` y `cupos/`);
  - `src/middleware.ts`, `src/astro/{acciones,origen,cabeceras}.ts`, `src/components/`;
  - `vercel.json` (salvo lo que diga `design.md` §1.4), `astro.config.mjs`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/`, `docs/despliegue.md`.

## Siguiente change (6b), después de las Fases 4 y 5 y de la evidencia humana del preview

No se especifica aquí. Queda para el change de la mitad 6b:

- **Retiro de Next:**
  - `next`, `eslint-config-next`, `next.config.ts`, `AGENTS.md`, `src/app/` completo (incluido `src/app/api/tareas/`, con `no-existe.ts`), `next typegen` del `typecheck` y la exclusión de `.next/types/validator.ts` en `tsconfig.json`;
  - el `favicon.ico` duplicado;
  - congelar como HTML literal las pruebas de paridad contra `next/link`/`next/image`;
  - reescribir `tests/despliegue.test.ts` y `tests/tls-certificado-supabase.test.ts` contra la salida del adaptador.
- **Cabeceras finales y barra final** (`trailingSlash`), ya anotadas por 2a y 2b.
- **Docs:** `CLAUDE.md`, `docs/despliegue.md` (incluida §6, que hoy no menciona el marco y probablemente no cambie), PRD v2 §10 y ADR-001 → `reemplazada`. Renombrar `NEXT_PUBLIC_UMAMI_*`.
- **Enmiendas de specs acumuladas** (la letra "Server Component(s)", "marco de trabajo", "más argumentos de los que la acción declara", la letra de T-016 sobre `Cache-Control`).
- **Archivar los changes** de las Fases 1 a 6 y consolidar `openspec/specs/`.
- **El corte:** suite completa, prueba de humo de `docs/despliegue.md` en preview, los 5 puntos del preview de T-021 con veredicto real y deploy con rollback a la mano.

## Fuera de este change

- **Horario de los crons: no hay discrepancia en el repo.** En el worktree, `vercel.json` dice `17 13 * * *` (purga) y `47 9 * * *` (barrido). `.env.example:330` y `docs/despliegue.md` §6 dicen 13:17 UTC, y `tests/despliegue.test.ts:398-408` lo fija. Las únicas menciones de 09:17 son históricas: `despliegue.md:379` explica por qué se movió, y `agregar-aviso-diario-pendientes/tasks.md` 4.1 usa esa hora como reloj de una prueba. El encargo decía lo contrario ("el cron dice 09:17"). No se toca nada.
- **La comparación del secreto termina antes si las longitudes difieren** (`secreto.ts:65`), así que revela la longitud del secreto. Es preexistente, y con un secreto de `openssl rand` no es explotable en la práctica. Si se quiere cerrar, es candidato a ticket propio, no a esta migración.
- **Vercel Cron solo dispara despliegues de producción.** En el preview, la evidencia es el `curl` manual con el secreto y la lista de crons en el panel del proyecto (tarea 14). La primera corrida real disparada por el cron será después del corte.
- **Las rutas con barra final** (`/api/tareas/purgar-rechazados/`): Next responde 308. El comportamiento de Astro se mide en el diff y se reporta, pero se resuelve con `trailingSlash` en 6b.
- **Extraer el aviso a su propia ruta** (`agregar-aviso-diario-pendientes/design.md` §1) sigue fuera: el plan Hobby admite dos crons.

## Dudas para el humano

1. **Métodos que no son `GET` ni `HEAD`.** Medido en la ruta de fotos (2b), Next responde 405 a `POST`/`PUT`/`DELETE` y 204 a `OPTIONS` en un Route Handler que solo tiene `GET`. Eso delata que la ruta existe sin necesidad de secreto, y es justo lo que el requirement "El 404 de las tareas programadas no las delata" quiere evitar. Este change propone el 404 vacío para cualquier otro método: es la única diferencia aceptada contra Next y queda listada en el diff. ¿Se acepta, o se exige paridad estricta (405/204) y se abre el hueco como ticket aparte?
2. **`respuestaDeTareaNoExistente` sale de `src/lib/`.** Esa función es, por definición, un `notFound()` de Next, así que no hay forma de quitar `next/navigation` y dejarla donde está. Se muda sin cambios a `src/app/api/tareas/no-existe.ts`, lo que toca tres archivos de `src/app/` (el nuevo y una línea de import en cada ruta de Next). En Astro, el 404 sale de `src/astro/tareas.ts`. Las otras cuatro firmas de `secreto.ts` no cambian. ¿Se autoriza esa excepción en `src/app/`, igual que la de 3b-1?
3. **Evidencia del preview sin cron real.** Como Vercel Cron no dispara previews, ¿basta con el `curl` manual en el preview (secreto correcto, equivocado y ausente; las dos tareas) más la captura de la lista de crons del panel? ¿O el fundador quiere vigilar la primera corrida real en *Observability → Crons* como paso explícito del corte (6b)?


## Decisiones del fundador (por delegación, 2026-10-02)

1. **Métodos que no son GET ni HEAD: 404 vacío, aprobado.** Next hoy responde 405 a `POST` y 204 a `OPTIONS`, lo que delata que la ruta existe sin necesidad del secreto. Vercel Cron usa GET, así que no hay regresión; es la única diferencia aceptada contra Next en estas rutas.
2. **Excepción en `src/app/` autorizada**, con el mismo criterio que 3b-1: `respuestaDeTareaNoExistente` se muda a `src/app/api/tareas/no-existe.ts` (exclusivo de Next, se borra en 6b) y las dos rutas de Next ajustan una línea de import.
3. **Evidencia:** el `curl` manual en el preview no basta (Vercel Cron solo dispara despliegues de producción). La primera corrida real en Observability → Crons es un paso EXPLÍCITO del corte (6b), con plan de reversa si falla.
4. Nota: el horario de los crons ya es consistente (`vercel.json`, `.env.example` y `docs/despliegue.md` dicen 13:17 UTC para la purga); no hay discrepancia que arreglar.
