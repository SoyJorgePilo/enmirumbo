# Reporte dev — agregar-panel-admin

Estado: las 26 tareas de `tasks.md` cerradas. `npm run lint`, `npm run build` y
`npm test` (606 pruebas, 25 archivos) en verde. Sin dependencias nuevas.

## Lo que quedó construido

### Módulos nuevos (`src/lib/admin/`)

| Archivo | Qué hace |
| --- | --- |
| `config.ts` | Fail-safe. Decide si el panel está configurado (`PANEL_CONTRASENA` no vacía + `PANEL_SESION_SECRETO` de ≥32 caracteres) y lee `SITIO_URL`. Único lugar que lee esas variables. Sin default de contraseña, sin atajo de desarrollo. |
| `sesion.ts` | Valor firmado `<caducidad>.<HMAC-SHA256("v1.<caducidad>")>`, 8 horas, `node:crypto`, comparación con `timingSafeEqual`, atributos de la cookie. Puro: no lee cookies ni redirige. |
| `acceso.ts` | Comparación de la contraseña en tiempo constante (sobre el SHA-256 de ambas, para no filtrar longitud) y límite de 5 intentos por IP cada 10 minutos. |
| `guarda.ts` | `requerirSesionAdmin()` (redirige a `/admin` sin parámetros), `haySesionAdmin()` y `sirviendoPorHttps()`. |
| `consultas.ts` | Cola (`en_revision`, más antiguo primero, `atrasado`/`esperaTexto` contra un "ahora" inyectable) y detalle completo. También define los tipos que consumen los componentes de la etapa UI. |
| `transiciones.ts` | `aprobarRegistro` y `rechazarRegistro`: validan y escriben condicionadas al estado. |
| `textos.ts`, `whatsapp.ts` | De la etapa UI; solo se sumaron dos literales (ver "Copy nuevo"). |

### Rutas y acciones (`src/app/admin/`)

Los 4 mocks (`accion-*-mock.ts`) y `src/lib/mock/agregar-panel-admin.ts` se
borraron. En su lugar: `accion-acceso.ts`, `accion-salir.ts`,
`registros/[id]/accion-aprobar.ts` y `registros/[id]/accion-rechazar.ts`. Las 6
páginas leen Prisma de verdad y empiezan con `await requerirSesionAdmin()`
(excepto la pantalla de acceso, que ES el destino de la guarda).

