# ADR-009 · Revisión del pipeline tras las primeras corridas registradas

**Fecha:** 2026-09-04 · **Estado:** propuesta — ejecuta las dos revisiones pendientes que el propio proceso exige (`docs/proceso.md` §Medición "cada ~5 corridas" y §5 criterio de salida del experimento UI-first)

## Contexto y problema

`docs/proceso.md` v0.4 dejó dos deudas de gobernanza del propio pipeline: (1) la etapa A (UI-first con mocks) está marcada ⚗️ experimento con criterio de salida explícito — *"si reemplazar los mocks generó retrabajo significativo, la etapa A se fusiona dentro del dev"* — y nadie lo ha evaluado; (2) §Medición manda revisar cada ~5 corridas si alguna etapa no paga su costo, y ya pasamos ese umbral sin revisión. Además, las corridas en paralelo (T-005∥T-006 y T-007∥T-008∥T-009) produjeron un patrón de coordinación entre validadores que hoy solo vive en reportes y devlogs, no como práctica escrita.

**Nota de conteo:** la bitácora `docs/metricas-pipeline.md` registra **10 corridas** (9 de `/implementar` + 1 de `/rapido`), PRs #2 a #11, entre 2026-09-03 y 2026-09-04. Ese es el universo de este análisis; no hay más filas registradas. La columna "Post-merge" está vacía en todas las filas (ver §Evaluación, pregunta 4).

## Datos duros

Toda cifra sale de `docs/metricas-pipeline.md` (una fila por corrida) o del reporte citado en `openspec/changes/archive/<id>/reports/`. Donde un dato no existe en los registros, se dice.

### Panorama por corrida

| Corrida | Ruta | Etapa A | Iter. dev↔seg | Etapa C: hallazgos (según la fila y `c-seguridad.md`) | Validador: bloqueantes | 1a pasada |
|---|---|---|---|---|---|---|
| agregar-modelo-datos | completa | no (sin UI) | 0 | 0 | 0 (1 editorial) | sí |
| agregar-layout-base | completa | sí | 0 | 0 críticos/altos (1 medio operativo M-1, atendido) | 0 | sí |
| deuda-post-merge | `/rapido` | — | — | — | 1 alto (`.env.example` ignorado por `.gitignore`) | **no** |
| agregar-formulario-registro | completa | sí | 1 | 1 alto + 6 medios | 0 (3 notas) | sí |
| agregar-directorio-publico | completa | sí | 1 | 2 medios | 0 (1 decisión de producto + 5 notas) | sí |
| agregar-panel-admin | completa | sí | 1 | 1 alto + 4 medios (+5 bajos documentados) | 0 (1 corrección editorial) | sí |
| agregar-buscador | completa | sí | 2 | 4 medios + 2 bajos (1a pasada) | 0 (1 desviación de spec informativa D-1) | sí |
| agregar-paginas-legales | completa | sí | 1 | 1 alto + 3 medios | 0 (1 bajo residual al PR) | sí |
| agregar-seo-local | completa | no (UI reutilizada, verificado por C) | 1 | 4 medios (+5 bajos) | 0 (1 editorial + 1 recomendación de C declinada con medición) | sí |
| agregar-foto-negocio | completa | sí | 3 | 1 alto (A-1, DoS) + 6 medios (+3 bajos) | **1 bloqueante NO del código** (colisión de specs; PR en borrador) | **no** |

### Agregados

- **Iteraciones dev↔seguridad:** 10 en 9 corridas de `/implementar` (0, 0, 1, 1, 1, 2, 1, 1, 3). Mediana 1; máximo 3 — exactamente el tope que fija `docs/proceso.md` §Harness, alcanzado una vez (foto).
- **Etapa C:** 0 críticos en todas; **altos en 4 de 9 corridas** (formulario, panel, legales, foto — 1 cada una); **29 medios** en 7 corridas (6+2+4+4+3+4+6). Los bajos se documentan en los reportes pero la bitácora no los registra con conteo homogéneo por fila (no se puede sumar sin inventar).
- **Validador:** 10 veredictos; 2 sin primera pasada limpia. Ninguno de los dos por algo que el CI atraparía (ver pregunta 2).
- **Veredicto de primera pasada:** 8/10 "sí".
- **Post-merge:** 0 datos — 9 celdas vacías y 1 "—" (layout-base). **No se registró** en ninguna corrida.

