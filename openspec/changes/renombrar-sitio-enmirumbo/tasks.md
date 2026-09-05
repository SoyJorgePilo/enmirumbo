# Tareas: renombrar-sitio-enmirumbo

Orden pensado para que la suite quede en rojo lo menos posible: primero los literales, al final la versión del aviso y su huella (design.md §1). Anclar la huella antes de terminar los textos es anclar un texto a medias.

## 0. Punto de partida

- [x] **0.1** ~~Rebasar sobre `main` con T-014 ya mergeado~~ **REPLANTEADA:** T-014 no había mergeado cuando arrancó esta etapa, así que la base es `origin/main` tal cual (instrucción del orquestador). El censo se corrió igual y quedó escrito en `reports/b-dev.md`; el barrido posterior al merge de T-014 lo hace la etapa D con el guardián de la tarea 6.1, que es justo la red que design.md §4 previó para no depender de que alguien se acuerde. Rebasar y volver a correr el censo del nombre viejo (`NecesitoUno`/`necesitouno`, sin distinguir mayúsculas) sobre `src/`, `tests/`, `prisma/`, `docs/`, `openspec/specs/`, `README.md`, `CLAUDE.md`, `.env.example`, `package.json` y `.github/`. Anotar en el reporte de la etapa los literales nuevos que T-014 haya sumado (design.md §4). *Verificable: la lista del censo queda escrita antes de tocar nada.*

## 1. Marca visible

- [x] **1.1** Header: el wordmark dice "EnMiRumbo" y sigue enlazado a la home. *Verificable: la prueba del header espera el wordmark nuevo.*
- [x] **1.2** Footer: la identificación dice "EnMiRumbo" (sin localidad pegada) y la línea "Hecho para los vecinos de Tizayuca, Hidalgo." queda **intacta**, carácter por carácter. *Verificable: prueba que exige las dos cosas a la vez.*
- [x] **1.3** Imagen Open Graph (`src/app/opengraph-image.tsx`): el wordmark dibujado dice "EnMiRumbo", "Tizayuca" se queda debajo como línea de contexto (más chica y separada, no pegada al nombre) y el texto alternativo pasa a "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp". *Verificable: la prueba de artefactos SEO revisa el texto alternativo; el wordmark se comprueba a ojo una vez.*
- [x] **1.4** Comentario de cabecera de `src/app/globals.css`: nombra el proyecto con la marca nueva. *Verificable: censo.*

## 2. Metadata y títulos

- [x] **2.1** `src/lib/seo/metadata.ts`: `TITULO_BASE` pasa a "EnMiRumbo — Encuentra negocios y servicios en Tizayuca" y `NOMBRE_DEL_SITIO` a "EnMiRumbo"; la plantilla `«Título» — EnMiRumbo` y el `siteName` cuelgan de ahí y no se tocan a mano. *Verificable: pruebas de metadata (home con el título base, categoría con la plantilla).*
- [x] **2.2** Títulos propios con la marca escrita a mano: `TITULO_BUSCAR` pasa a "Buscar — EnMiRumbo" y el título del panel a "Panel de revisión — EnMiRumbo". *Verificable: pruebas de esas dos páginas.*
- [x] **2.3** Títulos y descripciones de las dos páginas legales en `src/lib/legales/textos.ts`: "Aviso de privacidad — EnMiRumbo", "Términos y condiciones — EnMiRumbo" y las descripciones, que pasan a hablar de "EnMiRumbo" sin localidad pegada. *Verificable: `tests/legales-paginas.test.ts`.*

## 3. Mensajes de WhatsApp

- [x] **3.1** `src/lib/admin/textos.ts`: el mensaje de verificación abre con "Hola, te escribo de EnMiRumbo, el directorio de negocios de Tizayuca." (es el primer contacto) y los de publicación, rechazo y despublicación dicen "EnMiRumbo" a secas. Ninguna otra palabra cambia. Si T-014 ya reescribió el de publicación para incluir el enlace de gestión, manda su texto y aquí solo cambia la marca. *Verificable: `tests/admin-textos.test.ts` y las pruebas de las pantallas de confirmación.*
- [x] **3.2** `src/lib/enlaces.ts`: `MENSAJE_WHATSAPP_PRELLENADO` pasa a "Hola, te vi en EnMiRumbo. ¿Me das informes?". *Verificable: `tests/directorio-enlaces.test.ts`.*
- [x] **3.3** *(NO APLICA en esta etapa: T-014 no había mergeado; el censo de `src/` quedó en cero igual)* Si T-014 agregó mensajes nuevos (aviso con enlace de gestión, "Perdí mi enlace", avisos de edición aprobada o rechazada), pasarles la misma regla de marca. *Verificable: el censo de 0.1 queda en cero para `src/lib/`.*

