# Reporte seguridad y calidad — agregar-formulario-registro

Etapa C del pipeline. Alcance: spec `registro-negocio` (12 requirements / 40
scenarios) + delta `layout-base` (4), reportes `a-ui.md` y `b-dev.md`, y el
diff completo contra `main` (`git diff main` + los archivos sin seguimiento de
`git status`, que es donde vive casi todo el change).

Contexto que sube el listón: es la **primera superficie pública que recibe
datos personales de terceros** en un repo público (LFPDPPP).

> **Estado final: iteración 2 cerrada — LIMPIO.** Lo de abajo es la auditoría
> de la iteración 1 (1 alto, 6 medios), que se conserva como está para que se
> vea qué se buscó y qué se encontró. La re-auditoría contra el código
> corregido está al final, en "Iteración 2 — re-auditoría".

## Veredicto (iteración 1)

**Regresa al dev.** 0 críticos, **1 alto**, 6 medios. Lo alto y los medios 1-3
son de la misma zona (anti-abuso y constancia de consentimiento) y se arreglan
con cambios chicos y localizados en `src/lib/registro/limite-ip.ts` y
`src/lib/registro/validacion.ts`.

Lo bueno, para que no se pierda entre los hallazgos: la validación vive
íntegra en el servidor y no confía en el navegador; el alta se arma con un
objeto explícito (`DatosNegocioValidados`), así que `estado`, `origen`,
`publicadoEn`, `tokenGestion`, `consintioAvisoEn`, `fotoUrl`, `latitud`,
`longitud`, `registradoEn` y `giros` mandados por el cliente se ignoran por
construcción (lo verifiqué con envíos crudos); no hay SQL crudo con entrada de
usuario ni `dangerouslySetInnerHTML`; los mensajes de error no filtran detalle
técnico; ningún `console.*` interpola datos capturados ni la IP; no hay
secretos ni datos personales reales en código, tests o seeds.

## Hallazgos

### ALTO 1 — El límite por IP se anula con un encabezado que escribe el propio cliente, y con él la única mitigación del oráculo de números registrados

`src/lib/registro/limite-ip.ts:61-68` (`ipDeEncabezados`) y su uso en
`src/app/registro/accion.ts:31` → `src/lib/registro/procesar.ts:132,157`.

`ipDeEncabezados` toma **el primer elemento** de `x-forwarded-for`, o
`x-real-ip`, sin validar que sea siquiera una IP. Detrás de cualquier proxy o
CDN que *antepone* la IP real al valor recibido (el comportamiento por defecto
de nginx, Cloudflare y HAProxy; Vercel sí lo sobrescribe, pero el hosting es
decisión pendiente de E0-3), el primer elemento es exactamente la cadena que
mandó el atacante. Sin proxy, tampoco hay límite (deuda 1 de `b-dev.md`). En
los dos casos el cupo de 3/hora del requirement "Anti-abuso sin captcha" no
existe.

Escenario de explotación (automatizado en
`tests/registro-adversarial.test.ts`, "rotar x-forwarded-for anula el cupo…"):
un script manda envíos completos y válidos cambiando `X-Forwarded-For` en cada
petición. Consigue dos cosas:

1. **Enumeración ilimitada de números registrados.** El mensaje "Este número ya
   tiene una ficha registrada…" es un oráculo de sí/no sobre el WhatsApp de un
   tercero; `design.md §5` acepta el oráculo *porque* el cupo por IP lo acota.
   Sin cupo, barrer las ~10⁴ combinaciones de una lada local es cuestión de
   minutos y no deja ni una fila en la base (el rechazo por duplicado ocurre
   después de gastar cupo, así que ni siquiera ensucia la cola). Saber que un
   número está dado de alta en el directorio es dato personal (LFPDPPP).
2. **Alta masiva de fichas basura** con números inventados, que caen en la cola
   del admin (el honeypot solo frena bots ingenuos).

Fix sugerido (no lo implemento, no hay spec): leer la IP de una sola fuente
declarada por configuración según el hosting (o el último salto), validar que
la cadena parezca una IP antes de usarla como clave, y documentar en el módulo
que sin esa garantía el cupo no protege nada. Va junto con el MEDIO 1.

### MEDIO 1 — El mapa de IPs crece sin cota, con claves que controla el atacante

