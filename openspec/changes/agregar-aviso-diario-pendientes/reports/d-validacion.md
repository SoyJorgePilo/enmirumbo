# Etapa D (validación) — `agregar-aviso-diario-pendientes` (T-020)

Rama `feature/agregar-aviso-diario-pendientes`, worktree `.claude/worktrees/wt-t020`,
base propia en el puerto 51246. Entrada: los dos deltas de spec, `proposal.md`,
`design.md`, el ticket `docs/tickets/T-020-notificacion-diaria-pendientes.md` y los
reportes `b-dev.md` (vuelta 2) y `c-seguridad.md` (vuelta 2, dictamen LIMPIO).

**Los reportes se verificaron, no se creyeron.** Todo lo que sigue lo comprobé yo
contra `git diff` y contra el código, y los tres gates los ejecuté en esta máquina.

## Veredicto

**APROBADO.** Los 31 scenarios de los dos deltas tienen implementación verificable,
los 5 criterios de aceptación del ticket se cumplen, no hay scope creep, las tareas
`[x]` están hechas de verdad y los gates están en verde salvo las dos rojas conocidas
y aceptadas. Sin hallazgos bloqueantes.

## Gates (ejecutados por mí)

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, 0 errores 0 avisos |
| `npm run build` | **verde** (32 rutas; `/api/tareas/purgar-rechazados` sigue siendo la única ruta de tareas de la purga, sin ruta nueva) |
| `npm test` | **3 413 pasan, 2 saltadas, 2 rojas**: `[A1]` y `[A2]` de `tests/reportes-seguridad-adversarial.test.ts`, exactamente las dos conocidas y aceptadas (carreras contra PGlite/`prisma dev`, sin relación con este change) |

Sin dependencias nuevas: `package.json` y `package-lock.json` no aparecen en el diff.
Sin migraciones ni cambios de esquema. Ningún archivo nuevo declara `"use client"`.
Ni un `any`, ni un `ts-ignore`, ni un `eslint-disable` en todo lo añadido.

## 1. Spec — los 31 scenarios

### `revision-admin` · "Un aviso al día por correo cuando hay pendientes…" (8)

Verificado en `src/lib/avisos/pendientes.ts` y `src/lib/avisos/aviso.ts`:

- Los tres tipos cuentan y cualquiera basta: `contarPendientes` suma
  `altas + ediciones + reportes` y `avisarPendientes` solo calla con `total === 0`.
- **El conteo sale del mismo criterio que la cola, y lo comprobé en la fuente de la
  cola, no en el reporte**: la deduplicación "un negocio, un renglón" vive en
  `src/lib/admin/consultas.ts:359` (`negociosYaEnLaCola`) y el tipo lo pone la propia
  cola (`tipo: "alta"` línea 376, `tipo: "edicion"` línea 397). `contarPendientes` no
  hace más que `filter` por ese `tipo`, así que el correo no puede decir un número
  distinto al del panel. Los reportes se suman por `totalPendientes`
  (`src/lib/admin/reportes.ts:91-96`), aparte y sin restarle nada al alta.
- El día es el de Tizayuca: `Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"})`
  en `src/lib/avisos/dia.ts`, y la clave depende **solo** de la fecha, nunca de los
  conteos — que es lo que impide un segundo correo cuando entra un pendiente a media
  tarde. Sin tablas nuevas: la marca la guarda el proveedor.
- Un intento que el proveedor no aceptó no gasta el día: no hay memoria local de
  "hoy ya se intentó", así que el siguiente disparo vuelve a llamar.

Pruebas: `tests/aviso-pendientes.test.ts` (bloques 1 y 2 y el final de punta a punta)
y `tests/aviso-pendientes-tarea.test.ts`. Muestreé la de "un envío que el proveedor no
aceptó no gasta el día" (líneas 753-772) y la de "dos corridas del mismo día mandan UN
solo correo" (734-750): las dos ejercitan el camino real y afirman lo que dicen.

### `revision-admin` · "El correo dice cuántos hay, nunca quiénes son" (6)

- Comparé `src/lib/avisos/textos.ts` **carácter por carácter contra la spec**: el
  asunto singular/plural y las nueve líneas del cuerpo coinciden, en el mismo orden,
  con las líneas en cero omitidas por el `filter`.
