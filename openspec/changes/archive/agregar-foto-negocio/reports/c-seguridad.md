# Reporte Seguridad y Test · agregar-foto-negocio

Auditoría del diff completo (`git status` + `git diff` + los archivos nuevos de
`src/lib/fotos/`, `src/app/api/foto/`, `src/app/admin/foto/` y
`prisma/barrer-fotos-huerfanas.ts`) contra la spec y los reportes `a-ui.md` y
`b-dev.md`.

**Gates al cierre (iteración 3):** `npm run lint` limpio · `npm run build` OK
(Next 16.3.3, TypeScript incluido) · `npm test` **1156/1156** (1062 del dev +
94 míos).

**Veredicto: LIMPIO. Pasa al validador.** Conteo vigente: **0 críticos ·
0 altos · 0 medios · 3 bajos**. Los tres bajos son observaciones aceptadas y
documentadas, ninguna accionable dentro del alcance de este change.

---

## 0.bis · Estado tras la iteración 3

Re-verifiqué las tres correcciones contra el código real, reproduciendo las
mediciones yo.

| Hallazgo iter. 2 | Estado | Verificación |
| --- | --- | --- |
| **M-5** el turno retenía 1.8 s (bloqueo sostenible a 1 req/s) | **CERRADO** | El turno baja a **13 ms**; a 1.1 req/s hostiles el legítimo pasa **6/6** |
| **M-6** el barrido borraba todo con la base equivocada | **CERRADO** | La guarda de proporción/volumen se planta y explica por qué |
| **B-6** el barrido moría con `EISDIR` | **CERRADO** | Los no-archivos se ignoran con aviso; `try/catch` por clave con conteo |

### M-5: el turno ya solo cubre abrir la imagen

Reparto del trabajo con la peor foto <5 MB (JPEG de ruido a 1200×1200, 1.47 MB),
medido sobre el código nuevo:

| Fase | Iteración 2 | Iteración 3 |
| --- | --- | --- |
| Turno retenido | **1 789 ms** | **13 ms (0.8 %)** |
| Trabajo total | 1 671 ms | 1 671 ms |

Es una mejora de ~137×, y coincide con lo que reportó el dev. El mapa reducido
que queda fuera del turno pesa 4.1 MB.

**Ataque sostenido reproducido:** manteniendo envíos hostiles a ~1.1 req/s —el
ritmo con el que en la iteración 2 se bloqueaba el campo de foto para todos—,
los envíos legítimos pasan **6/6, cero rechazos**. Subiendo el ataque a ~40
req/s empiezan los rechazos (2/6), que es exactamente lo que el techo debe
hacer: proteger la memoria antes que el confort.

### El residual declarado (compresión sin cota de concurrencia): **no es hallazgo**

El dev pidió que lo evaluara. Lo medí en vez de opinar. Con una ráfaga
sostenida de ~200 peticiones/segundo de la foto hostil durante 6 segundos
(1 190 lanzadas):

| t | RSS | Delta | Dentro del turno |
| --- | --- | --- | --- |
| 1 s | 338 MB | +42 MB | 2 |
| 3 s | 375 MB | +79 MB | 2 |
| 5 s | 387 MB | **+91 MB** | 2 |
| 6 s | 387 MB | **+91 MB** | 2 |

**La memoria hace meseta y se queda plana.** No crece sin cota, porque el
sistema se autorregula: las compresiones saturan la CPU, eso frena el ritmo al
que el semáforo deja entrar trabajo nuevo, y el conjunto se estabiliza. Al
drenar, los turnos vuelven a 0.

Además, el coste para el atacante está acoplado por la física del problema:
para que una compresión tarde, la imagen tiene que llevar entropía alta a
1200×1200, y eso pesa. Lo más barato que encontré:

| Payload | Trabajo de compresión | Subida necesaria por segundo de trabajo |
| --- | --- | --- |
| JPEG ruido 1200×1200 q40 — 535 KB | 1 636 ms | **0.32 MB/s** |
| WebP ruido 1200×1200 q40 — 770 KB | 1 671 ms | 0.45 MB/s |
| PNG plano 39.4 MP — 519 KB | 86 ms | 5.90 MB/s |

Sostener ~100 compresiones en vuelo exige ~33 MB/s (≈265 Mbps) de subida
continua; a ese caudal el problema ya no es `sharp`, es un flood HTTP genérico
que se ataja en infraestructura, no en el código de la aplicación. Y acotar
también la compresión reintroduciría justo el bloqueo de M-5. **Coincido con
el dev: aceptable, no accionable.**

### M-6 y B-6: guardas del barrido

Verifiqué los bordes exactos, que es donde una guarda demasiado celosa haría
daño silencioso (si el barrido no corriera nunca, M-3 volvería por la puerta de
atrás):

