# Tareas: renombrar-sitio-enmirumbo

Orden pensado para que la suite quede en rojo lo menos posible: primero los literales, al final la versión del aviso y su huella (design.md §1). Anclar la huella antes de terminar los textos es anclar un texto a medias.

## 0. Punto de partida

- [ ] **0.1** Rebasar sobre `main` con T-014 ya mergeado y volver a correr el censo del nombre viejo (`NecesitoUno`/`necesitouno`, sin distinguir mayúsculas) sobre `src/`, `tests/`, `prisma/`, `docs/`, `openspec/specs/`, `README.md`, `CLAUDE.md`, `.env.example`, `package.json` y `.github/`. Anotar en el reporte de la etapa los literales nuevos que T-014 haya sumado (design.md §4). *Verificable: la lista del censo queda escrita antes de tocar nada.*

## 1. Marca visible

- [ ] **1.1** Header: el wordmark dice "EnMiRumbo" y sigue enlazado a la home. *Verificable: la prueba del header espera el wordmark nuevo.*
- [ ] **1.2** Footer: la identificación dice "EnMiRumbo" (sin localidad pegada) y la línea "Hecho para los vecinos de Tizayuca, Hidalgo." queda **intacta**, carácter por carácter. *Verificable: prueba que exige las dos cosas a la vez.*
- [ ] **1.3** Imagen Open Graph (`src/app/opengraph-image.tsx`): el wordmark dibujado dice "EnMiRumbo", "Tizayuca" se queda debajo como línea de contexto (más chica y separada, no pegada al nombre) y el texto alternativo pasa a "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp". *Verificable: la prueba de artefactos SEO revisa el texto alternativo; el wordmark se comprueba a ojo una vez.*
- [ ] **1.4** Comentario de cabecera de `src/app/globals.css`: nombra el proyecto con la marca nueva. *Verificable: censo.*

## 2. Metadata y títulos

- [ ] **2.1** `src/lib/seo/metadata.ts`: `TITULO_BASE` pasa a "EnMiRumbo — Encuentra negocios y servicios en Tizayuca" y `NOMBRE_DEL_SITIO` a "EnMiRumbo"; la plantilla `«Título» — EnMiRumbo` y el `siteName` cuelgan de ahí y no se tocan a mano. *Verificable: pruebas de metadata (home con el título base, categoría con la plantilla).*
- [ ] **2.2** Títulos propios con la marca escrita a mano: `TITULO_BUSCAR` pasa a "Buscar — EnMiRumbo" y el título del panel a "Panel de revisión — EnMiRumbo". *Verificable: pruebas de esas dos páginas.*
- [ ] **2.3** Títulos y descripciones de las dos páginas legales en `src/lib/legales/textos.ts`: "Aviso de privacidad — EnMiRumbo", "Términos y condiciones — EnMiRumbo" y las descripciones, que pasan a hablar de "EnMiRumbo" sin localidad pegada. *Verificable: `tests/legales-paginas.test.ts`.*

## 3. Mensajes de WhatsApp

- [ ] **3.1** `src/lib/admin/textos.ts`: el mensaje de verificación abre con "Hola, te escribo de EnMiRumbo, el directorio de negocios de Tizayuca." (es el primer contacto) y los de publicación, rechazo y despublicación dicen "EnMiRumbo" a secas. Ninguna otra palabra cambia. Si T-014 ya reescribió el de publicación para incluir el enlace de gestión, manda su texto y aquí solo cambia la marca. *Verificable: `tests/admin-textos.test.ts` y las pruebas de las pantallas de confirmación.*
- [ ] **3.2** `src/lib/enlaces.ts`: `MENSAJE_WHATSAPP_PRELLENADO` pasa a "Hola, te vi en EnMiRumbo. ¿Me das informes?". *Verificable: `tests/directorio-enlaces.test.ts`.*
- [ ] **3.3** Si T-014 agregó mensajes nuevos (aviso con enlace de gestión, "Perdí mi enlace", avisos de edición aprobada o rechazada), pasarles la misma regla de marca. *Verificable: el censo de 0.1 queda en cero para `src/lib/`.*

