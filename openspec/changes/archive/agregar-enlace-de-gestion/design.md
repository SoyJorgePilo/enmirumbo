# Diseño técnico: agregar-enlace-de-gestion

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular lo relativo a rutas dinámicas con `params` asíncronos, Server Actions, `redirect()`, `generateMetadata` y control de `referrer` en la metadata.

## 1. El mecanismo de la "revisión pendiente": tabla propia con el contenido completo

Es la decisión central del ticket. Lo que hay que lograr: que el negocio mande cambios, que esos cambios entren a la cola del admin, y que **la ficha pública no se entere hasta que el admin apruebe**. Tres formas de guardarlos:

### Opción A — Tabla `EdicionPendiente` con el contenido completo (snapshot de lo que se quiere publicar) · **elegida**

Una fila por edición, con **una columna por cada campo editable** (nombre, categoría, WhatsApp, colonia/colonia libre, qué ofrece, entregas, teléfono, dirección y pin, horario, página) más `negocioId`, `estado`, `creadaEn`, `resueltaEn` y `motivoDescarte`.

- La ficha pública no cambia ni una línea de consulta: `src/lib/directorio.ts` sigue leyendo `Negocio` con `estado: "publicado"`. **Ninguna edición pendiente puede filtrarse a lo público por accidente, porque no vive en la tabla que lo público lee.** Ese es el criterio decisivo del ticket ("ninguna edición pendiente se filtra a lo público").
- El panel lee columnas normales y tipadas: la comparación "publicado vs. propuesto" es campo contra campo, sin interpretar nada.
- Aplicar es una copia campo a campo con **lista blanca explícita**: lo que no esté en esa lista (estado, origen, giros, `publicadoEn`, `registradoEn`, `consintioAvisoEn`, la huella del enlace) no se puede tocar aunque alguien logre escribir basura en la fila de la edición.
- Contra, asumido: duplica columnas. Agregar un campo al formulario de registro obliga a agregarlo aquí. Se mitiga con un **test guardián** que compara la lista de campos editables con las columnas de `EdicionPendiente` y falla si se desincronizan (mismo patrón que el test que vigila el filtro de `publicado`).

### Opción B — Fila sombra en `Negocio` (un duplicado en estado `edicion_pendiente` que apunta al original)

Descartada, y no por elegancia:

- **Rompe la unicidad de `whatsapp`**, que es una constraint de base y una regla de producto ("una sola ficha por número"). Habría que aflojarla o inventar un valor falso: las dos salidas son peores que el problema.
- **Mete datos no publicables en la tabla que lee todo el sitio.** Cada consulta pública, cada conteo, cada filtro de colonias, el buscador y el seed tendrían que acordarse de excluir el estado nuevo, para siempre. El proyecto ya decidió lo contrario: concentrar el filtro de `publicado` en un solo módulo y probarlo (T-004). Una fila sombra convierte una propiedad verificable en una disciplina que hay que recordar en cada consulta nueva.
- La sombra tendría **otro `id`**, y el `id` es lo que resuelve la URL de la ficha: aplicar la edición obligaría a mover datos igual que en la opción A, pero además a decidir qué pasa con la fila sombra. Se gana nada.

### Opción C — Columna JSON con los cambios propuestos (diff o payload)

Descartada:

- **Es mass assignment guardado en disco.** Lo que llega del formulario se serializa entero y después se aplica con un `spread`; el día que alguien meta `estado` o `publicadoEn` en ese JSON, se aplica solo. La opción A obliga a nombrar cada campo dos veces (al guardar y al aplicar), que es exactamente la fricción que aquí protege.
- No hay CHECK, ni tipos, ni índices: la base deja de poder decir nada sobre el contenido y el panel tiene que confiar en un blob.
- Un **diff** además es ambiguo: si el admin normalizó la colonia después de que el negocio mandó los cambios, ¿contra qué original se aplica? Un snapshot completo no tiene esa duda —dice qué debe quedar publicado, no qué debe moverse—, y el panel muestra la diferencia calculándola en el momento de mirar.

### Cómo se garantiza "una sola pendiente por negocio"

Índice único parcial en la migración (`CREATE UNIQUE INDEX ... ON EdicionPendiente(negocioId) WHERE estado = 'pendiente'`, que SQLite soporta y Prisma acepta como SQL de migración). No es solo prolijidad: es lo que impide que dos envíos casi simultáneos dejen dos pendientes y el admin apruebe la vieja. El código, además, escribe la edición nueva y marca la anterior como reemplazada en la misma transacción.

