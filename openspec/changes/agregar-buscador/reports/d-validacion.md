# Reporte validador — `agregar-buscador`

Etapa D. Validación independiente del diff (`git diff main` + no rastreados sobre `feature/agregar-buscador`) contra el ticket T-006 y los 4 deltas de spec. **No me apoyé en los reportes de las etapas previas para dar por buena ninguna afirmación**: las verificaciones de abajo las corrí yo, con base propia (`validador.db`, migrada desde cero) y servidor real.

## Veredicto

**APROBADO.** 0 bloqueantes. 1 desviación de spec documentada (no bloqueante, ver D-1), 2 deudas aceptadas (M-4, B-2) y 1 deuda de producto heredada del residuo de M-3, todas trasladadas al cuerpo del PR.

## Compuertas mecánicas (ejecutadas por mí en el worktree)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | ✅ 0 problemas |
| `npm test` | ✅ **665 pruebas, 22 archivos, 0 fallas** |
| `npm run build` | ✅ TypeScript limpio; `/buscar` sale como ruta dinámica `ƒ` |

Sin tests `skip`/`only`/`todo` en toda la suite (revisado). El CI de GitHub Actions del PR es el que manda: esto es local y no lo sustituye.

## 1. Spec → diff (los 4 deltas)

Recorrí requirement por requirement. Muestreo verificado **contra servidor real** (`next dev -p 3100` sobre base propia migrada y sembrada desde cero), leyendo el HTML servido con el payload RSC retirado:

- **Buscador en la home:** el `<form action="/buscar" method="get">` aparece **antes** del `h2` "Busca por categoría" (índice 1672 vs 2522 del HTML real); home con exactamente **1 `h1` y 3 `h2`** y un solo formulario; los tres literales presentes ("Busca lo que necesitas", "ej. plomero, tacos, futbol infantil", "Buscar"); `min-h-11` en campo y botón.
- **Cobertura de la búsqueda:** `plomero` → "Plomería Hermanos Rosales (ficticio)"; `PLOMERÍA` devuelve lo mismo (mayúsculas y acentos); `futbol` → "Academia de Futbol Halcones" cuyo dato guardado lleva acento ("Fútbol"); `comida` → "Fonda Doña Cuquita", cuyo giro **no** está en su nombre ni en su "¿Qué ofreces?" (el caso que de verdad prueba la búsqueda por giro); `futbol infantil` sigue exigiendo las dos palabras.
- **Solo publicado:** busqué `barberia`, `imaginario`, `fantasma` (términos que solo casan con el `en_revision` y el `rechazado` del seed): 0 tarjetas y **0 apariciones** de sus nombres y WhatsApp en el HTML.
- **Estados vacíos:** sin parámetro, `?q=`, `?q=%20%20%20` y `?q=%_` → "¿Qué estás buscando?" + aviso + 8 botones de categoría, un solo `h1`, sin tarjetas. `veterinario espacial` → literal exacto `No encontramos negocios para "veterinario espacial".` + "Prueba con otra palabra o elige una categoría:" + 8 categorías, HTTP 200.
- **Hostiles:** `q` repetido usa el primero; inyección SQL, `<b>plomero</b>`, `<img src=x onerror=…>`, emojis + cirílico, 5 000 caracteres → todos HTTP 200, ningún marcado real creado (`<b>`/`<img>` salen escapados), el eco se recorta a 80 puntos de código con "…" en el `h1` y a 80 sin "…" en el `value`.
- **`noindex`:** presente en `/buscar` en los tres estados; **ausente** en home y en `/servicios-del-hogar` (no se contaminó nada).
- **modelo-datos:** migración aplicada desde cero (ver §5) y relleno verificado a mano (ver §5).
- **registro-negocio / layout-base:** el alta escribe las columnas con `datosDeBusqueda` esparcido **después** de `...datos` (no hay mass assignment posible); `tests/layout.test.ts` extiende la revisión de destinos al `action` y trae el caso negativo (`action="/buscador"` → señalado).

Ningún scenario quedó sin implementación verificable.

## 2. Ticket T-006

Los 7 criterios de aceptación se cumplen (verificados arriba). Nada de lo listado como fuera de alcance del ticket (ranking, sinónimos, fuzzy, autocompletado, páginas SEO, analítica) aparece en el diff.

## 3. Alcance

El diff no trae nada que la spec no pida. Las dos extracciones que podrían parecer refactor gratuito están justificadas por requirements: `CategoriasGrid` (los estados de `/buscar` deben ofrecer categorías "iguales a las de la home") y `prisma/guardas-entorno.ts` (remediación de B-1). **Sin dependencias nuevas**: `package.json` solo suma el script `db:backfill:busqueda` y `package-lock.json` no cambió.

## 4. tasks.md

