# Propuesta: migrar-panel-admin-base-astro

**Ticket:** `docs/tickets/T-026-astro-panel-admin.md` (P1, épica E9). Es el primero de los cuatro changes en que se parte la Fase 5 (5a). Los demás se proponen abajo, en "Partición de la fase", y no se especifican aquí.
**PRD:** v2 §10 (lo técnico se puede reemplazar si §2–§7 quedan intactos; las specs son el contrato), §6.3 (panel con contraseña única, ruta no indexada) y §8 (LFPDPPP, anti-abuso sin captcha, <2 s en 4G).
**Decisiones que ejecuta:** `docs/decisiones/ADR-013-migracion-astro.md` (Fase 5, clave técnica 4: un solo middleware con sesión del panel, `strict-origin` y exclusión de analítica); `docs/decisiones/ADR-013-spike.md` (punto 2, sesión por cookie: "sin costo apreciable"; costos 1a, 1b y 3b).
**Contrato:** `openspec/specs/revision-admin` (acceso, fail-safe, guarda, no indexación, cola, listado), `layout-base` ("El panel del admin y el modo edición quedan fuera de la medición") y `despliegue` ("Toda respuesta del sitio lleva las cabeceras de seguridad básicas", scenario "el panel conserva su política estricta").
**Rama:** `feature/astro-panel-admin`, que sale de `origin/feature/astro-verificacion-sms` (`a4d560e`, con 3a, 3b-1 y 3b-2; #37 y #38 sin mergear). **El PR va como borrador apilado** hasta que se mergeen #37 y #38; después se rebasa sobre `migracion-astro`. Nada llega a `main` antes del corte (T-027).

## Por qué

T-026 pide el panel en Astro con "sesión firmada y límite de acceso intactos; rutas de admin inaccesibles sin sesión" y la "exclusión de analítica en admin intacta". El panel es la superficie más sensible del sitio: es el único login, abre datos personales de registros no publicados y sus acciones publican, despublican y borran. Por eso la fase empieza por lo que todo lo demás necesita: la guarda de sesión, el acceso y el tronco del panel, con las dos pantallas de solo lectura que no dependen de nada más.

## Qué cambia

- **Guarda de sesión por construcción (`design.md` §1).** Hoy cada archivo de `src/app/admin/` llama a `requerirSesionAdmin()` y un guardián de texto lo vigila. En Astro, el middleware clasifica cada petición por el patrón de ruta que Astro va a pintar (`routePattern`), con una tabla cerrada de políticas: `/admin` es la pantalla de acceso, `/admin/[...resto]` es "no existe para nadie" y todo lo demás bajo `/admin` exige sesión. **Una ruta nueva que no esté en la tabla exige sesión** (falla cerrada) y además hace fallar una prueba que enumera las rutas reales de la build. Las páginas y Actions del panel vuelven a comprobar la sesión antes del primer acceso a datos (defensa en profundidad).
- **Sin sesión, la misma respuesta que hoy**, medida en Next (tarea 2): redirección a `/admin` sin parámetros en las pantallas y en las Actions; 404 en `/admin/<lo que no existe>`, con o sin sesión.
- **Acceso, entrar y salir (`design.md` §2 a §4).** `/admin` en Astro, con sus cuatro estados ("Panel de revisión", "Contraseña incorrecta.", "Demasiados intentos. Espera unos minutos y vuelve a intentar.", "Cerraste sesión.") y el fail-safe ("El panel no está disponible por ahora."). Las Actions `entrar` (en `/admin`) y `salir` (en `/admin/cola`) son formularios nativos sin JS con PRG a una lista cerrada de destinos. La cookie `nu_panel` conserva el formato, la firma HMAC, el secreto, los atributos (`HttpOnly`, `SameSite=Lax`, `Path=/admin`, `Max-Age=28800`, `Secure` en HTTPS) y la caducidad de 8 horas.
- **El límite de intentos conserva su atomicidad (`design.md` §3).** Sigue en la base (`IntentoDeCupo`, cerrojo consultivo por llave, el arreglo del hallazgo A4 de T-013) con el respaldo en memoria. El intento se aparta antes de comparar. La IP sale de `ipDeEncabezados`, nunca de `clientAddress`. Se prueba sobre la build con PostgreSQL, con ráfagas y con dos procesos contra la misma base.
- **Cabeceras, referente, caché y medición (`design.md` §5).** Toda respuesta bajo `/admin` que sale de la función lleva las cuatro cabeceras, `Referrer-Policy: strict-origin` (que el middleware no pisa) y `Cache-Control` con `no-store`. Las pantallas llevan además `<meta name="referrer" content="strict-origin">` y `noindex, nofollow` en un documento propio del panel (`DocumentoPanel`), que no mide. La 404 del comodín vive dentro del panel y hereda el `<meta>` y la exclusión de la medición, pero lleva solo `noindex`, como Next (decisión 4).
- **Cola y "Todos los negocios" en Astro**, de solo lectura, con los mismos componentes de React pintados en el servidor y el mismo HTML que Next.
- **`src/lib/` mínimo (`design.md` §2.3).** Dos módulos nuevos sin Next (`peticion.ts`, `entrar.ts`) y dos funciones de `guarda.ts` que delegan en ellos sin cambiar su firma. Los envoltorios de Next (`accion-acceso.ts` y `accion-salir.ts`) traducen el destino, como hizo 3b-1 con `verificacion/acciones.ts`.
- **`BotonSalir`:** el tipo de `action` se amplía a `string | función` y lleva `method="post"` solo cuando es URL. Es el mismo cambio que 3a hizo en `FormularioReporte`, y el HTML de Next no cambia.
- **Pruebas primero:** fixtures de Next con sesión firmada a mano y sin sesión, el diff de HTML extendido al panel y envíos reales sin JS contra la salida construida.
- **Ningún texto de UI cambia.**

## Estado intermedio de la rama (hasta 5b y 5d)

En la build de Astro, "Revisar", "Ver reportes" y "Ver detalle" llevan a `/admin/registros/<id>` y a `/admin/ediciones/<id>`, que todavía no existen en Astro. Las atrapa el comodín y responden la 404 del panel, con la política estricta. No es una regresión en producción, porque nada de `migracion-astro` llega a `main` antes de T-027. La rama no se despliega como sitio real hasta que la fase termine.

## Capacidades afectadas

- **`plataforma-astro`**
  - **ADDED:**
    - la guarda por construcción;
    - la pantalla de acceso;
    - entrar y salir sin JS;
    - el límite de intentos sobre la build;
    - cabeceras, referente, caché, no indexación y medición del panel;
    - la cola y el listado;
    - dureza y límites de 5a.
  - **MODIFIED** (requirement de 3a, 3b-1 y 3b-2, sin archivar): "Cada Action corre solo por envío de formulario y solo desde su ruta". La tabla suma `entrar` y `salir`, y la guarda del panel corre antes que la tabla.
- **`revision-admin` (MODIFIED, solo de letra):** "El panel se opera desde el celular y sin JavaScript de cliente innecesario" dice "Server Components" y `"use client"`, que son vocabulario de Next. La redacción pasa a ser neutral respecto al marco, como hizo 2a con `layout-base`. No cambia ningún comportamiento.
- **Sin MODIFIED en `layout-base`, `despliegue`, `modelo-datos`, `registro-negocio` ni `directorio-publico`.** `despliegue` ya permite una política de referente más estricta por pantalla y prohíbe que la global la anule.

## Impacto en código (alto nivel)

- **Nuevo:**
  - `src/astro/panel/guardia.ts`: tabla de políticas, clasificación y respuesta sin sesión;
  - `src/astro/panel/acceso.ts`: pegamento de `entrar` y `salir`, adaptador de cookies y destinos cerrados;
  - `src/layouts/DocumentoPanel.astro`;
  - `src/pages/admin/index.astro`, `src/pages/admin/cola.astro`, `src/pages/admin/negocios.astro` y `src/pages/admin/[...resto].astro`;
  - `src/lib/admin/peticion.ts` y `src/lib/admin/entrar.ts`;
  - `tests/fixtures/next-5a/` y las pruebas nuevas.
- **Modificado:**
  - `src/middleware.ts`: el paso de la guarda y la política de referente del panel;
  - `src/astro/acciones.ts`: dos entradas y sus destinos;
  - `src/actions/index.ts`: `entrar` y `salir`;
  - `src/astro/metadatos.ts`: soporte de `referrer`;
  - `src/astro/locals.d.ts`;
  - `src/lib/admin/guarda.ts`: dos cuerpos, con las mismas firmas;
  - `src/app/admin/accion-acceso.ts` y `accion-salir.ts`: envoltorios;
  - `src/components/admin/boton-salir.tsx`: tipo y `method`;
  - `scripts/diff-html.mjs` y `scripts/diff-html/`: rutas del panel, sin normalizaciones nuevas;
  - las pruebas y guardianes que hoy importan las piezas de 5a desde `src/app/admin/`.
- **Sin tocar:**
  - `src/lib/admin/{sesion,acceso,config,consultas,reportes,listado-parametros,textos}.ts`, `src/lib/cupos/`, `src/lib/registro/limite-ip.ts`, `src/lib/gestion/`, `src/lib/reportes/`, `src/lib/purga/`;
  - `astro.config.mjs`, `vercel.json`, `next.config.ts`, `prisma/`, `openspec/specs/`, `spikes/`.
- **Qué se retira de Next, solo en T-027:** ver `design.md` §8.

## Partición de la fase (propuesta, por riesgo y dependencia)

| Change | Alcance | Por qué en este orden |
|---|---|---|
| **5a · `migrar-panel-admin-base-astro`** (este) | Guarda por construcción, `DocumentoPanel`, cabeceras y referente, `/admin` (acceso y fail-safe), `entrar`, `salir`, `/admin/[...resto]`, `/admin/cola` y `/admin/negocios`. Son 7 archivos de `src/app/admin/` y 9 componentes (`boton-salir`, `tarjeta-cola`, `etiqueta-tipo-cola`, `indicador-atrasado`, `negocios-reportados`, `tarjeta-negocio-reportado`, `filtros-listado-negocios`, `paginacion-listado-negocios` y `renglon-listado-negocio`), ninguno con Server Action salvo `BotonSalir` | Es el mayor riesgo (el único login) y todo lo demás depende de él. Solo lectura fuera del acceso |
| **5b · `migrar-panel-admin-detalle-astro`** | `/admin/registros/[id]` (detalle con todos sus formularios pintados), **`/admin/foto/[clave]/[variante]`** (solo con sesión, incluye fichas no publicadas, 404 idéntica a la pública sin sesión, `no-store`), Actions `aprobar` y `rechazar`, y `aprobado`, `rechazado` y `ya-resuelto`. Adaptador del sobre de un solo uso (`src/lib/gestion/sobre.ts`): el enlace de gestión se muestra una sola vez al aprobar y solo se guarda su huella | La ruta de fotos va aquí y no al final: el detalle la pide (`detalle-registro.tsx:84`) y su diff no se puede cerrar sin ella. Es el flujo central del MVP (aprobar) |
| **5c · `migrar-panel-admin-acciones-ficha-astro`** | `despublicar` (+ `despublicado`), `marcar-reporte-atendido`, `regenerar-enlace` (pantalla, Action y `listo`, con el sobre de 5b) y el borrado ARCO (`borrar`, su Action y `borrado-hecho`). El borrado borra los archivos antes que la fila, y uno a medias se reporta como fallido, nunca como "borrado" | Son las acciones destructivas y dependen del detalle de 5b. `ReportesPendientesNegocio` usa `.bind(null, reporte.id)`, que en Astro pide decidir cómo viaja el id del reporte (5c lo decide) |
| **5d · `migrar-panel-admin-ediciones-astro`** | `/admin/ediciones/[id]` (comparación), `aplicar` y `descartar`, `aplicada` y `descartada` | Usa la ruta de fotos de 5b. Su recorrido completo (editar → cola → aplicar) depende de que T-025 (`/editar/<token>`) esté en Astro |

Cada uno deja menos excepciones en la lista de pruebas que siguen importando el panel de Next. El último la deja vacía.

## Fuera de este change

- **Deuda conocida del panel, sin cambios aquí:**
  - aprobar con una edición pendiente;
  - el recorte silencioso del motivo de rechazo (`admin-adversarial`, 500 caracteres sin aviso);
  - sin bitácora de acciones;
  - sin segundo factor en las acciones destructivas.
- **El límite de intentos cae al respaldo en memoria por instancia si la base no responde.** Es el diseño del arreglo A4 (más flojo, y lo dice el log). La migración no lo cambia.
- **Llaves del cupo por IP con la misma IP escrita distinto** (`::ffff:v4`, IPv6 no canónica): candidato a ticket desde 3b-1. También aplica al acceso del panel.
- **Candidatos abiertos de 3a, 3b-1 y 3b-2 que tocan el panel por herencia:**
  - el `Forbidden` sin cabeceras con `x-astro-locals`;
  - la regla general de que el middleware no pisa cabeceras;
  - el 413 de Vercel;
  - V2 de 3b-2 (una falla interna que se traga el log).
- **El título duplicado** ("… — EnMiRumbo — EnMiRumbo"), si Next lo sirve así en el panel: se conserva por paridad, como en las legales (2a), y va al mismo candidato.
- **Coordinación con la Fase 4 (T-025, otro worktree):** los dos changes tocan `src/middleware.ts`, `src/astro/acciones.ts` y el soporte de `referrer` en `src/astro/metadatos.ts`. Este change no asume nada del otro. El que se mergee segundo rebasa.

## Dudas para el humano

1. **`Referrer-Policy: strict-origin` como cabecera en todo `/admin`.** Hoy Next manda la cabecera global (`strict-origin-when-cross-origin`) y el panel la endurece con un `<meta>`. La propuesta conserva el `<meta>` (paridad de HTML) y además pone la cabecera estricta en toda respuesta bajo `/admin`. Así quedan cubiertas también las respuestas sin documento del panel (307, 303, 403 y la 404 de una Action pedida desde otra ruta), por construcción y sin lista. Es la única diferencia de cabeceras contra Next fuera de las ya aceptadas, y `despliegue` la permite ("más estricta… la global NO DEBE anularla"). ¿Se acepta, o se prefiere paridad estricta, solo con el `<meta>`?
2. **Orden frente a T-025 y estado intermedio.** El ticket dice "Depende de: T-025", pero 5a no usa nada de la gestión, y 5d es el único que la necesita de verdad (para el recorrido completo de una edición). ¿Se autoriza implementar 5a apilado sobre 3b-2 sin esperar a la Fase 4, aceptando el rebase de los tres archivos compartidos y que "Revisar"/"Ver detalle" den la 404 del panel en la rama hasta 5b y 5d?
3. **"Salir" sin sesión.** Hoy `salirDelPanel` no exige sesión: con la sesión ya vencida, tocar "Salir" igual lleva a "Cerraste sesión.". La propuesta conserva eso como la única Action exenta de la guarda, además de `entrar` (`design.md` §1.2). La alternativa es guardarla también, y entonces sin sesión llevaría a `/admin` sin el mensaje. ¿Paridad (recomendada) o guarda total?


## Decisiones del fundador (por delegación, 2026-10-02)

1. **`Referrer-Policy: strict-origin` en todo `/admin` por middleware: aceptado** (que no pisa una más estricta), además del `<meta>`. Es más estricto que Next, que solo tiene el `<meta>`; cubre 307, 303 y 403. Nota al archivar.
2. **5a se implementa apilada sobre 3b-2, sin esperar a la Fase 4** (5a no usa nada de la gestión; solo 5d la necesita). Se rebasan los tres archivos compartidos (`src/middleware.ts`, `src/astro/acciones.ts`, `src/astro/metadatos.ts`). En la rama, "Revisar", "Ver reportes" y "Ver detalle" dan la 404 del panel hasta 5b y 5d; nada llega a `main` antes del corte.
3. **"Salir" sin sesión: paridad con Next** (con la sesión vencida igual muestra "Cerraste sesión.").

### Sobre lo medido en Next que difería de la letra (por delegación, 2026-10-03)

Criterio común: es una migración sin cambio de comportamiento, así que se sigue lo medido en Next.

4. **La 404 del comodín `/admin/[...resto]` lleva solo `noindex`**, igual que Next. La letra decía `noindex, nofollow`; agregar `nofollow` sería una diferencia nueva contra Next. Se corrige la letra de la spec y del design.
5. **El 307 sin sesión va sin cuerpo en Astro; Next lo manda con su documento de error.** Estado, `Location`, `Cache-Control` y cookies son iguales y ninguno de los dos cuerpos lleva datos. Es una segunda diferencia aceptada, que el design no declaraba: queda declarada en el requirement de la guarda y en `design.md` §1.3 y §7.
6. **Ninguna prueba importa `accion-acceso` ni `accion-salir`.** Queda lo que se hizo: la spec pide vacío el `grep` de imports, y los envoltorios se vigilan leyendo su código y con `typecheck`. Se concilia `design.md` §2.3, que pedía conservar sus pruebas.
7. **`?error=`, `?salida=`, `?estado=` y `?pagina=` se leen como Next: un valor repetido no vale.** El design decía "primer valor", y eso pintaba un mensaje que Next no pinta (`?error=intentos&error=x`). Se corrige la letra del design §4 y del requirement de la pantalla de acceso.

## Candidatos a ticket

- **`/<ruta>//` recibe un 301/308 de Astro antes del middleware, sin las cuatro cabeceras**, en todo el sitio. Preexistente; no expone datos ni abre un open redirect.
- **Límite de intentos con `[v6]:puerto` e IPv6 escrita de varias formas** (`src/lib/registro/limite-ip.ts`): la misma IP puede caer en llaves distintas. Preexistente e igual en Next.
- **"Salir" no revoca una cookie copiada:** la cookie sigue valiendo hasta su caducidad (8 h).
- **Candado entre procesos para la reconstrucción de `.vercel/output` en las pruebas**, para que dos archivos de pruebas no reconstruyan la salida a la vez.
