# Reporte de validación — agregar-panel-admin

**Etapa D (validador).** Ticket `docs/tickets/T-005-panel-admin.md` · rama `feature/agregar-panel-admin` · 2026-09-03.

> **Veredicto: APROBADO en primera pasada.** 0 hallazgos bloqueantes. 3 notas
> informativas y 1 corrección editorial aplicada por mí (abajo). Los reportes de
> las etapas A, B y C se leyeron, pero nada de lo que sigue se da por bueno
> porque ellos lo digan: todo está re-verificado por mi cuenta, con la base y el
> sitio corriendo.

## 1. Spec → diff (15 requirements, 64 scenarios)

`revision-admin` 13 req / 49 sc · `modelo-datos` MODIFIED 1/7 · `registro-negocio`
MODIFIED 1/8. Recorrí los 64 scenarios contra `git diff main` más los archivos
nuevos. **Todos tienen implementación verificable**, y 63 los comprobé además a
mano contra un servidor real (`next start`, build de producción, base SQLite
propia sembrada con datos de mentira). Muestra de lo verificado en vivo:

| Scenario | Cómo lo comprobé | Resultado |
|---|---|---|
| entrar con la contraseña correcta | POST del formulario sin JavaScript | `Set-Cookie: nu_panel=<epoch+8h>.<hmac>; Path=/admin; Max-Age=28800; Secure; HttpOnly; SameSite=lax` — sin la contraseña dentro |
| contraseña equivocada | POST | `303 → /admin?error=incorrecta`, sin cookie |
| cookie manipulada / caducada / inventada | 3 peticiones con cookies fabricadas | las tres → `/admin`, idénticas entre sí |
| intentos repetidos | 5 POST fallidos + 1 con la contraseña correcta, misma IP | el sexto → `?error=intentos` **aunque la contraseña era la buena**; otra IP entra normal |
| la contraseña no aparece en el log | `grep` de la contraseña, del intento y de la cookie en el log completo | 0 coincidencias |
| sin contraseña configurada | servidor arrancado sin las variables | "El panel no está disponible por ahora.", **sin `<input>`**; el log dice qué falta, la respuesta no |
| ninguna transición sin configuración | POST de aprobar con el panel apagado | nada cambia en la base |
| cola / detalle / aprobar / rechazar sin sesión | 4 peticiones sin cookie | `307 → /admin`; 0 datos del registro en el cuerpo; base intacta |
| detalle de un id concreto sin sesión | id existente vs. inventado | respuesta idéntica: no delata si existe |
| metadata de no indexación | las 6 pantallas | `<meta name="robots" content="noindex, nofollow"/>` |
| sin enlaces desde lo público | home, listado, ficha, registro, gracias | 0 menciones de `/admin` |
| orden de la cola | 4 pendientes | del más viejo al más nuevo, con "Hace 34 días / 2 días / 3 horas / 1 hora" |
| indicador de 48 h | 60 h vs. 3 h | "Lleva más de 48 horas" solo en el atrasado + "2 registros llevan más de 48 horas esperando." |
| detalle completo / solo obligatorios | dos registros | todo lo capturado + estado, origen, fecha de registro y **fecha del consentimiento**; los vacíos como "No capturado" |
| número que no se puede interpretar | registro con WhatsApp `123` | sin enlace `wa.me`, muestra el número guardado |
| más de tres giros / colonia pendiente | POST con 4 giros; POST sin colonia | "Elige máximo 3 giros" / "Elige la colonia de este negocio", base sin cambios |
| giro inexistente y id desmesurado | `giro=9999`, `giro=99999999999999999999999` | error de formulario, **sin 500** (corrección del MEDIO 1 de la etapa C) |
| aprobación completa | 2 giros, colonia del catálogo, "Lo sembramos nosotros" | `publicado` + fecha, giros 1-2, `origen=siembra`, `coloniaOtra` conservada; `diff` de los datos capturados antes/después: solo cambia `origen` |
| doble aprobación | mismo POST otra vez con otros valores | `→ ya-resuelto`; fecha, giros, colonia y origen originales intactos |
| aviso de publicación | pantalla `/aprobado` | "Ya quedó publicado." + `wa.me` con el texto literal y `https://necesitouno.example/negocio/tacos-del-gueero-atrasado01`; **esa ruta responde 200 con la ficha real** |
| rechazo sin motivo / con motivo | POST con motivo en blanco y con motivo | "Escribe por qué lo rechazas" / `rechazado` + fecha + motivo; el aviso `wa.me` interpola el motivo |
| rechazar algo ya resuelto | segundo rechazo con otro motivo | `→ ya-resuelto`, el motivo original no se pisa |
| el rechazado no se publica | ficha pública del rechazado | **404**, y sale de la cola |
| reenvío tras un rechazo | formulario público, mismo número | vuelve a `en_revision` con los datos nuevos, `rechazadoEn`/`motivoRechazo` en nulo, `registradoEn` reiniciado, `tokenGestion` y `origen` intactos, pantalla de gracias sin una palabra del rechazo |
| el reenvío pasa por las mismas defensas | campo trampa `sitio_web` lleno; IP sin cupo | en ambos casos **la ficha rechazada no cambia** |
| salir del panel | POST a la acción | `nu_panel=; Max-Age=0` con los mismos atributos + "Cerraste sesión." |
| migración sobre base con datos | base con la migración inicial, 3 negocios en los 3 estados, luego la migración nueva | 3 filas intactas, campos nuevos nulos, `integrity_check ok` y el CHECK de `estado` sigue vivo (`estado='inventado'` falla) |