### Retrabajo real por reemplazar los mocks de la etapa A (los b-dev, corrida por corrida)

| Corrida | Qué costó el reemplazo | Fuente |
|---|---|---|
| layout-base | **"Cero correcciones necesarias."** La etapa A entregó el change entero (interfaz estática pura); el dev solo re-verificó los 13 scenarios | `reports/b-dev.md` §"Correcciones realizadas" y §"Alcance de esta etapa" |
| formulario-registro | Mock eliminado entero; su contenido se repartió en módulos definitivos ("Nada del árbol conserva la palabra 'mock'"). Dos toques a la capa UI: corregir `ORDEN_CAMPOS_PARA_FOCO` (bug de orden del foco que dejó la etapa A) y agregar la prop opcional `estadoInicial` — "el único cambio de API que pedí a la capa de UI" | `reports/b-dev.md`, "Decisiones técnicas" 9, 10 y 12; "Archivos eliminados" |
| directorio-publico | Mock eliminado; `hrefWhatsapp` pasó a `string \| null` en los dos componentes de a-ui (props nulables); el copy heredado se conservó tal cual | `reports/b-dev.md` líneas 3 y 21, decisión 4, nota 1 |
| panel-admin | Los 4 mocks de acción + `src/lib/mock/` borrados y sustituidos por acciones reales; el pendiente #5 del reporte de UI se cerró solo (las rutas salen dinámicas por `cookies()`); el copy de la etapa UI se conservó (deuda 6) | `reports/b-dev.md` §"Rutas y acciones", líneas 22-30 y deuda 6 |
| buscador | a-ui dejó un **contrato de reemplazo explícito** (qué borrar, qué imports renombrar, qué no reutilizar); el dev lo ejecutó tal cual: "El resto de la página […] no debería necesitar cambios" — y no los necesitó | `reports/a-ui.md` §"src/lib/mock/agregar-buscador.ts (a borrar…)" líneas 19-44; `reports/b-dev.md` §"Borrados" línea 28 |
| paginas-legales | Sin mocks que reemplazar: a-ui editó módulos reales (`textos.ts`) | `reports/a-ui.md` línea 13 |
| foto-negocio | Mock borrado (generaba `data:`, justo lo que el validador de render rechaza); una corrección a la tarea 19 de a-ui: la ficha sin foto ya no pinta el marcador (el scenario lo prohíbe) | `reports/b-dev.md` decisiones 5 y 10 |

**Total del experimento:** en 7 corridas con etapa A, el reemplazo costó **0 correcciones en 4** y correcciones puntuales en 3 (1 bug de orden de foco, props a nulables, 1 marcador de foto + 1 prop de API pedida a propósito). Ningún componente se rehizo, ningún copy se tiró, ningún mock "contaminó" la lógica.

## Evaluación de las preguntas de §Medición

**1. ¿La etapa C encuentra cosas?** Sí, y de las caras: **4 altos en 4 corridas distintas** (44% de las corridas de `/implementar`), todos explotables y ninguno detectable por CI — la llave de cupo elegida por el atacante vía `x-forwarded-for` (formulario), el alto del panel, el ALTO-1 de legales y el DoS de descompresión con una imagen válida de 123 KB/39 MP (foto, `archive/agregar-foto-negocio/reports/c-seguridad.md` §A-1, cerrado con reproducción independiente del ataque). Más 29 medios. Y su independencia funciona en los dos sentidos: en seo-local el validador **declinó** una recomendación de C con medición propia (NFKC, `reports/d-validacion.md` líneas 76-80). La etapa C se queda separada; la pregunta queda respondida y sale de la lista de vigilancia.

