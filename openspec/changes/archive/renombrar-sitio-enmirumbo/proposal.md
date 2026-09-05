# Propuesta: renombrar-sitio-enmirumbo

**Ticket:** `docs/tickets/T-019-rebrand-enmirumbo.md` (P0, épica E6)
**PRD:** §1 y §2 (la identidad del producto y su posicionamiento hiperlocal), §6.2 (el directorio público: header, ficha y el WhatsApp prellenado que sale del sitio), §8 (LFPDPPP: el aviso de privacidad y los términos nombran al sitio responsable), §9 (plan de lanzamiento: el material de siembra usa la marca) y §11 ("Marca resuelta", la decisión que este change enmienda)

## Por qué

El fundador compró el dominio definitivo `enmirumbo.com` y decidió el 2026-09-04 que la marca acompañe al dominio: el sitio deja de llamarse "NecesitoUno" y pasa a llamarse **"EnMiRumbo"** (T-019, contexto). El nombre viejo no vive solo en el header: está fijado en el título del documento y la vista previa al compartir (PRD §9), en los cuatro mensajes de WhatsApp que el panel arma para el admin (PRD §6.3), en el mensaje prellenado con el que un vecino contacta a un negocio (PRD §6.2) y —lo delicado— dentro del texto aprobado del aviso de privacidad y de los términos (PRD §8). Hacerlo a medias deja al directorio presentándose con dos nombres justo antes del lanzamiento, así que el cambio se hace completo y de una vez.

## Qué cambia

**La regla de sustitución, para que no haya interpretación libre:**

- El wordmark suelto "NecesitoUno" pasa a **"EnMiRumbo"** (junto, con `M` y `R` mayúsculas, sin espacios).
- **La forma compuesta desaparece.** "NecesitoUno Tizayuca" NO se convierte en "EnMiRumbo Tizayuca": el fundador ya había rechazado ese patrón cuando se quitó la localidad del encabezado, y la resolución del 2026-09-04 lo cierra. Donde el contexto geográfico hace falta va como **descriptor**: "EnMiRumbo, el directorio de negocios de Tizayuca" en la primera mención de cada superficie larga (aviso, términos y el mensaje de primer contacto del panel), y "EnMiRumbo" a secas de ahí en adelante. La localidad nunca es apellido de la marca.
- **Títulos SEO:** conservan la geografía donde ya la tenían, pero como descriptor. El título base pasa de "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" a **"EnMiRumbo — Encuentra negocios y servicios en Tizayuca"**; la plantilla de las páginas con título propio queda en `«Título» — EnMiRumbo`. Este change **no** generaliza "Tizayuca" (eso es T-017).
- **Mensaje del vecino:** "Hola, te vi en EnMiRumbo. ¿Me das informes?", sin descriptor: el negocio que lo recibe ya sabe en qué municipio está.
- La línea del pie **"Hecho para los vecinos de Tizayuca, Hidalgo." se queda exactamente igual**, y es la que sostiene el posicionamiento hiperlocal del footer ahora que la identificación es solo "EnMiRumbo".
- El dominio de ejemplo de la documentación pasa de `necesitouno.mx` a **`https://enmirumbo.com`**.
- La historia **no se reescribe**: devlogs, ADRs, tickets ya cerrados y `openspec/changes/archive/` conservan el nombre con el que se escribieron.

**Superficies del producto que cambian:**

