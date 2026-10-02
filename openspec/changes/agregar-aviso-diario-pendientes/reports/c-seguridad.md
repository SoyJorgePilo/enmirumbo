# Etapa C (seguridad y pruebas adversariales) — `agregar-aviso-diario-pendientes` (T-020)

Rama `feature/agregar-aviso-diario-pendientes`, worktree `.claude/worktrees/wt-t020`,
base propia en el puerto 51246. Entrada: `proposal.md`, `design.md`, los dos deltas
de spec y `reports/b-dev.md` (con su mapa scenario→prueba y el hallazgo del 409).
Superficie auditada: el diff completo contra `main` —`src/lib/correo/*`,
`src/lib/avisos/*`, `src/app/api/tareas/purgar-rechazados/route.ts`, `vercel.json`,
`.env.example`, `docs/despliegue.md`— más las suites nuevas.

> **Estado tras la vuelta 2 (al final del documento):** los dos medios y el bajo del
> cuerpo sin drenar están **cerrados y re-verificados de forma independiente**.
> **Dictamen final: LIMPIO, pasa al validador.** Lo que sigue a continuación es el
> informe de la vuelta 1, que se conserva íntegro como expediente.

## Dictamen (vuelta 1)

**PASA.** Ningún hallazgo crítico ni alto. Dos hallazgos **medios** (uno es la deuda
que la etapa B ya declaró; el otro es nuevo), ninguno bloqueante: ni fugan datos
personales, ni exponen la credencial, ni abren una vía de disparo.

| Severidad | Cuántos |
|---|---|
| Crítico | 0 |
| Alto | 0 |
| Medio | 2 |
| Bajo / observación | 3 |

## Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, 0 errores 0 avisos |
| `npm run build` | **verde** |
| `npm test` (con la suite nueva) | 3338 pasan, 2 saltadas, **1 roja**: `[A1]` de `tests/reportes-seguridad-adversarial.test.ts`. Es una de las dos rojas conocidas y aceptadas (carreras contra PGlite). Corrida de referencia ANTES de tocar nada, sobre la misma base: 3300 pasan, rojas `[A1]` y `[A2]`. Ninguna suite se rompió por lo añadido. |

## 1. Lo que se atacó y aguantó

Resumen de la auditoría por superficie. Todo lo de esta sección quedó **verificado
con prueba**, no solo leído.

### Fuga de datos personales (LFPDPPP, PRD §8)

- **El correo no cambia ni un byte por lo que traiga la cola.** Sembrando un negocio
  cuyo nombre lleva CRLF + `Bcc:` + `Subject:` + `<script>` + un override
  bidireccional (U+202E) + emoji + `"; DROP TABLE Negocio; --`, y un reporte con
  comentario que intenta abrir encabezados, el JSON que sale hacia el proveedor es
  **idéntico** al de una cola con nombres normales: `subject`, `text`, `to` y `from`
  exactos, y solo esas cuatro claves. El corte está en el diseño, no en un
  saneado: `contarPendientes` (`src/lib/avisos/pendientes.ts:38-49`) devuelve cuatro
  números y `textos.ts` solo interpola números y `urlPanel`. **Ningún string de
  origen ajeno cruza la frontera**, así que no hay nada que escapar.
- **El log tampoco.** Ni `[aviso]` ni `[purga]` imprimen nombres, WhatsApp, colonias,
  comentarios ni ids en ningún camino (éxito, sin pendientes, sin configurar, fallo
  del proveedor, base caída).
- **La respuesta HTTP tampoco.** Comprobado el juego exacto de claves en las tres
  formas que puede tomar: `{eliminados, fallidos, cuposLimpiados, aviso}` y
  `{error, aviso}`. `aviso` es un estado de cuatro valores fijos.
- **El enlace del correo es `<origen>/admin` y nada más**: sin token, sin id, sin
  query. No hay enlace de gestión ni dato interno dentro.

### La credencial (`RESEND_API_KEY`)

