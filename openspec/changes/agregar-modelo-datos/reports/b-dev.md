# Reporte etapa B (dev) — agregar-modelo-datos

**Estado:** completo. 14/14 tareas de `tasks.md` marcadas. `npm run lint`, `npm run build` y `npm test` en verde (18 tests, 3 archivos).

## Qué se implementó

- `prisma/schema.prisma`: catálogos `Categoria`, `Colonia`, `Giro` (nombre y slug únicos) y `Negocio` con los 5 obligatorios y 5 opcionales del PRD §6.1, `whatsapp @unique`, `estado`/`origen` String con defaults, `registradoEn` automático, `publicadoEn?`, `coloniaId?` + `coloniaOtra?`, relación N:M `Negocio↔Giro` (implícita) y `tokenGestion String? @unique` sin lógica.
- `prisma/migrations/20260903204928_inicial/migration.sql`: migración inicial, editada a mano para los CHECK de `estado` y `origen` (design.md §1). Verificado por test y por SQL crudo que ambos rechazan valores fuera del conjunto.
- `prisma/seed.ts`: seed idempotente (upsert por slug) con 8 categorías, 21 colonias (Apéndice A) y 49 giros (Apéndice B). Exporta `seedCatalogos(prisma)` para los tests y corre solo al ejecutarse directo (`npm run db:seed` → `prisma db seed` → `tsx prisma/seed.ts`). Solo datos de catálogo, cero datos personales.
- `src/lib/slug.ts`: `slugify()` (minúsculas, sin acentos, diagonales/espacios → guiones simples).
- `src/lib/negocio.ts`: `ESTADOS_NEGOCIO`, `ORIGENES_NEGOCIO`, tipos y defaults tipados — única fuente de los literales de los CHECK.
- `prisma7.config.ts`: config de Prisma 7 (nombre de archivo que el CLI v7 busca). Carga `.env` con `process.loadEnvFile()` nativo (sin dependencia `dotenv`) y tiene fallback `file:./prisma/dev.db` para clones sin `.env`.
- Infra de tests (no existía): Vitest con `vitest.config.mts`, `tests/global-setup.ts` (borra `prisma/test.db` y aplica la migración real con `prisma migrate deploy` — eso mismo prueba el scenario "base desde cero" en cada corrida) y `tests/db.ts` (cliente Prisma con adapter better-sqlite3 contra la base de prueba).
- `package.json`: scripts `test` (`vitest run`), `db:seed` (`prisma db seed`) y `postinstall` (`prisma generate`, necesario porque `src/generated/` no se commitea y el CI hace `npm ci → lint → build → test`).
- `.gitignore`: se agregó `/src/generated/` (cliente generado); `.env` y `prisma/*.db` ya estaban cubiertos.
- `eslint.config.mjs`: ignore de `src/generated/**`.

## Mapa scenario → verificación

| Scenario (spec modelo-datos) | Test |
|---|---|
| Alta mínima con solo obligatorios | `tests/negocio.test.ts` · "alta mínima…" |
| Alta completa con opcionales (con pin) | `tests/negocio.test.ts` · "alta completa…" |
| WhatsApp duplicado | `tests/negocio.test.ts` · "rechaza un segundo negocio…" (P2002) |
| Catálogos poblados por el seed | `tests/seed.test.ts` · "puebla 8/21/49…" |
| Slug apto para URL | `tests/slug.test.ts` (5 casos) + `tests/seed.test.ts` · "Plomería / Haciendas de Tizayuca" y "todos los slugs…" |
| Slugs estables entre corridas | `tests/seed.test.ts` · "volver a correr el seed…" |
| Asignación de giros | `tests/negocio.test.ts` · "el admin puede vincular 3 giros…" |
| Negocio recién registrado sin giros | `tests/negocio.test.ts` · dentro de "alta mínima…" |
| Negocio recién creado (estado/registradoEn/publicadoEn) | `tests/negocio.test.ts` · dentro de "alta mínima…" |
| Publicación | `tests/negocio.test.ts` · "publicación…" |
| Valores fuera del conjunto (CHECK) | `tests/negocio.test.ts` · "la base rechaza un estado/origen…" |
| Registro con colonia "Otra" | `tests/negocio.test.ts` · "colonia Otra…" |
| Normalización por el admin | `tests/negocio.test.ts` · misma prueba (update `coloniaId`) |
| Hard delete (ARCO) | `tests/negocio.test.ts` · "hard delete…" (incluye conteo crudo en `_GiroToNegocio`) |
| Base desde cero | `tests/global-setup.ts` (migrate deploy sobre db borrada) + verificación manual: `rm prisma/dev.db && npx prisma migrate dev && npm run db:seed` → 8/21/49 |
| Seed idempotente | `tests/seed.test.ts` · "volver a correr…" + manual: `npm run db:seed` dos veces, conteos 8/21/49 sin cambio |
| Espacio reservado sin comportamiento | Test (token nulo al crear) + manual: `grep -rn tokenGestion src prisma tests` → solo `schema.prisma` y el propio test; ninguna lógica lo lee/escribe |

