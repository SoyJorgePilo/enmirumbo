# Reporte etapa D (validación) — agregar-modelo-datos

**Veredicto: APROBADO.** 0 hallazgos bloqueantes · 1 editorial corregido por el validador.

## Validación por paso

1. **Spec → implementación:** los 8 requirements y 17 scenarios de `specs/modelo-datos/spec.md` tienen implementación verificable en el diff. Verifiqué el mapa scenario→test de `b-dev.md` leyendo los 4 archivos de tests completos (no por confianza en el reporte): cada scenario tiene test real y las aserciones corresponden a lo que el scenario exige. "Base desde cero" se ejecuta en cada corrida vía `tests/global-setup.ts` (migrate deploy sobre db borrada); "espacio reservado sin comportamiento" verificado por test + grep propio de `tokenGestion` (solo schema, migración y tests — cero lógica).
2. **Ticket T-001:** los 8 criterios de aceptación se cumplen (ver checklist en el PR). El campo reservado para revisiones de edición se resolvió como "tabla propia en E8, nada que reservar hoy" (design.md §3), conforme a la duda 2 resuelta en la aprobación.
3. **Alcance:** todo el diff está pedido por proposal/design o es infraestructura de verificación exigida por el proceso (Vitest + configs; los gates incluyen `npm test`). Dependencias nuevas justificadas: `prisma`/`@prisma/client`/`@prisma/adapter-better-sqlite3` (ADR-001, Prisma 7 exige adapter), `tsx` (runner del seed), `vitest` (tests), bump `@types/node` (requerido por Vitest 5 y Node 24 del CI). Sin scope creep: no hay campos de rechazo, no hay singleton de Prisma, no hay relación giro↔categoría.
4. **tasks.md:** 14/14 `[x]` y cada una respaldada por artefactos en el diff.
5. **Seguridad:** `c-seguridad.md` reporta 0 críticos/0 altos; los 2 medios y 5 bajos quedaron explícitamente como trabajo de tickets futuros (M1 → normalización de WhatsApp en E1; M2 → chore de `.env.example`; B1/B5 → bordes de E1/E2). Re-verifiqué de forma independiente: `git check-ignore` cubre `.env`, `prisma/*.db` y `src/generated/`; el lockfile solo resuelve contra registry.npmjs.org (sin rastros de los `npm pack` de reparación de entorno); el seed es catálogo público del PRD cotejado por muestreo contra §6.1 y Apéndices A/B (8/21/49 exactos); los tests usan solo datos ficticios (prefijos 771000xxxx/771999xxxx); no hay endpoints en este change.
6. **Gates mecánicos (ejecutados por el validador):** `npm run lint` ✅ · `npm run build` ✅ · `npm test` ✅ (26/26, 4 archivos). Extra: doble `npm run db:seed` sobre dev.db → conteos 8/21/49 estables (verificado con sqlite3 crudo), y el CHECK de `estado` rechaza un INSERT hostil por SQL directo (fuera de Prisma).
7. **Convenciones:** sin UI en este change; comentarios y mensajes en español; cero `any`; ids de `Negocio` con `cuid()` (no enumerables).

## Hallazgo editorial (corregido aquí)

- `.gitignore` traía la entrada duplicada `/src/generated/prisma` además de `/src/generated/` que ya la cubre; se eliminó la redundante y se re-verificó `git check-ignore` sobre `.env`, `prisma/*.db` y `src/generated/`.

## Verificado por muestreo

- Colonias del seed contra PRD Apéndice A (las 21, incluida la partición centro/fraccionamientos) y giros contra Apéndice B (11+8+4+5+6+6+9 = 49).
- SQL de la migración editada a mano: los CHECK de `estado`/`origen` coinciden literal por literal con `src/lib/negocio.ts`.
- `prisma7.config.ts` no carga dependencias nuevas (usa `process.loadEnvFile()` nativo) y su fallback no expone rutas sensibles.

## Pendiente (no bloqueante, ya rastreado)

- El CI de GitHub Actions debe quedar en verde en el PR: esta validación local no lo sustituye. El merge lo hace un humano.
- M1 (normalizar WhatsApp a 10 dígitos) es obligatorio en el ticket de E1; M2 (`.env.example`) como chore.
