# Reporte VALIDADOR — `agregar-enlace-de-gestion` (T-014)

Etapa D. Validación **independiente** contra la spec aprobada (cuatro deltas,
114 scenarios), el ticket `docs/tickets/T-014-enlace-de-gestion.md` y el
`design.md`. Los reportes de las etapas A, B y C se leyeron como mapa, **no
como evidencia**: lo que aquí se afirma está medido por mí —contra la base, con
el código de producción, o con los gates corriendo en esta máquina—.

## Veredicto

**APROBADO.** Cero hallazgos bloqueantes. Los siete criterios de aceptación del
ticket se cumplen, ningún scenario quedó sin implementación verificable, no hay
scope creep, y las cuatro compuertas mecánicas están en verde **después** de
mergear `origin/main`.

Sube al humano, sin ser defecto: el **riesgo asumido del token en el log de
acceso de la plataforma** (`docs/despliegue.md` §8.1, con sus dos condiciones
operativas) y la **enmienda de prosa** del requirement del `Referer`, que la
consolidación del `/checkpoint` debe aplicar.

## Gates (ejecutados por mí, post-merge de `origin/main`)

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npx tsc --noEmit` | limpio |
| `npm run build` | correcto — `ƒ /editar/[token]`, `ƒ /editar/[token]/gracias`, `ƒ /admin/ediciones/[id]` (+ `/aplicada`, `/descartada`) y `ƒ /admin/registros/[id]/regenerar-enlace` (+ `/listo`) |
| `npm test` | **104 archivos, 2 915 pasando, 2 saltados, 0 en rojo** |

Base propia del worktree (`npx prisma dev --name t014`, puerto 51223), como
pidió §7 de `b-dev.md`. **Ni siquiera los `[A1]`/`[A2]` intermitentes de
`reportes-seguridad-adversarial` fallaron**, ni antes ni después del merge: la
corrida previa al merge dio 103/103 y 2 904 pasando. El CI de GitHub Actions
sobre `postgres:17` es el que manda y tiene que quedar en verde en el PR — esta
corrida local no lo sustituye.

## Lo que verifiqué por muestreo, no por reporte

Escribí un guion desechable que ejercita **las funciones de producción** contra
la base t014 y recorre el flujo entero (aprobar → abrir el enlace → mandar
cambios → cola → aplicar → doble aplicación → regenerar → borrado ARCO). Todo
lo de abajo es su salida, no una cita de otro reporte:

1. **El token y su huella.** Aprobar devuelve un token de 43 caracteres
   base64url (256 bits); la fila guarda exactamente `SHA-256(token)` y el token
   en claro **no aparece en ninguna columna** (comparado contra el JSON de la
   fila completa). Un token alterado en un carácter no resuelve.
2. **Aprobar dos veces.** La segunda aprobación responde `ya-resuelto` y la
   huella queda **idéntica**: el enlace que el admin ya mandó sigue siendo el
   válido.
3. **Enviar cambios no toca la ficha.** Tras un envío válido —con
   `estado=publicado`, `origen=siembra`, `publicadoEn`, `consintioAvisoEn`,
   `tokenGestionHash` y un `negocioId` ajeno metidos a mano en el `FormData`—
   la fila del negocio quedó **byte por byte igual** (comparación del JSON
   antes/después) y la edición se guardó atada al negocio del token.
4. **Las columnas de la edición** son exactamente las once editables más su
   ciclo de vida (`id, negocioId, estado, creadaEn, resueltaEn,
   motivoDescarte`): ninguna de estado del negocio, origen, giros,
   `publicadoEn`, consentimiento ni huella. Leído del catálogo, no del modelo.
5. **La cola.** Un negocio publicado con edición pendiente ocupa **un solo
   renglón**, de tipo `edicion` y apuntando a `/admin/ediciones/<id>`.
6. **Aplicar.** Copia los campos editables, **recalcula el texto normalizado
   del buscador**, y deja idénticos estado, origen, `publicadoEn`,
   `consintioAvisoEn`, la huella del enlace y los giros. La segunda aplicación
   responde `ya-resuelta`.
7. **Regenerar.** El token anterior deja de resolver, el nuevo abre la misma
   ficha y los dos son distintos.
8. **Borrado ARCO.** Borrar el negocio se lleva sus ediciones (0 filas).
9. **La base, por catálogo** (`pg_indexes` / `pg_constraint`): existe
   `EdicionPendiente_una_pendiente_por_negocio ... WHERE (estado =
   'pendiente')`, el `CHECK` de los tres estados, `negocioId` en **CASCADE**,
   `categoriaId` en RESTRICT y `coloniaId` en SET NULL; en `Negocio` solo
   quedan `tokenGestionHash` y `tokenGestionCreadoEn` — de `tokenGestion` en
   claro, nada.

Además, por lectura del árbol (no del reporte):

- **`tokenGestionHash` no aparece en ninguna línea de `src/app`,
  `src/components` ni `src/lib` fuera de `src/lib/gestion/`**: el panel genera
  enlaces sin poder leerlos.
- **Ninguna superficie pública enlaza a `/editar/`** (la única aparición fuera
  del grupo `(gestion)` y de `lib/gestion` es un comentario).
- **`<ScriptAnalitica />` se monta en un solo archivo**, `src/app/(publico)/layout.tsx`;
  el layout de `(gestion)` solo lo nombra en su comentario. La exclusión del
  modo edición es estructural, como la del panel.
- **Cero `any`** en el código nuevo, **cero `"use client"` nuevos** (los dos
  del repo siguen siendo `boton-enviar` y `formulario-registro`), **cero
  dependencias nuevas** (`package.json` y `package-lock.json` sin diff).
- **Cero datos personales reales**: los números de fixtures son series
  ficticias (`77100…`, `77177…`), `WHATSAPP_ADMIN` no tiene valor en
  `.env.example` y el código no le pone respaldo.
- **Responsivo del panel (parte estática de la tarea 32):** la comparación es
  `grid-cols-1` y solo pasa a dos columnas en `sm:`; los tres controles nuevos
  usan el botón secundario compartido a ancho completo y el `textarea` lleva
  `py-3`. No hay anchos fijos, `min-w-` ni `whitespace-nowrap` en las pantallas
  nuevas. La inspección visual a 390px/1280px del panel sigue siendo del humano
  del PR, como la propia tarea 32 previó.

## Spec: los 114 scenarios tienen implementación verificable

Recorrí los cuatro deltas requirement por requirement. Ninguno quedó sin
código; los literales de `src/lib/gestion/textos.ts` y de la sección nueva de
`src/lib/admin/textos.ts` los comparé carácter por carácter contra la spec
(33 literales, incluidas las cuatro plantillas de WhatsApp y sus
interpolaciones). Dos observaciones sobre **cómo** se cumplen dos scenarios, ya
declaradas por las etapas previas y que ratifico:

1. *"el enlace se muestra una sola vez"* se sostiene por **caducidad del sobre**
   (cookie `httpOnly`, `Path=/admin`, 120 s, atada al `negocioId`), no por
   borrado: Next no permite borrar una cookie al renderizar. Dentro de esa
   ventana, recargar la confirmación se lo vuelve a mostrar **al mismo admin
   que acaba de generarlo**. Riesgo residual nulo; el detalle nunca lo muestra.
2. *"el token no aparece en el log"* se cumple **para nuestro código** (lo
   comprobé: los `console.*` de `src/lib/gestion/` escriben tipo de evento o
   `código Pxxxx`, y `token.ts` no llama a `console` en ninguna rama). El log
   de acceso de la plataforma es el riesgo asumido de §8.1.

## Desviaciones deliberadas, evaluadas y aceptadas

1. **Deduplicación de la cola** (etapa C, MEDIO 1b). Una edición no abre
   renglón si su negocio ya está en la cola por sí mismo. La letra del
   requirement dice "los `en_revision` y las ediciones pendientes"; el mismo
   requirement exige "aparece en la cola una sola vez". La deduplicación
   sostiene el invariante y evita empujar al admin a un callejón donde aplicar
   no se puede. **Se implementó sin nombrar ningún estado** —cruza contra las
   altas ya leídas—, así que el filtro de visibilidad del directorio sigue
   viviendo en un solo módulo y su guardián no necesitó excepciones. Lo
   verifiqué en el código, que es donde estaba el riesgo.
2. **`referrer: strict-origin` en vez de `no-referrer`.** La letra literal del
   requirement rompe otro requirement aprobado de la misma capacidad ("la
   edición funciona sin JavaScript"): con `no-referrer` el navegador manda
   `Origin: null` en los POST de navegación y Next aborta la Server Action. El
   scenario comprobable —"la petición al destino no lleva la URL de edición en
   el `Referer`"— se cumple: `strict-origin` manda el origen pelado, nunca la
   ruta. **Aprobado por el orquestador con delegación del fundador**, con dos
   consecuencias que anoto para el `/checkpoint`:
   - al consolidar `openspec/specs/registro-negocio`, la frase pasa a decir
     **"no se manda la RUTA en el `Referer`"**; no la reescribo yo, porque la
     spec consolidada se toca en la consolidación, no en la validación;
   - `design.md` §4 ya quedó enmendado por la etapa C con el mismo alcance
     (solo la letra), y así entra al archivo del change.
3. **Tres literales de copy propuesto sin literal en la spec**
   (`MENSAJE_EDICION_FICHA_NO_PUBLICADA`, `MENSAJE_ERROR_AL_RESOLVER_EDICION`,
   `textoTieneEnlaceGestion`) y la cota de 500 caracteres del motivo del
   descarte, reusando el literal de la despublicación. Los tres cubren huecos
   que la spec no previó y que la etapa C pidió explícitamente. Español
   mexicano, coherentes con el resto del panel.
4. **Tarea 32 marcada `[~]`**, no `[x]`. Es la única que no está cerrada, y su
   propio enunciado lo contempla ("lo que no se pueda comprobar
   automáticamente queda anotado para el humano del PR"). La parte
   automatizable está en el guardián responsivo; la parte estática del panel la
   revisé yo (arriba); el ojo humano va en el PR. **No bloquea.**

## Alcance: nada de más

El diff toca 51 archivos de código y pruebas, y **todo** responde a un
requirement o a un hallazgo de la etapa C. Reviso los tres candidatos obvios a
scope creep y los descarto:

- **`obtenerRegistroParaPanel` filtra el byte nulo** (deuda anterior al change).
  Es una línea, en el mismo borde y con el mismo comentario que el arreglo que
  sí pedía el hallazgo MEDIO 2. Cerrar una de las dos puertas y dejar la otra
  abierta habría sido peor. Aceptado.
- **`BotonEnviar` estrena `texto?`** con el valor por defecto de siempre: es lo
  que exige "mismo formulario, sin lógica aparte".
- **Los guardianes enmendados** (`admin-adversarial`, `directorio-consultas`,
  `buscador-*`, `layout`, `analitica-*`) cambian porque el change cambia lo que
  vigilaban. Los revisé uno por uno buscando **aflojamiento**: ninguno lo está.
  El de `admin-adversarial` es más estricto que antes (prohíbe
  `tokenGestionHash` en tres árboles y exige que los dos archivos de la lista
  blanca de verdad nombren la fecha); el de `analitica-adversarial` cambió una
  frontera por una lista de raíces excluidas **con un test que comprueba que
  cada excepción sigue viva**.

Y no se implementó nada de lo que la propuesta declaró fuera: sin expiración de
enlaces, sin edición de foto, sin historial navegable, sin ARCO por
autoservicio, sin despublicar desde el enlace, sin notificación automática.

## Seguridad (etapa C re-verificada, no aceptada por reporte)

El reporte `c-seguridad.md` cierra con 0 críticos, 0 altos y 0 medios abiertos.
Re-verifiqué lo que se puede re-verificar sin volver a montar el sitio:

- **ALTO 1 (analítica):** la ruta vive en `(gestion)`, cuyo layout no monta el
  script, y el script se monta desde un único archivo. Comprobado en el árbol.
- **MEDIO 1 (edición "aplicada" sin aplicarse):** leí la transacción invertida
  línea por línea y probé el desenlace: se escribe la ficha condicionada a
  `publicado` y la edición **solo** se cierra si esa escritura afectó una fila;
  si deja de ser la pendiente dentro de la transacción, el centinela
  `EdicionYaNoPendiente` **lanza** para forzar el ROLLBACK. Ese `throw` es
  correcto y es lo único que impide dejar la ficha escrita con una edición sin
  cerrar: si alguien lo convierte en un `return`, vuelve el defecto.
- **MEDIO 1b y MEDIO 2:** verificados arriba (cola y byte nulo).
- **MEDIO 3 (token en el log de acceso):** no es cerrable en código sin cambiar
  la spec. Documentado en `docs/despliegue.md` §8.1 con sus dos condiciones
  —sin Log Drains, acceso a Vercel limitado al admin con 2FA— y como deuda 9 en
  §10. **Es una decisión del humano al mergear**, y la §8.1 la da por tomada
  ("decisión del fundador"): si el humano no la ratifica, esa sección hay que
  reescribirla.
- **BAJO 1 (byte nulo en texto libre del envío público):** deuda declarada, con
  desenlace seguro y test que tolera las dos formas. De acuerdo en no tocar el
  borde compartido con el registro dentro de este change.

## Nota de proceso: el desliz declarado del dev

`b-dev.md` §8 declara un `git stash` / `git stash pop` durante la investigación
de la intermitencia de PGlite. **Lo evalué y no lo sanciono.** Lo verifiqué:
no hay commits del dev en la rama (el árbol llegó a mí sin commitear, como
manda el proceso), el contenido de
`src/components/registro/formulario-registro.tsx` conserva tanto `borde-control`
del lote visual como las props `modo`/`accion`/`textoBoton`, y el árbol pasó
los gates completos antes y después del merge. Lo relevante es que **lo
declaró**: una regla que solo se cumple cuando nadie mira no es una regla. Lo
correcto la próxima vez es pedirle al orquestador una copia del árbol base, o
comparar contra `git worktree add` en otro directorio, sin tocar el índice.

## Para el `/checkpoint` (consolidación y devlog)

1. Ajustar la prosa del requirement "Un token que no es exactamente el vigente
   no abre nada ni delata nada" a **"no se manda la RUTA en el `Referer`"**.
2. Al implementar `renombrar-sitio-enmirumbo`, acordarse de los **siete
   literales nuevos** que dicen "NecesitoUno Tizayuca" (cuatro plantillas de
   WhatsApp del panel, el mensaje de "Perdí mi enlace" y los de aplicar y
   descartar).
3. Backlog: **`EdicionPendiente` crece sin poda** y guarda datos personales
   —retención sin plazo declarado (LFPDPPP)—; va junto a la purga de
   rechazados de los 90 días.
4. Backlog menor: el caso residual `publicado → en_revision → rechazado` con
   edición pendiente (renglón que reaparece y responde el literal honesto), y
   el `sinBytesNulos` en `leerEnvioRegistro` (BAJO 1).
5. Cuando T-008 (foto) mergee, sumar la foto al modo edición.
