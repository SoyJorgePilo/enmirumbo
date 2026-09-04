-- La columna de la foto deja de llamarse `fotoUrl` y pasa a ser `fotoClave`
-- (change `agregar-foto-negocio`, design.md §4): lo que se guarda no es una
-- dirección, es la clave opaca que genera el servidor al procesar la imagen.
-- El nombre viejo invitaba justo al error del hallazgo M1 de T-004 (guardar
-- ahí una URL del cliente y pintarla).
--
-- A propósito NO se usa la redefinición de tabla que Prisma genera por default
-- para SQLite: volver a crear "Negocio" perdería los CHECK de `estado` y
-- `origen` que la migración inicial escribió a mano (mismo cuidado que en la
-- migración del texto normalizado del buscador). `RENAME COLUMN` deja la
-- tabla —y sus constraints— intacta.
--
-- Nada escribía esa columna hasta este change, así que no hay datos que migrar.

-- AlterTable
ALTER TABLE "Negocio" RENAME COLUMN "fotoUrl" TO "fotoClave";

-- CreateIndex
-- Única entre negocios: dos fichas no pueden apuntar a los mismos archivos
-- (spec `modelo-datos`, scenario "dos negocios no comparten la misma foto").
-- En SQLite un índice único admite varios NULL, que es lo que necesitan las
-- fichas sin foto.
CREATE UNIQUE INDEX "Negocio_fotoClave_key" ON "Negocio"("fotoClave");
