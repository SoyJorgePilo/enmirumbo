# Reporte seguridad y calidad — agregar-panel-admin

Etapa C. Auditoría del diff (`git diff main` + no rastreados) contra la spec
(13 requirements / 56 scenarios) y los reportes `a-ui.md` y `b-dev.md`.

> **Veredicto tras la iteración 2 del dev: limpio, pasa al validador.**
> 0 críticos, 0 altos, 0 medios, 5 bajos (ninguno bloquea). El detalle de la
> re-verificación está en la sección **"Iteración 2"** al final; lo que sigue
> es el reporte de la primera pasada, conservado como está para que se lea qué
> se buscó y qué se encontró.

## Primera pasada

**Veredicto (iteración 1): regresa al dev.** 1 hallazgo ALTO, 4 MEDIOS, 3 BAJOS.

Puertas al cierre de la iteración 1, con el archivo de pruebas adversariales
ya dentro:

| Comando | Resultado |
| --- | --- |
| `npm test` | 26 archivos, **647 pasan + 3 `expected fail`** (los 3 defectos abiertos, ver abajo) |
| `npm run lint` | limpio |
| `npm run build` | limpio; las 6 rutas del panel salen `ƒ (Dynamic)` |

Además del análisis estático, el panel se levantó de verdad (`next dev` y
`next start` en el puerto 3000) para probar cookies, CSRF, RSC y encabezados
reales. La base `prisma/dev.db` quedó como estaba: ninguna de las pruebas
manuales llegó a transicionar un registro (se verificó al final).

---

## Lo que resistió (para que el veredicto se lea en contexto)

La autenticación es sólida en lo esencial y no encontré forma de entrar sin la
contraseña ni de tocar la base sin sesión:

- **Firma HMAC**: cubre la caducidad y la versión del formato. Estirar la
  caducidad conservando la firma, cambiar un carácter de la firma, firmar con
  otro secreto, mandar una cookie caducada o un formato raro (12 variantes,
  incluida una de 100 000 caracteres) → todas se tratan igual: "no hay sesión".
  Comprobado como unidad y contra el servidor real (307 al acceso, sin datos).
- **Bypass de la guarda**: enumeradas **las 10 superficies** de `src/app/admin/`
  (6 páginas + 4 Server Actions). Con cookie ausente, caducada, con firma
  alterada, firmada con otro secreto y sin panel configurado, las 4 acciones y
  las 6 pantallas redirigen a `/admin` sin escribir nada. Las 3 excepciones
  documentadas (pantalla de acceso, `accion-acceso`, `accion-salir`) no leen ni
  escriben la base. También cerrado por el lado del payload RSC:
  `GET /admin/cola?_rsc=…` y el prefetch de `/admin/registros/<id>` sin cookie
  devuelven 307 con cuerpo vacío, sin un solo dato del registro.
- **CSRF**: `POST` a la acción de aprobar con cookie válida y
  `Origin: https://sitio-hostil.example` → **500 de Next**, la acción no
  corre. Con `Origin` propio, sí. Sumado a `SameSite=Lax` (que no manda la
  cookie en un POST de otro sitio) y a que ninguna transición es un GET, la
  decisión de `design.md` §1 se sostiene. `next.config.ts` no relaja
  `serverActions.allowedOrigins`.
- **Cookie**: `Path=/admin; Max-Age=28800; HttpOnly; SameSite=lax`, `Secure`
  cuando el proxy declara HTTPS. No lleva la contraseña ni datos personales.
- **XSS almacenado**: el formulario público acepta `<img onerror>`,
  `</dd><script>…`, `<svg onload>`, comillas y unicode bidireccional (solo hay
  cota de longitud, no lista blanca) y el panel los guarda tal cual — pero los
  pinta escapados en el detalle y en la cola. Sin `dangerouslySetInnerHTML` en
  todo `src/`, sin `$queryRaw`/`$executeRaw`, todo por Prisma.
- **Inyección en los `wa.me`**: un nombre con `&text=`, `?`, `#` y comillas y un
  motivo de rechazo con `&`, `#`, saltos de línea y una URL no logran añadir un
  segundo parámetro ni cambiar el destino: `encodeURIComponent` sobre el mensaje
  completo y `normalizarWhatsapp` sobre el número. Un WhatsApp guardado como
  `javascript:alert(1)` no pinta ningún `href`.
