# Reporte dev — agregar-listado-gestion-panel (T-018)

Etapa B. Entra la consulta real del listado, se retira el mock de la etapa A y
se escriben las suites que amarran cada scenario del delta de `revision-admin`.
Base propia del worktree: `npx prisma dev --name t018` (puerto 51226), su
`DATABASE_URL` en el `.env` gitignored — no se tocó la base compartida.

## Tareas completadas

| # | Estado | Dónde quedó |
|---|--------|-------------|
| 1 | ✅ | `tests/admin-textos.test.ts` — 12 literales + 4 funciones de texto |
| 2 | ✅ | `tests/admin-listado-parametros.test.ts` — 41 casos |
| 3 | ✅ | `obtenerListadoDeNegocios` en `src/lib/admin/consultas.ts` |
| 4 | ✅ | Prueba de volumen con 200 filas y cliente espía |
| 5–7 | ✅ | Componentes de la etapa A, ya con sus pruebas (+ `fueraDeRango`) |
| 8 | ✅ | `src/app/admin/negocios/page.tsx` con la consulta real; mock borrado |
| 9 | ✅ | Enlace de la cola probado, y probado que la cola no cambió |
| 10 | ✅ | `tests/admin-adversarial.test.ts`, describe nuevo (7 casos, 12 querystrings hostiles) |
| 11 | ✅ | `tests/analitica-exclusion-admin.test.ts` y `tests/admin-paginas.test.ts` |
| 12 | ✅ | Suite de no fuga (log + querystring) dentro del describe adversarial |
| 13 | ⚠️ parcial | Automatizable hecho; **falta la revisión con ojos humanos** (abajo) |
| 14 | ✅ | Literales carácter por carácter; fixtures 100% ficticias `771999xxxx` |

## Mapa scenario → prueba

Delta `revision-admin` del change. `LP` = `tests/admin-listado-paginas.test.ts`,
`LC` = `tests/admin-listado-consultas.test.ts`,
`PAR` = `tests/admin-listado-parametros.test.ts`,
`ADV` = `tests/admin-adversarial.test.ts`,
`TXT` = `tests/admin-textos.test.ts`.

### Vista "Todos los negocios"

| Scenario | Prueba |
|---|---|
| llegar a una ficha publicada sin adivinar la URL | LP "muestra nombre, colonia, fecha completa, estado y la entrada al detalle" + LP "trae los cuatro casos…" (comprueba `/admin/registros/<id>`) |
| la lista trae los cuatro casos | LC "los cuatro casos aparecen, y el despublicado viene marcado" + LP "trae los cuatro casos con su estado escrito y la etiqueta de la despublicada" |
| lo más reciente arriba | LC "ordena por la fecha de registro, de la más reciente a la más antigua" |
| la lista no ofrece acciones | LP "no ofrece ninguna acción: ni formularios ni botones" + LP "no trae ningún formulario ni botón de acción" (renglón) |
| base sin negocios | LC "con la base vacía devuelve cero renglones y cero total" + LP "con la base vacía muestra el texto de todavía no hay negocios" |
| el conteo dice cuántos hay | LP "el conteo del encabezado dice cuántos trae el filtro" (34) + TXT "el conteo concuerda en singular y en plural" |
| orden estable entre fechas iguales (texto del requirement) | LC "dos registros con la misma fecha salen siempre en el mismo orden" + LC "con la misma fecha, nadie se repite ni se pierde al pasar de página" |

### El listado se filtra por estado

| Scenario | Prueba |
|---|---|
| ver solo lo publicado | LP "filtrar por publicados deja solo esos y cuenta solo esos" + LC "el filtro %s trae %i registros…" |
| cambiar de filtro regresa a la primera página | LP "los cuatro enlaces van siempre a la primera página" |
| un filtro sin resultados | LP "un filtro sin resultados avisa y deja los demás filtros a la vista" + LC "un filtro sin registros devuelve lista vacía y total cero" |
| filtro inventado en la URL | PAR (12 entradas raras) + LP "un estado %s se ve igual que 'Todos', sin error" (4) + ADV (12 querystrings hostiles) |
| la URL del listado no lleva datos personales | PAR "ninguna URL del listado admite otro parámetro que estado y pagina" + LP "ninguna URL de la pantalla lleva más que estado y pagina" + ADV "ninguna URL que pinta el listado lleva un identificador ni un dato personal" |

