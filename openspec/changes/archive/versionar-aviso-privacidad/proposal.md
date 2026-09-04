# Propuesta: versionar-aviso-privacidad

**Ticket:** `docs/tickets/T-012-version-del-aviso.md` (E6 derivada — hallazgo del validador de T-007; P1, recomendado antes del lanzamiento)
**PRD:** §8 Legal (LFPDPPP: "se requiere consentimiento y aviso de privacidad"; "aviso de privacidad simplificado en el formulario (checkbox obligatorio) que remite al aviso integral"; procedimiento de cambios del aviso), §6.3 (el rechazado "puede corregir y volver a enviar")

## Por qué

Hoy la ficha guarda `consintioAvisoEn` —**cuándo** consintió el negocio— pero no **qué texto** tenía enfrente, y el aviso ya cambió una vez dentro del propio T-007 (la enmienda de la auditoría acotó el plazo de 90 días y agregó el botón "Cómo llegar" y la foto). Sin esa pieza, la constancia que exige la LFPDPPP (PRD §8) prueba una fecha contra un texto que ya no existe: el validador de T-007 lo dejó como ticket recomendado previo al lanzamiento. Este change ata la constancia al texto: versión visible, versión guardada, y un test que impide que el texto avance sin que la versión avance con él.

## Qué cambia

- **El aviso estrena identificador de versión.** Un literal único (`1` de arranque) declarado en un solo lugar del código, visible en `/aviso-de-privacidad` junto a la línea que ya existe: "Versión 1 · Última actualización: [FECHA DE PUBLICACIÓN]", y visible también en el bloque de consentimiento del formulario, antes de la casilla: "Estás aceptando la versión 1 del aviso de privacidad."
- **Test guardián que ata versión y texto.** La verificación automática calcula una huella del contenido del aviso —el simplificado del formulario, el literal de la casilla y el integral completo— y la compara contra la huella anclada para la versión vigente. Cambiar una coma del aviso sin subir la versión deja la suite en rojo, con el mensaje de qué hacer. La tabla de huellas vive en el test, no junto al texto, para que nadie regenere las dos cosas de un tirón sin darse cuenta.
- **La ficha guarda la versión aceptada.** Migración con tres columnas nulables: `consintioAvisoVersion` (la versión de la constancia original, que viaja con `consintioAvisoEn` y como él **nunca** se sustituye) y el par `reconsintioAvisoEn` / `reconsintioAvisoVersion`, que solo se llena cuando un reenvío acepta una versión **distinta** de la de la constancia original.
- **Nadie consiente un texto que no tuvo enfrente.** El formulario manda de vuelta la versión con la que se pintó; si el servidor procesa el envío con otra versión vigente (el aviso cambió mientras el dueño llenaba), el registro no se guarda: el formulario se vuelve a mostrar con el texto nuevo, la casilla desmarcada y el mensaje "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." La versión que se guarda es siempre la que el servidor tiene vigente: el cliente no puede fijarla, solo puede provocar que se le vuelva a pedir la casilla.
- **El reenvío tras rechazo queda definido** (criterio 5 del ticket): conserva la constancia original intacta —fecha y versión—, y si la versión vigente es otra, anota aparte la reaceptación con su fecha. Un reenvío con la misma versión no cambia nada de esto.
- **El panel muestra la versión aceptada** en el detalle del registro, junto a la fecha del consentimiento, y la reaceptación cuando existe. Las fichas anteriores al versionado se muestran como "versión no registrada", no se les inventa una.

## Capacidades afectadas

- `paginas-legales` (MODIFIED + ADDED): la página del aviso muestra su versión; se agrega la regla de versión única declarada en un solo lugar y el guardián versión↔texto.
- `modelo-datos` (ADDED): las tres columnas nuevas, la migración sobre una base con datos, la regla de que versión y timestamp viajan juntos, y el seed de demostración.
- `registro-negocio` (MODIFIED): el alta sella la versión vigente; el bloque de consentimiento la muestra; el envío contra una versión que ya cambió se rechaza con mensaje propio; el reenvío tras rechazo registra la reaceptación sin tocar la constancia original.
- `revision-admin` (MODIFIED): el detalle del registro muestra la versión aceptada y, si la hay, la reaceptación; nada de esto sale del panel.