**2. ¿El validador rechaza por cosas que el CI atraparía?** **No — 0 casos en 10 corridas.** Los dos veredictos sin primera pasada fueron: `.env.example` ignorado por `.gitignore` (el CI no versiona esa expectativa) y la colisión de specs del aviso de privacidad (la suite estaba en verde, 1548/1548 — solo el juicio la atrapó: `archive/agregar-foto-negocio/reports/d-validacion.md` §1). Sus demás hallazgos son editoriales, de spec o de privacidad. Matiz honesto: sus gates locales (lint/build/test) duplican al CI y nunca fueron la razón de un rechazo — pero en seo-local, correrlos sobre el árbol **ya fusionado con main** atrapó 2 pruebas rotas antes de abrir el PR (`reports/d-validacion.md` §8), que el CI habría detectado más tarde y sin el arreglo semántico correcto. No se recorta el checklist.

**3. ¿La etapa A generó retrabajo al reemplazar mocks?** **No.** El criterio de salida del experimento ("retrabajo significativo") no se cumplió en ninguna de las 7 corridas (tabla anterior). Lo que hizo barato el reemplazo es identificable: el **contrato de reemplazo** en `a-ui.md` (formas de datos esperadas + lista explícita de qué borrar y qué renombrar), ejemplar en el buscador. Y la etapa demostró saber ausentarse: 2 de 9 corridas la saltaron con justificación registrada (modelo-datos sin UI; seo-local con reutilización verificada por la etapa C, fila de `docs/metricas-pipeline.md`).

**4. ¿"Post-merge" crece?** **No se registró** — la columna está vacía en las 10 filas. Es la métrica que ADR-002 declaró central ("el pipeline se mide por retrabajo") y es la única que no se está capturando. No hay evidencia de retrabajo post-merge, pero tampoco de su ausencia.

## Opciones consideradas (etapa A, la decisión con criterio de salida pendiente)

### Opción 1 — Fusionar la etapa A dentro del dev (ejecutar la salida del experimento)
Pros: una etapa menos, un handoff menos; es el patrón dominante del estado del arte (ADR-002). Contras: **los datos no lo piden** — el costo que la salida presupone (retrabajo por mocks) midió ~0 en 7 corridas; se pierde la separación que produjo copy y estados completos antes de la lógica, y se pierde la asignación `sonnet` más barata del pipeline recargando todo en el `dev` opus (ADR-008 §Cuándo revisarla anticipa reabrir el balance si esto pasa).

### Opción 2 — Mantener la etapa A como experimento indefinido
Pros: ninguno real. Contras: deja el ⚗️ sin veredicto para siempre; el proceso pierde credibilidad si sus propios criterios de salida no se ejecutan ni en un sentido ni en otro.

### Opción 3 — Cerrar el experimento: etapa A permanente, con su contrato de reemplazo como requisito
Pros: es lo que la evidencia sostiene; formaliza la causa identificable del éxito (el contrato de reemplazo del a-ui) para que no dependa de la buena costumbre; conserva la regla de salto justificado que ya se usó 2 veces. Contras: contradice el patrón dominante externo — aceptable, porque tenemos 7 mediciones propias y el estado del arte no midió este repo.

## Decisión (propuesta al humano)

