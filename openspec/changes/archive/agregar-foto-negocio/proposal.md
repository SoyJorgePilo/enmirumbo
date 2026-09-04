# Propuesta: agregar-foto-negocio

**Ticket:** `docs/tickets/T-008-foto-del-negocio.md` (E1-3; P0)
**PRD:** §6.1 (foto opcional desde la galería, política de contenido, "máx. 5 MB de entrada, comprimida en el servidor"), §6.2 (tarjetas con foto y ficha completa), §6.3 (el admin ve la foto y rechaza las que no cumplan la política), §8 (página en <2s en 4G con "imágenes comprimidas"; publicar colonia y no domicilio exacto; borrado definitivo ARCO)
**ADR:** `docs/decisiones/ADR-006-almacenamiento-imagenes.md` (dónde viven los archivos y cómo se generan las variantes). Este change **no re-decide** el ADR: lo aplica.

## Por qué

El formulario de registro dejó la foto fuera por alcance de T-003 y hoy toda tarjeta del directorio pinta el mismo marcador gris: la foto es justo lo que hace que una ficha se sienta real y le da al vecino la confianza que el PRD §6.2 le pide al directorio frente a Google Maps. El PRD §6.1 ya define la política completa (una foto, del local/productos/trabajo, sin personas reconocibles, máx. 5 MB de entrada, comprimida en el servidor) y el §6.3 encarga al admin rechazar las que no cumplan, así que lo único que falta es construirla. De paso cierra el hallazgo M1 de T-004: `fotoUrl` es hoy el único dato que llegaría al render sin ningún validador, y este change es el que empieza a escribir esa columna.

## Qué cambia

- **El formulario gana un campo de foto opcional** con la política del PRD §6.1 como texto de ayuda en español llano, un `input` de archivo que abre la galería del celular y una casilla neutra para dejar la ficha sin foto. Nada de JavaScript de cliente nuevo: la foto viaja en el mismo envío del formulario.
- **Todo lo valida el servidor y por contenido, no por extensión:** máximo 5 MB reales, y solo se acepta lo que de verdad se puede abrir como JPG, PNG o WebP (un `.jpg` que en realidad es un HTML, un SVG o una "bomba" de 100 megapíxeles se rechazan). La foto se procesa **después** del campo trampa, del cupo por IP y de la validación de campos: un bot no le cuesta CPU al servidor.
- **El servidor comprime, redimensiona y despoja la foto de sus metadatos** (ADR-006: variantes generadas al subir con `sharp` —tarjeta y ficha—, servidas por `next/image`). El original **no se conserva**: el EXIF de un celular trae GPS, que es dato personal y no tiene por qué publicarse ni guardarse (PRD §8, principio de minimización).
- **La referencia que se guarda la genera el servidor** (una clave opaca, no una URL): ningún valor mandado por el cliente puede acabar en el `src` de una imagen. Eso cierra M1 de T-004 — nada externo, ningún `data:` ni `javascript:` llega al render.
- **La foto se sirve por una ruta interna que revisa el estado del negocio en cada petición:** la de una ficha publicada se sirve; la de un registro en revisión o rechazado responde 404 igual que si no existiera, y solo el panel con sesión válida la puede ver.
- **Tarjeta y ficha muestran la foto real** cuando existe (el marcador gris queda solo para las fichas sin foto), con `alt` que nombra al negocio, dimensiones declaradas para no dar saltos de maquetación, carga diferida abajo del pliegue y topes de peso por variante para no romper el presupuesto de <2s en 4G.
- **El panel muestra la foto en el detalle del registro**, que es lo que le permite al admin aplicar la política de moderación del PRD §6.3 con el motivo de rechazo libre que ya existe desde T-005.
- **El reenvío tras un rechazo permite cambiar la foto o quitarla**, y el archivo viejo se borra al reemplazarlo; el **borrado definitivo (ARCO) se lleva también los archivos**, no solo la fila (PRD §8: el borrado tiene que ser real).

## Capacidades afectadas

- `registro-negocio` (MODIFIED + ADDED): el formulario suma el campo de foto con su política; el servidor valida tamaño/contenido, procesa y guarda la foto sin metadatos, y el reenvío tras rechazo puede cambiarla o quitarla. Se ajustan los requirements de campos, de validación por campo (la foto es la segunda excepción al "no se pierde lo capturado": el navegador nunca repuebla un campo de archivo) y de funcionamiento sin JavaScript.
- `directorio-publico` (MODIFIED + ADDED): la tarjeta pinta la foto real; la ficha la muestra; solo se pinta lo que generó el servidor (M1); la foto de un negocio no publicado no es accesible; y el peso servido queda acotado por el presupuesto de 4G.
- `revision-admin` (MODIFIED): el detalle del registro muestra la foto, únicamente con sesión válida.
- `modelo-datos` (MODIFIED + ADDED): la referencia de la foto se acota a una clave interna generada por el servidor; el borrado definitivo arrastra los archivos; el seed de demostración deja alguna ficha con foto para poder ver el directorio como lo verá el vecino.

## Impacto en código (alto nivel)

