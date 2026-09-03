# Tasks: agregar-modelo-datos

## 1. Preparar Prisma

- [x] 1.1 Instalar `prisma` (dev) y `@prisma/client`; inicializar con datasource SQLite (`prisma/schema.prisma`, `DATABASE_URL` en `.env` local) y verificar que `.env` y `*.db` están cubiertos por `.gitignore` antes de cualquier commit
- [x] 1.2 Verificar que `npx prisma validate` pasa con el esquema base vacío

## 2. Esquema

- [x] 2.1 Modelar los catálogos `Categoria`, `Colonia` y `Giro`, cada uno con `nombre` y `slug` únicos
- [x] 2.2 Modelar `Negocio`: obligatorios y opcionales del PRD §6.1 (incluye `consintioAvisoEn`, coordenadas opcionales del pin, `fotoUrl` y `facebookUrl`), `whatsapp` con `@unique`, `estado` y `origen` como `String` con defaults, `registradoEn` automático, `publicadoEn` opcional, `coloniaId` opcional + `coloniaOtra`, y `tokenGestion String? @unique` sin lógica
- [x] 2.3 Modelar la relación muchos-a-muchos `Negocio` ↔ `Giro`

## 3. Migración inicial

- [x] 3.1 Generar la migración inicial con `prisma migrate dev --name inicial` y editar su SQL para agregar los CHECK de `estado` y `origen` (design.md §1)
- [x] 3.2 Verificar que la migración aplica limpia en una base inexistente (`rm` del `.db` local + `prisma migrate dev`) y que los CHECK rechazan valores fuera del conjunto

## 4. Constantes y utilidades compartidas

- [x] 4.1 Crear la utilidad de slug (minúsculas, sin acentos, espacios a guiones) con casos verificados a mano: "Plomería" → `plomeria`, "Haciendas de Tizayuca" → `haciendas-de-tizayuca`, "Fonda / comida corrida" → slug sin diagonales
- [x] 4.2 Exportar constantes tipadas de estado y origen (p. ej. `src/lib/negocio.ts`) con los mismos literales de los CHECK

## 5. Seed de catálogos

- [x] 5.1 Escribir `prisma/seed.ts` idempotente (upsert por slug) con las 8 categorías del §6.1, las 21 colonias del Apéndice A y los 49 giros del Apéndice B
- [x] 5.2 Conectar el seed: script `db:seed` en `package.json` y configuración de seed de Prisma; correrlo dos veces seguidas y comprobar que los conteos (8/21/49) no cambian

## 6. Verificación de comportamiento del modelo

- [x] 6.1 Comprobar en base poblada: crear negocio mínimo (estado `en_revision`, `registradoEn` con fecha, `publicadoEn` y `tokenGestion` nulos), rechazo por `whatsapp` duplicado, vínculo de 3 giros, y caso "Otra" (sin `coloniaId`, con `coloniaOtra`)
- [x] 6.2 Comprobar el hard delete: eliminar un negocio con giros vinculados y verificar que fila y vínculos desaparecen
- [x] 6.3 Corrida final de punta a punta en base desde cero: migración + `npm run db:seed` + conteos esperados, sin datos personales reales en ningún archivo commiteado
