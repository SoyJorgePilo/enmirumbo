# Reporte validación · agregar-directorio-publico

**Veredicto: aprobado.** Sin hallazgos bloqueantes. Ninguna corrección pedida a
etapas previas: primera pasada limpia del validador.

Validé de forma independiente (no confié en los reportes previos): leí el diff
completo contra `main` más los archivos sin seguimiento, corrí las tres
compuertas mecánicas yo mismo y levanté el sitio real (`next build` +
`next start`) contra una base desechable sembrada, con `tokenGestion` puesto a
mano en un publicado y en uno `en_revision`, para comprobar la fuga de datos y
los códigos de respuesta con `curl`. La base de auditoría (`prisma/validador.db`)
quedó borrada; el árbol no tiene artefactos.

## 1. Compuertas mecánicas (ejecutadas por mí)

| Compuerta | Resultado |
|---|---|
| `npm run lint` | limpio, sin salida |
| `npm run build` | compila; rutas `ƒ /`, `ƒ /[categoria]`, `ƒ /negocio/[ficha]`, `○ /_not-found` |
| `npm test` | **431/431 en verde**, 16 archivos, 5.19 s |

Sin dependencias nuevas (`tsx` ya era devDependency), sin migración, sin `any`,
sin `console.*` en `src/`, sin `"use client"` nuevo, sin `ts-ignore` ni
`eslint-disable` nuevos.

## 2. Spec → implementación (14 requirements / 54 scenarios)

Recorrí los tres deltas (`directorio-publico` 10 req / 38 sc, `layout-base`
3 req / 11 sc, `modelo-datos` 1 req / 5 sc) contra el diff. **Cada scenario tiene
implementación verificable**; ninguno quedó sin cubrir. Verificado por muestreo
sobre el servidor real, no solo por tests ajenos:

| Comprobación en runtime | Resultado |
|---|---|
| Códigos: `/`, `/servicios-del-hogar`, `?colonia=huicalco`, `?colonia=inventada`, `/otro`, `/registro`, `/clubes-y-escuelas-deportivas` | 200 |
| Códigos: `/plomeros-baratos`, `/loquesea`, `/negocio/no-existe-xyz`, `/negocio` | 404 |
| Ficha de un `en_revision` y de un `rechazado` | 404, y `grep` de su nombre, WhatsApp, fijo y token en la respuesta: **0** |
| Fuga en `/belleza` del negocio `en_revision` de esa categoría | **0** apariciones |
| `grep` de `tokenGestion`/token inyectado, `consintioAvisoEn`, `registradoEn`, `publicadoEn`, `organico`, `siembra` en listado y ficha publicada | **0** apariciones |
| `h1` del listado servido | `Servicios del hogar en Tizayuca` en un solo nodo (sin el `<!-- -->` que partía el encabezado) |
| Orden del listado | Cerrajería (2026-08-20) primero; empate 2026-08-01 desempatado por nombre (Electricidad → Plomería). Coincide con la duda 3 aprobada |
| Filtro por colonia | solo Huicalco y Atempa (las que tienen publicados en esa categoría), `aria-current="true"` en la activa, todo con `<a href>` |
| `?colonia=tizayuca-centro` (del catálogo, sin resultados) | "No encontramos negocios de esta categoría en esa colonia." + "Ver todas las colonias" |
| `?colonia=inventada` (fuera del catálogo) | listado completo, sin error y sin 404 |
| `/otro` (categoría vacía) | "Todavía no hay negocios publicados en esta categoría." + "Registra tu negocio gratis" |
| Home | un `h1` (`¿Qué necesitas en Tizayuca?`), tres `h2`, 8 categorías, bloque de deporte, CTA de registro; **0** `<input>/<form>/<select>/<button>` |
| Ficha completa | `h1` con el nombre, "Negocio verificado", "A domicilio", "Horario:", `wa.me/52…?text=Hola%2C%20te%20vi%20en%20NecesitoUno%20Tizayuca…`, `tel:+527717775001` sin `target`, Maps con la referencia + colonia + "Tizayuca, Hidalgo", y "Ver su página (facebook.com)" |
| `rel="noopener noreferrer"` + `target="_blank"` en todos los externos; `tel:` sin `target` | correcto |
| 404 servida | los tres literales, sin `Not Found` ni volcado técnico |
| Guarda del seed (CLI real, no la función) | `DATABASE_URL=postgresql://…` → no siembra, exit 1; `NODE_ENV=production SEED_DEMO_PERMITIR=1` → no siembra, exit 1 |
| `db:seed` / `db:seed:demo` | catálogos 8/21/49 sin negocios; demo siembra 12 con el aviso de "negocios de MENTIRA" |

