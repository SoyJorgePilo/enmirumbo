# Design: agregar-modelo-datos

Decisiones técnicas no obvias del esquema. El detalle campo por campo vive en el delta de spec; aquí solo lo que requiere justificación.

## 1. Enums como strings con CHECK en la migración (SQLite no soporta enums)

Prisma no permite `enum` con provider SQLite (ADR-001). Para que la garantía sea de base de datos y no solo de aplicación:

- `estado` y `origen` se declaran `String` en el esquema, con defaults `"en_revision"` y `"organico"`.
- La migración inicial se edita a mano para agregar constraints `CHECK (estado IN ('en_revision','publicado','rechazado'))` y `CHECK (origen IN ('siembra','organico'))` — Prisma respeta el SQL editado de las migraciones.
- Se exportan constantes tipadas (p. ej. `src/lib/negocio.ts`) para que formulario y panel compartan los mismos literales sin strings mágicos.

Riesgo aceptado: si en E0-3 se migra a Postgres, los CHECK se recrean o se convierten a enums nativos; el cambio es barato porque los valores viven en un solo lugar.

`origen` con default `"organico"`: todo lo que entra por el formulario público es orgánico; el admin lo marca como `siembra` al aprobar las fichas de cambaceo (PRD §6.3 y §10). Así el campo nunca es nulo y las métricas del §10 no tienen huecos.

## 2. Colonia "Otra": FK nullable + texto libre, sin fila "Otra" en el catálogo

- `Negocio.coloniaId` es opcional; `Negocio.coloniaOtra` (texto) guarda lo capturado cuando el dueño eligió "Otra".
- "Pendiente de normalizar" = `coloniaId` nulo con `coloniaOtra` no vacío. Normalizar = asignar `coloniaId`.
- No se crea una fila "Otra" en el catálogo `Colonia`: contaminaría filtros, conteos y las URLs SEO por colonia (E5-1), que solo deben generarse desde colonias reales con slug.

## 3. Terreno para P1 sin implementarlo

- **Enlace de gestión:** campo `tokenGestion String? @unique` en `Negocio`. Suficiente para E8: generar el token es un update, regenerarlo (enlace comprometido, PRD §6.4) es otro update y la unicidad ya está garantizada. Nulo y sin lógica en el MVP.
- **Revisiones de edición:** el patrón será una tabla aparte (p. ej. `RevisionEdicion` con la propuesta de cambios y su propio estado) que referencia al negocio, de modo que la ficha pública siga mostrando la versión vigente mientras el cambio espera revisión (PRD §6.4). No requiere reservar nada en `Negocio` hoy, así que este change no la crea.

## 4. Consentimiento como timestamp

El checkbox obligatorio del aviso de privacidad se persiste como `consintioAvisoEn DateTime`: un boolean dice "aceptó", el timestamp dice "cuándo", que es la evidencia útil ante la LFPDPPP (§8) junto con la conversación de WhatsApp de la verificación (§6.3). Pendiente de confirmación humana (duda 1 de la proposal).

## 5. Giros: N:M sin cota en la base

La relación negocio↔giro es muchos-a-muchos vía Prisma. La regla "1-3 giros al aprobar" (PRD §6.3) no se puede expresar razonablemente como constraint en SQLite y además admite excepciones (negocio publicado sin giro si ninguno embona, Apéndice B): es regla del panel de revisión (E3), no del esquema.
