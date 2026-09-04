# Diseño: renombrar-sitio-enmirumbo

Un rebrand parece un `sed` y no lo es: toca un texto legal versionado con un guardián criptográfico, y aterriza sobre un change en vuelo. Estas son las tres decisiones que no son obvias.

## 1. El aviso de privacidad estrena versión (`VERSION_AVISO` de `1` a `2`)

**Decisión:** subir la versión vigente a `2`, anclar su huella nueva y **no tocar** el renglón anclado de la `1`.

**Por qué.** El nombre del sitio aparece dentro del contenido versionado del aviso: el párrafo de entrada ("…cuando registras tu negocio en NecesitoUno Tizayuca…"), la sección "Quién es responsable de tus datos" y el aviso simplificado del formulario, que es una de las tres piezas que entran en la huella. Cambiar la marca cambia el texto y por lo tanto cambia la huella: la suite se pone en rojo sola. Hay dos salidas y solo una es honesta:

- **Re-anclar la huella de la `1`.** El propio guardián dejó una excepción escrita: una versión que todavía no salió a producción no ampara ninguna constancia, así que su huella se puede volver a anclar. Se descarta por tres razones: (a) la excepción está acotada, en la spec y en el comentario del guardián, a "mientras el change que la estrena no se mergea", y T-012 ya está en `main`; (b) desde el repo no se puede verificar si en la base de producción hay constancias con `consintioAvisoVersion = "1"` —y una constancia amparada por un texto que ya no existe es exactamente lo que T-012 se construyó para impedir—; (c) el ahorro sería de un literal y un renglón de tabla, que es el precio más barato que se ha pagado nunca por una prueba de consentimiento correcta.
- **Estrenar la `2`.** Cuesta dos líneas, deja intacta la evidencia de la `1` y hace que el sistema se comporte igual que se comportará el día que el aviso cambie de fondo. Es la que se toma.

**Qué arrastra estrenar versión, con la mecánica que ya existe (nada nuevo):**

- La página del aviso pasa a mostrar "Versión 2 · Última actualización: …" y el bloque de consentimiento, "Estás aceptando la versión 2 del aviso de privacidad." Los dos leen el mismo literal; no hay dos sitios que actualizar.
- Un formulario que quedó abierto con la `1` y se envía después del despliegue **no se guarda**: el dueño ve "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." Es el comportamiento ya especificado, y esto es lo que va a activarlo por primera vez de verdad.
- Las constancias existentes **no se migran**: siguen diciendo `1`, con su fecha. Si una ficha rechazada se reenvía, la reaceptación se anota hacia adelante con la `2` y el panel muestra "El reenvío aceptó la versión 2 del aviso". Ninguna de esas piezas se construye aquí: ya existen.
- **No se dispara el aviso previo por WhatsApp.** El propio aviso promete avisar antes de aplicar un cambio "importante —por ejemplo, si empezamos a usar tus datos para algo nuevo—". Un cambio de marca no altera qué datos se recogen, para qué se usan, con quién se comparten ni qué queda público: no hay nada que avisar por adelantado, y la versión nueva queda publicada en la misma página, que es justo lo que la sección "Cambios a este aviso" promete.

**El correo del directorio viaja en la misma versión.** El fundador pidió, en la misma revisión, publicar `contacto@enmirumbo.com` en lugar de los dos placeholders de correo. Eso también es un cambio del contenido versionado, y la tentación sería contarlo aparte. No: las dos ediciones se despliegan juntas, así que estrenan **una** versión. Dos versiones para un solo despliegue no describirían ningún estado real del texto y dejarían una `2` que nadie tuvo nunca enfrente — justo la clase de evidencia falsa que el guardián existe para impedir.

**Orden de operaciones al implementar:** primero todos los literales del aviso, del simplificado y de la casilla, y la sustitución de los correos; después subir `VERSION_AVISO`; al final correr la suite y anclar la huella que imprime el fallo. Anclarla antes es anclar un texto a medias.

## 2. La localidad es descriptor, no apellido de la marca

**Decisión (fundador, 2026-09-04):** existe "EnMiRumbo" y nada más. La forma compuesta "«marca» + Tizayuca" no se replica en ninguna superficie; donde el contexto geográfico aporta se escribe "EnMiRumbo, el directorio de negocios de Tizayuca" en la **primera** mención de esa superficie, y "EnMiRumbo" a secas después.