### El listado se corta en páginas

| Scenario | Prueba |
|---|---|
| la lista larga se corta | LP "con 60 registros muestra 25, dice 'Página 1 de 3'…" + LC "pide 25 filas a la base y 25 filas es lo que la base devuelve" |
| moverse entre páginas conservando el filtro | LP "la segunda página de un filtro es la de ese filtro, y se regresa" + LP "los dos enlaces conservan el filtro puesto" |
| el HTML no crece con la base | LP "con 30 y con 500 registros el HTML pesa prácticamente lo mismo" + LC "la página 3 son las filas 51 a 75 del mismo orden, pedidas con skip" |
| una sola página | LP "con 10 registros no hay ningún control de paginación" |
| página inventada en la URL | PAR (19 entradas raras) + LP "una página %s se ve como la primera" (6) |
| página más allá de la última | LP "la página 99 de una lista de 3 se ve vacía…" + LP "una página astronómica tampoco produce un error del servidor" + LC "una página más allá de la última devuelve vacío…" |

### La cola enlaza al listado

| Scenario | Prueba |
|---|---|
| entrar al listado desde la cola | LP "la cola ofrece 'Ver todos los negocios' hacia el listado sin filtro" |
| la cola no cambia | LP "la cola sigue mostrando sus pendientes del más antiguo al más reciente" + las suites de la cola de siempre (`admin-consultas`, `admin-paginas`), intactas y en verde |
| regresar a la cola | LP "ofrece la vuelta a la cola" |

### Herencia del acceso y mínima exposición

| Scenario | Prueba |
|---|---|
| listado sin sesión | LP "%s manda al acceso sin traer un solo dato" (3) + ADV "sin cookie %s manda al acceso, indistinguible de una base vacía" |
| listado con el panel sin configurar | LP "sin %s configurada no se abre" (contraseña y secreto) |
| el listado no se indexa ni se enlaza | LP "declara noindex, nofollow" + `admin-paginas` (lista de metadata del panel) + `analitica-exclusion-admin` (meta de referente, sin script) + `layout.test.ts` (ninguna página pública menciona `/admin`) |
| el listado no pinta más datos de los necesarios | LC "cada renglón trae exactamente seis campos…" + LP "no pinta WhatsApp, teléfono, dirección, foto ni motivos" + ADV "el HTML del listado no trae ningún dato personal de más" |
| nada se escribe desde el listado | ADV "ninguna petición contra el listado cambia un solo dato" |
| nada de lo que muestra va al log | ADV "cargar el listado no escribe un solo dato en el log" |

### Mobile-first y sin JavaScript (requirement MODIFIED)

| Scenario | Prueba |
|---|---|
| el listado también se opera en el celular | LP "con nombres largos y colonia libre larga, nada impide el colapso" + LP "cada control tocable del listado mide al menos 44px" — **el visto bueno visual sigue pendiente** |
| el listado se filtra y se pagina sin JavaScript | LP "filtrar y paginar son enlaces, no controles con JavaScript" |
| sin JS de cliente propio | LP "ni la pantalla ni sus componentes declaran 'use client'" + `analitica-exclusion-admin` (ningún `<script src>` en la pantalla nueva) |

### Verificación a mano (servidor de verdad)

Lo anterior corre con `next/headers` simulado. Para no fiarme solo de eso,
levanté `next dev` contra la base t018 con 60 negocios ficticios y una cookie
de sesión firmada a mano, y comprobé por HTTP:

