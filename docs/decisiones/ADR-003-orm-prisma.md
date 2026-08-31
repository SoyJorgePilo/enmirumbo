# ADR-003 · Acceso a datos: Prisma como ORM

**Fecha:** 2026-08-31 · **Estado:** aceptada

## Contexto y problema

El modelo de datos es chico (1 entidad central + 3 catálogos) pero con requisitos que castigan el SQL manual: migraciones versionadas (repo público, cualquiera debe poder reproducir la DB), tipos end-to-end con TypeScript estricto, y una posible migración SQLite→otra DB al desplegar (ADR-004) que no debe reescribir la capa de datos.

## Drivers de la decisión

1. Portabilidad entre SQLite (dev) y la DB de producción aún no decidida
2. Tipos generados — los agentes del pipeline cometen menos errores con tipos estrictos que con SQL en strings
3. Migraciones declarativas y legibles en el repo (valor building in public)
4. Operabilidad por una persona: menos conocimiento arcano, mejor documentación

## Opciones consideradas

### Prisma
Esquema declarativo (`schema.prisma`) que sirve además como documentación viva del modelo; migraciones automáticas; el cliente tipado más maduro del ecosistema; el que mejor conocen los LLMs (menos alucinaciones de API en el pipeline multiagente). Contras: engine con peso extra en serverless (mitigado desde Prisma 6 con el cliente sin motor binario), y las queries muy relacionales complejas pueden requerir `$queryRaw`.

### Drizzle
Más ligero y cercano a SQL, mejor rendimiento serverless. Contras: migraciones menos maduras, esquema en TypeScript menos legible como documentación para no programadores (y este repo se lee en público), y menos representado en el conocimiento de los agentes.

### SQL crudo (better-sqlite3 / postgres.js)
Cero abstracción y máximo control. Contras: pierde los 3 primeros drivers de golpe — sin tipos generados, sin migraciones declarativas, portabilidad manual. A esta escala el "control" no compra nada.

## Decisión

**Prisma.** Gana en portabilidad (driver 1: cambiar `provider` y el connection string), en fiabilidad del pipeline (driver 2: los agentes generan Prisma correcto de forma mucho más consistente que Drizzle o SQL) y en legibilidad pública del esquema. El costo de rendimiento es irrelevante a la escala del MVP (<10K registros, tráfico de un municipio).

## Consecuencias

- Positivas: `schema.prisma` es a la vez modelo, documentación y contrato para las specs; el seed de catálogos es trivial.
- Negativas: dependencia de un runtime de terceros con historial de cambios de rumbo comerciales; si algún día se necesita una query analítica compleja, será `$queryRaw`.

## Cuándo revisarla

Si el hosting elegido (ADR-007) penaliza el cold start de Prisma de forma medible contra la meta de <2s en 4G, o si Prisma cambia su licencia/modelo de precios para el cliente OSS.
