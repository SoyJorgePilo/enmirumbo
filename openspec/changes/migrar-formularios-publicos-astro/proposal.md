# Propuesta: migrar-formularios-publicos-astro

**Ticket:** `docs/tickets/T-024-astro-formularios-publicos.md` (P1, épica E9). Este es el primero de los dos changes del ticket (3a).
**PRD:** v2 §10. Lo técnico se puede reemplazar si §2–§7 quedan intactos, y las specs consolidadas son el contrato de cualquier reescritura.
**Decisión que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 3. Costos conocidos en `docs/decisiones/ADR-013-spike.md` (1a: el 403 de `checkOrigin`; 1b: el PRG por `Referer`; 1c: sin almacén de sesión; 3b: componentes que reciben una Server Action como prop).
**Base:** las Fases 1, 2a y 2b (`agregar-andamio-astro`, `migrar-lectura-publica-astro`, `migrar-directorio-publico-astro`) y la fusión con `main` (`migrar-lectura-publica-astro/reports/fusion-main.md`: T-020 aviso diario y T-016 SMS). Esos changes todavía no se archivan.
**Rama:** `feature/astro-formularios-publicos`, que sale de `migracion-astro` en `44dd0e3`. El PR va directo a `migracion-astro`, sin apilarse sobre otros. Nada llega a `main` antes del corte (T-027).

## Por qué

T-024 pide trasladar a Astro los formularios públicos (registro con foto, cupos por IP y versión del aviso, y reportar) sin cambiar el comportamiento. Sus criterios son cuatro: los scenarios de `registro`, `foto` y `reportes` en verde, el envío sin JS con `Origin` correcto, sin 500 y sin reenvío al recargar, el 403 de `checkOrigin` en español y con cabeceras, y Actions que solo delegan en `src/lib/` (T-024, criterios; ADR-013, Fase 3). El spike ya mostró que el 403 de Astro sale en inglés y sin cabeceras, y que el PRG de su documentación se rompe con `strict-origin` (ADR-013-spike, costos 1a y 1b). Además, en 2a y 2b esa brecha quedó abierta a propósito, fijada con `it.fails` "[T-024]".

## Partición propuesta (Fase 3 en dos changes)

| Change | Alcance | Por qué en este orden |
|---|---|---|
| **3a · este change** (`migrar-formularios-publicos-astro`) | Todo lo transversal: la regla de origen en el middleware con `checkOrigin` apagado y su página 403, el PRG con destinos fijos, la tabla que ata cada Action a su ruta (y cierra `/_actions/*`), las cabeceras y cookies en POST, 303 y 403, la lectura de la IP para los cupos y el límite del cuerpo. Rutas: `/negocio/[ficha]/reportar` con su Action y `/negocio/[ficha]/reportar/gracias` | Reportar es el formulario más chico, sin JS, sin archivo y ya sin `useActionState`. Sirve para fijar todo lo transversal con un caso real antes de tocar la foto |
| **3b · siguiente change** (propuesto: `migrar-registro-astro`) | `/registro` (multipart con foto, cupos, honeypot, versión del aviso y constancia, reenvío tras rechazo, embudo medido), `/registro/gracias` y `/registro/verificar` con confirmar y reenviar tras la bandera. Incluye refactorizar `src/lib/verificacion/acciones.ts`, que hoy importa `next/headers` y `next/navigation`, y la forma de pintar `FormularioRegistro` | Es la parte con foto, el estado del formulario con y sin JS y la verificación por SMS. Hereda de 3a la regla de origen, el PRG, la tabla de Actions y la IP ya probados |

Este change especifica **solo 3a**. Las decisiones de 3b quedan resueltas en `design.md` (§4, §6 y §7) para que su spec no tenga que reabrirlas.

## Qué cambia (3a)

- **`security.checkOrigin: false`** en `astro.config.mjs`. La comprobación pasa al middleware, con la regla que hoy aplica Next a las Server Actions (`design.md` §1):
  - `Origin` contra el primer valor de `X-Forwarded-Host` o, si no viene, contra `Host`;
  - sin `allowedOrigins`;
  - un POST sin `Origin` procede, igual que en Next.

  Cuando el envío es ajeno, se responde una página 403 en español, dentro del documento base, con las cuatro cabeceras, sin medición y sin 500.