- **Dependencia nueva: `sharp`** — justificada abajo.
- `src/lib/fotos/` (módulo nuevo): validación por contenido, generación de variantes sin metadatos, clave opaca, y un pequeño puerto de almacenamiento con adaptador local para desarrollo (los archivos viven fuera del repo y fuera de git, ADR-006). El adaptador de producción se enchufa cuando E0-3 resuelva proveedor, sin cambiar nada de lo que el usuario ve.
- `src/app/api/foto/…` (route handler nuevo): sirve la variante pedida revisando estado del negocio o sesión del panel.
- `src/components/registro/formulario-registro.tsx` y `src/lib/registro/` (`validacion.ts`, `procesar.ts`, `textos.ts`): campo, mensajes y el paso de procesamiento en el orden correcto de las defensas.
- `src/components/directorio/marcador-foto.tsx`, `tarjeta-negocio.tsx`, `src/app/negocio/[ficha]/page.tsx`, `src/lib/directorio.ts`: render de la foto real y proyección de la referencia interna.
- `src/app/admin/…` (detalle del registro): bloque de foto.
- `prisma/schema.prisma` + migración (la columna pasa a guardar la clave interna), `prisma/seed-demo.ts` (fotos generadas al sembrar, sin binarios en el repo), `src/lib/negocio.ts` (borrado definitivo que arrastra archivos).
- `next.config.ts`: límite de tamaño del cuerpo de las Server Actions (el de fábrica es 1 MB y aquí entran hasta 5 MB).
- Tests: suites de procesamiento de imagen (fixtures generadas en el propio test), de la ruta que sirve fotos, adversarial de la subida y del render.

## Por qué `sharp` y no otra cosa

ADR-006 ya lo nombra como la pieza que genera las variantes al subir ("con variantes generadas al subir con `sharp`"), así que la dependencia no es una decisión nueva de esta spec, es la consecuencia de una decisión tomada. Aun así, las razones explícitas: (1) es el estándar de facto en Next.js —el propio optimizador de imágenes de Next lo usa, así que en producción va a estar instalado de todos modos—; (2) es la única forma razonable de cumplir dos requisitos que el PRD pide literalmente y que no se pueden hacer en el cliente sin confiar en él: "comprimida en el servidor" y quitar el EXIF con GPS; (3) valida por contenido real (si no decodifica, no es una imagen), que es exactamente el criterio de aceptación del ticket; y (4) su tope de píxeles de entrada protege al servidor de las bombas de descompresión. Las alternativas —`@squoosh/lib` (sin mantenimiento), procesar en el cliente (no se le puede creer al cliente) o no comprimir (rompe el presupuesto de 4G)— no cumplen. El costo es una dependencia nativa que hay que verificar en el CI.

## Fuera de este change

- **Múltiples fotos, galería, recorte o edición en el cliente** (el ticket las excluye; el PRD §6.1 habla de una foto).
- **Moderación automática de imágenes** (detección de personas, contenido explícito): la política del PRD §6.3 la aplica el admin a ojo, con el motivo de rechazo libre que ya existe.
- **Elegir el proveedor de almacenamiento de producción**: es E0-3 (ADR-004/006/007). Aquí se implementa el adaptador local de desarrollo detrás de un puerto, tal como ADR-006 anticipa; enchufar el proveedor real es un chore posterior sin cambio de comportamiento.
- **Purga de archivos huérfanos por lotes** (por ejemplo, los de registros rechazados que se eliminan a los 90 días del PRD §8): la purga de esos registros todavía no está implementada; cuando se implemente, tendrá que usar el borrado que este change deja hecho. Anotado como pendiente, no especificado aquí.
- **Foto en el enlace de gestión (P1, PRD §6.4)**: cuando exista la edición supervisada, cambiar la foto pasará por ahí; hoy solo se puede cambiar reenviando el formulario tras un rechazo.
- **Hallazgo M3 de T-004** (el registro no le avisa al negocio que su WhatsApp queda público): sigue abierto y le toca a los legales de E6/T-007.
- **Fricción contra el barrido masivo del directorio** (M5 de T-004): ahora también se podrían cosechar las fotos, pero la superficie y su remedio son los mismos de antes; sigue siendo ticket de E5/E7.
- **`robots.txt` / control de indexación de las imágenes**: es de `seo-local` (E5).

## Dudas resueltas en la aprobación

1. **HEIC/HEIF**: aprobado rechazarlo con el mensaje claro. Safari de iOS convierte HEIC a JPEG al subir por `input` en la mayoría de los casos, así que el rechazo real será raro; si la siembra demuestra lo contrario, se reabre con libheif como ticket.
2. **Casilla "Dejar mi ficha sin foto" siempre visible**: aprobada. El ruido de una casilla neutra es preferible a delatar que un número tiene ficha rechazada (misma lógica anti-oráculo del resto del formulario).
3. **Almacenamiento**: aprobado avanzar con el adaptador local detrás del puerto (`FOTOS_DIR`) que dicta ADR-006. Que las fotos no sobrevivan un deploy serverless queda anotado como condición de cierre de E0-3 — igual que `REGISTRO_ENCABEZADO_IP`.
4. **Presupuestos de peso** (tarjeta 400px/≤60 KB, ficha 1200px/≤250 KB): ratificados; son consecuencia directa del <2s en 4G del PRD §8.