- **Fuga de datos personales**: el detalle **no** trae `tokenGestion` (ni el
  `select` ni ninguna fuente de `src/app/admin`, `src/components/admin` o
  `src/lib/admin` lo nombran). Un negocio `rechazado` no aparece en el listado y
  su `motivoRechazo` no llega a ninguna página pública, ni siquiera cuando la
  fila lo arrastra y ya está publicada. El reenvío tras rechazo no devuelve el
  motivo ni los datos anteriores. Ningún log del panel escribe la contraseña,
  la cookie ni datos del negocio.
- **Transiciones ilegales**: `rechazado → publicado`, `publicado → rechazado` y
  la doble resolución están cerradas por la escritura condicionada, incluso en
  **carreras reales** (`Promise.all`): dos aprobaciones simultáneas publican una
  sola vez y no mezclan los giros; aprobar y rechazar a la vez dejan un solo
  desenlace sin rastro del perdedor; dos rechazos dejan un solo motivo.
- **Fail-safe**: con el panel sin configurar, ni la pantalla abre ni las dos
  acciones transicionan, aunque la cookie esté bien firmada.
- **Migración**: dos `ALTER TABLE ADD COLUMN` aditivos, aplicables sobre base
  con datos; el dev ya lo prueba en `tests/modelo-rechazo.test.ts`.
- **Botón "atrás" tras salir**: en la build de producción las pantallas del
  panel responden `Cache-Control: private, no-cache, no-store, max-age=0,
  must-revalidate`. El escenario "volver atrás no vuelve a mostrar ninguna
  pantalla del panel" se cumple por cabecera, no por casualidad.
- **Secretos**: nada hardcodeado; `PANEL_CONTRASENA`, `PANEL_SESION_SECRETO` y
  `SITIO_URL` documentadas en `.env.example`, comentadas y sin valor usable.
  Todos los datos de prueba son ficticios (series `771999xxxx`, dominios
  `.example` de la RFC 2606).

### Los 3 tests preexistentes que el dev modificó: no los debilitó

1. `tests/registro-adversarial.test.ts` — quitó `rechazado` del caso de
   duplicado porque la spec lo cambia a propósito, y a cambio escribió un caso
   **más exigente** (el reenvío no se autopublica, no toca origen, giros ni
   token, y sigue habiendo una sola fila). Cambio legítimo.
2. `tests/directorio-consultas.test.ts` — la lista de archivos que nombran
   `publicado` sigue siendo exacta (un tercero rompe la suite) y **suma** dos
   comprobaciones: que el módulo del panel nunca lo use en un `where` y que sí
   lo use en un `data`. Más fuerte que antes.
3. `tests/layout.test.ts` — el patrón `vercel` a secas se afinó a
   `vercel.svg|vercel.(com|app)`. Es un debilitamiento real pero acotado y
   justificado (`VERCEL_ENV` es una variable legítima que ya usaba
   `prisma/seed-demo.ts`); el archivo, además, gana la revisión de enlaces de
   las 4 pantallas del panel y el `rel="noopener noreferrer"` de sus `wa.me`.

---

## Hallazgos

### ALTO 1 · `.claude/worktrees/` no está en `.gitignore`, y el diff apaga la única herramienta que lo delataba

`eslint.config.mjs:21` (nuevo en este diff) añade `.claude/**` a
`globalIgnores`. Resuelve el síntoma (536 errores de lint que venían del
`.next` compilado dentro del worktree de otro agente) pero deja el problema de
fondo intacto: **esa ruta es commiteable en un repo público.**

```
$ git check-ignore -v .claude/worktrees/   → NO IGNORADO
$ du -sh .claude/worktrees                 → 889M
$ find .claude/worktrees -name "*.db"
  .claude/worktrees/agent-a1e0429ef2b5fb722/prisma/dev.db
  .claude/worktrees/agent-a1e0429ef2b5fb722/prisma/test.db
```

Las reglas de `.gitignore` que protegen esto en la raíz están **ancladas**
(`/node_modules`, `/.next/`, `prisma/*.db`), así que ninguna alcanza a
`.claude/worktrees/<agente>/…`. La única que sí alcanza es `.env*`, que no está
anclada: los secretos se salvan, la base de datos no.

Escenario de fuga: el validador —el único que toca git— hace `git add -A` o
`git add .claude` para incluir el cambio de `eslint.config.mjs` y publica en
GitHub 889 MB de artefactos y **un `prisma/dev.db`**. Hoy esa base trae datos
de siembra ficticios; el día que el admin pruebe el panel contra registros
reales (que es exactamente para lo que existe este change), ese archivo trae
nombres, WhatsApp y direcciones de terceros. Es la regla dura de `CLAUDE.md` y
un incidente LFPDPPP en un repo público, y no hay forma limpia de deshacerlo
del historial.

