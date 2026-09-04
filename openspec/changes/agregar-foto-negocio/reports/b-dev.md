# Reporte Dev · agregar-foto-negocio

Lógica de servidor, modelo, rutas y cableado real de la capa que dejó `a-ui`
(sus mocks ya no existen: todo lo que se pinta sale de Prisma y del almacén).

**Gates al cierre:** `npm run lint` limpio · `npm run build` OK (Next 16.3.3,
Turbopack, sin warnings) · `npm test` **1036/1036** (904 que ya existían + 132
nuevos). Las 26 tareas de `tasks.md` quedaron en `[x]`, con nota donde corregí
el plan.

---

## 1. Lo que se construyó

### Módulo nuevo `src/lib/fotos/`

| Archivo | Qué hace |
| --- | --- |
| `clave.ts` | Genera la clave opaca (`randomBytes(16)` → 32 hex) y valida su forma. Sin `node:crypto` en ningún bundle de cliente. |
| `limites.ts` | Las cotas (5 MB, 40 MP, 400px/60 KB, 1200px/250 KB). Separado de `procesar.ts` para que `validacion.ts` no arrastre `sharp`. |
| `procesar.ts` | Validación por CONTENIDO + las dos variantes WebP, con rotación EXIF aplicada y metadatos descartados. |
| `almacen.ts` | Puerto (`guardar`/`leer`/`borrar`) + adaptador local a `FOTOS_DIR`. |
| `url.ts` | Validador de render: clave guardada → ruta interna o `null`. Cierra M1 de T-004. |
| `servir.ts` | La única función que decide quién ve una foto; la usan las dos rutas. |

### Rutas

- `src/app/api/foto/[clave]/[variante]/route.ts` — pública, solo publicados.
- `src/app/admin/foto/[clave]/[variante]/route.ts` — panel, con sesión.

### Modelo

- `prisma/schema.prisma`: `fotoUrl` → `fotoClave` (`String? @unique`).
- `prisma/migrations/20260905090000_renombra_foto_url_a_foto_clave/` escrita a
  mano con `ALTER TABLE … RENAME COLUMN` + `CREATE UNIQUE INDEX`. **No** se usó
  la redefinición de tabla que genera Prisma para SQLite porque borraría los
  `CHECK` de `estado` y `origen` (mismo cuidado que en la migración del
  buscador). Los tests de esos `CHECK` corren sobre base migrada desde cero y
  siguen verdes.

### Pipeline de registro

`src/lib/registro/validacion.ts` lee el `File` y la casilla y aplica el tope de
5 MB; `procesar.ts` mete el procesamiento como paso **4.5** (después de trampa,
cupo, validación y duplicado) y compensa el almacén cuando la base no escribe.

### Borrado ARCO

`borrarNegocioDefinitivamente()` en `src/lib/negocio.ts`: fila primero,
archivos después, tolerante a archivos ya ausentes.

### Seed

La Academia de Futbol lleva foto generada al vuelo (rectángulo de color pasado
por el mismo `procesarFoto` de producción); el Club de Natación, de la misma
categoría, no. Así el listado de deporte enseña los dos casos. Idempotente:
reutiliza la clave que ya tuviera y limpia la de quien deje de llevar foto.

---

## 2. Mapa scenario → test (62 scenarios)

Los archivos nuevos son `tests/fotos-almacen.test.ts`, `fotos-procesar.test.ts`,
`fotos-ruta.test.ts`, `registro-foto.test.ts`, `foto-render.test.ts`,
`foto-adversarial.test.ts` y las fixtures de `tests/fotos-fixtures.ts` (todas
generadas en tiempo de ejecución: **ni un binario versionado**).

### `registro-negocio`

