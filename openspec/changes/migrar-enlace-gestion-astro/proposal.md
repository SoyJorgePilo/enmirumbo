# Propuesta: migrar-enlace-gestion-astro

**Ticket:** `docs/tickets/T-025-astro-enlace-gestion.md` (P1, épica E9), Fase 4 de ADR-013.
**PRD:** v2 §10 (lo técnico se puede reemplazar si §2–§7 quedan intactos; las specs consolidadas son el contrato), §6.4 (enlace de gestión), §8 (LFPDPPP, anti-abuso sin captcha, <2 s en 4G).
**Decisiones que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md` (Fase 4 y punto 4: "`Referrer-Policy: strict-origin` en gestión y admin" desde el middleware); `docs/decisiones/ADR-013-spike.md` (costos 1b, PRG sin `Referer`; 3b, componentes que reciben una Server Action).
**Base:** 3a (`migrar-formularios-publicos-astro`, en `migracion-astro`), 3b-1 (`migrar-registro-astro`, PR #37) y 3b-2 (`migrar-verificacion-sms-astro`, PR #38), los tres sin archivar. Este change da por hechos su middleware, la regla de origen, la tabla de Actions por ruta, el PRG con destinos cerrados, O1, la 404 dinámica, `FormularioRegistroNativo`, el módulo de mejora de `/registro`, el arnés, el diff y el Twilio falso.
**Rama:** `feature/astro-gestion`, que sale de `origin/feature/astro-verificacion-sms` en `a4d560e`. **El PR se abre como BORRADOR apilado sobre #38**, igual que #38 sobre #37; cuando #37 y #38 se mergeen, se rebasa y se re-apunta a `migracion-astro`. Nada llega a `main` antes del corte (T-027).

## Por qué

T-025 pide servir `/editar/[token]` y su Action desde Astro sin cambiar el comportamiento: los scenarios de gestión en verde, el token fuera del `Referer` y de la analítica, y `Referrer-Policy: strict-origin` en el grupo de gestión (criterios del ticket). Es la pantalla donde **la ruta es la credencial** de una ficha (spec `registro-negocio`, "Un token que no es exactamente el vigente no abre nada ni delata nada"; spec `layout-base`, "El panel del admin y el modo edición quedan fuera de la medición"). Por eso la migración no puede apoyarse en el layout `(gestion)` de Next, que hoy cierra dos de las cuatro fugas por construcción (medición y referente). En el desarrollo original el token se filtró cuatro veces (`Referer`, `pathname` a la analítica, rutas y log), `no-referrer` rompió el envío sin JS y queda un riesgo asumido en el log de acceso (`docs/despliegue.md` §8.1).

## Qué cambia

- **`/editar/[token]` en Astro** (`src/pages/editar/[token].astro`, dinámica). Resuelve el token por su huella con `obtenerFormularioDeEdicion` (sin cambios en `src/lib/`) y pinta "Edita tu ficha", su frase, el aviso "Ojo: ya tienes cambios esperando revisión. Si mandas otros, estos reemplazan a los anteriores." si hay pendiente, y el formulario del registro en modo edición, prellenado. Reutiliza `FormularioRegistroNativo` de 3b-1 con `modo="edicion"`, `AvisoPrivacidadVigente` y "Enviar cambios" (`design.md` §4).
- **`/editar/[token]/gracias` en Astro**, dinámica, sin base de datos y sin `<form>`, con "¡Gracias! Ya recibimos tus cambios. Los revisamos y en cuanto los aprobemos tu ficha se actualiza. Mientras tanto sigue publicada como está." y "Volver al inicio".
- **Un tronco de gestión, `src/layouts/TroncoGestion.astro`** (`design.md` §1 y §2). Es lo que era `src/app/(gestion)/layout.tsx`: el documento base **sin** medición, con su motivo escrito, y con `<meta name="referrer" content="strict-origin">` en el mismo lugar que Next.
- **`Referrer-Policy: strict-origin` como cabecera en toda respuesta de la función bajo `/editar/`** (200, 303, 404, 403 y 500), puesta por el middleware y no anulable por una página (`design.md` §1). Ninguna otra cabecera cambia y el resto del sitio sigue con la global (duda 1).
- **Action `editar`**, atada a `/editar/[token]` en la tabla de `src/astro/acciones.ts`, con `accept: 'form'`. Delega sin lógica nueva en `procesarEdicion` (honeypot, cupo propio por IP, token, validación del registro, duplicado contra otra ficha, una sola pendiente con reintento ante el índice único parcial). El token sale del segmento de la ruta, nunca del cuerpo (`design.md` §5).
- **Desenlaces iguales a Next:**
  - éxito o campo trampa: 303 a `/editar/<token>/gracias`, único destino, que solo se obedece si el segmento tiene forma de token;
  - error de validación, de duplicado, de cupo o de guardado: la misma página vuelve a pintarse en el 200 del POST, con los errores y lo capturado (sin PRG, como el registro);
  - token que no resuelve: la 404 de no encontrado, idéntica para un token inventado, alterado, regenerado, de una ficha no publicada o borrada.
- **Con JS (`design.md` §4):** el mismo módulo de mejora de 3b-1, generalizado con una configuración por página y sin pasar de 5 KB con gzip: errores en el sitio sin recargar, "Enviando...", ejemplo por categoría y navegación solo a su propia confirmación. En edición, el error general es "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento.".
- **Sin fugas del token (`design.md` §3):** no aparece en el HTML, ni en metadatos, `canonical`, `og:url` o JSON-LD, ni en el sitemap o `robots.txt`, ni en ninguna cabecera salvo el `Location` del 303 a su propia confirmación (igual que Next), ni en el log de la función. Las tres pantallas, incluida la 404, quedan fuera de la medición y llevan `noindex, nofollow` y `Cache-Control` sin caché compartida.
- **Pruebas primero:** fixtures de Next con token válido, inválido, regenerado y de ficha no publicada; envíos reales sin JS contra la salida construida; pruebas de no-fuga sobre la salida real; mutaciones.
- **Ningún texto de UI cambia.**

## Capacidades afectadas

- **`plataforma-astro`**
  - **ADDED:**
    - paridad de la pantalla de edición y de su confirmación;
    - la 404 indistinguible del enlace;
    - el envío de la edición sin JS;
    - la edición con JS sin isla;
    - el token no sale por ningún canal;
    - política de referente y medición del grupo de gestión;
    - la edición no toca la verificación por SMS;
    - dureza y límites de la Fase 4.
  - **MODIFIED** (requirements de 3a, 3b-1 y 3b-2, sin archivar):
    - "Cada Action corre solo por envío de formulario y solo desde su ruta": la tabla suma `editar`, y una entrada puede validar su destino contra la ruta pedida;
    - "Los formularios siguen el patrón POST → 303 → GET…": el error de la edición, igual que el del registro, vuelve a pintar sin PRG.
- **Sin MODIFIED en `registro-negocio`, `layout-base`, `despliegue`, `revision-admin`, `modelo-datos`, `directorio-publico` ni `paginas-legales`.** La letra de "Un token que no es exactamente el vigente…" ("la misma página 404… que cualquier URL que no existe… ni un encabezado") se cumple en estado y cuerpo; difieren de `/loquesea` la política de referente (a propósito) y el `Cache-Control` de la función, igual entre todos los motivos del enlace (duda 1).

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/pages/editar/[token].astro` y `src/pages/editar/[token]/gracias.astro`;
  - `src/layouts/TroncoGestion.astro`;
  - `src/astro/editar.ts` (pegamento de la Action, destino cerrado, cargador de la página);
  - `tests/fixtures/next-4/` y las pruebas nuevas.
