-- Cupos anti-abuso en la base, no en la memoria del proceso.
--
-- Change `preparar-deploy-produccion` (T-013), iteración 2, hallazgo A4 de la
-- etapa C: en un hosting serverless (ADR-007) cada instancia tiene su propia
-- memoria, así que un contador en RAM le da al atacante tantos intentos como
-- instancias consiga levantar. Hoy esta tabla la usa UN solo cupo: los
-- intentos de acceso al panel, que es lo único que protege la única
-- credencial del sitio.
--
-- `clave` NO guarda una IP: guarda un HMAC-SHA256 de la IP con el secreto de
-- sesión del panel (`src/lib/cupos/compartido.ts`).
--
-- RETENCIÓN, en dos capas y las dos reales (iteración 3, hallazgo R1): al
-- contar un cupo se borran las marcas de esa clave que ya salieron de su
-- ventana, y la tarea programada diaria (`limpiarCuposCaducados`, llamada desde
-- `src/lib/purga/rechazados.ts`) recoge las que nadie vuelve a consultar y poda
-- la tabla si pasa de su techo de filas. Nada de aquí sobrevive más de una hora.
--
-- Nada del formulario público ni de los reportes entra aquí: el aviso de
-- privacidad publicado promete que la IP de un vecino se usa "solo en su
-- memoria". Ver docs/despliegue.md §10.

-- CreateTable
CREATE TABLE "IntentoDeCupo" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "ocurrioEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoDeCupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoDeCupo_clave_ocurrioEn_idx" ON "IntentoDeCupo"("clave", "ocurrioEn");

