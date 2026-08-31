# ADR-006 · Almacenamiento de las fotos de negocios

**Fecha:** 2026-08-31 · **Estado:** propuesta — se decide al ejecutar E1-3

## Contexto y problema

Cada negocio puede subir una foto (PRD §6.1: máx. 5 MB de entrada, comprimida en el servidor, política de contenido definida). Las fotos no pueden vivir en el repo (público) ni en el filesystem del hosting (efímero en serverless). Son además el peso dominante de las páginas frente a la meta de <2s en 4G.

## Drivers de la decisión

1. Servir variantes optimizadas (WebP/AVIF, tamaños para tarjeta y ficha) — el driver de rendimiento manda
2. Costo ~$0 con ~50-200 fotos y tráfico municipal
3. Borrado real al ejercer ARCO o retirar una ficha (PRD §8)
4. Mínimas piezas: idealmente el mismo proveedor de DB u hosting

## Opciones consideradas

### Supabase Storage (si ADR-004 confirma Supabase)
Mismo proveedor que la DB: una consola, un contrato de tratamiento de datos, borrado transaccional junto al registro. Transformaciones de imagen incluidas en planes de pago; en gratuito habría que generar variantes al subir (sharp en el server action — encaja con "comprimida en el servidor" del PRD). Contras: transformación on-the-fly no gratuita.

### Vercel Blob (si ADR-007 confirma Vercel)
Integración cero-config y `next/image` optimiza al servir. Contras: precios por operación que escalan opaco, y ata las fotos al hosting — mover de hosting movería también los archivos.

### Cloudinary
El mejor en transformaciones (asset management completo). Contras: un tercer proveedor solo para fotos (contra driver 4), plan gratuito con marca de agua de límites cambiantes, y sobredimensionado para "una foto por negocio".

### UploadThing / S3 / R2
Genéricos y baratos, pero añaden proveedor y configuración sin ventaja diferencial a esta escala.

## Recomendación (pendiente de confirmar en E1-3)

**El storage del proveedor que gane ADR-004/007** — Supabase Storage si la DB es Supabase — con variantes generadas al subir con `sharp` (thumbnail para tarjeta, ~1200px para ficha) y servidas vía `next/image`. La regla es no sumar un proveedor nuevo por las fotos: el MVP tiene una foto por negocio, no una galería.

## Consecuencias (si se confirma)

- Positivas: borrado ARCO en un solo lugar; sin proveedor extra; el costo queda dentro del plan gratuito existente.
- Negativas: generar variantes al subir fija los tamaños por adelantado (cambiar el diseño de tarjeta puede pedir regenerar variantes — aceptable con cientos de fotos).

## Cuándo revisarla

Si el producto suma galerías por negocio (fases posteriores) o si el costo de storage/egress aparece en la factura.
