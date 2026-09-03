# 2026-09-03 · Dos ramas a la vez: la fábrica tuvo que coordinarse con ella misma

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** las dos primeras corridas completas del pipeline multiagente — T-001 (modelo de datos) y T-002 (layout base) — quedaron aprobadas en primera pasada y mergeadas (PR [#2](https://github.com/SoyJorgePilo/necesitouno/pull/2) y [#3](https://github.com/SoyJorgePilo/necesitouno/pull/3)).

## Qué construimos

NecesitoUno ya tiene esqueleto real:

- **El modelo de datos** (T-001): la tabla `Negocio` con sus 5 campos obligatorios y 5 opcionales, los catálogos de categorías, colonias y giros (8/21/49, con seed idempotente), los estados de revisión (`en_revision`, `publicado`, `rechazado`), WhatsApp único por negocio, borrado definitivo real para atender derechos ARCO, y el hueco ya reservado para el enlace de gestión que llega después.
- **El layout base** (T-002): header y footer presentes en todas las páginas, tipografía y paleta como tokens reutilizables, mobile-first desde 390px, y el verde de WhatsApp reservado como único color de acción — nada más compite con él.

Con esto entre manos, el proyecto pasó de "solo proceso" a tener dos ramas de código reales corriendo el pipeline de punta a punta por primera vez, al mismo tiempo.

## La decisión interesante

Correr T-001 y T-002 en paralelo ahorró tiempo de calendario, pero expuso un problema que el proceso no había tenido que resolver todavía: ¿qué hace un agente cuando su rama depende de algo que otra rama —abierta al mismo tiempo, sin mergear— está a punto de traer?

El caso concreto: la rama del layout necesitaba probar 13 escenarios de la spec (contraste, semántica, responsive), pero la infraestructura de pruebas automatizadas (Vitest) todavía no existía en el repo — la estaba agregando, en paralelo, la rama del modelo de datos, tocando el mismo `package.json`. El agente de desarrollo decidió **no instalar nada de eso en su rama**: hubiera sido duplicar dependencias y garantizar un conflicto de merge en cuanto la otra rama aterrizara. En vez de eso, verificó los 13 escenarios a mano (comandos de build, greps sobre el HTML servido, un script propio para recalcular contraste) y dejó registrada, con número de escenario, la lista exacta de qué había que convertir en test automatizado en cuanto el merge trajera la infraestructura. El validador confirmó cada verificación manual de forma independiente y aprobó con la deuda anotada, no oculta.

No salió gratis del todo: cuando llegó el momento de fusionar main de vuelta en la rama del layout (ya con el modelo de datos mergeado), el único conflicto real fue en `docs/metricas-pipeline.md` — la propia tabla donde el pipeline registra sus corridas había recibido una fila nueva desde cada rama, en la misma línea. Conflicto trivial de resolver, pero con algo de ironía: hasta la ceremonia que existe para medir el pipeline le cobró un rocecito al pipeline.

## Qué aprendimos

Que correr features en paralelo introduce un tipo de coordinación que el proceso, hasta hoy, resolvía por accidente porque solo había una rama activa a la vez. La solución de hoy no fue tooling nuevo: fue que el agente reconociera el riesgo, tomara la decisión más simple (no tocar lo compartido) y dejara la deuda escrita con nombre y apellido en vez de fingir que no existe. Eso es exactamente lo que building in public debería mostrar: no solo lo que salió bien, sino el criterio detrás de un atajo consciente.

## Siguiente paso

Portar los 8 escenarios pendientes (2, 4, 7, 9, 10, 11, 12 y 13 de la spec del layout) a Vitest ahora que la infraestructura ya vive en `main` — es la deuda que quedó anotada hoy, con fecha de vencimiento clara. Después, arranca la siguiente pieza visible del directorio: el formulario de registro de negocios (E1-1).

---
*Tickets/PRs relacionados: T-001 · T-002 · PR #1 · PR #2 · PR #3*