- El nombre de la variable solo aparece en `src/lib/correo/configuracion.ts`; el valor
  solo viaja a la cabecera `Authorization` de `api.resend.com`.
- **Los caminos de error son los que importaban y están limpios.** El adaptador
  **nunca lee el cuerpo de la respuesta del proveedor** (`src/lib/correo/resend.ts:66-76`):
  registra el `status` y ya. Probado con un 422 que devuelve el payload entero de
  vuelta (destinatario, remitente, `Authorization: Bearer …` y el texto del correo
  dentro del `message`) y con un 401 que repite la llave: en el log queda `422` /
  `401` y nada más.
- **El `catch` del `fetch` registra `error.name`, nunca `error.message`**
  (`resend.ts:77-84`). Probado con un `TypeError("Invalid header value: Authorization:
  Bearer <llave>…")` —el error exacto que produciría una llave con un salto de línea
  dentro— y con un rechazo que ni siquiera es un `Error` y lleva la llave en el
  texto: no se filtra en ninguno de los dos.
- `descripcion()` del puerto no lleva credenciales ni direcciones (ya probado en la
  etapa B).

### El endpoint del cron

- **No hay vía nueva de disparo:** no se declara ruta propia (hay guardián en
  `tests/despliegue.test.ts`) y el aviso ocurre *después* de la puerta del secreto.
- El 404 fail-closed sigue en pie contra **9 variantes** de encabezado (sin
  encabezado, secreto truncado, con sufijo, `bearer` en minúsculas, doble espacio,
  `Basic`, mayúsculas, `Bearer ` vacío y el secreto pelón): en ninguna se cuenta la
  cola, se toca la red ni se escribe una línea `[aviso]` que delate que ahí dentro
  hay un correo. La comparación sigue siendo de tiempo constante
  (`src/lib/tareas/secreto.ts:58-67`).
  *Precisión:* `Bearer <secreto> ` con espacio final **sí** entra, porque el propio
  HTTP recorta los espacios del valor del encabezado: es el secreto correcto, no un
  bypass (queda anotado en la prueba para que nadie lo lea como hallazgo).
- **Inundación de correos: acotada por la idempotencia.** 20 disparos seguidos con
  el secreto correcto → 20 peticiones al proveedor, **una sola clave**, **un solo
  correo** y ningún 500. Y un pendiente nuevo entre disparo y disparo cambia el
  asunto pero **no** la clave, así que no abre la puerta a un segundo correo.

### SSRF / inyección

- La URL del proveedor es una constante (`URL_API_RESEND`); nada de lo que viene de
  la base o del entorno decide a dónde se conecta.
- `SITIO_URL` pasa por `new URL(...)` con lista blanca de esquemas `http:`/`https:`
  y se reduce a `.origin`. Probado que quedan apagados `javascript:`, `data:`,
  `file:`, `ftp:`, `//host`, texto que no es URL y el vacío; que un `SITIO_URL` con
  **usuario y contraseña** dentro no mete la contraseña en el correo; que ruta,
  query, ancla y `../` se pierden en el origen; y que un salto de línea (el intento
  de colar una segunda línea "Entra al panel: https://phishing.example") no produce
  ni CRLF en el enlace ni el host del atacante.
- Las cuatro variables se leen recortadas: ningún valor de configuración llega con
  `\r` o `\n` a una cabecera.
- Cero SQL cruda, cero `dangerouslySetInnerHTML`, cero componentes nuevos: el
  correo es texto plano y el adaptador no manda `html`.

### Fail-safe e independencia de los dos trabajos

- Configuración a medias = configuración ausente, con el nombre de la variable que
  falta —**nunca su valor**— en el log, una vez por proceso.
- **Sin configuración no se lee ni una fila de la base** (minimización real, no
  declarada): con un cliente de mentiras que apunta cada lectura, `avisarPendientes`
  con el entorno vacío no hace ninguna.