**El único scenario que no pude cerrar yo:** "revisar desde el celular" (390px,
áreas táctiles, contraste AA). Verifiqué lo verificable en el marcado
(`min-h-11` en botones, casillas y radios; sin anchos fijos; `overflow-y-auto`
en la lista de giros) pero **la comprobación visual real es del humano del PR**.

## 2. Ticket

Los 8 criterios de aceptación se cumplen y quedan marcados en el ticket. El de
mobile-first va marcado "por construcción", con la revisión visual anotada como
pendiente humano. Nada de lo que el ticket lista como fuera de alcance aparece
en el diff (sin botón "Reportar", sin purga, sin enlace de gestión, sin edición
de datos por el admin, sin multi-admin ni auditoría).

## 3. Alcance

El diff hace lo que la spec pide y nada más, con dos añadidos que reviso aquí en
voz alta porque no salen de los requirements:

1. **`.gitignore` + `eslint.config.mjs` ignoran `.claude/*`** (con negación para
   `agents/` y `commands/`). No lo pide la spec: sale del ALTO 1 de la etapa C.
   Lo verifiqué yo: `git check-ignore` confirma que `.claude/worktrees/`, sus
   `.next/` y sus `prisma/dev.db` quedan fuera, mientras `.claude/agents/*.md` y
   `.claude/commands/*.md` siguen versionados. Sin esa regla, un `git add -A`
   publicaría cientos de MB **y una base de datos con datos de negocios en un
   repo público** — regla dura de CLAUDE.md + LFPDPPP. Lo acepto como higiene de
   repositorio y lo separo en su propio commit `chore:` para que la historia no
   lo disfrace de feature.
2. **Fila E3-6 en `docs/backlog.md`** (borrado ARCO desde el panel): es la
   consecuencia registrada de lo que la propuesta dejó fuera. Bookkeeping, no
   código.

El refactor de `src/lib/registro/limite-ip.ts` a la fábrica `crearCupoPorIp`
**sí** está en alcance: lo pide `design.md` §4 (reutilizar el cupo con ventana
propia) y no cambia el comportamiento del cupo público —lo comprobé en vivo: 3
altas por hora y por IP, la cuarta rebota, y agotar los intentos del panel no
consume el cupo de altas.

## 4. tasks.md