## 4. Textos legales (sin tocar la versión todavía)

- [ ] **4.1** Aviso integral: la introducción presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca" y la sección "Quién es responsable de tus datos" dice "El responsable del directorio EnMiRumbo…". Nada más de ese texto cambia. *Verificable: prueba que compara el texto publicado con el de la spec.*
- [ ] **4.2** Términos: la entrada lleva el descriptor ("Estas son las reglas de EnMiRumbo, el directorio de negocios de Tizayuca, para los negocios…"), el encabezado pasa a "Qué es EnMiRumbo" y los dos párrafos del deslinde dicen "EnMiRumbo" a secas. Nada más. *Verificable: misma prueba, lado de términos.*
- [ ] **4.3** `src/lib/registro/textos.ts`: `TEXTO_AVISO_PRIVACIDAD` (aviso simplificado) abre con "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí…". *Verificable: `tests/registro-pagina.test.ts`.*
- [ ] **4.4** Repasar en voz alta las tres primeras menciones (aviso, términos, mensaje de verificación) antes de anclar nada: son las frases donde el descriptor puede sonar forzado y, una vez anclada la huella, corregirlas estrena versión. *Verificable: la lectura queda anotada en el reporte de la etapa.*
- [ ] **4.5** Confirmar que `contacto@enmirumbo.com` ya recibe correo **antes** de publicarlo (el fundador tiene que activar el reenvío en el registrador). *Verificable: nota en el reporte de la etapa con la fecha de la confirmación.*
- [ ] **4.6** Sustituir `CORREO_ARCO_PLACEHOLDER` y `CORREO_CONTACTO_PLACEHOLDER` por `contacto@enmirumbo.com` en sus tres apariciones y sacarlos de `PLACEHOLDERS_LEGALES`, dejando los otros cinco. *Verificable: la lista de placeholders pendientes queda en cinco y las páginas siguen mostrando la marca de borrador.*

## 5. Versión del aviso (después de 4, nunca antes)

- [ ] **5.1** `src/lib/legales/version.ts`: `VERSION_AVISO` pasa de `"1"` a `"2"`. *Verificable: la página del aviso muestra "Versión 2 · …" y el formulario "Estás aceptando la versión 2 del aviso de privacidad." sin tocar ninguna de las dos superficies.*
- [ ] **5.2** `tests/aviso-version.test.ts`: agregar el renglón `["2", <huella que imprime el fallo>]` a la tabla, **sin tocar** el renglón de la `1`. *Verificable: el guardián pasa y la tabla tiene dos entradas, la primera idéntica a la de antes.*
- [ ] **5.3** Prueba de que una constancia con versión `1` sigue mostrándose como `1` en el panel y de que el envío de un formulario que declara la `1` con la `2` vigente muestra "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." *Verificable: dos casos nuevos, uno en el panel y otro en registro.*

## 6. Guardián anti-regresión

- [ ] **6.1** Suite nueva que recorre el código de las superficies del sitio (`src/`) y falla, nombrando el archivo, si aparece la marca anterior en cualquier combinación de mayúsculas **o la forma compuesta "EnMiRumbo Tizayuca"**. *Verificable: se prueba en verde hoy y en rojo introduciendo cada uno de los dos literales a propósito en un doble.*
- [ ] **6.2** El guardián NO alcanza la documentación histórica (`docs/devlog/`, `docs/decisiones/`, tickets cerrados, `openspec/changes/archive/`, `docs/metricas-pipeline.md`). *Verificable: el caso que prueba que esos archivos no lo hacen fallar.*

## 7. Suites existentes

- [ ] **7.1** Actualizar las suites que fijan el literal viejo: `legales-paginas`, `admin-textos`, `layout`, `seo-metadata`, `seo-artefactos`, `seo-seguridad-adversarial`, `registro-pagina`, `directorio-enlaces`, `admin-despublicar-borrado`, `analitica-adversarial`. *Verificable: `npm test` en verde.*
- [ ] **7.2** Correr la suite completa y el build de producción. *Verificable: los dos en verde, sin advertencias nuevas.*

