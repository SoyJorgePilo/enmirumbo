# Reporte dev — agregar-paginas-legales

Etapa B sobre lo que dejó la etapa A (`reports/a-ui.md`), que ya había construido **todo** el contenido y las cuatro superficies. Mi trabajo fue la verificación de ingeniería (el texto legal, carácter por carácter, contra la spec y contra el HTML real), los tests de los scenarios automatizables, la actualización de los casos que la spec identificó como afectados y las correcciones de lo que encontré mal.

## Gates

- `npm run lint` en verde.
- `npm run build` en verde. `/aviso-de-privacidad` y `/terminos` se generan como **estáticas** (`○`), sin JS de cliente propio.
- `npm test` en verde: **951 tests en 35 archivos** (antes del change: 904 en 32). 47 tests nuevos.

## Tareas completadas

| Tarea | Qué hice |
| --- | --- |
| 4 | `tests/legales-textos.test.ts`: placeholders declarados ⇔ usados, formato de cada uno, interruptor de borrador y "nada inventado" sobre el módulo. |
| 5, 7, 8, 9, 10 | `tests/legales-paginas.test.ts`: jerarquía, última actualización, los seis elementos mínimos, "Qué queda público y qué no", metadata e indexabilidad, enlace de cierre. |
| 11, 13, 14, 15 | Mismo archivo: `/terminos` (h1/h2/fecha/metadata), deslinde y sello "Negocio verificado", las cinco reglas del PRD §6.3 + rechazo/reenvío/90 días/retiro, enlace al aviso. |
| 16 | La regla "marca de borrador si y solo si quedan pendientes" en `tests/legales-paginas.test.ts` + `tests/legales-borrador.test.ts`, que simula `PLACEHOLDERS_LEGALES` ya vacía y comprueba que la marca desaparece sola y el documento sigue completo. |
| 17, 19 | `tests/layout.test.ts`: el caso del footer pasa de "cero enlaces" a "exactamente estos dos, cada uno a una ruta que existe, sin enlaces muertos" + área táctil; caso nuevo "las rutas legales ya no son un enlace muerto" (y `/terminos-y-condiciones` mal escrita sigue fallando); `/aviso-de-privacidad` deja de usarse como ejemplo de ruta inventada. |
| 20, 22 | `tests/registro-pagina.test.ts`: el literal completo del aviso simplificado (copiado de la spec), la advertencia de M3, el enlace al integral (misma pestaña, `min-h-11`, único `href` de la página) y que la frase "Cuando publiquemos el aviso completo…" ya no existe. |
| 24, 25 | Confirmados de verdad con la suite completa y con `next start`: cero `"use client"`, HTML del servidor completo, reserva de segmentos intacta. |
| 27 | Los tres gates en verde. |

Solo queda abierta la **26** (revisión visual humana a 390/768/1280 px). Lo automatizable de ese scenario ya está cubierto: los enlaces entre documentos reservan 44px y `documento-legal.tsx` no usa anchos fijos.

## Verificación del contenido legal (lo más importante del change)

El texto aprobado de la spec **no se transcribió a mano**: `tests/legales-paginas.test.ts` lleva los dos bloques copiados literalmente de `specs/paginas-legales/spec.md` (extraídos con script, no a ojo) y los compara **línea por línea** contra el HTML renderizado de cada página, ya sin etiquetas ni entidades. Resultado: **la transcripción de la etapa A es exacta**, párrafo por párrafo y viñeta por viñeta, en los dos documentos. Lo mismo con el aviso simplificado del formulario.

Además verifiqué end-to-end contra el servidor de producción (`next start`, puerto 3100, apagado al terminar): las dos rutas responden 200, cada una con un solo `h1`, diez `h2`, su `<title>`/`<meta name="description">` propios, **sin** `<meta name="robots">`, con la marca de borrador visible y con los dos enlaces del footer en todas las páginas.