## 4. Textos legales (sin tocar la versión todavía)

- [x] **4.1** Aviso integral: la introducción presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca" y la sección "Quién es responsable de tus datos" dice "El responsable del directorio EnMiRumbo…". Nada más de ese texto cambia. *Verificable: prueba que compara el texto publicado con el de la spec.*
- [x] **4.2** Términos: la entrada lleva el descriptor ("Estas son las reglas de EnMiRumbo, el directorio de negocios de Tizayuca, para los negocios…"), el encabezado pasa a "Qué es EnMiRumbo" y los dos párrafos del deslinde dicen "EnMiRumbo" a secas. Nada más. *Verificable: misma prueba, lado de términos.*
- [x] **4.3** `src/lib/registro/textos.ts`: `TEXTO_AVISO_PRIVACIDAD` (aviso simplificado) abre con "Aviso de privacidad (resumen): EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí…". *Verificable: `tests/registro-pagina.test.ts`.*
- [x] **4.4** Repasar en voz alta las tres primeras menciones (aviso, términos, mensaje de verificación) antes de anclar nada: son las frases donde el descriptor puede sonar forzado y, una vez anclada la huella, corregirlas estrena versión. *Verificable: la lectura queda anotada en el reporte de la etapa.*
- [ ] **4.5** *(PENDIENTE DEL FUNDADOR — no la puede cerrar esta etapa)* Confirmar que `contacto@enmirumbo.com` ya recibe correo **antes** de publicarlo (el fundador tiene que activar el reenvío en el registrador). *Verificable: nota en el reporte de la etapa con la fecha de la confirmación.*
- [x] **4.6** Sustituir `CORREO_ARCO_PLACEHOLDER` y `CORREO_CONTACTO_PLACEHOLDER` por `contacto@enmirumbo.com` en sus tres apariciones y sacarlos de `PLACEHOLDERS_LEGALES`, dejando los otros cinco. *Verificable: la lista de placeholders pendientes queda en cinco y las páginas siguen mostrando la marca de borrador.*

## 5. Versión del aviso (después de 4, nunca antes)

- [x] **5.1** `src/lib/legales/version.ts`: `VERSION_AVISO` pasa de `"1"` a `"2"`. *Verificable: la página del aviso muestra "Versión 2 · …" y el formulario "Estás aceptando la versión 2 del aviso de privacidad." sin tocar ninguna de las dos superficies.*
- [x] **5.2** `tests/aviso-version.test.ts`: agregar el renglón `["2", <huella que imprime el fallo>]` a la tabla, **sin tocar** el renglón de la `1`. *Verificable: el guardián pasa y la tabla tiene dos entradas, la primera idéntica a la de antes.*
- [x] **5.3** Prueba de que una constancia con versión `1` sigue mostrándose como `1` en el panel y de que el envío de un formulario que declara la `1` con la `2` vigente muestra "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." *Verificable: dos casos nuevos, uno en el panel y otro en registro.*

## 6. Guardián anti-regresión

- [x] **6.1** Suite nueva que recorre el código de las superficies del sitio (`src/`) y falla, nombrando el archivo, si aparece la marca anterior en cualquier combinación de mayúsculas **o la forma compuesta "EnMiRumbo Tizayuca"**. *Verificable: se prueba en verde hoy y en rojo introduciendo cada uno de los dos literales a propósito en un doble.*
- [x] **6.2** El guardián NO alcanza la documentación histórica (`docs/devlog/`, `docs/decisiones/`, tickets cerrados, `openspec/changes/archive/`, `docs/metricas-pipeline.md`). *Verificable: el caso que prueba que esos archivos no lo hacen fallar.*

## 7. Suites existentes

- [x] **7.1** Actualizar las suites que fijan el literal viejo: `legales-paginas`, `admin-textos`, `layout`, `seo-metadata`, `seo-artefactos`, `seo-seguridad-adversarial`, `registro-pagina`, `directorio-enlaces`, `admin-despublicar-borrado`, `analitica-adversarial`. *Verificable: `npm test` en verde.*
- [x] **7.2** Correr la suite completa y el build de producción. *Verificable: los dos en verde, sin advertencias nuevas.*

