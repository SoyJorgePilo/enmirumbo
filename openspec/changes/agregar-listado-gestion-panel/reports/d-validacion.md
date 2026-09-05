# Reporte validador — agregar-listado-gestion-panel (T-018)

Etapa D. Validación independiente del árbol completo del change: no me apoyo
en los reportes de las etapas A, B y C, los uso como hipótesis y los verifico.

**Veredicto: APROBADO.** 0 bloqueantes. 6 observaciones de severidad baja, todas
trasladadas al PR para el humano; ninguna cambia el comportamiento entregado.

## Compuertas, corridas por mí en el worktree `wt-t018` (base propia `t018`, puerto 51226)

| Puerta | Resultado |
|---|---|
| `npm run lint` | verde, sin salida |
| `npx tsc --noEmit` | verde |
| `npm run build` | verde; `/admin/negocios` sale como ruta dinámica (`ƒ`), 29 rutas |
| `npm test` | **2 902 verdes, 2 skipped, 2 rojas** — únicamente `[A1]` y `[A2]` de `tests/reportes-seguridad-adversarial.test.ts` |

Las dos rojas están confirmadas como **preexistentes por mí, no por reporte**:
guardé todo el change en un `stash -u`, dejé el árbol tal cual `b909899` (sin
una sola línea de T-018) y corrí `tests/reportes-seguridad-adversarial.test.ts`
sola: falla igual. Son carreras reales contra la base y el motor local
(`prisma dev` = PGlite, una sesión compartida para todas las conexiones); el CI
las corre contra `postgres:17`, que es donde ese requirement se comprueba.
**Ninguna otra prueba del repo está roja.** El CI de GitHub Actions tiene que
quedar en verde en el PR: mi corrida local no lo sustituye.

## Verificación contra un servidor de verdad (no solo `render` de pruebas)

Levanté `next start` (build de producción) contra la base `t018` con los 12
negocios ficticios del seed demo y una cookie de sesión firmada con el secreto
local, y comprobé por HTTP:

- `GET /admin/negocios?estado=publicado&pagina=2` **sin cookie** → 307 a
  `/admin`; en el cuerpo, cero nombres, cero colonias, cero conteos, cero ids.
- `GET /admin/negocios` con sesión → 200, "Todos los negocios", "12 negocios en
  esta lista", "Filtrar por estado", 12 renglones con "Ver detalle", "Volver a
  la cola"; **ni un `<form>`, ni un `<button>`, ni `771999…`, ni `wa.me`, ni
  `tel:`**; `<meta name="robots" content="noindex, nofollow">`; sin `umami` ni
  `data-website-id`.
- `?estado=xyz&pagina=-3` → 200, misma pantalla que "Todos" página 1.
- `?pagina=99` → 200, sin renglones, con "Ver más nuevos" y sin "Página X de Y".
- `?estado=rechazado` → 200, "1 negocio en esta lista", filtro activo con
  `aria-current`, y los cuatro enlaces de filtro siguen a la vista.
- `?estado=publicado` → los cuatro `href` del filtro apuntan a la página 1
  (`/admin/negocios`, `?estado=en_revision`, `?estado=publicado`,
  `?estado=rechazado`): cambiar de filtro no arrastra la página.
- `GET /admin/cola` → `href="/admin/negocios"` con "Ver todos los negocios", y
  "Registros por revisar" intacto.
- **XSS por querystring**: `?estado=</script><img src=x onerror=alert(1)>` y
  `?pagina="><svg onload=alert(1)>` → 200 y las tres apariciones del payload
  salen escapadas (`<`, porcentaje-codificadas) dentro de la carga RSC; no
  hay ruptura de `<script>` ni ningún manejador `on*` nuevo en el documento.

## Muestreo profundo de la spec (scenario por scenario)

Recorrí los 5 requirements ADDED y el MODIFIED (29 scenarios). Los cubiertos
por prueba los verifiqué **leyendo las pruebas citadas**, no la tabla del
reporte del dev. Muestras que abrí entero:

- *"la lista no ofrece acciones"* — `tests/admin-listado-paginas.test.ts:484`
  exige que el HTML no traiga `<form`, `<button` ni las palabras Aprobar,
  Rechazar, Despublicar, Borrar, atendido. Confirmado además por HTTP.
- *"el listado no pinta más datos de los necesarios"* — la prueba siembra una
  ficha con WhatsApp, fijo, dirección, foto y los dos motivos, y exige que
  ninguno aparezca (`:502`). El `select` de `consultas.ts` es lista blanca de 7
  campos y `despublicadoEn` sale convertido en booleano.
- *"el HTML no crece con la base"* + tarea 4 — `tests/admin-listado-consultas.
  test.ts` envuelve `findMany` con un cliente espía que anota **cuántas filas
  devolvió la base**: con 200 sembrados, `skip: 0/50, take: 25` y 25 filas. Un
  `slice` en memoria pondría la prueba roja: la comprobé por lectura del espía,
  no por su nombre.
- *"listado sin sesión"* — `requerirSesionAdmin()` es la primera línea de la
  pantalla, antes de `await searchParams` y de la consulta
  (`src/app/admin/negocios/page.tsx:51`), y la suite de la etapa C lo amarra en
  ejecución con el cliente Prisma instrumentado (cero llamadas a la base).
- *"lo más reciente arriba"* y el desempate — `orderBy: [{ registradoEn:
  "desc" }, { id: "desc" }]` en la base, con prueba de 60 fichas de fecha
  idéntica recorriendo tres páginas sin repetir ni perder ninguna.