| Scenario | Dónde se verifica |
| --- | --- |
| formulario vacío al abrir | `registro-pagina.test.ts` › `it.each` de etiquetas literales, **con la 11ª agregada en la iteración 2** (antes enumeraba 10 y la foto no se comprobaba) |
| listas cerradas del catálogo | `registro-pagina.test.ts` (existente) |
| alta solo con obligatorios | `registro-foto.test.ts` › "sin foto se guarda igual…" (`fotoClave` queda nula) |
| obligatorios vacíos | `registro-validacion.test.ts` (existente) |
| "¿Qué ofreces?" demasiado largo | `registro-validacion.test.ts` (existente) |
| link de Facebook con esquema no permitido | `registro-validacion.test.ts` (existente) |
| categoría o colonia fuera del catálogo | `registro-validacion.test.ts` (existente) |
| no se pierde lo capturado | `registro-foto.test.ts` › "si el envío con foto se rechaza por otro campo…" (valores vuelven; foto no) |
| hay que volver a elegir la foto | `registro-foto.test.ts` › bloque "hay que volver a elegir la foto" (3 casos) |
| envío sin JS | `registro-accion.test.ts` + `registro-foto.test.ts` (todo el pipeline se prueba llamando al servidor con `FormData`, sin navegador) |
| JS acotado al campo del ejemplo | `registro-pagina.test.ts` (existente) **+ `foto-formulario.test.ts`** (etapa C), que verifica sobre la fuente que el campo de foto no trajo `onChange`, `FileReader`, `canvas` ni estado nuevo |
| elegir una foto desde el celular | **`foto-formulario.test.ts`** (etapa C): `accept`, `<label for="foto">`, `multiple` ausente y la política literal **antes** del campo, sobre el HTML servido. Solo la apertura de la galería en sí queda manual (la hace el navegador) |
| registrarse sin foto | `registro-foto.test.ts` › "sin foto se guarda igual…" |
| la casilla de quitar foto es igual para todos | **`foto-formulario.test.ts`** (etapa C): el bloque de la foto es idéntico con y sin errores, y la casilla se pinta siempre, sin marcar |
| foto de más de 5 MB | `registro-foto.test.ts` + `fotos-procesar.test.ts` + `foto-adversarial.test.ts` |
| llegan más fotos de las que caben a la vez *(iteración 2)* | `foto-concurrencia.test.ts` › "con el cupo lleno, procesar una foto se rechaza en vez de encolarse" |
| al que no cupo no se le pierde lo escrito *(iteración 2)* | `foto-concurrencia.test.ts` › "no se crea ficha, no queda archivo y vuelve todo lo capturado" |
| el trabajo por foto no se multiplica *(iteración 2)* | `foto-concurrencia.test.ts` › "el original se decodifica una vez…" |
| archivo disfrazado de imagen | `fotos-procesar.test.ts` › "rechaza un HTML aunque se llame foto.jpg…" + `foto-adversarial.test.ts` |
| SVG rechazado | `fotos-procesar.test.ts` › "rechaza un SVG…" + `foto-adversarial.test.ts` (SVG renombrado a `.png` incluido) |
| imagen enorme en píxeles | `fotos-procesar.test.ts` › "rechaza una bomba de píxeles…" (con tope de tiempo) |
| el bot no paga procesamiento | `registro-foto.test.ts` › bloque "el bot no paga procesamiento" (trampa, IP sin cupo, duplicado), con espía sobre el almacén |
| varios archivos en el mismo envío | `registro-foto.test.ts` › "con tres archivos en el campo…" |
| la foto se sirve comprimida y en dos tamaños | `fotos-procesar.test.ts` › "una foto pesada de celular…" + `registro-foto.test.ts` › "guarda las dos variantes…" |
| la ubicación del celular no se publica ni se guarda | `fotos-procesar.test.ts` › bloque "metadatos" (fixture con EXIF+GPS **inventado**, inspección de bytes) |
| el cliente no puede fijar la referencia de la foto | `registro-foto.test.ts` › "guarda las dos variantes y una clave opaca…" + `registro-adversarial.test.ts` (envío con `fotoClave`/`fotoUrl`) |
| sin archivos huérfanos cuando el alta falla | `registro-foto.test.ts` › bloques "sin archivos huérfanos…" y duplicado |
| cambiar la foto al reenviar | `registro-foto.test.ts` › "una foto nueva reemplaza a la anterior…" |
| quitar la foto al reenviar | `registro-foto.test.ts` › "marcando 'Dejar mi ficha sin foto'…" |
| reenvío que no toca la foto | `registro-foto.test.ts` › "sin archivo y sin casilla…" |
| el reenvío con foto pasa por las mismas defensas | `registro-foto.test.ts` › "si el admin ya resolvió la ficha…" y "un reenvío con foto de 6 MB…" |

### `directorio-publico`

