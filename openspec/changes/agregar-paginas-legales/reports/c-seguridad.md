# Reporte seguridad y test — agregar-paginas-legales

Etapa C sobre `reports/a-ui.md` y `reports/b-dev.md`. La superficie de código es
chica (contenido estático + un enlace nuevo en el bloque de consentimiento), así
que la auditoría se concentró donde de verdad hay riesgo en este change: **que el
documento legal afirme algo que el código no hace**. Se auditó el diff completo
(`git diff main` + untracked), el contenido literal contra el PRD §8/§6.3, y las
cuatro superficies (dos páginas, footer, bloque de consentimiento).

## Veredicto (iteración 2 — vigente)

**Limpio, pasa al validador.** El dev cerró en la iteración 2 los tres hallazgos
que quedaban abiertos; los reverifiqué **contra el texto servido**, no contra su
reporte (ver "Iteración 2 · reverificación" al final). No queda ningún hallazgo
crítico, alto ni medio: solo un residual BAJO ya declarado en el código con su
ticket.

| Severidad | Iteración 1 | Iteración 2 (restantes) |
| --- | --- | --- |
| Crítico | 0 | 0 |
| Alto | 1 | 0 |
| Medio | 3 | 0 |
| Bajo | — | 1 (residual de MEDIO-1, declarado y con ticket) |

Veredicto original de la iteración 1: *regresa al dev* (1 ALTO + 3 MEDIO). Los
hallazgos se conservan abajo tal como se levantaron, con su estado de cierre.

## Hallazgos (iteración 1)

### ALTO-1 · El aviso promete una supresión de datos que ni el modelo ni el código sostienen, y contradice a los términos del mismo sitio

**Estado: CERRADO en la iteración 2** (reverificado contra el texto servido).