`src/lib/registro/limite-ip.ts:24` (`altasPorIp`), `:26-32` (`recientes`),
`:43` (`registrarAlta`).

Las entradas caducadas solo se purgan **cuando esa misma IP vuelve a
aparecer**. Con la clave bajo control del cliente (ALTO 1), cada envío válido
con un `x-forwarded-for` nuevo agrega una entrada que nunca se visita otra vez;
la clave es una cadena arbitraria sin cota de longitud. Como los envíos que
chocan con un duplicado también gastan cupo (`procesar.ts:157` va antes de la
consulta de duplicado), se puede crecer el mapa **sin escribir una sola fila**
en la base: memoria del proceso a cambio de nada. Test:
"el mapa de IPs crece sin cota y no se purga solo".

Fix sugerido: purgar lo caducado al insertar y poner un techo de entradas
(descartar/desalojar por antigüedad), más una cota de longitud de la clave.

### MEDIO 2 — La constancia de consentimiento se registra por la mera presencia del campo

`src/lib/registro/validacion.ts:55-57` (`casilla`) y `:80`.

`casilla` devuelve `true` si la clave existe en el `FormData`, con cualquier
valor. Un POST crudo con `consentimiento=` (vacío), `consentimiento=false` o
`consentimiento=no` crea la ficha y graba `consintioAvisoEn` — es decir, deja
una **constancia de consentimiento LFPDPPP de un envío que nunca afirmó
consentir**. El navegador nunca manda eso (solo envía el campo si está
marcado), así que no rompe a nadie legítimo; el problema es la calidad legal de
la constancia, que es justo lo que el requirement "Consentimiento con aviso
simplificado visible y constancia" quiere sostener. Test:
"basta con que el campo de consentimiento exista, aunque venga vacío".

Nota: el helper de `tests/registro-accion.test.ts:44` omite los campos con
valor vacío, por eso el test del dev "sin consentimiento no crea nada" pasa sin
tocar este caso.

Fix sugerido: exigir un valor afirmativo (`"on"`, o al menos no vacío) en
`casilla` para `consentimiento`.

### MEDIO 3 — Tres campos sin cota de longitud, y el rechazo devuelve el payload entero

`src/lib/registro/textos.ts:17-25` (`LIMITES_LONGITUD`) y
`src/lib/registro/validacion.ts:130-144`.

`whatsapp`, `categoriaId` y `coloniaId` no están en la lista de campos
limitados. Un POST con 100 KB (hasta el tope de cuerpo de Server Actions) en
`whatsapp` pasa por `replace(/\D/g,"")`, se rechaza… y vuelve íntegro dentro de
`estado.valores`, que se serializa en la respuesta y se pinta como
`defaultValue` del input: amplificación barata de respuesta por cada POST, sin
gastar cupo (el rechazo es previo a `registrarAlta`). Test: "el WhatsApp no
tiene cota de longitud y el rechazo devuelve el payload entero".

Fix sugerido: cota corta para los tres (p. ej. 30/10/10) antes de normalizar.

### MEDIO 4 — `facebookUrl` se guarda en crudo: el saneo queda íntegro para quien lo pinte

`src/lib/registro/validacion.ts:96-103` (`esUrlHttp`) y `:195`.

La validación del esquema está bien hecha y cierra `javascript:`, `data:`,
`vbscript:`, `file:` y `//host` (lo confirmé con 9 payloads, incluidos
variantes con mayúsculas y con salto de línea al inicio). Pero lo que se
persiste es la **cadena cruda del usuario**, no `url.href`, y no se restringe
el host (decisión explícita de `design.md §3`). Hoy no hay render, así que no
es explotable en este change; el riesgo se hereda: `https://facebоok.com/...`
(homógrafo cirílico), `https://facebook.com@evil.example/...` y
`http://127.0.0.1:8080/admin` se guardan tal cual y el día que la ficha pública
o el panel los pinten serán phishing con la etiqueta "Facebook" al lado. Test:
"acepta y guarda tal cual un link http(s) que no es de Facebook".

Fix sugerido (barato, aquí): guardar `new URL(valor).href` en vez del crudo, y
dejar anotado en el change que el render obligatorio es `rel="noopener
noreferrer"` + texto que no prometa que es Facebook.