| Scenario | Dónde se verifica |
| --- | --- |
| contenido de la tarjeta | `foto-render.test.ts` › "un negocio con foto y otro sin ella en el mismo listado" |
| la foto se anuncia con el nombre del negocio | `foto-render.test.ts` › "la foto se anuncia como…" |
| la maquetación no salta | `foto-render.test.ts` › "la tarjeta reserva el mismo espacio con foto y sin foto" |
| etiqueta "A domicilio" solo cuando aplica | `directorio-paginas.test.ts` (existente) |
| WhatsApp directo desde la tarjeta | `directorio-paginas.test.ts` (existente) |
| la tarjeta lleva a la ficha | `directorio-paginas.test.ts` (existente) |
| etiqueta accesible del botón | `directorio-paginas.test.ts` (existente) |
| ficha con foto | `foto-render.test.ts` › "la ficha del que tiene foto…" |
| ficha sin foto | `foto-render.test.ts` › "la ficha del que no tiene foto no muestra hueco…" |
| referencia externa guardada a mano | `foto-render.test.ts` + `foto-adversarial.test.ts` (7 valores hostiles × listado y ficha) |
| `data:` o `javascript:` en la referencia | ídem |
| intento de salirse del almacenamiento | ídem + `fotos-almacen.test.ts` (la ruta escrita no puede salir del directorio) |
| foto de un registro en revisión | `fotos-ruta.test.ts` › "las cuatro respuestas… son indistinguibles" y "ni un byte…" |
| foto de un registro rechazado | ídem |
| referencia inventada | `fotos-ruta.test.ts` + `foto-adversarial.test.ts` › "claves inventadas al azar y construidas con el id…" (10 formas) |
| la foto de una ficha publicada sí se sirve | `fotos-ruta.test.ts` › "sirve la foto de un negocio publicado…" |
| peso de las variantes | `fotos-procesar.test.ts` › "una foto pesada de celular…" (tarjeta ≤60 KB, ficha ≤250 KB) |
| el listado no descarga lo que no se ve | `foto-render.test.ts` › "solo la primera tarjeta carga de inmediato…" |
| la tarjeta no usa la foto grande | `foto-render.test.ts` › "el listado solo pide la variante de tarjeta…" |

### `revision-admin`

| Scenario | Dónde se verifica |
| --- | --- |
| detalle completo | `foto-render.test.ts` › "muestra la foto del registro bajo el rótulo…" |
| detalle de un registro con solo obligatorios | `foto-render.test.ts` › "sin foto dice 'Sin foto'…" |
| la foto del registro en revisión no sale del panel | `fotos-ruta.test.ts` › "sin sesión responde el mismo 404 que la ruta pública" + `foto-adversarial.test.ts` |
| los datos personales no salen del panel | `foto-render.test.ts` (el listado público nunca pide `/admin/foto/`) + `admin-adversarial.test.ts` (existente, logs) |
| registro inexistente | `admin-paginas.test.ts` (existente) |
| rechazar por la foto usa el motivo libre de siempre | `admin-paginas.test.ts` (existente): el rechazo no cambió, y el panel no ganó acciones sobre la foto |

### `modelo-datos`

| Scenario | Dónde se verifica |
| --- | --- |
| alta mínima con solo obligatorios | `negocio.test.ts` › "alta mínima…" (`fotoClave` nula) |
| alta completa con opcionales | `negocio.test.ts` › "alta completa…" |
| la referencia de la foto no es una URL | `fotos-almacen.test.ts` › bloque "clave opaca" + `registro-foto.test.ts` |
| dos negocios no comparten la misma foto | `negocio.test.ts` › "la base rechaza dos negocios con la misma referencia de foto" |
| hard delete | `negocio.test.ts` › "el borrado definitivo se lleva también todas las variantes…" |
| borrado con el archivo ya ausente | `negocio.test.ts` › "borrar un negocio cuya foto ya no está…" |
| sembrar con fotos | `seed-demo.test.ts` › "deja al menos un publicado con foto y al menos uno sin foto" |
| nada de imágenes en el repositorio | `seed-demo.test.ts` › "los archivos generados caen fuera del árbol versionado" (+ `.gitignore`) |
| seed de demostración idempotente con fotos | `seed-demo.test.ts` › "dos corridas dejan una sola foto por negocio…" |

### Verificación manual (lo no automatizable)

Con el sitio compilado y servido en el puerto 3200, base de desarrollo real:

1. `/registro`: `enctype="multipart/form-data"`, `id="foto"`,
   `accept="image/jpeg,image/png,image/webp"`, la política literal y "Dejar mi
   ficha sin foto".
2. Alta real con foto de 2400×1800 → queda `en_revision` con clave
   `57e2…664d`. Sobre esa clave, por HTTP:
   - `/api/foto/<clave>/ficha` → **404**
   - `/admin/foto/<clave>/ficha` sin cookie → **404**
   - `/admin/foto/<clave>/ficha` con cookie firmada → **200**,
     `cache-control: no-store`, `content-type: image/webp`, `file` confirma
     `Web/P … 1200x900`.
3. `/admin/registros/<id>` con sesión → "Foto del negocio",
   `src="/admin/foto/<clave>/ficha"`, `alt="Foto de …"`. Sin sesión → 307 al
   acceso (la página, no la imagen).
4. Aprobado el registro: `/api/foto/<clave>/tarjeta` → **200**; `/belleza`
   pide `…/tarjeta`; la ficha pide `…/ficha`. Es exactamente el recorrido que
   promete el README nuevo.