**Dónde:** `src/lib/legales/textos.ts:218` (aviso, sección "Cómo limitar el uso o
la divulgación de tus datos") frente a `src/lib/legales/textos.ts:372`
(términos, "Reglas para registrar un negocio"). Texto aprobado en
`openspec/changes/agregar-paginas-legales/specs/paginas-legales/spec.md:136` y
`:271`.

El aviso dice: *"Si tu registro **no se publicó**, sus datos se borran a los 90
días."* Los términos, en la misma publicación, dicen: *"Los datos de los
registros **rechazados** se borran a los 90 días."* No son lo mismo: "no
publicado" incluye todo lo que se queda `en_revision`.

Contra el código: el PRD §6.3 y §8 (líneas 84 y 155) limitan la supresión a los
**rechazados**; el único reloj del modelo es `rechazadoEn`
(`prisma/schema.prisma`, comentario: *"es lo que habilitará la purga de
rechazados a los 90 días (E0-3)"*), que es nulo mientras la ficha siga en
revisión. Y `registradoEn` no sirve de sustituto: cada reenvío lo reinicia
(`src/lib/registro/procesar.ts:239`). Hoy, además, **ninguna purga existe**: no
hay ni un `delete` de negocios en `src/`.

**Escenario concreto:** un dueño registra su negocio (nombre, WhatsApp y, si la
escribió, su dirección) un lunes; el admin no llega a resolver la cola y la ficha
se queda `en_revision`. A los 91 días el titular cree —porque el aviso publicado
se lo prometió— que sus datos ya no existen; siguen íntegros en la base, sin
fecha de caducidad posible. El aviso de privacidad es la obligación que el
responsable se autoimpone frente al titular y ante la autoridad: publicar un
plazo de supresión que el sistema no puede cumplir es incumplir el propio aviso
(LFPDPPP), agravado por que el sitio se contradice a sí mismo en `/terminos`.

**Qué toca hacer (dev, no yo):** alinear la viñeta del aviso al alcance real
(*"Si rechazamos tu registro, sus datos se borran a los 90 días"*) o, si se
quiere conservar la promesa amplia, condicionarla al ticket que la implemente.
Cambia contenido aprobado, así que va con enmienda de
`specs/paginas-legales/spec.md:136` y del caso de test correspondiente.
`tests/legales-adversarial.test.ts` deja el hallazgo pinchado con un caso
`CARACTERIZACIÓN` que hay que borrar cuando se corrija.

### MEDIO-1 · Tres promesas operativas publicadas sin ninguna herramienta detrás

**Estado: CERRADO en la iteración 2** en lo que era defecto de texto (ya no se
promete ningún automatismo) y declarado en el código como
`PENDIENTES_OPERATIVOS_LEGALES`; queda un residual BAJO (la purga de rechazados
sigue sin ejecutor hasta E0-3), detallado abajo.

**Dónde:** `src/lib/legales/textos.ts:216-218` ("la bajamos del directorio **de
inmediato**", "eliminamos tu registro de forma definitiva", "se borran a los 90
días") y `:382` ("si el propio negocio nos pide que la bajemos, la bajamos de
inmediato"). El panel solo tiene aprobar y rechazar
(`src/app/admin/registros/[id]/accion-aprobar.ts`, `accion-rechazar.ts`;
`src/lib/admin/transiciones.ts` no expone despublicar ni borrar), a pesar de que
el PRD §8 (línea 155) dice que *"el panel permite el borrado definitivo (no solo
despublicar)"*.

No es falso —quien administra tiene acceso a la base y puede hacerlo a mano—,
pero se publica un compromiso de inmediatez y de plazo (≤20 días hábiles) sin
pantalla, sin bitácora de la atención y sin forma de demostrar el cumplimiento.
La propuesta lo declara fuera de alcance (E3-6, E0-3) y el dev lo anotó como
deuda; lo dejo como hallazgo porque el texto **ya se publica** y la herramienta
no existe: conviene que E3-6/E0-3 tengan ticket antes de que se retire la marca
de borrador, y que el checklist de lanzamiento los liste junto con los
placeholders.

### MEDIO-2 · La enumeración de "qué queda público" no cuadra exactamente con lo que la ficha sirve

**Estado: CERRADO en la iteración 2** (dos párrafos nuevos en el aviso,
contrastados contra `src/lib/enlaces.ts` y la proyección pública).

**Dónde:** `src/lib/legales/textos.ts:171` (la lista se presenta como cerrada:
*"cualquier persona con internet puede verla: …"*) y `:195-200` (*"Con quién
compartimos tus datos: Con nadie… Los únicos terceros son los proveedores que
hacen funcionar el sitio"*), contra la ficha real
(`src/app/negocio/[ficha]/page.tsx:39-100`).

Dos diferencias:

1. **La foto.** `fotoUrl` está en la proyección pública
   (`src/lib/directorio.ts:56-73`) y se pinta como `<img>` en la ficha y en la
   tarjeta (`src/components/directorio/marcador-foto.tsx:19`). Hoy es inofensivo
   —el formulario no captura fotos, la columna llega nula—, pero el aviso no la
   menciona ni en "Qué datos recogemos" ni en "Qué queda público": el día que
   T-008 la capture, el aviso queda desactualizado el mismo día.
2. **El botón "Cómo llegar"**, que arma una búsqueda de Google Maps con la
   dirección + colonia del negocio (`src/lib/enlaces.ts:66-79`). El aviso sí
   avisa que la dirección "se publica tal cual", así que no miente; pero la
   sección "Con quién compartimos" no contempla que la ficha empuje ese dato
   hacia un tercero cuando el vecino toca el botón.

Fix proporcional: una cláusula en la sección "Qué queda público y qué no". El
test nuevo fija el mapa campo público → frase del aviso, así que agregar un campo
a la proyección sin declararlo en el aviso ahora rompe la suite.

### MEDIO-3 · El guardián de "nada inventado" no mira dentro de los corchetes

**Estado: CERRADO en la propia iteración 1**, con test.

**Dónde:** `tests/legales-textos.test.ts:105`: el caso borra todos los
placeholders (`replace(/\[[^\]]+\]/g, "")`) **antes** de buscar correos,
teléfonos, URLs y señales de domicilio. Un dato real escondido dentro del propio
placeholder —`[CORREO ARCO — mientras tanto escríbenos a persona@dominio.mx]`—
pasaba `npm test`, `npm run lint` y `npm run build` sin que nada chillara, en un
repo público y con la LFPDPPP de por medio. Es exactamente el sitio donde alguien
pondría un contacto "provisional".

Sin acción para el dev: lo cierra el caso nuevo "ninguno contiene correo,
teléfono, dominio ni URL dentro de los corchetes", verificado por mutación.

## Scenarios sin test

Revisé los tres deltas (14 requirements / 44 scenarios) contra el mapa
scenario → test de `reports/b-dev.md` y contra las suites: **no hay ningún
scenario automatizable sin test**. Quedan los dos que el propio dev declaró como
humanos y que no son automatizables sin navegador real:

- `paginas-legales` · "se leen en el celular" (390/768/1280 px, tarea 26): lo
  automatizable —44px de área táctil y ausencia de anchos fijos— ya está cubierto.
- `paginas-legales` · "nada de esto necesita conocimiento legal" y "lenguaje
  llano también en los términos": cubiertos por señales objetivas (segunda
  persona, sin latinismos, sin bloques en mayúsculas); la lectura de fondo es del
  humano y de la revisión legal E6-3.

## Tests adversariales añadidos

`tests/legales-adversarial.test.ts` — **18 casos, todos en verde**. Datos de
prueba ficticios; la serie de WhatsApp `7719994xxx` es exclusiva de este archivo y
se borra en el `afterAll`.

| Grupo | Qué muerde |
| --- | --- |
| Placeholders no confundibles con un dato real (3) | Ningún placeholder contiene correo, ≥4 dígitos seguidos, dominio, URL ni señales de domicilio **dentro** de los corchetes (MEDIO-3); cada uno se lee como hueco pendiente (corchetes + MAYÚSCULAS); los siete llegan enteros al HTML servido, sin partirse en el markup. |
| Marca de borrador no removible por accidente (3) | La regla se exige **desde el HTML renderizado**, no desde la lista declarada: si queda un corchete a la vista, la marca tiene que estar en las dos páginas y **antes** del primer `h2`; y `DocumentoLegalView` no acepta ninguna prop que la apague. |
| Enlaces y markup de las cuatro superficies legales (5) | Todo `href` de las dos páginas, del footer y del bloque de consentimiento es interno a `/aviso-de-privacidad` o `/terminos`, sin `target`, `rel`, `download` ni `ping`; ningún `mailto:`, `tel:`, `javascript:`, `data:`, `//host` ni destino externo; los `href` declarados en el módulo se comprueban también en ejecución, no solo por tipos; cero `dangerouslySetInnerHTML` en los seis archivos tocados; `DocumentoLegalView` escapa un documento hostil (`<script>`, `<svg onload>`, `<iframe>`, `</p>` de escape) sin dejar una sola etiqueta abierta. |
| El aviso contra lo que la ficha publica de verdad (4) | Sobre una ficha publicada ficticia con **todos** los campos llenos y la fila sucia a propósito (`rechazadoEn`, `motivoRechazo` y `tokenGestion` sobre una ficha ya publicada): cada campo que `obtenerNegocioPublicado` devuelve está declarado en el aviso con su frase; la proyección pública no puede crecer sin actualizar el aviso (lista de excepciones explícita: `id`, `coloniaSlug`, `fotoUrl`/T-008); nada de "lo que nunca se publica" (fecha de registro, notas internas, motivo del rechazo, constancia, token de gestión, estado, origen) aparece en el HTML servido; y lo que sí se ve es lo que el aviso anunció, incluidos el `wa.me` y el `tel:`. |
| Coherencia entre los dos documentos (3) | El plazo ARCO es 20 días hábiles en el integral y en el simplificado, y no hay ningún otro plazo compitiendo en ninguna de las tres superficies; el simplificado y el integral cuentan la misma historia de publicidad (colonia sí, domicilio no, no vendemos); `CARACTERIZACIÓN` de ALTO-1 (bórralo al corregir el texto). |

**Verificación de que muerden** (mutación + restauración del árbol, comprobada con
`git status`):

| Mutación | Casos que se ponen rojos |
| --- | --- |
| Footer con `href="https://ejemplo.invalid/terminos" target="_blank"` | 2 (enlaces internos, esquemas/destinos externos) |
| `[CORREO ARCO — mientras tanto contacto@ejemplo.mx]` | 1 (dato real dentro del corchete) — y **ninguno** de los del dev |
| `PLACEHOLDERS_LEGALES` vaciada dejando los corchetes en el texto | 2 (marca exigida desde el HTML) |
| `registradoEn` agregado a la proyección pública de la ficha | 2 (campo público sin declarar, proyección crecida) |

## Lo que se auditó y salió limpio

- **Entrada y validación:** el change no agrega ninguna entrada de usuario; las
  dos páginas son estáticas (`○` en el build) y sin formularios. El flujo de
  consentimiento de T-003 no se debilitó: el checkbox sigue exigiendo un valor
  afirmativo (`src/lib/registro/validacion.ts:68`), la constancia
  `consintioAvisoEn` la sigue poniendo el servidor
  (`src/lib/registro/procesar.ts:270`) y se conserva en el reenvío; el literal
  nuevo del aviso simplificado está fijado carácter por carácter en
  `tests/registro-pagina.test.ts`. Los 969 tests pasan.
- **Inyección y XSS:** nada de SQL crudo; ningún `dangerouslySetInnerHTML`;
  ninguna URL externa nueva; el contenido legal es estático y se escapa por React.
- **Datos personales (LFPDPPP):** ningún dato real en el módulo, en las páginas,
  en los tests nuevos ni en el diff (verificado con regex sobre el texto **con** y
  **sin** placeholders). La proyección pública sigue seleccionando campo por campo
  y `tokenGestion` no se lee en ninguna consulta del directorio.
- **Afirmaciones del aviso que sí corresponden al código:** la IP se usa en
  memoria del proceso, con ventana de una hora y sin tocar la base
  (`src/lib/registro/limite-ip.ts`); la única cookie del sitio es la sesión del
  panel, `httpOnly`, con `path=/admin` y comparación en tiempo constante
  (`src/lib/admin/sesion.ts`); no se piden CURP/RFC ni datos bancarios; se guarda
  la fecha del consentimiento; los seis elementos mínimos del PRD §8 están, cada
  uno en su sección; el plazo ARCO ≤20 días hábiles es el del PRD.
- **Autorización:** el change no toca el panel; las páginas legales no enlazan
  `/admin` (lo vigila `tests/layout.test.ts`).
- **Secretos:** ninguna variable de entorno nueva; nada hardcodeado;
  `.env.example` no necesita cambios.
- **Abuso:** el change no agrega superficie de abuso (dos páginas de lectura, sin
  formularios ni acciones). El aviso y los términos sí prohíben por escrito la
  cosecha masiva del directorio sin fricción técnica detrás (E5-5, ya señalado
  por el dev): sin spec, no se implementa aquí.

## Nota menor (sin severidad)

La constancia del consentimiento es solo un timestamp: no registra **qué versión**
del aviso aceptó cada negocio, y este change publica el primer aviso con fecha
placeholder. Cuando E6-3 cambie el texto, las constancias existentes apuntarán a
un documento que ya no existe. Ya está en la propuesta y en la deuda del dev;
merece ticket propio antes del lanzamiento.

## Gates de cierre (iteración 1)

- `npm run lint` — verde.
- `npm test` — verde: **969 tests en 36 archivos** (951 en 35 antes de esta
  etapa; 18 nuevos).
- `npm run build` — verde; `/aviso-de-privacidad` y `/terminos` siguen
  generándose como estáticas (`○`).
- Sin commits: el árbol queda con los mismos archivos que dejó el dev más
  `tests/legales-adversarial.test.ts` y este reporte.

---

# Iteración 2 · reverificación de las correcciones

Reverificado **contra el texto realmente servido** (renderizando
`/aviso-de-privacidad` y `/terminos` a texto plano y leyéndolos), contra el
código que cada afirmación describe y contra la spec enmendada — no contra
`reports/b-dev.md`.

## ALTO-1 — cerrado

Texto servido, sección "Cómo limitar el uso o la divulgación de tus datos":

> Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días.

- Coincide con `/terminos` ("Los datos de los registros rechazados se borran a
  los 90 días") y con el PRD §6.3 (línea 84: *"los datos de registros rechazados
  se eliminan definitivamente a los 90 días"*): los tres documentos dicen lo
  mismo.
- La promesa quedó atada al único reloj que el modelo tiene (`rechazadoEn`); una
  ficha que se queda `en_revision` ya no arrastra una purga imposible.
- La frase vieja ("Si tu registro no se publicó…") no aparece en ninguna de las
  dos páginas. Barrido de plazos sobre el texto servido: solo "90 días"
  (retención) y "20 días hábiles" (ARCO), en ambos documentos.
- La spec lleva la enmienda marcada y visible
  (`specs/paginas-legales/spec.md:38`) y un scenario nuevo, "el plazo de 90 días
  es el de los registros rechazados" (`:45`), con su test.

## MEDIO-1 — cerrado en lo que era defecto de texto; queda residual BAJO

Texto servido, en la misma sección:

> Pide que despubliquemos tu ficha: **en cuanto nos llega tu mensaje** la bajamos
> del directorio, sin trámites ni explicaciones.
> […]
> Todo esto lo atendemos **a mano, cuando tú lo pides: no hay un botón que lo
> haga solo**. Escríbenos por WhatsApp o por correo y te confirmamos que quedó
> hecho en un máximo de 20 días hábiles.

- Ningún automatismo prometido: el titular ya no puede leer que algo ocurre solo.
  El plazo sigue siendo el ≤20 días hábiles del PRD §8.
- `PENDIENTES_OPERATIVOS_LEGALES` (`src/lib/legales/textos.ts:101`) declara los
  dos compromisos manuales con "qué se prometió / cómo se hace hoy / qué ticket
  lo resuelve" (E3-6 y E0-3) y su descripción del estado actual es exacta: el
  panel solo aprueba y rechaza (`src/lib/admin/transiciones.ts`) y ninguna purga
  existe.
- **Verifiqué la decisión de alcance que ratificó el orquestador:** la lista no se
  publica. Ni `E3-6`, ni `E0-3`, ni "backlog", ni "ticket", ni "purga" aparecen en
  el texto servido de ninguna de las dos páginas, y el símbolo no lo importa
  ningún componente (solo `tests/legales-textos.test.ts`). Coincido con el
  criterio: publicar el estado del backlog no le sirve al titular; lo que sí le
  sirve —que nada es automático— quedó en el texto.
- **Residual (BAJO, no bloquea):** la eliminación de los rechazados a los 90 días
  no es "a petición", así que el párrafo de "lo atendemos a mano" no la cubre del
  todo: sigue siendo un compromiso sin ejecutor hasta E0-3. La diferencia con la
  iteración 1 es que ahora está declarado en el código, con ticket, y elevado a
  criterio de lanzamiento junto con los placeholders. Se cierra cuando E0-3 exista
  o cuando alguien lo asuma explícitamente como tarea manual calendarizada.

## MEDIO-2 — cerrado

Texto servido, sección "Qué queda público y qué no", dos párrafos nuevos:

> Esa dirección también alimenta el botón "Cómo llegar" de tu ficha: quien lo
> toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu
> colonia y "Tizayuca, Hidalgo".
> Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual
> que lo demás. Hoy el formulario todavía no pide fotos; el día que las pida,
> aquí te decimos qué se puede publicar en ellas.

- Contrastado con el código, no con el reporte: `construirEnlaceComoLlegar`
  (`src/lib/enlaces.ts:66-79`) arma exactamente `dirección, colonia,
  "Tizayuca, Hidalgo"`, y el botón solo existe si el dueño escribió dirección
  (`src/app/negocio/[ficha]/page.tsx:39`). La redacción desde el visitante ("quien
  lo toca abre…") es correcta y no contradice "Con quién compartimos tus datos:
  con nadie", porque el servidor no transfiere nada.
- La foto: `fotoUrl` sigue en la proyección pública y el formulario sigue sin
  capturarla (`src/lib/registro/validacion.ts`), así que "hoy todavía no pide
  fotos" es cierto; la política queda para T-008, como dice la spec enmendada
  (`specs/paginas-legales/spec.md:64`, scenarios nuevos en `:76` y `:81`).

## Mi test convertido: no se diluyó

El caso `CARACTERIZACIÓN` de ALTO-1 pasó a
`REGRESIÓN (hallazgo ALTO-1, corregido)` en el mismo archivo y la misma posición
(`tests/legales-adversarial.test.ts:469`). Lo revisé línea por línea: **quedó más
estricto que el original**, no más flojo — exige el literal nuevo del aviso, el de
los términos, que la frase vieja no vuelva, que 90 sea el único plazo de retención
en **ambos** documentos, y suma una afirmación que no tenía ("no hay un botón que
lo haga solo", el guardián de MEDIO-1). Los otros 17 casos están intactos; el
único otro cambio es el correcto: `fotoUrl` salió de
`CAMPOS_PUBLICOS_SIN_DECLARAR` y entró a `CAMPO_PUBLICO_DECLARADO` con su frase,
de modo que el mapa "campo de la proyección pública → frase del aviso" ahora solo
excluye `id` y `coloniaSlug`, que no son datos del titular. El archivo sigue
teniendo **18 casos** y ninguno perdió aserciones.

## Verificación de que la enmienda muerde (mutación propia)

Mutación sobre `src/lib/legales/textos.ts` —revertir el literal de ALTO-1, achicar
el párrafo de la foto y cambiar "lo atendemos a mano" por "lo hacemos en
automático"—, con el árbol restaurado y comprobado después: **7 casos rojos en
tres archivos**, incluidos mi regresión adversarial, el mapa de campos públicos,
la comparación literal contra la spec, los dos casos de los scenarios nuevos y el
guardián de "sin automatismos". El texto viejo ya no pasa por ninguna puerta.

## Gates de cierre (iteración 2)

- `npm run lint` — verde.
- `npm test` — verde: **975 tests en 36 archivos** (969 al cerrar la iteración 1;
  +6 casos del dev). `tests/legales-adversarial.test.ts`: 18/18.
- `npm run build` — verde; `/aviso-de-privacidad` y `/terminos` siguen estáticas
  (`○`).
- Sin commits; árbol restaurado tras las mutaciones (verificado con
  `git status --porcelain`).

## Lo que el validador debería mirar

- Tarea 26 (revisión visual humana a 390/768/1280 px) sigue abierta: es el único
  scenario de este change sin cobertura automática.
- Criterio de lanzamiento acumulado: los siete placeholders **y** los dos
  pendientes operativos (E3-6, E0-3) antes de retirar la marca de borrador.
- La constancia por versión del aviso (nota menor de la iteración 1) subió de
  prioridad: el texto legal ya cambió una vez dentro del mismo change y nada
  registra qué versión aceptó cada negocio.
