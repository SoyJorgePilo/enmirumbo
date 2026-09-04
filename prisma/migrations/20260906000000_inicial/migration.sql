-- Migración inicial del directorio, en PostgreSQL.
--
-- Change `preparar-deploy-produccion` (T-013 / E0-3), design.md §4: el árbol
-- de migraciones se REHIZO desde cero, no se tradujo. Las siete migraciones
-- anteriores eran SQLite puro y no había un solo dato real en ninguna base, así
-- que lo que se conserva es el ESQUEMA RESULTANTE, no la historia (que sigue
-- viva en git). Esta migración consolida:
--
--   20260903204928_inicial                          (modelo de T-001)
--   20260904030602_agregar_rastro_de_rechazo
--   20260904032104_agrega_texto_normalizado_de_busqueda
--   20260904141721_agregar_rastro_de_despublicacion
--   20260904143957_agrega_tabla_reporte
--   20260905090000_renombra_foto_url_a_foto_clave
--   20260905120000_agrega_version_del_aviso_consentido
--
-- Lo generado por Prisma va arriba; las cuatro constraints escritas a mano,
-- abajo, con su propia explicación.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colonia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Colonia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giro" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Giro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "consintioAvisoEn" TIMESTAMP(3) NOT NULL,
    "consintioAvisoVersion" TEXT,
    "reconsintioAvisoEn" TIMESTAMP(3),
    "reconsintioAvisoVersion" TEXT,
    "coloniaId" INTEGER,
    "coloniaOtra" TEXT,
    "queOfreces" TEXT,
    "entregaADomicilio" BOOLEAN NOT NULL DEFAULT false,
    "telefonoFijo" TEXT,
    "direccion" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "horario" TEXT,
    "fotoClave" TEXT,
    "facebookUrl" TEXT,
    "nombreNormalizado" TEXT NOT NULL DEFAULT '',
    "queOfrecesNormalizado" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'en_revision',
    "origen" TEXT NOT NULL DEFAULT 'organico',
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoEn" TIMESTAMP(3),
    "rechazadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "despublicadoEn" TIMESTAMP(3),
    "motivoDespublicacion" TEXT,
    "tokenGestion" TEXT,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reporte" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidoEn" TIMESTAMP(3),

    CONSTRAINT "Reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GiroToNegocio" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GiroToNegocio_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nombre_key" ON "Categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Colonia_nombre_key" ON "Colonia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Colonia_slug_key" ON "Colonia"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Giro_nombre_key" ON "Giro"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Giro_slug_key" ON "Giro"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_whatsapp_key" ON "Negocio"("whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_fotoClave_key" ON "Negocio"("fotoClave");

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_tokenGestion_key" ON "Negocio"("tokenGestion");

-- CreateIndex
CREATE INDEX "Reporte_negocioId_estado_idx" ON "Reporte"("negocioId", "estado");

-- CreateIndex
CREATE INDEX "_GiroToNegocio_B_index" ON "_GiroToNegocio"("B");

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_coloniaId_fkey" FOREIGN KEY ("coloniaId") REFERENCES "Colonia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GiroToNegocio" ADD CONSTRAINT "_GiroToNegocio_A_fkey" FOREIGN KEY ("A") REFERENCES "Giro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GiroToNegocio" ADD CONSTRAINT "_GiroToNegocio_B_fkey" FOREIGN KEY ("B") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ────────────────────────────────────────────────────────────────────────────
-- CONSTRAINTS ESCRITAS A MANO — NO LAS BORRES
-- ────────────────────────────────────────────────────────────────────────────
--
-- Prisma no sabe expresar un conjunto cerrado de valores sin usar un `enum`
-- del motor, y no queremos enum: agregar un valor a un enum de PostgreSQL es
-- DDL sobre la tabla, y el vocabulario ya vive en TypeScript
-- (`src/lib/negocio.ts`, `src/lib/reportes/motivos.ts`,
-- `src/lib/reportes/estados.ts`). Así que los CHECK se escriben aquí, a mano,
-- y son lo que hace que un estado inventado no llegue a la base ni por un
-- script de operación, ni por un `psql` a mano, ni por un `$executeRawUnsafe`.
--
-- Ya se perdieron una vez: en SQLite, la redefinición de tabla que Prisma
-- genera para `ALTER TABLE` los borraba en silencio (change `agregar-buscador`,
-- tarea 3). En PostgreSQL `ALTER TABLE … ADD COLUMN` no reescribe la tabla, así
-- que una migración futura ya no se los lleva por delante sin quererlo. Aun
-- así, `tests/modelo-migraciones.test.ts` los ejercita DESPUÉS de aplicar el
-- árbol completo: si alguien los borra, la suite lo dice.
--
-- Van como `ALTER TABLE … ADD CONSTRAINT` con nombre explícito (y no inline en
-- el `CREATE TABLE`) para que se puedan buscar por nombre en `pg_constraint` y
-- para que el error que devuelve la base nombre la regla que se violó.

-- Ciclo de vida del negocio (PRD §6.3 y §10; literales en src/lib/negocio.ts).
ALTER TABLE "Negocio"
    ADD CONSTRAINT "Negocio_estado_check"
    CHECK ("estado" IN ('en_revision', 'publicado', 'rechazado'));

ALTER TABLE "Negocio"
    ADD CONSTRAINT "Negocio_origen_check"
    CHECK ("origen" IN ('siembra', 'organico'));

-- Avisos de los vecinos (PRD §6.3 y §13; literales en src/lib/reportes/).
ALTER TABLE "Reporte"
    ADD CONSTRAINT "Reporte_motivo_check"
    CHECK ("motivo" IN ('cerrado', 'no_real', 'datos_incorrectos', 'inapropiado'));

ALTER TABLE "Reporte"
    ADD CONSTRAINT "Reporte_estado_check"
    CHECK ("estado" IN ('pendiente', 'atendido'));
