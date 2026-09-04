# Etapa D (validación) — agregar-boton-reportar

**Ticket:** `docs/tickets/T-011-boton-reportar.md` · **Rama:** `feature/agregar-boton-reportar` (worktree `.claude/worktrees/wt-t011`)
**Entrada:** spec (4 deltas), `design.md`, `tasks.md`, `reports/a-ui.md`, `reports/b-dev.md` (§9 incluida), `reports/c-seguridad.md`.

## Veredicto: APROBADO (2ª pasada)

**1ª pasada: CAMBIOS REQUERIDOS** — 1 medio bloqueante (M1). **2ª pasada: APROBADO**, con M1 y las dos correcciones editoriales (O11, O12) cerradas y **re-verificadas por mí contra un build de producción**, no contra el reporte del dev.

**Hallazgos vivos al aprobar: 0 críticos · 0 altos · 0 medios.** Quedan 11 observaciones bajas de la etapa C, ninguna bloqueante, y los pendientes humanos del §5.

---

## 1. Mi hallazgo M1, y cómo quedó

### 1ª pasada — M1 (medio, bloqueante): atender el ÚLTIMO reporte no confirmaba nada

El aviso "Reporte atendido." se pintaba **dentro** de `<ReportesPendientesNegocio>`, y esa sección solo se renderiza si quedan pendientes: al marcar el único reporte de un negocio, la sección desaparecía y el aviso con ella. El requirement "Marcar un reporte como atendido, una sola vez" no admite esa salvedad, y era la rama más frecuente (casi todo negocio reportado tendrá un solo reporte). Lo reproduje contra `next start`; y ningún test miraba esa rama: `admin-reportes-paginas.test.ts` ejercía la de dos reportes y la de "atendidos todos" solo desde la cola.

### 2ª pasada — CERRADO

El aviso salió del componente y lo pinta el detalle desde `?reporte=`, exista o no la sección (`src/app/admin/registros/[id]/page.tsx:90-101`); la prop `mensaje` desapareció de `ReportesPendientesNegocio` y su docstring explica por qué no vuelve ahí.

**Mi re-verificación, mismo escenario exacto que rechacé, contra `next build` + `next start` (puerto 3500, base propia, negocio ficticio con UN reporte pendiente, sesión firmada):**

```
POST  marcar atendido (único pendiente) → 303 …?reporte=atendido
GET   …?reporte=atendido  → 200 · "Reporte atendido."   PRESENTE   (antes: AUSENTE)
                                 · "Reportes sin atender"  AUSENTE  (correcto: no queda nada)
                                 · "Marcar como atendido"  AUSENTE
POST  el mismo otra vez                 → 303 …?reporte=ya-atendido
GET   …?reporte=ya-atendido → 200 · "Este reporte ya lo habías atendido."  PRESENTE   (antes: AUSENTE)
GET   …?reporte=loquesea    → 200 · no pinta ningún aviso
Cola  → el negocio ya no aparece en "Negocios reportados"
```

**Y comprobé que los tests nuevos muerden**, con mi propia mutación: volviendo a condicionar el aviso a `reportesPendientes.length > 0`, los tres casos nuevos de `tests/admin-reportes-paginas.test.ts` se ponen en rojo (los demás siguen verdes). Restauré el archivo.

### O11 — cerrado

`typeof negocioId !== "string" → notFound()` en `src/app/negocio/[ficha]/reportar/accion.ts:99`. **Mi verificación en producción, siete formas de bound manipulado:** `[null]`, `[12345]`, `[{…}]`, `[["x"]]`, `[]`, `[true]` y un bound que no es arreglo → **404 los siete**, y el control legítimo sigue dando `303` a `/gracias`. El "404 uniforme" de `b-dev.md` §8 ya es cierto. El test `[O11]` quedó invertido conservando sus dos aserciones (cero filas, cero cookies) y sumando dos formas.

### O12 — cerrado

`construirSegmentoFicha` (`src/lib/ficha-url.ts:13-24`) deja escrito en su docstring que slugifica el nombre pero interpola el `id` tal cual, y que la garantía de ruta limpia se apoya en que todo id sea un cuid.

---

## 2. Compuertas mecánicas (las corrí yo, antes y después del merge de `main`)

| Gate | Antes del merge | Tras fusionar `origin/main` |
| --- | --- | --- |
| `npm run lint` | ✅ | ✅ |
| `npx tsc --noEmit` | ✅ | ✅ |
| `npm test` | ✅ 58 archivos / **1 614** pruebas | ✅ ver §4 |
| `npm run build` | ✅ | ✅ |
| `prisma migrate deploy` sobre base nueva | ✅ sin drift | ✅ migraciones en orden |

Sin dependencias nuevas, sin `any`, sin `"use client"` en archivos nuevos.

## 3. Qué verifiqué por muestreo (1ª y 2ª pasada, sin fiarme de los reportes)

- **Literales contra el HTML servido**, no contra las constantes: los 10 del formulario público y los 8 del panel. Ninguna opción de motivo premarcada; `noindex` en las dos páginas nuevas.
- **Flujo sin JavaScript con POST real de formulario**: envío válido → `303` a `/gracias` y cookie de borrador borrada; envío sin motivo → `303` con **solo el código del error en la URL** y el texto en la cookie `httpOnly; Secure; SameSite=lax; Path=/negocio/<seg>/reportar; Max-Age=120`. La corrección de M2 (cookie de borrador) y la de M3 (único bound = el id) se sostienen fuera del banco de pruebas.
- **Cero fuga a lo público**: la ficha servida es **idéntica byte a byte** antes y después de sembrarle 3 reportes pendientes; ni conteos, ni motivos, ni comentarios.
- **Modelo**: la migración crea tabla nueva con los dos CHECK a mano y **no redefine `Negocio`** (leí el SQL); los CHECK de `estado`/`origen` siguen vivos; ninguna columna del reportante.
- **Cascada ARCO con filas reales por los dos caminos**: `delete` y `deleteMany` (que es el que usa `borrarNegocioDefinitivamente` de `main`); 2 reportes → 0 y **SQL crudo confirmando cero huérfanos**.
- **404** de la página de reporte con id inventado; **cupos separados** (altas vs. reportes) verdes en las dos suites.

## 4. Integración con `main` (#11, #12, #13, #14)

La base de esta rama era anterior a esos PRs. Tras aprobar y commitear, fusioné `origin/main` y resolví los cruces esperados; el detalle de la resolución y la verificación posterior en servidor real están en el cuerpo del PR y en el commit de merge.

- **Ficha**: "Reportar este negocio" queda al final, después del bloque de contacto y de lo que trajo `main` (foto y JSON-LD).
- **Detalle del panel**: "Reportes sin atender" convive con despublicar y borrar (T-015) — que es el contexto que T-015 esperaba: los reportes a la vista **en el momento de decidir**.
- **Borrado ARCO**: verificado con filas reales que se lleva también los reportes, sin huérfanos.

## 5. Pendientes para el humano

1. **Revisión visual a 390px, 768px y 1280px** del flujo de reportar (ficha → formulario → confirmación) y del panel con reportes. `tasks.md` #18 automatizó lo automatizable (área táctil ≥44px, `break-words`); los ojos faltan.
2. **CI de GitHub Actions en verde en el PR.** Mi validación local **no lo sustituye**.
3. **El merge lo hace un humano**, siempre.
4. Observaciones bajas heredadas que no bloquean: `robots.txt` no excluye las rutas nuevas (chore aparte), residuo de 120 s de la cookie de borrador en dispositivo compartido, y el `console.warn` por honeypot/cupo inflable a voluntad.