- **Marca visible** (`layout-base`): el wordmark del header, la identificación del footer, el título base del documento, la plantilla `«Título» — EnMiRumbo` que heredan las páginas con título propio, el nombre del sitio en la vista previa al compartir y el wordmark de la imagen Open Graph.
- **Mensajes de WhatsApp del panel** (`revision-admin`): los cuatro literales prellenados. El de verificación —primer contacto con ese negocio— se presenta como "Hola, te escribo de EnMiRumbo, el directorio de negocios de Tizayuca."; los de publicación, rechazo y despublicación dicen "EnMiRumbo" a secas.
- **Mensaje prellenado del vecino** (`directorio-publico`): "Hola, te vi en EnMiRumbo. ¿Me das informes?". Hoy ese literal vive solo en el código y en la propuesta archivada de T-004; este change lo fija en la spec, porque es texto público con la marca dentro.
- **Textos legales** (`paginas-legales`): el aviso integral y los términos presentan al sitio con el descriptor en su primera mención y con la marca sola en las otras cinco, donde hoy dicen el nombre viejo. Como el texto publicado del aviso cambia, **estrena versión: `VERSION_AVISO` pasa de `1` a `2`** y se ancla su huella nueva, sin tocar la huella anclada de la `1` (mecánica de T-012). Los términos no se versionan.
- **Correo del directorio** (`paginas-legales`, nota del fundador del 2026-09-04 en el ticket): con el dominio comprado, los placeholders del correo ARCO y del correo de contacto se sustituyen por `contacto@enmirumbo.com` en sus tres apariciones. Es un cambio del texto publicado del aviso y viaja en la **misma versión `2`**, no en una tercera. Los demás placeholders (nombre del responsable, domicilio, WhatsApp del directorio, fecha de publicación y jurisdicción) siguen pendientes de la revisión legal, así que la marca de borrador se queda donde está.
- **Consentimiento del formulario** (`registro-negocio`): el aviso simplificado abre con "EnMiRumbo, el directorio de negocios de Tizayuca, usa los datos que escribes aquí…", y la línea de versión pasa a decir "Estás aceptando la versión 2 del aviso de privacidad.".
- **Guardián anti-regresión** (`layout-base`): la suite gana una prueba que falla si reaparece el nombre viejo **o la forma compuesta "EnMiRumbo Tizayuca"** en cualquier superficie servida del sitio. Es lo que permite cerrar el barrido después de que T-014 mergee sus literales nuevos.

## Capacidades afectadas

- `layout-base` — MODIFIED: el layout con header y footer (con la enmienda que prohíbe la forma compuesta), y la metadata base con su título, su plantilla y su vista previa. ADDED: el guardián que verifica que ni el nombre anterior ni la forma compuesta aparecen en ninguna superficie servida.
- `paginas-legales` — MODIFIED: la página del aviso (línea de versión), la declaración de la versión vigente, el guardián de huella (redactado sin atarlo a un número concreto), el texto completo del aviso, el texto completo de los términos, el requirement del deslinde como intermediario y el de placeholders y marca de borrador (el correo sale de la lista de pendientes). ADDED: el requirement que fija qué implica estrenar la versión `2`.
- `registro-negocio` — MODIFIED: "Consentimiento con aviso simplificado visible y constancia" (texto del aviso simplificado y línea de versión).
- `revision-admin` — MODIFIED: los cuatro requirements que fijan mensajes prellenados de WhatsApp. ADDED: la regla de que ningún mensaje del panel use la marca anterior ni la forma compuesta.
- `directorio-publico` — ADDED: el requirement que fija el literal del mensaje prellenado del vecino.
- `modelo-datos` — **no cambia**: el esquema, las migraciones y los seeds no contienen la marca (los seeds usan datos ficticios de negocios, verificado en el censo). Estrenar versión del aviso no toca la base: `consintioAvisoVersion` es una columna de texto que ya existe.

## Impacto en código (alto nivel)

- **Marca y SEO:** `src/components/header.tsx`, `src/components/footer.tsx`, `src/lib/seo/metadata.ts` (`TITULO_BASE`, `NOMBRE_DEL_SITIO`, del que ya cuelgan la plantilla y el `siteName`), `src/app/opengraph-image.tsx`, `src/app/(publico)/buscar/page.tsx` (`TITULO_BUSCAR`), `src/app/admin/page.tsx` (título del panel), comentario de cabecera de `src/app/globals.css`.
- **Mensajes:** `src/lib/admin/textos.ts` (cuatro plantillas) y `src/lib/enlaces.ts` (`MENSAJE_WHATSAPP_PRELLENADO`).
- **Legales y versión:** `src/lib/legales/textos.ts` (títulos, descripciones, los seis literales de marca dentro del aviso y los términos, y los dos placeholders de correo, que salen de `PLACEHOLDERS_LEGALES`), `src/lib/registro/textos.ts` (`TEXTO_AVISO_PRIVACIDAD`), `src/lib/legales/version.ts` (`VERSION_AVISO = "2"`) y `tests/aviso-version.test.ts` (renglón nuevo en la tabla de huellas; el de la `1` no se toca).
- **Pruebas:** once suites fijan el literal viejo (`legales-paginas`, `admin-textos`, `layout`, `seo-metadata`, `seo-artefactos`, `seo-seguridad-adversarial`, `registro-pagina`, `directorio-enlaces`, `admin-despublicar-borrado`, `analitica-adversarial`, `aviso-version`), más la suite nueva del guardián anti-regresión.
- **Infraestructura y ejemplos:** `.env.example` (ejemplo de `SITIO_URL`), `.github/workflows/ci.yml` y `package.json` (`db:local`) usan `necesitouno` como nombre de base de datos, y `src/lib/prisma.ts` como nombre del singleton global. Nada de eso es visible al público; se renombra por coherencia del repo (que es público) y con la nota de recrear la base local.
- **Documentación viva:** `README.md`, `docs/PRD.md`, `CLAUDE.md`, `openspec/project.md`, `docs/despliegue.md`, `docs/estrategia-lanzamiento.md`, `docs/backlog.md`, `docs/proceso.md`, `docs/revision-visual-pendiente.md`.