**Por qué importa registrarlo.** La sustitución obvia habría sido mecánica —"NecesitoUno Tizayuca" → "EnMiRumbo Tizayuca"— y habría reintroducido un patrón que el fundador ya había quitado del header. La regla cambia tres cosas que no son evidentes leyendo solo los literales:

- **El footer se queda sin la etiqueta geográfica que traía en la identificación.** El posicionamiento hiperlocal que la spec de `layout-base` exige ahí lo sostiene ahora la línea "Hecho para los vecinos de Tizayuca, Hidalgo.", que el fundador pidió conservar intacta. Por eso la enmienda del requirement dice explícitamente dónde vive el hiperlocal después del rebrand: `h1` de la home, esa línea del pie y la metadata SEO.
- **El título base pierde una repetición, no la geografía.** Pasa de "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" a "EnMiRumbo — Encuentra negocios y servicios en Tizayuca": "Tizayuca" sigue en el título, una vez, en el descriptor. El SEO local no depende de que la palabra aparezca dos veces.
- **Cada superficie tiene su propia "primera mención".** El aviso, los términos y el mensaje de verificación del panel llevan el descriptor; el mensaje del vecino no lleva ninguno (el negocio que lo recibe está en Tizayuca y ya lo sabe). Un mensaje corto que se lee en el celular no gana nada explicándole a alguien dónde vive.

El guardián anti-regresión del §4 vigila las dos cosas a la vez: la marca anterior y la forma compuesta. Es la única manera de que la regla sobreviva a los literales que otro change escriba dentro de seis semanas.

## 3. Sustitución literal, sin capa de marca configurable

**Decisión:** cambiar los literales donde están. No se introduce ninguna plantilla ni constante nueva de marca; solo se sigue usando `NOMBRE_DEL_SITIO` donde ya se usa (metadata SEO).

**Por qué.** La tentación es evidente: si de todas formas se tocan quince literales, ¿por qué no dejar la marca en una constante y que el próximo rebrand sea de una línea? Porque hay dos razones para no hacerlo aquí. La primera es de alcance: parametrizar marca y localidad es T-017, y hacerlo a medias ahora le deja un diseño impuesto. La segunda es del texto legal: el aviso y los términos son **contenido aprobado, literal**, con un guardián que hashea lo publicado; construir esos párrafos por interpolación de una constante de marca no rompe la huella, pero convierte un texto que hoy se lee de corrido en el archivo en un texto que hay que ensamblar mentalmente para revisarlo — justo lo contrario de lo que la revisión legal pendiente necesita. Cuando llegue T-017 tendrá que decidir eso con el aviso delante y su propia versión del aviso que estrenar.

## 4. Coordinación con T-014 (enlace de gestión, en desarrollo)

Los deltas de este change se escriben contra las specs **consolidadas de hoy**. T-014 mergea antes y va a sumar literales nuevos con el nombre del sitio dentro, en al menos estos lugares:

- **El mensaje de aviso de publicación** (`revision-admin`, requirement "Al aprobar se ofrece avisarle al negocio por WhatsApp con el link de su ficha"): hoy termina en "…compártela con tus clientes." y su spec dice explícitamente que el enlace de gestión **no** entra en ese mensaje. T-014 lo reescribe para incluirlo, con la instrucción del PRD §6.4. Ese requirement es uno de los que este change modifica: si al implementar el texto ya es otro, **manda el de T-014** y aquí solo se sustituye la marca dentro de él.
- **El mensaje de "Perdí mi enlace"** (ficha pública → WhatsApp del admin): literal nuevo que casi seguro se presenta con el nombre del sitio.
- **Los avisos de la edición** (aprobar o rechazar una edición pendiente), que siguen el molde de los cuatro mensajes actuales.
- **Las pantallas nuevas del panel y de la edición**, con sus títulos propios (`«Título» — EnMiRumbo`), que heredan la plantilla y no necesitan tocarse.

La red que hace innecesario adivinar cuáles son: el **guardián anti-regresión** del delta de `layout-base`. Falla si el nombre viejo aparece en cualquier superficie servida del sitio, así que el barrido posterior al merge de T-014 no depende de que alguien se acuerde de mirar. La primera tarea de `tasks.md` es rebasar `main` con T-014 ya dentro y volver a correr el censo.

**Ámbito del guardián.** Revisa el código de las superficies del sitio (`src/`) y los textos que de ahí salen, no el repositorio entero: los devlogs, los ADRs y los changes archivados nombran a "NecesitoUno" a propósito y así se quedan. Un guardián que no distinga eso obligaría a reescribir la historia para pasar el CI, que es peor enfermedad que la que cura.
