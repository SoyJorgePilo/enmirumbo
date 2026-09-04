# Etapa C (seguridad y pruebas adversariales) — agregar-seo-local

**Ticket:** `docs/tickets/T-009-seo-local.md` · **Rama:** `feature/agregar-seo-local` (worktree `.claude/worktrees/wt-seo`)
**Entrada:** spec completa (61 scenarios en 3 deltas), `reports/b-dev.md`, y el árbol sin commitear (`git status` + `git diff`).
**Git:** no se tocó. Solo se agregó `tests/seo-seguridad-adversarial.test.ts`.

> **Estado tras la iteración 2 del dev (re-verificado sobre el código real).**
> **Hallazgos restantes: 0 críticos · 0 altos · 1 medio abierto** (M3, delegado a T-008 por decisión del orquestador) + 5 observaciones bajas.
> **Veredicto: PASA al validador.** M1, M2, M4 y O1 quedan corregidos y verificados de forma independiente; el detalle de la re-verificación está en la §6, incluido el residuo del saneo de M2 y el análisis de la memoria de catálogos.
>
> **Gates al cierre de la iteración 2:** `npm test` → **1 225 pruebas en 43 archivos, todas en verde** · `npm run lint` limpio · `npm run build` ✓ **corrido dos veces desde cero, con y sin `SITIO_URL`** (es la verificación que falló la primera vez).

**Gates al cierre de la iteración 1:** `npm test` → 1 171 pruebas en 42 archivos, todas en verde (antes de esta etapa: 1 085 en 41) · `npm run lint` sin errores ni warnings · `npm run build` ✓.

**Conteo de la iteración 1: 0 críticos · 0 altos · 4 medios** (+ 3 observaciones de severidad baja).
**Veredicto de la iteración 1: PASA al validador.** Ningún hallazgo bloquea. M1 conviene corregirlo antes del merge: es un scenario de la spec que no se cumple y que el reporte del dev da por verificado.

---

## 1. Hallazgos

### MEDIO

#### M1 · Construir sin `SITIO_URL` publica una `og:image` a `http://localhost:3000` en la página 404 — ✅ CORREGIDO en la iteración 2 (re-verificado, §6)

**Archivos:** `src/lib/seo/metadata.ts:58` (la mitigación `openGraph.images: []`) · evidencia en `.next/server/app/_not-found.html`.

