# 2026-08-31 · Afinando la fábrica antes de encenderla

**Hito:** el proceso de desarrollo pasó por dos rondas de refinamiento con investigación real, el PRD subió a v0.8 tras una validación técnica a fondo, y estrenamos la práctica de ADRs — todo antes de la primera línea de código de producto.

## Qué construimos

Seguimos sin escribir código del directorio, y fue deliberado. Hoy la fábrica quedó así:

- **El pipeline multiagente creció y luego se disciplinó.** Primero pasó de 3 a 6 agentes especializados (spec, UI, dev con perfil de ingeniero, seguridad/tests, validador que es el único que toca git, y el cronista que escribe esto). Después investigamos qué hacen los equipos de primer nivel — las guías de Anthropic y OpenAI, los frameworks de spec-driven development (Spec Kit, Kiro, OpenSpec, BMAD), y pipelines reales como el de Cloudflare — y ajustamos con evidencia: CI en GitHub Actions como compuerta que ningún agente puede "opinar" que pasó, una ruta corta para cambios chicos, handoffs entre agentes por archivo versionado, TDD, y una bitácora de métricas para medir el pipeline por retrabajo, no por volumen.
- **El PRD se validó como si fuera código.** Antes de implementarlo lo revisamos con lentes de ingeniería y aparecieron 13 huecos — el más serio: prometía páginas SEO por giro ("plomería en Haciendas") pero no existía ninguna estructura de datos de la cual generarlas. La v0.8 los cierra: catálogo de giros curado por el admin, flujo de rechazo completo, política de duplicados, anti-abuso sin captcha, operación ARCO y métricas que separan negocios sembrados a mano de los que se registran solos — porque solo los segundos validan la hipótesis.
- **Cada decisión técnica ahora deja registro** con el estándar ADR: qué opciones se consideraron y por qué perdieron las descartadas. Hay 7 ADRs (stack, proceso, ORM, y propuestas de base de datos, analítica, imágenes y hosting) más la lista de lo que descartamos de plano y por qué.

## La decisión interesante

La investigación nos dio una lección incómoda: el error más probable de un proyecto como este no es quedarse corto de proceso, sino **sobre-ingenierizar la fábrica**. Hay mediciones de metodologías spec-driven aplicadas sin criterio que resultan 10 veces más lentas que trabajar directo, y el framework con más agentes por rol (12+) acabó fusionándolos de vuelta. Por eso cada pieza que agregamos hoy vino con su contrapeso: la ruta corta para no pagar ceremonia en cambios de una frase, y la regla de que si una etapa del pipeline no aporta hallazgos en ~5 corridas, se elimina. La fábrica también obedece "no crecer sin evidencia".

## Qué aprendimos

Que validar el PRD con ojos de implementación es de lo más rentable que hemos hecho: 13 hallazgos corregidos en papel, donde cambiar cuesta minutos. El mismo hueco de los giros descubierto en la semana 3, con el modelo de datos ya construido, habría costado una migración y retrabajo en formulario, panel y SEO.

## Siguiente paso

Ahora sí: T-001 (modelo de datos) recorre el pipeline completo por primera vez — spec, aprobación, agentes, PR con CI en verde. La primera feature real de NecesitoUno.

---
*Tickets/PRs relacionados: T-001 · PRD v0.8 · ADR-002 a ADR-007 · proceso v0.3*