### MEDIO 5 — `REGISTRO_UMBRAL_ALTAS_DIARIAS` no está en `.env.example`

`src/lib/registro/procesar.ts:58` lee `process.env.REGISTRO_UMBRAL_ALTAS_DIARIAS`
y `.env.example` sigue teniendo solo `DATABASE_URL`. Variable nueva de
configuración sin documentar: quien despliegue no sabe que existe la palanca de
la alerta del PRD §8. (Sin riesgo de secreto: es un número.)

### MEDIO 6 — Scenarios automatizables sin test automatizado

Del mapa scenario→test de `b-dev.md`, cinco quedan como "manual pendiente" y
tres de ellos son automatizables hoy sin decisiones nuevas de infraestructura
más allá de instalar un DOM de pruebas:

| # | Scenario | Estado |
| --- | --- | --- |
| 8 | el ejemplo cambia al cambiar de categoría (sin borrar lo escrito) | solo estático (`defaultValue`/`placeholder`); el `onChange` no se ejercita |
| 36 | estado enviando: tocar dos veces no crea dos registros | solo se lee el código de `useFormStatus`, no el comportamiento |
| 37 | errores anunciados: el foco salta al primer campo con error | el `useEffect` nunca corre en la suite |
| 2 | mobile-first a 390px | inspección de clases |
| 39 | envío sin JS | verificado a mano con `curl`, no reproducible en CI |

No lo cuento como bloqueante (el dev lo declaró y lo justificó, y 2/39 sí
necesitan navegador), pero 8, 36 y 37 son los tres scenarios donde el único JS
de cliente del sitio hace algo: quedan sin red de seguridad. Recomiendo ticket
de infraestructura de pruebas (jsdom en Vitest) antes de E3, que traerá más
formularios.

## Notas menores (no bloquean, para el PR)

- `src/lib/whatsapp.ts:27`: `replace(/\D/g,"")` descarta cualquier cosa que no
  sea dígito ASCII, no solo los separadores que enumera la spec. No hay riesgo
  (lo guardado son siempre 10 dígitos y los dígitos no-ASCII, RTL y zero-width
  se rechazan o se limpian sin abrir un duplicado — lo probé), pero
  `"<script>7719992022</script>"` se acepta en silencio como número válido.
- `src/lib/registro/validacion.ts:51,81`: el campo trampa se recorta antes de
  compararlo, así que un bot que rellena todo con espacios no la dispara.
- Las cotas de longitud cuentan unidades UTF-16: 120 emojis (240 unidades) se
  rechazan con "Deja esto en 200 caracteres o menos" y el usuario no entiende
  por qué.
- `src/lib/registro/ejemplos.ts:31-34`: `Record[clave] ?? default` responde a
  claves heredadas de `Object.prototype` (`ejemploQueOfreces("constructor")` no
  devuelve un string). Hoy las claves vienen del catálogo de la base, así que no
  es explotable; `Object.hasOwn` lo cierra.
- `tests/layout.test.ts:174-190`: el test de `"use client"` pasó de barrer todo
  `src/` a una lista fija de 6 archivos. La acotación es correcta (el
  requirement es del layout), pero un archivo nuevo de `layout-base` no entraría
  solo a la lista.
- El cupo se gasta antes de comprobar el duplicado (`procesar.ts:157` vs
  `:161`): un vecino que se registra dos veces por error gasta 2 de 3 intentos.

## Tests adversariales añadidos

`tests/registro-adversarial.test.ts` — **41 tests, todos en verde**. Datos 100 %
ficticios: números del rango inventado `771999xxxx`, nombres y colonias
inventados, IPs de los rangos reservados para documentación (RFC 5737). Los que
describen un comportamiento que hoy es hallazgo van marcados `CARACTERIZACIÓN:`
(misma convención que `tests/adversarial.test.ts` de T-001) y deben
actualizarse cuando el dev corrija.

