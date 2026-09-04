-- Texto derivado para el buscador (change `agregar-buscador`, design.md §1):
-- copia sin acentos ni mayúsculas de `nombre` y `queOfreces`, porque SQLite no
-- compara ignorando acentos.
--
-- A propósito NO se usa la redefinición de tabla que Prisma genera por default
-- para SQLite: volver a crear "Negocio" perdería los CHECK de `estado` y
-- `origen` que la migración inicial escribió a mano (no son expresables en el
-- schema de Prisma, y `tests/negocio.test.ts` y `tests/adversarial.test.ts`
-- dependen de ellos). `ADD COLUMN` deja la tabla —y sus constraints— intacta.
--
-- El DEFAULT '' es lo que permite agregarlas NOT NULL sobre filas ya
-- guardadas; quedan en blanco hasta que corra `npm run db:backfill:busqueda`.

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN "nombreNormalizado" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN "queOfrecesNormalizado" TEXT NOT NULL DEFAULT '';