## 8. Infraestructura y ejemplos (nada visible al público)

- [ ] **8.1** `.env.example`: el ejemplo de `SITIO_URL` pasa a `https://enmirumbo.com`. *Verificable: censo y la prueba de configuración si menciona el ejemplo.*
- [ ] **8.2** `package.json` (`db:local`, `db:local:detener`) y `.github/workflows/ci.yml` (`POSTGRES_DB` y `DATABASE_URL`) usan `enmirumbo`. Dejar en el PR la nota de recrear la base local con `npm run db:local` y volver a sembrar. *Verificable: CI en verde con la base renombrada.*
- [ ] **8.3** `src/lib/prisma.ts`: el nombre del singleton global deja de citar la marca anterior. *Verificable: censo.*

## 9. Documentación del repo

- [ ] **9.1** `README.md`: título y menciones. *Verificable: censo.*
- [ ] **9.2** `docs/PRD.md`: nota de rebrand fechada (2026-09-04) en la cabecera de cambios y actualización de §11 "Marca resuelta" (el dominio ya está comprado: `enmirumbo.com`). *Verificable: el PRD no nombra la marca anterior salvo en el registro histórico de cambios.*
- [ ] **9.2-bis** `docs/PRD.md` §1: sustituir la explicación del nombre viejo ("El nombre refleja el momento exacto del usuario: 'necesito un plomero'…") por el relato aprobado: **"EnMiRumbo — el directorio de los negocios de tu rumbo"**, con su explicación ('rumbo' es como los vecinos llaman a su zona, y sostiene la expansión a otras poblaciones de T-017). *Verificable: la línea aprobada está en §1, palabra por palabra.*
- [ ] **9.3** `CLAUDE.md` y `openspec/project.md`: encabezado y descripción del proyecto. *Verificable: censo.*
- [ ] **9.4** `docs/despliegue.md`: título y los ejemplos de dominio (`necesitouno.mx` → `enmirumbo.com`) en dominio de Vercel, `SITIO_URL`, cadena de conexión de ejemplo, archivo de entorno fuera del repo y las URLs de las tareas programadas y de las comprobaciones con `curl`. *Verificable: censo sobre el archivo.*
- [ ] **9.4-bis** `docs/despliegue.md`, prueba de humo (§9): agregar el check "mandar un correo a `contacto@enmirumbo.com` y confirmar que llega", como paso obligatorio antes del lanzamiento. El aviso y los términos ya publican ese canal, así que el día que se retire la marca de borrador tiene que estar probado. *Verificable: el paso aparece en la lista de la prueba de humo.*
- [ ] **9.5** `docs/estrategia-lanzamiento.md`: título, el guion de siembra puerta a puerta y las dos ideas de video, reescritos sobre el relato aprobado ("EnMiRumbo — el directorio de los negocios de tu rumbo"), que sustituye al juego de palabras del nombre viejo. *Verificable: censo sobre el archivo y la línea aprobada presente en el guion.*
- [ ] **9.6** Documentos vivos que lo nombran de paso: `docs/backlog.md`, `docs/proceso.md`, `docs/revision-visual-pendiente.md`. *Verificable: censo.*
- [ ] **9.7** Confirmar que la historia quedó intacta: `docs/devlog/`, `docs/decisiones/`, tickets cerrados, `openspec/changes/archive/` y `docs/metricas-pipeline.md` siguen diciendo "NecesitoUno". *Verificable: `git diff --stat` no toca esas rutas.*

## 10. Cierre

- [ ] **10.1** Censo final: la marca anterior solo aparece en la documentación histórica listada en 9.7, y la forma compuesta "EnMiRumbo Tizayuca" no aparece en ninguna parte. *Verificable: la salida del censo cabe en el reporte del PR.*
- [ ] **10.2** Revisión visual a 390px con viewport emulado de home, ficha, registro y las dos páginas legales: el wordmark nuevo no desborda ni parte el header. *Verificable: capturas con el viewport en 390px, no por tamaño de ventana.*