## 3. Ticket T-004 · criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Home con 8 categorías + bloque deporte al mismo nivel + CTA de registro | Cumple (ambos bloques son `h2`; el CTA conserva su literal) |
| 2 | Listado por categoría en URL limpia con filtro por colonia, solo `publicado` | Cumple |
| 3 | Tarjeta con foto/marcador, nombre, colonia, "A domicilio" y WhatsApp directo | Cumple (botón `bg-accion`, `min-h-11`, `aria-label` con el nombre) |
| 4 | Ficha con la info registrada, sello y botones WhatsApp/Llamar/Cómo llegar/página | Cumple |
| 5 | Nunca datos de no publicados (404) y colonia sin domicilio exacto | Cumple (verificado en runtime, incluido el HTML de la respuesta 404) |
| 6 | 404 en español para categoría o negocio inexistente | Cumple |
| 7 | Server Components sin JS de cliente, mobile-first, ≥44px, WhatsApp sin competencia | Cumple en lo automatizable; la revisión visual a 390/768/1280 queda para el humano del PR |
| 8 | Externos con `rel="noopener noreferrer"`; la página registrada no promete Facebook | Cumple |

## 4. Alcance

Nada en el diff que la spec no pida, con las salvedades del §6. Verificado:

- El mock de la etapa A (`src/lib/mock/agregar-directorio-publico.ts`) quedó
  **eliminado**; ninguna página lo importa.
- No hay buscador ni input de búsqueda (E2-4 fuera), ni páginas por giro (E5-1),
  ni Schema Markup (E5-2), ni botón "Reportar" (E3-4), ni analítica (E7), ni
  subida de foto (E1-3), ni `sitemap.xml`/`robots.txt`/metadata por página (E5),
  ni paginación. `src/generated/` no viaja; no hay `.db` ni artefactos.
- Las dos líneas de `README.md` (comandos de seed) y `CLASE_BOTON_SECUNDARIO`
  son consecuencia directa de lo que la spec pide, no funcionalidad extra.

**Las tres desviaciones del contrato de a-ui son fieles a la spec, no scope creep:**

1. `hrefWhatsapp`/`coloniaNombre` nulables — antes que servir un `wa.me` roto o
   un párrafo vacío, no se pinta. `design.md` §4 lo anticipa; con datos que
   pasaron por el formulario de T-003 el caso no ocurre.
2. `obtenerColoniaPorSlug` — **la spec la exige de hecho**: sin consultar el
   catálogo de colonias no se pueden distinguir los dos scenarios "colonia del
   catálogo sin resultados" (mensaje) y "colonia desconocida en la URL" (se
   ignora). Comprobé los dos comportamientos en runtime.
3. `h1` en un solo nodo de texto — corrige `Servicios del hogar<!-- --> en
   Tizayuca`, que incumplía el literal del encabezado que la spec fija.

## 5. tasks.md y seguridad

Las 20 tareas están en `[x]` y **verifiqué por muestreo que están hechas de
verdad**, no solo marcadas: tarea 1 (lista de reservados + el test que exige que
toda carpeta de ruta de `src/app` esté declarada), tarea 2 (proyección campo por
campo; el test que recorre `src/` y falla si otro archivo filtra por estado),
tarea 5 (guarda del seed probada contra el CLI real), tareas 9-13 (runtime),
tarea 16 (`problemasDeEnlaces()` se prueba a sí misma en negativo con un href
inventado, un externo sin `rel` y un `tel:` con pestaña nueva), tarea 20
(literales carácter por carácter contra el HTML servido).

Seguridad: el reporte de la etapa C cierra **sin críticos ni altos**. M2 (`tel:`
sin normalizar) y M4 (guarda del seed) están corregidos y los re-verifiqué yo
contra el código y contra el CLI, no contra el reporte. Re-hice por mi cuenta el
barrido de secretos (nada), de datos personales reales (todos los WhatsApp del
seed son `771999xxxx`, los nombres llevan marca explícita de invención) y de
sobre-exposición de campos (`src/lib/directorio.ts` selecciona campo por campo;
`tokenGestion`, `estado`, `origen`, `registradoEn`, `consintioAvisoEn`, latitud y
longitud no se leen).

## 6. Hallazgos no bloqueantes