- **PRG con destinos fijos** (`design.md` §2). El middleware corre la Action y responde `303` hacia una ruta que arma el servidor con lo que devolvió la base, nunca con el `Referer` ni con un campo del envío.
- **Tabla de Actions por ruta.** Cada Action corre solo por envío de formulario y solo desde su ruta. `/_actions/*` (RPC) o una Action pedida desde otra ruta responden igual que una dirección inexistente, sin escribir nada.
- **Action `reportar`** en `src/actions/index.ts`, con `accept: 'form'`. El identificador sale del segmento de la URL, no de un campo. La Action delega en `obtenerNegocioPublicado`, `crearReporte`, el borrador, `construirSegmentoFicha` e `ipDeEncabezados`, sin lógica nueva. El pegamento se copia tal cual de `accion.ts`.
- **Páginas** `src/pages/negocio/[ficha]/reportar.astro` y `src/pages/negocio/[ficha]/reportar/gracias.astro`, en `TroncoPublico` y sin JS. Si la ficha no está publicada, se pinta la 404 dinámica de 2b (`NoEncontradoDinamico`).
- **`FormularioReporte`:** el tipo de `action` se amplía para aceptar la URL de la Action y se pone `method="post"` cuando es URL. Es el único cambio en `src/components/` (`design.md` §4).
- **IP de los cupos:** se sigue leyendo con `ipDeEncabezados` y `REGISTRO_ENCABEZADO_IP`, del último salto. **Nunca** con `context.clientAddress`, que en el adaptador de Vercel toma el **primer** valor de `x-forwarded-for` (`design.md` §5).
- **`security.actionBodySizeLimit` a 6 MiB**, igual que el `bodySizeLimit: "6mb"` de `next.config.ts` (`design.md` §6).
- **Pruebas primero:**
  - fixtures de Next de `main`, incluidos los envíos;
  - un arnés que envía formularios como un navegador sin JS contra la salida construida;
  - las pruebas de origen, PRG, IP y concurrencia;
  - los dos `it.fails` "[T-024]" pasan a `it`;
  - los 6 archivos que hoy importan la ruta de reportar de `src/app/` pasan a apuntar a Astro sin perder aserciones.
- **Diff de HTML** con las rutas de reportar y una lista explícita de normalizaciones del formulario (los campos ocultos `$ACTION_*` de Next y los atributos `action`/`method`/`enctype` del `<form>`), que imprime dónde aplicó cada una.
- **Ningún texto de UI cambia,** salvo el texto nuevo de la página 403, que hoy no existe porque Next responde un 500 (`design.md` §1, duda 1).

## Capacidades afectadas

- **`plataforma-astro`**
  - ADDED: regla de origen y página 403, Actions atadas a su ruta, PRG con destinos fijos, paridad de la página de reporte, de su envío y de su confirmación, cupos por IP sin `clientAddress`, cabeceras y cookies en POST, 303, 403 y 404, envío real sin JS contra la build, y dureza de las pruebas con los límites del change.
  - MODIFIED: "El sitemap, los enlaces y las rutas reservadas resuelven en Astro", que introdujo 2b y todavía no se archiva. `/negocio/<…>/reportar` sale de la lista de excepciones de la Fase 3, que queda solo con `/registro`.