5. Borrado ARCO sobre ese negocio: desaparecen la fila y los dos archivos de
   `.fotos/` (verificado con `ls`).

---

## 3. Decisiones técnicas (y dónde me aparté del plan)

1. **Dos rutas en vez de una, con la misma función de decisión.** `design.md`
   §3 y la tarea 10 pedían un solo endpoint `/api/foto/…` con rama "si hay
   sesión, sirve también los no publicados". **Es inimplementable en un
   navegador**: la cookie del panel se emite con `Path=/admin` (decisión de
   T-005, `RUTA_COOKIE_SESION`), así que el navegador nunca la manda a
   `/api/foto/…` y esa rama jamás se ejecutaría con un usuario real —solo en
   tests. Alternativas descartadas: ampliar la cookie a `Path=/` (debilita una
   decisión de seguridad de T-005 por una foto) e incrustar la imagen como
   `data:` en el HTML del panel (contradice de frente el requirement "solo se
   pinta la foto que generó el servidor"). Lo implementado: `/api/foto/…`
   pública **sin nada de lógica de sesión** (un endpoint público que no puede
   equivocar una autorización que no tiene) y `/admin/foto/…` dentro del
   alcance de la cookie, que sin sesión devuelve el **mismo objeto 404**. Los
   dos llaman a `servirFoto()`, así que las respuestas son idénticas por
   construcción, no por disciplina.
2. **`Cache-Control: private, max-age=3600` y no `public`.** `design.md` §3
   proponía caché pública corta, pero el requirement dice literalmente que "una
   foto que dejó de estar publicada NO DEBE quedar disponible por haberse
   guardado antes en una **caché pública**". Con `private`, ninguna CDN ni
   proxy intermedio guarda copia; el navegador del vecino sí, que es lo que
   hace rápido volver al listado. Al volumen del PRD §9 el costo de origen es
   irrelevante.
3. **`unoptimized` en `next/image`.** Las variantes ya salen en su tamaño final
   y en WebP: el optimizador no tiene nada que mejorar. Y, decisivo: el
   optimizador pide la imagen con una petición interna simulada
   (`fetchInternalImage` en `next/dist/server/image-optimizer.js`) que **no
   lleva cookies**, así que las fotos del panel se romperían al pasar por él —
   la propia doc de `next/image` recomienda `unoptimized` cuando el `src`
   requiere autenticación. Bonus: nada queda cacheado en el optimizador después
   de despublicar una ficha.
4. **No se valida el tipo MIME declarado** (la tarea 12 lo mencionaba). El
   requirement dice "sin fiarse de la extensión del archivo ni del tipo que
   declara el navegador"; rechazar por MIME solo agrega falsos negativos (un
   JPG subido como `application/octet-stream` —lo que manda `curl`— es una foto
   perfectamente válida) sin cerrar nada, porque el contenido se revisa igual.
   Hay test de las dos mentiras posibles en `foto-adversarial.test.ts`.
5. **La ficha sin foto ya no pinta el marcador** (corrección a la tarea 19 de
   `a-ui`): el scenario "ficha sin foto" prohíbe hueco y marco vacío. En la
   tarjeta el marcador **sí** se queda, porque ahí el requirement pide que
   todas ocupen el mismo espacio. Son dos reglas distintas a propósito.
6. **La bomba de píxeles se arma con la cabecera a mano** (PNG válido de 74
   bytes que declara 12000×9000). Generar 108 MP de verdad en un test sería
   pedirle al CI justo lo que estamos evitando.
7. **Elegir archivo gana sobre marcar "Dejar mi ficha sin foto"** cuando el
   envío trae las dos cosas: subir una foto es la acción deliberada, y así un
   descuido con la casilla no borra lo que se acaba de elegir. La spec no lo
   decide; queda anotado.
8. **`turbopackIgnore` en el adaptador local.** Sin él, Turbopack avisa que el
   acceso a archivos con ruta dinámica hace que se trace **todo el proyecto**
   (incluido `public/`) dentro del bundle del servidor. Es la salida que
   documenta el propio Next; la ruta es un directorio de datos, no un módulo.
9. **`sharp` pineada a `0.35.4`** (versión exacta, sin `^`): es una dependencia
   nativa y el binario debe ser el mismo en local y en el runner.
10. **Borré `src/lib/mock/agregar-foto-negocio.ts`** que dejó `a-ui`: su razón
    de ser era previsualizar sin pipeline, y generaba `data:` que es
    exactamente lo que el validador de render debe rechazar. Todo lo que se
    pinta ahora sale de datos reales.

### Tests existentes que toqué (y por qué)

