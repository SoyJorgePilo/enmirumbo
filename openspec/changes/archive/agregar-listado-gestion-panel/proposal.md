# Propuesta: agregar-listado-gestion-panel

**Ticket:** `docs/tickets/T-018-listado-gestion-panel.md` (P1, épica E3; nace de la revisión visual del fundador del 2026-09-04)
**PRD:** §6.3 (la revisión manual es verificación + moderación; el panel es la única superficie donde el admin opera las fichas, en una ruta no indexada tras contraseña de entorno), §8 (LFPDPPP: los datos personales solo se ven dentro del panel; el compromiso ARCO de ≤20 días hábiles necesita que el admin pueda *llegar* a la ficha)

## Por qué

Hoy el panel solo tiene dos puertas de entrada a una ficha: la cola de revisión (solo `en_revision`) y la sección "Negocios reportados" (solo con reportes pendientes). Un negocio publicado y sin reportes es inalcanzable salvo adivinando o copiando a mano `/admin/registros/<id>`, así que las herramientas que T-015 construyó para cumplir la LFPDPPP —despublicar y borrar definitivamente (PRD §8)— existen pero no se pueden operar en la práctica desde el celular. Este change agrega la puerta de entrada que falta: una vista que lista **todos** los negocios, con su estado a la vista y un enlace a su detalle, sin inventar ninguna acción nueva.

## Qué cambia

- **Vista nueva "Todos los negocios"** (`/admin/negocios`), Server Component como el resto del panel: lista todos los registros sin importar su estado, del más reciente al más antiguo, con nombre, colonia, fecha de registro, el estado escrito con palabras ("En revisión", "Publicado", "Rechazado"), la etiqueta ya consolidada "Ya estaba publicada, la despublicaste" cuando la ficha volvió a la cola por una despublicación, y una entrada "Ver detalle" a `/admin/registros/<id>`.
- **Filtro por estado en la URL**: enlaces "Todos", "En revisión", "Publicados" y "Rechazados" que solo cambian el querystring (`?estado=…`). Sin JavaScript de cliente, sin formularios, sin acciones de escritura: la vista es de puro leer y navegar.
- **Corte por páginas de 25 renglones** (`?pagina=…`) con "Ver más antiguos" / "Ver más nuevos" y la posición escrita ("Página 2 de 5"). Nada de scroll infinito: el recorte lo hace la base de datos, así que el HTML no crece con el total de registros.
- **Entrada visible desde la cola** ("Ver todos los negocios") y regreso desde el listado ("Volver a la cola"), para que la vista exista de verdad en el flujo del admin y no solo como URL que hay que recordar.
- **Mismas protecciones que el resto de `/admin`**, sin mecanismos nuevos: la sesión firmada de T-005 se exige antes de leer nada, la pantalla hereda `noindex, nofollow` y la política de referente del layout del panel, no se enlaza desde ninguna página pública, y el listado muestra **el mínimo de datos personales** (nombre y colonia, lo mismo que ya muestra la cola): ni WhatsApp, ni teléfono, ni dirección, ni foto, que siguen viviendo solo en el detalle.
- **Parámetros de la URL a prueba de manoseo**: un `estado` o una `pagina` que no se reconocen se tratan como el valor por defecto, sin error del servidor y sin filtrar nada.

## Capacidades afectadas

- `revision-admin` (ADDED + MODIFIED). Cinco requirements nuevos: la vista y su contenido, el filtro por estado, el corte por páginas, la entrada y salida desde la cola, y la herencia del acceso y de la protección de datos del panel. Un requirement modificado: "El panel se opera desde el celular y sin JavaScript de cliente innecesario", cuya enumeración de pantallas es exhaustiva y tiene que incluir el listado.
- `modelo-datos`: **no cambia**. El listado lee lo que ya existe (`estado`, `registradoEn`, `despublicadoEn`, colonia); no hay columnas, migraciones ni estados nuevos. En particular, "despublicada" **no** es un estado del modelo: es un `en_revision` con rastro de despublicación, y así se muestra (ver `design.md`).

**Coordinación con T-014 (enlace de gestión, en desarrollo):** ese change tocará la cola para distinguir "alta nueva" de "edición" y agregará pantallas al panel. Estos deltas se escriben contra la spec consolidada de hoy y **no reescriben** el requirement "Cola de revisión con los registros pendientes, más antiguos primero" (la entrada al listado va como requirement propio) para no chocar en la consolidación. El único requirement modificado es el de celular/sin-JS, que T-014 también ampliará: al consolidar, las dos ampliaciones son aditivas.

