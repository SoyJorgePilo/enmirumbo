# Reporte DEV — agregar-despublicar-y-borrado-arco

Etapa B sobre la capa que dejó `a-ui.md`. Las dos Server Actions MOCK se
borraron y se reemplazaron por las reales; los tres campos que la etapa UI
declaró **opcionales** en `consultas.ts` ya se calculan de verdad y dejaron de
ser opcionales. Las 19 tareas de `tasks.md` quedan `[x]` (la 18 es parcial por
diseño: pide ojos humanos — ver "Lo que falta verificar a mano").

Gates: `npm run lint`, `npm run build` y `npm test` en verde. **1098 pruebas,
39 archivos** (antes de esta etapa: 975 en 38 — la etapa UI reportaba 974/975
por el rojo de `layout.test.ts`, que también se arregló aquí).

## Qué se construyó

### Modelo de datos

- `prisma/schema.prisma`: `despublicadoEn DateTime?` y
  `motivoDespublicacion String?` en `Negocio`, con el comentario que explica
  que el rastro **no se limpia en ninguna transición**.
- Migración `prisma/migrations/20260904141721_agregar_rastro_de_despublicacion/`:
  dos `ALTER TABLE "Negocio" ADD COLUMN`, nada más. No redefine ninguna tabla,
  así que los CHECK de `estado` y `origen` sobreviven intactos (hay test que lo
  comprueba ejecutando un `UPDATE` inválido después de migrar).
- **No se agregó ninguna columna de archivo de foto**: `fotoClave` es de T-008,
  que no está mergeado. El punto de integración queda documentado dentro de
  `borrarNegocio` y **exigido por un test**: si algún día el schema estrena
  `fotoClave`/`fotoArchivo`, el test obliga a que `transiciones.ts` los
  nombre (ver "Coordinación de merge").

### Dominio del panel (`src/lib/admin/`)

- `transiciones.ts`:
  - `despublicarFicha(prisma, id, motivo, ahora)` → `despublicada |
    ya-no-publicada | no-encontrado | error:motivo`. Escritura **condicionada**
    (`updateMany` con `estado: publicado` en el `where`), motivo recortado a
    `LIMITE_MOTIVO_DESPUBLICACION` (= `LIMITE_MOTIVO_RECHAZO`, 500).
  - `borrarNegocio(prisma, id)` → `borrado | ya-no-existe`, con `deleteMany`
    (nunca `delete`: una excepción dentro de una Server Action es un 500).
  - `ClienteTransiciones` suma `deleteMany`.
- `consultas.ts`:
  - `entradaALaCola(registradoEn, despublicadoEn)` exportada: el
    `max(...)` del design §3. Manda el texto de espera, el indicador de 48h y
    **también el orden** de la cola (se ordena en memoria porque ese máximo no
    es una columna; son decenas de filas, no miles).
  - `vieneDeDespublicacion`, `despublicadoEn`, `motivoDespublicacion` y
    `girosIds` ya se calculan; los cuatro pasaron de opcionales a obligatorios
    en `RegistroColaItem`/`RegistroAdminDetalle`.

### Rutas y pantallas

- `accion-despublicar.ts` y `accion-borrar.ts` reales (los `*-mock.ts` se
  borraron). Guarda de sesión antes de leer o escribir nada, POST→GET.
- `despublicado/page.tsx`: se eliminó el fallback `?motivoMock=` y el
  parámetro `searchParams`. El motivo sale **siempre** de la fila guardada.
- `borrar/page.tsx` y `page.tsx` (detalle) apuntan a las acciones reales.
- Detalle: aviso `role="status"` con "Esta ficha ya no estaba publicada."
  cuando llega `?avisoDespublicar=ya-no-publicada`.

### Páginas legales

- `PENDIENTES_OPERATIVOS_LEGALES` pierde el renglón de E3-6 (queda un
  comentario que explica por qué y desde qué change). Sigue el de E0-3.
  El texto publicado del aviso y de los términos **no cambió ni un carácter**
  (la suite de legales ya lo verificaba y sigue en verde).

## Mapa scenario → test

### `revision-admin` — despublicar