26 tareas, todas `[x]` y todas realmente hechas (cada una tiene archivo y test
que la sostienen; muestreé la #1, #6, #11, #17, #22 y #24 contra el código).

**Corrección editorial que apliqué yo:** la tarea #22 seguía diciendo que el
reenvío "actualiza la constancia de consentimiento", que es exactamente lo que
la enmienda del `design.md` §6 (iteración 2 de seguridad, aprobada) dejó de
hacer. `design.md` ya estaba enmendado; `tasks.md` no. Es el residuo del BAJO 4
de c-seguridad, y como `openspec/` se consolida al archivar, lo dejé alineado
con el código en vez de heredar una decisión que el código no cumple.

## 5. Seguridad

El reporte de la etapa C cierra con **0 críticos, 0 altos y 0 medios abiertos**
(1 alto y 4 medios corregidos y re-verificados en la iteración 2). No lo di por
bueno: re-verifiqué el alto y los cuatro medios uno por uno contra el código y
el servidor (ver tabla del §1: fail-safe, id desmesurado sin 500, escritura
condicionada en el reenvío, aviso del límite sin IP, y `consintioAvisoEn`
preservada tras un reenvío ajeno).

Revisión propia del diff, además de eso:

- **Sin secretos**: `git diff` + archivos nuevos, 0 coincidencias de credenciales
  con valor. `.env.example` trae las tres variables nuevas **comentadas y
  vacías**, y `.env` y `prisma/*.db` siguen ignorados.
- **Sin datos personales reales**: todos los WhatsApp son de la serie ficticia
  `771999xxxx`; los fijos siguen la convención `77177xxxxx` que ya usaba `main`.
- **Sin endpoints que sobre-expongan**: `src/lib/admin/consultas.ts` es el único
  módulo que lee sin filtro de `publicado`, ninguna página pública lo importa, y
  el `select` del detalle es explícito. Confirmé en vivo que la ficha pública del
  negocio recién aprobado **no** trae colonia sin normalizar, consentimiento,
  origen ni estado.
- **Log limpio**: recorrí el log del servidor tras acceso, cola, detalle,
  aprobación, rechazo y reenvío. Solo eventos (`[panel] acceso rechazado: …`,
  `[registro] envío descartado: campo trampa lleno`). Cero nombres, números,
  direcciones, motivos o cookies.
- **Acciones como endpoints propios**: el POST directo a aprobar y a rechazar sin
  cookie no toca la base ni devuelve datos. El argumento ligado (`id`) viaja en
  claro en el formulario, pero cambiarlo no da nada: sin sesión la guarda corta
  antes, y con sesión el admin ya está autorizado sobre cualquier registro.

## 6. Compuertas mecánicas (corridas por mí, en este working tree)

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio, sin warnings |
| `npm run build` | compila; TypeScript sin errores; las 6 rutas del panel salen **`ƒ` (dinámicas)** — ninguna se prerenderiza |
| `npm test` | **670 pruebas / 26 archivos, todas en verde** (7.02s) |
| migración sobre base con datos | probada a mano fuera de la suite (ver §1) |

## 7. Convenciones

- UI en español mexicano; los 28 literales y las 3 plantillas de WhatsApp
  coinciden con la spec — verifiqué los tres mensajes **decodificando la URL
  `wa.me` real** que sirve el panel, no solo el módulo de textos.
- **Cero `any`** en `src/app/admin`, `src/components/admin` y `src/lib/admin`.
- **Cero `"use client"`** en el panel: todos los flujos se operan con `curl`, que
  es la prueba de que funcionan sin JavaScript.
- **Sin dependencias nuevas**: `package.json` idéntico a `main`. La sesión es
  HMAC de `node:crypto`, como pedía el ticket.

## Notas informativas (ninguna bloquea)

1. `FormularioRechazar` acepta `motivoPrevio`, pero el detalle nunca se lo pasa:
   si el rechazo vuelve con error, el admin reescribe el motivo. El prop queda
   como gancho sin usar; la spec no exige conservarlo (sí lo exige para los
   giros, y ahí sí se conserva).
2. En la tarjeta de la cola, "Revisar →" es visible pero `aria-hidden`: el enlace
   se anuncia con el nombre del negocio. Es el mismo patrón de
   `tarjeta-negocio.tsx`, así que es consistente; vale la pena mirarlo cuando se
   revisen los lectores de pantalla del sitio completo.
3. Los cinco BAJOS de la etapa C quedan rastreados en el cuerpo del PR con dueño;
   dos de ellos (límite atado al proxy → E0-3, renovación de consentimiento →
   ticket propio) no se cierran en este change a propósito.

## Recordatorio

Esta validación es local. **El CI de GitHub Actions tiene que quedar en verde en
el PR**, y el merge lo hace un humano — nunca yo.
