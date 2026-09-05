# Reporte SEGURIDAD-TEST — `agregar-enlace-de-gestion` (T-014)

Etapa C sobre lo que dejaron `a-ui.md` y `b-dev.md`. Auditoría del diff completo
—`git status` + `git diff main`, incluidos los 20 archivos sin seguimiento—
contra la spec de las cuatro capacidades, más pruebas adversariales de lo que el
camino feliz no cubre. **No toqué una línea de código de producción:** agregué
un archivo de pruebas (`tests/gestion-seguridad-adversarial.test.ts`), alimenté
la lista de un guardián que este change dejó a medias
(`tests/admin-adversarial.test.ts`) y escribí este reporte.

**Estado: CERRADO tras la iteración 2 del dev.** Lo que sigue documenta la
auditoría de la iteración 1; cada hallazgo lleva al final un bloque
**"Iteración 2"** con lo que reverifiqué contra el código corregido, de forma
independiente y no por reporte. El resumen de esa reverificación está en
[Iteración 2 — reverificación](#iteración-2--reverificación).

Gates al cierre (sobre el código de la iteración 2): `npm run lint` **limpio** ·
`npx tsc --noEmit` **limpio** · `npm run build` **correcto** · `npm test`
**2904 pasando, 2 saltados, 103 archivos**.
(Iteración 1: 2878 + 2 en rojo a propósito. Baseline del dev: 2811 en 102.)
Base: instancia aislada `npx prisma dev --name t014`, como pidió §7 de `b-dev.md`.

## Veredicto

**PASA AL VALIDADOR.** Al cierre de la iteración 2 no queda ningún hallazgo
crítico, alto ni medio abierto: el ALTO y los tres MEDIOS accionables están
**corregidos y reverificados**; el MEDIO 3 es riesgo asumido ya documentado con
sus condiciones operativas y **sube al humano como decisión, no como defecto**.

| Severidad | Iteración 1 | Abiertos al cierre |
| --- | --- | --- |
| Crítico | 0 | 0 |
| Alto | 1 | **0** (corregido) |
| Medio | 3 | **0** (2 corregidos · 1 riesgo asumido documentado) |
| Bajo | 2 | **0 accionables** (1 corregido por mí · 1 deuda declarada) |

Queda **una cosa para el humano** que no es un hallazgo sino una discrepancia de
letra: el requirement de `registro-negocio` sigue diciendo "DEBEN declarar que
no se manda `Referer` a ningún destino", y la implementación manda el **origen**
(nunca la ruta). El *scenario* —que es la parte comprobable— se cumple; la
prosa del requirement, no. Detalle y propuesta en
[la nota final](#nota-para-el-humano--la-letra-del-requirement-del-referer).

Lo demás está sólido, y hay que decirlo: el token, la huella, la comparación en
tiempo constante, el blindaje contra mass assignment, la lista blanca al
aplicar, las escrituras condicionadas, el índice único parcial, la cascada ARCO
y el aislamiento de lo público resistieron **todo** lo que les tiré. Los 80
tests adversariales de este archivo son, en su mayoría, confirmaciones de que el
dev hizo bien lo difícil.

---

## Hallazgos

### ALTO 1 — El token viaja a un TERCERO en cada apertura del enlace (analítica)

**Dónde:** `src/app/(publico)/editar/[token]/page.tsx` (la ruta vive dentro del
grupo `(publico)`) · `src/app/(publico)/layout.tsx:32` (`<ScriptAnalitica />`) ·
`src/components/analitica/script-analitica.tsx:38-43`.

**Qué pasa.** `design.md` §4 enumera las tres fugas de un secreto que viaja en
la URL —`Referer`, buscadores y log del servidor— y las cierra una por una. Hay
una cuarta que no está en la lista: **el tracker de la analítica manda la ruta
de cada vista al recolector del proveedor**. `/editar/[token]` se creó dentro
del grupo `(publico)`, que es exactamente —y solo— el layout que inyecta ese
script, así que el modo edición quedó medido como cualquier otra página
pública. `data-exclude-search="true"` quita la **cadena de consulta**, no el
`pathname`: el token va en el path.

**Escenario concreto de fuga.** El dueño de «Tortillería X» abre desde su
WhatsApp el enlace que le mandó el admin. El navegador carga
`https://cloud.umami.is/script.js`, que hace un `POST` a `gateway.umami.is` con
`url: "/editar/9f3a…43-caracteres"`. Ese token —que es la credencial completa
para leer y proponer cambios sobre los datos personales del negocio— queda
guardado en la base de un tercero, visible en su panel de "páginas más vistas",
exportable, y con la retención que decida el proveedor. Cualquiera con acceso a
ese panel (que no es el mismo control de acceso que el de Vercel ni el de la
base) puede copiar la ruta, pegarla en un navegador y editar la ficha de
cualquier negocio publicado que haya abierto su enlace. Lo mismo con
`/editar/<token>/gracias`, que es el destino del `redirect` del envío.

**Por qué es ALTO y no MEDIO.** Tres razones que lo separan del hallazgo del
log: (1) el secreto sale **fuera del perímetro** hacia un responsable distinto,
no a un log de la propia plataforma; (2) la analítica **conserva** el histórico
por diseño, mientras que un log de ejecución caduca; (3) el aviso de privacidad
publicado dice que "los únicos terceros que participan son los proveedores que
hacen funcionar el sitio (hospedaje y base de datos)"
(`src/lib/legales/textos.ts:287`) — mandar la credencial de gestión de un
negocio a un cuarto proveedor no cabe en esa frase (LFPDPPP, PRD §8).

El propio repo ya conocía la mecánica: `src/lib/seguridad/csp.ts:71-78` explica
que `/admin` emite `<meta name="referrer" content="strict-origin">`
precisamente porque *"el tracker de la analítica reenvía los referentes del
mismo origen"* y `/admin/registros/<id>` apunta a una persona concreta. El modo
edición necesita la misma consideración, y con más motivo: ahí la URL no
"apunta a" el dato, **es** la llave.

**Arreglo sugerido, SIN tocar la spec** (es el mismo mecanismo que ya usa el
panel, design.md §1 de `agregar-analitica-cookieless`): sacar la ruta de
edición del grupo que inyecta el script — p. ej. `src/app/(gestion)/editar/…`
con su propio layout sin `ScriptAnalitica`, o cualquier reparto equivalente. La
spec no pide en ningún lado que el modo edición se mida; sí pide que el token
no se filtre. Ojo al mover: `tests/analitica-exclusion-admin.test.ts:176-178`
fija que **solo** `src/app/(publico)/layout.tsx` monta el script, y hay que
conservar `noindex, nofollow` y `referrer: no-referrer` en la ruta nueva.

**Test:** `tests/gestion-seguridad-adversarial.test.ts` › *"adversarial · la
cuarta fuga del token"* › `[A1] la pantalla del modo edición no carga ningún
script de terceros` y `[A1] la confirmación de la edición tampoco…`. **Están en
ROJO a propósito** (mismo criterio que el M4 de
`tests/despliegue-seguridad-adversarial.test.ts` en su día): se ponen en verde
solos cuando la ruta salga del grupo medido. Reproducido renderizando la página
real dentro de su layout real con las variables de la analítica puestas.

> **Iteración 2 — CORREGIDO y reverificado.** La ruta se mudó a
> `src/app/(gestion)/editar/[token]/`, con `src/app/(gestion)/layout.tsx` propio
> que no monta `<ScriptAnalitica />`. Es el mecanismo estructural que sugerí (el
> mismo con el que `/admin` quedó fuera), no una lista de rutas.
>
> **Verificado por HTTP, no por reporte**, contra el sitio servido en el 3910
> con `NEXT_PUBLIC_UMAMI_SRC` y `NEXT_PUBLIC_UMAMI_WEBSITE_ID` puestas y un
> negocio ficticio publicado con token conocido:
>
> | Ruta | HTTP | `umami` | `data-website-id` | `<script src>` de terceros |
> |---|---|---|---|---|
> | `/` | 200 | **1** | **1** | **1** |
> | `/registro` | 200 | **1** | **1** | **1** |
> | `/negocio/<ficha>` | 200 | **1** | **1** | **1** |
> | `/editar/<token>` | 200 | **0** | **0** | **0** |
> | `/editar/<token>/gracias` | 200 | **0** | **0** | **0** |
> | `/admin` | 200 | 0 | 0 | 0 |
>
> Las dos mitades importan: el token ya no sale, **y el resto del sitio sigue
> midiendo** — "apagar la analítica" también habría puesto los `[A1]` en verde y
> habría sido una corrección falsa. Las dos pantallas conservan además
> `<meta name="robots" content="noindex, nofollow">` y ninguna URL cambió
> (`next build` sigue listando `ƒ /editar/[token]` y `ƒ /editar/[token]/gracias`).
>
> **Sobre mis dos tests rojos.** El dev los reescribió, y con razón: importaban
> la página desde su ruta vieja y la envolvían *explícitamente* en
> `LayoutPublico`, así que al mover la ruta se habrían roto por "módulo no
> encontrado" en vez de ponerse verdes. La reescritura **conserva la intención y
> sube la exigencia**: recorre la **cadena real de layouts** desde el archivo de
> la página hasta `src/app` y comprueba que ninguno monta el tracker, así que
> defiende la propiedad y no la ubicación, y sigue mordiendo si mañana alguien
> mueve la ruta a un grupo medido o le agrega el script al layout de `(gestion)`.
> Verifiqué que la cadena no puede pasar por vacío (afirma que encuentra los dos
> layouts). El único aflojamiento —"ningún `<script src=`" en vez de "ningún
> `<script>`" en la pantalla con formulario— es correcto y lo comprobé por HTTP:
> el inline que React emite para reproducir el envío no sale del sitio, y de
> `<script src>` de terceros hay **cero**.
>
> **Los dos guardianes que el dev enmendó no se debilitaron** (los audité,
> porque aflojar un guardián es la forma clásica de poner un test rojo en
> verde): `analitica-exclusion-admin` sigue afirmando lo mismo —un solo archivo
> renderiza el script— y solo deja de confundir un comentario con el defecto;
> `analitica-adversarial` cambió una frontera de dos lados por una **lista de
> raíces excluidas con su porqué**, y le sumó un test que comprueba que cada
> raíz excluida lo está de verdad y que sigue teniendo páginas. Eso es más
> estricto que antes, no menos.

---

### MEDIO 1 — Una edición se marca "aplicada" sin aplicarse, y el panel lo celebra

**Dónde:** `src/lib/gestion/ediciones.ts:281-306` (la transacción de
`aplicarEdicion`) · `src/app/admin/ediciones/[id]/accion-aplicar.ts:29-31`.

`aplicarEdicion` cierra primero la edición (`updateMany` condicionado a
`id + pendiente`) y **después** escribe el negocio condicionado a `publicado`.
Si entre que el admin abrió la comparación y tocó "Aplicar los cambios" la
ficha dejó de estar publicada, la segunda escritura no afecta ninguna fila —la
ficha no revive, que es lo importante y está bien— pero la función **devuelve
`{ resultado: "aplicada" }`**, la fila queda en estado `aplicada` con su
`resueltaEn`, y el panel redirige a `/aplicada`, que muestra "Listo, la ficha ya
se actualizó" y ofrece avisarle al negocio por WhatsApp.

**Escenario concreto:** el admin tiene el detalle de la edición abierto en una
pestaña. En otra despublica la ficha porque un vecino reportó que el negocio
cerró. Vuelve a la primera pestaña y aplica. Resultado: **los cambios del dueño
se pierden para siempre** (la edición ya no está pendiente, no reaparece en la
cola y no hay pantalla para recuperarla), el admin cree que se aplicaron y el
mensaje prellenado le dice al negocio que su ficha ya está actualizada. Es
pérdida de datos de un tercero con acuse de recibo falso.

**Reproducido:** `aplicarEdicion` devuelve
`{"resultado":"aplicada","negocioId":"…","nombre":"Probe Ficticio Nuevo"}` y la
fila queda `aplicada` mientras el negocio sigue con sus datos viejos.

**Sugerencia:** invertir el orden dentro de la transacción (escribir el negocio
condicionado a `publicado` primero y abortar si `count === 0`), o comprobar el
estado del negocio antes de cerrar la edición y devolver un desenlace propio. Es
lo que el dev ya dejó anotado como hallazgo E de `b-dev.md`, aquí medido y con
severidad. **No hay literal en la spec para ese caso: hace falta uno.**

**Test:** `[M1] una ficha despublicada no revive ni cambia de datos al aplicar`.
Tolera las dos formas: fija lo intocable (la ficha no vuelve al directorio, no
cambia de datos, y su enlace de gestión deja de abrir) y acepta tanto el
desenlace de hoy como el corregido.

> **Iteración 2 — CORREGIDO y reverificado.** El orden dentro de la transacción
> se invirtió (`src/lib/gestion/ediciones.ts`): primero la ficha, condicionada a
> `publicado`, y la edición **solo se cierra si esa escritura afectó una fila**.
> Reproduje el caso original: `aplicarEdicion` devuelve ahora
> `{ resultado: "ficha-no-publicada" }`, la edición **sigue `pendiente` con
> `resueltaEn` nulo** y la ficha conserva sus datos. Y probé el viaje de vuelta,
> que es lo que de verdad prueba que no se perdió nada: al volver a publicar la
> ficha, **esa misma edición se aplica** y el horario propuesto llega a la ficha.
> El literal nuevo (`MENSAJE_EDICION_FICHA_NO_PUBLICADA`) dice qué no pasó, por
> qué y que nada se perdió; la acción redirige a `?errorAplicar=no-publicada` y
> el detalle lo pinta comparando contra una cadena fija (sin inyección posible).
>
> Mis dos tests dejaron de tolerar las dos formas y ahora **fijan la corregida**:
> `[M1] si la ficha ya no está publicada no se aplica nada y la edición sigue
> esperando` y `[M1] y al volver a publicar la ficha, esos mismos cambios sí se
> aplican`.

### MEDIO 1b — El mismo negocio ocupa dos renglones de la cola

**Dónde:** `src/lib/admin/consultas.ts:250-300` (`obtenerColaDeRevision`) ·
`src/lib/admin/transiciones.ts:339-345` (`despublicarFicha` devuelve la ficha a
`en_revision`, no a un estado propio).

El requirement de la cola dice que un negocio con edición pendiente "aparece en
la cola una sola vez, como Edición". Es cierto mientras esté `publicado`.
Despublicarlo lo devuelve a `en_revision`, y entonces el mismo negocio ocupa
**dos** renglones con el mismo nombre y la misma colonia: uno "Alta nueva" y
otro "Edición" que además ya no se puede aplicar (M1). Reproducido: la cola
devuelve dos filas idénticas salvo `tipo` y `hrefDetalle`.

No es una fuga: es una cola que miente sobre cuánto trabajo hay y que empuja al
admin justo al escenario del M1. La combinación "despublicar + edición
pendiente" no la contempla ninguna spec de este change; el orquestador decide si
se resuelve aquí o entra al backlog.

**Test:** `[M1b] un negocio bajado con edición pendiente ocupa dos renglones de
la cola`. Fija lo que no puede cambiar (cada renglón dice de qué es y lleva a un
detalle alcanzable) y documenta el desenlace de hoy.

> **Iteración 2 — CORREGIDO y reverificado.** `obtenerColaDeRevision` deduplica:
> una edición no abre renglón si su negocio ya está en la cola por sí mismo.
> Reproduje el caso: ahora la cola devuelve **un solo renglón**, de tipo `alta`,
> apuntando a `/admin/registros/<id>` — que es lo que el admin tiene que
> resolver primero. La edición **no se toca**: sigue `pendiente`, y comprobé que
> al volver a publicar la ficha **reaparece como `edicion`** con su
> `hrefDetalle` correcto.
>
> Me fijé especialmente en **cómo** se dedupe, porque el atajo obvio
> (`where: { negocio: { estado: publicado } }`) habría metido el filtro de
> visibilidad del directorio en un segundo módulo y obligado a otra excepción en
> el guardián de `tests/directorio-consultas.test.ts`. No es lo que hizo: cruza
> contra las altas que **la misma consulta ya leyó**, sin nombrar ningún estado.
> El guardián sigue con su lista de siempre.
>
> Mi test dejó de tolerar y ahora exige: `[M1b] un negocio bajado con edición
> pendiente ocupa UN solo renglón`, con el viaje de vuelta incluido.
>
> **Caso residual que dejo anotado, sin severidad:** la deduplicación cubre
> `en_revision`, que es a donde lleva despublicar. Una ficha que recorra
> `publicado → en_revision → rechazado` deja una edición pendiente cuyo negocio
> ya no está en la cola, así que su renglón vuelve a aparecer; aplicarla
> responde el literal honesto nuevo y no se pierde nada. Es un camino de tres
> pasos del admin y el desenlace es correcto: lo menciono para que exista, no
> para que se arregle ahora.

### MEDIO 2 — Un `%00` en `/admin/ediciones/<id>` devuelve 500 en vez de 404

**Dónde:** `src/lib/admin/ediciones.ts:161` (`prisma.edicionPendiente.findUnique({ where: { id } })`).

El `id` llega del `params` de la URL, ya decodificado, y se interpola en la
consulta sin filtrar el byte nulo. PostgreSQL aborta la consulta y Prisma lanza:
la pantalla responde un **error del servidor**, no el 404 que responde con
cualquier otro identificador inventado.

**Reproducido:** `obtenerEdicionParaPanel(prisma, "clx 000")` →
`PrismaClientKnownRequestError · Invalid prisma.edicionPendiente.findUnique()
invocation in src/lib/admin/ediciones.ts:161`.

Es exactamente la clase de problema que este repo ya cerró en el lado público
con `extraerIdDeSegmentoFicha` (`src/lib/ficha-url.ts:46-49`, con su comentario
explicando el porqué) y en los motivos del panel con `sinBytesNulos`. El change
estrena una superficie nueva sin heredar la defensa. Requiere sesión de admin y
no filtra datos —de ahí MEDIO y no más—, pero el mismo patrón existe hoy en
`obtenerRegistroParaPanel` (deuda anterior, no la abre este change): conviene
resolverlo en el mismo sitio para las dos.

**Sugerencia:** `if (!id || tieneByteNulo(id)) return null;` en
`obtenerEdicionParaPanel`, con el mismo comentario que `ficha-url.ts`.

**Test:** `[M2] un identificador de edición %s nunca pinta datos de nadie`
(byte nulo, vacío, 100 KB, comillas de SQL, un ángulo). Tolera las dos formas:
fija que el desenlace nunca puede ser "se pinta el detalle de alguien" ni "se
toca la edición", y pasará por la rama del `null` cuando se filtre.

> **Iteración 2 — CORREGIDO y reverificado.** El filtro entró en el borde con
> `tieneByteNulo`, con el mismo comentario que `ficha-url.ts`, **y también en
> `obtenerRegistroParaPanel`** — la otra puerta de la misma clase, que era deuda
> anterior al change. Cerrar solo la nueva habría sido peor que no haber mirado.
>
> **Verificado por HTTP** contra el sitio servido, con una cookie de sesión de
> admin firmada a mano (no por la función, por la ruta):
>
> | Ruta | con sesión | sin sesión |
> |---|---|---|
> | `/admin/ediciones/<id real>` | 200 | 307 |
> | `/admin/ediciones/clx%00000000` | **404** | 307 |
> | `/admin/ediciones/inventado` | **404** | 307 |
> | `/admin/registros/<id real>` | 200 | 307 |
> | `/admin/registros/clx%00000000` | **404** | 307 |
>
> El `%00` responde **exactamente el mismo 404** que un identificador inventado,
> que es lo que pedía el hallazgo, y la autorización sigue intacta.
>
> Mi test dejó de tolerar: ahora exige `notFound()` (`rejects.toBeInstanceOf`)
> para seis identificadores hostiles —le sumé el salto de línea— y hay un
> séptimo para el detalle de un registro.

### MEDIO 3 — El token en el log de acceso del runtime (hallazgo A del dev, pesado)

**Dónde:** consecuencia directa del diseño aprobado (`design.md` §4: el secreto
va en el *path*), no de la implementación.

**Confirmo el diagnóstico del dev y confirmo también su defensa:** *nuestro*
código no escribe el token en ningún log. Lo verifiqué de nuevo: los ocho
`console.*` de `src/lib/gestion/` (`procesar-edicion.ts:88,94,105,122,149` y
`ediciones.ts:137,143,299`) escriben tipo de evento o `código Pxxxx`, nunca el
token, nunca un dato del negocio; `token.ts` no llama a `console` en ninguna
rama, y el módulo del panel tampoco arma URLs de edición. Lo que queda es el
logger de peticiones del framework y, en producción, el log de acceso de la
plataforma.

**Severidad real en Vercel, que es lo que se me pidió pesar:**

- **Quién ve esos logs.** Solo los miembros del proyecto en Vercel. Hoy eso es
  el propio admin — la misma persona que puede regenerar cualquier enlace desde
  el panel y que tiene acceso directo a la base. **El poder que la fuga otorga
  no excede el que ese lector ya tenía**, y por eso no es un ALTO.
- **Retención.** Los logs de ejecución de Vercel no son almacenamiento
  permanente: se ven en vivo y se conservan un plazo corto salvo que se
  configure un **Log Drain**. Ese drain es el que cambiaría la película, porque
  mandaría los tokens a un tercero con retención larga — es decir, convertiría
  esto en el ALTO 1 por otra puerta.
- **Superficie adicional que el dev no menciona y que sí cuenta:** la URL con el
  token queda además en el **historial del navegador del dueño** y en cualquier
  CDN/WAF intermedio. Eso no se arregla con nada que no sea sacar el secreto del
  path.

**Mitigaciones SIN cambiar la spec: ninguna cierra el hallazgo.** Lo revisé una
por una. (a) *POST en vez de GET*: no aplica — el flujo es "pega el enlace que
te llegó por WhatsApp", que es un GET por definición, y el panel prohíbe JS de
cliente. (b) *Acortar la vida del token*: no existe expiración por diseño y el
ticket la declara fuera de alcance; añadirla cambia la spec y el flujo. (c)
*Enmascarar el path en el log*: no controlamos el logger de la plataforma. Lo
único que sí se puede hacer hoy, y recomiendo, es **operativo**: dejar escrito
en `docs/despliegue.md` que el proyecto **no** configura Log Drains y que el
acceso al proyecto de Vercel se limita al admin con 2FA.

**Dictamen:** hallazgo **MEDIO real, no cerrable dentro de este change**.
**Va al humano como decisión de riesgo asumido** (igual que "el enlace viaja por
WhatsApp", PRD §6.4), con la nota operativa en `docs/despliegue.md` como
condición. Lo que **sí** hay que arreglar antes de mergear es el ALTO 1, que es
la misma fuga por un canal peor y que sí se cierra sin tocar la spec.

> **Iteración 2 — DOCUMENTADO como riesgo asumido; sigue siendo decisión del
> humano.** `docs/despliegue.md` estrena §8.1 con las dos condiciones
> operativas que pedí, y en los términos que pedí: **no se configuran Log
> Drains** (un drain convertiría un dato de vida corta en un depósito
> permanente de credenciales en manos de un tercero) y **el acceso al proyecto
> de Vercel se limita al admin con 2FA** (la equivalencia que sostiene la
> decisión —"quien lee esos logs ya podía regenerar cualquier enlace"— deja de
> ser cierta en cuanto se invite a alguien más). Entra también como deuda
> conocida en §10.
>
> Reconfirmé la parte que sí depende del código: los ocho `console.*` de
> `src/lib/gestion/` siguen escribiendo solo tipo de evento o `código Pxxxx`, y
> `token.ts` no llama a `console` en ninguna rama.
>
> **No lo cierro: lo escalo.** Documentar un riesgo no lo elimina; lo convierte
> en una decisión con nombre. El humano la toma al mergear.

---

### BAJO 1 — Un byte nulo en un campo de texto libre rebota con un error genérico

**Dónde:** `src/lib/registro/validacion.ts` (no filtra ` `) →
`src/lib/gestion/ediciones.ts:129-148`.

Un dueño que pega texto desde otro programa con un byte nulo dentro ve "No
pudimos guardar tus cambios. Vuelve a intentarlo en un momento." y **nunca
podrá guardar** por más que reintente. Reproducido: el log escribe
`[gestion] no se pudo guardar la edición: código P2039`, sin filtrar datos.

Lo bueno: **no hay 500**, no se filtra detalle técnico al dueño, la transacción
revierte y la edición que ya tenía esperando sigue intacta. Y es el mismo
comportamiento que el registro (`src/lib/registro/procesar.ts:421-450`), así que
no es una divergencia que estrene este change. Arreglo natural: `sinBytesNulos`
en `leerEnvioRegistro`, que beneficia a los dos caminos.

**Test:** `[B1] un byte nulo en el nombre no revienta el envío ni pierde lo
anterior` — tolera las dos formas (guardado con el byte filtrado, o rebote
limpio conservando la pendiente anterior).

### BAJO 2 — El guardián de "la guarda va antes de tocar datos" se quedó a medias · **CORREGIDO**

**Dónde:** `tests/admin-adversarial.test.ts:636-658` (`ACCESOS_A_DATOS`).

Ese guardián descubre solo los archivos nuevos de `src/app/admin` (bien: exige
que todos llamen a `requerirSesionAdmin()`), pero comprueba el **orden** contra
una lista de nombres escrita a mano. El change estrena cuatro accesos a datos
que no estaban en la lista —`obtenerEdicionParaPanel`, `aplicarEdicion`,
`descartarEdicion`, `regenerarEnlaceDeGestion`—, así que la mitad que de verdad
importa dejó de cubrir las pantallas nuevas sin que nada fallara.

**Lo corregí yo** (es un test, está dentro de mi alcance): los cuatro nombres
están en la lista, con el porqué escrito al lado, y el guardián sigue en verde
—las seis pantallas y las tres acciones nuevas llaman a la guarda **antes** de
cualquiera de ellos—.

---

## Scenarios sin test

Revisé el mapa scenario→test de `b-dev.md` §3 contra los **114 scenarios** de
los cuatro deltas. **No encontré ningún scenario automatizable sin test.** Lo
que el dev marcó como manual lo es de verdad, y lo comprobé caso por caso:

- *"la edición funciona sin JavaScript"*, *"el panel funciona sin JavaScript"*,
  *"los dos links abren lo que prometen"*, *"revisar desde el celular"*, *"la
  comparación se lee en el celular"*, *"el control no compite con el contacto"*:
  dependen de un navegador real o del ojo. `renderToStaticMarkup` no puede
  probarlas (de hecho pinta el `action="javascript:throw…"` que React usa de
  marcador), y el dev las verificó a mano en el 3900 con evidencia en §5.
- *"sin número de admin configurado"*: `gestion-privacidad` lo cubre con y sin
  la variable. Comprobado.
- La única cobertura que se degradó no es un scenario sino un guardián: el
  BAJO 2 de arriba, ya corregido.

Dos matices menores, sin severidad, sobre cómo se cumplen dos scenarios:

1. *"el enlace se muestra una sola vez"* se cumple **por caducidad y no por
   borrado** (hallazgo B de `b-dev.md`). Lo verifiqué: la cookie es `httpOnly`,
   `SameSite=Lax`, `Path=/admin`, `Secure` fuera de local y `maxAge` 120 s, va
   atada al `negocioId` y un sobre de otro negocio no sirve. Dentro de esa
   ventana, recargar `/aprobado` vuelve a mostrar el enlace **al mismo admin que
   acaba de generarlo**, que es quien ya lo tenía en pantalla. Limitación real
   de Next (no se puede borrar una cookie al renderizar) y riesgo residual
   nulo: la acepto.
2. *"el token no aparece en el log"* se cumple **para nuestro código**; el resto
   es el MEDIO 3.

## Superficies de abuso (señaladas, no implementadas — no hay spec)

1. **El GET del enlace no tiene cupo.** Decisión explícita de `design.md` §3
   ("sería teatro" contra 256 bits) y la comparto: con este tamaño de token la
   fuerza bruta no es un escenario. Anotado para que nadie lo lea como un olvido.
2. **Los envíos inválidos no gastan cupo** (`procesar-edicion.ts:138`: el cupo
   se apunta después de validar). Es intencional —una errata no debe costar
   intentos— y es el mismo criterio del registro, pero significa que quien tenga
   un enlace válido puede mandar envíos mal formados sin tope, y cada uno hace
   tres consultas a la base. A escala municipal no es problema; con la base de
   producción (E0-3) conviene mirarlo junto al cupo compartido.
3. **El cupo sigue en memoria del proceso** y depende de `REGISTRO_ENCABEZADO_IP`
   (declarado en la propuesta). Lo que sí verifiqué y está **bien**: no se
   elude anteponiendo saltos falsos al encabezado, porque `ipDeEncabezados` toma
   el **último** valor de la lista. Hay test.
4. **`EdicionPendiente` crece sin poda** (hallazgo E del dev): cada edición
   resuelta conserva un snapshot completo de datos personales, y la purga de los
   90 días solo alcanza rechazados. Con el volumen municipal no es un problema
   operativo, pero sí es **retención sin plazo declarado** (LFPDPPP): conviene
   anotarlo junto a la purga en el backlog.
5. **El WhatsApp del admin queda en el HTML de todas las fichas publicadas**
   (`ControlPerdiMiEnlace`), scrapeable por cualquiera. Es lo que la spec pide y
   es su propio número, no el de un tercero; queda dicho para que sea una
   decisión y no una sorpresa.

## Lo que verifiqué y está bien (auditoría del diff, sin hallazgo)

- **Validación en el servidor:** el modo edición reutiliza `validarRegistro` tal
  cual, con las mismas cotas de longitud y los mismos literales. Un campo de
  100 KB rebota **y el eco vuelve recortado** (sin amplificación). Hay test.
- **Inyección:** cero SQL crudo con entrada de usuario en todo el diff; todo va
  por Prisma con parámetros. El único `dangerouslySetInnerHTML` del repo es el
  JSON-LD de la ficha, y **escapa el `<`**, así que un `</script>` metido por la
  edición no cierra la etiqueta: lo probé aplicando una edición con
  `</script><img src=x onerror=…>` en el nombre y comprobando que el único
  `</script>` literal del HTML es el cierre real. Hay test.
- **URLs externas:** `facebookUrl` solo acepta `http(s)` y sin credenciales
  incrustadas, también por el camino de la edición (`javascript:`, `data:`,
  `vbscript:`, `file:`, `//host` y `https://facebook.com@evil.example`
  rechazados). Hay test.
- **Mass assignment / IDOR:** un envío con los 16 campos prohibidos, más `id`,
  `negocioId` de otra ficha, `estado`, `creadaEn`, `resueltaEn`,
  `motivoDescarte` y `consentimiento` se guarda **atado al negocio del token**,
  `pendiente`, con la fecha del servidor y sin motivo; la otra ficha no recibe
  nada y la propia no se mueve. Hay test.
- **El token:** 18 formas hostiles del segmento (vacío, ±1 carácter, salto de
  línea pegado —`$` de JavaScript no lo perdona—, byte nulo, barra, `+/=`,
  ancho completo, emoji, 100 KB, travesía de directorios) **no llegan ni a
  consultar la base**, y por eso un `%00` en `/editar/…` sigue siendo un 404 y
  no un 500. Lo que viaja a la base es la huella, nunca el token. El token
  vigente con una letra en otra caja, con `-`→`_` o invertido deja de abrir. La
  huella no sirve como token. Una fila con la huella en blanco no abre con nada
  (aunque `timingSafeEqual("","")` sea `true`, la resolución corta antes). Las
  huellas de distinta longitud se comparan sin lanzar. Hay tests de todo.
- **Transiciones ilegales:** aplicar una edición ya descartada no toca la ficha
  ni pisa el motivo; descartar una ya aplicada no deshace nada; dos
  regeneraciones simultáneas dejan **exactamente un** enlace vivo y matan al
  original; regenerar sobre una ficha rechazada no escribe nada. Hay tests.
- **Motivo de descarte:** se cuenta por puntos de código (300 emojis caben,
  600 unidades UTF-16 no lo duplican) y un motivo de solo espacios y bytes nulos
  no descarta nada. Hay tests.
- **Autorización:** las cinco pantallas nuevas del panel (`/admin/ediciones/<id>`
  y sus dos confirmaciones, `regenerar-enlace` y su `/listo`) y sus tres
  acciones llaman a `requerirSesionAdmin()` **antes** de tocar datos (ahora
  también vigilado por el guardián, ver BAJO 2). El detalle de una edición no devuelve la huella, ni
  el token, ni `consintioAviso`, ni `publicadoEn`. Hay tests.
- **Datos personales:** ni un dato real en el diff. El seed no cambió; las
  suites nuevas usan series ficticias declaradas (771000 6xxx/7xxx del dev,
  771000 8xxx la mía); `WHATSAPP_ADMIN` no tiene valor en `.env.example` y no
  hay respaldo hardcodeado en el código.
- **Secretos y configuración:** cero secretos en el diff; `WHATSAPP_ADMIN`
  documentada en `.env.example` **y** en `docs/despliegue.md` §3.2 con su
  fail-safe, que es lo que el guardián de despliegue exige.
- **Migración:** el `DROP COLUMN` no pierde datos (la columna estaba nula en
  todas las filas), el CHECK de `estado` y el índice único parcial están
  escritos a mano con su advertencia, las tres claves foráneas tienen la
  cascada/restricción que corresponde y el borrado ARCO se lleva las ediciones.
  Los tests del dev en `modelo-migraciones` lo ejercitan contra el catálogo real.

## Tests adversariales añadidos

`tests/gestion-seguridad-adversarial.test.ts` — **80 tests, todos en verde** al
cierre de la vuelta 2 (en la vuelta 1 eran 69: 67 verdes y 2 rojos a propósito).

| Bloque | Qué ataca | Tests (v1 → v2) |
| --- | --- | --- |
| 1 | El token como segmento de URL hostil, la huella y la comparación | 26 |
| 2 | Mass assignment, URLs hostiles, campos enormes, WhatsApp raro, byte nulo, elusión del cupo por IP | 16 |
| 3 | HTML/`</script>`/XSS que entra por la edición y sale por la ficha pública | 2 |
| 4 | Transiciones ilegales, concurrencia, cotas del motivo · **+ `[M1]` de vuelta, `[M1b]` de un renglón y los dos `[R1]` de la transacción invertida** | 8 → **11** |
| 5 | Identificadores fabricados en las pantallas del panel + no fuga de datos internos | 6 → **8** |
| 6 | El sobre del enlace en claro (opciones de la cookie y suplantación) | 9 |
| 7 | **La cuarta fuga: la analítica** (ALTO 1) · cadena real de layouts + "el que sí mide sigue midiendo" | 2 → **5** |
| 8 | **Nuevo en la vuelta 2:** la política de referente del grupo `(gestion)` | — → **3** |

Los `[M1]`, `[M1b]` y `[M2]` **dejaron de tolerar las dos formas** y ahora fijan
la conducta corregida: son cerrojos de regresión, no descripciones de un
defecto. El único que sigue tolerando es `[B1]`, porque su arreglo vive en el
borde compartido con el registro público y es deuda declarada.

Más `tests/admin-adversarial.test.ts:650-657`: los cuatro accesos a datos nuevos
sumados a `ACCESOS_A_DATOS` (BAJO 2, corregido en la vuelta 1).

## Para el orquestador (iteración 1 — resuelto, se conserva como registro)

1. **Bloquea el pase al validador** hasta que se cierre el **ALTO 1**. Es una
   iteración corta del dev: mover la ruta de edición fuera del grupo medido y
   dejar los dos tests `[A1]` en verde.
2. **Sube al humano el MEDIO 3** (token en el log de acceso): no se cierra sin
   cambiar la spec, y la decisión —asumirlo con la nota operativa de no
   configurar Log Drains, o rediseñar el flujo— es suya, no del pipeline.
3. Los **MEDIO 1 y 1b** piden además un **literal de spec** que hoy no existe
   ("qué le decimos al admin cuando aplica sobre una ficha que ya se bajó").
   Si el humano prefiere no abrir spec ahora, la corrección mínima aceptable es
   que la edición **no** se marque `aplicada` cuando no se aplicó.
4. El **MEDIO 2** y el **BAJO 1** son arreglos de una línea cada uno, en el
   borde, con precedente escrito en el propio repo.

---

# Iteración 2 — reverificación

Vuelta 2 de la etapa C, contra el código de la iteración 2 del dev. **Reverifiqué
por comportamiento, no por reporte:** levanté el sitio (`next dev -p 3910`, base
t014, con las variables de la analítica y del panel puestas y un negocio
ficticio publicado con token conocido) y medí con `curl`; lo que no se puede ver
por HTTP lo reproduje llamando a las funciones de producción.

**Sigo sin tocar código de producción.** En esta vuelta escribí: los cerrojos de
regresión de mi archivo de pruebas, un bloque nuevo (§8) para la superficie que
estrenó la iteración 2, y la enmienda de la LETRA de `design.md` §4 que el
orquestador autorizó (el dev no la había hecho).

## Estado de los hallazgos

| # | Hallazgo | Estado | Cómo lo reverifiqué |
|---|---|---|---|
| ALTO 1 | Token a un tercero por la analítica | **CERRADO** | HTTP: `umami` = 0 en las dos pantallas de edición, y = 1 en home, registro y ficha |
| MEDIO 1 | Edición "aplicada" sin aplicarse | **CERRADO** | `ficha-no-publicada`, edición sigue `pendiente`, y se aplica al republicar |
| MEDIO 1b | Dos renglones en la cola | **CERRADO** | un solo renglón (`alta`), y reaparece como `edicion` al republicar |
| MEDIO 2 | `%00` → 500 en el panel | **CERRADO** | HTTP: 404, el mismo que un id inventado, en ediciones **y** en registros |
| MEDIO 3 | Token en el log de acceso | **RIESGO ASUMIDO, documentado** | `docs/despliegue.md` §8.1 con las dos condiciones operativas — **sube al humano** |
| BAJO 1 | Byte nulo en texto libre | Deuda declarada | sin cambios; el desenlace sigue siendo seguro y el test sigue tolerando las dos formas |
| BAJO 2 | Guardián de la guarda | **CERRADO** (lo corregí yo en la vuelta 1) | sigue en verde |

## 1. El hallazgo propio del dev (§I2.6): `no-referrer` → `strict-origin`

Es un hallazgo real y bien encontrado, y **lo confirmé yo mismo** posteando el
formulario de edición sin JavaScript contra el sitio servido, con los campos
ocultos de la Server Action tal como los sirve el HTML:

| Envío sin JS | Resultado |
|---|---|
| `Origin` correcto (lo que manda el navegador con `strict-origin`) | **303 → `/editar/<token>/gracias`** |
| `Origin: null` (lo que mandaba con `no-referrer`) | **500** |
| sin `Origin` | 303 → `/gracias` |
| `Origin: https://evil.example` | **500** |

Y comprobé el desenlace en la base: la edición **quedó guardada** (`pendiente`,
con el horario nuevo), la ficha **no se movió**, y el segundo envío exitoso
**reemplazó** al primero dejándolo `descartada` sin motivo — el invariante de
"lo último que escribió el dueño es lo que vale", probado sobre HTTP real.

La última fila importa tanto como la primera: **`strict-origin` no aflojó la
protección de origen de las Server Actions**. Un POST desde otro origen sigue
abortando.

### ¿`strict-origin` filtra algo en esta ruta? No.

Lo que hay que ocultar es la **ruta**, porque la ruta *es* el secreto.
`strict-origin` manda el origen pelado y nada más, y no manda nada al bajar de
`https:` a `http:`. Lo verifiqué en el HTML servido: la meta llega
(`<meta name="referrer" content="strict-origin">`, puesta por el layout del
grupo y heredada por las dos pantallas) y **los únicos enlaces de esas páginas
son internos** (`/`, `/aviso-de-privacidad`, `/terminos`, del encabezado y el
pie): cero enlaces externos y **cero `href` que contenga el token**.

Eso cierra la vía que el propio repo ya había documentado en
`src/lib/seguridad/csp.ts:71-78`: al tocar "Lee el aviso de privacidad
completo" se llega a una página **medida**, cuyo tracker reenvía el
`document.referrer`; con la cabecera global del sitio
(`strict-origin-when-cross-origin`, que para el **mismo origen manda la URL
completa**) el token habría viajado hasta el recolector. Con `strict-origin`
viaja el origen. La meta manda sobre la cabecera para ese documento, y el
guardián del panel ya fijaba esa relación.

**Añadí un bloque de tests propio (§8)** que fija el valor y nombra
explícitamente las políticas que **no** valen aquí —`unsafe-url`, `same-origin`,
`strict-origin-when-cross-origin`, `origin-when-cross-origin`,
`no-referrer-when-downgrade` y también `no-referrer`—, que la política viva en
el **layout** y no en cada pantalla, y que ninguna pantalla del modo edición
abra un enlace externo ni repita el token en un `href`.

### La letra de `design.md` §4 — enmendada por mí

El dev **no** la enmendó. La enmendé yo, con el alcance que autorizó el
orquestador (solo la letra): §4 pasa a hablar de **cuatro** fugas, el punto 1
dice `strict-origin` **con el porqué medido**, el punto 3 acota que la regla
cubre el log *de la aplicación* y remite al riesgo asumido de
`docs/despliegue.md` §8.1, y el punto 4 nuevo es la fuga por la medición y su
cierre estructural. Ni una decisión de diseño cambia; ningún scenario cambia.

## 2. Barrido de regresiones sobre el diff de la iteración 2

**La transacción invertida de `aplicarEdicion`.** Escribir la ficha antes de
cerrar la edición abre una ventana nueva, y la revisé caso por caso:

1. *La ficha deja de estar publicada* → la escritura no afecta filas, se sale
   con `ficha-no-publicada` sin haber escrito nada. ✓
2. *El dueño reemplaza la edición dentro de la transacción* → la ficha **ya
   quedó escrita con lo viejo**, y lo único que lo deshace es el centinela
   `EdicionYaNoPendiente`, que hace `throw` para provocar el ROLLBACK. **Esta
   es la ventana que el arreglo estrena, y es la que hay que vigilar**: le puse
   un test dedicado (`[R1]`) que comprueba que la excepción **sale** de la
   función que corre dentro de `$transaction` —sin eso no hay rollback— y que
   el desenlace no es "aplicada". Más un segundo `[R1]` contra la base: una
   edición reemplazada no escribe ni lo viejo ni lo nuevo en la ficha.
3. *Dos "aplicar" simultáneos de la misma edición* → el segundo se bloquea en el
   candado de fila del `UPDATE`; al reanudar, la ficha sigue publicada y la
   escritura se repite (idéntica, idempotente), pero el cierre de la edición ya
   no encuentra `pendiente` → centinela → rollback. No hay doble aplicación ni
   escritura huérfana. ✓
4. *Un `despublicarFicha` concurrente* → queda a la espera del candado de la
   misma fila; se resuelve tras el commit o el rollback, en los dos órdenes con
   desenlace consistente. ✓

**Lo que no cambió y sigue bien:** volví a pasar los 80 tests adversariales
—token, mass assignment, XSS por la ficha, sobre, cupo por IP, autorización— y
todos siguen en verde contra el código nuevo. La deduplicación de la cola no
metió el filtro de `publicado` en un segundo módulo (ver el bloque de la
iteración 2 del MEDIO 1b), así que el guardián de `directorio-consultas` no
necesitó excepciones nuevas.

**Los dos guardianes de analítica que el dev enmendó no se debilitaron** —los
audité línea por línea; el detalle está en el bloque de iteración 2 del ALTO 1.

## 3. Cosas que miré y NO son hallazgo (para que no se vuelvan a mirar)

1. **El 404 de `/editar/<algo>` no lleva el tracker y el de `/loquesea` sí.**
   Parece una diferencia observable entre 404s, pero no es un oráculo de nada
   útil: `/editar/<43 caracteres inválidos>` y `/editar/hola` responden
   **idénticos** (lo comparé neutralizando el propio segmento; lo único que
   difiere son artefactos de `next dev` —una plantilla de error, un nonce por
   petición y los chunks de devtools— que no existen en producción). Lo que la
   spec protege es no poder distinguir "este enlace existió" de "nunca existió",
   y eso se cumple. La diferencia frente a un 404 de otra familia de rutas ya
   existía antes de este change (la 404 de `(publico)` se mide y la de fuera no,
   efecto lateral aceptado y documentado en el layout).
2. **El token viaja en claro en un campo oculto del formulario** (`$ACTION_1:1`)
   cuando se sirve con `next dev`. No añade exposición: es el mismo documento
   cuya URL ya lleva el token, y en producción Next cifra los argumentos ligados
   de una Server Action. Anotado para que nadie lo "descubra" como fuga.
3. **`whatsapp-ocupado` sigue siendo leer-y-después-escribir.** Si otra ficha se
   queda con el número entre la comprobación y el `UPDATE`, el respaldo real es
   el `@unique` de la columna: la escritura lanza, la transacción revierte y la
   edición sigue pendiente. Desenlace seguro; el mensaje sería el genérico en
   vez del específico. Pre-existente y sin severidad.

## Nota para el humano — la letra del requirement del `Referer`

La única discrepancia que queda es de **prosa de spec**, y no la toco yo porque
la spec es un artefacto que aprobó una persona:

- El requirement de `registro-negocio` dice que las pantallas de edición "DEBEN
  declarar que **no se manda `Referer` a ningún destino**".
- La implementación manda el **origen** y nunca la ruta, porque la letra
  literal (`no-referrer`) **rompe el envío sin JavaScript**, que es otro
  requirement aprobado de la misma capacidad. Las dos letras no se pueden
  cumplir a la vez; la intención de ambas, sí.
- **El scenario, que es la parte comprobable, se cumple**: "la petición al
  destino no lleva la URL de edición en el encabezado `Referer`" — no la lleva.

**Propuesta:** al archivar el change, ajustar esa frase a "no se manda la RUTA
en el `Referer`", que es lo que el sistema hace y lo que el scenario ya exige.
Es la misma decisión que la spec del panel tomó con el mismo valor y por el
mismo motivo. Mientras tanto lo dejo declarado aquí: no es un defecto de la
implementación, es una frase que quedó más estricta de lo que su propio
scenario pide.
