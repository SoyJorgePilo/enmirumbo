# ADR-008 · Modelo de IA por agente del pipeline

**Fecha:** 2026-09-03 · **Estado:** aceptada

## Contexto y problema

Los 6 agentes de `.claude/agents/` se escribieron sin declarar `model:` en su frontmatter, así que todos heredaban el modelo de la sesión que los invoca. Eso hace que el costo y la calidad del pipeline dependan de con qué modelo abrió la terminal quien corre `/implementar` ese día — el mismo change puede salir caro y bueno un martes y barato y flojo un miércoles, sin que nada quede registrado. Para un pipeline que se mide por retrabajo (ADR-002), esa variable suelta contamina la medición: no se puede saber si una corrida tuvo 3 iteraciones dev↔seguridad por una spec mala o por un modelo chico.

La decisión, entonces, no es "cuál es el mejor modelo" sino **qué etapas pagan un modelo caro y cuáles no**, y dejarlo escrito.

## Drivers de la decisión

1. **Costo del error por etapa** — dónde un fallo se detecta tarde y arrastra retrabajo a las etapas siguientes.
2. **Naturaleza del trabajo** — razonamiento y juicio (ambigüedad, adversarial, veredicto) vs. ejecución acotada contra un contrato ya escrito.
3. **Existencia de una red de seguridad** — si hay revisión humana o gate determinista inmediatamente después, el modelo puede ser más barato.
4. **Costo por corrida** — proyecto de una persona sin presupuesto de infraestructura; el pipeline se corre varias veces al día.
5. **Determinismo de la medición** — el modelo debe ser una constante versionada del pipeline, no una variable de ambiente.

## Opciones consideradas

### Opción A — `inherit` en todos (statu quo)
Cero configuración y máxima flexibilidad. Contras: choca de frente con los drivers 4 y 5 — el costo es impredecible y `docs/metricas-pipeline.md` mide un pipeline distinto en cada fila. Además, en la práctica "heredar" significa "todos Opus", porque la sesión principal casi siempre corre Opus: es el escenario más caro sin haberlo elegido.

### Opción B — un solo modelo declarado para todos
Simple y medible. Contras: obliga a elegir entre pagar Opus en `cronista` (que redacta prosa a partir de material que ya está en el repo) o poner Sonnet en `seguridad-test` (cuyo valor declarado es literalmente encontrar lo que el dev no pensó). Ninguna de las dos es aceptable; el pipeline tiene etapas con perfiles demasiado distintos.

### Opción C — modelo por agente según costo del error
Cada agente declara su modelo. Contras: 6 decisiones en vez de 1, y hay que re-evaluarlas cuando salgan modelos nuevos.

### Opción D — incluir `haiku` en las etapas baratas
Ahorro máximo. Contras: ninguna de las 6 etapas actuales es de una sola pasada con salida estructurada, que es donde Haiku rinde. La candidata más obvia, `cronista`, escribe el devlog — que *es* el producto visible del building in public; ahorrar centavos degradando la parte que la gente lee es un mal negocio.

## Decisión

**Opción C: modelo declarado por agente, asignado por costo del error.**

| Agente | Modelo | Razón dominante |
|---|---|---|
| `spec-writer` | `opus` | Decide el alcance y traduce ambigüedad; un scenario que falta aquí nadie lo implementa ni lo exige después (driver 1) |
| `ui` | `sonnet` | Ejecución contra una spec ya escrita, con copy citado literal y resultado visible a simple vista (drivers 2 y 3) |
| `dev` | `opus` | Etapa más pesada: modelo de datos, TDD por scenario y lectura de los docs locales de Next, cuyas APIs difieren del entrenamiento (`AGENTS.md`) |
| `seguridad-test` | `opus` | Razonamiento adversarial; lo obvio ya lo cubrió el dev en TDD, su valor está exactamente en lo no obvio |
| `validador` | `opus` | Compuerta final y único agente que toca git; rechazar bien es más difícil que aprobar |
| `cronista` | `sonnet` | Redacción a partir de material ya existente en el repo, con revisión humana antes de publicar (driver 3) |

Gana sobre B porque el pipeline no es homogéneo: cuatro etapas viven de juicio y dos de ejecución supervisada. Gana sobre A porque convierte el modelo en una constante versionada — a partir de aquí, una fila de `docs/metricas-pipeline.md` compara contra el mismo pipeline. Y descarta D porque el ahorro de Haiku ($1/$5 por millón de tokens frente a $2/$10 de Sonnet) no compensa en las dos únicas etapas donde cabría.

**Fable 5.1 queda fuera** de forma explícita: es el modelo más capaz, pero a ~2x el precio de Opus ($10/$50 vs $5/$25 por millón de tokens) y ninguna etapa de este pipeline es lo bastante difícil para justificarlo en un directorio de negocios de un municipio.

## Consecuencias

- Positivas: el costo por corrida se vuelve predecible y auditable; las métricas de retrabajo comparan contra un pipeline estable; el reparto queda como argumento explícito y no como accidente de configuración.
- Negativas: el balance 4 opus / 2 sonnet es deliberadamente conservador — se paga Opus en `spec-writer` aunque tenga revisión humana inmediatamente después (punto de control #1), que es la ficha más discutible de las seis. Y los nombres `opus`/`sonnet` son alias móviles: apuntan a la generación vigente, así que una corrida de hoy y una de dentro de seis meses no son estrictamente el mismo pipeline aunque el archivo no haya cambiado.

## Cuándo revisarla

- Si `docs/metricas-pipeline.md` acumula corridas donde `spec-writer` no genera dudas ni retrabajo tras el gate humano: bajarlo a `sonnet` es el primer ahorro, precisamente porque el humano atrapa sus errores antes de que cueste código.
- Si el costo por corrida se vuelve un límite real para iterar (varias corridas diarias sostenidas).
- Si la etapa A (`ui`) se fusiona dentro del dev, como contempla `docs/proceso.md` §5: desaparece una de las dos asignaciones `sonnet` y hay que reabrir el balance.
- Al salir una generación nueva de modelos, verificar que los alias sigan apuntando a lo que esta decisión asumió.