Comprobé que los tests **muerden**: mutando el módulo (una frase cambiada, un correo inventado, un placeholder no declarado) y el footer (un enlace borrado) fallan 8 casos de las tres suites; restauré los archivos y la suite volvió a verde.

## Mapa scenario → test

### Capacidad `paginas-legales` (`tests/legales-paginas.test.ts` salvo donde se indique)

| Scenario | Test |
| --- | --- |
| el dueño abre el aviso de privacidad | "encabeza con el h1 y la línea de última actualización con su fecha" + "vive dentro del layout global, sin repintar el chrome del sitio" |
| jerarquía de encabezados del aviso | "tiene un solo h1, sus secciones son h2 y no hay saltos de jerarquía" (compara la lista de los 10 `h2` en orden) |
| el aviso enlaza a los términos | "cierra con el enlace \"Términos y condiciones\" hacia /terminos" |
| identidad y domicilio del responsable | "(1) responsable, con domicilio y canales de contacto" |
| datos tratados y finalidades | "(2) qué datos recogemos…" y "(3) para qué usamos tus datos…" |
| medios para limitar el uso o la divulgación | "(4) cómo limitar el uso o la divulgación, con la despublicación inmediata" |
| derechos ARCO con plazo de 20 días hábiles | "(5) los cuatro derechos ARCO, qué mandar, por dónde y el plazo de 20 días hábiles" |
| procedimiento de cambios al aviso | "(6) procedimiento de cambios: misma página, fecha nueva y aviso por WhatsApp" |
| (los seis, cada uno en su sección) | "cada elemento mínimo vive en su propia sección, no repartido en líneas sueltas" |
| el aviso dice que el WhatsApp queda a la vista | "el WhatsApp y el teléfono fijo quedan visibles, con botones para escribir o marcar" |
| el aviso distingue colonia de domicilio | "publica la colonia y no el domicilio exacto, salvo que el dueño lo escriba" |
| lo que nunca se publica | "lo que nunca se publica: fecha de registro, notas internas y motivo del rechazo" |
| el texto publicado es el aprobado (aviso) | "/aviso-de-privacidad dice exactamente lo que aprobó la spec" (comparación literal completa) |
| el texto publicado es el aprobado (términos) | "/terminos dice exactamente lo que aprobó la spec" + "ninguna de las dos trae relleno ni secciones vacías" |
| nada de esto necesita conocimiento legal / lenguaje llano también en los términos | **parcial**: "segunda persona, sin latinismos ni párrafos en mayúsculas" caza las señales objetivas (jerga de contrato, bloques en mayúsculas, ausencia de segunda persona). La lectura de fondo la hizo el humano al aprobar la spec y la repetirá la revisión legal (E6-3). |
| el vecino abre los términos | "encabeza con el h1, la línea de última actualización y el contenido completo" |
| los términos enlazan al aviso de privacidad | "enlazan al aviso de privacidad desde la sección de datos personales" |
| deslinde de la operación entre vecino y negocio | "el trato es directo entre vecino y negocio; el directorio no es parte" + "no cobra por publicar ni cobra comisiones" |
| alcance real del sello "Negocio verificado" | "el sello \"Negocio verificado\" solo dice que el negocio existe y que el número es suyo" |
| las reglas de moderación están publicadas | "publica las cinco reglas completas, con los ejemplos del PRD" |
| rechazar no es para siempre | "rechazar no es definitivo: motivo por WhatsApp, reenvío y borrado a los 90 días" |
| retiro de fichas | "el directorio puede no publicar o retirar una ficha, y la baja a petición es inmediata" |
| el domicilio del responsable todavía no existe | "los datos que faltan se leen entre corchetes, no inventados ni en blanco" |
| marca de borrador visible | "la marca de borrador se ve arriba si y solo si quedan pendientes" + `tests/legales-borrador.test.ts` (lista vacía ⇒ sin marca) |
| los pendientes son verificables | "todo corchete que aparece en las páginas está declarado en PLACEHOLDERS_LEGALES" y "ninguna página legal trae correo, teléfono o domicilio inventado"; en el módulo, `tests/legales-textos.test.ts` completo |
| sin noindex | "ninguna de las dos pide a los buscadores que no la indexe" (+ el guardián que ya existía en `tests/buscador-pagina.test.ts`) |
| título y descripción propios | "cada una tiene título y descripción del documento, distintos de los del sitio" |
| sin JavaScript de cliente | "ninguno de los archivos de las páginas legales declara \"use client\"" + "el HTML del servidor ya trae el documento completo"; `tests/layout.test.ts` lo vigila además por exclusión |
| se leen en el celular | **parcial**: "los enlaces entre documentos reservan 44px y no hay anchos fijos". La revisión visual a 390/768/1280 px es humana (tarea 26). |