## 8. Infraestructura y ejemplos (nada visible al público)

- [x] **8.1** `.env.example`: el ejemplo de `SITIO_URL` pasa a `https://enmirumbo.com`. *Verificable: censo y la prueba de configuración si menciona el ejemplo.*
- [x] **8.2** `package.json` (`db:local`, `db:local:detener`) y `.github/workflows/ci.yml` (`POSTGRES_DB` y `DATABASE_URL`) usan `enmirumbo`. Dejar en el PR la nota de recrear la base local con `npm run db:local` y volver a sembrar. *Verificable: CI en verde con la base renombrada (lo comprueba el CI del PR; en local la suite corrió contra una base propia).*
- [x] **8.3** `src/lib/prisma.ts`: el nombre del singleton global deja de citar la marca anterior. *Verificable: censo.*

## 9. Documentación del repo

- [x] **9.1** `README.md`: título y menciones. *Verificable: censo.*
- [x] **9.2** `docs/PRD.md`: nota de rebrand fechada (2026-09-04) en la cabecera de cambios y actualización de §11 "Marca resuelta" (el dominio ya está comprado: `enmirumbo.com`). *Verificable: el PRD no nombra la marca anterior salvo en el registro histórico de cambios.*
- [x] **9.2-bis** `docs/PRD.md` §1: sustituir la explicación del nombre viejo ("El nombre refleja el momento exacto del usuario: 'necesito un plomero'…") por el relato aprobado: **"EnMiRumbo — el directorio de los negocios de tu rumbo"**, con su explicación ('rumbo' es como los vecinos llaman a su zona, y sostiene la expansión a otras poblaciones de T-017). *Verificable: la línea aprobada está en §1, palabra por palabra.*
- [x] **9.3** `CLAUDE.md` y `openspec/project.md`: encabezado y descripción del proyecto. *Verificable: censo.*
- [x] **9.4** `docs/despliegue.md`: título y los ejemplos de dominio (`necesitouno.mx` → `enmirumbo.com`) en dominio de Vercel, `SITIO_URL`, cadena de conexión de ejemplo, archivo de entorno fuera del repo y las URLs de las tareas programadas y de las comprobaciones con `curl`. *Verificable: censo sobre el archivo.*
- [x] **9.4-bis** `docs/despliegue.md`, prueba de humo (§9): agregar el check "mandar un correo a `contacto@enmirumbo.com` y confirmar que llega", como paso obligatorio antes del lanzamiento. El aviso y los términos ya publican ese canal, así que el día que se retire la marca de borrador tiene que estar probado. *Verificable: el paso aparece en la lista de la prueba de humo.*
- [x] **9.5** `docs/estrategia-lanzamiento.md`: título, el guion de siembra puerta a puerta y las dos ideas de video, reescritos sobre el relato aprobado ("EnMiRumbo — el directorio de los negocios de tu rumbo"), que sustituye al juego de palabras del nombre viejo. *Verificable: censo sobre el archivo y la línea aprobada presente en el guion.*
- [x] **9.6** Documentos vivos que lo nombran de paso: `docs/backlog.md`, `docs/proceso.md`, `docs/revision-visual-pendiente.md`. *Verificable: censo.*
- [x] **9.7** Confirmar que la historia quedó intacta: `docs/devlog/`, `docs/decisiones/`, tickets cerrados, `openspec/changes/archive/` y `docs/metricas-pipeline.md` siguen diciendo "NecesitoUno". *Verificable: `git diff --stat` no toca esas rutas.*

## 10. Cierre

- [x] **10.1** Censo final: la marca anterior solo aparece en la documentación histórica listada en 9.7, y la forma compuesta "EnMiRumbo Tizayuca" no aparece en ninguna parte. *Verificable: la salida del censo cabe en el reporte del PR.*
- [ ] **10.2** *(PENDIENTE — requiere navegador; ver `reports/b-dev.md`)* Revisión visual a 390px con viewport emulado de home, ficha, registro y las dos páginas legales: el wordmark nuevo no desborda ni parte el header. *Verificable: capturas con el viewport en 390px, no por tamaño de ventana.*