- Limpieza legítima (8 huérfanas entre 200 vivas): **corre sola**, borra 8.
- Por debajo de la muestra mínima (4 huérfanas al 100 %): **no sospecha**.
- Justo en la muestra mínima y >50 %: **se planta**, y el mensaje nombra
  `DATABASE_URL` y `--forzar`.
- Justo en el 50 %: **barre** (la condición es `>`, no `>=`).
- 50 huérfanas con proporción baja: **pasan**; 51: **se plantan** por volumen,
  aunque sean el 9 % del almacén.
- `--dry-run` **nunca** se bloquea, ni cuando la guarda pararía el borrado: es
  la herramienta de diagnóstico y tiene que funcionar justo en ese caso.
- `--forzar` borra lo que la guarda había parado.
- Mi repro de M-6 (base poblada pero equivocada, 10 claves, ninguna coincide):
  antes borraba **10 de 10**; ahora `barrido=false`, **0 borradas**.

**Mutaciones para confirmar que los tests muerden** (revertidas y comprobadas
con `diff`):

| Mutación | Tests que fallan |
| --- | --- |
| La escalera de calidad vuelve **dentro** del turno | **1** (la estructural de M-5) |
| Se desactiva la guarda de proporción/volumen del barrido | **4** |

Nota metodológica: mi primer intento de mutación de M-5 *duplicaba* la
compresión en vez de moverla, y por eso no fallaba ningún test — el código
mutado seguía comprimiendo fuera del turno. Con la mutación fiel (la escalera
dentro y el resultado devuelto desde el turno) el test estructural sí la caza.
Lo dejo escrito porque una mutación mal construida da falsa confianza en la
dirección contraria a la habitual.

---

## 0. Estado tras la iteración 2

Re-verifiqué las cinco correcciones contra el código real, reproduciendo yo las
mediciones en vez de creerme las del dev.

| Hallazgo iter. 1 | Estado | Cómo lo verifiqué |
| --- | --- | --- |
| **A-1** DoS por procesamiento sin cota (ALTO) | **CERRADO** | Reproduje el ataque: la memoria ya no escala con la concurrencia |
| **M-1** scenarios sin test | **CERRADO** | `registro-pagina.test.ts` ahora sí cubre la foto; mapa corregido fila por fila |
| **M-2** `encType` muerto | **CERRADO** | El atributo ya no está y el comentario explica quién pone el multipart de verdad |
| **M-3** huérfanas irrecuperables | **CERRADO con reserva** | Existe el barrido; le encontré dos defectos propios (M-6, B-6) |
| **M-4** `bodySizeLimit` global | **ACEPTADO** | Documentado con razonamiento; no había config por segmento |
| **B-2** logs inflables | **CERRADO** | Aviso de saturación acotado a 1/min, verificado en el código |

### A-1: reproducción independiente del ataque

Mismo ataque de la iteración 1 (PNG plano de 7300×5400 = 39.4 MP, **123 KB**),
ahora contra el código con semáforo, midiendo el RSS del proceso:

| Concurrencia | Delta RSS **antes** (iter. 1) | Delta RSS **ahora** | Máx. simultáneas dentro | Rechazadas por ocupado |
| --- | --- | --- | --- | --- |
| 12 | **429 MB** (pico) | **66 MB** | 2 | 10 |
| 24 | — | **31 MB** | 2 | 22 |
| 50 | — | **0 MB** | 2 | 48 |

La propiedad que importa no es el número: es que **la memoria dejó de crecer
con N**. A 50 concurrentes el delta es 0 porque solo hay dos imágenes abiertas,
exactamente como a 2. El techo funciona.

**Lo que verifiqué del semáforo, punto por punto:**

- **No encola.** Con los dos turnos ocupados, el tercero responde en **0 ms**,
  antes de que se liberen los turnos. Medido con turnos retenidos a mano.
- **No hay fuga de permisos.** Probé todas las salidas malas que se me
  ocurrieron —`throw` asíncrono, `throw` síncrono antes de devolver promesa,
  promesa rechazada, imagen ilegible, JPEG truncado que truena al comprimir— y
  en las cinco el contador vuelve a 0. Además, **cien fallos encadenados** de
  los tres tipos dejan el cupo intacto y una foto buena sigue entrando. Esto
  era lo crítico: un permiso perdido es un DoS permanente y silencioso.
  La comprobación y el incremento son síncronos (`semaforo.ts:48-50`, sin
  `await` entre medias), así que tampoco hay carrera al repartir turnos.
- **El rechazo por tamaño no gasta turno.** 30 archivos de 6 MB en vuelo dejan
  el cupo en 0: no se puede vaciar el cupo sin hacer trabajo real.
- **El directorio no se cae.** Un envío sin foto pasa aunque el cupo esté lleno.