**Remedio (una línea, no lo aplico yo):** `.claude/worktrees/` en
`.gitignore`. El propio dev lo propuso en `b-dev.md` ("si el validador prefiere
resolverlo de otra forma (p. ej. en `.gitignore`), es una línea") y eligió la
opción que hace la ruta invisible en vez de la que la hace inofensiva. Con el
`.gitignore` puesto, el ignore de ESLint sobra o se queda, da igual.

### MEDIO 1 · Un id de giro o de colonia que desborda 64 bits revienta la acción de aprobar

`src/app/admin/registros/[id]/accion-aprobar.ts:25-31` (`idsDelFormulario`)
acepta cualquier cadena de solo dígitos, **sin cota de magnitud**, y la pasa a
Prisma en `src/lib/admin/transiciones.ts:113` (`giro.findMany`) y `:129`
(`colonia.findUnique`):

```
POST /admin/registros/<id>   (con sesión)
  giro=99999999999999999999
→ PrismaClientValidationError: Unable to fit value into a 64-bit signed integer
→ excepción sin atrapar dentro de la Server Action → 500
```

La decisión 6 del dev ("los giros se validan contra el catálogo… un POST
directo podía mandar ids inventados") atrapa el id inventado pero no el id
desmesurado. No hay riesgo de datos —la guarda corre antes, así que hace falta
sesión— pero es un 500 en la acción principal del panel donde la spec pide
"Elige máximo 3 giros" / "Elige la colonia de este negocio", y la misma clase de
entrada llega por `coloniaId`. Cota de longitud o `Number.isSafeInteger` en
`idsDelFormulario` lo cierra.

Tests: `tests/admin-adversarial.test.ts`, los dos `it.fails` "…revienta la
acción (defecto abierto)".

### MEDIO 2 · El reenvío tras rechazo escribe sin condicionar el estado

`src/lib/registro/procesar.ts:182-224`: lee el estado (`findUnique`) y después
escribe con `update({ where: { id } })`, sin repetir `estado: rechazado` en el
`where`. Es justo lo que `design.md` §5 prohíbe para las transiciones del panel
("leer primero y decidir después deja una ventana…"), aplicado aquí a una
superficie **pública y anónima**.

Reproducción determinista (ventana abierta a propósito envolviendo el cliente
Prisma, `tests/admin-adversarial.test.ts`, `it.fails` "un reenvío que leyó
`rechazado` no debería pisar una ficha ya publicada"):

1. Ficha X en `rechazado`. Llegan dos reenvíos casi simultáneos, R1 y R2; los
   dos leen `rechazado`.
2. R1 escribe → X vuelve a `en_revision` y entra a la cola.
3. El admin la aprueba → `publicado`, con su `publicadoEn`, sus giros y su
   origen.
4. R2 —que leyó antes— escribe igual: X vuelve a `en_revision` **con los datos
   del reenvío**, desaparece del directorio público y conserva `publicadoEn`
   poblado, un estado que ninguna transición legítima produce.

El resultado observado es `estado = en_revision` sobre una ficha publicada. La
ventana es de milisegundos y quien la abusa no controla el clic del admin, por
eso es MEDIO y no ALTO; pero contradice el escenario de la spec "el reenvío no
se autopublica … NO DEBE poder alterar … la fecha de publicación", que hoy se
cumple solo por construcción (`publicadoEn` no está en `datos`) y no por una
condición de escritura. `updateMany` con `estado: rechazado` en el `where` y
tratar `count === 0` como duplicado lo cierra, con el mismo patrón que ya usa
`transiciones.ts`.

### MEDIO 3 · La antifuerza bruta del acceso se apaga con un encabezado

`src/lib/admin/acceso.ts:38-45` delega la identidad en
`ipDeEncabezados` (`src/lib/registro/limite-ip.ts:213-233`), que lee **solo** el
encabezado declarado en `REGISTRO_ENCABEZADO_IP`. Con
`ip === null`, `accesoBloqueado` devuelve `false` y `registrarIntentoFallido`
no apunta nada: **no hay límite, y nada lo dice.**

Verificado contra el servidor levantado, con `REGISTRO_ENCABEZADO_IP=x-forwarded-for`:

```
A) 10 intentos fallidos rotando x-forwarded-for: 198.51.100.1..10
   → 10 × ?error=incorrecta, nunca ?error=intentos
B)  8 intentos con "x-forwarded-for: 198.51.100.200, no-soy-una-ip"
   (último salto sin forma de IP → claveDeIp = null → cupo inexistente)
   → 8 × ?error=incorrecta, el contador ni siquiera se incrementa
```

Con un proxy que **añade** el salto real al final (nginx, HAProxy) o que
sobrescribe el encabezado con un solo valor (`cf-connecting-ip`, `x-real-ip`)
el ataque no aplica: la spec y `design.md` §4 aceptan explícitamente este
diseño y el hallazgo es, en rigor, del despliegue (E0-3). Lo dejo en MEDIO —y
no en informativo— por tres razones que sí son de este change:

1. Lo que protege ya no es "3 altas por hora" sino **la única credencial del
   sitio entero**: el modo de fallo pasó de "spam en la cola" a "adivinar la
   contraseña sin límite".
2. El fallo es **silencioso**: el único aviso (`limite-ip.ts:221`) se emite una
   vez por proceso, habla de "el límite de altas por IP" y puede haberse
   consumido en una petición del formulario público mucho antes de que alguien
   ataque el panel.
3. `.env.example` presenta `REGISTRO_ENCABEZADO_IP` como una nota al pie del
   bloque del panel, no como requisito de despliegue del mismo.

No propongo código: elegir entre "fallar cerrado" (sin IP atribuible, contador
global de intentos) y "seguir como está y verificarlo en E0-3" es una decisión
de producto que necesita la spec. No añadí test rojo por lo mismo.

### MEDIO 4 · El reenvío de un tercero destruye la constancia de consentimiento del titular

`src/lib/registro/procesar.ts:218` escribe `consintioAvisoEn: ahora` sobre la
fila existente. `design.md` §6 lo prescribe y asume el abuso de "pisar los datos
con basura", pero no evaluó este efecto concreto: `consintioAvisoEn` es la
**evidencia LFPDPPP** de que el titular consintió el aviso de privacidad
(spec del detalle: "constancia del consentimiento … evidencia ante la LFPDPPP,
PRD §8").

Escenario: alguien que conoce un número rechazado —el formulario es anónimo y
el propio `design.md` §6 admite que se puede sondear— manda un reenvío. La
fecha de consentimiento original, la del titular, se pierde para siempre y se
sustituye por una atribuible a un tercero. Si más adelante ese negocio ejerce un
derecho ARCO o reclama, la constancia que el sistema conserva certifica un
consentimiento que su titular nunca dio.

Sugerencia (no implementada, pide spec): conservar la constancia más antigua, o
guardar la del reenvío en un campo aparte sin borrar la original. El coste es
una columna; el beneficio es que la evidencia siga siendo evidencia.

### BAJO 1 · La caducidad de la cookie no está canonizada

`src/lib/admin/sesion.ts:91-97`: `^\d+$` + `Number(...)` acepta ceros a la
izquierda (`0001788…` y `1788…` son la misma sesión con dos valores de cookie
distintos) y una cadena de dígitos suficientemente larga colapsa a `Infinity`,
cuya comparación `> ahora` es siempre verdadera: un valor firmado sobre
`v1.Infinity` sería una **sesión eterna**. No es explotable —hace falta el
secreto para producir esa firma y no hay ningún oráculo que firme— pero es una
representación no canónica en un token de autenticación. Comparar la caducidad
como cadena, o exigir que `String(Number(x)) === x`, lo cierra.

### BAJO 2 · "Salir" no revoca del lado del servidor

Deuda ya declarada por el dev (`b-dev.md`, deuda 1) y decidida en `design.md`
§1. Confirmada: un valor de cookie copiado antes de salir sigue abriendo el
panel hasta su caducidad. El riesgo real es bajo (`HttpOnly`, un solo admin) y
la parte del escenario que sí depende del servidor —el botón "atrás"— está
cubierta por `no-store`. Lo dejo anotado, no bloquea.

### BAJO 3 · `/admin` sin configurar escribe en el log en cada petición anónima

`src/app/admin/page.tsx:51` emite un `console.warn` por cada visita cuando falta
configuración. En un despliegue mal configurado, cualquiera puede inundar el log
del servidor sin autenticarse (la pantalla no expone nada, el problema es solo
el volumen). Un aviso una sola vez por proceso, como hace `limite-ip.ts`,
bastaría.

---

## Scenarios sin test automatizado

El mapa scenario → test de `b-dev.md` es exacto: revisé los 56 y no encontré
ninguno automatizable sin cobertura. Dos matices:

1. **`revision-admin` · "El panel se opera desde el celular" · scenario
   "revisar desde el celular" (390 px, 44 px, contraste AA)** — el dev lo marca
   como manual y parcial. Coincido: no es automatizable con las herramientas del
   repo. **Sigue pendiente para el humano del PR**, y con ella la revisión visual
   de la cola y de los dos formularios en un navegador real.
2. **`revision-admin` · "Acceso al panel" · scenario "salir del panel"**, en su
   parte "volver atrás en el navegador no vuelve a mostrar ninguna pantalla" —
   el dev lo cubre por los atributos de la cookie. Lo completé a mano: la build
   de producción manda `no-store` en las 6 pantallas del panel. Verificado, no
   automatizado (haría falta un navegador).
3. **`revision-admin` · "Sin contraseña configurada…" · scenario "ninguna
   transición sin configuración"** estaba cubierto solo por la unidad de la
   guarda y por la prueba a mano del dev. Le añadí test sobre las dos Server
   Actions reales (ver abajo).

---

## Tests adversariales añadidos

Un archivo nuevo, `tests/admin-adversarial.test.ts` (44 casos: **41 en verde**
y **3 `it.fails`** que documentan los defectos MEDIO 1 y MEDIO 2 sin poner la
suite en rojo; cuando el dev los corrija, esas tres pruebas se volverán rojas
con el mensaje "expected to fail" y hay que convertirlas en `it` normales).

| Bloque | Qué ataca | Resultado |
| --- | --- | --- |
| Entrada hostil del formulario público pintada en el panel | `<img onerror>`, `</dd><script>`, `<svg onload>`, comillas, unicode bidireccional e invisible en nombre, "¿qué ofreces?", dirección, horario y teléfono; nombre en el límite exacto de 80 caracteres con acentos y emoji | 4 verdes |
| Inyección en los `wa.me` del panel | nombre con `&text=`, `?`, `#` y comillas; motivo de rechazo con `&`, saltos de línea, URL y `#`; WhatsApp guardado como `javascript:alert(1)` | 3 verdes |
| Carreras reales entre transiciones | dos aprobaciones simultáneas; aprobar y rechazar simultáneos; dos rechazos simultáneos | 3 verdes |
| POST directo a la acción de aprobar | 4 casillas del mismo giro; giros `-1`, `1e1`, `1.5`, `1 2`, `0x2`, `'; DROP TABLE Negocio; --`; origen inventado; motivo de 20 000 caracteres | 9 verdes |
| POST directo con id desmesurado | `giro=99999999999999999999`, `coloniaId=99999999999999999999` | **2 `it.fails` — MEDIO 1** |
| Orden de la guarda | `requerirSesionAdmin()` antes del primer acceso a datos en cada ruta y acción (no solo "está en el archivo"); ninguna fuente del panel nombra `tokenGestion`; el token no aparece en el HTML del detalle | 3 verdes |
| Valores hostiles en la cookie | 12 formas inválidas (vacía, solo puntos, tres partes, `NaN`, `1e999`, con signo, hexadecimal, con espacios, con salto de línea inyectado, negativa, de 100 000 caracteres); firma alterada en un carácter; caducidad estirada; secreto rotado | 4 verdes (15 casos) |
| Fuga del rastro del rechazo a lo público | listado con un negocio rechazado; ficha publicada que arrastra `motivoRechazo`; el resultado del reenvío serializado | 3 verdes |
| Fail-safe sobre las acciones reales | aprobar y rechazar con cookie bien firmada y el panel sin configurar | 2 verdes |
| Carrera reenvío público vs. resolución del panel | ventana abierta envolviendo el cliente Prisma | **1 `it.fails` — MEDIO 2** |

Todos los datos son ficticios: serie `771999 6xxx`, dominios `.example`
(RFC 2606) y rangos `203.0.113.0/24` / `198.51.100.0/24` (TEST-NET, RFC 5737).

Verificaciones a mano no automatizables, contra el servidor levantado
(`next dev` y `next start`, puerto 3000): CSRF con `Origin` hostil, ausencia de
`Origin`, payload RSC y prefetch sin sesión, atributos reales del `Set-Cookie`,
`Cache-Control` de las 6 pantallas en producción, cookies forjadas contra las
dos acciones, y los dos bypasses del límite de intentos del MEDIO 3.

---

## Para el dev (cerrado en la iteración 2)

Bloqueante: **ALTO 1** (una línea en `.gitignore`). Recomendados antes del PR:
**MEDIO 1** (cota en `idsDelFormulario`) y **MEDIO 2** (`updateMany`
condicionado en el reenvío), los dos con su prueba ya escrita esperando a
volverse verde. **MEDIO 3** y **MEDIO 4** son decisiones que tocan la spec: si
el humano las acepta como están, que quede escrito en la propuesta y no en la
cabeza de nadie.

---

# Iteración 2 — re-verificación

Los 8 hallazgos se re-verificaron **contra el código real**, no contra el
reporte del dev: leyendo los módulos corregidos y volviendo a levantar el
servidor (`next build` + `next start`, puerto 3000) para repetir cada
reproducción de la primera pasada. Los tres `it.fails` que el dev invirtió se
revisaron línea a línea antes de aceptarlos.

Puertas al cierre de la iteración 2:

| Comando | Resultado |
| --- | --- |
| `npm test` | 26 archivos, **670 pruebas, todas en verde**, ningún `expected fail` |
| `npm run lint` | limpio |
| `npm run build` | limpio; las 6 rutas del panel siguen `ƒ (Dynamic)` |
| `npx tsc --noEmit` | limpio |

## ALTO 1 · cerrado, y la protección es completa

`.gitignore:64-66` (`.claude/*` + `!.claude/agents/` + `!.claude/commands/`).
Comprobado sobre el estado real del disco, no sobre el patrón:

```
git check-ignore -v .claude/worktrees/agent-…/prisma/dev.db  → .gitignore:64
git check-ignore -v .claude/worktrees/agent-…/prisma/test.db → .gitignore:64
git check-ignore -v .claude/worktrees/agent-…/.env.example   → .gitignore:64
git check-ignore    .claude/agents/dev.md                    → no ignorado
git check-ignore    .claude/commands/spec.md                 → no ignorado
git add -An .claude                                          → (vacío)
```

Revisado lo que el coordinador pidió mirar —si queda algo más bajo `.claude/`
versionado o commiteable que importe—:

- **Rastreado hoy**: exactamente 10 archivos, los 6 de `.claude/agents/` y los
  4 de `.claude/commands/`; los dos directorios están re-incluidos, así que
  siguen versionándose y un archivo nuevo dentro de ellos también (probado
  creando y borrando uno).
- **En disco**: bajo `.claude/` solo existen `agents/`, `commands/` y
  `worktrees/`. No hay `settings.json`, `settings.local.json`, `hooks/` ni
  `skills/`, así que no hay nada rastreado que la regla deje fuera por
  sorpresa. Y para los archivos ya rastreados el `.gitignore` es irrelevante:
  git los sigue mostrando modificados.
- **Simulacro completo**: `git add -An .` propone **60 rutas**, ninguna bajo
  `.claude`, ninguna `.env`, ningún `.db`, ningún artefacto de build. Es
  exactamente el diff del change.
- **Residuo** (BAJO 5, abajo): la regla es una lista blanca, así que una futura
  carpeta de definiciones bajo `.claude/` se ignorará en silencio hasta que se
  añada su negación. Falla cerrado —excluye de más, nunca de menos—, que para
  un repo público es el sentido correcto.

## MEDIO 1 · cerrado

`src/app/admin/registros/[id]/accion-aprobar.ts:34-53`: `idDeCatalogo`
(`/^\d{1,9}$/` + `Number.isSafeInteger` + `> 0`) y `girosDelFormulario`, que
distingue "no vino" (cadena vacía → se ignora, es una casilla sin marcar) de
"vino mal" (→ camino de error, sin consultar la base).
`src/lib/admin/transiciones.ts:85-87,124,143`: `esIdDeCatalogo` repite la
comprobación dentro del módulo, así que ningún otro llamador se la salta. La
defensa en dos capas es la respuesta correcta al hallazgo.

Los dos POST que en la iteración 1 daban **500** ahora, contra el servidor de
producción:

```
giro=99999999999999999999      → 303 …?origen=organico&errorAprobar=giros
coloniaId=99999999999999999999 → 303 …?origen=organico&errorAprobar=colonia
giro=-1  /  giro=0             → 303 …&errorAprobar=giros
control: 4 giros válidos       → 303 …&errorAprobar=giros  (sin regresión)
log del servidor: 0 PrismaClientValidationError · registro intacto en `en_revision`
```

Detalle que sí importa y quedó bien resuelto: el valor hostil **no vuelve al
navegador**. La URL de error solo lleva los ids que se pudieron interpretar
(comparar el control de 4 giros, que sí los conserva, con el desbordado, que no
conserva ninguno).

## MEDIO 2 · cerrado

`src/lib/registro/procesar.ts:229-245`: `updateMany({ where: { id, estado:
ESTADO_NEGOCIO_RECHAZADO } })` y `count === 0 → whatsappDuplicado`. Mismo
patrón que `transiciones.ts`, como pedía `design.md` §5. El tipo
`ClienteRegistro` cambió `update` por `updateMany`, así que un llamador que se
saltara la condición ni siquiera compila.

La reproducción determinista de la primera pasada (ventana abierta envolviendo
el cliente Prisma) ahora pasa: la ficha se queda `publicado` con su nombre
original. El dev además **endureció mi prueba** —le añadió que el reenvío
perdedor recibe el mensaje de duplicado, no un error técnico ni un falso
"gracias"— y ligó `updateMany` en el envoltorio para que no pueda pasar por un
fallo del andamiaje. Cambio aceptado.

## MEDIO 3 · mitigado, baja a BAJO 2 (residual del despliegue)

La política no cambia y no tenía por qué: es la de T-003, aprobada en
`design.md` §4. Lo que cambia es que **deja de fallar en silencio**, que era
la mitad del hallazgo:

- `src/lib/admin/acceso.ts:54-74` — `avisarSiElLimiteDeAccesoNoAplica`, una vez
  por proceso, con prefijo `[panel]` y la palabra `INACTIVO`; llamada desde
  `src/app/admin/accion-acceso.ts:49`, antes de la comprobación del bloqueo.
- `.env.example:39-49` — `REGISTRO_ENCABEZADO_IP` pasa de nota al pie a
  **"REQUISITO DE DESPLIEGUE DEL PANEL"**, diciendo con todas las letras que
  sin ella la única credencial del sitio queda expuesta a fuerza bruta, y
  remitiendo a E0-3.

Verificado en vivo, arrancando el servidor **sin** la variable: dos intentos
fallidos y en el log exactamente **una** línea
`[panel] sin IP atribuible (REGISTRO_ENCABEZADO_IP sin configurar o encabezado
sin forma de IP): el límite de intentos de acceso al panel queda INACTIVO.`
Un despliegue mal configurado ya se delata solo.

Queda el residuo: con la variable puesta, el freno vale lo que valga el proxy.
Eso es de E0-3 y ya está escrito donde se va a leer.

## MEDIO 4 · cerrado, y la decisión me parece la correcta

`src/lib/registro/procesar.ts` ya no escribe `consintioAvisoEn` en el reenvío
(solo en el `create` del alta, línea 259). **Acepto la decisión como
definitiva**, y me parece mejor que lo que decía `design.md` §6: la constancia
es evidencia LFPDPPP del titular, el formulario es anónimo y el propio
`design.md` §6 admite que un número rechazado se puede sondear; escribirla en
cada reenvío sustituía la evidencia del titular por una fecha atribuible a un
tercero, sin vuelta atrás.

Lo evalué buscando el hueco que pudiera abrir, que era la pregunta pertinente:

- **¿Puede quedar una ficha sin constancia?** No. `consintioAvisoEn` es
  `DateTime` no nulo (`prisma/schema.prisma:47`) y solo se escribe en el alta;
  el reenvío nunca la pone a `null` porque ya no la toca.
- **¿Se vuelve el consentimiento opcional en el reenvío?** No.
  `validarRegistro` exige la casilla en **todos** los envíos y el envío sin
  ella no llega a la escritura. Lo fijé desde el ángulo del atacante con dos
  casos nuevos (sin la casilla y con `consentimiento=false`): la ficha
  rechazada no se toca, conserva su nombre, su estado y su motivo.
- **¿Puede un tercero mover o borrar la evidencia?** No: probado que un reenvío
  ajeno sí pisa los datos (riesgo asumido en `design.md` §6) pero deja
  `consintioAvisoEn` idéntica al milisegundo, mientras `registradoEn` sí se
  reinicia.
- **¿Y el titular legítimo que reenvía para renovar su consentimiento?** Vuelve
  a marcar la casilla —el sistema se lo exige— pero esa renovación **no queda
  registrada**: la constancia guardada queda más antigua que los datos que
  ampara. Si el texto del aviso de privacidad cambia entre el alta y el
  reenvío, la evidencia respalda la versión vieja. Es la contrapartida de la
  decisión, es menor que el problema que resuelve, y la dejé **fijada a la
  vista** con un test para que nadie la descubra por sorpresa. La columna extra
  que propone el dev (fecha del último consentimiento, sin borrar la primera)
  es el remedio real y merece ticket propio, no este change → **BAJO 3**.

## BAJO 1 (caducidad canonizada) · cerrado

`src/lib/admin/sesion.ts:87-107`: `/^\d{1,15}$/` + `Number.isSafeInteger` +
`String(caducidad) === caducidadTexto`. Verificado en vivo firmando **con el
secreto bueno** una caducidad no canónica: la cookie canónica abre (200), la de
ceros a la izquierda con la misma firma válida ya no (307 al acceso), y la
caducada sigue sin abrir. Sin regresión en el camino feliz.

## BAJO 3 (inundación del log) · cerrado

`src/lib/admin/config.ts:96-106` (`avisarSinConfigurarUnaVez`, con su
`reiniciarAvisoDeConfiguracion` para pruebas) y
`src/app/admin/page.tsx:53`. Un aviso por proceso, no por visita.

## BAJO 2 de la primera pasada ("Salir" sin revocación) · sigue como deuda

Sin cambios y de acuerdo: es la decisión de `design.md` §1, el riesgo es bajo
(`HttpOnly`, un solo admin) y la parte del escenario que depende del servidor
—el botón "atrás"— la cubre `no-store`. Queda como deuda declarada.

## Los `it.fails` invertidos: revisados uno a uno

El dev tocó mi archivo de pruebas, así que lo diffeé contra mi copia de la
iteración 1. Los tres pasaron de `it.fails` a `it` con **el mismo cuerpo de
aserciones**; los comentarios se actualizaron para describir el defecto en
pasado y la corrección en presente. En el de MEDIO 2, además, **sumó**
aserciones (el mensaje de duplicado al reenvío perdedor) y ligó `updateMany` en
el cliente instrumentado. **No se debilitó nada**: los tres siguen fallando si
se revierte la corrección.

## Regresión y cobertura nueva de esta etapa

Volví a pasar lo que ya estaba verde en la primera pasada y sigue verde:
guarda en las 10 superficies, cookies forjadas contra las 4 acciones, CSRF con
`Origin` hostil, XSS almacenado, inyección en los `wa.me`, carreras de
transiciones, no indexación y fuga del rastro de rechazo.

`tests/admin-adversarial.test.ts` crece de 44 a **48 casos, todos en verde**
(bloque nuevo "el reenvío y la constancia LFPDPPP del titular"):

| Caso nuevo | Qué fija |
| --- | --- |
| un reenvío ajeno no puede mover ni borrar la constancia del titular | la corrección de MEDIO 4, desde el ángulo del atacante |
| un reenvío sin la casilla / con `consentimiento=false` no toca la ficha rechazada | que conservar la constancia vieja no degenere en "el consentimiento ya no hace falta" |
| tras un reenvío legítimo la constancia es más antigua que los datos que ampara | la contrapartida aceptada de MEDIO 4, a la vista (BAJO 3) |

## Hallazgos que quedan abiertos

Ninguno crítico, alto ni medio. Cinco bajos, todos anotados a conciencia:

1. **"Salir" no revoca del lado del servidor** — deuda declarada
   (`design.md` §1, `b-dev.md` deuda 1).
2. **El freno de fuerza bruta del panel vale lo que valga el proxy** — residuo
   del MEDIO 3; política aprobada, ahora se delata sola en el log y está
   rotulada como requisito de despliegue. Verificación real del encabezado del
   hosting: **E0-3**.
3. **La constancia de consentimiento no registra la renovación del reenvío** —
   contrapartida de MEDIO 4, fijada con test. El remedio (columna extra) es
   ticket propio.
4. **`design.md` §6 contradice al código** — sigue diciendo "pone la constancia
   de consentimiento del nuevo envío", que es justo lo que la corrección de
   MEDIO 4 dejó de hacer. La divergencia está razonada en `b-dev.md` pero no en
   el documento de diseño, que es el que se consolida al archivar el change.
   **Para el validador o el humano del PR**: enmendar esa frase de `design.md`
   §6 (o dejar constancia en `proposal.md`) antes de archivar, o
   `openspec/specs/` se quedará con una decisión que el código no cumple.
5. **`.gitignore` bajo `.claude/` es una lista blanca** — hoy cubre exactamente
   lo que hay que cubrir, pero una futura carpeta de definiciones del pipeline
   quedará ignorada en silencio hasta que se añada su negación. Falla cerrado;
   basta con recordarlo cuando el pipeline crezca.

## Lo que sigue pendiente para el humano del PR

Sin cambios respecto a la primera pasada: el scenario **"revisar desde el
celular"** (390 px, áreas táctiles de 44 px, contraste AA) no es automatizable
con las herramientas del repo. Hay que abrir la cola, el detalle y los dos
formularios en un navegador real antes de mergear.