- Purga y aviso no se tumban en ninguna de las dos direcciones (los cuatro cruces ya
  los probó la etapa B; aquí se añadió el quinto caso, el de la base caída).

### Zona horaria

- Barrido de **un año completo** sobre la medianoche de Tizayuca: en cada frontera
  (00:00:00.000 local y el milisegundo anterior) el día cambia exactamente una vez,
  **ni un día repetido ni uno saltado**, 365 fechas distintas.
- Los 1 440 minutos de un mismo día local comparten una única clave.
- La clave es **ASCII imprimible**, ≤256 caracteres y válida como cabecera HTTP en
  400 días seguidos (`new Headers(...)` no truena). Esto no es paranoia: si el
  formato de `Intl` devolviera un espacio fino o una marca de dirección —cosa que
  pasa en otros locales—, `fetch` reventaría y el aviso fallaría **todos los días**
  sin que el motivo se entendiera.

## 2. Hallazgos

### MEDIO-1 — `mandado` puede significar "nunca salió" cuando el proveedor cachea un error bajo la clave del día

`src/lib/correo/resend.ts:67-72` (traducción `409 → "mandado"`), con efecto en
`src/app/api/tareas/purgar-rechazados/route.ts:104` (status 200).

**Escenario:** día D, primer disparo; Resend responde un error que **sí** queda
guardado bajo la clave `enmirumbo-pendientes-D` (el caso realista es el 4xx de
configuración: dominio sin verificar, remitente inválido). La tarea responde 500 y
el operador lo ve. Alguien reintenta —el cron tras el 500, o el `curl` de
`docs/despliegue.md` §6— y ahora los conteos son otros, así que el cuerpo cambia:
Resend contesta `409 invalid_idempotent_request` y el adaptador lo traduce a
`mandado`. **La tarea responde 200 con `"aviso":"mandado"` y al buzón no llegó
nunca nada**, durante las 24 h que dura la clave. El admin se queda sin aviso y el
tablero dice que todo salió.

No es fuga ni escalada: es el estado mintiendo justo en el sentido peligroso
(verde cuando está roto), y el requirement "Cuando el envío falle … la respuesta NO
DEBE ser de éxito" queda cubierto solo por el primer intento. La etapa B ya lo
declaró como deuda ("el estado `mandado` miente un poco en el caso 409") y la
propuesta asumió el riesgo del proveedor; se registra aquí con severidad para que la
decisión sea explícita y no herencia de un párrafo.

**Sugerencia (del dev, no de esta etapa):** hoy el 409 se registra con `console.log`;
subirlo a `console.warn` y decir en la línea que **este** disparo no mandó nada
cuesta una línea y deja rastro. El quinto estado (`ya-mandado`) sí pide spec.

### MEDIO-2 — el guardián de "localhost no vale" solo cubre el literal por defecto

`src/lib/correo/configuracion.ts:58-63`, en concreto
`if (origen === null || origen === URL_SITIO_LOCAL) return null;`.

La comparación es contra la cadena exacta `http://localhost:3000`. Verificado
ejecutando `configuracionDeCorreo` con otros valores:

| `SITIO_URL` | Resultado |
|---|---|
| `http://localhost:3000` | apagado (correcto) |
| `http://localhost:3001` | **`http://localhost:3001/admin` en el correo** |
| `http://localhost` | **`http://localhost/admin` en el correo** |
| `http://127.0.0.1:3000` | **`http://127.0.0.1:3000/admin`** |
| `http://[::1]:3000` | **`http://[::1]:3000/admin`** |
| `http://0.0.0.0:3000` / `http://192.168.1.50:3000` | pasan igual |

