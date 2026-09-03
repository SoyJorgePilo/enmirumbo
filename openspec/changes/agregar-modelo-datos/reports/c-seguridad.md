# Reporte etapa C (seguridad y tests adversariales) — agregar-modelo-datos

**Veredicto: limpio — pasa al validador.** 0 críticos · 0 altos · 2 medios · 5 bajos.
`npm test` (26 tests, 4 archivos), `npm run lint` y `npm run build` en verde.

## Auditoría de seguridad del diff

Verificado sobre `git diff main` + untracked (`git status --porcelain -uall`):

- **Secretos y datos sensibles fuera del commit:** `git check-ignore` confirma `.env` (`.gitignore:50`), `prisma/dev.db` y `prisma/test.db` (`.gitignore:44`) y `src/generated/` (`.gitignore:55`). Ningún archivo del set a commitear contiene secretos, rutas de bases ni datos personales.
- **Seed sin datos personales (LFPDPPP):** `prisma/seed.ts` contiene exclusivamente el catálogo público del PRD — cotejado línea a línea contra Apéndice A (21 colonias) y Apéndice B (49 giros) y §6.1 (8 categorías). Cero negocios, nombres o teléfonos reales.
- **Datos de prueba ficticios:** todos los tests usan números inventados (prefijos `771000xxxx` del dev, `771999xxxx` de esta etapa) y nombres marcados como ficticios.
- **Inyección:** todo el acceso a datos va por Prisma parametrizado; los únicos `$queryRaw` (tests) usan template tags. Test adversarial confirma que `'; DROP TABLE Negocio;--` se persiste como texto inerte.
- **Enumeración:** `Negocio.id` es `cuid()` (no autoincrement) — fichas no enumerables desde URLs futuras. Buena decisión del dev.
- **`tokenGestion`:** reservado, nulo, con `@unique`, sin lógica (verificado por grep y test). Cuando E8 lo implemente: generación criptográfica y comparación segura, no está en este change.
- **CHECKs reales en la base:** verificados en INSERT (tests del dev) y ahora también en UPDATE y con variantes del literal (tests adversariales).

## Hallazgos

### Medios

- **M1 — Unicidad de WhatsApp solo por cadena exacta.** `prisma/schema.prisma:46` (`whatsapp @unique`). Escenario: un mismo número registra dos fichas con `"7719990010"` y `"+52 771 999 0010"` — la constraint no lo detecta y "una sola ficha por número" (PRD §6.1) se brinca. Conforme a spec (que solo exige la constraint) y coherente con la decisión de validar en bordes, pero **E1 debe normalizar a 10 dígitos antes de insertar, obligatoriamente**. Documentado con test de caracterización (`tests/adversarial.test.ts`). No bloquea este change; debe quedar rastreado para el ticket del formulario.
- **M2 — `DATABASE_URL` sin `.env.example`.** Variable nueva no documentada en un `.env.example` commiteado (checklist de secretos). Mitigado por el fallback de `prisma7.config.ts:19`; el dev ya lo anotó como deuda. Resolver como chore antes o después del merge.

### Bajos

- **B1 — `slugify` degenerada y colisiones por acentos.** `src/lib/slug.ts:9`: entradas sin ASCII devuelven `""` (`"🌮🌮🌮"`, `"日本語"`) y nombres que solo difieren en acentos colisionan (`"Uñas"` ≡ `"Unas"`). Hoy inocuo: el catálogo es curado y un test nuevo verifica que no hay slugs vacíos ni colisiones internas ni cruces giro↔colonia (que romperían el parseo de `/giro-colonia`). Riesgo solo si un flujo futuro genera slugs desde texto de usuario — rechazar slug `""` en ese borde.
- **B2 — Idempotencia del seed no cubre slugs vandalizados.** Si alguien altera un `slug` en la base (no el `nombre`), el upsert intentaría crear la fila canónica y chocaría con `nombre` único (P2002). Fuera del contrato de la spec (re-corridas sobre base íntegra); el caso `nombre` alterado sí se probó y el seed lo restaura.
- **B3 — `tests/global-setup.ts:5`** usa `new URL(import.meta.url).pathname` en vez de `fileURLToPath`: falla si la ruta del clon tiene espacios (percent-encoding). Robustez de infra de tests, no seguridad.
- **B4 — `ON DELETE SET NULL` en `coloniaId`** (`migration.sql:46`): borrar una colonia del catálogo dejaría negocios con `coloniaId` y `coloniaOtra` nulos a la vez — estado que la definición de "pendiente de normalizar" (design.md §2) no representa. Hoy no existe flujo de borrado de catálogo; tenerlo presente si algún día se cura el catálogo en caliente.
- **B5 — `fotoUrl`/`facebookUrl` aceptan cualquier esquema** (`javascript:`, `file:`) — esperado en el modelo, pero E1 (validación) y E2 (render) deben exigir http(s) antes de pintar enlaces. Documentado con test de caracterización.

## Scenarios sin test

Ninguno. El mapa scenario→test de `reports/b-dev.md` cubre los 17 scenarios de la spec; "base desde cero" vía `tests/global-setup.ts` (migración real en cada corrida) y "espacio reservado sin comportamiento" con test + grep son coberturas aceptables para su naturaleza.

## Tests adversariales añadidos (`tests/adversarial.test.ts`, 8 tests, todos en verde)

1. CHECK de `estado`/`origen` rechaza también vía UPDATE (incluida cadena vacía) y la fila queda intacta.
2. CHECK rechaza variantes del literal (`"Publicado"`, `"publicado "`, `"EN_REVISION"`).
3. Caracterización: variante `+52` con espacios crea segunda ficha (→ M1).
4. Entradas hostiles persisten intactas: HTML/script, unicode RTL + emoji, `queOfreces` de 10,000 chars (sin límite en base → el máx. 200 vive en E1), intento de SQL injection inerte; hard delete verificado con SQL crudo sobre `Negocio`.
5. `slugify` estable ante NFC/NFD.
6. Caracterización de colisiones y slug vacío en `slugify` (→ B1).
7. Catálogos del seed: sin slugs vacíos, sin colisiones internas, sin cruces giro↔colonia.
8. Seed restaura un `nombre` de catálogo alterado sin duplicar filas (idempotencia bajo datos modificados).

## Cierre

- `npm test`: 26/26 en verde (4 archivos).
- `npm run lint`: sin errores.
- `npm run build`: exitoso.
- Sin commits (conforme al proceso: solo el validador toca git).
