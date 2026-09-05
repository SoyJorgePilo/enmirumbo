# Reporte seguridad-test — agregar-listado-gestion-panel (T-018)

Etapa C. Auditoría del diff completo del change contra la spec de
`revision-admin`, y suite adversarial nueva con lo que el camino feliz no
cubre. Base propia del worktree (`t018`, puerto 51226); no se tocó git ni la
base compartida.

**Dictamen: LIMPIO.** Ningún hallazgo crítico, alto ni medio. Pasa al
validador con tres observaciones de severidad baja (ninguna bloquea) y una
constancia sobre las dos pruebas rojas heredadas.

## Alcance auditado

Diff real del change (contra la base de la rama, `b909899`, no contra `main`,
que ya avanzó por su cuenta):

- Nuevo: `src/app/admin/negocios/page.tsx`,
  `src/lib/admin/listado-parametros.ts`,
  `src/components/admin/{renglon,filtros,paginacion}-listado-negocios.tsx`.
- Modificado: `src/lib/admin/consultas.ts` (tipos + `obtenerListadoDeNegocios`
  + extracción de `textoDeColonia`/`vieneDeDespublicacion`),
  `src/lib/admin/textos.ts` (literales y cuatro funciones de texto),
  `src/app/admin/cola/page.tsx` (un enlace).
- Pruebas: las cuatro suites del dev + los guardianes del panel que suben de 6
  a 7 pantallas.

## Hallazgos por severidad

### Críticos: 0

### Altos: 0

### Medios: 0

Lo que se buscó y **no** apareció, con la evidencia de por qué se descarta:

| Superficie | Verificación |
|---|---|
| Sesión antes de cualquier consulta | `src/app/admin/negocios/page.tsx:51` llama `requerirSesionAdmin()` antes de `await searchParams` y de la consulta. Comprobado **en ejecución** (no por lectura del código): con el cliente Prisma de la pantalla instrumentado, sin cookie / con cookie de otro secreto / caducada / con el panel sin configurar, la base recibe **cero** llamadas. |
| Ruta de acceso sin sesión | No hay ninguna: `/admin/negocios` es la única ruta nueva, gana sobre `src/app/admin/[...resto]/page.tsx` (que responde 404 sin leer nada) y no existe API, Route Handler ni Server Action asociados. `npm run build` la reporta como dinámica (`ƒ`), así que no hay HTML prerenderizado con datos. |
| Herencia de cabeceras / noindex / referente | `metadata.robots = { index: false, follow: false }` en `page.tsx:24-27`; el `referrer: "strict-origin"` del layout del panel se hereda al no redefinirse (fijado por `tests/analitica-exclusion-admin.test.ts`, que ya incluye la pantalla nueva). `robots.txt` bloquea `/admin` por prefijo, así que cubre `/admin/negocios`. Ninguna página pública menciona la ruta. |
| Fuga de datos personales | El `select` de `consultas.ts:338-346` es lista blanca de 7 campos. Probado que **la base ni siquiera devuelve** WhatsApp, teléfono, dirección, foto, motivos, horario, Facebook, coordenadas ni las constancias del aviso (se inspeccionan los argumentos reales de `findMany`), en todos los filtros, en la página fuera de rango y con la ficha con todo capturado. `despublicadoEn` entra y sale convertido en booleano. |
| Inyección | Cero SQL crudo (`$queryRaw`/`$executeRaw` no aparecen en ningún archivo del change); el `where` que llega a Prisma solo puede ser `{}` o `{ estado: <uno de los tres del modelo> }`, comprobado con el cliente instrumentado para valores inventados, con comilla, con operador de Prisma en texto, con byte nulo y en mayúsculas. |
| XSS | Ningún `dangerouslySetInnerHTML` en el código nuevo. Con una ficha guardada con `<script>alert(...)</script>` de nombre y `"><img src=x onerror=…>` de colonia, el HTML sale escapado y **ninguna etiqueta** del documento estrena un manejador `on*`. Un identificador hostil metido a mano en el renglón no rompe el atributo `href`. |
| Eco del querystring | Nada de lo que se teclea vuelve al navegador: la respuesta con un parámetro hostil es **byte a byte idéntica** a la respuesta sin parámetro (incluido un parámetro de 100 KB, que no engorda la respuesta ni 100 bytes). |
| Escritura desde la vista | El cliente que recibe la pantalla tiene minadas `create/createMany/update/updateMany/delete/deleteMany/upsert`: cargarla con cualquier querystring hace exactamente `count` + `findMany` y nada más. |
| Secretos / entorno | El código nuevo no lee ni una variable de entorno; no hay variables nuevas, así que `.env.example` no tenía que cambiar. Ningún secreto hardcodeado. |
| LFPDPPP en el repo | Todas las fixtures (las del dev y las mías) son inventadas, serie ficticia `771999xxxx`. Nada de lo que muestra el listado se escribe en el log (probado con las cinco funciones de `console` espiadas). |
| Abuso / flooding | La superficie está detrás de la sesión firmada del panel: no hay formulario público nuevo ni endpoint anónimo que proteger. No se implementó nada al respecto (no lo pide la spec). |