## 2. Caso borde: el negocio edita mientras ya tiene una edición pendiente

La regla: **lo último que escribió el dueño es lo que vale**.

- Al abrir el enlace con una edición pendiente, el formulario se prellena con **la edición pendiente**, no con lo publicado (si no, el dueño tendría que volver a capturar lo que ya mandó), y arriba se le avisa que tiene cambios esperando.
- Al enviar, la pendiente anterior se cierra y la nueva ocupa su lugar, con su reloj reiniciado (mismo criterio que el reenvío tras rechazo de T-005: el indicador de 48 horas mide la espera real de lo que el admin tiene que revisar).
- Del lado del panel, aprobar y descartar son **escrituras condicionadas al identificador exacto de la edición que el admin tenía enfrente** (`updateMany` con `id` + `estado: 'pendiente'`). Si no afecta ninguna fila hay dos casos que el panel distingue con textos distintos: la edición ya se resolvió, o fue reemplazada por una más nueva. Leer y después escribir dejaría la ventana en la que el admin aplica cambios que el dueño ya sustituyó.

## 3. El token: entropía, huella, comparación y regeneración

- **Entropía:** 32 bytes de `crypto.randomBytes` (256 bits) en base64url ≈ 43 caracteres. Adivinarlo por fuerza bruta no es un escenario, y por eso **no se especifica un cupo por IP sobre la apertura del enlace**: sería teatro. Lo que sí se acota es el envío de ediciones (cupo propio por IP), que es donde un abuso tiene costo real.
- **Unicidad:** la columna de la huella es `@unique`. La generación reintenta ante colisión (que con 256 bits no va a pasar, pero un `catch` de la constraint es más barato que razonar sobre probabilidades).
- **Huella, no token:** la base guarda `SHA-256(token)`. Si alguien se lleva un respaldo de la base, no se lleva los enlaces de nadie. **Sin sal y sin KDF a propósito**: una sal y un `bcrypt` protegen secretos de baja entropía (contraseñas humanas) contra diccionarios; aquí el secreto son 256 bits aleatorios, no hay diccionario que lo alcance, y un KDF lento solo haría lenta cada apertura del enlace. Lo que se necesita es que la huella no sea invertible, y SHA-256 lo es.
- **Comparación segura:** el enlace se resuelve buscando **por la huella** (índice único), nunca comparando el token en claro contra filas. Sobre la fila encontrada, la confirmación final se hace con `crypto.timingSafeEqual` entre las dos huellas. Es cinturón y tirantes barato: cierra la comparación de igualdad de JavaScript, que corta en el primer byte distinto.
- **Regenerar invalida:** generar un token nuevo **sobrescribe** la huella. No hay lista de tokens revocados porque no hace falta: la huella vieja deja de existir y su enlace pasa a ser un 404 idéntico al de un token inventado.
- **Consecuencia asumida (duda 2 de la propuesta):** el panel no puede reenviar el enlace vigente, porque no lo conoce. El enlace en claro se muestra una sola vez, en el mensaje de WhatsApp que el panel arma justo después de generarlo. Perder ese momento significa regenerar.

## 4. El token va en la URL, así que hay que taparle las fugas

> **Enmendado en la etapa C (vuelta 2), con el visto bueno del orquestador.**
> Solo cambia la LETRA de los puntos 1 y 3 y se suma el 4: la intención —que la
> ruta con el token no salga del sitio— es la misma, y ninguna otra sección ni
> ningún scenario cambia. Los dos porqués están medidos, no razonados: ver
> `reports/c-seguridad.md` y `reports/b-dev.md` §I2.6.

Un secreto en la URL se escapa por **cuatro** sitios, y los cuatro se cierran:

