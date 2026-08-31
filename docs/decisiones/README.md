# Decisiones técnicas (ADRs)

Este proyecto documenta cada decisión técnica relevante como un **Architecture Decision Record** — la práctica estándar introducida por Michael Nygard (2011) y formalizada en [MADR](https://adr.github.io/madr/) (Markdown Any Decision Records). Como el proyecto también tiene un enfoque de aprendizaje del flujo de desarrollo, aquí importa tanto el **porqué sí** como el **porqué no**: cada ADR registra las alternativas consideradas y las razones de descarte, que es la parte que normalmente se pierde.

## Reglas de la práctica

1. **Un ADR por decisión.** Si un documento decide dos cosas, son dos ADRs.
2. **Se escribe cuando la decisión es cara de revertir** o cuando alguien podría preguntarse "¿por qué no usaron X?" en 6 meses. Elecciones triviales no llevan ADR.
3. **Los ADRs son inmutables una vez aceptados.** Si la decisión cambia, se escribe un ADR nuevo que la reemplaza y el viejo cambia su estado a `reemplazada por ADR-XXX` — la historia de por qué pensábamos distinto es parte del valor.
4. **Estados:** `propuesta` (análisis hecho, decisión pendiente de un ticket o de datos) → `aceptada` → `reemplazada` / `obsoleta`.
5. Cada ADR declara **cuándo debe revisarse** (un umbral, una fase, un dato que la invalidaría) — las decisiones de MVP son apuestas con fecha de caducidad, no verdades.
6. Plantilla en `_TEMPLATE.md` (MADR simplificado).

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](ADR-001-stack.md) | Stack base: Next.js + Prisma + SQLite | aceptada |
| [ADR-002](ADR-002-proceso-v03.md) | Ajustes al pipeline multiagente (proceso v0.3) | aceptada |
| [ADR-003](ADR-003-orm-prisma.md) | Acceso a datos: Prisma como ORM | aceptada |
| [ADR-004](ADR-004-db-produccion.md) | Base de datos en producción | propuesta — se decide en E0-3 |
| [ADR-005](ADR-005-analitica.md) | Analítica cookieless | propuesta — se decide en E7 |
| [ADR-006](ADR-006-almacenamiento-imagenes.md) | Almacenamiento de las fotos de negocios | propuesta — se decide en E1-3 |
| [ADR-007](ADR-007-hosting.md) | Hosting y deploy | propuesta — se decide en E0-3 |

## Tecnologías descartadas de plano en el MVP (el porqué no, en corto)

- **Librería de componentes UI (shadcn/MUI/Chakra):** el MVP tiene ~6 pantallas con un design system mínimo; Tailwind puro mantiene el bundle chico (meta <2s en 4G) y evita aprender/pelear una abstracción. Se revisa si la UI crece.
- **Framework de autenticación (NextAuth/Clerk/Auth0):** el producto no tiene cuentas por decisión de PRD (§6.6); el admin usa contraseña única + cookie y los negocios enlaces secretos. Meter un framework de auth sería resolver un problema que el producto decidió no tener.
- **CMS (headless o no):** el contenido lo generan los negocios vía formulario y el admin vía panel; no hay contenido editorial que justifique un CMS.
- **Framework de orquestación de agentes (LangChain/CrewAI/n8n):** el harness es deliberadamente ligero (ver ADR-002 y `docs/proceso.md`); la evidencia 2026 favorece cadenas simples con artefactos versionados sobre frameworks que ocultan los prompts.
- **Monorepo/microservicios:** una sola app Next.js cubre sitio público, formulario y admin; separar servicios a esta escala es costo puro.
- **WhatsApp Business API:** el PRD lo excluye explícitamente (§6.6) hasta que el volumen supere ~10-15 registros/semana de forma sostenida — el disparador está definido en PRD §11.
