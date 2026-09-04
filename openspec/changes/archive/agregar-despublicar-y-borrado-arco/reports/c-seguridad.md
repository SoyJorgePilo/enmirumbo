# Reporte SEGURIDAD-TEST — agregar-despublicar-y-borrado-arco

Etapa C sobre lo que dejaron `a-ui.md` y `b-dev.md`. Auditoría del diff completo
(`git status` + `git diff`, incluidos los 13 archivos sin seguimiento) contra la
spec de las 4 capacidades, más pruebas adversariales de lo que el camino feliz
no cubre. **No toqué código de producción: solo agregué un archivo de pruebas y
este reporte.**

Esta es la acción más destructiva del sitio (borrado irreversible de datos de
terceros), así que además de las pruebas unitarias levanté el servidor real
(`next dev -p 3400`, base aparte y desechable, cookie de sesión firmada a mano)
para verificar por HTTP lo que un arnés de vitest no puede: el envío de los
formularios **sin JavaScript**, el rechazo de CSRF y el 404 indistinguible.

**Estado: cerrado tras la iteración 2 del dev.** Todo lo que sigue documenta la
auditoría de la iteración 1; cada hallazgo lleva al final un bloque
**"Iteración 2"** con lo que verifiqué contra el código corregido. El resumen de
esa verificación está en la sección [Iteración 2 — reverificación](#iteración-2--reverificación).

Gates al cierre (sobre el código de la iteración 2): `npm run lint` limpio ·
`npm test` **1163 pruebas, 40 archivos** · `npm run build` correcto.
(Iteración 1: 1143 en 40; baseline del dev antes de esta etapa: 1098 en 39.)

## Veredicto

**Pasa al validador.** Al cierre de la iteración 2 no queda ningún hallazgo
crítico, alto ni medio abierto: los 2 medios y los 3 bajos accionables están
**corregidos y reverificados**; el bajo restante es deuda de backlog declarada, y
se le suma una segunda deuda que esta etapa levanta con nombre propio.

| Severidad | Iteración 1 | Abiertos al cierre |
| --- | --- | --- |
| Crítico | 0 | 0 |
| Alto | 0 | 0 |
| Medio | 2 | **0** (2 corregidos) |
| Bajo | 4 | **0 accionables** (3 corregidos · 1 deuda declarada + 1 deuda nueva) |

## Hallazgos

### MEDIO 1 — Un borrado concurrente a mitad de una aprobación revienta la Server Action (500)

**Dónde:** `src/lib/admin/transiciones.ts:190-193` (la segunda escritura de
`aprobarRegistro`, `prisma.negocio.update({ where: { id }, data: { giros: { set: … } } })`).

`aprobarRegistro` escribe **dos veces**: primero el `updateMany` condicionado
(línea 176, que sí resiste carreras) y en seguida un `update` sin condición para
fijar los giros, porque una relación no cabe en el `updateMany`. Hasta este
change ninguna fila podía desaparecer, así que esa segunda escritura siempre
encontraba su registro. `borrarNegocio` estrena esa posibilidad.

**Escenario concreto:** el admin abre el detalle de un registro en dos pestañas
(o atiende una solicitud ARCO mientras estaba a media aprobación). En la pestaña
A toca "Aprobar y publicar"; el `updateMany` pasa. En la pestaña B confirma el
borrado. Cuando la pestaña A llega a su `update`, la fila ya no existe: Prisma
lanza `PrismaClientKnownRequestError` (P2025) y, dentro de una Server Action, eso
es un **HTTP 500** — justo lo que `borrarNegocio` evita a propósito usando
`deleteMany` en lugar de `delete` (design.md §5). **Reproducido**: con un cliente
que borra entre las dos escrituras, `aprobarRegistro` lanza
`PrismaClientKnownRequestError :: Invalid prisma.negocio.update() invocation`.

**Impacto:** disponibilidad y confianza del panel, no fuga ni corrupción de
datos. La fila borrada **no resucita** (lo verifiqué y lo dejé fijado como
invariante en `… › "un borrado en medio de una aprobación no resucita la fila"`).

**Sugerencia (del dev):** o el `update` de giros pasa a ser tolerante
(`updateMany` no sirve para relaciones; sí sirve un `try/catch` que devuelva
`no-encontrado`), o las dos escrituras van dentro de una transacción. El test que
agregué tolera las dos formas: pasa hoy y seguirá pasando cuando se arregle.

> **Iteración 2 — CORREGIDO y reverificado.** `src/lib/admin/transiciones.ts:222-229`:
> la segunda escritura va en un `try/catch` que compara **estrictamente**
> `error.code === "P2025"` (constante `CODIGO_PRISMA_REGISTRO_INEXISTENTE`,
> línea 115) y devuelve `no-encontrado`; **cualquier otro error se relanza**.
> Acepto el descarte de la transacción: el argumento es correcto —`$transaction`
> no existe en el tipo estructural `ClienteTransiciones`, que es lo que permite
> probar este módulo sin Prisma real—, y el `catch` resuelve el caso completo.
> Verificado: mi test de la carrera ya no lleva `.catch()` y afirma
> `{ resultado: "no-encontrado" }`; agregué **5 casos nuevos** de fallos que *se
> parecen* a P2025 y deben propagarse igual (sin `code`, `"P2025 "` con espacio,
> `"p2025"` en minúsculas, el código solo en el mensaje, y un valor lanzado que
> ni siquiera es un `Error`), para que nadie pueda aflojar la comparación a un
> `includes` sin que la suite lo cace.
> *Residuo aceptado:* si algún día el `set` de giros recibiera un id de catálogo
> inexistente, Prisma también responde P2025 y el admin vería "no encontrado" en
> vez de un 500. No es alcanzable hoy (los giros se validan contra el catálogo
> antes) y el desenlace sigue siendo el benigno.

### MEDIO 2 — La lista de pendientes legales pierde también los derechos ARCO que el panel sigue SIN poder atender

**Dónde:** `src/lib/legales/textos.ts:99-107` (el renglón retirado) y el
comentario ya obsoleto de `src/lib/legales/textos.ts:255-261`.

El renglón que se retiró decía, textualmente: *"Atender las solicitudes ARCO
(acceso, rectificación, cancelación y oposición), despublicar una ficha y borrar
un registro de forma definitiva."* Este change vuelve verdad **la despublicación
y la cancelación**, pero **no el acceso ni la rectificación**: el panel no tiene
ninguna pantalla para editar los datos de un negocio ni para entregarle una copia
(el enlace de gestión es T-014, sin mergear). Y el aviso publicado sí promete las
dos cosas:

- §"Cómo limitar el uso o la divulgación de tus datos": *"Dinos qué no quieres
  publicar: si prefieres que tu teléfono fijo, tu horario o tu dirección no
  aparezcan en la ficha, escríbenos y **los quitamos**."*
- §"Tus derechos ARCO": *"…derecho a acceder a tus datos, a **rectificarlos** si
  están mal…"*

**Escenario concreto:** la revisión legal o el checklist de lanzamiento corren la
verificación automática (que es justo lo que la spec de `paginas-legales` exige
que exista para no buscar a ojo), leen `PENDIENTES_OPERATIVOS_LEGALES` y
concluyen que lo único pendiente es la purga de rechazados. En realidad, una
solicitud de "quítenme el teléfono de la ficha" sigue resolviéndose editando
SQLite a mano: exactamente el tipo de deuda que esa lista existe para no
esconder. El comentario de la línea 255-261 lo empeora, porque sigue diciendo
"mientras E3-6 (flujo ARCO en el panel) … no exista" cuando E3-6 acaba de
existir a medias.

**Nota de proceso:** el delta de `paginas-legales` pide retirar el renglón, y el
dev lo hizo al pie de la letra; la justificación del scenario es *"porque
despublicar y borrar ya se hacen desde el panel"*, o sea que la spec dio por
hecho que el renglón solo hablaba de esas dos cosas. Retirarlo entero es más de
lo que la spec justifica.

**Sugerencia (del dev):** dejar un pendiente reducido (acceso, rectificación y
"quitar un campo de la ficha", con su ticket: T-014 o uno nuevo) en vez de borrar
la fila, y actualizar el comentario obsoleto. Si el equipo prefiere respetar la
spec al pie de la letra, que quede como decisión explícita del validador.

> **Iteración 2 — CORREGIDO y reverificado.** `src/lib/legales/textos.ts:101-116`:
> el renglón se **acotó** en vez de retirarse. Queda declarado el pendiente de
> **acceso y rectificación** ("entregarle al negocio una copia de sus datos y
> corregirlos, o quitar un campo de su ficha"), con un `hoy` que dice a la vez
> qué sigue a mano y qué sí quedó resuelto ("Despublicar y borrar ya son
> acciones del panel (T-015)"), bajo el ticket **E3-6** que el backlog ya tenía
> —no se inventó un id nuevo— y con la nota de que E8-2 lo resolvería del lado
> del negocio. El comentario obsoleto de la sección "Cómo limitar el uso o la
> divulgación de tus datos" (líneas 262-274) también quedó actualizado y ahora
> dice exactamente cuál de los tres renglones publicados ya es una acción del
> panel y cuál sigue siendo trabajo a mano. Verifiqué que el **texto publicado
> no cambió** (las suites de `legales-paginas` y `legales-adversarial` siguen
> verdes sin tocarse) y que el pendiente de la purga (E0-3) sigue intacto.

### BAJO 1 — La pantalla "Ya la despublicaste." se puede abrir sobre un alta que nunca estuvo publicada

**Dónde:** `src/app/admin/registros/[id]/despublicado/page.tsx:44-46`.

La guarda es `if (registro.estado !== ESTADO_NEGOCIO_DEFAULT) redirect(...)`: solo
mira el estado, no que exista rastro de despublicación. Un registro `en_revision`
recién llegado por el formulario público lo satisface.

**Escenario concreto:** el admin (o cualquiera con la sesión del panel) escribe
`/admin/registros/<id-de-un-alta-nueva>/despublicado` y ve "Ya la despublicaste."
con el botón "Avisarle por WhatsApp" cargado con *"Bajamos del directorio la
ficha de «Yoga Ficticia Luna»: . Si quieres que la volvamos a publicar…"* — con
el motivo vacío y los dos puntos colgando. Un toque y ese mensaje falso sale
hacia un negocio que nunca se publicó. No hay fuga de datos ajenos ni escritura,
pero es un mensaje incorrecto a un tercero, que es lo que este panel existe para
evitar.

**Sugerencia:** exigir también `registro.despublicadoEn !== null` en la guarda.
La etapa UI ya lo dejó anotado como endurecimiento posible (`a-ui.md`,
"Decisiones de UI sin respaldo explícito", punto 4).

> **Iteración 2 — CORREGIDO y reverificado.**
> `src/app/admin/registros/[id]/despublicado/page.tsx:51-57`: la guarda es ahora
> **triple** —`en_revision` **y** `despublicadoEn !== null` **y** motivo no
> vacío después de `trim()`—. La tercera condición es mejor que lo que yo
> sugerí: protege la precondición exacta del mensaje que se le manda al negocio
> (el daño del hallazgo era el WhatsApp a medias), no un proxy de ella, y
> descarta además la fila inconsistente que alguien deje tocando la base a mano.
> Como `despublicarFicha` escribe fecha y motivo juntos —y rechaza el motivo
> vacío—, ninguna despublicación real queda fuera. Verificado por HTTP contra el
> servidor real: la pantalla de una ficha que no está despublicada responde
> `307 → /admin/registros/<id>` sin filtrar nada, y una despublicación real sin
> JavaScript sigue aterrizando en "Ya la despublicaste." con su botón de
> WhatsApp.

### BAJO 2 — El test que protege el borrado de la foto (T-008) se ancla a nombres de columna adivinados

**Dónde:** `tests/modelo-despublicacion.test.ts:300`
(`const guardaArchivosDeFoto = /\bfotoClave\b|\bfotoArchivo\b/.test(schema);`).

La rama que de verdad exige el arrastre del archivo solo se activa si la columna
de T-008 se llama exactamente `fotoClave` o `fotoArchivo`.

**Escenario concreto:** T-008 la nombra `fotoRuta`, `fotoBlobKey` o `fotoStorage`;
el test cae en la rama documental (que solo pide que `transiciones.ts` siga
mencionando "T-008", cosa que hará), se queda en verde, y el archivo con la
fotografía de un negocio sobrevive al borrado ARCO — el requirement es explícito:
*"un archivo que sobrevive al borrado es el dato personal que el aviso de
privacidad prometió eliminar"*. El aviso de la sección "Coordinación de merge"
de `b-dev.md` ("quien mergee T-008 verá el test rojo") no se cumpliría.

**Sugerencia:** anclar a cualquier columna nueva que empiece por `foto` y no sea
`fotoUrl` (`/\bfoto(?!Url\b)[A-Z]\w*/`), que es agnóstica al nombre exacto.

> **Iteración 2 — CORREGIDO y reverificado.**
> `tests/modelo-despublicacion.test.ts`: el disparador extrae del schema **todos
> los campos que empiezan por `foto`** y descarta `fotoUrl`; si aparece
> cualquiera, exige que `transiciones.ts` **nombre ese campo exacto**. Además
> agregó una prueba **del propio disparador** (`fotoClave`, `fotoRuta`,
> `fotoBlobKey`, `fotoStorage` lo activan; `fotoUrl` no), que es justo lo que
> impide que un regex que no encuentra nada se quede verde para siempre — el
> modo en que este hallazgo podía haber pasado desapercibido.
> *Residuo aceptado:* la heurística sigue siendo el prefijo `foto`, así que una
> columna llamada `imagenClave` no la activaría. Es inherente a cualquier
> ancla de este tipo y el punto de integración sigue documentado dentro de
> `borrarNegocio`. *Nota menor de higiene:* el regex está escrito dos veces (el
> test y su meta-test tienen cada uno su copia), así que el meta-test valida una
> copia, no el original; extraerlo a una constante compartida lo cerraría del
> todo. No lo cuento como hallazgo.

### BAJO 3 — El motivo se recorta a 500 caracteres en silencio, y así truncado viaja al WhatsApp del negocio

**Dónde:** `src/lib/admin/transiciones.ts:250` (`motivo.trim().slice(0, LIMITE_MOTIVO_DESPUBLICACION)`)
y `src/components/admin/formulario-despublicar.tsx:56-68` (el `<textarea>` no
declara `maxLength`, a diferencia de todos los campos del formulario público, que
sí lo traen).

**Escenario concreto:** el admin escribe una explicación larga; el servidor guarda
los primeros 500 caracteres sin avisar, y `mensajeAvisoDespublicacion` arma el
WhatsApp con lo guardado: al negocio le llega la frase cortada a media palabra,
seguida del punto y del "Si quieres que la volvamos a publicar…". La cota está
bien (el límite es correcto y el recorte evita una columna sin cota); lo que falta
es que se note. Es el mismo comportamiento que el motivo del rechazo (T-005), así
que puede tratarse como deuda compartida.

> **Iteración 2 — CORREGIDO y reverificado.** `despublicarFicha` devuelve ahora
> `{ resultado: "error", error: "longitud" }` en vez de recortar
> (`src/lib/admin/transiciones.ts:296-301`), **contando por puntos de código**
> (`[...motivoLimpio].length`), no por unidades UTF-16: la cota mide lo que se
> ve escrito y su borde no puede caer dentro de un par sustituto. El literal
> lleva la cota adentro (`errorMotivoDespublicarLargo(limite)`), el `<textarea>`
> estrena `maxLength`, y el detalle **valida el valor que llega por la URL**
> (`?errorDespublicar=inventado` ya no pinta ningún error).
> Verificado por HTTP sin JavaScript: un motivo de 501 puntos de código
> saltándose el `maxLength` responde `303 → ?errorDespublicar=longitud`, el
> detalle pinta el literal completo, un valor inventado no pinta nada, y nada se
> escribe en la base. Agregué un test propio de que esa ruta **no devuelve ni un
> fragmento del motivo en la URL**. El `maxLength` del navegador cuenta unidades
> UTF-16 y el servidor puntos de código, así que para texto con muchos emojis el
> navegador es *más* estricto que el servidor: es la dirección segura, el admin
> ve en el campo exactamente lo que se manda, y **el servidor sigue siendo la
> autoridad** (mi test de 401 emojis = 801 unidades UTF-16 se guarda entero).

### BAJO 4 — Cada acción destructiva es anónima: sin bitácora no hay forma de demostrar el plazo ARCO

Ya está declarado como fuera de alcance en `proposal.md` y en `b-dev.md` §2, y
no lo cuento como defecto del change. Lo reitero aquí para que el validador lo
mueva al backlog con nombre propio: hoy, de una solicitud ARCO atendida, no queda
absolutamente nada (la fila desapareció, el log solo tiene `cuid`s y la pantalla
final no dice de quién era). Ante la autoridad, el cumplimiento del plazo de 20
días hábiles que promete el aviso no es demostrable. Con un solo admin es un
riesgo aceptable; con dos, deja de serlo.

### BAJO 5 (nuevo en la iteración 2) — `rechazarRegistro` sigue recortando en silencio: deuda aceptada, con la razón corregida

**Dónde:** `src/lib/admin/transiciones.ts:243` (`motivo.trim().slice(0, LIMITE_MOTIVO_RECHAZO)`)
y `src/app/admin/registros/[id]/rechazado/page.tsx:47`, que arma el WhatsApp con
el motivo **ya guardado**, o sea el recortado.

Al arreglar el BAJO 3 el dev dejó `rechazarRegistro` como estaba, y **acepto la
decisión**: la capacidad del rechazo no tiene delta en este change, y cambiar su
comportamiento —además de reescribir un test vigente de T-005— sería justo el
tipo de trabajo sin ticket que el proceso prohíbe. Es la llamada correcta para
este gate.

**Corrijo una parte del razonamiento, para que el backlog no herede un error:**
el reporte del dev dice que el recorte "lo fija la spec de T-005". No es así.
Revisé `openspec/specs/revision-admin/spec.md:240-262` (requirement "Rechazar
exige motivo, lo guarda con su fecha y ofrece avisar por WhatsApp") y **no hay ni
un MUST ni un scenario sobre la cota ni sobre recortar**: lo único que fija ese
comportamiento es su test (`admin-transiciones` › "recorta un motivo desmedido en
vez de guardarlo entero", que efectivamente se pondría rojo si se cambiara). O
sea: cerrar esta deuda **no requiere cambiar ninguna spec**, solo un ticket de
corrección con su cambio de test. Que quede escrito así en el backlog.

**Por qué importa:** el defecto es exactamente el del BAJO 3 —una frase cortada a
media palabra que le llega por WhatsApp a un tercero—, y a diferencia de aquel
**ya está en producción** desde T-005. Ahora, además, las dos acciones hermanas
del mismo panel se comportan distinto ante la misma entrada.

## Lo que verifiqué y salió limpio

### El envío sin JavaScript SÍ se pudo reproducir (salvedad de `b-dev.md`, tarea 18)

El dev no pudo disparar una Server Action con `curl` por la codificación de los
campos `$ACTION_*` de Next 16. **Se puede**: hay que copiar los tres campos
ocultos que Next renderiza para la mejora progresiva y mandar `Origin`. El
procedimiento, para que sea repetible:

1. `GET` de la pantalla con la cookie de sesión; del HTML se sacan
   `$ACTION_REF_1`, `$ACTION_1:0` (trae el id de la acción) y `$ACTION_1:1` (el
   argumento ligado con `.bind`, o sea el id del registro).
2. `POST` a la misma URL como `multipart/form-data` con esos tres campos, el
   campo del formulario y `-H "Origin: http://localhost:3400"`.

Resultados contra `next dev -p 3400` (base desechable, dos fichas ficticias):

| Prueba | Resultado |
| --- | --- |
| Despublicar sin JS, motivo con `<img …>` y `&` | `303 → /admin/registros/<id>/despublicado`, ficha en `en_revision` |
| La ficha sale del directorio **en la petición siguiente** | home, `/buscar` y ficha: 0 apariciones; ficha `404` |
| El `404` de la despublicada vs. el de un id inventado | mismo código y mismo contenido visible ("No encontramos esta página"); solo difiere la ruta que la propia petición pidió |
| Borrado sin JS con `"  bOrRaR  "` | `303 → /admin/borrado-hecho?resultado=borrado`, fila y 3 vínculos de giros borrados |
| Borrado sin JS con palabra incorrecta | `303 → …/borrar?errorBorrar=palabra`, fila intacta |
| Borrado **sin cookie**, con la palabra correcta | `303 → /admin`, fila intacta |
| **CSRF**: cookie válida + `Origin: https://evil.example` | rechazado por Next, sin efecto en la base |
| `GET` con `$ACTION_REF_1` y `confirmarBorrado=BORRAR` en la query | `200`, no borra nada (ningún GET muta) |
| Dos POST de borrado en paralelo | uno `resultado=borrado`, otro `resultado=ya-no-existe`, sin 500 |
| Pantalla de confirmación de un id ya borrado | `404` |
| Log del servidor tras todo lo anterior | solo rutas con `cuid`; ni nombre, ni WhatsApp, ni teléfono, ni dirección, ni motivo |

Lo que sigue necesitando ojos humanos (tarea 18): los tres anchos (390/768/1280),
el nombre larguísimo en la confirmación, las áreas táctiles ≥44px y el contraste
AA del bloque "⚠ Acción irreversible".

### Autorización y CSRF

- La palabra `BORRAR` y el id del registro **viajan en el mismo POST** (el id va
  ligado con `.bind`): no hay ventana entre el paso 1 y el paso 2, ni estado
  intermedio en el servidor que alguien pueda envenenar.
- `requerirSesionAdmin()` va antes del primer acceso a datos en las 4 pantallas y
  las 2 acciones nuevas (el invariante de `admin-adversarial` lo enumera solo, y
  el dev sumó las dos funciones a `ACCESOS_A_DATOS`). Probé además de "sin
  cookie": firma alterada, cookie firmada con otro secreto, cookie caducada,
  basura y el fail-safe de panel sin configurar. En los 9 casos: redirección a
  `/admin`, sin escribir ni borrar nada y **sin distinguir si el id existe**.
- Cookie `HttpOnly`, `SameSite=Lax`, `Path=/admin` y `Secure` en producción;
  ninguna transición es un GET. Con la verificación de origen de las Server
  Actions, el CSRF queda cubierto por dos vías independientes.
- Ninguna superficie pública importa `transiciones.ts` (test del dev), y el
  formulario público no puede tocar una ficha despublicada: su WhatsApp cuenta
  como ficha existente.

### La palabra de confirmación

`trim().toUpperCase() === "BORRAR"`. Ninguna cadena distinta de "borrar" se
convierte en `BORRAR` al pasar a mayúsculas, y lo comprobé con lo que de verdad
se parece en la pantalla de un celular: homoglifos cirílicos (`ВОRRАR`), ancho
completo (`ＢＯＲＲＡＲ`), negritas matemáticas, espacio de ancho cero, guion
suave intercalado, carácter nulo pegado, acento, punto final, la palabra dentro
de una frase, repetida, y `DELETE`. Ninguna borra. Sí borran —y debe ser así—
los espacios de sobra, incluidos el irrompible (U+00A0) y la marca de orden de
bytes (U+FEFF), porque `trim()` de JavaScript los cuenta como espacio y lo que
queda es la palabra exacta; lo dejé documentado en el test para que nadie lo lea
como un agujero.

### Cascada y residuo

Además del invariante de `PRAGMA foreign_key_list` del dev (bueno: es agnóstico a
tablas futuras **con clave foránea**), agregué un barrido que recorre **todas las
tablas y todas las columnas** de la base ya migrada buscando el id, el WhatsApp y
el motivo del negocio borrado. Ese barrido caza también la tabla futura que
guarde el id en una columna suelta, sin FK declarada — la forma silenciosa en que
un dato personal sobrevive a un borrado ARCO. Hoy: cero residuo. Verifiqué
también que el borrado no se lleva catálogos ni a los negocios vecinos.

### El reloj `max(registradoEn, despublicadoEn)`

No se puede fabricar antigüedad negativa ni romper el orden de la cola: con un
`despublicadoEn` en el futuro (reloj del servidor desfasado), el texto de espera
es "Hace menos de una hora" —nunca un número negativo—, el renglón no nace
atrasado, no entra en el conteo y se va al **final** de la cola, no arriba.
Probé también los dos bordes del `>`: `despublicadoEn === registradoEn` no marca
la etiqueta, y una despublicación anterior al registro (reenvío posterior) no
manda el reloj.

### Fugas

- Ninguna consulta pública selecciona `despublicadoEn` ni `motivoDespublicacion`
  (`src/lib/directorio.ts` proyecta campo por campo); el motivo hostil que metí
  no aparece en home, listado, filtro de colonia, buscador ni ficha.
- El motivo sale **siempre** de la fila guardada: el fallback `?motivoMock=` de
  la etapa UI está borrado y un `?motivo=` inyectado por URL se ignora (test del
  dev, verificado).
- La URL a la que redirige despublicar no lleva motivo, nombre ni WhatsApp; la
  del borrado no lleva ni el id.
- El motivo hostil (`</textarea><img onerror><script>`) se pinta escapado en el
  detalle del panel: ni una etiqueta viva.
- El `wa.me` del aviso pasa el mensaje entero por `encodeURIComponent`: con un
  motivo que trae `&text=`, salto de línea, `#` y comillas, la URL resultante
  tiene `wa.me` como host y **un solo** parámetro (`text`).
- No hay `sitemap`, `robots` ni rutas de Open Graph todavía; las 4 pantallas
  nuevas declaran `robots: { index: false, follow: false }`.
- **Sin caché ni memoización de negocios** (confirmado: no hay `cache()`,
  `unstable_cache` ni `revalidate` en `src/`, y el build marca todas las rutas de
  negocios como dinámicas), así que "de inmediato" sigue siendo verdad. La
  preocupación de T-009 no aplica.

### Datos personales y secretos

- Cero secretos nuevos y **cero variables de entorno nuevas**: `.env.example` no
  necesita cambios (verificado con `grep process.env` sobre los 8 archivos
  nuevos).
- Todas las fixtures nuevas usan la serie ficticia `771999 4xxx` (las mías),
  `6xxx`, `7xxx` y `8xxx` (las del dev), con nombres inventados. La migración no
  trae datos.
- Ninguna consulta usa SQL crudo con entrada de usuario: los `$queryRawUnsafe`
  que hay están **solo en tests**, sobre nombres de tabla que salen de
  `sqlite_master` (no de una petición), y con parámetros ligados para los valores.
- Ningún `dangerouslySetInnerHTML` en todo el diff.

### Superficies de abuso (señalado, no implementado — no hay spec)

El change no agrega superficie pública, así que no hay nada nuevo que limitar. Lo
que sí conviene anotar: **el acceso al panel es la única puerta de esta acción
irreversible**, y hoy lo protegen una contraseña de entorno y el límite de
intentos por IP de `src/lib/admin/acceso.ts`. Sin segundo factor, quien adivine
o filtre esa contraseña puede vaciar el directorio entero, ficha por ficha, sin
dejar rastro (ver BAJO 4). No propongo implementar nada aquí: es material para
un ticket propio si el directorio crece.

## Scenarios sin test automatizado

Revisé el mapa scenario → test de `b-dev.md` contra los cuatro deltas. Está
completo salvo estos cuatro, y ninguno es un descuido:

1. `revision-admin` › **"decidir con los reportes a la vista"** — no automatizable
   en esta rama: la capacidad de reportes (T-011) no existe. El detalle tiene el
   comentario ancla en el lugar exacto. Queda como deuda de merge de T-011.
2. `revision-admin` › **"la confirmación funciona sin JavaScript y en el celular"**
   — el `"use client"` lo cubre un test; **el envío sin JS ya lo verifiqué yo por
   HTTP** (ver arriba, con el procedimiento repetible). Sigue sin cubrir: 390 /
   768 / 1280 px, scroll horizontal, área táctil y contraste AA → ojo humano en
   el PR.
3. `revision-admin` y `modelo-datos` › **"la foto también se va"** — cubierto solo
   condicionalmente, y el disparador es frágil (BAJO 2). *Iteración 2: el
   disparador ya no adivina nombres y tiene su propio meta-test; el scenario
   sigue sin poder ejecutarse de verdad hasta que T-008 mergee, que es lo único
   que no depende de este change.*
4. `paginas-legales` › **"el texto legal no cambia"** — no hay test nuevo, pero
   las suites existentes de `legales-paginas` y `legales-adversarial` comparan el
   texto publicado y siguen en verde; verifiqué que el diff de
   `src/lib/legales/textos.ts` solo toca la lista de pendientes.

## Pruebas adversariales agregadas

Un solo archivo nuevo: **`tests/despublicar-borrado-seguridad-adversarial.test.ts`**
— **52 pruebas, todas en verde** (45 en la iteración 1; +1 por la partición del
test de emojis del dev y +6 que agregué al reverificar). No modifiqué ninguna
suite existente.

| Bloque | Qué ataca | Pruebas |
| --- | --- | --- |
| La palabra `BORRAR` no se puede falsificar con unicode | homoglifos, ancho completo, negritas matemáticas, ZWSP, guion suave, nulo, acento, frase, repetición, `DELETE`; campo repetido; campo que es un archivo; palabra de 120 000 caracteres; y la tolerancia declarada (espacios, NBSP, U+FEFF, saltos) | 19 |
| Una sesión rota tampoco despublica ni borra | firma alterada, otro secreto, caducada, basura, panel sin configurar — sobre las dos acciones | 9 |
| Después del borrado no queda residuo en ninguna tabla | barrido de todas las tablas × todas las columnas; catálogos y negocios vecinos intactos | 2 |
| Carreras entre el borrado y las otras transiciones | doble borrado en paralelo, despublicar‖borrar, despublicación tardía sobre una fila borrada, doble despublicación en paralelo, **borrado en medio de una aprobación** (MEDIO 1) y **5 fallos parecidos a P2025 que deben propagarse** (iteración 2) | 10 |
| El reloj de la cola ante un rastro imposible | despublicación en el futuro (texto, atraso, conteo y orden), los dos bordes del `>` | 4 |
| El motivo hostil vive dentro del panel, escapado | `</textarea><img onerror><script>` en el detalle; 401 emojis (801 unidades UTF-16) **se guardan enteros**; 501 emojis **se rechazan** sin escribir; el rechazo por longitud no filtra el motivo en la URL; motivo y nombre fuera de las URLs de redirección | 7 |
| Transiciones ilegales | un `rechazado` no se puede despublicar para colarlo a la cola, la confirmación no revive un registro borrado, la etiqueta de la cola no aparece en un alta nueva | 3 |

Todos los datos son ficticios (serie `771999 4xxx`, nombres inventados) y el
archivo limpia sus filas en `beforeEach`/`afterAll`, como el resto de la suite.

## Iteración 2 — reverificación

El dev corrigió los 2 medios y los 3 bajos accionables. Revisé cada corrección
**contra el código real**, no contra el reporte, y volví a correr los tres gates.

| Hallazgo | Estado | Cómo lo verifiqué |
| --- | --- | --- |
| MEDIO 1 (carrera aprobar‖borrar) | Corregido | Código (`try/catch` con comparación estricta de `P2025` y relanzado de lo demás) + mi test sin `.catch()` + 5 casos nuevos de códigos parecidos |
| MEDIO 2 (pendiente legal) | Corregido | Código (renglón acotado a acceso/rectificación bajo E3-6, comentario obsoleto actualizado) + texto publicado intacto |
| BAJO 1 (guarda de `/despublicado`) | Corregido | Código (guarda triple) + HTTP: `307` sin filtrar nada; la despublicación real sin JS sigue llegando a "Ya la despublicaste." |
| BAJO 2 (ancla de la foto) | Corregido | Código (disparador por prefijo `foto` menos `fotoUrl`) + meta-test del propio disparador |
| BAJO 3 (recorte del motivo) | Corregido | Código (rechazo por puntos de código, literal con la cota, `maxLength`, valor de error validado) + HTTP sin JS: 501 puntos de código ⇒ `?errorDespublicar=longitud`, nada escrito |
| BAJO 4 (bitácora) | Deuda declarada | Coincido: backlog, no defecto del change |
| BAJO 5 (`rechazarRegistro`) | Deuda aceptada, razón corregida | Ver el hallazgo: la spec **no** fija el recorte, solo su test; cerrarlo no requiere cambiar ninguna spec |

### Las dos pruebas mías que el dev modificó: ninguna se debilitó

Las revisé línea por línea. **Las dos quedaron más estrictas**, y las dos pasaron
de afirmar el comportamiento defectuoso a afirmar el correcto:

1. **`… › "un borrado en medio de una aprobación no resucita la fila"`.** Antes
   envolvía la llamada en `.catch(() => undefined)` para tolerar las dos formas
   mientras el hallazgo estuviera abierto, y solo comprobaba los dos invariantes
   de la base. Ahora llama **sin `catch`** —así que una excepción reprueba el
   test— y además afirma `{ resultado: "no-encontrado" }`. Conserva íntegros los
   dos invariantes originales (la fila no resucita, sus vínculos con giros
   tampoco). Superconjunto estricto del anterior. Actualicé el comentario del
   test, que había quedado describiendo la tolerancia ya inexistente.
2. **`… › "un motivo de puros emojis…"`.** La versión mía afirmaba
   `guardado.length <= LIMITE`, que es exactamente lo que **aceptaba el recorte
   silencioso** del BAJO 3: era la prueba más débil de mi suite y el dev tenía
   que romperla para arreglar el hallazgo. Quedó partida en dos, y las dos son
   más fuertes: una fija el fixture que cruza el borde UTF-16 (401 puntos de
   código = 801 unidades) y exige `toBe(motivo)` —guardado **entero**, sin
   carácter de reemplazo—, y la otra exige que 501 puntos de código devuelvan
   `error: "longitud"` **sin escribir nada**. Ninguna aserción original se
   perdió: la de serialización sin excepción sigue ahí.

De ahí que la suite pase de 45 a 46 pruebas; con lo que agregué en esta
reverificación (5 casos de propagación de errores + el rechazo por longitud que
no filtra el motivo) queda en **52**.

### Lo que reverifiqué por HTTP contra el servidor real

Repetí el montaje de la iteración 1 (`next dev -p 3400`, base desechable, cookie
firmada) sobre el código corregido:

| Prueba | Resultado |
| --- | --- |
| `<textarea>` del motivo | renderiza `maxLength="500"` |
| Motivo de 501 puntos de código, **sin JS**, saltándose el `maxLength` | `303 → ?errorDespublicar=longitud`; base sin tocar |
| El detalle pinta el literal nuevo | "El motivo no puede pasar de 500 caracteres. Recórtalo un poco: así, completo, es como le va a llegar al negocio." |
| `?errorDespublicar=inventado` | no pinta ningún error |
| Guarda endurecida sobre una ficha no despublicada | `307 → /admin/registros/<id>`, sin filtrar nada |
| Despublicación real **sin JS** | `303 → …/despublicado`; la pantalla trae "Ya la despublicaste." y su `wa.me` |
| Log del servidor | solo `cuid`s: ni nombre, ni WhatsApp, ni motivo |

Nada de lo verificado en la iteración 1 se rompió: las conclusiones de
"Lo que verifiqué y salió limpio" siguen vigentes tal cual.