- **Nada que no sea un número cruza la frontera.** `cuerpoDelAviso` solo interpola
  `conteo.altas/ediciones/reportes` y `urlPanel`, y `contarPendientes` devuelve cuatro
  números. No hay saneado que se pueda olvidar: no hay nada que sanear.
- El enlace es `<SITIO_URL>/admin` y nada más: sin token, sin id, sin query
  (`configuracion.ts:113`).
- Log: revisé las cinco líneas `[aviso]` (apagado, sin pendientes, mandado, 409,
  fallo del proveedor) y la del `catch` — todas son conteos, estados, `status` o
  `error.name`. El adaptador **nunca lee el cuerpo de la respuesta**, que es donde
  Resend devuelve destinatario, remitente y texto (`resend.ts:124-128`, con guardián de
  fuente y de comportamiento en las pruebas).
- Marca: `NOMBRE_REMITENTE_AVISO = "EnMiRumbo"`, sin la marca anterior ni la forma
  compuesta con la localidad.

### `despliegue` · "El aviso viaja en la tarea programada que ya existe" (6)

Leí `src/app/api/tareas/purgar-rechazados/route.ts` entero:

- El aviso se llama **después** de la puerta del secreto y **fuera del `try` de la
  purga**, así que la independencia se cumple en las dos direcciones: la purga que
  revienta ya no vuelve antes de tiempo (ahora `eliminados` es `number | null` y el
  `return` de error bajó por debajo del aviso), y un aviso fallido no deshace nada.
- `"fallido"` → 500; `"sin-configurar"` → 200. Correcto: un 500 diario por no tener
  el correo configurado entrenaría al operador a ignorar los 500.
- Límite de espera propio: `AbortController` a 5 s (`MS_LIMITE_ENVIO_CORREO`), muy por
  debajo del presupuesto de la función.
- `vercel.json`: `"17 13 * * *"` (13:17 UTC ≈ 07:17 en Tizayuca) y **siguen siendo dos
  crons**; el barrido de fotos quedó en `47 9`. Verificado en el archivo, no en el test.
- 404: la puerta no se tocó. Sin secreto no se llega al aviso, y la respuesta no gana
  ninguna cabecera ni cuerpo que delate que ahí dentro hay un correo.

### `despliegue` · "Sin la configuración del correo…" (6)

- Las **cuatro** variables en `faltantesDeCorreo`, en el orden documentado; una
  configuración a medias se trata igual que la falta total (`configuracion.ts:120-137`).
- **Ni un valor por defecto** en todo el módulo: lo verifiqué buscando en el archivo.
  `urlDelPanel` rechaza además cualquier host que no sea alcanzable desde fuera, así
  que un `SITIO_URL=http://localhost:3001` apaga el aviso en vez de mandar un enlace
  muerto.
- Constancia una sola vez por proceso (`yaSeAvisoSinCorreo`), en `warn` y no en
  `error` — no configurar el correo no es un fallo.
- `AVISOS_CORREO_DESTINO` no aparece con ningún valor en el repo: barrí `src/`, los
  seeds, `.env.example` y las suites nuevas con un regex de direcciones. Las únicas
  que salen son `@ejemplo.invalid` (RFC 2606), `enmirumbo.example` y dos preexistentes
  ajenas a este change (`contacto@enmirumbo.com` en `src/lib/legales/textos.ts`, ya en
  `main`, y un ejemplo de la documentación generada por Prisma).
- Documentación: `docs/despliegue.md` §3.2 trae las tres variables con descripción,
  valor esperado y qué pasa sin ellas, y §6.1 explica el aviso entero. El guardián de
  `tests/despliegue.test.ts` que exige documentar toda variable leída del entorno sigue
  en verde.

### `despliegue` · "La purga se dispara sola" (MODIFIED, 5)

El cuerpo de la respuesta suma `aviso` en sus tres formas, y `tests/purga-rechazados.test.ts`
pasó de un `toMatchObject` laxo a exigir el **juego exacto de claves**
(`{aviso, cuposLimpiados, eliminados, fallidos}`): la comprobación se endureció, no se
aflojó. Lo verifiqué en el diff del test.

## 2. Ticket — los 5 criterios