| Scenario | Test |
| --- | --- |
| despublicar con motivo | `admin-transiciones` › "deja la ficha en revisión con su fecha y su motivo, y fuera del directorio"; `admin-despublicar-borrado` › "con motivo deja la ficha en revisión y lleva a la pantalla de confirmación" |
| despublicar sin motivo | `admin-transiciones` › "con el motivo %s no cambia nada y la ficha sigue publicada"; `admin-despublicar-borrado` › "con el motivo %s vuelve al detalle con el error y sin tocar la base" |
| despublicar algo que ya no estaba publicado | `admin-transiciones` › "sobre un registro %s no guarda nada y avisa que ya no estaba publicada"; `admin-despublicar-borrado` › "sobre una ficha que ya no estaba publicada avisa con el literal de la spec" |
| doble despublicación | `admin-transiciones` › "la segunda despublicación no pisa la fecha ni el motivo de la primera"; `admin-despublicar-borrado` › "la segunda despublicación desde otra pestaña no pisa la primera" |
| despublicar no borra el trabajo hecho | `admin-transiciones` › "conserva giros, colonia, origen, publicadoEn y todo lo que capturó el negocio" + "no toca el motivo ni la fecha de un rechazo anterior" |
| recargar después de despublicar | `admin-despublicar-borrado` › "recargarla no ejecuta ninguna acción: no hay ningún formulario en la pantalla" |

### `revision-admin` — aviso por WhatsApp

| Scenario | Test |
| --- | --- |
| aviso de despublicación | `admin-despublicar-borrado` › "muestra el literal y el wa.me con el mensaje exacto de la spec"; `admin-textos` › "el aviso de despublicación por WhatsApp interpola nombre y motivo" |
| número que no se puede interpretar | `admin-despublicar-borrado` › "con un número que no se normaliza muestra el número tal cual, sin enlace" |
| (adversarial, no en la spec) motivo con `&`, saltos y URL | `admin-adversarial` › "un motivo con &, saltos de línea y URL no altera el wa.me del aviso" |

### `revision-admin` — borrado en dos pasos

| Scenario | Test |
| --- | --- |
| llegar a la confirmación no borra nada | `admin-despublicar-borrado` › "la pantalla de confirmación trae los literales en orden y no borra nada" |
| confirmar con la palabra correcta | `admin-despublicar-borrado` › "con la palabra correcta borra la fila y confirma sin datos del negocio" |
| la palabra no coincide | `admin-despublicar-borrado` › "con %s no borra nada y muestra el error de la spec" (`borra`, vacío, `eliminar`, `BORRA R`, `BORRARLO`) + "sin el campo de confirmación tampoco borra" |
| minúsculas y espacios de sobra | `admin-despublicar-borrado` › "acepta %s: solo se ignoran mayúsculas y espacios sobrantes" (`" borrar "`, `borrar`, `"  BoRrAr  "`) |
| arrepentirse | `admin-despublicar-borrado` › "'Mejor no, regresar' apunta al detalle del mismo registro" |
| ningún GET borra | `admin-despublicar-borrado` › "abrirla y recargarla varias veces deja el registro intacto" |
| la confirmación funciona sin JS y en el celular | **parcial**: `admin-despublicar-borrado` › "la pantalla es un Server Component: ningún archivo nuevo declara el modo cliente" cubre el `"use client"`. Los 390px, el scroll horizontal y el envío real con JS deshabilitado son **verificación humana** (tarea 18) |

### `revision-admin` — el borrado se lleva todo

| Scenario | Test |
| --- | --- |
| borrar un negocio publicado con todo colgando | `admin-transiciones` › "borra un publicado con giros y no deja ni la fila ni sus vínculos" |
| borrar en cualquier estado | `admin-transiciones` › "borra igual un registro %s"; `admin-despublicar-borrado` › "borra igual un registro %s" |
| la ficha borrada responde 404 | `directorio-despublicado` › "desaparece de todas las pantallas y su URL responde el mismo 404" |
| borrar dos veces | `admin-transiciones` › "el segundo borrado no lanza: devuelve que ya no existe"; `admin-despublicar-borrado` › "el segundo envío desde otra pestaña no truena y dice que ya no existe" |
| la confirmación del borrado no filtra nada | `admin-despublicar-borrado` › "ni la URL final ni la pantalla traen nombre, WhatsApp, dirección ni id" + "nada de lo que pasa por las dos acciones aparece en la salida del servidor" |
| la foto también se va | **condicional**: `modelo-despublicacion` › "si el modelo estrena archivos de foto, el borrado tiene que arrastrarlos" (hoy exige el ancla documental de T-008; en cuanto exista la columna, exige el borrado del archivo) |
| (spec) el renglón desaparece de la cola | `admin-despublicar-borrado` › "un registro borrado ya no aparece en la cola" |

### `revision-admin` — sesión obligatoria