## Scenarios sin prueba: ninguno

Se recorrieron los cinco requirements ADDED y el MODIFIED del delta contra el
mapa scenario→prueba del reporte del dev. Los 29 scenarios (6 de la vista, 5
del filtro, 6 de la paginación, 3 de la cola, 5 de la herencia del acceso y 4
del requirement MODIFIED) tienen prueba, y las que se citan existen y son
verdes (197 pruebas en las cuatro suites del change). El único pendiente real sigue siendo el que el
propio dev marcó: **la revisión visual con ojos humanos** (tasks.md #13,
390/768/1280px y contraste AA), que no es automatizable y queda para el PR.

## Tests adversariales añadidos

`tests/admin-listado-seguridad-adversarial.test.ts` — **82 pruebas, todas en
verde**. Lo que aporta sobre las suites de la etapa B:

1. **La guarda, comprobada en ejecución (8 pruebas).** El módulo
   `src/lib/prisma` queda simulado por un cliente que anota cada llamada y que
   revienta ante cualquier escritura. Sin sesión —con querystring limpio,
   manoseado o astronómico—, con cookie firmada con otro secreto, con cookie
   caducada de firma buena, y con el panel sin contraseña o sin secreto: la
   base recibe cero llamadas. La etapa B amarraba esto leyendo el orden de las
   líneas del archivo; esto lo amarra donde se rompería de verdad.
2. **Qué le pide la pantalla a la base (9 pruebas).** El `select` como lista
   blanca exacta; solo `count` + `findMany` por carga; `take = 25` y un `skip`
   entero, no negativo y por debajo de 2³¹−1 para todo querystring hostil; el
   `where` solo vacío o con uno de los tres estados del modelo.
3. **Codificaciones que no son ASCII (23 pruebas).** Páginas con dígitos de
   ancho completo, árabes orientales o devanagari (que `Number()` **sí** sabe
   leer: sin la validación por expresión regular ASCII, `"２"` sería una página
   válida), superíndices, espacio duro, byte nulo, salto de línea, separador
   de miles de JS, binario, signo menos unicode, marca de orden de bytes y
   override de derecha a izquierda. Estados con `о` cirílica, ancho completo,
   byte nulo, tabulador, porcentaje sin decodificar, acento y dos valores en
   uno. Todos caen en el valor por defecto y la respuesta es idéntica a la de
   la URL limpia.
4. **Tipos que el runtime podría entregar (25 pruebas).** `null`, número,
   booleano, objeto vacío, **operador de Prisma** (`{ not: "publicado" }`,
   `{ estado: { gt: "" } }`), arreglo de arreglos, objeto con `toString`,
   objeto sin prototipo, envoltorio `String`, función y fecha: ninguno lanza,
   ninguno filtra y ninguno llega a la base como objeto.
5. **Contenido hostil ya guardado (5 pruebas).** XSS almacenado en nombre y
   colonia, `javascript:` en el nombre, identificador hostil en el atributo,
   nombre de 5.000 caracteres, y la guardia de `dangerouslySetInnerHTML` /
   SQL crudo sobre los seis archivos del change.