| Criterio | Cómo lo comprobé |
|---|---|
| Un correo al día si hay pendientes; nada si no los hay | `avisarPendientes` corta en `total === 0`; la clave del día la pone el proveedor |
| Sin datos personales | Solo números y `urlPanel` cruzan a `textos.ts`; prueba de privacidad con ficha completa + comentario de reporte (`aviso-pendientes.test.ts:684-715`) |
| Se dispara desde la infraestructura existente (`CRON_SECRET`, 404 a extraños) | Sin cron nuevo ni ruta nueva; el aviso va detrás de la puerta que ya existía |
| Proveedor configurable con el patrón fail-safe | Cuatro variables, sin defaults, log una vez, todo lo demás intacto |
| Si el envío falla, el cron responde error a la vista | `aviso === "fallido"` → 500, sin tumbar la purga ni la otra tarea programada |

## 3. Alcance

El diff toca **solo** lo que la spec pide: `vercel.json` (una línea), `.env.example`,
`docs/despliegue.md`, la ruta de la purga, `src/lib/correo/*` y `src/lib/avisos/*`
nuevos, tres suites nuevas y dos ajustadas, el ticket y `tasks.md`. Sin scope creep:
el conteo de atrasados (>48 h), las alertas de salud y el quinto estado `ya-mandado`
quedaron fuera, como manda la propuesta, aunque los tres estaban a tres líneas.

## 4. `tasks.md`

Las 16 tareas marcadas y hechas. La 5.3 lleva una corrección **anotada en el propio
archivo** (la comprobación de "sin secreto no se manda correo" no cabía en
`tests/tareas-programadas.test.ts`, que prueba la puerta del barrido de fotos): la
comprobación existe donde corresponde y el guardián original sigue intacto. Es una
corrección declarada, no una tarea sin hacer. La 7.1 deja escrito el paso de humo
11-bis y dice explícitamente que ejecutarlo depende del paso humano de Resend.

## 5. Seguridad

`c-seguridad.md` vuelta 2: **0 críticos, 0 altos, 0 medios**. Re-verifiqué por mi
cuenta lo que más pesa: cero secretos y cero datos personales reales en el diff,
ningún endpoint que sobre-exponga campos (la respuesta de la tarea son tres conteos y
un estado de cuatro valores fijos), y la credencial solo viaja a la cabecera
`Authorization` de una URL constante.

**BAJO-4 queda abierto y declarado como deuda menor** (`configuracion.ts:84-94`):
`http://[::ffff:127.0.0.1]` y `http://localhost.` con punto final esquivan la guarda de
host. El impacto máximo es un enlace muerto en el buzón del propio admin, el valor lo
escribe quien opera y no hay fuga ni SSRF. No bloquea. BAJO-2 (sin límite de tasa en
la ruta, superficie preexistente detrás del secreto) y BAJO-3 (`contarPendientes` lee
de más para no duplicar los criterios de la cola) siguen aceptados con razón escrita.

**Observación mía, no bloqueante:** cuando `SITIO_URL` está puesta pero apunta a un
host interno, el log dice "falta SITIO_URL" aunque la variable exista. Es impreciso en
la letra; `docs/despliegue.md` §3.2 lo explica y la conducta —apagar el aviso— es la
correcta. Si molesta, es una línea al consolidar.

## 6. Convenciones

Todo el texto que ve una persona está en español mexicano y con la marca EnMiRumbo.
Comentarios y nombres en español, como el resto del proyecto. Sin `any`, sin
dependencias nuevas, sin `"use client"`.

## 7. Integración con `main`

`main` avanzó durante la corrida con el rebrand y sus checkpoints (`ee772ad`,
`77211d8`, `af5cbdf`). Fusioné `origin/main` en la rama antes del PR: **sin conflictos**
—lo que se movió en `main` fueron `docs/PRD-v2.md`, un devlog y las specs consolidadas
de `openspec/specs/`, y este change no toca ninguno—. Gates re-ejecutados después de la
fusión.

## 8. Lo que el humano tiene que hacer

1. **Mergear el PR** (siempre humano) con el CI de GitHub Actions en verde: mi
   validación local no lo sustituye.
2. **Paso BLOQUEANTE DE OPERACIÓN, no de merge:** verificar `enmirumbo.com` en Resend
   con los DNS de Namecheap (`docs/despliegue.md` §6.1) y cargar las tres variables en
   Vercel. Sin eso el aviso **no opera** —el fail-safe hace lo correcto: no manda nada,
   lo dice en el log y la purga sigue igual— y el paso de humo 11-bis no se puede
   cerrar. Se puede mergear antes; simplemente el correo no sale hasta entonces.