1. **Cerrar el experimento UI-first con la Opción 3.** La etapa A deja el ⚗️ y se vuelve permanente. Su reporte `a-ui.md` debe incluir obligatoriamente el contrato de reemplazo (formas de datos esperadas + qué borrar/renombrar al conectar lo real). El salto de etapa sigue permitido con justificación registrada en la fila de métricas.
2. **ADR-008 no se toca.** Los datos no muestran fallas atribuibles al reparto: los defectos que `ui`/`sonnet` dejó fueron menores y los atrapó la red de seguridad aguas abajo (foco, marcador), que es exactamente el diseño. Y la rebaja candidata (`spec-writer` → `sonnet`) queda **descartada por ahora con evidencia en contra**: los dos hallazgos que más lejos llegaron fueron huecos de spec, no de código — la lista de muletillas ausente del requirement (buscador D-1) y la colisión del literal del aviso de privacidad con T-008, que bloqueó el PR #11. El error de spec sigue siendo el más caro del sistema. No tocar el reparto además conserva la comparabilidad de filas que exige la cabecera de `docs/metricas-pipeline.md`.
3. **Escribir como práctica los mandatos de integración del validador** (hoy dispersos en reportes y devlogs). Las corridas paralelas (T-005∥T-006; T-007∥T-008∥T-009) enseñaron que "dos pipelines en verde" no implica "fusión mecánica" (`docs/devlog/2026-09-04-la-cuenta-de-las-dos-ramas.md`: 3 problemas semánticos que ningún `git merge` marca). El patrón probado:
   - **Fusionar `main` en la rama antes de abrir el PR y correr la suite completa sobre el árbol fusionado** (patrón del buscador `2e9202f`, repetido en seo §8: atrapó al guardián de privacidad exigiendo declarar `categoriaNombre`).
   - **Delegar hallazgos entre ramas vivas de forma explícita y con cierre verificado:** el M3 de T-009 (`fotoUrl` sin lista blanca) se delegó a T-008 "por coordinación de merge" (fila de métricas + `agregar-seo-local/reports/d-validacion.md` §6.1) y el validador de T-008 lo cerró y lo documentó (`agregar-foto-negocio/reports/d-validacion.md` §9). Regla: el hallazgo delegado se anota en el veredicto del que delega Y en el del que recibe.
   - **Si la integración colisiona con una spec aprobada, el validador no la reescribe:** abre el PR en borrador y declara el bloqueo para el humano (foto §1: "Un validador que reescribe specs para que su propio change encaje es exactamente el fallo que el proceso quiere evitar").
   - **Sin scope creep de fusión:** lo que la fusión desbloquea pero la spec no pide se anota como seguimiento, no se implementa (seo §8 "Lo que NO hice, a propósito").
4. **Empezar a llenar "Post-merge":** el `/checkpoint` de cada feature rellena la celda de las corridas mergeadas hace ≥2 semanas (o "0" explícito). Una métrica central con 10 celdas vacías no es una métrica.
5. **Actualizar la lista "Qué mirar cada ~5 corridas"** de `docs/metricas-pipeline.md`: las preguntas 1 y 3 quedan respondidas; entran en su lugar la vigilancia del contrato de reemplazo y del llenado de Post-merge.

## Consecuencias

- Positivas: el proceso ejecuta sus propios criterios de salida (credibilidad del building in public); la coordinación paralela deja de depender de que cada validador redescubra el patrón; la métrica de retrabajo por fin va a medir retrabajo.
- Negativas: mantener la etapa A va contra el patrón dominante externo y habrá que re-defenderlo si el retrabajo aparece con features más grandes; el mandato de fusionar `main` antes del PR alarga la etapa D en corridas paralelas (en seo costó resolver 2 conflictos y 2 pruebas rotas — trabajo real, solo que pagado en el lugar correcto); llenar Post-merge agrega una obligación al `/checkpoint`.
- El costo de no decidir también existe: el ⚗️ sin veredicto y la columna vacía son deuda de proceso acumulándose en público.

## Cuándo revisarla

- Si en las próximas ~5 corridas con etapa A el reemplazo de mocks cuesta correcciones no puntuales (rehacer componentes/copy), se reabre la fusión A→dev — ahora sí con evidencia.
- Cuando "Post-merge" tenga datos en ≥5 filas: primera lectura real de la métrica de retrabajo (y de si el pipeline aprueba de más).
- Si una corrida paralela produce un defecto que los mandatos de integración no atraparon.
- ADR-008 se reabre en sus propios términos (§Cuándo revisarla); este ADR solo constata que hoy no se dispara ninguno.

---

## Cambios propuestos a proceso.md (v0.5)

> Borrador del diff que ejecutaría las decisiones 1, 3 y 4. **No aplicado**: la decisión es del humano.

```diff
 # Proceso de desarrollo — NecesitoUno

-> Versión 0.4 — borrador para afinar. […]
->
-> Cambios v0.4: cada agente declara su modelo en el frontmatter, […]
+> Versión 0.5 — borrador para afinar. […]
+>
+> Cambios v0.5 (tras la revisión de las primeras 10 corridas — ver ADR-009): la etapa A
+> deja de ser experimento y se vuelve permanente con contrato de reemplazo obligatorio;
+> los mandatos de integración del validador para corridas en paralelo quedan escritos;
+> el `/checkpoint` rellena la columna Post-merge de la bitácora. Cambios v0.4: cada
+> agente declara su modelo en el frontmatter, […]
```