### `layout-base` (`tests/layout.test.ts`)

| Scenario | Test |
| --- | --- |
| footer con los enlaces legales y sin enlaces muertos | "el footer enlaza las dos páginas legales, y las dos existen" (textos, destinos, lista blanca y `problemasDeEnlaces(htmlFooter) === []`) |
| los enlaces del footer se pueden tocar en el celular | "cada enlace del footer reserva al menos 44px de área táctil" (+ revisión visual humana) |
| las rutas legales ya no son un enlace muerto | "las rutas legales existen; una legal mal escrita sigue fallando" |
| enlace interno a una ruta inexistente | "señala un enlace inventado…" (ahora con `/terminos-y-condiciones` como ejemplo) |
| (revisión de enlaces de las páginas servidas) | "la home, el listado…, la ficha y la 404 solo enlazan a lo que existe" — le sumé el HTML de las dos páginas legales |

### `registro-negocio` (`tests/registro-pagina.test.ts`)

| Scenario | Test |
| --- | --- |
| el aviso simplificado avisa que el WhatsApp y el teléfono quedan públicos | "advierte, carácter por carácter, que los datos quedan a la vista" |
| enlace al aviso integral | "enlaza al aviso integral en la misma pestaña y ya no promete el enlace" |
| los enlaces del registro apuntan a páginas que existen | mismo test (único `href` de la página = `/aviso-de-privacidad`) + la lista blanca de `tests/layout.test.ts` |
| aviso visible sin salir del formulario / sin checkbox no hay envío / constancia | sin cambios: los tests que ya existían siguen en verde |

## Correcciones a lo que dejó la etapa A

1. **`noindex` escrito en un comentario** (`src/app/aviso-de-privacidad/page.tsx` y `src/app/terminos/page.tsx`). El guardián que ya existía en `tests/buscador-pagina.test.ts` ("ninguna otra página quedó marcada como no indexable") hace un regex crudo sobre el archivo entero, así que la prosa del comentario lo rompía: la suite estaba roja por una página que sí es indexable. Reescribí los dos comentarios sin ese literal y dejé anotada la razón en el código, igual que la etapa A hizo con `"use client"`. Preferí eso a relajar el guardián: es una defensa de SEO barata y el falso positivo se evita escribiendo la prosa de otra forma.
2. **`aria-label="Legal"` del `<nav>` del footer** → `"Enlaces legales"`. Es texto de interfaz (lo lee un lector de pantalla en un documento `es-MX`) y CLAUDE.md pide español; "Legal" a secas además no dice que sean enlaces.

Nada más: el contenido, la estructura de datos, las clases y la semántica de la etapa A pasaron la verificación tal cual.

## Decisiones técnicas