**Mutaciones para confirmar que mis tests muerden** (ambas revertidas y
comprobadas con `diff`):

| Mutación en `semaforo.ts` | Tests que fallan |
| --- | --- |
| Liberar el turno solo en el camino feliz (fuga al fallar) | **12** |
| Esperar turno en vez de rechazar (encolar) | **12** |

### La decodificación única no degradó nada

Comparé el pipeline nuevo contra el viejo sobre las mismas entradas difíciles:

| Entrada (<5 MB) | Tarjeta antes → ahora | Ficha antes → ahora | Tiempo |
| --- | --- | --- | --- |
| ruido 4032×3024 q62 | 12 → 13 KB | 240 → 240 KB | 559 → **396 ms** |
| ruido 1600×1200 q92 | 40 → 40 KB | 236 → 235 KB | 1039 → **902 ms** |
| ruido 2400×2400 q70 | 45 → 45 KB | 247 → 246 KB | 1736 → **1266 ms** |
| bomba plana 39.4 MP | 0 → 0 KB | 2 → 2 KB | 118 → **89 ms** |

Pesos idénticos (±1 KB), todos dentro de presupuesto, y más rápido en todos los
casos. Además probé que el mapa de píxeles en crudo no rompe formatos raros —
**PNG de 16 bits**, con paleta, en escala de grises, con alfa, WebP con alfa,
**JPEG CMYK**, progresivo y una imagen de 1×1—: en todos el buffer `raw`
cuadra en tamaño y sale un WebP válido. Era el riesgo real del refactor (releer
un buffer crudo declarando ancho/alto/canales revienta si la profundidad no es
de 8 bits) y `sharp` normaliza a 8 bits en el `resize`. Y la **rotación EXIF se
aplica en las dos variantes**, no solo en la de ficha.

---

## 1. Hallazgos por severidad

> Los de la iteración 1 que quedaron cerrados se conservan más abajo, en el
> §1.bis, como registro de lo que se auditó y por qué.

### ✅ MEDIOS de la iteración 2 — todos cerrados en la iteración 3

#### ✅ M-5 (CERRADO) · El techo convertía el DoS de servidor en un bloqueo sostenido del campo de foto

- **Dónde:** `src/lib/fotos/semaforo.ts:31` (`MAXIMO_FOTOS_EN_PROCESO = 2`) ·
  `src/lib/fotos/procesar.ts:228-247` (la escalera de calidad corre **dentro**
  del turno) · `procesar.ts:56` (`CALIDADES`, 6 pasos × 3 reintentos).

- **Escenario de explotación:** un JPEG de **1.47 MB** con ruido a 1200×1200
  (incompresible a propósito) obliga a recorrer casi entera la escalera de
  calidad y **retiene un turno 1 789 ms**. Con solo dos turnos, un atacante que
  sostenga **~1.1 peticiones por segundo** (≈1.6 MB/s de subida, una sola
  máquina doméstica) mantiene los dos turnos ocupados de forma indefinida.
  Resultado: **todo vecino que intente subir una foto recibe "Estamos
  recibiendo muchas fotos, intenta de nuevo en un momento", siempre.**

- **Medición del reparto del tiempo dentro del turno** (peor caso <5 MB):

  | Fase | Tiempo | Memoria que toca |
  | --- | --- | --- |
  | Decodificar el original | **12 ms** | hasta 40 MP |
  | Escalera de calidad | **1 634 ms (99 %)** | un mapa crudo de **4.1 MB** |

  Es decir: **el 99 % de la ocupación del turno la produce la parte que no
  necesita protección de memoria.** La escalera trabaja sobre el buffer ya
  reducido; meterla dentro del semáforo multiplica por ~137 el tiempo que un
  turno queda tomado sin ganar ni un byte de seguridad.

- **Por qué es medio y no alto:** el impacto está acotado y es exactamente el
  que la enmienda eligió: el servidor no se cae, el directorio sigue
  funcionando y el registro **sin** foto pasa aunque el cupo esté lleno (lo
  probé). Se pierde una función opcional, no el sitio.

- **Por qué lo reporto igual:** la enmienda de la spec justifica el rechazo con
  "intenta de nuevo en un momento" y "preferimos pedirle a una persona que
  reintente en un minuto", lo que describe un pico de tráfico transitorio. Un
  bloqueo sostenible a 1 req/s por un atacante no es eso, y conviene que quien
  aprobó la enmienda sepa que ese es el costo real antes de firmarlo.

- **Salida más limpia, y es barata:** dejar dentro del turno solo
  `decodificarUnaVez()` —lo único que abre el original— y sacar
  `generarVariante()` fuera. El turno pasaría de ~1.8 s a ~12 ms sin tocar la
  protección de memoria. Alternativa: recortar `CALIDADES`, porque con fotos
  reales nunca se baja de los primeros peldaños. **No lo implemento**: cambia
  el requirement recién enmendado y eso lo decide quien lleva la spec.

