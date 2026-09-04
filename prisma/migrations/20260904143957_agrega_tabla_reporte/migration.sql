-- Tabla de reportes del botón "Reportar" de la ficha (change
-- `agregar-boton-reportar`, spec modelo-datos; PRD §6.3 y §13).
--
-- Los CHECK de "motivo" y "estado" se escriben A MANO, igual que los de
-- `estado`/`origen` del negocio en la migración inicial: no son expresables en
-- el schema de Prisma (SQLite no tiene enums, ADR-001) y son los que hacen que
-- un motivo inventado no pueda llegar a la tabla ni por un POST directo ni por
-- un script. Los literales son los de `src/lib/reportes/motivos.ts` y
-- `src/lib/reportes/estados.ts`.
--
-- Es una tabla NUEVA: no se redefine "Negocio" (design.md §4), así que sus
-- CHECK de `estado` y `origen` siguen intactos. La cascada del FK es la que
-- hace que el borrado definitivo del negocio (ARCO, PRD §8) se lleve también
-- sus reportes, sin dejar filas huérfanas.
--
-- NO hay ninguna columna del reportante: ni IP, ni derivada de ella, ni
-- contacto (PRD §8 y LFPDPPP).

-- CreateTable
CREATE TABLE "Reporte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "negocioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL CHECK ("motivo" IN ('cerrado', 'no_real', 'datos_incorrectos', 'inapropiado')),
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente' CHECK ("estado" IN ('pendiente', 'atendido')),
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidoEn" DATETIME,
    CONSTRAINT "Reporte_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Reporte_negocioId_estado_idx" ON "Reporte"("negocioId", "estado");