**Decisión de producto que tomé (B5 de la etapa C).** Cuando el negocio registró
algo en "teléfono fijo" que no es un número marcable, la ficha lo imprime como
`Teléfono: <lo que escribió>` sin botón "Llamar"
(`src/app/negocio/[ficha]/page.tsx:87-92`). Lo reproduje en el servidor real: con
`*21*5512345678#` guardado no hay ninguna ancla `tel:` ni botón, y el texto sale
escapado y fuera de todo atributo. **Lo acepto**: el PRD §6.2 pide "toda la
información" en la ficha, la prohibición de la spec ("los botones DEBEN mostrar
la acción, no el número de teléfono como texto") está acotada a los botones, y el
caso solo se dispara con valores que nunca son un número normal. Pero es un
elemento visible —y un literal, "Teléfono: "— que **ningún requirement enumera**:
queda señalado para el humano del PR y **debe escribirse en
`openspec/specs/directorio-publico/` al consolidar en el `/checkpoint`**, para
que la spec no se quede atrás del código.

**Medios abiertos de la etapa C, con dueño futuro** (hoy solo viven en
`reports/c-seguridad.md`: **hay que abrirles ticket en el `/checkpoint` o se
pierden al archivar**):

- **M1** · `fotoUrl` llega a `<Image>` sin ningún validador de esquema/origen,
  el único dato de usuario que se pinta sin guardián. No explotable hoy (ninguna
  ruta escribe la columna y `/_next/image` responde 400 sin `remotePatterns`),
  pero es justo el campo que E1-3 y el panel E3 van a empezar a escribir. → **E1-3**.
- **M3** · El consentimiento de T-003 no le avisa al negocio que su WhatsApp
  queda visible para cualquiera. Es copy de `registro-negocio` y finalidad
  LFPDPPP. → **ticket propio con los legales de E6**.
- **M5** · Ocho GET bastan para cosechar nombre + colonia + número de todos los
  negocios verificados; no hay `robots.txt` ni fricción de lectura. La exposición
  del número es el producto, así que es una decisión de producto, no un defecto.
  → **E5/E7**.

**Bajos abiertos:** B1 (`href` crudo en `obtenerPaginaRegistrada`; comprobado que
el dominio mostrado siempre coincide con el host real), B2 (invisibles en el
dominio mostrado), B3 (consulta a la base en cualquier URL con `force-dynamic`;
`?colonia` sin cota), B4 (`console.*` del CLI del seed, aceptable), B5.

**Míos, todos menores:**

1. `src/app/layout.tsx` no declara `<meta name="format-detection"
   content="telephone=no">`: Safari en iOS puede volver a convertir en `tel:` el
   texto que parezca teléfono, incluido lo que el negocio escriba en
   `queOfreces`, `direccion` u `horario`. Es previo a este change y de una línea;
   ticket de layout.
2. `prisma/seed-demo.ts` usa `771777xxxx` para los teléfonos fijos, fuera de la
   convención `771999xxxx` que `design.md` §7 de T-003 y la spec de este change
   fijan para los datos inventados. Son igual de ficticios, pero es la **segunda
   corrida** con esta desviación (ya se anotó en `d-validacion.md` de T-003):
   conviene unificar la convención y escribirla donde se vea.
3. La ficha abre con un marcador de foto `aspect-video` a todo lo ancho aunque
   hoy ningún negocio tiene foto (E1-3 fuera de alcance): a 390px empuja el `h1`
   y el botón de WhatsApp hacia abajo. La spec autoriza el marcador para la
   **tarjeta**, no para la ficha. Es lo primero que hay que mirar en la revisión
   visual del PR.
4. En el listado, las tarjetas usan `h3` colgando directo del `h1` (sin `h2` en
   medio). No viola ninguna spec —la regla de `h2` está acotada a la home— pero
   es un salto de jerarquía para lector de pantalla; ajuste de UI.
5. Contabilidad: el change tiene **14 requirements y 54 scenarios**, no los
   13/50 que citaba el encargo. Los conté sobre los archivos.

## 7. Convenciones

Todo el texto de UI en español mexicano, verificado carácter por carácter contra
los literales de la spec sobre el HTML servido. Sin `any`, sin dependencias
nuevas, sin migración. Los comentarios del código explican el *porqué* y citan
spec, PRD o hallazgo.

## Recordatorio

**El CI de GitHub Actions debe quedar en verde en el PR: esta validación local no
lo sustituye.** Y **el merge lo hace un humano**, con él la revisión visual a
390/768/1280 px que ningún test cubre y la decisión sobre el "Teléfono: " del §6.