- **El texto aprobado se compara completo, no por fragmentos.** El test convierte el HTML renderizado a "líneas de documento" (`h1`, `h2` con prefijo `## `, párrafos, viñetas y enlaces sueltos, en orden de lectura) y lo compara con el bloque de la spec, tal cual, con `toEqual`. Es un solo `expect` por documento que caza cualquier cambio de redacción, de orden o de estructura. Los tests por scenario (los seis elementos, moderación, deslinde) se apoyan en un helper `seccion()` para afirmar sobre la sección correcta y no sobre "aparece en algún lugar de la página".
- **Los literales van copiados en el test, no leídos de `openspec/` en tiempo de ejecución** — misma convención que `tests/admin-textos.test.ts`. Un test que lee la spec no falla cuando alguien cambia los dos a la vez; y el change se archiva, así que la ruta desaparecería.
- **La marca de borrador se prueba como regla, no como estado.** El caso de las páginas afirma "se ve si y solo si `HAY_PLACEHOLDERS_PENDIENTES`", y el estado de hoy (siete pendientes) vive en un solo lugar declarado como tal (`tests/legales-textos.test.ts`). Así, cuando E6-3 complete los datos, se actualiza un caso, no una decena.
- **`tests/legales-borrador.test.ts` va aparte** porque `vi.mock` aplica a todo el archivo: es la única forma de ver el estado futuro (lista vacía) sin borrar el contenido real. Es el "interruptor de lanzamiento" del design.md §3, así que se prueba.
- **La verificación de "nada inventado"** no busca solo correos: también teléfonos (`\d{7,}`), URLs, `wa.me` y señales de domicilio (`C.P.`, "calle", "avenida"), sobre el texto **sin** los placeholders. Repo público + LFPDPPP.
- **Sin dependencias nuevas.** Todo con Vitest y `react-dom/server`, como el resto de la suite.

## Deuda y propuestas fuera de alcance

1. **Tarea 26 (revisión visual humana)** sigue abierta: 390/768/1280 px en navegador. Es el único scenario de este change sin cubrir automáticamente.
2. **`openspec/specs/registro-negocio/spec.md` todavía dice** que "mientras la página del aviso integral (E6) no exista, el aviso simplificado NO DEBE contener enlaces" y trae el texto viejo. Es correcto: la consolidación de `openspec/specs/` es del `/checkpoint` posterior al merge. Lo dejo señalado para que no se olvide, porque la spec consolidada quedaría contradiciendo al código.
3. **Interruptor de lanzamiento sin checklist ejecutable:** hoy `PLACEHOLDERS_LEGALES` se puede recorrer, pero nadie la imprime. Un `npm run legales:pendientes` de tres líneas (o una línea en el README de despliegue) haría que el humano vea la lista sin abrir el código. Fuera de la spec; propuesta.
4. **Versionado del aviso con constancia por versión** (ya anotado en la propuesta): hoy la constancia es solo el timestamp, así que no se puede saber qué versión del aviso aceptó cada negocio. Cuando E6-3 cambie el texto, las constancias viejas apuntarán a un documento que ya no existe. Merece ticket propio.
5. **El aviso promete un plazo ARCO (20 días hábiles) que hoy se atiende a mano** contra la base (E3-6 fuera de alcance). No es deuda de este change, pero sí un compromiso público sin herramienta: conviene que E3-6 no se quede al final de la fila.
6. **Los términos prohíben el copiado masivo por escrito y no hay defensa técnica** (E5-5 / hallazgo M5). Igual que arriba: el texto ya se publicó, la fricción técnica no.
7. **`tests/layout.test.ts` está creciendo mucho** (renderiza home, listado, ficha, buscador, 404, footer, cuatro pantallas de panel y ahora las dos legales en un solo `beforeAll`). Sigue siendo rápido, pero en algún momento conviene partir la revisión de enlaces a su propio archivo con un helper compartido. Nota menor, sin ticket.

---

# Iteración 2 — enmienda tras la auditoría de seguridad (etapa C)

La etapa C regresó el change con 1 ALTO y 3 MEDIO (`reports/c-seguridad.md`); MEDIO-3 lo cerró ella con un test. Los tres restantes tocaban **contenido aprobado**, así que van con enmienda de spec aprobada por el orquestador: cada bloque nuevo de `specs/paginas-legales/spec.md` está marcado con "**Enmienda (auditoría de seguridad, aprobada):**", y de ahí bajan el texto de `src/lib/legales/textos.ts` y los tests línea por línea.

## Gates de la iteración 2