6. **Que nada se cuele entre filtros ni entre páginas (5 pruebas).**
   Aislamiento de los tres estados; el filtro se conserva en la salida de una
   página fuera de rango; y el recorrido completo de tres páginas con **60
   fichas de fecha idéntica** (el peor caso del desempate) sin repetir ni
   perder ninguna.
7. **Volumen (2 pruebas).** La cota `PAGINA_MAXIMA` manda a la base un
   `skip` de 24.999.975 —dentro del entero de 32 bits— y responde vacía, con
   la salida de regreso y con menos HTML que la primera página.

## Observaciones (severidad baja, no bloquean)

1. **`obtenerListadoDeNegocios` confía en que `pagina ≥ 1`**
   (`src/lib/admin/consultas.ts:336`): el `skip` se calcula sin cota propia.
   Hoy es inalcanzable —el único llamador normaliza en el borde y hay pruebas
   que lo fijan—, pero es la clase de invariante que se pierde cuando aparece
   el segundo llamador (el buscador del panel, deuda E3-8). Un `Math.max(0, …)`
   dentro de la función lo cerraría sin cambiar nada más.
2. **`Negocio` no tiene índice en `estado` ni en `registradoEn`**
   (`prisma/schema.prisma`): el `count` filtrado y el `ORDER BY registradoEn
   DESC` con OFFSET son recorrido y orden completos de la tabla. A la escala
   del proyecto (miles de fichas en el mejor caso) es irrelevante y el
   requirement de "no se degrada" se cumple por donde importa —el HTML no
   crece con la base—, pero conviene que quede escrito: si algún día el
   listado se siente lento, el índice es más barato que la paginación por
   cursor que propone `design.md §3`.
3. **La página más allá de la última no pinta ningún texto**, solo el enlace
   de regreso. El requirement dice literalmente "mostrando el texto de lista
   vacía y el enlace 'Ver más nuevos'", y el dev decidió (reporte B, decisión
   6) que los dos literales existentes hablan de la LISTA y no de la página, y
   que inventar un tercero necesita visto bueno de copy. Coincido con el
   criterio —el otro camino es decirle "Todavía no hay negocios registrados." a
   quien tiene 60— pero es una lectura del literal que le toca confirmar al
   humano en el PR, no al validador.

## Las dos pruebas rojas heredadas: confirmadas como baseline

`tests/reportes-seguridad-adversarial.test.ts` → `[A1]` y `[A2]`. Son
preexistentes y ajenas al change:

- El diff real del change (contra `b909899`) **no toca** ese archivo de
  pruebas ni nada del camino de reportes: solo `consultas.ts` (aditivo),
  `textos.ts`, `cola/page.tsx` y los archivos nuevos del listado.
- Fallan también **corriendo el archivo solo** y **cada prueba aislada**
  (`vitest -t "A1"` / `-t "A2"`), así que no es contaminación de orden ni de
  esquema causada por las suites nuevas.
- Son carreras reales contra la base y el motor local (`npx prisma dev` =
  PGlite) multiplexa todas las conexiones sobre una sola sesión, como
  documenta `tests/db.ts`. El CI corre contra `postgres:17`, que es donde ese
  requirement se comprueba en serio.

No se taparon, no se marcaron como omitidas y no se tocó ese archivo.

## Puertas

- `npm run lint` — verde.
- `npx tsc --noEmit` — verde.
- `npm run build` — verde; `/admin/negocios` sale como ruta dinámica (`ƒ`).
- `npm test` — **2.902 verdes, 2 skipped, 2 rojas** (las `[A1]`/`[A2]` de
  arriba, heredadas). Las 82 pruebas nuevas entran en verde.

## Nota para el validador

- Único archivo que agregué: `tests/admin-listado-seguridad-adversarial.test.ts`.
  No toqué código de producción ni ninguna prueba ajena (los defectos se
  reportan, no se arreglan en esta etapa — y esta vez no hubo ninguno que
  reportar).
- Ese archivo simula `../src/lib/prisma` para instrumentar el cliente que
  recibe la pantalla. La simulación es local al archivo y abre **una sola**
  conexión (la misma que siembra y limpia), por el límite de conexiones del
  motor local.
- La base `t018` (puerto 51226) sigue levantada.