| Frente | Qué cubre |
| --- | --- |
| XSS almacenado y reflejado | texto hostil (`<script>`, `onerror`, `svg/onload`, `'; DROP TABLE`) en nombre, ¿qué ofreces?, dirección, horario y colonia "Otra": se persiste sin mutar y sin ejecutar SQL, y el eco del formulario lo devuelve escapado |
| Unicode del WhatsApp | dígitos árabe-índicos, de ancho completo y devanagari rechazados; zero-width y marcas RTL no abren un duplicado; longitudes fuera de 10/12/13 rechazadas |
| Payloads gigantes | 100 KB en WhatsApp (MEDIO 3); cotas en unidades UTF-16; el límite exacto de 80 no se trunca |
| Inyección por URL | 9 payloads rechazados (`javascript:` en 4 formas, `data:`, `vbscript:`, `file:`, `//host`, sin esquema) + 4 URLs http(s) hostiles que sí se aceptan (MEDIO 4) |
| Anti-abuso | suplantación de `x-forwarded-for` (ALTO 1), crecimiento del mapa (MEDIO 1), trampa con espacios, y que la trampa no gasta cupo ni escribe datos en el log |
| Consentimiento y ciclo de vida | consentimiento vacío/`false`/`no` (MEDIO 2); `fotoUrl`, `latitud`, `longitud`, `registradoEn`, `giros` y `estado` del cliente ignorados |
| Transiciones ilegales | una ficha en `rechazado` o en `publicado` no se puede re-registrar ni se altera desde el formulario público (el scenario de duplicado dice "en cualquier estado"; el dev solo probó `en_revision`) |
| Carrera real | dos envíos simultáneos del mismo número (uno con `+52` y espacios) contra la constraint real: queda una sola ficha y el segundo ve el mensaje de duplicado, no un error técnico |
| Errores sin fuga | falla al leer los catálogos: mensaje genérico y log sin `SQLITE_CANTOPEN`, sin rutas internas y sin datos capturados |
| Normalización de listas cerradas | `"OTRA"`/`"Otra"` no valen como centinela, `" otra "` sí; ids con ceros a la izquierda |

## Comandos de cierre

- `npm test` → **11 archivos, 218 tests, todos en verde** (177 del dev + 41
  míos).
- `npm run lint` → limpio.
- `npm run build` → compila; `/registro` dinámica, `/registro/gracias` estática.

No toqué git ni `src/`: el único archivo que escribí es
`tests/registro-adversarial.test.ts` (más este reporte).

---

# Iteración 2 — re-auditoría

Re-verificado **contra el código, no contra `b-dev.md`**: leí los cinco
módulos tocados enteros, ejercité cada corrección con tests propios nuevos y
revisé uno por uno los seis tests míos que el dev modificó.

## Veredicto: LIMPIO — pasa al validador

**0 críticos · 0 altos · 0 medios abiertos.** Los 7 hallazgos están corregidos
de verdad; quedan 2 riesgos residuales con dueño fuera de este change (E0-3) y
4 notas menores, ninguno bloqueante.

## Verificación de cada corrección