- **Modificado:**
  - `src/actions/index.ts` (`editar`);
  - `src/astro/acciones.ts` (entrada `editar` y validación del destino por entrada);
  - `src/astro/cabeceras.ts` y `src/middleware.ts` (política de referente del grupo de gestión: el middleware solo pasa la ruta pedida);
  - `src/astro/metadatos.ts` (la etiqueta `referrer`);
  - `src/astro/registro-cliente.ts` (configuración por página; `/registro` sin cambios);
  - `scripts/diff-html.mjs`, el arnés, y las pruebas y guardianes que importan `src/app/(gestion)/`.
- **Sin tocar:** `src/lib/` (ninguno de `src/lib/gestion/*` importa `next/*`), `src/app/`, `src/components/`, `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/` y `spikes/`.
- **Qué se quita del Next, solo en T-027:** `src/app/(gestion)/` completo (`layout.tsx`, `editar/[token]/page.tsx`, `editar/[token]/accion.ts`, `editar/[token]/gracias/page.tsx`). `AvisoPrivacidadVigente` se queda (usa el `Link` de compatibilidad). `FormularioRegistro` y `BotonEnviar` (cliente) dejan de tener usuarios en ese momento.

## Fuera de este change

- **Volver a pedir el código por SMS al cambiar el WhatsApp desde el enlace** (punto de integración anotado por T-016 en su proposal). Hoy la marca se limpia al **aplicar** la edición en el panel (hallazgo [C-1], `aplicarEdicion`), y no se pide código. Es un cambio de producto: va en su propio ticket.
- **El token en el log de acceso de la plataforma** (`docs/despliegue.md` §8.1): sigue como riesgo asumido, con sus dos condiciones operativas (sin Log Drains y acceso limitado con 2FA). La migración no lo empeora ni lo cierra.
- **Un `/editar/<x>/y` que no casa con ninguna ruta** responde la 404 de la CDN con la política global, igual que hoy en Next.
- **`/editar/<cualquier cosa>/gracias` responde 200** sin validar el token, igual que hoy (no delata nada: es la misma pantalla para todos).
- **El cupo de ediciones vive en memoria por instancia** y la misma IP escrita distinto (`::ffff:v4`) cuenta aparte: preexistente, candidato a ticket desde 3b-1/3b-2.
- **Candidato 7 de 3b-2 ("el middleware no pisa cabeceras ya presentes")**: aquí se resuelve solo para la política de referente del grupo de gestión. Las otras tres cabeceras siguen con la regla actual.
- **El panel (aplicar o descartar la edición)** es de la Fase 5. Aquí solo se comprueba que la pendiente que deja Astro es la que el panel ya sabe aplicar.