## Impacto en código (alto nivel)

- Módulo nuevo `src/lib/legales/version.ts` con el literal de versión y la función que arma el contenido versionado del aviso (la que el guardián hashea). Lo leen `src/lib/legales/textos.ts` / la página del aviso y el bloque de consentimiento del registro.
- `src/components/legales/documento-legal.tsx`: la línea de "Última actualización" antepone "Versión N · ".
- `src/components/registro/aviso-consentimiento.tsx` y `src/lib/registro/textos.ts`: línea visible con la versión, campo oculto con la versión pintada y mensaje de error nuevo.
- `prisma/schema.prisma` + migración: `consintioAvisoVersion`, `reconsintioAvisoEn`, `reconsintioAvisoVersion` (nulables, sin default).
- `src/lib/registro/validacion.ts` y `src/lib/registro/procesar.ts`: comparación de versiones, sellado en el alta y regla de reaceptación en el reenvío (bloque 4b).
- `src/lib/admin/consultas.ts` y `src/components/admin/detalle-registro.tsx`: los campos nuevos en la proyección del panel y en el detalle. `src/lib/directorio.ts` no cambia: la proyección pública es una lista explícita y no los incluye.
- `prisma/seed-demo.ts`: los negocios ficticios nacen con su versión.
- Tests: suite nueva del guardián; casos nuevos en `tests/registro-reenvio.test.ts`, `tests/registro-accion.test.ts`, `tests/registro-pagina.test.ts`, `tests/legales-paginas.test.ts`, `tests/admin-paginas.test.ts` y `tests/legales-adversarial.test.ts`.
- Sin dependencias nuevas.

## Fuera de este change

- **Versionar los términos y condiciones.** El ticket habla del aviso (simplificado e integral), que es lo que la casilla acepta. Los términos hoy no se aceptan con casilla; si se decide que también deben versionarse, es su propio ticket.
- **Historial completo del texto de cada versión.** El repo git es el historial; aquí solo queda anclada la huella de cada versión, que es lo que permite comprobar contra qué texto se firmó.
- **Re-solicitar el consentimiento a las fichas ya publicadas cuando el aviso cambie.** Es decisión legal humana (E6-3). Consecuencia a la vista: cuando la revisión legal estrene la versión 2, todas las fichas existentes se quedan con su versión 1 registrada, y el aviso ya promete avisar por WhatsApp los cambios importantes antes de aplicarlos.
- **Completar los placeholders del aviso.** Los pone una persona; hacerlo cambia el texto y, por esta misma spec, obliga a estrenar versión.
- **Mostrar la versión en la ficha pública o en algún reporte para el titular.** Es un dato interno del panel, como la fecha de registro.
- **Rellenar la versión de las fichas que ya existen.** Se quedan nulas a propósito: nadie puede afirmar hoy qué texto tuvieron enfrente sin inventarlo.

## Dudas resueltas en la aprobación

1. **Tres columnas**: aprobadas. La constancia es un par (cuándo + qué texto) y la reaceptación otro; pisar versiones produciría constancias falsas — inaceptable en evidencia LFPDPPP.
2. **Rechazar el envío con aviso cambiado a media captura**: aprobado. Es la única forma de que "marcó la casilla con el texto nuevo enfrente" sea literalmente verdad; el camino de error es raro (minutos tras un deploy que estrene versión) y el mensaje es honesto.
3. **Versión como entero creciente**: aprobada. Re-solicitar consentimiento a fichas existentes cuando estrene la versión 2 sigue siendo decisión humana con la revisión legal (E6-3).