- **Sin MODIFIED a `directorio-publico`:** 2a ya volvió neutral respecto al marco la letra de "Directorio en Server Components…", que cubre la página de reporte. Los requirements de reporte, anti-abuso y privacidad siguen siendo el contrato sin cambios. La frase "un envío que llega con más argumentos de los que la acción declara" describe el `.bind` de Next. En Astro el identificador sale de la URL y los campos de más se ignoran, y así el scenario se cumple igual (ver el requirement de envío). Reescribir esa frase se deja para el corte.
- **Sin MODIFIED a `registro-negocio`, `despliegue` ni `layout-base` en 3a.** Ninguna menciona Server Actions, `"use client"` ni `useActionState` en los requirements que toca esta mitad. 3b revisa los suyos.

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/actions/index.ts` (Action `reportar`);
  - `src/astro/origen.ts` (la regla de origen, función pura) y `src/astro/acciones.ts` (tabla Action → patrón de ruta y destinos del PRG);
  - `src/pages/negocio/[ficha]/reportar.astro` y `reportar/gracias.astro`;
  - la página del envío rechazado (componente y mecanismo de `design.md` §1);
  - `scripts/enviar-formulario.mjs` o su equivalente en `tests/`, que es el arnés del envío sin JS;
  - fixtures `tests/fixtures/next-3a/`.
- **Modificado:**
  - `astro.config.mjs`: `security.checkOrigin: false` y `security.actionBodySizeLimit`;
  - `src/middleware.ts`: origen, tabla de Actions y PRG, antes de `prepararRespuesta`;
  - `src/components/reportes/formulario-reporte.tsx`: el tipo de `action` y `method`, sin otro marcado;
  - `src/lib/rutas-reservadas.ts`, solo si la página 403 publica un segmento propio (`design.md` §1);
  - `scripts/diff-html.mjs`, con las rutas de 3a y `NORMALIZACIONES_FORMULARIO`;
  - las pruebas de reportar, los guardianes (`layout`, `buscador-pagina`, `responsivo-guardian`, `analitica-exclusion-admin`) y los dos `it.fails` de T-024.
- **Sin tocar:** `src/app/` (Next queda inerte hasta T-027), `src/lib/` (salvo la línea de rutas reservadas, si aplica), `next.config.ts`, `vercel.json`, `prisma/`, `openspec/specs/` y `spikes/`.

## Candidatos a ticket de la Fase 2 que aplican aquí

- **"El middleware no pisa cabeceras ya presentes"** (d-validacion de 2b): aquí se vuelve requisito. La página 403, el 303 y la 404 de reportar deben salir con las cuatro cabeceras **y** conservar el `Set-Cookie` del borrador. `prepararRespuesta` copia la respuesta cuando sus cabeceras son inmutables, y una copia puede perder las cookies que Astro asocia al objeto `Response` (`node_modules/astro/dist/core/cookies/response.js:5-12`). El 303 se arma mutable y una prueba lo fija (`design.md` §3).
- **La 404 dinámica de Next tiene el `<body>` vacío sin JS:** la 404 de reportar hereda la alternativa B de 2b (`NoEncontradoDinamico`) y sus tres normalizaciones del diff, sin agregar ninguna.
- **B1 de 2b (normalizaciones del diff demasiado anchas):** sigue abierto. Este change no agrega normalizaciones a la 404 y las del formulario se acotan a una lista explícita.
- **La brecha del 403 de `checkOrigin`** (2a, c-seguridad obs. 4 de 2b): se cierra aquí. Los dos `it.fails` "[T-024]" pasan a `it`.
- **`/registro` responde la 404 dinámica** (d-validacion 2b, desviación 3): sigue así hasta 3b. Por eso `/registro` se queda como la única excepción de la Fase 3 en el guardián de enlaces.

## Fuera de este change

- **3b** (siguiente change): `/registro`, `/registro/gracias` y `/registro/verificar` con sus Actions y sus pruebas (unos 6 archivos más que importan `src/app/(publico)/registro`), la refactorización de `src/lib/verificacion/acciones.ts` y la forma de pintar `FormularioRegistro` (`design.md` §4).
- **Límite de 4.5 MB del cuerpo en las funciones de Vercel (preexistente en `main`).** Next acepta 6 MB y la spec promete "Esa foto pesa más de 5 MB. Sube una más ligera.", pero en Vercel una foto de 4.5 a 6 MB no llega a la función. La plataforma responde su propio 413, en inglés y sin las cuatro cabeceras. Esto pasa hoy en producción y la migración no lo cambia. Es candidato a ticket en `main` (comprimir en el cliente está prohibido por la spec, así que la salida es de producto, `design.md` §6).
- **`Origin: null` en producción responde 500 hoy** (Next lanza `Invalid Server Actions request.`). Con este change, Astro responde la página 403 en español. La corrección en `main`, si se quiere antes del corte, va por `/rapido`.
- **La letra "más argumentos de los que la acción declara"** de `directorio-publico` se reescribe en el corte (T-027), junto con los encabezados que dicen "Server Component(s)".
- **El runtime de islas `/_astro/client.*.js`** se sigue emitiendo sin que nadie lo cargue (b-dev de T-022). 3a no agrega islas.


## Decisiones del fundador (por delegación, 2026-10-02)

1. Texto del 403 aprobado: "No pudimos recibir tu envío" / "Vuelve a abrir la página e inténtalo otra vez." / "Ir al inicio".
2. Un POST sin `Origin` procede, como en Next (un navegador siempre lo manda en un POST entre sitios, así que no abre CSRF). Con `Origin` `null`, malformado o ajeno: 403 en español con las cuatro cabeceras.
3. La recarga completa del error del registro con JS (3b) NO se decide aquí: es un cambio de experiencia y se resuelve al especificar 3b. La 3a no depende de ello.