```
GET /admin/negocios?estado=publicado&pagina=2   (sin cookie)  → 307 a /admin
GET /admin/negocios                             → "60 negocios en esta lista", "Página 1 de 3", 25 renglones, "Ver más antiguos"
GET /admin/negocios?pagina=2                    → "Página 2 de 3", 25 renglones, los dos enlaces
GET /admin/negocios?pagina=3                    → "Página 3 de 3", 22 renglones, solo "Ver más nuevos"
GET /admin/negocios?estado=publicado            → solo publicados, sin controles de paginación
GET /admin/negocios?estado=rechazado            → "0 negocios en esta lista" + "No hay negocios con ese estado."
GET /admin/negocios (base vacía)                → "Todavía no hay negocios registrados."
GET /admin/negocios?estado=xyz&pagina=-3        → 200, igual que "Todos" página 1
GET /admin/negocios?pagina=99                   → 200, sin renglones, "Ver más nuevos"
GET /admin/negocios?pagina=999999999999999999999 → 200, sin renglones
GET /admin/cola                                 → "Ver todos los negocios" hacia /admin/negocios
```

## Decisiones técnicas

1. **`skip`/`take` + `count`, dos consultas.** El total del filtro se le pide a
   la base con `count({ where })` y la página con `findMany({ skip, take })`.
   Secuenciales, no en `Promise.all`: el servidor local (PGlite) multiplexa
   todas las conexiones sobre una sola sesión y dos consultas de verdad
   simultáneas se pisan el protocolo (está documentado en `tests/db.ts`); dos
   viajes seguidos no le cuestan nada a esta pantalla.
2. **`ClientePanel` ahora incluye `count`.** Es el tipo estructural mínimo del
   panel; nadie más lo construye a mano, así que agregarlo no rompió a ningún
   llamador y permitió probar con un cliente espía.
3. **La prueba de volumen muerde de verdad.** `clienteEspia` envuelve
   `negocio.findMany` y anota los argumentos y **cuántas filas devolvió la
   base**: si alguien cambiara el `skip`/`take` por un `slice` en memoria, la
   base traería 200 filas y la prueba se pondría roja. Sin eso, "25 renglones"
   pasaría igual con la tabla entera en memoria.
4. **Cota `PAGINA_MAXIMA = 1_000_000` en `normalizarPagina`.** Un
   `?pagina=999999999999999999999` sí se puede interpretar (no es basura), así
   que no cae en la primera página: cae en la cota. Sin cota,
   `skip = (pagina - 1) * 25` se sale del entero de 32 bits que PostgreSQL
   acepta como OFFSET y la pantalla respondía con un error del servidor —
   justo lo que el requirement prohíbe para una página más allá de la última.
   Es el único cambio que le hice a la implementación candidata de la etapa A.
5. **`fueraDeRango` en la paginación (cambio sobre la etapa A).** Con la página
   99 de una lista de 3, `PaginacionListadoNegocios` no dice "Página 3 de 3"
   —sería mentira con la pantalla sin renglones— y solo pinta "Ver más nuevos"
   hacia la última página que sí tiene contenido. La pantalla lo pinta aunque
   la lista sea de una sola página, que es la única excepción a "con una sola
   página no hay controles".
6. **Los dos textos de vacío hablan de la LISTA, no de la página** (miran
   `total`, no `registros.length`): base vacía → "Todavía no hay negocios
   registrados."; filtro sin resultados → "No hay negocios con ese estado.".
   Una página más allá de la última no es ninguno de los dos casos —la lista sí
   tiene registros— así que ahí no se pinta ninguno: lo que explica esa
   pantalla y da la salida es el "Ver más nuevos". No inventé un tercer literal
   porque el copy no está en el delta y necesitaría visto bueno.
7. **`textoDeColonia` y `vieneDeDespublicacion` extraídos** en `consultas.ts`:
   la cola y el listado tienen que decir lo mismo del mismo registro, y ahora
   lo dicen desde una sola función. `obtenerColaDeRevision` no cambió de
   comportamiento (sus pruebas de siempre siguen en verde).
8. **Cero dependencias nuevas.**

## Puertas