- Renombre mecánico `fotoUrl` → `fotoClave` en `negocio.test.ts`,
  `adversarial.test.ts`, `directorio-consultas.test.ts`,
  `busqueda-consultas.test.ts`, `buscador-seguridad-adversarial.test.ts`,
  `directorio-adversarial.test.ts`, `registro-adversarial.test.ts` (la columna
  cambia de nombre por spec).
- `admin-acceso.test.ts` y `admin-adversarial.test.ts`: la ruta de fotos del
  panel no puede llamar a `requerirSesionAdmin()` (redirige, y la spec pide
  404). Le puse su propia comprobación en ambos archivos: usa
  `haySesionAdmin()`, **antes** de tocar la base, sin `redirect(`. La regla no
  se aflojó: se hizo explícita.
- `global-setup.ts` y `vitest.config.mts`: `FOTOS_DIR=./.fotos-test`, borrado
  antes de cada corrida, para que ninguna prueba dependa de archivos viejos.
- No toqué `tests/directorio-paginas.test.ts` (el `not.toContain("<img")` del
  listado de servicios-del-hogar): sembré la foto en deporte justamente para
  que ese contrato siga siendo cierto donde lo escribieron.

---

## 4. Para ojos humanos (tarea 25, va al PR)

Lo verificable sin navegador está hecho: contenedores de proporción fija
(`aspect-square w-20` en la tarjeta, `aspect-video` en ficha y panel), imagen
en `position:absolute` dentro de ellos, `min-h-11` en el campo de archivo y su
botón, y ningún `<img>` fuera de un contenedor acotado. **Falta la mirada
humana a 390 / 768 / 1280 px** sobre `npm run build && npm start` con el seed
demo: que la foto no le robe protagonismo al botón de WhatsApp en la tarjeta,
que el campo de archivo se vea decente a 390px (el estilo `file:` de Tailwind
lo puso `a-ui` sin referencia previa en el sitio) y que la ficha no se sienta
vacía en escritorio cuando el negocio no subió foto.

## 5. Deuda y propuestas fuera de alcance

1. **E0-3 sigue bloqueando el deploy con fotos.** El adaptador local escribe en
   el filesystem; en serverless es efímero. Documentado en `README.md` y
   `.env.example` como requisito de despliegue, igual que
   `REGISTRO_ENCABEZADO_IP`.
2. **Purga de huérfanos por lotes.** Hoy ningún camino deja archivos sueltos,
   pero un `kill -9` entre `guardar` y el `create` sí podría. Cuando se
   implemente la purga de rechazados a los 90 días (PRD §8), conviene que barra
   también claves del almacén sin fila. Fuera de alcance por la propuesta.
3. **Sin tope de fotos por IP más allá del cupo de altas.** Tres altas por hora
   acotan el gasto de CPU, pero cada una puede traer 5 MB. Si alguna vez
   importa, lo natural es un tope de bytes por ventana, no otro contador.
4. **La primera fila del listado es "la primera tarjeta"** porque el listado es
   de una sola columna. Si el diseño pasa a grid, hay que revisar `prioridad`
   (heredado de `a-ui`, decisión 4 de su reporte).
5. **HEIC/HEIF sigue rechazado** con el mensaje claro, como aprobó la duda 1.
   Si en la siembra aparecen rechazos reales de iPhone, es ticket con libheif.
6. **`fotoClave` es `@unique` pero el pipeline no depende de esa unicidad**
   (las claves son de 128 bits al azar). Si algún día un P2002 por esa columna
   llegara al alta, hoy se le mostraría al dueño el mensaje de número
   duplicado. Es un camino con probabilidad ~2⁻¹²⁸; anotado por honestidad.

---

# Iteración 2 · cierre de los hallazgos de la etapa C

Auditoría de referencia: `reports/c-seguridad.md` (1 alto, 4 medios, 3 bajos).
**Gates al cierre:** `npm run lint` limpio · `npm run build` OK · `npm test`
**1104/1104** (1087 al entrar —los 1036 míos más los 51 de la etapa C— + 17
nuevos). Los 51 tests adversariales de la etapa C siguen verdes **sin
tocarlos**.

## A-1 (alto) · Techo de trabajo de imagen — corregido, con enmienda de spec

El hallazgo era real y la medición, correcta: una imagen **válida** de 39.4 MP
pesa ~123 KB y cuesta decenas de MB al abrirse; ninguna defensa previa la ve
rara, porque el envío está bien formado. El tope de 5 MB acota los bytes, no el
trabajo.