| # | Corrección | Verificado en | Veredicto |
| --- | --- | --- | --- |
| ALTO 1 | La IP solo se lee del encabezado declarado en `REGISTRO_ENCABEZADO_IP`, del **último** salto y validada como IP; sin variable, `null` + aviso una vez por proceso | `limite-ip.ts:164-184` (`ipDeEncabezados`), `:99-140` (`esIpv4`/`esIpv6`/`claveDeIp`) | **Cerrado.** Probé que ningún otro encabezado se mira, que el nombre se compara sin distinguir mayúsculas, que `"unknown"`, 5000 caracteres, `999.999.999.999` y `"203.0.113.9); DROP TABLE"` dan `null`, y que anteponer IPs falsas ya no escapa del cupo (los 4 envíos caen en la misma clave: `tamanoLimitePorIp() === 1`). La decisión fail-safe es la correcta: mejor sin cupo y avisando que con una clave que elige el atacante |
| MEDIO 1 | `podar()` en cada alta (tira lo caducado del mapa entero) + techo `MAX_IPS_RASTREADAS = 5000` con desalojo por uso más antiguo | `limite-ip.ts:28,45-58,67-74` | **Cerrado.** Con la clave ya acotada a forma de IP (≤45 caracteres) el tamaño de cada entrada también está acotado. El test comprueba 10 IPs → 1 tras la ventana |
| MEDIO 2 | `casilla` exige valor afirmativo (`on/true/1/si/sí`) | `validacion.ts:59,68-74` | **Cerrado.** `""`, `false`, `no`, `off`, `0` no consienten y no crean ficha; `on` (lo que manda el navegador) sí. Verifiqué además que aplica igual a `entregaADomicilio` sin romper el camino normal |
| MEDIO 3 | Cota para `whatsapp`(30), `categoriaId`(10) y `coloniaId`(10) + `recortarParaEco` | `textos.ts:23-33`, `validacion.ts:185-207,264-284`, `procesar.ts:127` | **Cerrado.** 100 KB en los tres campos a la vez vuelven truncados a su cota con el literal de error que la spec exige para ese campo (no se inventó texto nuevo). Probé también 50 000 emojis: el eco truncado sigue siendo serializable y no pierde el mensaje |
| MEDIO 4 | `urlHttpNormalizada` persiste `url.href` y rechaza userinfo | `validacion.ts:129-138,224-230,248-249` | **Cerrado.** `https://facebook.com@evil.example/perfil` se rechaza; el homógrafo cirílico se guarda como `https://xn--facebok-ejg.com/...`, o sea que el engaño queda visible. Comprobé sobre lo persistido que ninguna URL guardada conserva `@`, espacios ni otro esquema |
| MEDIO 5 | `.env.example` documenta `REGISTRO_ENCABEZADO_IP` y `REGISTRO_UMBRAL_ALTAS_DIARIAS` | `.env.example` | **Cerrado.** Ambas comentadas, con el aviso en mayúsculas de que sin la primera no hay cupo y con ejemplos por hosting. Ninguna lleva secretos |
| MEDIO 6 | Scenarios 8, 36 y 37 automatizados extrayendo funciones puras | `ejemplos.ts:47-58` (`ejemploParaCategoriaElegida`), `formulario-registro.tsx:57` (`primerCampoConError`), tests en `registro-validacion.test.ts:502`, `registro-pagina.test.ts:236-255`, `registro-accion.test.ts:330` | **Cerrado en lo automatizable.** Los tres tests existen y afirman lo que dicen (incluido que `general` no roba el foco y que dos envíos idénticos dejan un solo registro, que es una garantía *más fuerte* que el botón deshabilitado). Lo que queda (`.focus()` efectivo, doble toque real, 390/768/1280 px, envío sin JS) necesita navegador y ya está declarado como ticket de jsdom antes de E3 |

## Los 6 tests míos que el dev modificó: ¿se diluyó la intención?

**No.** Revisé los seis uno por uno: conservan datos, payloads y aserciones de
fondo; cambia lo esperado, que es exactamente lo que pedía la cabecera del
archivo para los marcados `CARACTERIZACIÓN:`. Tres de ellos quedaron **más
fuertes** que los míos: el del eco ahora manda los 100 KB en los tres campos y
comprueba las tres cotas; el de la URL se partió en un rechazo (credenciales) +
tres guardados normalizados con el punycode esperado; el del consentimiento
sumó `off` y `0` y un caso positivo (`on` sí consiente) que yo no tenía.

Dos merecen matiz, y por eso añadí tests propios que los cubren desde otro
ángulo en vez de discutir el rename:

- `rotar x-forwarded-for anula el cupo…` → `rotar la IP de origen sigue
  abriendo el oráculo…`: el test pasa `ip` directamente, así que ya no prueba
  nada sobre el encabezado. La afirmación que quedó (quien tiene muchas IPs
  reales barre el oráculo) es cierta y vale documentarla, pero la parte
  adversarial —que el encabezado no sea falsificable— vive ahora en el test
  nuevo del dev y en los **6 tests míos de la sección 11**, que atacan
  `ipDeEncabezados` con entradas hostiles en vez de confiar en el camino feliz.
- `el mapa de IPs crece sin cota…` → `el cupo de cada IP se respeta y las
  entradas caducadas se purgan solas`: correcto y verifica el techo con
  `tamanoLimitePorIp()`, un export nuevo solo para pruebas (acepto el
  compromiso: es la única forma de observar el mapa sin exponerlo).

## Los 3 hallazgos que el dev argumentó como no-cambio

Los tres argumentos me convencen; los cierro como decisiones documentadas:

1. **Campo trampa recortado antes de comparar.** Disparar la trampa con
   espacios significaría descartar en silencio el alta de un vecino real si un
   autocompletado mete un espacio en un campo que la persona no ve — un falso
   positivo invisible en el flujo P0, contra un falso negativo que el admin
   filtra en la revisión manual que el PRD §6.3 ya exige. La asimetría de daño
   le da la razón, y no hay una tercera opción sin fricción.