- `npm run lint` verde · `npm run build` verde (las dos rutas siguen estáticas `○`) · `npm test` verde: **975 tests en 36 archivos** (969 al cerrar la etapa C; +6 casos).
- **Los 18 casos de `tests/legales-adversarial.test.ts` siguen en verde y siguen siendo 18** (verificado corriendo el archivo solo).
- Verificado además contra el HTML servido por `next start`: el aviso trae el texto enmendado ("Cómo llegar", "foto de tu negocio", "Si rechazamos tu registro", "no hay un botón que lo haga solo") y **no** trae los pendientes operativos (`E3-6`, `E0-3`, "backlog").

## ALTO-1 · la retención de 90 días es la de los registros rechazados

- **Spec:** enmienda en el requirement de los seis elementos mínimos (el elemento (4) se acota a los rechazados y se explica por qué: el PRD §6.3/§8 y `rechazadoEn` como único reloj del modelo) + scenario nuevo "el plazo de 90 días es el de los registros rechazados"; bloque literal actualizado.
- **Texto:** "Si tu registro no se publicó, sus datos se borran a los 90 días." → **"Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días."** Ahora el aviso, `/terminos` y el PRD dicen lo mismo, y ninguna ficha en revisión queda con una promesa de purga que nadie puede cumplir.
- **Tests:** caso nuevo "(4) el plazo de 90 días es el de los RECHAZADOS, igual que en /terminos" en `tests/legales-paginas.test.ts` —afirma el literal nuevo, que la frase vieja ya no existe, que los términos dicen lo mismo y que 90 es el único plazo de retención en las dos páginas—, más la comparación literal completa contra el bloque enmendado de la spec.
- **`CARACTERIZACIÓN` → `REGRESIÓN`:** el caso que la etapa C dejó pinchado pedía borrarse al corregir. En vez de borrarlo lo **reescribí como regresión** (misma posición, mismo archivo, 18 casos intactos): ahora exige que los dos documentos digan lo mismo y que el aviso no vuelva a prometer la purga de lo no publicado. Un hallazgo cerrado con su test de guardia vale más que un test menos.

## MEDIO-1 · ninguna promesa de automatismo, y los pendientes operativos declarados

- **Texto:** la despublicación pasa de "la bajamos del directorio de inmediato" a **"en cuanto nos llega tu mensaje la bajamos del directorio"** (sigue siendo inmediata, como promete el PRD §8, pero atada a la solicitud), y la sección cierra con un párrafo nuevo: **"Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo. Escríbenos por WhatsApp o por correo y te confirmamos que quedó hecho en un máximo de 20 días hábiles."** El titular ya no puede leer que algo se borra solo.
- **`PENDIENTES_OPERATIVOS_LEGALES`** (nuevo, en `src/lib/legales/textos.ts`, junto a `PLACEHOLDERS_LEGALES`): los dos compromisos que hoy se cumplen a mano, cada uno con "qué se prometió / cómo se hace hoy / qué ticket lo resuelve" — flujo ARCO en el panel (**E3-6**) y purga de rechazados a los 90 días (**E0-3**). Es la segunda mitad del interruptor de lanzamiento: la revisión legal (E6-3) y el checklist ven qué falta sin buscarlo a ojo.
- **Decisión de alcance (interpretación de la enmienda):** esa lista **no se publica** en las páginas. El texto legal dice a qué se compromete el responsable, no en qué va el backlog; publicar "todavía no tenemos la herramienta" no le sirve al titular y sí debilita el documento. La transparencia que sí corresponde —que nada es automático— quedó en el texto. Si el orquestador prefería la nota visible en la página, es un cambio de una línea en `DocumentoLegalView` y lo hago.
- **Tests:** describe nuevo en `tests/legales-textos.test.ts` con tres casos: forma de cada pendiente (compromiso, estado de hoy y ticket `E<n>-<n>`, con E3-6 y E0-3 presentes), que **ninguno** aparece publicado en el texto legal (ni la palabra "backlog" ni los identificadores de ticket), y que el aviso sí dice que todo se atiende a mano, sin promesas de borrado automático.