## Decisiones técnicas

1. **Prisma 7.10.0 pineado exacto** (`prisma` y `@prisma/client`). El tag `latest` de npm apunta a `prisma@8.0.0-rc.12`, que es un CLI de plataforma en release candidate con otra superficie de comandos; 7.10.0 es el estable del ORM. Prisma 7 exige driver adapter: se agregó `@prisma/adapter-better-sqlite3@7.10.0`.
2. **Config `prisma7.config.ts`** (nombre que genera y busca el CLI v7 para coexistir con el config de v8). Las URLs SQLite se resuelven relativas a la raíz del proyecto, no a `prisma/`: por eso `DATABASE_URL="file:./prisma/dev.db"` (y `file:./prisma/test.db` en tests), para que los `.db` caigan bajo el `prisma/*.db` ya ignorado.
3. **`Negocio.id` es `cuid()`** (no autoincrement): evita que las fichas sean enumerables desde URLs futuras. Los catálogos usan `Int` autoincrement (se referencian por slug en URLs).
4. **`entregaADomicilio Boolean @default(false)`** en vez de nullable: un checkbox sin marcar significa "no"; el tri-estado no aporta y complica los filtros ("A domicilio", PRD §6.2).
5. **Giro sin FK a Categoria**: el Apéndice B agrupa giros por categoría solo como presentación del catálogo; la spec pide tres catálogos planos con slug y la relación negocio↔giro. No se inventó la relación giro↔categoría (anotada abajo como posible propuesta).
6. **Nombres de giros capitalizados** ("Plomería", "Fonda / comida corrida"): son texto que la UI mostrará en filtros/páginas; el slug siempre sale de `slugify()`.
7. **La normalización de colonia no borra `coloniaOtra`**: "pendiente de normalizar" = `coloniaId` nulo con `coloniaOtra` no vacío; al asignar `coloniaId` deja de estar pendiente y el texto original se conserva como evidencia de lo capturado.
8. **Límite de 200 caracteres de `queOfreces` no va en la base**: SQLite ignora longitudes de columna; se valida en el borde del formulario (E1), como la cota 1-3 giros se valida en el panel (E3).
9. **`@types/node` ^20 → ^24**: requerido por Vitest 5 y consistente con Node 24 del entorno (el CI ya migró por deprecación de Node 20 en runners).

## Deuda y propuestas fuera de alcance (no implementadas)

- **Singleton de cliente Prisma para Next.js**: fuera de alcance por proposal; crearlo con la primera ruta que consulte datos (usar `PrismaBetterSqlite3` + `PrismaClient` de `src/generated/prisma/client`, ver `tests/db.ts` como referencia).
- **Relación `Giro ↔ Categoria`**: si E2/E5 necesitan listar giros agrupados por categoría (como el Apéndice B), habrá que agregar `categoriaId` a `Giro` con su migración; hoy no lo pide ningún requirement.
- **`.env.example` commiteado**: ayudaría al onboarding; mitigado con el fallback del config. Decisión editorial para el validador o un chore.
- **Migración a Postgres (E0-3)**: los CHECK se recrean o se vuelven enums nativos; los literales viven solo en `src/lib/negocio.ts` y en la migración inicial.

## Notas de entorno (para el validador)

- Esta máquina no tenía Node: se instaló `node@24` (24.20.0) vía Homebrew y se linkeó.
- Varios paquetes nativos estaban sin su binario `.node` en `node_modules` (`@next/swc-darwin-arm64`, `lightningcss-darwin-arm64`, `@tailwindcss/oxide-darwin-arm64`); se restauraron con `npm pack` + copia manual. Un `npm ci` limpio en CI no tiene este problema.
- El primer intento de `next build` falla con caché envenenada en `.next/` si un binario nativo faltó antes: `rm -rf .next` y rebuild lo resuelve.