En §5, la fila de la etapa A pierde el ⚗️:

```diff
-| A | `ui` ⚗️ | `sonnet` | Capa de interfaz con datos mock: […] Se salta si el change no tiene UI | `reports/a-ui.md` con formas de datos esperadas |
+| A | `ui` | `sonnet` | Capa de interfaz con datos mock: […] Se salta si el change no tiene UI o reutiliza UI existente (justificación registrada en la fila de métricas) | `reports/a-ui.md` con formas de datos esperadas + contrato de reemplazo |
```

El párrafo del experimento se sustituye por el veredicto y la nueva regla:

```diff
-⚗️ **La etapa A (UI-first con mocks) es un experimento:** el estado del arte no la
-respalda (el patrón dominante es implementación integrada). Se evalúa al cerrar la
-primera feature con interfaz: si reemplazar los mocks generó retrabajo significativo,
-la etapa A se fusiona dentro del dev y el agente `ui` pasa a revisor de interfaz
-post-implementación.
+**La etapa A es permanente** (experimento cerrado en ADR-009: en 7 corridas con UI,
+reemplazar los mocks costó 0 correcciones en 4 y correcciones puntuales en 3 — el
+criterio de salida no se cumplió). Lo que la hace barata es el **contrato de
+reemplazo**, y por eso es obligatorio: `reports/a-ui.md` debe listar las formas de
+datos esperadas y, de forma explícita, qué archivos se borran y qué imports se
+renombran cuando el dev conecte lo real. Si en corridas futuras el reemplazo cuesta
+rehacer componentes o copy, la fusión A→dev se reabre con esa evidencia (ADR-009
+§Cuándo revisarla).
```

Nueva subsección después de §5b:

```diff
+### 5c. Corridas en paralelo — mandatos de integración del validador
+
+Cuando dos o más changes corren a la vez, "los dos pipelines en verde" no implica
+"la fusión es mecánica" (devlog 2026-09-04 "La cuenta de las dos ramas": tres
+problemas semánticos que ningún merge de texto marca). El validador de cada rama:
+
+1. **Fusiona `main` en la rama antes de abrir el PR** y corre la suite completa
+   sobre el árbol fusionado. Las pruebas de la otra feature son parte del gate.
+2. **Delegar un hallazgo a otra rama viva es válido, pero queda registrado dos
+   veces:** en el veredicto del validador que delega (con el motivo de merge) y en
+   el del validador que recibe (con el cierre verificado). Un hallazgo delegado sin
+   cierre documentado cuenta como abierto.
+3. **Si la integración colisiona con una spec aprobada de otra capacidad, no la
+   reescribe:** abre el PR en borrador y declara el bloqueo para el humano. Enmendar
+   specs pasa por `/spec` y aprobación humana, siempre.
+4. **Sin scope creep de fusión:** lo que el merge desbloquea pero la spec no pide se
+   anota como seguimiento en el PR, no se implementa.
```

En §Medición y en §7 (checkpoint):

```diff
 El pipeline se mide por retrabajo, no por volumen. Cada corrida de `/implementar` o
 `/rapido` agrega una fila a `docs/metricas-pipeline.md`: […]
-y (rellenado después) correcciones post-merge.
+y (rellenado después) correcciones post-merge. **Rellenar "Post-merge" es parte del
+`/checkpoint`:** en cada checkpoint, el cronista revisa las corridas mergeadas hace
+dos semanas o más y escribe la celda (los commits de corrección sobre esa feature, o
+"0" explícito). Una celda vacía no significa cero: significa que no se midió.
```

Y en `docs/metricas-pipeline.md`, la lista "Qué mirar cada ~5 corridas" se actualiza: salen las preguntas ya respondidas (etapa C — encuentra: 4 altos y 29 medios en 10 corridas; etapa A — retrabajo ~0, ADR-009) y entran: "¿los `a-ui.md` traen contrato de reemplazo completo?" y "¿Post-merge se está llenando en los checkpoints?". Las preguntas del validador-vs-CI y de Post-merge creciente se conservan.