2. **`replace(/\D/g,"")` acepta letras alrededor de los 10 dígitos.** Lo
   persistido son siempre los 10 dígitos, así que no hay superficie; endurecerlo
   contradiría el texto de la spec y rompería `"771 999 2022 (casa)"`. Bien
   llevarlo al PR como propuesta en vez de cambiarlo en silencio.
3. **El cupo se gasta antes de comprobar el duplicado.** Tiene razón y yo me
   quedé corto: si el duplicado no gastara cupo, el barrido del oráculo volvería
   a ser gratis, que es justo lo que `design.md §5` acota. El costo (dos de tres
   intentos si te registras dos veces por error) es el precio correcto.

## Riesgos residuales (no bloquean; dueño fuera de este change)

- **R1 — Sin `REGISTRO_ENCABEZADO_IP` no hay cupo por IP.** Es el estado por
  defecto y hoy no hay hosting, así que el scenario "límite por IP" queda inerte
  en un despliegue real hasta que alguien configure la variable. La decisión es
  la correcta dentro del alcance (la alternativa era una clave falsificable), y
  el código avisa en el log. **Condición de cierre: entra al checklist de E0-3 y
  se menciona en el PR** — si se despliega sin esa variable, el formulario
  público queda con el honeypot como única defensa.
- **R2 — Con más de un salto de confianza, todos comparten clave.** Si el
  hosting encadena CDN → balanceador → app, el último valor de la lista es la IP
  interna, igual para todo el mundo: el cupo dejaría de ser por visitante y
  podría cerrar el registro a todos tras 3 altas por hora. También es
  verificación de E0-3; lo dejé documentado con un test
  ("RIESGO RESIDUAL: con dos saltos de confianza…").

## Notas menores nuevas (informativas)

- `limite-ip.ts:112-118`: `esIpv6` es una comprobación de forma laxa (`"::"` o
  `"1:2"` pasan). Irrelevante: solo se llega ahí desde el encabezado de
  confianza y la clave está acotada a 45 caracteres.
- `limite-ip.ts:53-57`: con 5000 IPs reales simultáneas el desalojo por
  antigüedad podría reiniciar el cupo de alguien; imposible al volumen del MVP.
- `validacion.ts:264-276`: el eco trunca por unidades UTF-16 y puede partir un
  par subrogado; probado que no rompe la serialización ni el render.
- `limite-ip.ts:82,187`: `tamanoLimitePorIp` y `reiniciarAvisoDeEncabezado` son
  exports solo para pruebas en código de producción. Aceptable y anotado.

## Tests adversariales al cierre de la iteración 2

`tests/registro-adversarial.test.ts`: **53 tests, todos en verde** (42 tras la
iteración 1 + 11 nuevos míos). Los 11 nuevos, todos atacando las correcciones:

| Test | Qué ataca |
| --- | --- |
| el encabezado configurado es el único que se lee | que no quede una puerta trasera por `x-real-ip`/`x-forwarded-for` cuando se configuró otro |
| 5 casos de entrada hostil en el encabezado | `unknown`, 5000 caracteres, octetos inválidos, intento de inyección, coma final |
| con el encabezado configurado, quien antepone IPs falsas no escapa del cupo | el ALTO 1 de punta a punta: 4 envíos, el cuarto bloqueado, una sola clave en el mapa |
| RIESGO RESIDUAL: dos saltos de confianza | R2, documentado |
| el eco truncado no revienta con pares subrogados | robustez de `recortarParaEco` con 50 000 emojis |
| el checkbox de entregas también exige valor afirmativo | que MEDIO 2 no se quedara solo en el consentimiento |
| la normalización de la URL no reintroduce esquemas ni credenciales | MEDIO 4 comprobado sobre lo persistido, con 3 entradas |

## Comandos de cierre (iteración 2)

- `npm test` → **11 archivos, 264 tests, todos en verde**.
- `npm run lint` → limpio.
- `npm run build` → compila; `/registro` dinámica, `/registro/gracias` estática.

Sigo sin tocar git ni `src/`: en esta iteración solo amplié
`tests/registro-adversarial.test.ts` y este reporte.