#### ✅ M-6 (CERRADO) · El barrido borraba TODAS las fotos si se le apuntaba a una base equivocada pero poblada

- **Dónde:** `src/lib/fotos/huerfanas.ts:150-165` (la salvaguarda "base
  plausible") · `prisma/barrer-fotos-huerfanas.ts:34` (`DATABASE_URL` con
  default silencioso a `file:./prisma/dev.db`).

- **Escenario:** el operador corre `npm run fotos:barrer-huerfanos` con el
  `DATABASE_URL` equivocado —la base de staging, `test.db` en vez de `dev.db`,
  o el `.env` de otro entorno—. Esa base **sí tiene negocios**, así que
  `negocios === 0` es falso y la salvaguarda no salta; ninguna de sus
  `fotoClave` coincide con las claves del almacén, así que **todas** se
  clasifican como huérfanas y se borran.

- **Reproducido:** con una base que reporta 120 negocios y ninguna clave
  coincidente, el barrido devolvió `barrido=true, revisadas=5, borradas=5` y
  dejó **0 de 10 archivos**. Borrado duro, sin confirmación y sin vuelta atrás:
  las fotos de todos los negocios publicados.

- **La salvaguarda que existe cubre el caso menos probable.** Una base
  completamente vacía es un error evidente que se nota enseguida; apuntar a
  otra base poblada es el error de operación común y es el que destruye datos.
  El `--dry-run` está documentado como recomendación, no como salvaguarda.