Las 18 tareas están `[x]` y hechas. Muestreé #3 (migración), #5 (relleno), #6 (giros del seed), #8 (consulta), #11-#14 (página, estados, `noindex`) y #16 (layout) contra el código y contra el servidor. La única salvedad la declaran ya las tres etapas: **#17 no está cerrada por ojos humanos** (no hay navegador en este entorno); queda pedida en el PR.

## 5. Seguridad (re-verificada, no heredada)

- **Migración a mano desde cero:** apliqué las 2 migraciones sobre una base vacía y volqué el esquema. Sobreviven `CHECK ("estado" IN (…))` y `CHECK ("origen" IN (…))`, y están las 2 columnas nuevas `NOT NULL DEFAULT ''`. `prisma migrate status` → "Database schema is up to date"; `migrate diff` sin drift. **La decisión de escribir el SQL a mano es correcta.**
- **Relleno:** vacié las 12 filas, corrí `db:backfill:busqueda` → "recalculado en 12 de 12"; segunda corrida → "Nada que hacer" (idempotente). Con `DATABASE_URL=postgresql://…` y sin permiso: no escribe, sale con código 1 y lo explica en español.
- **`BACKFILL_PERMITIR=1` abre producción (decisión deliberada):** la acepto. El relleno post-migración *es* el caso de uso legítimo en producción, la operación es idempotente y no destructiva (recalcula columnas derivadas de la propia fila), y el permiso se evalúa antes que las dos comprobaciones, así que es un escape real y no un adorno. La asimetría con el seed (que no abre producción ni con permiso) es correcta: sembrar mentiras en producción no tiene caso de uso.
- **Residuo `U+202E` en el payload RSC:** lo ataqué yo con los 10 vectores (cierre de `<script>`, mayúsculas, comentario HTML, CDATA, U+2028, U+2029, comilla + barra, comilla simple, entidad, RLO+NUL). En los 10: HTTP 200, el número de `</script>` de la respuesta **no cambia** respecto a la base (17), ningún `<script>` contiene un `alert(`, y **0 bytes NUL** en toda la respuesta. El RLO aparece una sola vez, dentro del literal del payload. Confirmo **inocuo**.
- **Datos personales / secretos:** ningún `.env`, `.db`, log ni artefacto en el árbol. Todos los WhatsApp del diff son `771999xxxx`; los fijos, `771777xxxx` ficticios; el `*21*7710000000#` es una secuencia de desvío de un test adversarial. Sin secretos ni nombres de negocios reales.
- **Sobre-exposición:** `buscarNegociosPublicados` reusa `CAMPOS_LISTADO` y aplica `estado: publicado` por construcción; no proyecta las columnas normalizadas.

Los reportes de la etapa C cierran con **0 críticos y 0 altos**, y no queda ningún hallazgo alto/crítico sin resolver.

## Hallazgos

### D-1 · Desviación de spec (MEDIA, informativa, no bloqueante) · lista de muletillas

`src/lib/busqueda.ts:75-90` descarta ~50 palabras ("de", "la", "necesito", "arregla", "tizayuca"…) antes del `AND`. El requirement "Coincidencia insensible…" dice que se encuentran "solo los negocios que coinciden con **todas**" las palabras, y la duda 3 de `proposal.md` aprobó explícitamente "exigir todas": la spec aprobada no menciona muletillas. **No bloqueo** porque: (a) el mismo cuerpo de spec ya delega el acotamiento de términos ("se limita el número de términos que se buscan"), y esto es una regla de esa misma familia; (b) verifiqué que **ningún scenario aprobado se rompe** —"futbol infantil" sigue exigiendo las dos y "veterinario espacial" sigue devolviendo cero, de lo que depende el scenario de "sin resultados"—; (c) solo puede devolver de más, nunca de menos, y no afecta el filtro de estado; (d) remedia un defecto real (M-3) en que una consulta legítima devolvía cero. **Acción requerida al archivar:** al consolidar en `openspec/specs/directorio-publico/spec.md` hay que redactar la regla de muletillas en el requirement, o quedará como comportamiento sin spec.

### Deudas trasladadas al PR (no bloqueantes, ya decididas)

- **M-4** (`/buscar` sin cupo por IP; `better-sqlite3` es síncrono) y **B-2** (`id="buscador-q"` literal): sin spec ni ticket, van a backlog. Confirmo que ambas están documentadas en `b-dev.md` (deudas 7 y 8) y en `c-seguridad.md`.
- **Residuo de M-3 (producto):** "plomero barato", "doctor 24 horas", "cerrajeria en Huicalco" devuelven cero. Es lo que manda la spec; la mitigación (no truena, ofrece categorías) está puesta y verificada.
- **B-3 cerrado:** confirmé que los 6 archivos de test nuevos son texto para git (ningún byte de control crudo), así que el revisor humano podrá leerlos en el PR. `tests/registro-adversarial.test.ts` sigue siendo binario, pero es preexistente y ajeno a este diff.
- **Pendiente de ojos humanos:** revisión visual a 390/768/1280 px, y correr `npm run db:backfill:busqueda` después de desplegar la migración.