- `npm run lint` — verde.
- `npx tsc --noEmit` — verde.
- `npm run build` — verde (`/admin/negocios` sale como ruta dinámica `ƒ`).
- `npm test` — **2820 pruebas en verde, 2 rojas que no son de este change**:
  `tests/reportes-seguridad-adversarial.test.ts` → "[A1] de 14 simultáneos…" y
  "[A2] de 8 simultáneos…". Evidencia de que son de ambiente y no una
  regresión mía:
  1. corrí la suite completa **antes de tocar una sola línea** (base t018 recién
     creada, árbol tal como lo dejó la etapa A) y esas mismas dos fallaron;
  2. reproduje el escenario de [A2] aislado en un archivo temporal (8 envíos
     simultáneos, misma IP): da exactamente 3 confirmaciones, 5 `error=cupo` y
     3 filas — la lógica del producto está bien;
  3. lo que fallan son **carreras de verdad contra la base**, y `npx prisma dev`
     es PGlite: multiplexa todas las conexiones sobre una sola sesión de
     PostgreSQL (lo documenta `tests/db.ts`), así que 28 transacciones
     simultáneas del caso [A1] dejan el ambiente tocado para el [A2] que sigue.
     Con `connection_limit=1` en la URL, una de las dos se pone en verde.
  El CI corre contra `postgres:17` de verdad (una sesión por conexión), que es
  donde ese requirement se comprueba en serio. **Lo dejo señalado para el
  validador**, no lo apagué ni lo toqué.

## Deuda y propuestas fuera de alcance

1. **Revisión visual pendiente (tasks.md #13).** Falta ver el listado con ojos
   humanos a 390/768/1280px y medir contraste AA. Lo que sí quedó amarrado por
   prueba: ninguna clase que impida el colapso en el HTML servido, `min-h-11`
   en cada control, `break-words` con nombre y colonia larguísimos, y la
   pantalla servida por HTTP en sus seis estados. Anotado para el PR.
2. **Las dos carreras rojas de `reportes-seguridad-adversarial`** (arriba). Si
   el fundador quiere que la suite local sea verde sin CI, la vía es que esas
   dos pruebas exijan un Postgres de verdad (o que la base local se levante con
   `connection_limit=1`); las dos son decisiones de proceso, no de este change.
3. **Filtro propio de "Despublicadas"**: la spec lo deja fuera a propósito
   (design.md §1) y no lo construí. Si se quiere, la vía barata sigue siendo la
   que describe el design.
4. **Orden por otra columna** (por ejemplo "las más viejas sin resolver
   primero"): fuera de la spec, no se construyó.
5. **`textoFechaDeRegistro` usa la zona horaria del servidor.** En Vercel eso
   es UTC, así que una ficha registrada a las 19:00 del día 3 hora de Tizayuca
   se leería "4 de septiembre". No lo cambié porque ningún requirement lo pide
   y el resto del panel (`FORMATO_FECHA` del detalle) tiene el mismo
   comportamiento: si se arregla, hay que arreglarlo para todo el panel de una
   vez, con su propio ticket.
6. **`PAGINA_MAXIMA` es un número redondo, no medido**: un millón de páginas
   son 25 millones de fichas. Si algún día importara el costo del OFFSET, la
   spec habla de páginas y enlaces, no del mecanismo, así que se puede cambiar
   a paginación por cursor sin tocarla (design.md §3).

## Notas para el validador

- La base de este worktree es propia: `npx prisma dev --name t018`, puerto
  51226, `DATABASE_URL` en el `.env` (gitignored, con `PANEL_CONTRASENA` y
  `PANEL_SESION_SECRETO` de mentiras para poder levantar `next dev`). Sigue
  corriendo; se detiene con `npx prisma dev stop t018`.
- `src/lib/mock/agregar-listado-gestion-panel.ts` **está borrado** y con él la
  carpeta `src/lib/mock/`. Ningún archivo del árbol la importa.
- Archivos existentes que toqué, todos para sumar la pantalla nueva a un
  guardián que ya existía: `tests/admin-textos.test.ts`,
  `tests/admin-paginas.test.ts`, `tests/analitica-exclusion-admin.test.ts`
  (el mínimo de páginas del panel sube de 6 a 7) y
  `tests/admin-adversarial.test.ts` (`obtenerListadoDeNegocios(` entra a la
  lista de accesos a datos que la guarda tiene que preceder).
- Todas las fixtures nuevas usan la serie ficticia `771999xxxx` y nombres
  inventados.