## MEDIO-2 · "qué queda público" cuadra exactamente con la ficha

- **Texto** (dos párrafos nuevos en "Qué queda público y qué no", después del de la dirección):
  - **"Cómo llegar":** *"Esa dirección también alimenta el botón «Cómo llegar» de tu ficha: quien lo toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu colonia y «Tizayuca, Hidalgo»."* Redactado a propósito desde el visitante ("quien lo toca abre… en su teléfono") para que no contradiga a "Con quién compartimos tus datos: con nadie": el servidor no manda nada a Google; el dato sale cuando un vecino usa el botón, que es justo lo que el dueño tiene derecho a saber antes de escribir su dirección.
  - **Foto:** *"Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual que lo demás. Hoy el formulario todavía no pide fotos; el día que las pida, aquí te decimos qué se puede publicar en ellas."* Se declara que es pública sin inventar la política de publicación, que es de **T-008** (change paralelo, no lo toqué): la spec dice explícitamente que T-008 vuelve aquí a escribirla.
- **Tests:** dos casos nuevos en `tests/legales-paginas.test.ts` (uno por scenario nuevo) y, en `tests/legales-adversarial.test.ts`, `fotoUrl` **sale** de `CAMPOS_PUBLICOS_SIN_DECLARAR` y entra a `CAMPO_PUBLICO_DECLARADO` con su frase: el mapa "campo de la proyección pública → frase del aviso" queda completo salvo `id` y `coloniaSlug`, que no son datos del titular.

## Verificación de que la enmienda muerde

Mutación sobre `src/lib/legales/textos.ts` (revertir el literal de ALTO-1 y borrar el párrafo de la foto), con el árbol restaurado después: **5 casos rojos** en tres archivos — la comparación literal contra la spec, los dos casos de scenario nuevos, la regresión adversarial de ALTO-1 y el mapa de campos públicos de la ficha. Sin la enmienda, la suite ya no deja pasar el texto viejo.

## Scenario → test de la iteración 2

| Scenario (enmendado o nuevo) | Test |
| --- | --- |
| medios para limitar el uso o la divulgación (enmendado) | "(4) cómo limitar el uso o la divulgación, a petición y sin automatismos" |
| el plazo de 90 días es el de los registros rechazados (nuevo) | "(4) el plazo de 90 días es el de los RECHAZADOS, igual que en /terminos" + "REGRESIÓN (hallazgo ALTO-1, corregido)…" en la suite adversarial |
| la dirección alimenta el botón "Cómo llegar" (nuevo) | "avisa que la dirección alimenta el botón \"Cómo llegar\" hacia Google Maps" |
| la foto del negocio también es pública (nuevo) | "declara que la foto del negocio, si la ficha llega a llevarla, es pública" + "todo campo que la ficha pública devuelve está declarado en el aviso" (adversarial) |
| los pendientes operativos también están declarados (nuevo) | los tres casos de "los pendientes operativos están declarados y no publicados" |
| el texto publicado es el aprobado (ya existía) | "/aviso-de-privacidad dice exactamente lo que aprobó la spec" — regenerado desde el bloque enmendado |

## Deuda al cerrar la iteración 2

- Los puntos 1, 2, 3, 4, 6 y 7 de la lista de arriba siguen abiertos tal cual.
- El punto 5 (ARCO sin herramienta) **ya no es solo una nota de reporte**: quedó declarado en el código como `PENDIENTES_OPERATIVOS_LEGALES`, con sus tickets. Sigue necesitando que E3-6 y E0-3 existan **antes** de que se retire la marca de borrador; ese es ahora el criterio de lanzamiento, junto con los siete placeholders.
- **La constancia por versión del aviso** (nota menor de la etapa C) sube de prioridad con esta enmienda: el texto ya cambió una vez dentro del mismo change, y nada registra qué versión aceptó cada negocio. Ticket propio antes del lanzamiento.