| Scenario | Test |
| --- | --- |
| despublicar sin sesión | `admin-despublicar-borrado` › "despublicar sin cookie deja la ficha publicada…"; `admin-adversarial` › "un POST de despublicar sin cookie no baja la ficha ni devuelve nada suyo" |
| borrar sin sesión | `admin-despublicar-borrado` › "borrar sin cookie, con la palabra correcta y todo, deja el registro completo"; `admin-adversarial` › "un POST de borrado sin cookie, con la palabra correcta, no borra nada" |
| la pantalla de confirmación sin sesión | `admin-despublicar-borrado` › "la pantalla de confirmación de %s manda al acceso sin revelar si existe"; `admin-adversarial` › "un GET de la pantalla de confirmación sin cookie no dice si el id existe" |
| ninguna de las dos acciones vive en lo público | `directorio-despublicado` › "ninguna página fuera de /admin importa las transiciones del panel" |
| (invariante ya existente, ampliado) la guarda va antes del primer acceso a datos | `admin-adversarial` › "en cada ruta y acción, `requerirSesionAdmin()` aparece antes del primer acceso a datos" — se sumaron `despublicarFicha(` y `borrarNegocio(` a `ACCESOS_A_DATOS`, y el test **enumera** los archivos de `src/app/admin`, así que los 4 nuevos entraron solos |

### `revision-admin` — detalle por estado

| Scenario | Test (todos en `admin-despublicar-borrado`) |
| --- | --- |
| detalle de una ficha publicada | "una ficha publicada ofrece despublicar y borrar, nunca aprobar ni rechazar" |
| detalle de un registro en revisión | "un registro en revisión ofrece aprobar, rechazar y borrar, nunca despublicar" |
| detalle de un registro rechazado | "un registro rechazado solo ofrece borrar" |
| (orden) acciones destructivas después de los datos | "el control de borrar va después de los datos del registro" |
| decidir con los reportes a la vista | **no automatizable hoy**: la capacidad de reportes (T-011) no existe en esta rama. El detalle tiene el comentario ancla en el lugar exacto (entre datos y acciones) que dejó la etapa UI |

### `revision-admin` — cola, indicador y detalle (MODIFIED)

| Scenario | Test |
| --- | --- |
| una ficha despublicada aparece marcada y con su espera nueva | `admin-consultas` › "una ficha registrada hace meses y despublicada hace 2 horas espera desde la despublicación"; `admin-despublicar-borrado` › "la despublicada trae la etiqueta y no nace atrasada; los renglones normales no cambian" |
| una ficha despublicada y luego reenviada cuenta desde el reenvío | `admin-consultas` › "si después de despublicarla el negocio reenvía, la espera cuenta desde el reenvío" |
| una ficha recién despublicada no nace atrasada | `admin-consultas` › mismo test de "hace 2 horas" (comprueba `atrasado === false` y `contarAtrasados === 0`) |
| registro atrasado / dentro de la meta (sin regresión) | `admin-consultas` › "un registro sin despublicación se comporta exactamente como antes" + los tests ya existentes |
| (orden de la cola con el reloj nuevo) | `admin-consultas` › "el orden de la cola usa el mismo reloj de entrada para todos, sin secciones aparte" |
| detalle de una ficha despublicada | `admin-consultas` › "con rastro devuelve fecha y motivo…"; `admin-despublicar-borrado` › "una ficha despublicada muestra cuándo y por qué se despublicó" |
| detalle de una ficha que nunca se despublicó | `admin-consultas` › "sin rastro, los dos campos llegan nulos"; `admin-despublicar-borrado` › "un registro sin despublicación no pinta esos rótulos" |

### `revision-admin` — aprobar (MODIFIED)

| Scenario | Test |
| --- | --- |
| republicar conserva los giros | `admin-despublicar-borrado` › "tras despublicar, el formulario de aprobar llega con los 3 giros marcados" + "aprobar sin tocar nada conserva los 3 giros y estrena fecha de publicación" |
| (contraste) registro nuevo sin giros | `admin-despublicar-borrado` › "un registro nuevo sigue llegando sin ningún giro marcado" |

### `modelo-datos`