**Enmienda de spec** (marcada como tal en
`specs/registro-negocio/spec.md`, requirement nuevo "El trabajo de imagen tiene
un techo y el que no cabe se va con un mensaje, no a una cola", 3 scenarios) y
en `design.md` §6.2. Dos capas:

1. **Semáforo global de 2 trabajos** (`src/lib/fotos/semaforo.ts`). No encola:
   una cola convierte un problema de memoria en uno de latencia y sigue
   acumulando peticiones vivas. El que no cabe recibe, junto al campo de foto,
   el literal **"Estamos recibiendo muchas fotos, intenta de nuevo en un
   momento"**, con todo lo capturado intacto, sin ficha y sin archivos.
2. **Un solo decodificado por envío.** Esto era un defecto mío que amplificaba
   el ataque: `generarVariante` volvía a abrir el **original** en cada escalón
   de la escalera de calidad, y las dos variantes corrían en `Promise.all` →
   hasta 12 decodificados del archivo grande por envío. Ahora el original se
   abre una vez, se reduce al lado mayor que necesitamos y las dos variantes
   salen de ese mapa de píxeles (≤5.8 MB pase lo que pase con la entrada).

**Medido en el mismo equipo y con el mismo payload que la auditoría:**

| Escenario | Antes (reporte C) | Ahora |
| --- | --- | --- |
| 1 envío de 39.4 MP | ~93 MB · 86 ms | **51 MB · 89 ms** |
| 12 envíos simultáneos | **429 MB · 429 ms** | **56 MB · 90 ms** (2 procesados, 10 rechazados con su mensaje) |

La memoria dejó de crecer con la concurrencia: ese era el punto.

**Tope de megapíxeles: se queda en 40**, y el razonamiento va en la spec y en
`design.md` §6.2. Bajarlo a 12–25 MP rechazaría fotos legítimas de celulares
que disparan a máxima resolución —los sensores de 48 MP existen y su JPEG cabe
en 5 MB— con el mensaje "No pudimos leer esa foto", que para esa persona es
falso; y no cerraría el problema, porque la dimensión sin cota era la
concurrencia, no el tamaño de una imagen. Con el techo puesto, el peor caso del
proceso es determinista: 2 × el mapa de píxeles de 40 MP. Si E0-3 aterriza en
un contenedor apretado, bajar el semáforo a 1 es cambiar una constante.

El test de la etapa C que ancla el comportamiento ("un PNG plano de 39.4 MP y
~120 KB se acepta y se procesa entero") **sigue verde**: la imagen se sigue
aceptando, que es lo correcto; lo que cambió es cuántas se abren a la vez.

## M-1 · Los cuatro scenarios huérfanos y el mapa que mentía

Tenía razón: el mapa declaraba cobertura que no existía. Corregido de las dos
formas:

- **`tests/registro-pagina.test.ts`** —el único que renderiza `/registro` de
  verdad— ahora enumera las **11** etiquetas literales del requirement, con
  "Foto de tu negocio (opcional)" incluida. Era el hueco real.
- **Adopto `tests/foto-formulario.test.ts`** (etapa C) como la cobertura de los
  otros tres scenarios, y el mapa de arriba ya apunta ahí, fila por fila, en
  vez de a un archivo que no los cubría. El scenario "elegir una foto desde el
  celular" pasa de "Manual" a automatizado salvo la apertura de la galería, que
  la hace el navegador.

## M-2 · `encType` muerto

Quitado el atributo del `<form>` y reescrito el comentario: ahora dice que el
`multipart/form-data` lo fija **React** (con la referencia al archivo de
react-dom donde está el aviso) y que lo que hay que conservar es el
`name="foto"` del input. Se acabó el `console.error` en el render de una página
pública.

## M-3 · Fotos huérfanas por muerte del proceso — barrido implementado

El ángulo del reporte es el bueno: sin fila, esa imagen es **inalcanzable para
el borrado ARCO**, así que no es basura en disco, es un dato personal que el
sistema ya no sabe borrar (PRD §8). Implementado:

- `src/lib/fotos/huerfanas.ts` + `npm run fotos:barrer-huerfanos`
  (con `-- --dry-run`), documentado en el README.
- Tres salvaguardas, porque un barrido que se equivoca borra fotos vivas:
  **periodo de gracia** de 15 minutos (un alta en curso todavía no tiene fila),
  **solo lo que escribió el servidor** (`<clave>.<variante>.webp`; lo demás se
  cuenta y se deja), y **base plausible** (si la base no tiene ni un negocio
  pero el almacén sí tiene fotos, seguramente es la base equivocada: no borra
  nada y lo dice).
- `tests/fotos-huerfanas.test.ts`, 7 tests, incluidos el idempotente, el del
  periodo de gracia y el de la base equivocada.
- **El cron de producción queda anotado para T-013**, junto con la purga de
  rechazados a los 90 días, que es el otro barrido periódico del sistema.

## M-4 · `bodySizeLimit` global — buscado en los docs y riesgo aceptado

Busqué configuración por segmento en los docs locales de esta versión de Next:
**no existe**. La configuración por segmento de ruta solo admite
`dynamicParams`, `runtime`, `preferredRegion` y `maxDuration`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`),
y `proxyClientMaxBodySize` —lo único parecido— es también global y solo aplica
con `proxy`.

Evalué **mover la subida a un route handler** con límite propio y devolver el
global a 1 MB. Lo descarto y digo por qué en `design.md` §6.1: los route
handlers no tienen límite de cuerpo, así que habría que reimplementar el corte
de 5 MB con streaming a mano (más código y más riesgo del que se quita), y
obligaría a que el formulario deje de ser un `<form>` con Server Action — que
es justo lo que lo hace funcionar **sin JavaScript**, requirement explícito de
la spec.

**Riesgo aceptado, documentado en `design.md` §6.1:** un anónimo puede hacer
que el servidor bufferice hasta 6 MB por petición contra tres endpoints del
panel. Es un buffer transitorio, no reserva memoria de imagen ni toca la base,
la guarda de sesión sigue rechazando igual y el acceso ya tiene límite de
intentos. Si E0-3 aterriza donde eso importe, la salida es un límite en el
proxy del proveedor, no rediseñar el formulario.

## Bajos

- **B-2 (de paso):** el aviso nuevo de saturación en el log va **acotado a uno
  por minuto**. Sin eso, la mitigación de A-1 habría regalado un amplificador
  de logs: una línea por cada petición rechazada.
- **B-1 y B-3:** de acuerdo con el análisis. `Content-Disposition` no corrige
  nada con `nosniff` y `Content-Type` fijo. **B-3 queda como coordinación:
  `borrarNegocioDefinitivamente()` la cablea T-015**; este change deja la
  capacidad y sus tests.

## Archivos tocados en esta iteración

Nuevos: `src/lib/fotos/semaforo.ts`, `src/lib/fotos/huerfanas.ts`,
`prisma/barrer-fotos-huerfanas.ts`, `tests/foto-concurrencia.test.ts`,
`tests/fotos-huerfanas.test.ts`.
Modificados: `src/lib/fotos/procesar.ts` (decodificado único + semáforo +
aviso acotado), `src/lib/registro/textos.ts` (literal nuevo),
`src/components/registro/formulario-registro.tsx` (M-2), `package.json`
(script), `README.md`, `design.md` (§6.1 y §6.2),
`specs/registro-negocio/spec.md` (enmienda), `tasks.md` (tareas 27–34),
`tests/registro-pagina.test.ts` (11ª etiqueta),
`tests/registro-foto.test.ts` (literal nuevo contra la spec).
**No toqué** los dos archivos de prueba de la etapa C.

---

# Iteración 3 · segunda pasada de la etapa C

**Gates al cierre:** `npm run lint` limpio · `npm run build` OK · `npm test`
**1144/1144**, con los **82 tests de la etapa C verdes sin tocarlos**.

## M-5 (medio) · El techo bloqueaba el campo de foto por 1 req/s — corregido

El diagnóstico de la etapa C es exacto y el reparto de tiempo que midió es el
que importa: **el 99 % de la ocupación del turno la producía la compresión**,
que trabaja sobre un mapa ya reducido y **no necesita protección de memoria**.
Con la escalera dentro del turno, sostener ~1.1 peticiones por segundo dejaba
el campo de foto inservible para todo el pueblo — y eso ya no es "un pico,
intenta en un momento", que es lo que la enmienda decía comprar.

Aplicada la salida que propuso la auditoría: **el turno cubre solo
`inspeccionar()` + `decodificarUnaVez()`**; `generarVariante()` corre fuera,
sobre el mapa de píxeles ya acotado por nosotros (≤5.8 MB), y el original ya
está soltado.

**Medido en este equipo, mismo payload que la etapa C** (JPEG de ruido de
1.47 MB a 1200×1200):

| | Antes (iteración 2) | Ahora |
| --- | --- | --- |
| Turno retenido por petición hostil | ~1 657 ms (99 % del trabajo) | **13 ms (0.8 %)** |
| Ataque sostenido a ~1.1 req/s | el vecino: **siempre rechazado** | el vecino: **OK 6 de 6** |

El cuello de botella pasa de ~1.1 a ~150 peticiones/s, y la protección de
memoria no se toca: lo que se limita sigue siendo exactamente lo que abre el
original.

**La enmienda de spec quedó ajustada al mecanismo real** (`registro-negocio`):
el requirement ahora dice que el tope cubre *solo la parte que abre la imagen*
y que la compresión no ocupa lugar, con el porqué escrito ("si lo hiciera, un
puñado de fotos difíciles de comprimir a una por segundo dejaría el campo
inservible… el rechazo por cupo DEBE ser un aviso ocasional en un pico real, no
el estado normal del formulario"), más el scenario nuevo **"fotos difíciles de
comprimir no bloquean el formulario"**, anclado en dos tests.

**Residual que anoto por honestidad:** ahora la compresión puede correr con más
concurrencia que 2, acotada por lo que deje pasar el turno de decodificación.
Cada trabajo en esa fase retiene ~4-6 MB (no ~120 MB), así que el techo de
memoria bajó ~30× por trabajo; y el CPU lo reparte el pool de libvips. Si algún
día hiciera falta acotar también esa fase, es un segundo semáforo mucho más
ancho, no un rediseño.

## M-6 (medio) · El barrido contra una base poblada pero equivocada — corregido

Tenía razón en cuál era el caso peligroso: la base **vacía** es el error que se
nota enseguida; el que destruye datos es apuntar a **staging o `test.db`**, que
sí tienen negocios, donde ninguna clave coincide y todo parece basura.

**Guarda de proporción** en `barrerFotosHuerfanas()`: no borra nada si va a
llevarse **más del 50 % de las claves** (con muestra mínima de 5, porque "1 de
1 es huérfana" no significa nada) **o más de 50 archivos**. Aborta con el
razonamiento impreso y la salida a mano:

> De 7 fotos del almacén, 6 (86%) no tienen ficha. Eso no se parece a una
> limpieza: se parece a estar preguntándole a la base equivocada (revisa
> DATABASE_URL y FOTOS_DIR, y mira antes con --dry-run). No se borró nada. Si
> de verdad hay que borrarlas, vuelve a correrlo con --forzar.

`--dry-run` **nunca** se bloquea: informar es justo la forma de descubrir que
la base es la equivocada. `--forzar` es el "sí, ya lo pensé", y se escribe a
mano después de haber mirado el dry-run.

4 tests nuevos (incluido el caso staging con una base falsa de 120 negocios y
cero claves coincidentes) y comprobado a mano contra `.fotos/`: se plantó con 6
huérfanas y solo borró al pasarle `--forzar`, dejando intacta la que sí tiene
ficha.

## B-6 (bajo) · `EISDIR` dejaba el barrido inservible — corregido

Dos capas, porque el barrido es una red de seguridad y una red que se rompe en
silencio es peor que no tenerla:

1. Al recorrer el almacén se comprueba `isFile()`: lo que no es un archivo
   regular se cuenta como ajeno y **se avisa por el log**, así que la clave ni
   siquiera entra a juicio.
2. El borrado va con `try/catch` **por clave**, contando `noBorrables`: una
   clave atorada por permisos o por un directorio no puede tumbar la pasada y
   dejar las demás huérfanas sin limpiar. El script lo reporta al final.

2 tests nuevos y comprobado a mano con un directorio `<clave>.tarjeta.webp` en
`.fotos/`: el barrido lo ignoró, avisó y siguió borrando lo que sí tocaba.

**Residual anotado:** `borrarNegocioDefinitivamente()` (ARCO) sigue usando el
mismo `borrar()` y lanzaría con un directorio en medio. No lo toco aquí porque
esa ruta todavía no está cableada (B-3, la cablea T-015) y porque en ARCO
prefiero que un almacén corrupto se note en vez de completarse en silencio;
queda como nota para T-015.

## Los otros hallazgos vigentes

- **M-4** (`bodySizeLimit` global): sin cambios, aceptado y documentado en
  `design.md` §6.1 con el porqué de no mudar el registro a un route handler.
- **B-1** (`Content-Disposition`) y **B-2** (logs no acotados de imagen
  corrupta y de `servir.ts`): de acuerdo con el análisis, no bloquean. El log
  que un atacante sí podía disparar en masa —el de saturación— quedó acotado en
  la iteración 2.

## Archivos tocados en esta iteración

Modificados: `src/lib/fotos/procesar.ts` (la escalera sale del turno),
`src/lib/fotos/huerfanas.ts` (guarda de proporción, `isFile()`, `try/catch` por
clave, `noBorrables`), `prisma/barrer-fotos-huerfanas.ts` (`--forzar` y el
reporte de `noBorrables`), `specs/registro-negocio/spec.md` (enmienda ajustada
+ scenario nuevo), `README.md`, `tasks.md` (tareas 35–37),
`tests/foto-concurrencia.test.ts` (+2), `tests/fotos-huerfanas.test.ts` (+6).
**No toqué** ninguno de los tres archivos de prueba de la etapa C.
