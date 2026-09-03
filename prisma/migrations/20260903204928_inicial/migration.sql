-- CreateTable
CREATE TABLE "Categoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Colonia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Giro" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "consintioAvisoEn" DATETIME NOT NULL,
    "coloniaId" INTEGER,
    "coloniaOtra" TEXT,
    "queOfreces" TEXT,
    "entregaADomicilio" BOOLEAN NOT NULL DEFAULT false,
    "telefonoFijo" TEXT,
    "direccion" TEXT,
    "latitud" REAL,
    "longitud" REAL,
    "horario" TEXT,
    "fotoUrl" TEXT,
    "facebookUrl" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'en_revision' CHECK ("estado" IN ('en_revision', 'publicado', 'rechazado')),
    "origen" TEXT NOT NULL DEFAULT 'organico' CHECK ("origen" IN ('siembra', 'organico')),
    "registradoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoEn" DATETIME,
    "tokenGestion" TEXT,
    CONSTRAINT "Negocio_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negocio_coloniaId_fkey" FOREIGN KEY ("coloniaId") REFERENCES "Colonia" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_GiroToNegocio" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_GiroToNegocio_A_fkey" FOREIGN KEY ("A") REFERENCES "Giro" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_GiroToNegocio_B_fkey" FOREIGN KEY ("B") REFERENCES "Negocio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "Negocio_tokenGestion_key" ON "Negocio"("tokenGestion");

-- CreateIndex
CREATE UNIQUE INDEX "_GiroToNegocio_AB_unique" ON "_GiroToNegocio"("A", "B");

-- CreateIndex
CREATE INDEX "_GiroToNegocio_B_index" ON "_GiroToNegocio"("B");