- **Salida:** una guarda de proporción ("si más del N % de las claves parece
  huérfano, no borres nada y avisa") cubre los dos casos con una condición y
  convierte el error de operación en un mensaje. Lo señalo, no lo implemento.

#### 🟡 M-4 → BAJO · `bodySizeLimit: "6mb"` es global y también afecta a las Server Actions del panel

(Sin cambios respecto de la iteración 1; el dev confirmó en la doc de Next que
no hay configuración por segmento y descartó con razonamiento mudar el registro
a un route handler, porque rompería el envío sin JavaScript. Riesgo documentado
en `design.md`. **Aceptado**, se mantiene listado por trazabilidad.)

- **Dónde:** `next.config.ts:14-19`.
- Las acciones del panel pasan de 1 MB a 6 MB de cuerpo, y
  `requerirSesionAdmin()` corre **después** de que Next materialice el cuerpo:
  un anónimo puede hacer que el servidor bufferice 6 MB por petición contra
  endpoints de admin. No es un bypass de autorización; es superficie de abuso.

---

### 🟡 BAJOS (vigentes, ninguno bloquea)

#### ✅ B-6 (CERRADO) · El barrido se caía con `EISDIR` si el almacén tenía un directorio con nombre de foto

- **Dónde:** `src/lib/fotos/almacen.ts:127` (`rm(ruta, { force: true })`, sin
  `recursive`) llamado desde `huerfanas.ts:173`.
- **Reproducido:** con un subdirectorio llamado `<clave>.tarjeta.webp` y edad
  suficiente, el barrido lanza `Path is a directory: rm returned EISDIR` y
  aborta a media pasada. El script lo reporta y sale con código 1.
- No es explotable (nadie externo escribe en `FOTOS_DIR`), pero un artefacto de
  `rsync`, una restauración a medias o una migración torcida dejan el barrido
  inservible **de forma permanente**, y con él vuelve M-3: las huérfanas dejan
  de limpiarse y nadie se entera salvo que mire el cron. Un `catch` por clave
  que cuente el fallo y siga bastaría.

#### B-1 · Las respuestas de imagen no llevan `Content-Disposition`

`src/lib/fotos/servir.ts`. Con `Content-Type: image/webp` fijo por el servidor
y `X-Content-Type-Options: nosniff` no hay forma de que el navegador interprete
la respuesta como documento — lo verifiqué guardando HTML en el almacén y
pidiéndolo por la ruta pública. Defensa en profundidad, no corrección.

#### B-2 · Líneas de log que el atacante dispara a voluntad

**Mitigado parcialmente en la iteración 2**: el aviso de saturación está
acotado a uno por minuto (`procesar.ts:193-210`), que era el que un atacante
podía disparar en masa. Siguen sin acotar el `console.warn` por imagen corrupta
(`procesar.ts:242`) y los `console.error` de `servir.ts`. **Verificado que
ninguno filtra datos**: solo `error.name` o `error.code`, nunca la clave, el
número ni el nombre del archivo.

#### B-3 · `borrarNegocioDefinitivamente()` no está cableada a ninguna ruta ni acción

`src/lib/negocio.ts`. La capacidad ARCO existe como función de librería y solo
la llaman los tests. El dev lo coordinó con T-015. Observación, no bloqueo.

---

## 1.bis · Hallazgos de la iteración 1 ya cerrados

Se conservan porque documentan qué se auditó y por qué el código quedó como
quedó. **Ninguno está vigente.**

### ✅ A-1 (era ALTO) · Procesamiento de imagen sin cota: un anónimo tumba el servidor con peticiones de 123 KB

- **Dónde:** `src/lib/registro/procesar.ts:246-274` (paso 4.5) ·
  `src/lib/fotos/procesar.ts:147-172` y `:111-136` ·
  `src/lib/fotos/limites.ts:16` (`MEGAPIXELES_MAXIMOS = 40`) ·
  `src/lib/registro/limite-ip.ts:88-91` y `:219-226` · `next.config.ts:18`.

- **Escenario de explotación:** el atacante genera un PNG **plano** de
  7300×5400 (39.4 MP, justo por debajo del tope de 40 MP). Comprime a **123 KB**
  porque es un rectángulo de un solo color. Lo manda al formulario público de
  `/registro` con el campo trampa vacío y los 5 obligatorios bien llenos. El
  envío pasa las cuatro defensas previas —trampa, cupo por IP, validación,
  duplicado— porque **son todas válidas**, y llega al paso 4.5, donde `sharp`
  decodifica los 39.4 MP enteros (~118 MB de bitmap RGB) **dos veces en
  paralelo** (`Promise.all` de las dos variantes, `procesar.ts:158-161`).
  Repite con números distintos y en paralelo.

- **Medido en este equipo, con el código de producción:**

  | Concurrencia | Payload por petición | Pico de RSS | Tiempo |
  | --- | --- | --- | --- |
  | 1 | 123 KB | ~93 MB delta | 86 ms |
  | 12 | 123 KB (1.4 MB en total) | **429 MB** | 429 ms |

  Son ~35 MB de memoria residente por envío en vuelo. Unas decenas de
  peticiones concurrentes —trivial desde una sola máquina, no hace falta
  botnet— agotan un contenedor de 512 MB o 1 GB. El costo para el atacante es
  ridículo: 1.4 MB de subida total para 429 MB de RAM del servidor.

- **Por qué las defensas existentes no lo cubren:**
  1. El campo trampa se evade dejándolo vacío (es un honeypot, no un captcha).
  2. **El cupo por IP está inactivo en la configuración por defecto.**
     `ipDeEncabezados()` devuelve `null` si `REGISTRO_ENCABEZADO_IP` no está
     puesta (`limite-ip.ts:219-226`), y `bloqueada(null)` devuelve `false`
     (`limite-ip.ts:89`). En `.env.example:41` esa variable está **comentada**.
     El propio archivo ya avisa de esto para el panel (`.env.example:82-87`);
     lo que este change añade es que ahora la superficie sin cupo cuesta
     decenas de MB por petición en vez de un `INSERT`.
  3. Aunque el cupo estuviera activo, son 3 altas por hora **por IP**, y el
     mapa es por proceso y en memoria: no acota la concurrencia instantánea,
     que es la variable que rompe aquí.
  4. `next.config.ts:18` sube `bodySizeLimit` de 1 MB a 6 MB. La propia doc de
     Next dice que ese default de 1 MB existe *"to prevent the consumption of
     excessive server resources… as well as potential DDoS attacks"*
     (`node_modules/next/dist/docs/…/serverActions.md:29`). Es una decisión
     correcta para el mensaje de error de la spec, pero suma en el mismo eje.

- **Lo que la spec sí exige y sí se cumple:** el scenario "el bot no paga
  procesamiento" (trampa llena o IP sin cupo) está implementado y probado. El
  hueco es el envío **legítimo en forma** y hostil en contenido, que la spec no
  contempla.

- **No lo arreglo** (es mi rol, y además la mitigación es una decisión de
  producto/spec). Las salidas naturales, para que las valore quien decida:
  bajar `MEGAPIXELES_MAXIMOS` a algo cercano a lo que un celular real produce
  (12–25 MP cubre de sobra el PRD §6.1); serializar el procesamiento con un
  semáforo de N concurrentes; o hacer que `REGISTRO_ENCABEZADO_IP` sea
  **requisito de arranque** cuando las fotos están activas, en vez de una
  variable comentada. Ligado a E0-3, igual que el resto del despliegue con
  fotos.

- **Atenuante honesto, para que el humano calibre:** `design.md §1` y
  `README.md` ya bloquean el despliegue **con fotos** hasta que E0-3 cierre, así
  que esto no puede llegar a producción hoy. Lo marco alto igualmente porque el
  gate que estoy auditando es el merge a `main`, y porque la mitigación no debe
  quedar como nota al pie de un reporte: o se acota, o se acepta explícitamente
  en la spec junto a E0-3.

- **Test que lo ancla:** `tests/foto-seguridad-adversarial.test.ts` ›
  "un PNG plano de 39.4 MP y ~120 KB se acepta y se procesa entero". Verde: fija
  que hoy **se acepta**. El día que se acote, ese test es el que hay que cambiar.

---

### ✅ M-1 (era MEDIO) · Cuatro scenarios sin test automatizado, declarados como cubiertos en el mapa de `b-dev.md`

`tests/registro-pagina.test.ts` no se había tocado, pero el mapa de
`b-dev.md` lo declaraba como cobertura de tres scenarios y marcaba un cuarto
como "Manual" pese a ser automatizable; su `it.each` de etiquetas literales
seguía enumerando 10 cuando el requirement MODIFICADO exige 11.
**Cerrado en la iteración 2**: el dev añadió la etiqueta 11 y corrigió el mapa
fila por fila. Mi suite `tests/foto-formulario.test.ts` (11 tests) sigue
cubriendo el HTML servido de forma independiente.

### ✅ M-2 (era MEDIO) · `encType="multipart/form-data"` era un no-op que React sobrescribía

react-dom ignora `encType` en un `<form>` cuya `action` es una función y avisa
por consola (`react-dom-server.node.development.js:2327-2332`); el comentario
del componente afirmaba que de ese atributo dependía la subida.
**Cerrado**: el atributo ya no está y el comentario de
`formulario-registro.tsx` explica que quien fija el multipart es React y que
lo que hay que conservar es el `name="foto"` del input.

### ✅ M-3 (era MEDIO) · Fotos huérfanas irrecuperables si el proceso muere entre `guardar` y la escritura

Una foto sin fila es inalcanzable para el borrado ARCO, porque
`borrarNegocioDefinitivamente()` llega a los archivos a través de `fotoClave`.
**Cerrado con reserva**: existe `npm run fotos:barrer-huerfanos` con
`--dry-run`, periodo de gracia y tres salvaguardas. Al auditar el barrido le
encontré dos defectos propios, que son los vigentes **M-6** y **B-6**.

---

## 2. Lo que ataqué y aguantó (para que no se vuelva a auditar a ciegas)

| Frente | Ataque | Resultado |
| --- | --- | --- |
| Formatos | GIF, TIFF y AVIF válidos y decodificables por `sharp` | Rechazados: la lista blanca es por **formato detectado** (`procesar.ts:83`), no por "¿se puede abrir?" |
| Polyglot | JPEG válido + `<script>` pegado detrás | Entra como JPEG, y **ni un byte del HTML sobrevive**: la salida es RIFF/WEBP reconstruido |
| Truncado | JPEG cortado al 40 % (cabecera buena, píxeles rotos) | Literal de la spec, sin 500, sin archivos, **sin detalle técnico** en el mensaje |
| Bomba de píxeles | PNG de 74 B que declara 108 MP | Rechazado por `limitInputPixels` + comprobación manual (ya cubierto por el dev) |
| Bomba de píxeles | PNG **decodificable** de 39.4 MP y 123 KB | **Se acepta y se procesa** → hallazgo A-1 |
| Multipart | `foto` repetido: hostil primero, bueno después | Se rechaza; no "se cae" al segundo |
| Multipart | `foto` como texto plano, como ruta del almacén, como clave con forma válida | Se trata como "sin foto"; nunca como referencia |
| Path traversal | `../`, `..\\`, byte nulo, homoglifo cirílico, ancho completo, `%252e%252e`, `\r\n` (inyección de cabeceras), clave de 20 000 caracteres | 404 idéntico, **sin tocar la base ni el disco** (verificado con espías sobre los dos) |
| Enumeración | 2000 claves seguidas | Únicas, y cada uno de los 128 bits cae entre 0.35 y 0.65 → `randomBytes(16)` de verdad, no un contador |
| 404 indistinguible | El **quinto** caso que faltaba: publicado con los archivos ausentes | Huella byte a byte idéntica a en_revisión / inexistente / clave basura |
| Autorización | Cookie del panel contra la ruta pública; cookie firmada con otro secreto contra la del panel | 404 en ambos; la ruta pública **no tiene lógica de sesión que equivocar** |
| Estado | Despublicar una ficha ya servida | Corta el servicio en la misma clave, en la petición siguiente, sin reiniciar nada |
| Content-Type | Bytes HTML guardados en el almacén | Se sirven como `image/webp` + `nosniff`; ninguna cabecera menciona `text/html` |
| EXIF / GPS | JPEG con GPS, marca, modelo y fecha inventados, **end-to-end** hasta la respuesta HTTP | Las **dos** variantes servidas: sin `MarcaFicticia`, sin `GPSLatitude`, sin `Exif\0\0`, sin chunk `EXIF`. Cabecera RIFF limpia |
| Carrera | Doble alta simultánea con foto, mismo número | 1 ficha, exactamente 2 archivos, 0 huérfanos; el perdedor ve el mensaje de duplicado, no un error técnico |
| Carrera | Doble reenvío simultáneo sobre ficha rechazada | 1 gana, la foto vieja se borra de verdad, del perdedor no queda nada |
| Transición ilegal | Reenvío con `estado=publicado`, `publicadoEn`, `origen=curado` | Queda `en_revision`, `publicadoEn` nulo, `origen=organico` |
| Mass assignment | Reenvío con `fotoClave` de **otro negocio publicado** | Ni roba la ajena ni pisa la propia; la ajena queda intacta |
| Mass assignment | `quitarFoto=on` + `fotoClave` inventada | Queda `null`, no la inventada |
| `FOTOS_DIR` | Inexistente y anidado / sin permiso de escritura / con `..` / vacío / solo espacios | Se crea; sin permisos devuelve el literal de la spec y **no deja ficha a medias** (fail-safe, sin 500); siempre absoluto; ninguna clave escribe fuera |

**Añadido en la iteración 2:**

| Frente | Ataque | Resultado |
| --- | --- | --- |
| Techo de trabajo | 50 envíos simultáneos de la bomba de 39.4 MP | Nunca más de 2 dentro; 48 rechazados al instante; memoria plana |
| Fuga de turnos | `throw` async, `throw` sync, promesa rechazada, imagen ilegible, JPEG truncado, **100 fallos encadenados** | El contador vuelve a 0 siempre; el cupo nunca se merma |
| Encolado encubierto | Tercer envío con los dos turnos retenidos a mano | Responde en **0 ms**, antes de liberarlos: no espera |
| Vaciar el cupo gratis | 30 archivos de 6 MB en vuelo | No gastan turno: el rechazo por tamaño va fuera del semáforo |
| Degradación colateral | Envío **sin** foto con el cupo lleno | Pasa: el registro y el directorio siguen funcionando |
| Regresión del refactor | PNG 16 bits, paleta, grises, alfa, WebP alfa, JPEG CMYK, progresivo, 1×1 | Buffer en crudo consistente; WebP válido en todos |
| Regresión del refactor | Cuatro entradas ruidosas contra los topes de peso | Pesos idénticos al pipeline viejo (±1 KB), todos dentro |
| Rotación | JPEG con orientación EXIF 6 | Se aplica en **las dos** variantes y sin dejar la etiqueta |
| Barrido | Clave con una variante vieja y otra recién escrita | **No se toca**: manda el archivo más reciente |
| Barrido | Archivos ajenos con nombres parecidos | Ni contados como huérfanos ni borrados |
| Barrido | Base vacía con almacén lleno | Se planta y no borra nada |
| Barrido | **Base poblada pero equivocada** | **Borra todo** → hallazgo M-6 |
| Barrido | Subdirectorio con nombre de foto | **Aborta con `EISDIR`** → hallazgo B-6 |
| Retención de turno | JPEG ruidoso de 1.47 MB | Retiene un turno **1 789 ms** → hallazgo M-5 |

**Auditoría estática, toda limpia:** cero `dangerouslySetInnerHTML`; cero SQL
crudo en código de aplicación (solo los tipos generados de Prisma); cero
secretos en el diff; `FOTOS_DIR` documentada en `.env.example:14-30` y en
`README.md`; cero binarios de imagen versionados o por versionar; `.fotos/` y
`.fotos-test/` ignorados; los datos del seed y de todos los tests son ficticios
(dominios `.example`, coordenadas inventadas, IPs de TEST-NET-3).

---

## 3. Tests añadidos

Cuatro archivos, **94 tests, todos verdes**. Ninguno modifica código de
producción.

### `tests/foto-seguridad-adversarial.test.ts` — 40 tests (iteración 1)

Cubre las nueve secciones de la tabla de arriba. Aislado en un directorio
temporal propio (`mkdtemp`), serie de números 7719998xxx, IPs de TEST-NET-3.

| Mutación | Tests que fallan |
| --- | --- |
| `FORMATOS_ACEPTADOS` acepta también `gif`/`tiff`/`heif` (`procesar.ts`) | 4 |
| `servirFoto` deja de validar la forma de la clave (`servir.ts`) | 10 |

### `tests/foto-formulario.test.ts` — 11 tests (iteración 1)

Cierra el hueco de M-1 sobre el HTML realmente servido por `/registro`:
etiqueta literal nº 11, `<label for="foto">`, el campo dentro del único
formulario, `accept` sin `multiple`, la política del PRD §6.1 **antes** del
campo, área tocable de 44px, la casilla "Dejar mi ficha sin foto" siempre
visible y sin marcar, el bloque de la foto **idéntico** con y sin errores (el
anti-oráculo del scenario), el aviso de reponer la foto asociado por
`aria-describedby` y sin `value`, y que el campo no trajo JavaScript de cliente
nuevo (`onChange`, `FileReader`, `canvas`, `useState`…).

### `tests/foto-semaforo-adversarial.test.ts` — 31 tests (iteración 2)

Escrito contra el riesgo que **introduce** la corrección, no contra el que
resuelve. Serie 7719997xxx.

- **Fuga de turnos (8 tests).** `throw` asíncrono, `throw` síncrono antes de
  devolver promesa, promesa rechazada, imagen ilegible, byte suelto, archivo
  vacío, JPEG truncado, y **cien fallos encadenados** de los tres tipos: el
  cupo tiene que quedar intacto y una foto buena seguir entrando.
- **No encola (2).** El tercero responde antes de que se liberen los turnos; y
  con 50 envíos simultáneos de la bomba de píxeles nunca hay más de 2 dentro.
- **Contabilidad del turno (1).** 30 archivos de 6 MB en vuelo no gastan cupo:
  lo que no abre la imagen no debe consumir turno.
- **Lo que no se debe romper (2).** El envío que no cupo conserva lo capturado,
  no crea ficha, no deja archivos y su mensaje no delata carga real; y un envío
  **sin** foto pasa aunque el cupo esté lleno.
- **Regresión de la decodificación única (13).** Cuatro entradas ruidosas
  contra los dos topes de peso; ocho formatos que el buffer en crudo podría
  romper (PNG de 16 bits, paleta, grises, alfa, WebP con alfa, JPEG CMYK,
  progresivo, 1×1); y la rotación EXIF aplicada en **las dos** variantes.
- **Barrido de huérfanas (5).** La carrera de verdad —una clave con una
  variante vieja y otra recién escrita **no** se toca—, una clave con ficha a
  la que le falta una variante en disco, `--dry-run` sin tocar el disco, los
  archivos ajenos ni contados ni borrados, y la salvaguarda de base vacía.

| Mutación en `semaforo.ts` | Tests que fallan |
| --- | --- |
| Liberar el turno solo en el camino feliz (fuga al fallar) | **12** |
| Esperar turno en vez de rechazar (encolar) | **12** |

### `tests/foto-turno-adversarial.test.ts` — 12 tests (iteración 3)

Escrito contra lo que se rompería si alguien deshiciera las dos últimas
correcciones.

- **El turno cubre abrir, no comprimir (2).** La comprobación es
  **estructural**, con el contador de turnos y no con relojes ni `sleep`: se
  lanza una foto cara de comprimir, se espera a que el cupo quede libre y se
  verifica que el trabajo **sigue en vuelo**. Con la escalera dentro del turno
  eso es imposible. La segunda prueba encadena cuatro compresiones hostiles y
  comprueba que el cupo de entrada sigue entero y el vecino pasa.
- **Bordes exactos de las guardas del barrido (10).** Limpieza legítima que
  debe correr sola; por debajo de la muestra mínima; justo en la muestra
  mínima; justo en el 50 % (barre) y por encima (se planta); justo en el tope
  de volumen (pasa) y uno más (se planta) aun con proporción mínima;
  `--dry-run` nunca bloqueado; `--forzar`; y el escenario de M-6.

| Mutación | Tests que fallan |
| --- | --- |
| La escalera de calidad vuelve **dentro** del turno | **1** |
| Se desactiva la guarda de proporción/volumen del barrido | **4** |

---

## 4. Qué queda abierto

**Nada que bloquee.** Los tres bajos vigentes son observaciones aceptadas:

1. **M-4 → bajo**: `bodySizeLimit: "6mb"` es global y también sube el tope de
   cuerpo de las Server Actions del panel. Sin configuración por segmento en
   Next; mudar el registro a un route handler rompería el envío sin
   JavaScript. Documentado con razonamiento.
2. **B-1**: sin `Content-Disposition` en las respuestas de imagen. Con
   `Content-Type` fijo por el servidor y `nosniff`, defensa en profundidad.
3. **B-2**: siguen sin acotar el `console.warn` por imagen corrupta y los
   `console.error` de `servir.ts` (el de saturación sí se acotó a 1/min).
   Verificado que ninguno filtra datos.
4. **B-3**: `borrarNegocioDefinitivamente()` sin cablear a ninguna ruta;
   coordinado en T-015, igual que el directorio-en-medio del almacén.

Una nota operativa, no un hallazgo: la guarda del barrido es **fail-closed**
—si se planta, no borra y sale con código 1—, así que un cron que la dispare
seguirá fallando hasta que un humano mire. Es lo correcto para no destruir
datos, pero conviene que quien monte el cron en T-013 vigile el código de
salida: si nadie lo mira, las huérfanas se acumulan en silencio y M-3 vuelve
por la puerta de atrás.