## Impacto en código (alto nivel)

- `src/lib/admin/textos.ts`: los literales nuevos del listado (encabezado, filtros, estados escritos, conteo, vacíos, paginación, "Ver detalle", "Ver todos los negocios"). Se reutilizan `ETIQUETA_COLA_DESPUBLICADA` y `TEXTO_VOLVER_A_LA_COLA`.
- `src/lib/admin/consultas.ts` (o un módulo hermano): una consulta paginada nueva que devuelve la página pedida y el total, con `skip`/`take` y orden en la base; y la normalización de los parámetros `estado` y `pagina`. No se toca `obtenerColaDeRevision` ni `obtenerRegistroParaPanel`.
- `src/app/admin/negocios/page.tsx`: la pantalla, con `requerirSesionAdmin()` antes de tocar la base y `robots: { index: false, follow: false }` en su metadata. Al ser una ruta real, gana sobre el comodín `src/app/admin/[...resto]/page.tsx`.
- `src/components/admin/`: renglón del listado, tira de filtros y controles de paginación, todos Server Components sin `"use client"`.
- `src/app/admin/cola/page.tsx`: un enlace más, sin tocar la consulta ni el orden de la cola.
- `tests/`: suite propia del listado (contenido, orden, filtro, paginación, vacíos), suite adversarial (sin sesión, parámetros manipulados, página fuera de rango) y prueba de volumen. Las suites que recorren todas las páginas de `src/app/admin` (`tests/analitica-exclusion-admin.test.ts`, `tests/layout.test.ts`) recogen la ruta nueva automáticamente y la verificación de enlaces del sitio público debe seguir sin mencionar `/admin`.

## Fuera de este change

- **Buscador de fichas dentro del panel por nombre o WhatsApp** (deuda E3-8 del backlog): el listado con filtro y paginación quita la urgencia pero no la sustituye; con cientos de fichas publicadas seguirá haciendo falta.
- **Editar los datos del negocio desde el panel** (E3-7, acceso y rectificación ARCO): sigue haciéndose a mano contra la base.
- **Acciones sobre los registros desde el listado** (aprobar, rechazar, despublicar, borrar en lote): viven en el detalle y ahí se quedan; una acción destructiva a un toque desde una lista es exactamente lo que la confirmación en dos pasos de T-015 evita.
- **Que el detalle regrese al listado conservando filtro y página**: hoy el detalle vuelve a la cola. Volver con el botón del navegador funciona; hacerlo explícito toca el detalle, que es justo lo que T-014 está moviendo.
- **Ordenar por otras columnas o filtrar por colonia, categoría u origen**: el ticket pide estado, orden de recientes y paginación.
- **Mostrar en el listado si el negocio tiene reportes sin atender**: la cola ya tiene su sección propia para eso ("Negocios reportados") y mezclar los dos trabajos es lo que esa spec decidió no hacer.
- **Bitácora de acciones del admin** (E3-9): sigue pendiente y este change no la acerca ni la aleja.

## Dudas abiertas (a resolver antes de aprobar)

1. **¿"Despublicadas" merece filtro propio?** En el modelo no existe ese estado: una ficha despublicada es `en_revision` con `despublicadoEn` más reciente que `registradoEn`. La propuesta la muestra dentro del filtro "En revisión" con la etiqueta "Ya estaba publicada, la despublicaste" (el mismo lenguaje que ya usa la cola). Un filtro propio obligaría a comparar dos columnas en la consulta paginada — se puede, pero es SQL a mano y más superficie de prueba. ¿Basta la etiqueta o el fundador quiere el cuarto filtro?
2. **¿El orden de "más reciente" es la fecha de registro?** La propuesta ordena por `registradoEn` descendente, que es la fecha que el renglón muestra (el reenvío tras un rechazo la pisa, así que un reenvío sube). Eso significa que una ficha registrada hace ocho meses y despublicada ayer **no** aparece arriba, a diferencia de la cola, que sí cuenta desde la despublicación. Ordenar como la cola exige traer todo a memoria y pelearse con la paginación. ¿Se acepta que el listado y la cola tengan relojes distintos, cada uno explicado en pantalla por la fecha que muestra?
3. **¿25 renglones por página está bien para el celular?** Es el número que propone la spec (un scroll razonable a 390px, HTML chico). Si el fundador prefiere 20 o 50, es un solo valor y conviene fijarlo antes de escribir las pruebas de volumen.