1. **`Referer`:** cualquier enlace saliente de la página de edición mandaría la URL completa —con el token— al destino. La página declara **`referrer: strict-origin`** en la metadata **del layout de su grupo de rutas** (no en cada pantalla, para que las que se agreguen nazcan cubiertas) y no abre enlaces externos.
   **Por qué `strict-origin` y no `no-referrer`**, que era la letra original: lo que hay que ocultar es la RUTA, porque la ruta *es* el secreto, y `strict-origin` manda solo el origen pelado (`https://sitio/`), nunca `/editar/<token>` — el scenario "el token no se va en el `Referer`" se cumple igual. `no-referrer`, en cambio, hace que el navegador mande `Origin: null` en los POST de navegación, y Next aborta toda Server Action cuyo `Origin` no case con el host: **el envío de cambios respondía 500 sin JavaScript de cliente**, que es justo el camino que la spec tiene prometido ("la edición funciona sin JavaScript"). Es la misma tensión que el panel ya resolvió con el mismo valor (`src/app/admin/layout.tsx`). `same-origin`, `strict-origin-when-cross-origin` y `unsafe-url` no sirven: mandan la URL completa a destinos del mismo origen, que es exactamente por donde se fugaría.
2. **Buscadores:** `noindex, nofollow` en la página de edición y en su confirmación, y ninguna página del sitio enlaza a `/editar/...`.
3. **Logs:** el token no se escribe nunca en el log **de la aplicación**, ni completo ni truncado, ni en el camino feliz ni en los errores. Misma regla que ya rige para la contraseña del panel y para los datos capturados.
   **Lo que esta regla NO alcanza:** el log de acceso del runtime y de la plataforma registra la ruta de cada petición, así que `GET /editar/<token>` queda ahí. No hay forma de cerrarlo sin sacar el secreto del *path*, es decir sin cambiar este diseño. Es un **riesgo asumido**, documentado con sus dos condiciones operativas (ningún Log Drain; acceso al proyecto limitado al admin con 2FA) en `docs/despliegue.md` §8.1.
4. **La medición** (fuga que este diseño no vio y que encontró la etapa C): el tracker de la analítica manda el `pathname` de cada vista al recolector del proveedor, y `data-exclude-search` solo quita la cadena de consulta. Por eso las pantallas del modo edición viven en un **grupo de rutas propio, fuera del layout que monta el script** —el mismo mecanismo estructural con el que `/admin` quedó fuera de la medición—, y no en una lista de rutas que alguien tenga que recordar.

El formulario manda el token en el cuerpo del envío (no como parámetro de consulta del POST) por la misma razón.

## 5. El modo edición es el mismo formulario, no una copia

`FormularioRegistro` estrena props de modo: valores iniciales, texto del botón y presencia del bloque de consentimiento. La validación y la normalización se reutilizan tal cual desde `src/lib/registro/validacion.ts`, con dos diferencias declaradas:

- **No hay checkbox de consentimiento** en la edición y `consintioAvisoEn` no se toca ni al enviar ni al aplicar. El consentimiento se dio al registrarse, los datos ya son públicos y volver a pedirlo no aporta evidencia: lo que aportaría es una versión del aviso aceptada, que es el ticket T-012.
- **El WhatsApp se valida contra la unicidad dos veces**: al enviar (para que el dueño vea el error de inmediato) y al aplicar (porque entre una cosa y otra pudo publicarse otra ficha con ese número). La segunda es la que manda.

Que sea el mismo componente es un requisito del ticket ("mismo formulario, sin lógica aparte") y también la única forma de que los mensajes de error no se bifurquen en dos verdades.

## 6. Generar el token es parte de aprobar, no un paso aparte

La generación ocurre dentro de la misma transición de aprobación que ya existe (`aprobarRegistro`), condicionada a que el registro siga en `en_revision`. Así, un negocio publicado siempre tiene enlace y el admin no puede olvidarse de generarlo. Una aprobación repetida (doble clic, pestaña vieja) no genera un token nuevo: la escritura condicionada no afecta filas y el panel muestra "Este registro ya lo habías resuelto." — que además es lo correcto, porque un token nuevo invalidaría el que el admin ya mandó.

Aplicar una edición **no** regenera el token: el dueño sigue usando el mismo enlace para su siguiente cambio.

## 7. El WhatsApp del admin es configuración, no código

`WHATSAPP_ADMIN` con el mismo criterio fail-safe que el resto del panel: si falta o no se normaliza a 10 dígitos, el botón "Perdí mi enlace" **no se pinta** (no hay enlace roto, no hay número inventado) y el servidor lo avisa una sola vez por proceso en el log, como ya hacen `limite-ip.ts` y `admin/config.ts`. El número del admin es un dato personal en un repo público: nunca en el código, nunca en el seed, nunca en un test.
