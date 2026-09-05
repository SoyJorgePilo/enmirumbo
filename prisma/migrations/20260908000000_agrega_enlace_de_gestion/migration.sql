-- Enlace de gestión y ediciones pendientes (T-014, change
-- `agregar-enlace-de-gestion`, PRD §6.4).
--
-- Dos cosas pasan aquí:
--
-- 1. `Negocio.tokenGestion` —terreno reservado desde T-001, NULO en todas las
--    filas porque ninguna funcionalidad lo escribía— se retira y en su lugar
--    entran la HUELLA del token y la fecha en que se generó. La base nunca
--    guarda el secreto: un respaldo no se lleva los enlaces de nadie
--    (design.md §3). El `DROP COLUMN` no pierde datos: no había ninguno.
--
-- 2. Entra `EdicionPendiente`, el snapshot completo de lo que un negocio
--    quiere publicar mientras espera revisión (design.md §1). Vive FUERA de
--    `Negocio` para que la consulta pública no tenga que acordarse de
--    excluirla nunca.

-- ── 1. La huella del enlace sustituye a la columna en claro ─────────────────

-- DropIndex
DROP INDEX "Negocio_tokenGestion_key";

-- AlterTable
ALTER TABLE "Negocio" DROP COLUMN "tokenGestion",
    ADD COLUMN     "tokenGestionCreadoEn" TIMESTAMP(3),
    ADD COLUMN     "tokenGestionHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_tokenGestionHash_key" ON "Negocio"("tokenGestionHash");

-- ── 2. Las ediciones que esperan revisión ───────────────────────────────────

-- CreateTable
CREATE TABLE "EdicionPendiente" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "coloniaId" INTEGER,
    "coloniaOtra" TEXT,
    "queOfreces" TEXT,
    "entregaADomicilio" BOOLEAN NOT NULL DEFAULT false,
    "telefonoFijo" TEXT,
    "direccion" TEXT,
    "horario" TEXT,
    "facebookUrl" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaEn" TIMESTAMP(3),
    "motivoDescarte" TEXT,

    CONSTRAINT "EdicionPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdicionPendiente_estado_creadaEn_idx" ON "EdicionPendiente"("estado", "creadaEn");

-- CreateIndex
CREATE INDEX "EdicionPendiente_negocioId_estado_idx" ON "EdicionPendiente"("negocioId", "estado");

-- AddForeignKey
ALTER TABLE "EdicionPendiente" ADD CONSTRAINT "EdicionPendiente_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdicionPendiente" ADD CONSTRAINT "EdicionPendiente_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EdicionPendiente" ADD CONSTRAINT "EdicionPendiente_coloniaId_fkey" FOREIGN KEY ("coloniaId") REFERENCES "Colonia"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ────────────────────────────────────────────────────────────────────────────
-- CONSTRAINTS ESCRITAS A MANO — NO LAS BORRES
-- ────────────────────────────────────────────────────────────────────────────
--
-- Mismo criterio que los CHECK de la migración inicial: Prisma no expresa ni
-- un conjunto cerrado de valores (sin recurrir a un `enum` del motor) ni un
-- índice único PARCIAL, y las dos cosas son reglas de la base, no
-- prolijidad. `tests/modelo-migraciones.test.ts` las ejercita después de
-- aplicar el árbol completo: si alguien las borra, la suite lo dice.

-- Estado de una edición (literales en `src/lib/gestion/estados.ts`).
ALTER TABLE "EdicionPendiente"
    ADD CONSTRAINT "EdicionPendiente_estado_check"
    CHECK ("estado" IN ('pendiente', 'aplicada', 'descartada'));

-- UNA SOLA EDICIÓN PENDIENTE POR NEGOCIO (design.md §1 y §2).
--
-- No es prolijidad: es lo que impide que dos envíos casi simultáneos dejen dos
-- pendientes y el admin apruebe la vieja. El código, además, cierra la
-- anterior y escribe la nueva en la misma transacción; esto es lo que sostiene
-- la regla cuando dos transacciones corren a la vez. Parcial —solo sobre
-- 'pendiente'— para que las resueltas se puedan acumular sin estorbar: un
-- negocio puede tener docenas de ediciones aplicadas y descartadas.
CREATE UNIQUE INDEX "EdicionPendiente_una_pendiente_por_negocio"
    ON "EdicionPendiente"("negocioId")
    WHERE "estado" = 'pendiente';
