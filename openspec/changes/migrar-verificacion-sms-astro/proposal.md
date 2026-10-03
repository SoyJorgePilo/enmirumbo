# Propuesta: migrar-verificacion-sms-astro

**Ticket:** `docs/tickets/T-024-astro-formularios-publicos.md` (P1, épica E9). Es el tercer y último change del ticket (3b-2). Los anteriores son `migrar-formularios-publicos-astro` (3a, PR #36, fusionado en `migracion-astro`) y `migrar-registro-astro` (3b-1, PR #37, en review).
**PRD:** v2 §10 (lo técnico se puede reemplazar si §2–§7 quedan intactos; las specs son el contrato), §6.3 y §6.6 v0.9 (la verificación por SMS no publica: el admin decide) y §8 (<2 s en 4G; anti-abuso sin captcha).
**Decisiones que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 3; `docs/decisiones/ADR-013-spike.md` (costos 1b, 1c y 3b); ADR-011 (verificación tras bandera, apagada por defecto).
**Contrato de la verificación:** los requirements de `agregar-verificacion-sms-tras-bandera` (T-016), todavía sin archivar y por eso fuera de `openspec/specs/`. Este change no los toca.
**Rama:** `feature/astro-verificacion-sms`, que sale de `feature/astro-registro` en `696210d`. **El PR va directo a `migracion-astro` después de mergear #37**, rebasado sobre esa rama y sin apilarse. Nada llega a `main` antes del corte (T-027).

## Por qué

T-024 no pasa a `hecho` hasta que `/registro/verificar` corra en Astro (ticket, Notas). Hoy esa ruta no existe en Astro: con la bandera encendida, el dueño ya registrado recibiría el SMS y vería una 404. Por eso la bandera no se puede encender en ningún entorno de `migracion-astro` (3b-1, proposal "Estado intermedio"; c-seguridad de 3b-1, observación 5). Los criterios del ticket aplican igual que en 3a y 3b-1: envío sin JS con el `Origin` correcto, sin 500 y sin reenvío al recargar; Actions que solo delegan en `src/lib/`; y el requirement rey de T-016: con la capacidad apagada, la ruta no existe para nadie.

## Qué cambia

- **`/registro/verificar` en Astro** (`src/pages/registro/verificar.astro`, dinámica, dentro de `TroncoPublico` y medida como hoy). Pinta "Confirma tu número" con los literales de T-016, con los últimos cuatro dígitos sacados de la cookie de paso firmada y los errores leídos de `?error=` / `?errorReenvio=` (primer valor, lista cerrada).
- **Actions `confirmar` y `reenviar`** en `src/actions/index.ts`, con `accept: 'form'` y atadas a `/registro/verificar` en la tabla de `src/astro/acciones.ts`. Delegan sin lógica nueva en `dependenciasDeVerificacion`, `ejecutarConfirmacion` y `ejecutarReenvio`, que 3b-1 ya dejó sin `next/*` y devolviendo `DestinoVerificacion`. El pegamento va en `src/astro/verificar.ts`.
- **Todo detrás de la bandera (`design.md` §2).** Con la capacidad apagada, que es como se mergea, `/registro/verificar` responde la 404 de no encontrado (`NoEncontradoDinamico`) en `GET`, `HEAD` y `POST`, con o sin `?_action=`. No sale JS, no se lee la cookie, no se lee el cuerpo, no se toca la base y no se pide nada al proveedor. Se descarta `new Response(null, { status: 404 })` porque 3a midió que deja una 404 vacía. La compuerta vive en la tabla de Actions, antes de ejecutar el manejador, y en la página, antes de leer la cookie.
- **Sin enumeración (`design.md` §2.3).** Para cada forma de petición, la respuesta es idéntica en todos estos casos: bandera apagada, cookie ausente, alterada, firmada con otro secreto, caducada, malformada o de una ficha borrada, y cuerpo que Astro no pudo leer. Ninguno consume intentos ni reenvíos, ninguno pide nada al proveedor y ninguno pone cookies.
- **La pantalla es un formulario nativo puro, sin isla y sin módulo de cliente (`design.md` §1).** Errores por PRG (`303` a `?error=`), igual que Next. Se descarta "repintar desde la Action": cambiaría la URL a `?_action=confirmar` y recargar volvería a mandar el código, gastando un intento o un SMS. T-016 prohíbe además cualquier JavaScript en esta pantalla.
- **Cookie de paso en Astro (`design.md` §4).** El adaptador de `AlmacenCookies` sobre `Astro.cookies` conserva los mismos atributos al leer, al conservarla y al borrarla (`Max-Age=0`). El borrado sobrevive al 303.
- **Topes y atomicidad sin cambios (`design.md` §6).** Se conservan los 5 intentos, los 2 reenvíos, la espera de 60 s, el cupo de 3 códigos por IP y hora con contador propio, y el tope diario por proceso con una sola alerta. Se prueban sobre la build con PostgreSQL, ráfagas incluidas, y también la reutilización de una cookie vieja (hallazgo [C-2] de T-016).
- **La marca en el panel (`design.md` §9).** Confirmar desde Astro escribe solo `numeroVerificadoEn`. La cola y el detalle del panel, que siguen en Next hasta la Fase 5, la muestran igual, y la ficha sigue en `en_revision`. La verificación no sustituye la aprobación humana.
- **El `GET` de la mejora progresiva de `/registro` no tiene efectos (`design.md` §10).** Con la bandera encendida, el módulo sigue el 303 y pide `/registro/verificar` antes de navegar. Ese `GET` no consume nada, no manda SMS y no pone cookies.
- **Twilio falso.** Se reutiliza `tests/fixtures/twilio-falso.mjs` en las dos versiones, Next y Astro, y su guion de comprobación gana `error` y `tarda`.
- **`FormularioVerificarCodigo`:** el tipo de sus dos `action` se amplía a `string | función`, y `method="post"` se pone solo cuando es URL. Es el mismo cambio que hizo 3a en `FormularioReporte`. El HTML de Next no cambia.
- **Sin tocar `src/lib/` ni `src/app/`: cero líneas (`design.md` §11).**
- **Pruebas primero:** fixtures de Next de `main` con el Twilio falso, con la bandera apagada y encendida; diff de HTML en los dos estados; y envíos reales sin JS contra la salida construida.
- **Ningún texto de UI cambia.**

## Capacidades afectadas

- **`plataforma-astro`**
  - **ADDED:**
    - con la bandera apagada, la ruta no existe;
    - paridad de la pantalla encendida;
    - sin credencial válida no se dice nada;
    - desenlaces de `confirmar` y `reenviar`;
    - topes y atomicidad sobre la build;
    - la marca del panel;
    - el `GET` sin efectos del módulo de `/registro`;
    - dureza y límites de 3b-2.
  - **MODIFIED** (requirement de 3a y 3b-1, sin archivar): "Cada Action corre solo por envío de formulario y solo desde su ruta". La tabla suma `confirmar` y `reenviar`, y una entrada puede tener compuerta.
- **Sin MODIFIED en `registro-negocio`, `revision-admin`, `modelo-datos`, `despliegue`, `layout-base`, `directorio-publico` ni `paginas-legales`.** Los requirements de T-016 se cumplen tal como están escritos. La letra "la misma respuesta de no encontrado que cualquier dirección inventada" se cumple en estado y cuerpo, pero no en una cabecera de caché (ver duda 2 y `design.md` §2.2).

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/astro/verificar.ts`: pegamento de las dos Actions, adaptador de cookies, lista cerrada de destinos y cargador de la pantalla;
  - `src/pages/registro/verificar.astro`;
  - `tests/fixtures/next-3b2/`;
  - las pruebas nuevas.
- **Modificado:**
  - `src/actions/index.ts`: `confirmar` y `reenviar`;
  - `src/astro/acciones.ts`: dos entradas, compuerta por entrada, `trasFallar` y validación de destinos;
  - `src/components/registro/formulario-verificar-codigo.tsx`: solo el tipo de `action` y el `method`;
  - `tests/fixtures/twilio-falso.mjs`: guion de comprobación;
  - `scripts/diff-html.mjs`: rutas de 3b-2, sin normalizaciones nuevas;
  - las pruebas y guardianes que importan `src/app/(publico)/registro/verificar/` o usan `/registro/verificar` como ruta inexistente;
  - `docs/despliegue.md` y T-024: la línea del estado intermedio de la bandera.
- **Sin tocar:**
  - `src/lib/`, `src/app/`, `src/middleware.ts`;
  - `astro.config.mjs`, `vercel.json`, `next.config.ts`;
  - `prisma/`, `openspec/specs/`, `spikes/`.
- **Qué quita del Next la 3b-2, solo en T-027:** `src/app/(publico)/registro/verificar/` (`page.tsx`, `accion-confirmar.ts`, `accion-reenviar.ts`). `formulario-verificar-codigo.tsx` se queda: es React puro, Astro lo pinta en el servidor y no tiene hooks.

## Fuera de este change

- **La migración del panel** (cola y detalle con la marca de verificación) es de la Fase 5. Aquí solo se comprueba que la fila que deja Astro es la que el panel ya sabe pintar.
- **Foco en el campo del código tras un error.** Ni Next con JS ni Next sin JS lo ponen hoy. Agregar `autofocus` es una mejora de producto y va en otro change.
- **Doble toque en "Confirmar mi número" sin JS:** el navegador manda dos POST y, si el código está mal, se gastan dos intentos. Es igual que hoy en Next, con y sin JS. Evitarlo pide JS, y T-016 lo prohíbe en esta pantalla.
- **El cupo de códigos por IP y el tope diario viven en memoria por instancia**, igual que en Next (`docs/despliegue.md`, advertencia de costo). Se cierran con E0-3.
- **La comprobación de intentos no es atómica frente a una ráfaga** (`limites.ts`: "uno o dos intentos de más contra 10⁶"). Es preexistente y deliberado. La migración no lo cambia.
- **Llaves del cupo por IP con la misma IP escrita distinto** (`::ffff:v4`, IPv6 no canónica): candidato a ticket desde d-validacion de 3b-1. También aplica al cupo de códigos.
- **V1 de 3b-1** (el módulo de `/registro` cede al envío nativo tras 60 s): es de 3b-1 y se decide antes de su merge.

## Dudas para el humano

1. **Preview con la bandera encendida.** La tarea 17 pide recorrer el flujo real en el preview del PR, sin JS en Chrome y Firefox: un SMS real a un número propio del fundador, con las credenciales reales de Twilio solo en ese preview (unos $0.05 USD por SMS). ¿Se autoriza encenderla en el preview de **esta rama** antes del merge, o el preview se hace solo con la bandera apagada y lo encendido queda probado solo con el Twilio falso?
2. **Cabecera de caché frente a `/a/b/c`.** Con la bandera apagada, `/registro/verificar` sale de la función con el `Cache-Control` del HTML dinámico. `/a/b/c` sale de la CDN sin esa cabecera. El estado, el cuerpo y las cuatro cabeceras de seguridad son idénticos, y la respuesta es la misma con la bandera encendida y sin cookie, así que no delata la bandera. Hoy Next ni siquiera iguala el cuerpo: responde su documento de error vacío. ¿Se acepta, como en 3a, con una nota de archivado que precise la letra de T-016 ("mismo estado y mismo documento; las cabeceras de caché pueden diferir")?
3. **Pantalla nativa pura, sin JS.** Con JS, Next hoy navega a `?error=` sin recargar el documento. Astro recarga un documento pequeño, sin JS propio, con la misma URL, los mismos mensajes, el mismo foco y las mismas vistas medidas (`design.md` §1). ¿Se acepta como "sin regresión", o se quiere un módulo de mejora? Agregarlo exigiría enmendar T-016, que prohíbe JavaScript en esta pantalla.


## Decisiones del fundador (por delegación, 2026-10-02)

1. **SMS real en el preview: NO autorizado por el orquestador.** Cuesta dinero y usa un número personal; la bandera encendida se prueba con el Twilio falso. Probarla con un SMS real es un paso opcional y humano del fundador (tarea de preview).
2. Aceptado: con la bandera apagada la 404 es idéntica a `/a/b/c` en estado, cuerpo y cuatro cabeceras; solo cambia `Cache-Control` (función vs. CDN), como en 3a. Se precisa la letra de T-016 al archivar.
3. Aceptado: pantalla nativa pura con PRG a `?error=` y sin JavaScript (T-016 prohíbe JS en esa pantalla); con JS Astro recarga el documento donde Next navegaba, sin regresión visible.