Literales: comparé **carácter por carácter** los 12 literales y las 4 funciones
de texto de `src/lib/admin/textos.ts` contra el delta de `revision-admin`, y
verifiqué en Node que `Intl.DateTimeFormat("es-MX", …)` sobre el 3 de
septiembre de 2026 devuelve exactamente "3 de septiembre de 2026", el ejemplo
del requirement. Copy en español mexicano, sin tecnicismos.

## Alcance

Diff acotado al ticket: pantalla nueva, tres componentes, un módulo de
parámetros, una consulta aditiva, los literales, un enlace en la cola y las
suites. **Cero acciones nuevas sobre registros** (verificado por HTTP y por
prueba), cero edición de datos, cero buscador, cero migraciones, cero
dependencias nuevas (`package.json` y el lock intactos), cero `"use client"`,
cero `any` fuera de `src/generated/prisma`. `obtenerColaDeRevision` conserva su
comportamiento (la extracción de `textoDeColonia`/`vieneDeDespublicacion` es
refactor a función común, con sus pruebas de siempre en verde).

## tasks.md

13 de 14 tareas hechas y verificadas. La 14ª —tarea 13, revisión visual con
ojos humanos a 390/768/1280px y contraste AA— queda **abierta a propósito**: la
propia tarea dice "lo que necesite ojos humanos queda anotado para el PR". La
parte automatizable sí está cerrada (guardián de clases sobre el HTML servido,
`min-h-11` en cada control, `break-words`, las seis pantallas servidas por
HTTP). Es el mismo tratamiento que en T-005 y T-015.

## Observaciones (baja, no bloquean; van al PR)

1. **Comentario obsoleto corregido por mí** en `src/lib/admin/listado-parametros.ts`:
   la cabecera seguía diciendo "esta es una implementación candidata (etapa UI)
   … no asuman que esto ya está probado", cosa que dejó de ser cierta cuando la
   etapa B escribió las suites. Es el único cambio de código que hice: solo
   comentario, sin efecto en el comportamiento, y queda a la vista en el diff.
2. **La página más allá de la última no pinta ningún texto de vacío**, solo
   "Ver más nuevos". El *scenario* pide exactamente eso y se cumple; la prosa
   del requirement dice "mostrando el texto de lista vacía y el enlace". Los
   dos literales existentes hablan de la lista, no de la página, y decirle
   "Todavía no hay negocios registrados." a quien tiene 60 sería falso.
   Coincido con dev y seguridad: **al consolidar `openspec/specs/` hay que
   redactar esa frase como la implementación la resolvió**, o aprobar un
   literal nuevo. Decisión del humano.
3. **"Byte a byte idéntica" es cierto en el render, no en el servidor.** La
   etapa C midió respuestas idénticas ante querystring hostil a nivel de
   componente; contra `next start` la carga RSC **sí** incluye la URL de la
   propia petición (`?estado=xyz&pagina=-3`), como hace toda ruta del App
   Router. Lo verifiqué escapado y sin vector de XSS, y no revela nada que el
   cliente no haya mandado él mismo, pero la afirmación del reporte C conviene
   leerla con ese matiz.
4. **Sin índice en `estado` ni en `registradoEn`** (`prisma/schema.prisma`,
   observación 2 de la etapa C): el `count` filtrado y el `ORDER BY … OFFSET`
   recorren la tabla. Irrelevante a la escala del proyecto; candidato a deuda si
   algún día el listado se siente lento.
5. **`textoFechaDeRegistro` usa la zona del servidor** (UTC en Vercel): una
   ficha registrada a las 19:00 hora de Tizayuca se leería del día siguiente. Es
   el mismo comportamiento que el resto del panel; si se arregla, va con ticket
   propio para todo el panel.
6. **`obtenerListadoDeNegocios` confía en que `pagina ≥ 1`** (observación 1 de
   la etapa C). Hoy inalcanzable —el único llamador normaliza en el borde—, pero
   un `Math.max(0, …)` lo cerraría cuando aparezca el segundo llamador (el
   buscador del panel, deuda E3-8).

## Integración con main (proceso v0.5 §5c)

`origin/main` avanzó 13 commits durante la corrida (PRs #20 y #21 y docs del
rebrand). Fusioné main a la rama antes del PR y volví a correr las tres
compuertas sobre el árbol ya fusionado. Los dos archivos que main y este change
tocan a la vez —`src/lib/admin/consultas.ts` (comentario de la reaceptación) y
`docs/metricas-pipeline.md`— se fusionaron sin conflicto de contenido.

Compuertas sobre el árbol ya fusionado: lint y `tsc` verdes, `build` verde con
`/admin/negocios` dinámica, y `npm test` en **2 902 verdes, 2 skipped y las 2
rojas heredadas de siempre**. (Una corrida intermedia salió con 23 archivos en
rojo: la base local `t018` se había caído a media corrida —`No se pudo conectar
a la base de pruebas … :51226`— y al levantarla otra vez el resultado volvió a
ser el de arriba. Queda anotado porque es exactamente la clase de falso rojo
que este proyecto ya conoce del motor local.)

PR abierto: [#23](https://github.com/SoyJorgePilo/enmirumbo/pull/23).

## Lo que sigue siendo del humano

- Mergear el PR (punto de control humano; el CI de GitHub Actions debe estar en
  verde antes).
- La revisión visual de la tarea 13 y la decisión de copy de la observación 2.