La spec `layout-base` exige, en el scenario *"producción sin URL pública declarada"*: **"no se publica ninguna URL absoluta que apunte a la dirección local"**. `b-dev.md` lo da por verificado dos veces (mapa scenario→prueba, fila "producción sin URL pública declarada": *"manual: `npm run build` sin `SITIO_URL` → el HTML generado no contiene `localhost`"*; y decisión técnica #5: *"Comprobado sobre el HTML construido: cero `localhost`"*). **Esa verificación es incorrecta.**

Reproducción exacta (dos comandos, sin base de datos):

```
npm run build                      # sin SITIO_URL declarada
grep -o '<meta property="og:image[^>]*>' .next/server/app/_not-found.html
# → <meta property="og:image" content="http://localhost:3000/opengraph-image?b182142986faa6b5"/>
```

Durante el build Next lo avisa a la cara y nadie lo leyó: `⚠ metadataBase property in metadata export is not set ... using "http://localhost:3000"`.

Por qué se escapa de la mitigación: `openGraph.images: []` sí funciona en las páginas propias —`.next/server/app/registro/gracias.html` queda sin `og:image`, correcto—, pero la ruta interna `/_not-found` recibe igual la imagen de la convención de archivo (`src/app/opengraph-image.tsx`), resuelta contra `localhost` por falta de `metadataBase`. Con `SITIO_URL` declarada al construir, el problema desaparece por completo (verificado: `grep -rl localhost .next/server/app/` no devuelve nada, y esa misma etiqueta pasa a `https://necesitouno.example/opengraph-image?…`).

**Escenario de fuga/daño:** un despliegue de producción que no declare la variable **en el entorno de build** (la deuda #3 que el propio dev anota) publica una 404 estática cuya vista previa apunta a `localhost:3000`. Al compartir cualquier enlace roto del sitio por WhatsApp o Facebook, el generador de la vista previa —y el navegador de quien lo reciba— intenta traer una imagen de la *máquina de quien mira*. No expone datos personales ni rompe autorización; el daño es la vista previa rota y una petición dirigida al equipo del visitante. Por eso es medio y no alto.

**Sugerencia para el dev (no implementada aquí):** o `metadata` propio en `src/app/not-found.tsx` con `openGraph: { images: [] }`, o una comprobación automatizable del build. Lo que no debe quedar es el scenario marcado como verificado.

---

#### M2 · La descripción y el JSON-LD reexportan tal cual lo que el negocio escribió en "¿Qué ofreces?", número de teléfono incluido — ✅ CORREGIDO en la iteración 2, con residuo documentado (§6, R1)

**Archivos:** `src/lib/seo/titulos.ts:101-103` (`descripcionFicha`) · `src/app/negocio/[ficha]/page.tsx:75,80,85` · `src/lib/seo/datos-estructurados.ts:55,66`.

La spec dice, en el requirement de títulos: *"La descripción NO DEBE incluir el WhatsApp ni el teléfono del negocio"*, y el requirement de Schema.org lo funda en el hallazgo M5 de T-004: **no entregar los números en formato legible por máquina**. La implementación cumple eso a nivel de *campos* (nunca lee `whatsapp` ni `telefonoFijo`), pero no a nivel de *contenido*: `queOfreces` es texto libre de 200 caracteres que se copia literalmente a `<meta name="description">`, a `og:description` y a `description` del JSON-LD.

**Escenario de fuga:** un negocio escribe en "¿Qué ofreces?" lo que la mitad de los negocios escribe — *"Plomería 24 horas, llámanos al 771 000 0000"*. Ese número queda: (a) en la meta descripción que Google muestra en el resultado de búsqueda, (b) en `og:description`, que es lo que viaja a WhatsApp y Facebook cuando alguien comparte la ficha, y (c) dentro del bloque JSON-LD, es decir en formato legible por máquina, que es exactamente lo que M5 pedía evitar.

Atenuante honesto: el WhatsApp del negocio ya está en el `href` de `wa.me` de la propia ficha, así que en esa página no es un dato nuevo. Lo que este change agrega es que el dato **sale de la ficha**: viaja al snippet de Google y a las vistas previas de otras plataformas, donde la ficha no llega. Es decisión de producto (recortar/limpiar dígitos, o dejarlo), no un bug obvio, pero la spec dice "NO DEBE" y hoy puede.

Lo que sí quedó cubierto y probado por mí: la descripción **nunca** trae el contenido de los campos `whatsapp` ni `telefonoFijo` (prueba "el bloque nunca trae el identificador interno ni el enlace de gestión" y el conjunto de claves acotado).

---

#### M3 · `fotoUrl` externa se acepta sin validar dominio para `og:image` y para el `image` del JSON-LD — 🟡 ABIERTO, delegado a T-008 (§6)

**Archivos:** `src/lib/seo/metadata.ts:90` (`imagenesDeLaFicha`) · `src/lib/seo/datos-estructurados.ts:83` (`imagenAbsoluta`).

Las dos funciones aceptan cualquier cadena que empiece por `http://` o `https://` y la publican tal cual como imagen del sitio.

**Hoy no hay explotación viva** y lo verifiqué: el registro público ignora `fotoUrl` (`tests/registro-adversarial.test.ts:473`, que además prueba `javascript:alert(1)`), el panel no lo escribe, y mis pruebas confirman que un esquema hostil (`javascript:`, `data:`, `vbscript:`, `httpx:`, relativo sin `/`) **nunca** sale como `og:image`: siempre cae a la imagen de marca absoluta.

**Riesgo que se hereda a T-008 (subida de foto):** en cuanto ese campo sea escribible desde fuera sin lista blanca de dominio, cualquiera puede (a) hacer que la vista previa de "su" ficha en el directorio muestre una imagen alojada en un servidor ajeno y cambiarla después de la verificación del admin, y (b) recibir un ping de cada rastreador y de cada plataforma que genere la vista previa. Se señala aquí, con nombre y línea, para que T-008 no lo redescubra.

---

#### M4 · Superficies públicas nuevas sin ninguna protección contra abuso, y con el costo por petición medido — ✅ CORREGIDO en la parte medible (§6); el límite de tasa sigue siendo deuda de E5-5

**Archivos:** `src/app/sitemap.ts:25` (`force-dynamic`) y `:37` · `src/app/[destino]/page.tsx:71,109` · `src/lib/seo/destino.ts:28` · `src/lib/directorio.ts` (`obtenerCatalogosDeLaRaiz`, `obtenerDatosDelSitemap`).

Se señala, no se implementa: la spec pide el sitemap generado en cada petición y declara explícitamente que la defensa contra cosecha masiva es deuda de E5-5. Lo que aporto son números medidos, no impresiones (prueba "lo que cuesta una petición hostil", que instrumenta el cliente Prisma y cuenta llamadas):

| Petición | Consultas a la base |
| --- | --- |
| Slug sin forma de slug (`../..`, 500 caracteres, mayúsculas, `%00`, 10 001 caracteres) | **0** |
| Slug bien formado inexistente (`aaaa-bbbb`, `plomeria-colonia-inventada`, 16 guiones) | **6** |
| Página de giro válida (`/cerrajeria`) | 9 |
| Listado por categoría (`/servicios-del-hogar`) | 8 |
| `robots.txt` | 0 |
| `sitemap.xml` | 2, **fijas** (no crece con el número de negocios: verificado sembrando 12 más) |

Dos cosas que salen de ahí:

1. **La afirmación de b-dev.md (decisión #2) de que "toda la clase adversarial muere sin costar una consulta" vale solo para los slugs mal formados.** La clase que sí paga es la de slugs con forma válida e inexistentes, que es infinita y gratuita de generar: 6 consultas por petición, sin autenticación y sin límite por IP. Con SQLite y 78 filas de catálogo el costo unitario es bajo, pero la amplificación es real y la superficie es la raíz del sitio.
2. **De esas 6, la mitad son redundantes:** los tres catálogos se leen enteros **dos veces por petición**, una en `generateMetadata` y otra en la página, porque `obtenerCatalogosDeLaRaiz` no está memoizada por request (`React.cache`). Es la mitad del costo de cada vista de la raíz, y aplica también a las peticiones legítimas, contra el presupuesto de <2 s en 4G del PRD §8.

Y el punto de privacidad: el `sitemap.xml` le entrega a cualquiera el índice completo de fichas publicadas, que es la puerta de entrada de la cosecha masiva del hallazgo M5 de T-004. Es el propósito del artefacto y la spec lo asume; queda anotado para E5-5/E0-3 junto al límite de lectura por IP.

---

### Observaciones (severidad baja, no bloquean, no cuentan al conteo)

- **O1 · Las rutas de archivo nuevas de la raíz no están reservadas.** `SEGMENTOS_RESERVADOS` (`src/lib/rutas-reservadas.ts`) no incluye `robots.txt`, `sitemap.xml`, `opengraph-image` ni `favicon.ico`, y el guardián que dice cubrirlo (`tests/directorio-consultas.test.ts:56`) enumera **solo directorios** de `src/app`, así que no ve rutas declaradas como archivo. Un giro o colonia futuro cuyo slug fuera `opengraph-image` quedaría inalcanzable sin que nada avise. Impacto hoy: nulo (ningún slug del catálogo se le parece; lo verifiqué contra los 78). Es un hueco del guardián, no de la ejecución.
- **O2 · Sobre saltarse la etapa A (ui): la justificación se sostiene, con una excepción menor.** Verifiqué el reuso: `ListadoGiro` y `ListadoCategoria` comparten de verdad `ListaNegocios` y `NavegacionColonias`, el mismo `h1`, el mismo bloque de estado vacío y `CLASE_BOTON_PRIMARIO`. **No hay UI nueva inventada.** Lo único es que los chips de giro de la ficha (`src/app/negocio/[ficha]/page.tsx:190`) **copian** el literal de clases en vez de compartir `claseFiltro` (`src/components/directorio/navegacion-colonias.tsx:19-24`): mismas utilidades, distinto orden, dos fuentes de verdad que se van a desincronizar en el primer restyle.
- **O3 · El texto libre de colonia "Otra" entra al `<title>` y al `og:title` de la ficha** (`src/lib/seo/titulos.ts:54`), aunque el JSON-LD sí lo excluye a propósito. La ficha ya se lo muestra a las personas, así que no es fuga nueva; lo que cambia es que ahora ese texto —que escribió el negocio, sin normalizar— viaja al snippet de Google y a la vista previa al compartir.

---

## 2. Scenarios sin prueba

Revisé el mapa scenario→prueba de `b-dev.md` contra los tres deltas. **No encontré ningún scenario automatizable sin prueba:** los 61 tienen archivo y caso nombrado, y los que se resuelven "manual" son los que en este entorno no se pueden automatizar (no hay navegador):

- *"celular a 390px"* y la revisión visual a 390/768/1280 px — legítimo, queda para ojos humanos en el PR.
- *"navegación sin JavaScript"* — cubierto estructuralmente (la navegación por colonia son `<a>`, no un `<select>`); el recorrido completo, manual.
- *"la ruta dinámica no tapa las rutas propias"* y *"canónicas absolutas"* — automatizados en su parte verificable, con la comprobación sobre el servidor como complemento.
- *"la imagen se declara con URL absoluta"* — el `GET /opengraph-image` manual es de hecho innecesario: `next build` prerenderiza esa ruta (`○ /opengraph-image` en la salida), así que un fallo de `next/og` rompería el build.

La única excepción es la mitad manual del scenario *"producción sin URL pública declarada"*, que está **mal verificada** (→ M1). Su mitad automatizada (`seo-metadata`, `seo-artefactos`) sí pasa y sí es correcta.

También confirmé que **ninguna prueba previa se debilitó**: los cambios en `directorio-adversarial` (descontar el bloque `ld+json` antes de exigir "ni un `<script>` más") están justificados por la spec y quedan compensados campo por campo en `seo-jsonld` y en mi suite; el resto son renombres de `categoria` → `destino` sin tocar aserciones.

---

## 3. Pruebas adversariales agregadas

`tests/seo-seguridad-adversarial.test.ts` — **86 pruebas, todas en verde.** Datos ficticios (serie `771999 6xxx`, dominio `necesitouno.example`), limpieza propia en `afterAll`. No repite las 29 entradas hostiles de `tests/seo-adversarial.test.ts`; ataca lo que quedaba fuera.

| Bloque | Qué ataca | Resultado |
| --- | --- | --- |
| El resolvedor sobre los catálogos **sembrados** | Las **1 029** combinaciones giro+colonia reales, una por una, contra el resolvedor de producción (no contra un catálogo de juguete ni contra la invariante, que razona aparte); las 8 categorías; los 49 giros; y que **ninguna de las 21 colonias abra página propia** | Verde: cada compuesto se lee de una sola manera y devuelve su par |
| Impostores unicode y sondeo | 29 entradas: `ı` sin punto, `і`/`р` cirílicas, ancho cero, acento combinante (NFD), anchura completa, espacio duro, byte nulo, `\r\n` con `Set-Cookie`, `.json`/`.xml`, `;`/`:`/`@`/`#`/`?`/`+`/`\|`/`\`, traversal sobrelargo y doblemente codificado, `.well-known`, límite de largo ±1 | Verde: ninguna tiene forma de slug ni resuelve; mayúsculas y acentos no abren una segunda URL de la misma página |
| Bomba de guiones | 10 001 caracteres con 5 000 guiones, 200 veces | Verde: <200 ms en total (el tope de largo mata los cortes antes de recorrerlos) |
| Catálogos **futuros** hostiles | Giro con slug de categoría; giro con slug de un compuesto ya válido; **categoría** con slug de un compuesto ya válido; colonia con slug de categoría; los 8 segmentos reservados en los tres catálogos; un compuesto con **tres** lecturas; slugs de catálogo con forma inválida | Verde: la invariante los nombra a todos y, mientras tanto, ninguna URL ya publicada cambia de significado (categoría → giro → par, en ese orden) |
| Lo no publicado | Un negocio **publicado y luego rechazado** (conserva `publicadoEn`, el caso que faltaba) más uno en revisión, con centinelas en dirección, horario, fijo, motivo de rechazo y "¿Qué ofreces?": contra `/herreria`, `/herreria-atempa`, el listado de su categoría, su ficha y el sitemap | Verde: ni un centinela, ni un id; ficha 404 y metadata vacía; el filtro es por **estado**, no por tener fecha de publicación |
| `noindex` | Giro y par vacíos vs. con contenido; **las 8 categorías** (que nunca deben llevarlo, ni vacías) | Verde |
| JSON-LD como fuga | Negocio con todos los campos privados llenos: conjunto **exacto** de claves permitidas, forma de `address`, y ausencia de dirección, horario, fijo, WhatsApp, coordenadas, colonia libre, `telephone`, `openingHours`, `geo`, `@id`, `token` | Verde; el id solo aparece dentro de la URL pública de la ficha y en ningún campo suelto |
| JSON-LD como inyección | 12 cargas en nombre, "¿Qué ofreces?" y giro: `</script>`, `</ScRiPt >`, `</script\t>`, `</script\n>`, `<!--<script>`, `-->`, `]]>`, ruptura con comillas y barra, U+2028/U+2029, `<` literal, `<\/script>`, entidades; más una ficha real renderizada con la carga adentro | Verde: ni un `<` crudo, un solo bloque válido, el texto íntegro adentro; fuera del bloque, React lo escapa y no queda `<img`, `<iframe` ni `<!--` |
| `SITIO_URL` hostil | Credenciales + ruta + consulta + fragmento; espacios; salto de línea con una segunda directiva `Sitemap:`; `javascript:`, `data:`, `file:`, `ftp:`, `//evil`, sin esquema, vacío; y el sitemap completo con esa variable | Verde: solo sobrevive el origen; en producción, lo ilegible es `null`, nunca `localhost`; ninguna URL del sitemap refleja la contraseña, la ruta ni dobles diagonales |
| Producción sin `SITIO_URL` | Canónicas de las tres páginas nuevas y de la ficha, `og:images` y el bloque JSON-LD | Verde: sin canónicas, `images: []`, el bloque sin `url` y cero `localhost` **en tiempo de ejecución** (el que falla es el build → M1) |
| Imagen de la vista previa | Que `opengraph-image.tsx` no reciba `params`, `searchParams`, base ni `fetch` (no hay superficie donde inyectar un nombre hostil); y `fotoUrl` con 7 esquemas hostiles | Verde: el PNG es solo literales de marca; ninguna foto hostil sale como `og:image` |
| Costo por petición | Instrumenta el cliente Prisma y cuenta consultas por request | Verde, con los números de M4; además prueba que el sitemap **no tiene N+1** (2 consultas con 1 negocio y con 13) |

---

## 4. Lo que se auditó y quedó limpio

- **Entrada validada en el servidor:** el segmento de la raíz se valida contra `^[a-z0-9]+(?:-[a-z0-9]+)*$` con tope de 120 caracteres **antes** de tocar la base (`src/lib/seo/rutas.ts:41-63`), y a propósito sin normalizar (nada de dos URLs para la misma página). El `?colonia=` se resuelve contra el catálogo y se ignora si no está.
- **Inyección:** cero SQL crudo en todo `src/` (solo Prisma). El único `dangerouslySetInnerHTML` del repo es el bloque JSON-LD (`src/app/negocio/[ficha]/page.tsx:135`), que es el patrón que documenta la propia guía de Next, con cada `<` escapado a `<` y ahora con 12 cargas hostiles probadas encima.
- **Datos personales (LFPDPPP):** ningún dato real en el código, los seeds, los fixtures ni los logs nuevos; toda la siembra usa la serie ficticia y dominios `.example`. El JSON-LD no publica domicilio, teléfono, horario ni coordenadas; el sitemap no expone ni un campo de negocio fuera del nombre que ya está en la URL pública; `robots.txt` no anuncia ninguna ruta secreta (ni la de enlaces de gestión de E8, decisión correcta).
- **Autorización:** el panel no se tocó. `urlSitio` se mudó a `src/lib/sitio.ts` **sin cambiar comportamiento** (lo verifiqué línea por línea contra la versión anterior: `valor(env, X)` era literalmente `env[X] ?? ""`), y `admin/config.ts` la reexporta. `/admin` sigue excluido de `robots.txt` y ausente del sitemap; `esSegmentoReservado` impide que un slug lo tape.
- **Secretos:** ninguno hardcodeado en el código nuevo. `SITIO_URL` está documentada en `.env.example` (con su comportamiento en producción) y en el `README.md`.

---

## 5. Recomendación al validador

Pasa. Sugerido en este orden: **M1** antes del merge (es un scenario de la spec que no se cumple y que el reporte previo da por bueno); **M2** como decisión de producto explícita —dejarla escrita, cualquiera que sea— porque la spec dice "NO DEBE"; **M3** anotado como requisito de T-008; **M4** a la deuda de E5-5/E0-3, con el dato concreto de la doble lectura de catálogos por petición, que es la mitad del costo y se arregla con una memoización por request.

---

## 6. Iteración 2 — re-verificación sobre el código real

Se revisó la sección 6 de `b-dev.md` **contra el código**, no contra el relato, y se atacaron las correcciones. Mi suite pasa de 86 a **119 pruebas** (33 nuevas en la sección 9 del archivo), todas en verde.

**Nota sobre mi propia suite:** el dev editó `tests/seo-seguridad-adversarial.test.ts` en dos puntos. Los revisé uno por uno y **ninguna aserción de seguridad se debilitó**: (a) la comparación de la `description` del JSON-LD para dos cargas hostiles pasa a hacerse con espacios colapsados —consecuencia directa del saneo, y lo que la prueba vigila (que la carga viaje como dato, sin un `<` crudo, sin partir el bloque) se sigue exigiendo carácter por carácter sobre el serializado, sobre `name` y sobre `knowsAbout`, que no pasan por ningún saneo—; (b) el tope de consultas por petición hostil **se aprieta** de 8 a 3 y se suma el caso de memoria caliente (0 consultas). El segundo cambio es más estricto que el mío.

### M1 — corregido. Verificado por mí, desde cero, en los dos sentidos

`src/app/not-found.tsx` declara ahora su propia `metadata` con `openGraph: { images: imagenesDeMarca() }` (`src/lib/seo/metadata.ts:51-54`). El diagnóstico del dev sobre la causa raíz coincide con el mío: `/_not-found` es otro nivel raíz de metadata y no hereda las `images` del layout.

Corrí los dos builds borrando `.next` antes de cada uno:

```
rm -rf .next && npm run build
grep -rl "localhost" .next/server/app/            → sin resultados
grep -o '<meta property="og:image[^>]*>' .next/server/app/_not-found.html  → sin resultados

rm -rf .next && SITIO_URL=https://necesitouno.example npm run build
grep -rl "localhost" .next/server/app/            → sin resultados
_not-found.html → <meta property="og:image" content="https://necesitouno.example/opengraph-image"/>
```

Además **desapareció del build el aviso de Next** `⚠ metadataBase property in metadata export is not set … using "http://localhost:3000"`, que era el síntoma que nadie había leído. El scenario *"producción sin URL pública declarada"* de `layout-base` ahora se cumple de verdad. Automatizado por mi parte en el bloque "iteración 2 · M1 y O1" (los dos niveles raíz declaran imagen; `imagenesDeMarca` devuelve lista vacía en producción sin variable y con variable ilegible, y absoluta con variable válida).

*Detalle cosmético, ya anotado por el dev como deuda #4:* la 404 nombra la imagen sin la huella de caché (`/opengraph-image`) y el resto de las páginas con ella (`?b1821…`). Dos URLs para el mismo PNG; solo afecta al caché de los rastreadores.

### M2 — corregido en lo que importa. Residuo medido y documentado

`src/lib/seo/saneo.ts` aplica `ocultarNumerosDeContacto` en las tres superficies (`titulos.ts:107-109` para la meta descripción y `og:description`, que es el mismo valor; `datos-estructurados.ts:59-61` para el JSON-LD), y el cuerpo de la ficha conserva el texto completo. Lo verifiqué sobre una ficha renderizada de verdad, no solo sobre la función.

**Lo que sí cierra (12 formas reales de escribir un teléfono mexicano, todas ocultadas):** `771 000 0000`, `771-999-88-77`, `(771) 999 8877`, `+52 771 999 8877`, `771.999.8877`, `7719998877`, `771/999/8877`, `wa.me/527719998877`, `771 999 88 77 llámame`, dos números en la misma frase, `Cel: … / Fijo: …`, y con guion largo. Mi prueba no se conforma con "hay un `…`": exige que, quitando separadores, **no sobreviva ningún tramo de 7 dígitos**.

**Lo que NO cierra (R1, observación baja).** Medido, no supuesto:

| Entrada | Resultado |
| --- | --- |
| `７７１９９９８８７７` (ancho completo) | pasa entera |
| `٧٧١٩٩٩٨٨٧٧` (arábigo-índicos) | pasa entera |
| `7​7​1​9​9​9​8​8​7​7` (con ancho cero entre dígitos) | pasa entera |
| `771_999_8877` | pasa entera |
| `771,999,8877` · `7719,998877` | pasa entera (la coma se excluye a propósito, para no romper `$1,200`) |
| `771 999 ochenta y ocho 77` | pasa (parcial) |

`\d` sin bandera `u` es solo ASCII, así que todo dígito unicode se escapa; y el ancho cero no está en la clase de separadores, así que parte la secuencia. **Evalúo el residuo como aceptable** por el modelo de amenaza: las seis formas exigen que **el propio negocio ofusque su número a propósito** —y es su número, que ya está a un toque en el botón de WhatsApp de su ficha—; ninguna ocurre al escribir normal, que era el caso que M2 señalaba. El scraper masivo, que es lo que protege el hallazgo M5 de T-004, no gana nada: no hay números normales que cosechar.

**Recomendación barata (no bloquea):** normalizar antes de buscar —`texto.normalize("NFKC")` y quitar los caracteres de formato/ancho cero (`\p{Cf}`)— cierra ancho completo, arábigo-índicos y ancho cero de una vez, en dos líneas y sin tocar el resto. Queda como sugerencia, no como hallazgo.

**Costo del umbral conservador (R1b):** el saneo oculta también listas de cifras sueltas separadas por espacios. Medido: `Tallas 28 30 32 34 36` → `Tallas …`, y `2020-2024` → `…` (este último ya lo advertía el dev). Es decir, **una tienda de ropa o una ferretería que listen tallas o medidas pierden ese texto en el snippet de Google**. Es costo de contenido, no de seguridad, y la elección de errar hacia ocultar está bien argumentada; se documenta para que sea una decisión y no una sorpresa.

**Residuo aceptado con motivo (R2):** el **nombre** del negocio no se sanea, y va al `<title>`, a `og:title` y a `name` del JSON-LD. Un negocio llamado "Plomería 7719998877" publica su número en las tres. El dev lo anota y no lo corrige, con dos razones que comparto: el nombre es la identidad de la ficha (sanearlo rompería "Taquería 24/7" o "Farmacia 3 Hermanos") y, sobre todo, **el admin ve el nombre al aprobar**, que es un control humano real que el "¿Qué ofreces?" no tiene en la práctica. Mismo caso para O3 (el texto libre de colonia "Otra" en el título).

**ReDoS:** el patrón `\+?\d(?:[\s().\-+/·–—]*\d){6,}` tiene un cuantificador anidado, así que lo probé con cuatro entradas patológicas de hasta 100 000 caracteres (un dígito seguido de 50 000 espacios, 50 000 pares "1 ", 20 000 paréntesis, 30 000 "1-"): las cuatro resuelven en conjunto en menos de 2 s. Las clases de separador y de dígito son disjuntas, así que no hay ambigüedad que explotar. Sin hallazgo.

### M4 — corregido en la parte medible. Re-medido por mí

`obtenerCatalogosDeLaRaiz` memoriza con `VIGENCIA_CATALOGOS_MS = 30_000`. Confirmo los números del dev con mi propio instrumento (proxy que cuenta llamadas a Prisma): slug hostil bien formado **6 → 3 en frío y 0 en caliente**. La justificación de no usar `React.cache` es correcta: no memoriza fuera de un render de React, así que no serviría a `sitemap.xml` ni sería observable en la suite.

Lo que verifiqué de la memoria, que es donde estaría el peligro de cualquier caché en este proyecto:

- **Los negocios no se memorizan, y lo probé por el camino que importa:** con la memoria **caliente**, se rechaza el negocio publicado directamente en la base y en la petición siguiente desaparece de `/cerrajeria`, la página pasa a su estado vacío, la metadata pasa a `noindex`, el sitemap deja de publicar `/cerrajeria`, `/cerrajeria-huicalco` y su ficha, y no aparece ni su id ni su motivo de rechazo. Al restaurarlo, reaparece de inmediato. También al revés: un negocio publicado nuevo aparece en la página y en el sitemap sin esperar nada.
- **Lo único que la vigencia puede retrasar es un catálogo, y el retraso es inofensivo en las dos direcciones:** un giro recién sembrado responde 404 hasta que caduque (nunca datos de más), y un giro **borrado** del catálogo mientras la memoria lo recuerda responde su página vacía sin filtrar un solo dato de nadie (lo probé creando y borrando un giro con la memoria caliente).
- **La memoria no puede crecer hacia los negocios sin que una prueba lo grite:** el único estado mutable de alcance de módulo de `src/lib/directorio.ts` es `catalogosEnMemoria`, y hay una prueba que falla si aparece otro `let`.
- Una lectura fallida no se queda guardada 30 s (`lectura.catch` la limpia): un corte de base no congela un error durante medio minuto.

**R3, observación baja:** la memoria entrega **la misma referencia** de los tres arreglos a todas las peticiones del proceso. Hoy ningún consumidor los muta (solo `.find`), pero un futuro `catalogos.giros.sort(...)` dentro de una página corrompería el catálogo de **todas** las peticiones siguientes hasta que caduque. Congelar la lectura (`Object.freeze` de los arreglos) lo vuelve imposible por una línea.

La parte de M4 que **sigue abierta y es correcta que siga abierta**: `/sitemap.xml` y la raíz no tienen límite de tasa, y el sitemap le entrega a un scraper el índice completo de fichas. La spec lo pide así y declara la defensa como deuda de E5-5/E0-3.

### O1 — corregido

`SEGMENTOS_RESERVADOS` suma `robots.txt`, `sitemap.xml`, `opengraph-image` y `favicon.ico`, y el guardián de `tests/directorio-consultas.test.ts` ahora recorre **archivos además de carpetas**, con una lista explícita de los que no publican ruta y un mapa archivo→segmento. Un archivo de convención nuevo rompe la prueba hasta que alguien decida qué reserva. Verificado por mi parte, más la comprobación de que ningún slug de los 78 del catálogo real choca con la lista ampliada.

### M3 — abierto, delegado a T-008 (aprobado por el orquestador)

No se toca en este change. La razón de merge es sólida: T-008 valida el campo en el punto de escritura y dos ramas vivas sobre `fotoUrl` producirían un conflicto peor que el hallazgo. Sigue sin explotación viva (el registro público ignora el campo, el panel no lo escribe, y ningún esquema hostil sale como `og:image`). **Para quien mergee:** si T-009 entra primero, la lista blanca de dominio es requisito de T-008 y tiene dos consumidores que ya la dan por hecha, `imagenesDeLaFicha` y `imagenAbsoluta`; si T-008 entra primero, hay que revisar que su validación cubra los dos.

### Observaciones previas no atendidas

**O2** (los chips de giro copian el literal de `claseFiltro`) queda con motivo razonable —cambiar marcado ya revisado por un beneficio de mantenimiento— y con la propuesta anotada para el primer restyle. **O3** se resuelve junto con la decisión de producto de R2.

### Estado final de los hallazgos

| # | Estado |
| --- | --- |
| M1 | ✅ Corregido y re-verificado desde cero en los dos sentidos del build |
| M2 | ✅ Corregido en las tres superficies; residuo R1/R1b/R2 medido y aceptado |
| M3 | 🟡 Abierto por decisión de merge, delegado a T-008, sin explotación viva |
| M4 | ✅ Corregido en el costo (6→3 en frío, 0 en caliente) y verificado que la memoria no alcanza a los negocios; el límite de tasa sigue siendo deuda de E5-5 |
| O1 | ✅ Corregido, guardián incluido |
| O2, O3 | Anotadas con motivo |
| R1, R1b, R2, R3 | Nuevas, severidad baja, ninguna bloquea |

**Hallazgos restantes: 0 críticos · 0 altos · 1 medio abierto y delegado.** **Veredicto: PASA al validador.**