| Scenario | Test (`modelo-despublicacion` salvo nota) |
| --- | --- |
| negocio que nunca se ha despublicado | "un negocio recién creado y publicado trae los dos campos nulos" |
| despublicación con fecha y motivo | "guarda fecha y motivo, y el negocio conserva todos sus demás datos" |
| el rastro refleja la última despublicación | `admin-transiciones` › "republicar y volver a despublicar deja el rastro de la segunda vez" |
| el rastro sobrevive a las demás transiciones | `admin-transiciones` › mismo test + "el rastro sobrevive a un rechazo posterior" |
| migración sobre una base con datos | "se aplica sobre una base con negocios en los tres estados sin perder filas ni CHECKs" + "la migración de este change solo agrega columnas, no redefine ninguna tabla" |
| la fecha de publicación sobrevive a la despublicación | `admin-transiciones` › "conserva giros, colonia, origen, publicadoEn y todo lo que capturó el negocio" |
| republicar actualiza la fecha de publicación | `admin-transiciones` › "republicar y volver a despublicar…"; `admin-despublicar-borrado` › "aprobar sin tocar nada conserva los 3 giros y estrena fecha de publicación" |
| hard delete / con reportes / en cualquier estado / idempotente | `modelo-despublicacion` › "borrar un negocio con giros se lleva sus vínculos…"; `admin-transiciones` › los cuatro tests de borrado (la parte de "con reportes" queda cubierta por el invariante de cascada, porque la tabla de reportes no existe todavía) |
| ninguna relación bloquea el borrado | `modelo-despublicacion` › "ninguna clave foránea hacia Negocio se declara sin ON DELETE CASCADE" |

### `directorio-publico`

| Scenario | Test (todos en `directorio-despublicado`) |
| --- | --- |
| la ficha despublicada sale del directorio en la siguiente petición | "no aparece en la home, el listado, el filtro de colonia ni el buscador" |
| la URL de una ficha despublicada no delata nada | "su URL responde el mismo 404 que un identificador que nunca existió" |
| la ficha borrada tampoco deja rastro | "desaparece de todas las pantallas y su URL responde el mismo 404" |
| la despublicación no se publica | "ninguna pantalla pública muestra la fecha ni el motivo de la despublicación" |
| (control positivo) mientras está publicada sí se ve | "aparece en el listado, en el filtro de colonia, en el buscador y en su ficha" |

### `paginas-legales`

| Scenario | Test (`legales-textos`) |
| --- | --- |
| el pendiente del flujo ARCO ya no aparece | "el flujo ARCO en el panel salió de la lista" |
| la purga sigue pendiente | "la purga de los rechazados a los 90 días sigue declarada, con su ticket" |
| el texto legal no cambia | los tests ya existentes de `legales-paginas` y `legales-adversarial` (70 en verde, sin tocar) |

## Decisiones técnicas

