# Etapa D (validación) — renombrar-sitio-enmirumbo (T-019)

**Rama:** `feature/renombrar-sitio-enmirumbo` (worktree `.claude/worktrees/wt-t019`)
**Base de pruebas:** `prisma dev --name t019`, puerto **51238** (propia; no se tocó 51214 ni ninguna ajena)
**Entradas:** proposal, design, tasks, los cinco deltas de spec, `reports/b-dev.md`, `reports/c-seguridad.md` y `git diff origin/main` completo.

## Veredicto: **APROBADO**

Con dos condiciones que NO bloquean el merge y sí el despliegue o el cierre, y que
viajan en el cuerpo del PR:

1. **El buzón `contacto@enmirumbo.com` tiene que recibir antes de desplegar** (tarea 4.5,
   pendiente del fundador). El texto legal versionado ya lo publica como canal de contacto
   y de derechos ARCO.
2. **La consolidación de `openspec/specs/` tiene que aplicar T-014 y T-019 juntos** (ver
   hallazgo INFO-1).

## 1. Integración: la fusión de `main` y el barrido (el corazón de esta etapa)

`main` avanzó 25 commits desde la base de la rama: T-018 (PR #23), T-014 (PR #24), el
devlog de los dos y una nota del validador anterior. **Fusioné dos veces**: la segunda
porque `origin/main` se movió mientras corrían los gates (el devlog de T-014/T-018 y la
nota del listado). El árbol final no tiene ni una alta ni una baja respecto de `main` que
no sea de este change: `git diff origin/main --name-status` solo lista como añadidos los
dos reportes de etapa y las dos suites nuevas.

**Conflictos:** solo `docs/despliegue.md`, en dos hunks, los dos por el mismo motivo (T-018
reescribió las mismas líneas que el rebrand). Resueltos a favor de `main` en lo técnico
—TLS `verify-full` con la raíz de Supabase empaquetada, `migrate deploy` desde la raíz del
repositorio— y a favor del rebrand en el nombre del dominio y del archivo de entorno.

**El guardián hizo su trabajo.** Tras la fusión, `tests/marca-guardian.test.ts` señaló con
archivo y línea los restos que T-014 traía. **Seis literales cazados** (cinco de producto y
uno más que apareció al releer, el mensaje de "Perdí mi enlace"), más nueve dominios
ficticios:

| Dónde | Qué decía | Cómo quedó |
|---|---|---|
| `src/lib/admin/textos.ts` (aviso de cambios aplicados) | "…la ficha de «X» en NecesitoUno Tizayuca." | "…en EnMiRumbo." |
| `src/lib/admin/textos.ts` (aviso de cambios descartados) | "…para «X» en NecesitoUno Tizayuca y por ahora…" | "…en EnMiRumbo y por ahora…" |
| `src/lib/admin/textos.ts` (enlace nuevo) | "…tu ficha de «X» en NecesitoUno Tizayuca: <enlace>" | "…en EnMiRumbo: <enlace>" |
| `src/lib/admin/textos.ts` (publicación CON enlace de gestión) | "Ya quedó publicado «X» en NecesitoUno Tizayuca." | "…en EnMiRumbo." |
| `src/lib/gestion/textos.ts` ("Perdí mi enlace") | "Hola, soy de «X» en NecesitoUno Tizayuca y perdí…" | "…en EnMiRumbo y perdí…" |
| `tests/gestion-textos.test.ts` | las cinco aserciones que fijan esos literales | actualizadas junto con el literal, **ninguna borrada ni relajada** |
| `tests/gestion-token.test.ts`, `gestion-panel`, `admin-listado-paginas`, `admin-listado-seguridad-adversarial` | `https://necesitouno.example` | `https://enmirumbo.example` |

**Regla de marca aplicada:** los cinco son mensajes a alguien que ya recibió la presentación
del directorio (o que la escribe él mismo), así que van con **la marca sola**. El descriptor
sigue apareciendo únicamente en las tres primeras menciones que la spec fija: aviso,
términos y el mensaje de verificación del panel. La forma compuesta no aparece en ninguna
superficie. La semántica y el URL-encoding de T-014 quedaron intactos: solo cambió el
nombre dentro de la cadena, y los mensajes siguen pasando por `encodeURIComponent`.

**Un defecto de integración más, encontrado por el gate y no por el barrido:**
`tests/aviso-version.test.ts` fija la lista de migraciones (prueba de que estrenar versión
no reescribe constancias). La migración del enlace de gestión de T-014 la dejó desfasada y
la suite se puso en rojo. Corregido agregando el renglón, **no** aflojando la aserción a un
`toContain`: eso dejaría entrar cualquier migración futura sin que nadie la mire, que es lo
contrario de lo que la prueba existe para hacer.

**El guardián, probado por mutación sobre el árbol fusionado** (no sobre un doble): volví a
poner "en NecesitoUno Tizayuca" en `src/lib/gestion/textos.ts:69` y la suite se puso en rojo
con `src/lib/gestion/textos.ts:69 — apareció la marca anterior`. Mutación revertida y árbol
verificado idéntico.

## 2. Verificación independiente (no me creí los reportes)

| Qué verifiqué | Cómo | Resultado |
|---|---|---|
| Huella ↔ versión 2 intacta tras la fusión | recalculé la huella yo mismo (SHA-256 sobre las 54 piezas unidas por el separador nulo) contra el renglón anclado | `VERSION=2`, `PIEZAS=54`, huella `1f3349078d0a…57ee0` = la anclada. La fusión no tocó texto versionado y **no hizo falta re-anclar nada** |
| La huella de la `1` no se re-ancló | `git show origin/main:tests/aviso-version.test.ts` | renglón `["1", "08ce983c…62d5f"]` idéntico al de `main` |
| `PLACEHOLDERS_LEGALES` = 5 | leí la constante en tiempo de ejecución, no el diff | 5: nombre, domicilio, WhatsApp, fecha de publicación y jurisdicción. Ningún correo |
| El correo publicado | conteo sobre el contenido versionado | 2 apariciones en el aviso + 1 en los términos = las tres que pide la spec |
| Rutas idénticas | `next build` (35 rutas) y `git diff origin/main --name-status` sobre `src/app` | **ninguna alta ni baja de archivo de ruta**: el listado del build es el de `main` con las rutas de T-014 dentro |
| Docs vivos con la marca nueva | censo a mano (el guardián no mira `docs/`, y es correcto que no lo haga) | limpio. Quedan a propósito: la nota de rebrand del PRD y su registro de cambios v0.7, y la instrucción `prisma dev stop necesitouno` de `docs/despliegue.md`, que existe justo para parar la base vieja |
| Historia intacta | `git diff origin/main --name-only -- docs/devlog docs/decisiones openspec/changes/archive docs/metricas-pipeline.md` | vacío |
| Archivos que `git grep` trata como binarios (`tests/seo-adversarial.test.ts`, `tests/foto-adversarial.test.ts`) | `grep -a` explícito | sin marca vieja. Son "data" también en `main`: no lo introdujo este change |
| Datos personales y secretos en el diff | barrido de correos y de secuencias de 10 dígitos sobre todas las líneas añadidas | correos: solo `contacto@enmirumbo.com` y dominios `.example`; teléfonos: solo las series ficticias `7710019xxx` y `7719992100`, ya convencionales en la suite |
| Sin dependencias nuevas ni `any` | `git diff origin/main -- package.json`, barrido de `any` en las líneas añadidas | cero y cero |

**Muestreo de scenarios** (no revisé los 100 por igual; fui a los que, si estuvieran mal,
nadie notaría hasta producción): el wordmark del header y la línea de cierre del footer
carácter por carácter; la plantilla `%s — EnMiRumbo` en una página con título propio; el
`alt` de la imagen Open Graph; el literal del mensaje del vecino; los cuatro mensajes del
panel con el descriptor solo en el de verificación; el aviso simplificado completo; la línea
"Estás aceptando la versión 2"; y que una constancia de la versión `1` se siga mostrando
como `1` en el panel.

## 3. Hallazgos

Ninguno bloqueante. Cero críticos, cero altos, cero medios.

### INFO-1 · La consolidación de `openspec/specs/` tiene una deuda de T-014 y ahora se cruza con esta

`openspec/specs/revision-admin/spec.md` sigue siendo el de antes de T-014: su checkpoint
(`6aba667`) archivó el change pero **no consolidó sus deltas** (el commit solo mueve
archivos y toca el ticket). Consecuencia para el cierre de este change: el requirement "Al
aprobar se ofrece avisarle al negocio por WhatsApp con el link de su ficha" lo MODIFICAN los
dos changes —T-014 para agregarle el enlace de gestión, T-019 para cambiarle la marca—, así
que al consolidar hay que aplicar **primero T-014 y encima la regla de marca**, nunca T-019
sobre el texto viejo: eso borraría el enlace de gestión de la spec. El código ya está bien
(el panel usa el mensaje con enlace cuando hay token y el otro cuando no, y los dos llevan
la marca nueva); lo que falta es papel. No lo arreglo aquí porque consolidar cuatro
capacidades ajenas dentro de este PR es scope creep.

### INFO-2 · Dos tareas siguen abiertas, las dos del humano

- **4.5** — el buzón `contacto@enmirumbo.com` tiene que recibir **antes del despliegue**. El
  paso está en la prueba de humo (`docs/despliegue.md` §9, punto 8-bis).
- **10.2** — revisión visual a 390px del wordmark nuevo. Ningún agente de esta corrida tuvo
  navegador. El riesgo de desbordamiento es bajo ("EnMiRumbo" son 9 caracteres contra 11,
  con el mismo estilo), pero el ritmo tipográfico de las dos mayúsculas internas es cuestión
  de gusto y la decide el fundador. Va en el PR.

### INFO-3 · El wordmark dibujado de la imagen Open Graph no está automatizado

Declarado por la etapa B y confirmado por mí: lo que se prueba es el `alt`, el tamaño, el
tipo y la ausencia de marca vieja o compuesta en el literal. Que "Tizayuca" se **lea** como
línea de contexto debajo del wordmark y no como apellido se mira a ojo abriendo
`/opengraph-image`, junto con la tarea 10.2. Automatizarlo exigiría rasterizar y comparar
píxeles: una dependencia nueva y una prueba frágil para verificar una decisión tipográfica.

## 4. Gates (los corrí yo, sobre el árbol ya fusionado)

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, sin salida |
| `npm run build` | **verde**, 35 rutas, sin advertencias nuevas (hizo falta `npx prisma generate`: el cliente del worktree era anterior al modelo de T-014) |
| `npm test` | **110 archivos · 3244 pasan · 2 fallan · 2 omitidas**. Las dos que fallan son `[A1]` y `[A2]` de `tests/reportes-seguridad-adversarial.test.ts` |

**Sobre `[A1]`/`[A2]`, verificado y no asumido:** corrí ese archivo solo cuatro veces —dos
sobre la rama (2 fallos, luego 1) y **una sobre `origin/main` en limpio, con la rama
descartada, donde también falló uno**. Son carreras del motor local contra la base de
`prisma dev`, preexistentes y ajenas a este change, que no toca ni el cupo de reportes ni el
tope por negocio. **El CI de GitHub Actions es la palabra final**: mi corrida local no lo
sustituye y el PR no se mergea con el CI en rojo.
