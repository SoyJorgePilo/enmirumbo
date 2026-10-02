# Propuesta: migrar-registro-astro

**Ticket:** `docs/tickets/T-024-astro-formularios-publicos.md` (P1, épica E9). Es el segundo change del ticket (3b-1). El primero fue `migrar-formularios-publicos-astro` (3a, PR #36, en review), y el tercero será `migrar-verificacion-sms-astro` (3b-2, ver "Partición").
**PRD:** v2 §10 (lo técnico se puede reemplazar si §2–§7 quedan intactos; las specs consolidadas son el contrato) y §2.7/§8 (<2 s en 4G, Lighthouse 100).
**Decisión que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md`, Fase 3. Costos del spike: `docs/decisiones/ADR-013-spike.md` (1c, sin almacén de sesión; 3b, componentes que reciben una Server Action como prop; 5, el runtime de islas de 191 KB).
**Base:** 3a ya fusionada en `migracion-astro` (`200b2a4`): regla de origen en el middleware, página 403, tabla de Actions por ruta, PRG con destinos fijos, tope de 6 MiB y reportar. Las Fases 1, 2a, 2b y 3a, y `agregar-verificacion-sms-tras-bandera` (T-016), siguen sin archivar.
**Rama:** `feature/astro-registro`, que sale de `origin/migracion-astro` en `200b2a4`. El PR va directo a `migracion-astro`, sin apilarse. Nada llega a `main` antes del corte (T-027).

## Por qué

T-024 pide pasar a Astro el registro (multipart con foto, cupos por IP y versión del aviso) sin cambiar el comportamiento. Su criterio es que los scenarios de `registro` y `foto` sigan en verde, incluidas las adversariales, y que el envío sin JS funcione con el `Origin` correcto, sin 500 y sin reenvío al recargar (T-024, criterios; ADR-013, Fase 3). Hoy `/registro` es la última pantalla pública que responde la 404 dinámica en Astro (d-validacion de 2b, desviación 3), y también la única que carga JavaScript propio: `FormularioRegistro` y `BotonEnviar` usan `useActionState`/`useFormStatus`, que en Astro no se pueden usar con una URL (ADR-013-spike, costo 3b). Además, d-validacion de 3a dejó para este change el hallazgo O1: con la base caída, un envío responde la 404 en vez de la 500.

## Partición (3b en dos changes)

| Change | Alcance | Por qué así |
|---|---|---|
| **3b-1 · este change** (`migrar-registro-astro`) | `/registro` (Action `registrar`, foto, cupos, honeypot, versión del aviso y constancia, reenvío tras rechazo, errores por campo con foco, y la rama de la bandera encendida: cookie de paso y 303 a `/registro/verificar`), `/registro/gracias` (con `?verificado=1` y `?agotado=1`), la forma de pintar el formulario con y sin JS, la variante sin hooks de `FormularioRegistro`/`BotonEnviar`, la refactorización completa de `src/lib/verificacion/acciones.ts`, el Twilio falso para pruebas sobre la build y O1 | La Action `registrar` importa `dependenciasDeVerificacion` de `acciones.ts`. Si ese archivo siguiera importando `next/headers`, el paquete de Astro arrastraría Next, así que la refactorización tiene que entrar completa aquí. El Twilio falso se necesita ya para probar la rama encendida del registro |
| **3b-2 · siguiente** (propuesto: `migrar-verificacion-sms-astro`) | `/registro/verificar` con las Actions `confirmar` y `reenviar` atadas a esa ruta: la 404 indistinguible con la bandera apagada, el flujo completo con la bandera encendida contra el Twilio falso, los topes y los límites | Es otra pantalla, con dos Actions más y su propio requisito rey (la bandera). Reutiliza todo lo de 3b-1 |

**Estado intermedio entre 3b-1 y 3b-2:** con la bandera apagada, que es como se mergea, no cambia nada, y `/registro/verificar` responde la 404 de la CDN, igual que cualquier ruta inexistente. Si alguien la encendiera en un preview de `migracion-astro` antes de 3b-2, el dueño quedaría registrado, recibiría el SMS y vería una 404. Por eso **la bandera no se enciende en ningún entorno de `migracion-astro` hasta 3b-2**. T-024 no pasa a `hecho` hasta mergear 3b-2.

## Qué cambia (3b-1)

- **Action `registrar`** en `src/actions/index.ts`, con `accept: 'form'`, atada a `/registro` en la tabla de `src/astro/acciones.ts`. Solo delega en `src/lib/`. El pegamento de `src/app/(publico)/registro/accion.ts` se copia tal cual a `src/astro/registro.ts`: la IP con `ipDeEncabezados`, `procesarRegistro`, `dependenciasDeVerificacion`, `pedirCodigoParaFicha` y `firmarPaso`.
- **Desenlaces, iguales a los de Next:**
  - éxito, o el campo trampa lleno: 303 a `/registro/gracias`;
  - éxito con la bandera encendida y el código pedido: cookie `nu_paso` y 303 a `/registro/verificar`;
  - error: **sin PRG**, la misma respuesta vuelve a pintar `/registro` con los errores por campo y los valores capturados, salvo la foto y la casilla de consentimiento. Es lo que hace hoy Next sin JS, y no hace falta almacén de sesión ni cookie de borrador (`design.md` §3).
- **Cómo se pinta el formulario (decisión clave, `design.md` §1): opción A2, mejora progresiva mínima, sin isla de React.**
  - **Sin JS:** `FormularioRegistro` se pinta en el servidor como formulario HTML nativo y postea a `/registro?_action=registrar`. Funciona igual que hoy, y además pone el foco en el primer campo con error (`autofocus`), cosa que hoy sin JS no pasa.
  - **Con JS:** un solo `<script>` propio, empaquetado en `/_astro/` y con tope de peso. Hace tres cosas: pone el ejemplo dinámico de "¿Qué ofreces?" y el "Enviando..." del botón, y además manda el formulario por `fetch` a su misma dirección. Así los errores se pintan en el sitio sin recargar, con los valores y el foco, y el éxito navega solo a los destinos fijos. Es la experiencia de hoy, sin el runtime de React.
  - **La opción B queda documentada como alternativa:** formulario nativo con recarga completa al error. Se descarta porque con JS es una regresión medible: suma una vista de `/registro` por cada error en la medición (sesga el embudo del PRD §10), recarga la página en 4G, pierde la posición y deja la URL con `?_action=`.
- **Componentes (`design.md` §2):** el cuerpo del formulario pasa a un componente sin hooks, que comparten el `FormularioRegistro` de cliente (el de Next, sin cambio de salida) y un `FormularioRegistroNativo` nuevo. El botón pasa a una vista sin hooks que comparten `BotonEnviar` y la variante nativa. La Fase 4 (`/editar/[token]`) reutiliza la variante nativa.
- **`src/lib/verificacion/acciones.ts` deja de importar `next/headers` y `next/navigation` (`design.md` §4):**
  - recibe las cabeceras y el almacén de cookies por parámetro;
  - devuelve un destino cerrado en vez de lanzar `redirect`/`notFound`;
  - la lógica no cambia;
  - los tres envoltorios de Next (`registro/accion.ts`, `verificar/accion-confirmar.ts` y `verificar/accion-reenviar.ts`) se ajustan para traducir ese destino. Es la única excepción a "no tocar `src/app/`", y existe para que Next siga compilando hasta T-027.
- **Páginas:**
  - `src/pages/registro.astro`, en `TroncoPublico` y medida;
  - `src/pages/registro/gracias.astro`, dinámica y sin base de datos, que lee `?verificado=1` y `?agotado=1` con la regla de hoy.
- **O1 (`design.md` §5):** en la pasada de la página de error, el middleware no ejecuta ni deja ejecutar ninguna Action, y sigue con `siguiente()`. Con la base caída, un envío a reportar o a registrar responde "Algo falló de nuestro lado" (500), con las cuatro cabeceras y sin escribir nada.
- **Tope del cuerpo:** un envío de más de 6 MiB (`CONTENT_TOO_LARGE`) vuelve a pintar el formulario con "Esa foto pesa más de 5 MB. Sube una más ligera.", sin escribir nada y sin 500. Cualquier otro `ActionError` (un cuerpo que no es formulario, una falla interna) vuelve con "No pudimos guardar tu registro. Vuelve a intentarlo en un momento.". Ninguno de los dos casos vuelve a leer la base.
- **Twilio falso (`design.md` §7):** un módulo de precarga solo para pruebas (`node --import`) que contesta las peticiones a `verify.twilio.com` dentro del proceso del emulador. Prueba la rama encendida sobre la build sin red, sin credenciales reales y sin tocar `src/lib/`.
- **Pruebas primero:**
  - fixtures de Next de `main` (pantallas y envíos sin JS);
  - el arnés de 3a ampliado a multipart con archivo;
  - una foto real, generada y con EXIF GPS, enviada contra la salida construida;
  - el diff de HTML con la bandera apagada y sin las variables del proveedor;
  - la mejora progresiva probada en un DOM de pruebas.
- **Ningún texto de UI cambia.**

## Capacidades afectadas

- **`plataforma-astro`**
  - **ADDED:**
    - paridad de la página de registro;
    - envío sin JS;
    - experiencia con JS sin isla;
    - foto en la función;
    - pantalla de gracias;
    - rama de la bandera encendida contra el Twilio falso;
    - O1 (una falla del servidor en un envío responde la 500);
    - dureza y límites de 3b-1.
  - **MODIFIED** (requirements de 3a, sin archivar):
    - "Cada Action corre solo por envío de formulario y solo desde su ruta": la tabla suma `registrar`;
    - "Los formularios siguen el patrón POST → 303 → GET…": el error del registro vuelve a pintar sin PRG, como en Next;
    - "El sitemap, los enlaces y las rutas reservadas resuelven en Astro": la lista de excepciones de la Fase 3 queda vacía.
- **`registro-negocio`**: dos enmiendas mínimas, que se aplican al archivar. Ninguna cambia lo que ve el dueño con JS:
  - "El registro funciona sin JavaScript de cliente": el JS propio permitido suma "mandar el formulario a su propia dirección para pintar los errores sin recargar". Hoy React hace eso mismo, pero la letra no lo nombraba.
  - "Ningún dato del formulario viaja a la medición": sin JS, la dirección de los errores puede llevar el parámetro técnico `_action=registrar`, que no trae ningún dato del dueño y no llega a la medición. Con JS sigue siendo `/registro` (duda 2).
- **Sin cambios en `directorio-publico`, `despliegue`, `layout-base`, `paginas-legales` ni `modelo-datos`.**
- **Verificación por SMS:** sus requirements viven en `agregar-verificacion-sms-tras-bandera` (sin archivar; no están en `openspec/specs/`). Aquí solo se cumplen los que toca el registro: el alta va antes del código, el SMS que no sale degrada a gracias, y con la bandera apagada no se pide nada al proveedor. La pantalla del código es de 3b-2.

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/astro/registro.ts`: el pegamento de la Action, lo que carga la página y el resultado cerrado;
  - `src/astro/registro-cliente.ts`: las decisiones puras de la mejora progresiva, probadas sin navegador;
  - `src/pages/registro.astro` (con su `<script>`) y `src/pages/registro/gracias.astro`;
  - `src/components/registro/cuerpo-formulario-registro.tsx`, `formulario-registro-nativo.tsx` y `boton-enviar-vista.tsx`;
  - `tests/fixtures/next-3b/` y `tests/fixtures/twilio-falso.mjs`;
  - las pruebas nuevas.
- **Modificado:**
  - `src/actions/index.ts`: `registrar`;
  - `src/astro/acciones.ts`: entrada `registrar`, el resultado `repintar` y O1;
  - `src/components/registro/formulario-registro.tsx` y `boton-enviar.tsx`: usan el cuerpo y la vista compartidos, con la misma salida;
  - `src/lib/verificacion/acciones.ts`: firmas sin Next;
  - los tres envoltorios de `src/app/(publico)/registro/`;
  - `scripts/diff-html.mjs`: rutas de 3b-1 y `NORMALIZACIONES_REGISTRO`;
  - el arnés de envío;
  - las pruebas y los guardianes que hoy importan el registro de `src/app/`.
- **Posible devDependency:** `happy-dom`, solo para la prueba del DOM de la mejora progresiva (`design.md` §1.4, duda 3).
- **Sin tocar:**
  - `src/lib/`, salvo `verificacion/acciones.ts`;
  - `src/app/`, salvo los tres envoltorios;
  - `next.config.ts`, `vercel.json`, `prisma/`, `openspec/specs/` y `spikes/`;
  - `astro.config.mjs`, salvo que el dev mida que `sharp` necesita declararse (`design.md` §6).

## Fuera de este change

- **3b-2** (`migrar-verificacion-sms-astro`): `/registro/verificar`, las Actions `confirmar` y `reenviar`, y la sustitución, para esa ruta, del mecanismo `new Response(null, { status: 404 })` de `migrar-formularios-publicos-astro/design.md` §7. 3a midió que con ese mecanismo sale una 404 vacía; hay que usar `NoEncontradoDinamico`, ver `design.md` §8.
- **El límite de 4.5 MB del cuerpo en Vercel** (preexistente en `main`, candidato a ticket desde 3a). Una foto de 4.5 a 6 MB no llega a la función, y Vercel responde su 413 en inglés y sin cabeceras. Aquí, con JS, la mejora progresiva muestra ese caso como "No pudimos guardar tu registro…", con los datos conservados. Hoy Next con JS muestra un error del marco. Sin JS se ve el 413 de la plataforma, igual que hoy. Para dar el mensaje de la foto hace falta una decisión de producto (en el cliente no se puede comprimir), así que no se arregla aquí.
- **M1 de c-seguridad de 3a** (`x-astro-locals` → `Forbidden` sin cabeceras): sigue como candidato a ticket.
- **El cupo por IP del registro no es atómico frente a una ráfaga:** entre `ipBloqueada` y `registrarAlta` hay una espera. Es preexistente e igual en Next, y la migración no lo cambia. Si se quiere cerrar como en reportes (sin ceder turno), va como ticket en `main`.
- **Recargar tras un error sin JS** vuelve a mandar el POST (el navegador pregunta). Es igual que hoy en Next.
- **"Borrador por cookie":** el registro no usa cookie de borrador. Los valores vuelven en la propia respuesta re-pintada, como en Next, y este change no agrega ninguna.
- **`src/lib/admin/guarda.ts` y `src/lib/tareas/secreto.ts`** todavía importan `next/*`. Les toca a las Fases 5 y 6.


## Decisiones del fundador (2026-10-02)

1. **A2 aprobada:** con JS, un módulo propio (≤5 KB gzip, sin isla de React) manda el formulario por `fetch` a su misma dirección y reemplaza el `<form>` con el error, en el sitio y sin recargar; sin JS, formulario nativo. Se aprueba la enmienda a "El registro funciona sin JavaScript de cliente" (el JS permitido incluye mandar el formulario a su propia dirección para pintar los errores sin recargar). La alternativa B queda documentada, no elegida.
2. **URL sin JS aceptada:** tras un error sin JS la URL queda `/registro?_action=registrar`; se aprueba la enmienda mínima a "Ningún dato del formulario viaja a la medición" (el parámetro no trae datos y sin JS la medición no corre). No se reescribe el POST en el middleware.
3. **`happy-dom` como devDependency** solo para la prueba del DOM del módulo (delegado): condicionado a `npm audit` sin avisos nuevos y sin scripts de instalación.
