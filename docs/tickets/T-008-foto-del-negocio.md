# T-008 · Habilitar la foto del negocio en el registro y el directorio

**Estado:** en-desarrollo
**Prioridad:** P0
**Épica:** E1-3 (docs/backlog.md)
**Referencias PRD:** §6.1 (política de foto), §6.2 (tarjetas y ficha con foto), §6.3 (el admin rechaza fotos que no cumplan)
**Depende de:** T-003 (formulario), T-004 (directorio), T-005 (el admin revisa la foto en el panel)
**OpenSpec change:** `agregar-foto-negocio`
**PR:** —

## Contexto

El formulario omitió la foto (decisión de alcance de T-003) y el directorio muestra placeholders. La foto es lo que hace que una tarjeta se sienta real y da confianza al vecino. Reglas del PRD §6.1: una sola foto desde la galería, del local/productos/trabajo, sin personas reconocibles, máx. 5 MB de entrada, comprimida en el servidor; el admin la ve en el panel y rechaza las que no cumplan. Cierra también el hallazgo M1 de T-004: `fotoUrl` debe validarse antes de renderizarse.

## Criterios de aceptación

- [ ] El formulario de registro acepta una foto opcional desde la galería del celular (input file con `accept` de imagen), rechazando en el servidor archivos >5 MB o que no sean imagen real (contenido, no extensión)
- [ ] La imagen se procesa en el servidor según ADR-006: comprimida/redimensionada a un tamaño razonable para tarjeta y ficha, sin metadatos EXIF (la foto puede traer GPS del celular — dato personal que no debe publicarse)
- [ ] La foto solo se sirve en fichas publicadas; las de registros en revisión o rechazados no son accesibles públicamente
- [ ] Tarjetas del listado y ficha muestran la foto real cuando existe (reemplazan el placeholder), con `alt` razonable y sin romper el presupuesto de rendimiento (<2s en 4G)
- [ ] `fotoUrl`/la referencia interna solo admite valores generados por el servidor (M1 de T-004: nada externo ni `data:` llega al render)
- [ ] El panel del admin muestra la foto del registro en revisión (su política de rechazo ya existe en el PRD §6.3; el motivo de rechazo libre de T-005 basta)
- [ ] El reenvío tras rechazo permite cambiar o quitar la foto; borrar el negocio (hard delete) elimina también su archivo
- [ ] La política de foto del PRD §6.1 aparece como texto de ayuda del campo, en español llano

## Fuera de alcance de este ticket

- Múltiples fotos, recorte o edición en el cliente
- CDN o almacenamiento externo si ADR-006 decidió otra cosa para el MVP
- Moderación automática de imágenes

## Notas

- ADR-006 define dónde viven los archivos; la spec debe citarlo y no re-decidirlo. Si el ADR exige decisión de deploy pendiente (E0-3), la spec propone lo local-compatible y lo anota.
- Compresión en servidor: evaluar `sharp` (dependencia nueva → justificarla contra el ADR y el presupuesto; es el estándar de facto en Next).
- Este ticket toca el formulario (`src/components/registro/`), el procesamiento (`src/lib/registro/`), el directorio (tarjeta/ficha) y el panel (detalle) — coordinar con T-007, que corre en paralelo y toca `aviso-consentimiento.tsx` y el footer: archivos distintos, mismo cuidado en la fusión.