**Escenario:** quien desarrolla o quien despliega en preview pone
`SITIO_URL=http://localhost:3001` (el puerto 3000 estaba ocupado) o
`http://127.0.0.1:3000`, deja las tres variables del correo puestas y el aviso sale
todos los días con un enlace que desde el celular del admin no lleva a ningún lado.
Es exactamente lo que la decisión 2 de la etapa B dice evitar ("`localhost` no vale
ni en desarrollo") y lo que el requirement resume como "ni un enlace a `localhost`".
La spec solo fija el caso de la variable ausente, así que la letra se cumple; el
propósito, no.

No hay fuga (el valor lo pone quien opera, no un atacante) ni riesgo de SSRF: la
única petición saliente va a la URL fija de Resend.

**Sugerencia:** comparar por *hostname* (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`)
en vez de por el origen literal. **No se añadió prueba que fije la conducta actual
a propósito**, para que el arreglo no tenga que pelearse con un test que consagra el
defecto.

### BAJO-1 — el cuerpo de la respuesta del proveedor nunca se drena

`src/lib/correo/resend.ts:50-76`: se lee `respuesta.ok` / `respuesta.status` y el
cuerpo se queda sin consumir ni cancelar. **Es lo correcto para la privacidad** (por
eso no se toca) y en serverless da igual porque la función termina; en un despliegue
de Node de vida larga —que ADR-007 deja abierto— es un stream por día que espera al
recolector. Si algún día molesta, `void respuesta.body?.cancel()` lo cierra sin leer
nada.

### BAJO-2 — la ruta no tiene límite de tasa (superficie señalada, no implementada)

Cada disparo autorizado hace un barrido de la purga, lee la cola entera y abre una
petición saliente. La idempotencia acota los **correos** a uno al día, no las
**peticiones**. Está detrás del secreto y es superficie preexistente, así que se
señala y no se implementa nada sin spec (regla del rol).

### BAJO-3 — `contarPendientes` trae a memoria nombres y colonias que no usa

`src/lib/avisos/pendientes.ts:39-42`. Ya está razonado y aceptado en la etapa B
(decisión 6): reutilizar las funciones de la cola es lo que impide que el correo y
el panel digan números distintos. Se confirma que **nada de eso sale del módulo**
(probado en el correo, en el log y en el conteo serializado). Se anota solo para que
quede en el expediente de minimización de datos, no como algo que corregir hoy.

## 3. Scenarios sin prueba detectados

El mapa de la etapa B cubre **los 31 scenarios** de los dos deltas (8 + 6 de
`revision-admin`; 6 + 6 + 5 de `despliegue`, estos últimos del requirement MODIFIED). Lo único que
queda fuera de la automatización es la mitad manual de "el enlace lleva al panel de
verdad" (tocar el enlace desde el celular), que ya vive como paso 11-bis de la
prueba de humo — correcto, no es hallazgo.

Sí aparecieron **tres ramas del código nuevo sin ninguna prueba**, dos de ellas con
consecuencia directa sobre requirements de la spec. Las tres quedan cubiertas por la
suite añadida:

1. **`contarPendientes` falla (base caída) → `fallido`.** Es la decisión técnica 4 de
   la etapa B y no tenía prueba: nadie verificaba que el mensaje del driver —que
   trae la cadena de conexión con contraseña— no acabara en el log.
2. **La rama `eliminados === null` de la ruta** (`route.ts:75-80`), la que devuelve
   `{error, aviso}`. Las pruebas de la etapa B cubren "purga incompleta"
   (`fallidos > 0`) pero no "la purga revienta", que es una **forma de respuesta
   distinta** y cae bajo el requirement "ni la respuesta ni el log DEBEN traer …".
3. **"Sin configuración ni siquiera se leen datos personales"**, afirmado en la
   cabecera de `src/lib/avisos/aviso.ts` y no comprobado por nadie.

## 4. Pruebas adversariales añadidas

Archivo nuevo: **`tests/aviso-pendientes-adversarial.test.ts`** — 37 pruebas, **las
37 en verde**. No repite nada de la etapa B. Datos 100 % ficticios (serie
`771998 5xxx`, direcciones `@ejemplo.invalid` del RFC 2606).

| Bloque | Qué ataca | Pruebas |
|---|---|---|
| 1. Contenido hostil en la cola | nombre con CRLF + `Bcc:`/`Subject:` + `<script>` + U+202E + emoji + `DROP TABLE`; comentario de reporte con encabezados dentro | 4 |
| 2. Caminos de error del proveedor | 422 con el payload de vuelta, 401 repitiendo la llave, error de red con la credencial en el mensaje, rechazo que no es `Error`, y la respuesta HTTP de la tarea en ese día | 5 |
| 3. La marca del día | ASCII imprimible + `new Headers` 400 días seguidos; frontera de la medianoche local un año entero; los 1 440 minutos de un día; el cruce de las 00:00 | 4 |
| 4. Variables hostiles | 10 valores de `SITIO_URL` que deben apagar el aviso, credenciales en la URL, ruta/query/ancla, 4 formas de salto de línea, recorte de las cuatro variables, y que lo que se dice del hueco sean nombres y no valores | 18 |
| 5. Aviso apagado | ni una lectura a la base sin configuración; contar revienta → `fallido` sin filtrar la cadena de conexión | 2 |
| 6. La ruta bajo presión | 20 disparos → un correo; pendiente nuevo a media tarde; 9 variantes de encabezado contra el 404; base caída → 500 con `{error, aviso}` y sin rastro del driver | 4 |

Ningún archivo de producción se tocó en esta etapa (el rol solo escribe pruebas).

## 5. Para el validador

- Pase concedido: **0 críticos, 0 altos**.
- Los dos medios son de conducta, no de exposición: **MEDIO-2** es el único defecto
  nuevo que conviene que el dev corrija antes del PR (tres líneas y una prueba);
  **MEDIO-1** es la deuda ya declarada y su arreglo barato es subir el 409 a `warn`.
- Sigue en pie el **paso humano bloqueante** que la etapa B anotó: verificar
  `enmirumbo.com` en Resend antes del merge, o el paso 11-bis de la prueba de humo
  no se puede cerrar. Hasta entonces el fail-safe hace lo correcto y nada más.
- La roja `[A1]` de `tests/reportes-seguridad-adversarial.test.ts` es la conocida y
  no tiene relación con este change (misma roja en la corrida de referencia).

---

# Vuelta 2 — re-verificación independiente de los cierres

Encargo: comprobar por mi cuenta —no leyendo el reporte del dev— que MEDIO-1, MEDIO-2
y BAJO-1 quedaron cerrados, atacar la guarda nueva por los dos lados, verificar el
`User-Agent` y el guardián anti-lectura del cuerpo, y barrer regresiones del diff de
la vuelta.

## Dictamen de la vuelta 2

**LIMPIO — pasa al validador.** Los tres cierres se sostienen bajo ataque directo.
No aparece ningún hallazgo nuevo crítico, alto ni medio. Queda **un bajo nuevo**
(BAJO-4, dos formas exóticas de escribir "localhost" que la guarda todavía deja
pasar) y una **consecuencia asumida y bien documentada** del arreglo de MEDIO-1, que
no es defecto.

| Severidad | Vuelta 1 | Vuelta 2 |
|---|---|---|
| Crítico | 0 | 0 |
| Alto | 0 | 0 |
| Medio | 2 (MEDIO-1, MEDIO-2) | **0** — los dos cerrados |
| Bajo / observación | 3 (BAJO-1/2/3) | 3 — BAJO-1 cerrado, BAJO-2 y BAJO-3 siguen aceptados, **+BAJO-4 nuevo** |

## Gates (vuelta 2)

| Gate | Resultado |
|---|---|
| `npm run lint` | **verde**, 0 errores 0 avisos |
| `npm run build` | **verde** |
| `npm test` | **3413 pasan, 2 saltadas, 2 rojas**: `[A1]` y `[A2]` de `tests/reportes-seguridad-adversarial.test.ts`, exactamente las dos conocidas y aceptadas de la corrida de referencia (carreras contra PGlite, sin relación con este change). **Ni una sola `Connection terminated unexpectedly`**: la base del worktree (51246) aguantó las tres corridas de esta vuelta sin degradarse. |
| Suites del aviso, aparte | `aviso-pendientes` + `aviso-pendientes-tarea` + `purga-rechazados` + `despliegue`: **123 en verde**. La adversarial: **92 en verde**. |

## 1. MEDIO-2 (guarda de host) — CERRADO, y sin apagar nada legítimo

Re-verificado **ejecutando** `configuracionDeCorreo` / `esHostAlcanzableDesdeFuera`
(`src/lib/correo/configuracion.ts:84-114`), no leyendo el código.

**Las seis variantes de mi hallazgo original quedan apagadas**, y con ellas otras 20
que probé por si la guarda se quedaba en la superficie:

| Familia | Probado | Resultado |
|---|---|---|
| Las del hallazgo | `localhost:3000`, `localhost:3001`, `localhost`, `127.0.0.1:3000`, `[::1]:3000`, `0.0.0.0:3000`, `192.168.1.50:3000` | **apagado** (7/7) |
| Mayúsculas | `LOCALHOST:3000`, `HTTP://LocalHost/` | apagado |
| La misma IP disfrazada | `127.1`, `2130706433` (decimal), `0x7f.0.0.1` (hex), `[0:0:0:0:0:0:0:1]` | apagado — el normalizador de `new URL` las reduce y la guarda las ve |
| Otros bloques internos | `10.1.2.3`, `172.16.0.1`, `172.31.255.1`, `169.254.169.254` (metadatos de nube), `[fc00::1]`, `[fd12:3456::1]`, `[fe80::1]` | apagado |
| Nombres de red local | `mi-laptop:3000` (sin punto), `.local`, `.internal`, `.home`, `.lan`, `.localhost` | apagado |
| Esquema distinto, host interno | `https://localhost:3000` | apagado (decide el host, no el esquema) |
| Host vacío | `esHostAlcanzableDesdeFuera("")` y `("   ")` | `false` (cierra por defecto) |

**Y —lo que más caro sale si falla— cero falsos positivos.** Un falso positivo aquí
apaga el aviso **en producción y en silencio**, que es peor que el defecto original.
Probados 14 hosts legítimos, incluidos los vecinos peligrosos de la lista de sufijos
y de los bloques privados: `enmirumbo.com`, `www.enmirumbo.com`, `enmirumbo.com:8443`,
`enmirumbo-git-t020.vercel.app`, `xn--80ak6aa92e.com` (punycode), `ejemplo.co.uk`,
**`casas.homes`**, **`algo.international`**, **`algo.localhosting.mx`**,
**`172.32.0.1`** y **`172.15.0.1`** (pegados al bloque privado), `9.9.9.9`,
`[2606:4700::1111]` y `sub.dominio.mx`. **Los 14 pasan** con su `/admin` correcto.
El `endsWith` con el punto delante (`.home` ≠ `.homes`, `.internal` ≠
`.international`) es lo que salva a los tres primeros.

La decisión de **no** reutilizar `esBaseLocal` de `base-datos/conexion.ts` la comparto
por la razón de siempre en seguridad: dos criterios que tienen que poder endurecerse
por separado no deben compartir función.

## 2. MEDIO-1 (el 409 en verde) — CERRADO, con el escenario del encargo verificado

Re-verificada la mecánica de `src/lib/correo/resend.ts:130-148` por sus dos caminos y
por los que podrían corromperla:

| Caso probado | Esperado | Obtenido |
|---|---|---|
| 409 **en frío** (este proceso no vio salir nada) | `fallido` + log con `409` | ✔ y el log **no** dice "ya salió" |
| 200 y luego 409 con la **misma** clave (caliente) | `mandado` | ✔ |
| 200 con la clave de **ayer**, 409 con la de **hoy** | `fallido` | ✔ la memoria no se hereda entre días |
| 409, 409 (dos rechazos seguidos) | `fallido`, `fallido` | ✔ **un rechazo no calienta la memoria** |
| 403 y luego 409 | `fallido`, `fallido` | ✔ ningún camino que no sea `ok` marca la clave como aceptada |

**El escenario que el encargo pidió, de punta a punta por la ruta** ("cron 07:17
exitoso + redisparo a mediodía desde otra instancia"): primer disparo → 200 con
`aviso: "mandado"` y un envío aceptado; se borra la memoria del proceso (= otra
instancia), se añade un pendiente más para que el cuerpo cambie, y se redispara. Las
dos condiciones se cumplen **a la vez**:

1. **No sale un segundo correo** — el proveedor de mentiras registra 2 peticiones con
   la **misma** clave y **un solo** envío aceptado.
2. **No hay falso verde** — la respuesta es **500** con `aviso: "fallido"`, y el log
   explica qué mirar.

Comprobado además que **el falso rojo no se cobra de más**: el redisparo dentro del
**mismo** proceso sigue respondiendo 200 `mandado` (mis dos pruebas de la vuelta 1
—"veinte disparos seguidos" y "un pendiente nuevo a media tarde"— siguen verdes sin
tocarlas, que era el riesgo de regresión de este cambio).

**Sobre el intercambio elegido** (falso rojo antes que falso verde): lo respaldo, y no
solo por criterio. El coste real está acotado —el cron dispara una vez al día, así que
un 500 por esta vía solo aparece en un **segundo** disparo— y el peligro contrario no
lo estaba: 24 h de silencio con el tablero en verde. La salida alternativa (reintentar
con clave sufijada) sí habría roto un requirement, mandando dos correos el mismo día.
Y está **documentado para quien opera**: `docs/despliegue.md` §6.1 dice qué significa
ese `fallido`, que puede ser lo bueno o lo malo, y manda a *Resend → Emails* a
comprobarlo. Verificado en el documento, no en el reporte.

## 3. `User-Agent` y el cuerpo que se descarta — verificados por comportamiento

- **`User-Agent`**: viaja en la petición, es ASCII imprimible sin saltos, es válido
  para `new Headers(...)` y **no lleva dentro ni la credencial ni el buzón destino**.
  El motivo del dev (Resend bloquea con 403/1010 las peticiones sin él) es real y la
  defensa es barata; no introduce superficie.
- **El cuerpo de la respuesta**: al guardián **de fuente** que escribió el dev le
  añadí uno **de comportamiento**, que es el que sobrevive a un refactor. Para los
  cuatro estados que importan (200, 409, 422, 500): `body.cancel()` **se llama**,
  ninguno de `json()/text()/arrayBuffer()/blob()/formData()` se llama, **nadie abre el
  flujo** (`getReader` sin llamadas) y el flujo no queda bloqueado. Es lo que impide
  que el payload que Resend devuelve en un 422 —destinatario, remitente y texto del
  correo— llegue al log.
  *Matiz técnico anotado en la prueba:* `bodyUsed` **sí** pasa a `true` tras cancelar,
  porque la especificación de Fetch marca el flujo como "perturbado"; perturbado no es
  leído, y por eso la aserción correcta es sobre los lectores, no sobre `bodyUsed`.
- **Robustez del descarte**: una respuesta **sin cuerpo** no rompe el envío (el
  encadenamiento opcional corta bien) y un `cancel()` que **rechaza** no tumba el
  envío ni deja una promesa sin atender (verificado escuchando `unhandledRejection`).

## 4. Regresiones del diff de la vuelta

- **`contarPendientes` en serie** (`src/lib/avisos/pendientes.ts:49-58`): con los tres
  tipos a la vez y datos hostiles sembrados, sigue dando exactamente
  `{altas: 2, ediciones: 1, reportes: 2, total: 5}`, sigue devolviendo **solo cuatro
  números** y sigue sin dejar salir un nombre. El cambio es de concurrencia, no de
  criterio: la deduplicación y el conteo por reporte los sigue poniendo la cola.
  Menos conexiones simultáneas para una tarea que nadie espera es, además, la
  dirección correcta.
- **El arreglo de tipos en mi archivo** (`tests/aviso-pendientes-adversarial.test.ts`):
  revisado línea por línea. Es una anotación `Record<string, string>[]` sobre el array
  de encabezados hostiles; **las nueve variantes y todas las aserciones están
  intactas**. No se ablandó ninguna prueba.
- Las suites vecinas (`purga-rechazados`, `despliegue`) siguen verdes con el juego de
  claves exacto de la respuesta.

## 5. Hallazgo nuevo (bajo)

### BAJO-4 — dos formas exóticas de escribir "localhost" siguen pasando la guarda

`src/lib/correo/configuracion.ts:84-94`. Verificado ejecutando:

| `SITIO_URL` | `hostname` normalizado | Resultado |
|---|---|---|
| `http://[::ffff:127.0.0.1]` | `[::ffff:7f00:1]` | **pasa** → `http://[::ffff:7f00:1]/admin` |
| `http://localhost.` | `localhost.` | **pasa** → `http://localhost./admin` |
| `http://LOCALHOST.:3000` | `localhost.` | **pasa** |

La primera es la loopback IPv4 mapeada a IPv6, que el normalizador de URL convierte a
hexadecimal (`7f00:1`) y por eso esquiva el regex de `127.`; la segunda es el FQDN con
punto final, que `endsWith(".local…")` no ve y que sí tiene un punto, así que pasa el
último filtro.

**Impacto: un enlace muerto en el buzón del propio admin.** No hay fuga de datos, no
hay SSRF —la única petición saliente va a la URL fija de Resend— y el valor lo
escribe quien opera, no un atacante: nadie configura `SITIO_URL=http://[::ffff:127.0.0.1]`
por accidente. Por eso es **bajo y no bloquea**.

**Arreglo, si se quiere cerrar del todo (dos líneas):** quitar el punto final del host
antes de comparar (`host.replace(/\.$/, "")`) y añadir a los bloques IPv4 no públicos
el prefijo mapeado (`/^::ffff:7f00:/`). **No dejo prueba que fije la conducta actual**,
por la misma razón de siempre: no consagrar el defecto.

## 6. Lo que sigue abierto (sin cambios)

- **Paso humano bloqueante antes del merge:** verificar `enmirumbo.com` en Resend con
  los DNS de Namecheap, o el paso 11-bis de la prueba de humo no se puede cerrar y el
  aviso no opera (el fail-safe hace lo correcto mientras tanto).
- **BAJO-2** (la ruta no tiene límite de tasa) y **BAJO-3** (`contarPendientes` lee de
  más): señalados y aceptados; ninguno se toca sin spec.
- **BAJO-4**, nuevo: opcional, no bloquea.

## 7. Pruebas adversariales de la vuelta 2

Todo en `tests/aviso-pendientes-adversarial.test.ts`, que pasa de 37 a **92 pruebas,
las 92 en verde**. Bloques nuevos:

| Bloque | Qué re-verifica | Pruebas |
|---|---|---|
| 7. Guarda de host | 26 hosts internos que deben apagar el aviso + 14 públicos legítimos que NO deben apagarlo + host vacío + esquema irrelevante | 42 |
| 8. El 409 partido en dos | frío, caliente, memoria de ayer, dos rechazos seguidos, 403+409, el escenario cron+redisparo desde otra instancia por la ruta, y el redisparo del mismo proceso que sigue en verde | 7 |
| 9. `User-Agent` y cuerpo | cabecera válida y sin secretos; cancelado sin leer en 4 estados; respuesta sin cuerpo; `cancel()` que rechaza | 4 |
| 10. Regresión de la vuelta | conteo en serie con los tres tipos y datos hostiles; cola vacía sin tocar la red | 2 |

Ningún archivo de producción se tocó en esta etapa.