## Dudas para el humano

1. **Cabecera de referente en todo `/editar/`.** Next pone `strict-origin` solo como `<meta>` en las pantallas del grupo y manda la cabecera global en todas sus respuestas (se confirma en la tarea 2). Se propone sumar la **cabecera** `Referrer-Policy: strict-origin` en toda respuesta de la función bajo `/editar/`: la 404 de un token inválido, el 303, el 403 y el 500 (ADR-013, punto 4). El motivo: la 404 de un token de una ficha **despublicada** (que vuelve a servir si se republica) tiene enlaces al sitio, y con la política global mandaría la ruta completa como referente a páginas medidas. El cuerpo de esa 404 sigue byte a byte igual al de `/loquesea`, pero difiere en esa cabecera (y en el `Cache-Control`), igual para todos los motivos del enlace. ¿Se acepta, con una nota al archivar que precise la letra de `registro-negocio` ("mismo estado y mismo documento")?
2. **Con JS, un envío que responde 404** (el enlace se regeneró entre abrir la pantalla y enviar). Se propone que el módulo recargue la misma dirección: el dueño ve "No encontramos esta página", como sin JS. La alternativa es la de `/registro`: mostrar el error general y conservar lo capturado. ¿Recarga (propuesta) o error general?
3. **El log del marco.** Si la tarea 6 mide que Astro o el adaptador escriben la ruta de la petición en el log de la función al fallar (500), ¿se acepta dentro del riesgo asumido de `despliegue.md` §8.1 (mismos lectores, mismo plazo) o se exige mitigarlo en este change aunque cueste tocar el manejo de errores?


## Decisiones del fundador (por delegación, 2026-10-02)

1. **`strict-origin` en todo `/editar/`, incluida la 404 de token inválido: aceptado.** El cuerpo de la 404 sigue byte a byte igual al de `/loquesea`; difieren la cabecera y el `Cache-Control`, igual para todos los motivos de token inválido. Nota al archivar para precisar la letra de `registro-negocio`.
2. **Con JS, un envío que responde 404:** el módulo recarga la misma dirección para que se vea la 404 igual que sin JS.
3. **El log del marco ante un 500:** se acepta SOLO si la tarea 6 lo mide, lo documenta y no es peor que el riesgo ya asumido en `docs/despliegue.md` §8.1 (token en el log de acceso de la plataforma). Si Astro o el adaptador escriben la URL completa (con el token) en una salida NUEVA del log de aplicación, se mitiga en este change redactando el token.
4. **Envíos simultáneos del mismo enlace: la letra se ajusta a lo que hace Next.** Con 2 simultáneos, ambos dan 303. Con 5 o más, queda exactamente UNA edición pendiente, ningún 500 ni detalle técnico, y cada respuesta es el 303 a la confirmación o el formulario con "No pudimos guardar tus cambios. Vuelve a intentarlo en un momento.". Razón: es una migración sin cambio de comportamiento, y se midió en Next de `main` y en Astro, igual en los dos, que con 5 o 10 simultáneos entre 2 y 4 reciben ese mensaje porque `guardarEdicion` reintenta una sola vez (`reports/b-dev.md`, desviación 1; `reports/c-seguridad.md`, M-1). Mejorar los reintentos es un ticket aparte para `main` (`src/lib/gestion/ediciones.ts`), fuera de este change.