## Fuera de este change

- **Renombrar el repositorio de GitHub y el proyecto de Vercel, y apuntar el dominio** `enmirumbo.com`: es operación del fundador (T-019, fuera de alcance). El sitio ya toma su URL pública de `SITIO_URL`, así que el código no necesita cambios para eso.
- **T-017 (localidad configurable):** "Tizayuca" sigue escrito a mano en todos lados. Este change tiene la tentación a la vista —cada literal que se toca es uno que T-017 volverá a tocar— y aun así no centraliza nada.
- **Logo o identidad gráfica:** hoy la marca es tipográfica y así se queda; la imagen Open Graph solo cambia la palabra.
- **Renombrar `NecesitoUno` en la historia del repo** (devlog, ADRs, tickets cerrados, changes archivados, `docs/metricas-pipeline.md`): son documentos fechados; corregirlos falsearía lo que se decidió cuando se decidió.
- **Los prompts de `.claude/agents/*.md`**, que nombran al proyecto: son configuración del pipeline, no producto. Se anota como duda para que el fundador decida (ver duda 1).
- **Revisar si el texto legal necesita algo más** (la revisión legal profesional sigue pendiente, E6-3): este change solo cambia la marca y publica el correo del directorio; ni una coma más del aviso o de los términos. Los otros cinco placeholders y la marca de borrador siguen ahí, y así deben seguir.

## Decisiones ya resueltas (fundador, 2026-09-04, vía el orquestador)

Se registran aquí porque cambian literales que la spec fija y porque, una vez anclada la huella del aviso, reabrirlas cuesta otra versión:

1. **Nada de forma compuesta.** "EnMiRumbo" sola; el contexto geográfico va como descriptor ("EnMiRumbo, el directorio de negocios de Tizayuca") en la primera mención del aviso, de los términos y del mensaje de primer contacto del panel. El mensaje del vecino queda "Hola, te vi en EnMiRumbo. ¿Me das informes?". Los títulos SEO conservan la geografía donde ya la tenían, como descriptor.
2. **El correo viaja en la versión `2`**, junto con el rebrand. Mitigación del riesgo del buzón: `docs/despliegue.md` gana en su prueba de humo el check de mandar un correo a `contacto@enmirumbo.com` y confirmar que llega, antes del lanzamiento. Como los placeholders del responsable siguen ahí, la marca de borrador sigue visible y ningún canal se publica como definitivo.
3. **Relato de marca aprobado:** "EnMiRumbo — el directorio de los negocios de tu rumbo" ('rumbo' es como los vecinos llaman a su zona, y sostiene la expansión de T-017). Con esa línea se actualizan el PRD §1 y el guion de siembra.

## Dudas abiertas (a resolver antes de aprobar)

1. **¿Se renombra también fuera del producto?** Los prompts de `.claude/agents/*.md` y los nombres de base de datos (`necesitouno` en `package.json`, en el CI y en el singleton de Prisma) llevan el nombre viejo. La propuesta renombra los de base de datos (repo público, coherencia, y recrear la base local es de un comando) y deja los prompts de los agentes fuera. Si el fundador prefiere lo contrario, es un ajuste de `tasks.md`, no de las specs.
2. **¿El wordmark nuevo cabe igual en el header?** "EnMiRumbo" es dos caracteres más corto que "NecesitoUno", así que no debería apretar nada, pero las mayúsculas internas cambian el ritmo tipográfico y el fundador ya devolvió una revisión visual por el header. La tarea 10.2 pide capturas a 390px con viewport emulado antes del PR; si no le gusta cómo se ve, es un ajuste de estilo y no toca ninguna spec.
