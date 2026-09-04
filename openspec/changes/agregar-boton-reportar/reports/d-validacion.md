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
| `npm test` | ✅ 58 archivos / **1 614** pruebas | ✅ 84 archivos / **2 305** pruebas |
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

La base de esta rama era anterior a esos PRs (más el #15). Tras aprobar y commitear, fusioné `origin/main`; la resolución está detallada en el commit de merge. Lo que hubo que decidir:

- **Rutas públicas**: `main` movió el directorio al grupo `(publico)`, cuyo layout inyecta el script de la medición. Mudé ahí el formulario de reporte y su confirmación: **ninguna URL cambia** —un grupo de rutas no aparece en la dirección— y el flujo queda medido por construcción, no por una lista que alguien deba recordar.
- **Ficha**: "Reportar este negocio" sigue al final, después del bloque de contacto y de lo que trajo `main` (foto, giros y JSON-LD).
- **Detalle del panel**: la sección ocupa el **hueco que `main` había dejado reservado** para T-011, entre los datos y las acciones. Verificado en el HTML servido: reportes (pos. 7 077) → despublicar (9 238) → borrar (10 632). Es el contexto que T-015 esperaba: los avisos se leen **antes** de decidir.
- **Cobertura de T-015 activada**: su invariante recorre todas las claves foráneas hacia `Negocio` exigiendo cascada, y ahora nombra explícitamente `Reporte.negocioId` (sin eso, quitar la clave dejaría el recorrido sin nada que revisar y pasaría en verde). Sumé un test del **camino real del panel** (`borrarNegocioDefinitivamente`, que borra con `deleteMany`, no con `delete`).
- **Suites**: `admin-adversarial` conserva los dos bloques y suma las dos listas de accesos a datos; en `reportes-seguridad-adversarial` acoté el corte de la sección de reportes a su `</section>`, porque `main` pinta después el enlace "Borrar definitivamente" y unas aserciones que vigilan lo que el comentario de un vecino mete en el HTML acababan juzgando marcado ajeno al reporte.

### Verificación en servidor real sobre el árbol fusionado

`next build` + `next start` en el puerto 3500, base propia y datos ficticios:

| Comprobación | Resultado |
| --- | --- |
| Reportar **sin JavaScript** (POST de formulario) | `303` → `/reportar/gracias`, con la confirmación en pantalla |
| Cola con la sección de reportados | "Negocios reportados", "1 negocio tiene reportes sin atender.", "1 reporte sin atender", "Ver reportes" |
| Atender el **último** pendiente | "Reporte atendido." presente, sección fuera, negocio fuera de la cola |
| Borrado ARCO desde el panel, con 3 reportes reales | negocio borrado y **cero filas** en `Reporte` (consulta SQL cruda) |

**Gates sobre el árbol fusionado:** lint ✅ · `tsc` ✅ · **84 archivos y 2 305 pruebas** ✅ · build ✅.

## 5. Pendientes para el humano

1. **Revisión visual a 390px, 768px y 1280px** del flujo de reportar (ficha → formulario → confirmación) y del panel con reportes. `tasks.md` #18 automatizó lo automatizable (área táctil ≥44px, `break-words`); los ojos faltan.
2. **CI de GitHub Actions en verde en el PR.** Mi validación local **no lo sustituye**.
3. **El merge lo hace un humano**, siempre.
4. Observaciones bajas heredadas que no bloquean: `robots.txt` no excluye las rutas nuevas (chore aparte), residuo de 120 s de la cookie de borrador en dispositivo compartido, y el `console.warn` por honeypot/cupo inflable a voluntad.