Las 6 rutas del panel salen como `ƒ (Dynamic)` en el build sin necesidad de
`force-dynamic`: `cookies()` dentro de la guarda ya las saca del prerender
(esto cierra el pendiente #5 del reporte de UI).

### Fuera de `src/lib/admin/`

- `prisma/schema.prisma` + migración `20260904030602_agregar_rastro_de_rechazo`
  (dos `ALTER TABLE ADD COLUMN`, aplicables sobre base con datos).
- `prisma/seed-demo.ts`: el negocio rechazado trae fecha y motivo ficticios.
- `src/lib/negocio.ts`: `ESTADO_NEGOCIO_RECHAZADO`.
- `src/lib/registro/procesar.ts`: bifurcación del duplicado según estado.
- `src/lib/registro/limite-ip.ts`: fábrica `crearCupoPorIp` (ver decisión 2).
- `.env.example`: las tres variables nuevas, comentadas.
- `eslint.config.mjs`: ignorar `.claude/**` (ver "Fuera de alcance que sí toqué").

## Mapa scenario → test

### `revision-admin`

| Requirement · Scenario | Dónde se verifica |
| --- | --- |
| Acceso… · entrar con la contraseña correcta | `tests/admin-acceso.test.ts` "con la contraseña correcta crea la cookie…" (atributos, la cookie no contiene contraseña ni secreto, sirve como sesión) + verificación a mano con `curl` |
| Acceso… · contraseña equivocada | `tests/admin-acceso.test.ts` "con otra contraseña no crea sesión…" y "un envío sin campo de contraseña…" |
| Acceso… · cookie manipulada o caducada | `tests/admin-sesion.test.ts` `it.each` de 10 tokens inválidos; `tests/admin-paginas.test.ts` "una cookie manipulada vale lo mismo que ninguna" |
| Acceso… · salir del panel | `tests/admin-acceso.test.ts` "caduca la cookie con los mismos atributos…" (limitación documentada abajo) |
| Acceso… · intentos repetidos | `tests/admin-sesion.test.ts` (unidad) + `tests/admin-acceso.test.ts` "tras agotar los intentos, ni la contraseña correcta entra" + `curl` desde dos IPs |
| Acceso… · la contraseña no aparece en el log | `tests/admin-acceso.test.ts` "ni el acceso exitoso ni el fallido escriben…" (espía los 5 niveles de `console`) |
| Fail-safe · sin contraseña configurada | `tests/admin-config.test.ts` (3 casos) + `tests/admin-acceso.test.ts` (la pantalla, sin `<input>` y sin decir qué falta) |
| Fail-safe · sin secreto de firma | `tests/admin-config.test.ts` + `tests/admin-acceso.test.ts` "con la contraseña correcta pero sin secreto no se crea ninguna sesión" |
| Fail-safe · nada de contraseñas por defecto | `tests/admin-config.test.ts` "ningún módulo del panel usa un valor por defecto…" y "…sin variables no abre ni en desarrollo" (revisión del código y de `.env.example`) |
| Fail-safe · ninguna transición sin configuración | `tests/admin-sesion.test.ts` "sin panel configurado, ninguna cookie vale" + verificado a mano (cookie bien firmada con el secreto viejo → 307 al acceso) |
| Sesión obligatoria · cola / detalle / aprobar / rechazar sin sesión | `tests/admin-paginas.test.ts`, describe "sin sesión no se abre ni se toca nada" (6 pantallas + las 2 acciones, comprobando el estado de la base después) |
| Sesión obligatoria · ninguna transición desde lo público | `tests/admin-acceso.test.ts` (la guarda en todos los archivos del panel) + `tests/registro-adversarial.test.ts` (el formulario público no cambia estado/origen/giros/token) |
| No indexación · metadata | `tests/admin-paginas.test.ts` (las 6 pantallas) + `curl` sobre el sitio: `<meta name="robots" content="noindex, nofollow"/>` |
| No indexación · sin enlaces desde lo público | `tests/layout.test.ts` "ninguna página pública enlaza ni menciona la ruta del panel" |
| Cola · orden / solo pendientes / vacía | `tests/admin-consultas.test.ts` (unidad, con 3/47/49/200 horas) + `tests/admin-paginas.test.ts` (los literales en el HTML) |
| Indicador 48h · atrasado / dentro de la meta / se lee | `tests/admin-consultas.test.ts` (incluye el borde exacto de 48 h) + `tests/admin-paginas.test.ts` (texto, no color) |
| Detalle · completo / solo obligatorios / inexistente | `tests/admin-consultas.test.ts` + `tests/admin-paginas.test.ts` |
| Detalle · los datos personales no salen del panel | `tests/admin-paginas.test.ts` (sin sesión no salen ni en la respuesta ni en el log; con sesión el log sigue limpio) + `tests/directorio-adversarial.test.ts` (ya existente) |
| WhatsApp de verificación · abrir conversación / número no interpretable | `tests/admin-textos.test.ts` (enlace y mensaje) + `tests/admin-paginas.test.ts` (el detalle real) |
| Aprobar · completa / sin giros / 4 giros / colonia "Otra" / colonia elegida / origen siembra / no edita datos | `tests/admin-transiciones.test.ts` (10 casos) |
| Aviso de publicación · literal / link real / sin enlace de gestión | `tests/admin-textos.test.ts` + `tests/admin-paginas.test.ts` (la URL absoluta contra `construirSegmentoFicha`) |
| Rechazar · con motivo / sin motivo / aviso por WhatsApp / el rechazado no se publica | `tests/admin-transiciones.test.ts` + `tests/admin-paginas.test.ts` |
| Ya resuelto · doble aprobación / rechazar publicado / recargar | `tests/admin-transiciones.test.ts` (4 casos) + `tests/admin-paginas.test.ts` ("recargar la confirmación no repite la transición") |
| Mobile-first · 390px, contraste, áreas táctiles | **Manual, parcial.** La etapa UI lo revisó sobre el HTML; los tokens de contraste y `min-h-11` los vigila `tests/layout.test.ts`. **Pendiente para el humano del PR: verlo en un navegador real.** |
| Mobile-first · funciona sin JavaScript / sin JS de cliente propio | `tests/layout.test.ts` ("ningún archivo declara `use client`") + **verificación a mano**: acceso, aprobación (con y sin error) y rechazo posteados con `curl` como lo haría un navegador sin JS |

### `modelo-datos` (MODIFIED)

| Scenario | Test |
| --- | --- |
| negocio recién creado (campos nulos) | `tests/modelo-rechazo.test.ts` |
| rechazo con fecha y motivo | `tests/modelo-rechazo.test.ts` |
| el rastro del rechazo se limpia al volver a revisión | `tests/modelo-rechazo.test.ts` + `tests/registro-reenvio.test.ts` |
| migración sobre una base con datos | `tests/modelo-rechazo.test.ts` (base temporal: migración inicial → 3 negocios en los 3 estados → migración nueva → filas intactas) |
| el seed de demostración incluye un rechazo con motivo | `tests/seed-demo.test.ts` |

### `registro-negocio` (MODIFIED)

| Scenario | Test |
| --- | --- |
| número con ficha publicada / en revisión | `tests/registro-reenvio.test.ts` + `tests/registro-adversarial.test.ts` |
| reenvío tras un rechazo | `tests/registro-reenvio.test.ts` (datos nuevos, estado, rastro limpio, relojes reiniciados) + "vuelve a la cola como recién llegada" |
| el formulario no delata el rechazo | `tests/registro-reenvio.test.ts` (el resultado serializado no contiene el motivo ni los datos anteriores) + `curl` sobre la pantalla de gracias |
| el reenvío no se autopublica | `tests/registro-reenvio.test.ts` + `tests/registro-adversarial.test.ts` |
| el reenvío pasa por las mismas defensas | `tests/registro-reenvio.test.ts` (campo trampa, cupo por IP, campo inválido, sin consentimiento) |
| duplicado con otro formato / carrera entre envíos | ya cubiertos en `tests/registro-accion.test.ts` y `tests/registro-adversarial.test.ts` (siguen verdes) |

## Verificación a mano (lo no automatizable)

Con `next dev` levantado y las tres variables por línea de comandos:

1. **Acceso sin JS**: `POST /admin` con los campos ocultos que Next pinta en el
   `<form>` → `303` + `Set-Cookie: nu_panel=…; Path=/admin; Max-Age=28800;
   HttpOnly; SameSite=lax` (sin `Secure`, porque es HTTP local: correcto).
2. **Antifuerza bruta**: 5 intentos malos desde `198.51.100.9` y el 6º con la
   contraseña buena → `/admin?error=intentos`; desde otra IP entra normal.
3. **Guarda**: `/admin/cola` sin cookie y con cookie alterada → `307` a `/admin`.
4. **Aprobar sin JS** sobre un registro real: 4 giros → vuelve al detalle con
   `errorAprobar=giros` y las casillas marcadas; 2 giros → publica; repetir →
   `ya-resuelto`; la ficha aparece de inmediato en `/belleza` y su URL pública
   abre con 200. El `wa.me` del aviso lleva la URL absoluta correcta.
5. **Rechazar sin JS**: motivo vacío → error; con motivo → `/rechazado`, con el
   mensaje de WhatsApp armado a partir del motivo **guardado en la base**.
6. **Reenvío tras rechazo**: el mismo número reenviado desde el formulario
   público → pantalla de gracias, y en la base **una sola fila**, actualizada,
   en `en_revision`, con `rechazadoEn`/`motivoRechazo` nulos y ambos relojes
   reiniciados. Un número ya publicado sigue dando el mensaje de duplicado.
7. **Fail-safe**: servidor sin las variables → "El panel no está disponible por
   ahora.", sin `<input>`, sin decir qué falta; el detalle sí aparece en el log
   del servidor; una cookie válida firmada con el secreto viejo tampoco abre.

Los datos de prueba manual se borraron de `prisma/dev.db` y se resembró el demo.

## Decisiones técnicas

1. **Nombres de las variables**: `PANEL_CONTRASENA`, `PANEL_SESION_SECRETO`,
   `SITIO_URL`. El límite de intentos **reutiliza `REGISTRO_ENCABEZADO_IP`** en
   vez de estrenar una variable: declara el proxy de confianza del despliegue,
   que es uno para todo el sitio. Queda documentado en `.env.example`.
2. **`crearCupoPorIp` en `src/lib/registro/limite-ip.ts`**: `design.md` §4 pide
   reutilizar ese módulo "con su propia ventana", y el contador estaba atado a
   un `Map` de módulo con la ventana fija. Se extrajo a una fábrica y las
   funciones públicas de siempre (`ipBloqueada`, `registrarAlta`…) se quedan
   como estaban, construidas sobre ella. Cero cambios en sus llamadores y sus
   87 pruebas siguen verdes. Cada cupo tiene su propio mapa: agotar los
   intentos del panel no gasta el cupo de altas ni al revés.
3. **La cookie se llama `nu_panel`**, neutro a propósito: no anuncia qué panel
   protege.
4. **Los giros no caben en la escritura condicionada** (`updateMany` no acepta
   relaciones). Se hace el `updateMany` condicionado primero y, solo si afectó
   una fila, un `update` con `giros: { set: … }`. Quien perdió la carrera nunca
   llega a la segunda escritura, así que no puede pisar los giros del ganador.
5. **Aprobar conserva `coloniaOtra`**: normalizar es rellenar `coloniaId`, no
   borrar lo que el negocio escribió. El directorio ya prefiere la colonia del
   catálogo, y el detalle sigue mostrando el texto original.
6. **Los giros se validan contra el catálogo y se deduplican** antes de la cota
   de 3: un POST directo podía mandar ids inventados o repetidos.
7. **El motivo del rechazo se recorta a 500 caracteres** (`LIMITE_MOTIVO_RECHAZO`).
   Lo escribe el admin, pero un `textarea` sin cota es una columna sin cota y
   ese texto viaja dentro de un mensaje de WhatsApp.
8. **La confirmación de rechazo lee el motivo de la base**, no de la URL (lo que
   el mock hacía por no tener dónde persistir). Un `searchParams` queda en el
   historial y en los logs del proxy.
9. **`SITIO_URL` sin configurar en producción**: la pantalla de aprobado no
   pinta el botón de WhatsApp y muestra un aviso (`MENSAJE_SIN_URL_DEL_SITIO`).
   `design.md` §7 pide fallar a la vista antes que mandarle `localhost` a un
   negocio real. Fuera de producción, el default es `http://localhost:3000`.
10. **Se mantuvo el patrón sin Client Components de la etapa UI**
    (`searchParams` para conservar la selección tras un error). Funciona, no
    necesita cookie de "flash message" y el requirement "sin JS de cliente
    propio" se cumple literalmente. Verificado con `curl`, sin navegador.
11. **`vi.mock` de `next/headers`/`next/navigation` en `tests/admin-mocks.ts`**:
    permite mandarle a las páginas y a las Server Actions reales una petición
    **con o sin cookie**, que es el único modo de probar "un POST directo sin
    sesión no transiciona nada" sin levantar un servidor. La lógica no se
    simula: la sesión, la contraseña y las consultas son las de producción.
    Comprobé que el test es real quitando la guarda de `cola/page.tsx`: 4
    pruebas se ponen rojas.

## Hallazgo de la prueba a mano (bug que los tests no tenían)

Abrir a pelo `/admin/registros/<id>/rechazado` sobre un registro que seguía en
`en_revision` pintaba **"Registro rechazado."** y un botón de WhatsApp con el
motivo vacío — una confirmación de algo que nunca pasó, capaz de hacer creer al
admin que ya resolvió un registro. Lo mismo con `/aprobado` y `/ya-resuelto`.
Se agregó primero el test (`tests/admin-paginas.test.ts`, "una confirmación que
no corresponde al estado real regresa al detalle") y luego el `redirect` al
detalle en las tres pantallas.

## Tests existentes que hubo que cambiar (y por qué)

1. `tests/registro-adversarial.test.ts` — el caso "un número con ficha en estado
   **rechazado** no se puede volver a registrar" codificaba la regla que esta
   spec cambia a propósito. Se dejó el caso para `en_revision`/`publicado` y se
   escribió uno nuevo para el rechazado, que sigue vigilando lo importante: el
   reenvío **no** se autopublica ni toca origen, giros ni token.
2. `tests/directorio-consultas.test.ts` — "solo el módulo del directorio filtra
   por estado publicado". Ahora hay dos archivos que nombran ese estado y hacen
   cosas distintas: `directorio.ts` lo **filtra**, `admin/transiciones.ts` lo
   **escribe**. La lista es exacta (un tercer archivo rompe la suite) y se sumó
   una comprobación de que el módulo del panel nunca lo usa dentro de un `where`.
3. `tests/layout.test.ts` — además de la tarea 24, el test "sin rastros de la
   plantilla" prohibía la palabra "vercel" en `src/`, y `config.ts`/`guarda.ts`
   miran `VERCEL_ENV` (la misma defensa que ya tenía `prisma/seed-demo.ts`). El
   patrón se afinó a los rastros reales (`vercel.svg`, `vercel.com/app`).

## Fuera de alcance que sí toqué

`eslint.config.mjs`: `npm run lint` fallaba con 536 errores provenientes de
`.claude/worktrees/agent-…/.next/build/*.js` (el worktree de otro agente, con su
`.next` compilado dentro; el ignore de `.next/**` solo alcanza al de la raíz).
Se agregó `.claude/**` a `globalIgnores`. No es código del producto y no afecta
a ningún archivo del proyecto; si el validador prefiere resolverlo de otra
forma (p. ej. en `.gitignore`), es una línea.

## Deuda y propuestas (fuera de alcance de esta spec)

1. **Salir no revoca el token del lado del servidor.** `design.md` §1 lo decidió
   así ("rotar el secreto invalida todas"), y la cookie es `HttpOnly`, así que
   el riesgo real es bajo. Pero el scenario "la cookie deja de servir" se cumple
   por el navegador, no por el servidor: quien haya copiado el valor lo puede
   usar hasta que caduque. Si algún día importa, la solución barata es meter en
   el HMAC un contador de sesión guardado en disco.
2. **El límite de intentos vive en memoria del proceso** (misma deuda declarada
   de T-003): se reinicia con cada despliegue y no se comparte entre instancias.
   Va con E0-3, junto con el cupo de altas.
3. **Sin `REGISTRO_ENCABEZADO_IP` configurada no hay antifuerza bruta**, porque
   no hay a quién atribuir los intentos. Es un requisito de despliegue, no un
   extra; conviene que E0-3 lo verifique explícitamente.
4. **La purga de rechazados a los 90 días** ya tiene su dato (`rechazadoEn`) y
   ningún consumidor: sigue esperando tarea programada (E0-3).
5. **Borrado definitivo desde el panel (ARCO)**: como dice la propuesta, hoy se
   atendería a mano contra la base. Propongo ticket propio antes del lanzamiento.
6. **`textoConteoAtrasados`, "Volver a la cola", "Datos internos del panel", "No
   capturado" y `MENSAJE_SIN_URL_DEL_SITIO`** son copy sin literal en la spec
   (los cuatro primeros vienen de la etapa UI). Si el humano los ajusta, es un
   change de copy sin migración.
7. **Cuando E5/E0-3 metan ISR** en el directorio público habrá que revalidar al
   aprobar. Hoy no hace falta (`force-dynamic`), y así lo anota `design.md` §5.
8. **Propuesta**: la cola no tiene paginación. Con decenas de registros sobra;
   si la siembra dispara el volumen, conviene acotarla antes de que el admin
   cargue 300 renglones en 4G.

---

# Iteración 2 — respuesta a la etapa C

Los 8 hallazgos de `c-seguridad.md` atendidos: el ALTO y los 4 MEDIOS
corregidos, los BAJOS 1 y 3 corregidos, el BAJO 2 asumido como deuda declarada.
Los **44 tests adversariales de la etapa C quedan en verde** y sus 3 `it.fails`
son ahora `it` normales. Puertas: `npm run lint`, `npm run build` y `npm test`
(**26 archivos, 666 pruebas**) en verde.

## ALTO 1 · `.claude/worktrees/` commiteable — corregido

`.gitignore` (nuevo bloque al final):

```
.claude/*
!.claude/agents/
!.claude/commands/
```

No es `.claude/` a secas a propósito: `.claude/agents/*.md` y
`.claude/commands/*.md` son las definiciones del pipeline y **están
versionadas** (10 archivos rastreados); ignorar la carpeta entera obligaría a
un `git add -f` cada vez que se edite un agente. Con esto, todo lo demás que
aparezca bajo `.claude/` —hoy `worktrees/`, con sus `prisma/dev.db` y sus
`.next/`— queda fuera, y las definiciones siguen siendo versionables.

Verificado: `git check-ignore -v .claude/worktrees/agent-…/prisma/dev.db` →
ignorado por `.gitignore:64`; `git check-ignore .claude/agents/dev.md` → no
ignorado; `git status --short .claude` → vacío (antes: `?? .claude/worktrees/`).

El ignore de ESLint (`.claude/**`) se queda: sigue haciendo falta para que
`npm run lint` no intente lintear el `.next` compilado de un worktree, que
existe en disco aunque git ya no lo vea.

## MEDIO 1 · Ids desmesurados → 500 — corregido

- `src/app/admin/registros/[id]/accion-aprobar.ts`: `idsDelFormulario` se
  reemplazó por `idDeCatalogo` (`/^\d{1,9}$/` + `Number.isSafeInteger` + `> 0`)
  y `girosDelFormulario`, que además **distingue "no vino" de "vino mal"**: un
  valor mal formado ya no se descarta en silencio —eso habría publicado la
  ficha sin giros— sino que sale por el camino de error normal
  (`errorAprobar=giros` / `errorAprobar=colonia`) **sin llegar a consultar la
  base**. Al volver al detalle solo se conserva lo que se pudo interpretar: el
  valor hostil no se le devuelve al navegador.
- `src/lib/admin/transiciones.ts`: `esIdDeCatalogo()` repite la comprobación
  antes de tocar Prisma, para que ningún otro llamador del módulo se la salte.

Tests: los 2 `it.fails` de la etapa C ahora verdes, más
`tests/admin-transiciones.test.ts` con 6 formas de id inválido (desbordado,
negativo, cero, decimal, `Infinity`, `NaN`) por giro y una por colonia.
Comprobado también contra el servidor: los dos POST que antes daban 500 ahora
dan `303` al detalle con su error, sin una sola
`PrismaClientValidationError` en el log.

## MEDIO 2 · Reenvío sin condicionar el estado — corregido

`src/lib/registro/procesar.ts` pasa de `update({ where: { id } })` a:

```ts
const escritura = await contexto.prisma.negocio.updateMany({
  where: { id: existente.id, estado: ESTADO_NEGOCIO_RECHAZADO },
  data: { …datos, registradoEn: ahora, estado: ESTADO_NEGOCIO_DEFAULT,
          rechazadoEn: null, motivoRechazo: null },
});
if (escritura.count === 0) {
  return rechazo({ whatsapp: MENSAJES_ERROR_REGISTRO.whatsappDuplicado });
}
```

Mismo patrón que `transiciones.ts` (design.md §5). Si entre la lectura y la
escritura el admin resolvió la ficha, `count` es 0 y el envío se responde como
**el duplicado que a esas alturas es** — que es exactamente lo que vería si
hubiera llegado un segundo después. `ClienteRegistro` cambia `update` por
`updateMany`.

Test: el `it.fails` de la etapa C, ahora verde. Le agregué dos cosas para que
pase por la razón correcta y no por un error del envoltorio: ligar
`updateMany` en el cliente instrumentado (como ya estaban `update`, `create`…)
y comprobar que el reenvío perdedor recibe el mensaje de duplicado, no un error
técnico ni un falso "gracias".

## MEDIO 3 · Antifuerza bruta del login — política igualada y aviso propio

La política se deja **exactamente igual a la endurecida del registro** (T-003,
hallazgo ALTO 1 de aquella etapa): se confía solo en el encabezado declarado en
`REGISTRO_ENCABEZADO_IP` y de él se toma el **último salto**, validado como IP.
Con un proxy que añade (nginx, HAProxy) o sobrescribe (`cf-connecting-ip`), el
cliente no puede elegir su clave; sin proxy declarado, no hay a quién atribuir
los intentos. Lo que cambia es que **deja de fallar en silencio**:

- `src/lib/admin/acceso.ts`: `avisarSiElLimiteDeAccesoNoAplica(ip)`, un aviso
  **una sola vez por proceso** (mismo criterio que `limite-ip.ts`, no uno por
  petición) con el prefijo `[panel]` y la palabra `INACTIVO`. Es propio del
  panel a propósito: el aviso del registro habla de "altas por IP" y se consume
  en la primera petición del formulario público, que puede ser de horas antes.
- `src/app/admin/accion-acceso.ts` lo llama con la IP resuelta.
- `.env.example`: `REGISTRO_ENCABEZADO_IP` deja de ser una nota al pie del
  bloque del panel y pasa a estar rotulada **"REQUISITO DE DESPLIEGUE DEL
  PANEL"**, diciendo que sin ella no hay límite de intentos sobre la única
  credencial del sitio, y remitiendo a E0-3.

Tests: `tests/admin-acceso.test.ts`, tres casos (sin variable declarada; con
variable pero último salto sin forma de IP; con IP atribuible → sin aviso y con
bloqueo efectivo). Reproduje además los dos bypasses del reporte contra el
servidor: siguen dando `?error=incorrecta` (es el diseño aceptado) pero ahora
con la línea `[panel] sin IP atribuible … queda INACTIVO` en el log, una vez.

**Queda para el humano**: si se prefiere "fallar cerrado" (contador global
cuando no hay IP), es cambio de spec. Con el aviso, al menos el despliegue mal
configurado se delata solo.

## MEDIO 4 · La constancia de consentimiento — protegida

`src/lib/registro/procesar.ts` **ya no escribe `consintioAvisoEn` en el
reenvío**: se conserva la del envío original.

Esto se aparta de `design.md` §6 ("pone la constancia de consentimiento del
nuevo envío") y lo hace a conciencia: `consintioAvisoEn` es la evidencia
LFPDPPP de que **el titular** consintió el aviso (PRD §8), el formulario
público es anónimo y `design.md` §6 admite que un número rechazado se puede
sondear. Pisarla sustituye la evidencia del titular por una fecha atribuible a
un tercero, y esa pérdida es irreversible.

Por qué esto NO deja fichas sin consentimiento: `validarRegistro` exige el
checkbox en **todos** los envíos, incluido el reenvío, así que no se llega a la
escritura sin consentimiento marcado (cubierto por el test "sin consentimiento
del aviso no se actualiza nada"). Lo que se conserva es la constancia **más
antigua**, que es la que prueba el consentimiento original.

No hace falta migración. Si el humano quiere además guardar la fecha del
reenvío, eso sí es una columna nueva y un cambio de spec: lo dejo propuesto,
no implementado.

Tests: `tests/registro-reenvio.test.ts` gana el caso "conserva la constancia de
consentimiento original, no la del reenvío"; el caso de la actualización
completa se ajustó (ya no espera que la constancia cambie). Verificado también
contra el servidor: tras alta → rechazo → reenvío, `consintioAvisoEn` sigue
siendo la del alta y `registradoEn` sí es la del reenvío.

## BAJO 1 · Caducidad de la cookie canonizada

`src/lib/admin/sesion.ts`: la caducidad se acota a `/^\d{1,15}$/`, se exige
`Number.isSafeInteger` y `String(caducidad) === caducidadTexto`, y la
comparación usa ya el número canónico. Con eso desaparecen los ceros a la
izquierda (dos cookies para la misma sesión) y cualquier cadena que colapse a
`Infinity` (sesión eterna). Tests: 3 casos nuevos en el `it.each` de tokens
inválidos, más uno que firma **con el secreto bueno** una caducidad no canónica
y comprueba que tampoco abre (el formato se valida antes que la firma).

## BAJO 3 · El log ya no se puede inundar desde `/admin`

`src/lib/admin/config.ts`: `avisarSinConfigurarUnaVez()` (con
`reiniciarAvisoDeConfiguracion()` para pruebas), y `src/app/admin/page.tsx` la
usa en vez de un `console.warn` por visita. El detalle de qué falta se sigue
escribiendo —una vez— solo en el log. Test: cinco renders seguidos de la
pantalla producen exactamente un aviso.

## BAJO 2 · Deuda declarada (no se corrige aquí)

"Salir" no revoca del lado del servidor: un valor de cookie copiado antes de
salir sigue abriendo el panel hasta su caducidad. Es la decisión de
`design.md` §1 ("rotar el secreto invalida todas") y la etapa C la confirmó
como riesgo bajo (`HttpOnly`, un solo admin, `no-store` en las 6 pantallas
cubre el botón "atrás"). Sigue anotada como deuda 1 de la sección anterior; el
remedio barato, si algún día importa, es meter en el HMAC un contador de sesión
persistido.

## Archivos tocados en esta iteración

`.gitignore`, `.env.example`, `src/lib/admin/{acceso,config,sesion,transiciones}.ts`,
`src/app/admin/page.tsx`, `src/app/admin/accion-acceso.ts`,
`src/app/admin/registros/[id]/accion-aprobar.ts`, `src/lib/registro/procesar.ts`,
`tests/{admin-acceso,admin-sesion,admin-transiciones,registro-reenvio}.test.ts`
y `tests/admin-adversarial.test.ts` (los 3 `it.fails` invertidos, sus
comentarios actualizados y el envoltorio del cliente Prisma ligado a
`updateMany`).

`prisma/dev.db` quedó como estaba: 12 negocios de demostración (10 publicados,
1 en revisión, 1 rechazado); los registros de la prueba manual se borraron y se
resembró el demo.