1. **`ya-no-publicada` vuelve al detalle con `?avisoDespublicar=ya-no-publicada`,
   no a `ya-resuelto/`.** La etapa UI dejó la decisión abierta. El literal que
   pide la spec es distinto del de `ya-resuelto` ("Esta ficha ya no estaba
   publicada." vs "Este registro ya lo habías resuelto."), y una pantalla nueva
   solo para decir una frase es superficie de más: el detalle es donde el admin
   necesita ver **en qué estado quedó de verdad** la ficha. Es el mismo patrón
   POST→GET que ya usan `errorAprobar`/`errorRechazar`.

2. **El reloj de la cola también manda el ORDEN, y se calcula en memoria.**
   La spec dice "el orden de la cola sigue siendo el mismo criterio de espera
   para todos, sin secciones aparte"; si la espera cambia y el orden no, la
   cola se contradice a sí misma. `max(registradoEn, despublicadoEn)` no es una
   columna, así que SQLite no puede ordenar por él sin un `ORDER BY` calculado;
   la cola es la lista de pendientes de un solo admin (decenas de filas), así
   que ordenar en JS es la solución más simple que cumple. Si algún día la cola
   creciera a miles, la salida es una columna derivada, no un `raw`.

3. **`vieneDeDespublicacion` es `despublicadoEn > registradoEn`, no
   `despublicadoEn != null`.** Coherente con el reloj: si el negocio reenvió
   después de la despublicación, llegó a la cola por el reenvío y la etiqueta
   mentiría. Sale del mismo dato que decide la espera, así que las dos cosas no
   se pueden desincronizar.

4. **Los cuatro campos del contrato UI dejaron de ser opcionales.** La etapa
   UI los declaró `?` para poder compilar sin implementación. Ahora existen
   siempre, y dejarlos opcionales solo escondería un `undefined` que ya no
   puede pasar. Los `?? []` / `??` de los componentes siguen funcionando.

5. **`LIMITE_MOTIVO_DESPUBLICACION = LIMITE_MOTIVO_RECHAZO`, como alias
   explícito.** La tarea pide "la misma cota". Un alias documenta que la
   igualdad es intencional (los dos motivos viajan dentro de un WhatsApp) sin
   renombrar una constante que ya usa media suite.

6. **El invariante de cascada se prueba contra la BASE, no contra el schema.**
   `PRAGMA foreign_key_list` de todas las tablas es lo que de verdad está
   vigente después de migrar; leer el `.prisma` probaría la intención, no el
   resultado. Cualquier tabla nueva que apunte a `Negocio` sin cascada rompe la
   suite sin que nadie tenga que acordarse de agregarla.

7. **Dos tests preexistentes cambiaron de premisa** (y el cambio está
   comentado en cada uno):
   - `directorio-consultas` › "solo el directorio filtra por estado publicado y
     solo el panel lo escribe": antes exigía que `transiciones.ts` **nunca**
     nombrara `publicado` dentro de un `where`. `despublicarFicha` lo necesita
     por la escritura condicionada. La regla nueva es más precisa: hay
     exactamente **un** `where` con ese estado, es el del `updateMany`, y
     ninguna LECTURA (`findMany`/`findUnique`) del panel se cuelga de él.
   - `layout.test.ts`: además de sumar `"borrar"` y `"despublicado"` a la lista
     blanca (el hallazgo de la etapa UI), su meta-test usaba `.../borrar` como
     ejemplo de ruta inexistente; ahora existe, así que el ejemplo negativo
     pasó a `.../pantalla-inventada` y se agregó la aserción positiva de que
     `/borrar` sí resuelve.

8. **Cero dependencias nuevas.** Nada que instalar.

## Coordinación de merge (importante para quien mergee después)

- **T-008 (foto subida al sitio).** `borrarNegocio` documenta el punto exacto
  donde va el borrado del archivo, y
  `modelo-despublicacion` › "si el modelo estrena archivos de foto…" es un test
  **con dos ramas**: mientras el schema no tenga `fotoClave`/`fotoArchivo`,
  exige que `transiciones.ts` conserve el ancla documental ("T-008"); en cuanto
  esa columna exista, el test empieza a exigir que `transiciones.ts` la nombre.
  Quien mergee T-008 verá el test rojo y sabrá qué hacer.
- **T-011 (reportes).** No hace falta tocar `borrarNegocio`: la cascada es del
  esquema. Basta con declarar la relación `onDelete: Cascade`; si se olvida, el
  test de `PRAGMA foreign_key_list` lo caza. La lista de `_GiroToNegocio.B` del
  test es un `toContain`, no un `toEqual`: no estorba a la relación nueva.
- **Consolidación de `openspec/specs/`**: sigue vigente lo que dice la
  propuesta — el requirement de borrado ARCO de `modelo-datos` se consolida
  como **unión** (fila + giros + reportes + ediciones pendientes + archivos), y
  los dos requirements de sesión y de mobile-first de `revision-admin` deben
  quedar con las cinco acciones.

## Lo que falta verificar a mano (tarea 18)

Verificado por HTTP contra `next dev -p 3400` con una cookie de sesión firmada:
las cuatro pantallas nuevas responden 200 y traen sus literales exactos
(`/admin/registros/<id>` con "¿Por qué la despublicas?" + "Este motivo se le
enviará al negocio por WhatsApp." + "Borrar definitivamente";
`/admin/registros/<id>/borrar` con los cuatro literales de la confirmación;
`/admin/borrado-hecho` con los dos desenlaces).

**No** se pudo reproducir con `curl` el envío de un formulario de Server Action
sin JavaScript: la misma petición contra `rechazarRegistroAccion` —que está en
producción desde T-005 y ya se verificó a mano entonces— tampoco dispara la
acción, así que es el arnés (la codificación de los campos `$ACTION_REF_*` de
Next 16) y no el código. Queda para el PR, con JS deshabilitado en un navegador
real y a 390 / 768 / 1280 px:

1. Enviar el formulario de despublicar y comprobar que aterriza en "Ya la
   despublicaste." con el botón de WhatsApp.
2. Enviar la confirmación del borrado (con `BORRAR` y con `borra`) y comprobar
   los dos desenlaces.
3. La confirmación con un **nombre de negocio largo** (hay `break-words`, pero
   eso lo confirma el ojo).
4. Áreas táctiles ≥44px y contraste AA del bloque "⚠ Acción irreversible"
   (`border-2 border-tinta`, sin color nuevo — decisión de la etapa UI).

## Deuda y propuestas fuera de alcance

1. **Buscador de fichas en el panel** (duda 1 de la propuesta, ya aceptada como
   backlog): hoy, para una solicitud ARCO sin reporte de por medio, el admin
   tiene que copiar el id del final de la URL pública. Funciona, pero desde el
   celular es incómodo de verdad. Es el candidato natural a ticket propio.
2. **Bitácora de acciones del admin**: quién despublicó o borró y cuándo. El
   ticket lo deja fuera y el repo tiene un solo admin, pero es lo único que
   permitiría demostrar ante la autoridad que la solicitud ARCO se atendió en
   plazo. Si el volumen de solicitudes crece, es lo primero que hace falta.
3. **El seed de demostración no trae ninguna ficha despublicada.** La spec no
   lo pide y las pruebas arman su propia fixture, pero un caso realista en
   `prisma/seed-demo.ts` (ficha en la cola con su etiqueta y su reloj) ayudaría
   a revisar la cola a ojo sin tener que despublicar algo a mano. Propuesta,
   no deuda.
4. **Republicar en un clic** (`en_revision → publicado` sin pasar por el
   formulario de aprobar): explícitamente fuera de alcance. Hoy republicar es
   aprobar de nuevo, y con los giros premarcados ya no destruye nada.
6. **`rechazarRegistro` sigue recortando su motivo en silencio** (deuda
   compartida que levanta la etapa C, BAJO 3). Aquí se corrigió solo el de la
   despublicación porque el del rechazo lo fija la spec de T-005 y su test;
   unificarlos es un cambio de una línea más su literal, y conviene hacerlo con
   ticket propio para no cambiar una capacidad ajena por la puerta de atrás.
7. **La despublicada ocupa el WhatsApp del negocio** (design.md §1): si el
   dueño intenta registrarse otra vez ve "Este número ya tiene una ficha
   registrada…". Es el comportamiento correcto y está documentado, pero
   conviene tenerlo presente cuando se escriba el guion de atención por
   WhatsApp.

---

# Iteración 2 — respuesta a la etapa C

Correcciones sobre los hallazgos de `c-seguridad.md` (0 críticos, 0 altos,
2 medios, 4 bajos). **Los 4 primeros se corrigieron; el BAJO 4 queda declarado**
(es deuda de backlog, no defecto del change).

Gates al cierre: `npm run lint` limpio · `npm run build` correcto · `npm test`
**1156 pruebas, 40 archivos** (iteración 1: 1098 en 39; etapa C: 1143 en 40).
La suite adversarial de la etapa C sigue verde, ahora con **46** pruebas: la
única que toqué se partió en dos al arreglar el BAJO 3 (ver abajo).

## MEDIO 1 — El borrado concurrente a mitad de una aprobación ya no es un 500

**Corregido** en `src/lib/admin/transiciones.ts`.

La segunda escritura de `aprobarRegistro` (los giros, que son una relación y no
caben en el `updateMany`) va ahora dentro de un `try/catch` que distingue el
código `P2025` de Prisma —"la operación dependía de un registro que no existe"—
de cualquier otro error:

- **P2025** → `{ resultado: "no-encontrado" }`. Es lo que de verdad pasó: la
  fila desapareció entre las dos escrituras y sus vínculos con giros se fueron
  con ella por cascada, así que no hay nada que reparar. `accion-aprobar.ts` ya
  mapea `no-encontrado` a la vuelta a la cola, así que el admin ve el mensaje
  normal del panel en vez de una pantalla de error.
- **Cualquier otro código** → se vuelve a lanzar. Un `catch` que se tragara todo
  escondería fallas reales de la base, que es peor que el 500 que veníamos a
  quitar.

Descarté la transacción que sugería el reporte: `$transaction` no está en el
tipo estructural `ClienteTransiciones` (que existe para poder probar este módulo
sin Prisma real), y envolver dos escrituras para el único caso en que la
segunda pierde su objeto es más maquinaria de la que el problema pide.

Tests nuevos en `tests/admin-transiciones.test.ts`:

- "responde 'no-encontrado' en vez de lanzar, y la fila no resucita" — un
  cliente que borra la fila entre las dos escrituras. **Falla sin el arreglo**
  (lanzaba `PrismaClientKnownRequestError`).
- "cualquier otro error de la base se sigue propagando, no se silencia" — un
  `P1001` simulado tiene que salir hacia arriba.

Y **actualicé el test de la etapa C** (`… › "un borrado en medio de una
aprobación no resucita la fila"`) para que pase **por la razón correcta**: tenía
un `.catch(() => undefined)` que toleraba las dos formas; ahora llama sin
`catch` y afirma `{ resultado: "no-encontrado" }`. Es la única prueba de esa
suite cuya intención cambié, y el invariante que fijaba (la fila no resucita, ni
sus vínculos) sigue verificándose igual.

## MEDIO 2 — El pendiente legal se acotó en vez de retirarse

**Corregido** en `src/lib/legales/textos.ts`.

El reporte tiene razón: el renglón retirado juntaba **las cuatro letras de
ARCO** con la despublicación y el borrado. Este change vuelve verdad la
cancelación y la oposición; el **acceso** y la **rectificación** siguen
resolviéndose editando SQLite a mano, y el aviso publicado promete las dos
("escríbenos y los quitamos", "rectificarlos si están mal"). Una lista de
pendientes que pierde un pendiente sin resolver es exactamente lo que esa lista
existe para evitar.

`PENDIENTES_OPERATIVOS_LEGALES` queda con dos renglones:

1. **Acceso y rectificación** — "entregarle al negocio una copia de sus datos y
   corregirlos, o quitar un campo de su ficha, cuando lo pida"; el `hoy` dice
   qué se hace a mano **y** qué parte sí quedó resuelta ("Despublicar y borrar
   ya son acciones del panel (T-015)"), para que nadie lo lea de más ni de
   menos. Ticket: **E3-6**, que es el que el backlog ya tiene para el flujo ARCO
   en el panel (queda vivo con su parte pendiente), con la nota de que **E8-2**
   lo resolvería del lado del negocio. No inventé un id de epic nuevo.
2. **Purga de rechazados a los 90 días** — intacto (E0-3).

También corregí el **comentario obsoleto** de la sección "Cómo limitar el uso o
la divulgación de tus datos": ya no dice "mientras E3-6 … no exista", sino qué
renglón de esa lista publicada ya es una acción del panel y cuál sigue siendo
trabajo a mano.

El **texto publicado no cambió ni un carácter** (las suites de `legales-paginas`
y `legales-adversarial` siguen verdes sin tocarlas).

Tests en `tests/legales-textos.test.ts`: reescribí "el flujo ARCO en el panel
salió de la lista" como dos pruebas que dicen la verdad completa —
"despublicar y borrar ya no se declaran como pendientes" (ningún `compromiso`
puede volver a nombrarlos) y "el acceso y la rectificación siguen declarados
como pendientes" (con `hoy` mencionando T-015 y un ticket con formato de epic).

## BAJO 1 — La pantalla de confirmación exige el rastro real

**Corregido** en `src/app/admin/registros/[id]/despublicado/page.tsx`. La guarda
pasó de mirar solo el estado a exigir **despublicación de verdad**: `en_revision`
**y** `despublicadoEn !== null` **y** motivo no vacío. Como `despublicarFicha`
escribe fecha y motivo juntos, exigir los tres no descarta ninguna
despublicación real; lo que descarta es el caso del reporte (un alta nueva) y
también la fila inconsistente que alguien deje tocando la base a mano.

Añadí la tercera condición (motivo no vacío) porque el daño concreto del
hallazgo era el mensaje a medias —"Bajamos del directorio la ficha de «…»: ."—:
la guarda ahora protege justo la precondición del mensaje que se le manda al
negocio, no un proxy de ella.

Tres tests nuevos en `tests/admin-despublicar-borrado.test.ts`: alta que nunca
estuvo publicada, estado sin rastro, y fecha con motivo en blanco. Los tres
redirigen al detalle.

## BAJO 3 — El motivo largo se rechaza, ya no se recorta

**Corregido** en `transiciones.ts`, `textos.ts`, `formulario-despublicar.tsx` y
el detalle.

`despublicarFicha` devuelve ahora `{ resultado: "error", error: "longitud" }` en
vez de recortar. El razonamiento del reporte es el correcto y vale la pena
dejarlo escrito: este texto **no se queda en la base**, viaja dentro del WhatsApp
que el admin le manda al negocio, así que recortarlo en silencio le manda a un
tercero una frase cortada a media palabra.

Detalles de la corrección:

- **La cota se cuenta por puntos de código** (`[...motivo].length`), no por
  unidades UTF-16. Un motivo de emojis no puede valer el doble de lo que se ve
  escrito, y así el borde de la cota nunca cae dentro de un par sustituto.
- **El literal lleva la cota adentro**: `errorMotivoDespublicarLargo(limite)`
  recibe el número, para que texto y regla no se puedan desincronizar. Copy
  propuesto (la spec no trae literal para este caso): *"El motivo no puede pasar
  de 500 caracteres. Recórtalo un poco: así, completo, es como le va a llegar al
  negocio."*
- **`maxLength` en el `<textarea>`**, como los campos del formulario público:
  funciona sin JavaScript y evita que el admin escriba de más y pierda el texto.
  La regla se sigue haciendo cumplir en el servidor; el atributo es cortesía.
- El tipo del error pasó de `"motivo"` a `"motivo" | "longitud"` y el detalle
  **valida el valor que llega por la URL**: un `?errorDespublicar=inventado` ya
  no puede pintar un error que nadie produjo (test incluido).

**Sigue siendo deuda compartida, y a propósito no la toqué:** `rechazarRegistro`
recorta su motivo igual que antes. Ese comportamiento lo fija la spec de T-005 y
su propio test ("recorta un motivo desmedido en vez de guardarlo entero");
cambiarlo aquí sería modificar una capacidad que este change no especifica. Va
como propuesta al backlog (§Deuda, punto 6).

Tests: `admin-transiciones` estrena "un motivo que se pasa de la cota se
rechaza, no se recorta ni se guarda", "justo en la cota sí despublica; un
carácter más, no" y "los espacios de sobra no cuentan para la cota";
`admin-despublicar-borrado` estrena el error en pantalla, el `maxLength` y el
valor inventado en la URL; `admin-adversarial` cambió su prueba de 10 000
caracteres de "se recorta" a "se rechaza y el detalle lo dice"; y
`admin-textos` compara el literal nuevo.

En la suite de la etapa C, "un motivo de puros emojis se recorta sin romper la
escritura" quedó reemplazada por **dos**: la que comprueba que 401 puntos de
código (801 unidades UTF-16) **se guardan enteros** —lo que demuestra que la
cota cuenta lo que se ve— y la que comprueba que 501 emojis se rechazan sin
escribir nada. De ahí que la suite pase de 45 a 46 pruebas.

## BAJO 2 — El disparador del test de la foto ya no adivina nombres

**Corregido**, porque sí se podía anclar a algo menos adivinado, como sugería el
propio reporte. `tests/modelo-despublicacion.test.ts` ya no busca `fotoClave` ni
`fotoArchivo`: extrae del schema **todos los campos que empiezan por `foto`** y
descarta `fotoUrl` (el de hoy, que es una URL externa que el sitio no guarda).
Si T-008 la llama `fotoRuta`, `fotoBlobKey` o como sea, el test exige que
`transiciones.ts` **nombre ese campo exacto**.

Y agregué una prueba del propio disparador ("el disparador de ese test reconoce
una columna de foto con cualquier nombre"), porque un regex que no encuentra
nada se queda verde para siempre sin que nadie lo note — que es justo la forma
en que este hallazgo podía haber pasado desapercibido.

## BAJO 4 — Declarado, no corregido

De acuerdo con el reporte y con la instrucción: la bitácora de acciones del
admin queda **declarada** como deuda con nombre propio (ya estaba en `proposal.md`
y en §Deuda punto 2 de este reporte). Con un solo admin el riesgo es aceptable;
con dos deja de serlo, y sin ella el cumplimiento del plazo de 20 días hábiles
que promete el aviso no es demostrable ante la autoridad. Sumo el matiz que
levanta la etapa C en "Superficies de abuso": la contraseña del panel es la
**única** puerta de una acción irreversible, así que la bitácora y un segundo
factor son el mismo ticket, no dos.

## Lo que tomé de la etapa C sin que fuera un hallazgo

El procedimiento para disparar una Server Action **sin JavaScript** desde
`curl` (copiar `$ACTION_REF_1`, `$ACTION_1:0` y `$ACTION_1:1` del HTML y mandar
`multipart/form-data` con `Origin`) resuelve la salvedad que dejé en la
iteración 1: mi intento fallaba por mandarlo como `x-www-form-urlencoded`. Con
eso, el scenario "la confirmación funciona sin JavaScript" queda verificado por
la etapa C, y de la tarea 18 solo siguen pendientes de ojo humano los tres
anchos, el nombre largo, las áreas táctiles y el contraste AA.

## Nota de acoplamiento (decisión consciente)

`formulario-despublicar.tsx` importa `LIMITE_MOTIVO_DESPUBLICACION` de
`@/lib/admin/transiciones`. Es el único componente que importa ese módulo, y lo
hace **solo por una constante numérica**: `transiciones.ts` no importa Prisma ni
nada con efectos, así que no arrastra servidor al bundle. Lo preferí a duplicar
el número en `textos.ts`, porque tener la cota en un solo lugar es justo lo que
impide que el mensaje y la regla se separen. El invariante de que **ninguna
superficie pública** importe ese módulo sigue probado
(`directorio-despublicado` › "ninguna página fuera de /admin importa las
transiciones del panel", que recorre `src/app` sin `/admin`,
`src/components/directorio` y `src/components/registro`).
