# Diseño: agregar-foto-negocio

Solo lo que no es obvio y no lo decide ya el ADR-006.

## 1. Dónde viven los archivos: puerto + adaptador local (ADR-006 aplicado, no re-decidido)

ADR-006 ya decidió el destino ("el storage del proveedor que gane ADR-004/007", sin sumar proveedor nuevo por las fotos) y también decidió que las fotos **no pueden vivir en el repo ni en el filesystem del hosting**. Pero ese proveedor se confirma en E0-3, que sigue abierto, y este ticket es P0. La salida que el propio ticket autoriza ("la spec propone lo local-compatible y lo anota") es:

- Un puerto chico en `src/lib/fotos/almacen.ts` con tres operaciones: `guardar(clave, variante, bytes)`, `leer(clave, variante)` y `borrar(clave)` (todas las variantes).
- Un adaptador de desarrollo que escribe en un directorio local **fuera del repositorio de trabajo versionado**, configurable por variable de entorno (`FOTOS_DIR`, con default `.fotos/` ignorado en `.gitignore`). Nada de `public/`: si las fotos vivieran en `public/` serían servidas por el servidor estático sin pasar por la comprobación de estado del §3, que es justo lo que el ticket prohíbe.
- Cuando E0-3 resuelva, se escribe el adaptador del proveedor y se cambia la variable de entorno. Ningún requirement de spec cambia: el comportamiento observable (una ruta interna que sirve la foto si el negocio está publicado) es el mismo con cualquier almacén.

Consecuencia aceptada y anotada: en un hosting serverless el adaptador local **no sirve** (filesystem efímero), así que este change no habilita el despliegue con fotos hasta que E0-3 cierre. Se puede desarrollar, probar y aprobar; el deploy con fotos depende de esa decisión.

## 2. Parámetros del procesamiento

`sharp` (justificación en `proposal.md`). Parámetros propuestos, todos verificables:

| Variante | Lado mayor | Formato | Tope de peso |
| --- | --- | --- | --- |
| `tarjeta` | 400px | WebP | 60 KB |
| `ficha` | 1200px | WebP | 250 KB |

- Se reduce, nunca se amplía (`withoutEnlargement`), conservando la proporción: la tarjeta recorta visualmente con `object-cover`, así que no hace falta recortar en el servidor y no se le corta la cabeza a nadie.
- Metadatos: no se copian. `sharp` descarta EXIF salvo que se le pida lo contrario; se agrega un test que abre el archivo servido y falla si aparece cualquier bloque EXIF/GPS. Sí se aplica la **rotación** según el EXIF antes de descartarlo (`rotate()`), o las fotos verticales de celular saldrían acostadas.
- Si con la calidad base el archivo se pasa del tope, se recomprime con calidad menor (una o dos pasadas acotadas, no un bucle abierto).
- Entrada: `limitInputPixels` a 40 megapíxeles y `failOn` estricto, que es lo que convierte "no decodifica" en el rechazo por contenido que pide el ticket. El SVG se rechaza explícitamente por formato detectado, aunque `sharp` sepa rasterizarlo: un SVG es un documento con scripts, no una foto de un taller.
- WebP para las dos variantes en vez de negociar AVIF/JPEG por navegador: una sola variante por tamaño es más simple de borrar, de contar y de razonar; WebP tiene soporte universal en los celulares que importan aquí.

## 3. Cómo se sirve la foto: route handler con comprobación de estado, no archivo estático

El criterio duro del ticket —"la foto de un registro no publicado no es accesible públicamente"— no se puede cumplir con un archivo estático servido por URL, porque la URL sobrevive al cambio de estado. Se sirve entonces con un route handler (`/api/foto/[clave]/[variante]`) que en cada petición:

1. busca el negocio por la clave; si no existe → 404;
2. si el negocio está `publicado` → sirve los bytes con caché pública moderada;
3. si no lo está → sirve solo con sesión válida del panel (mismo guardián que el resto de `/admin`), con `Cache-Control: no-store`; sin sesión, **el mismo 404** que en el caso 1, para no delatar la existencia del registro.

Ventajas: la clave opaca no es adivinable, el estado se respeta siempre, y despublicar deja de servir la foto casi de inmediato. Costo: cada foto pasa por el servidor. Con el volumen del PRD §9 (decenas de fichas) es irrelevante; si algún día pesa, la salida natural es una URL firmada del proveedor, que también respeta el estado porque se firma al renderizar.

`next/image` optimiza rutas del propio origen sin `remotePatterns`, así que la ruta se puede usar como `src` y **no** hace falta abrir el optimizador a hosts externos (lo que además mantiene cerrada la puerta que M1 de T-004 dejó señalada). El caché público del caso 2 se fija corto (del orden de una hora): una ficha se despublica poco, pero no queremos una copia inmutable circulando si pasa.

## 4. La referencia interna: clave opaca y renombrado de la columna

- La clave es aleatoria (no derivada del id del negocio ni de su nombre), de longitud suficiente para no ser enumerable, y **cambia cada vez que se sube una foto nueva**: así una foto reemplazada no queda accesible por su URL vieja ni en cachés intermedias.
- La columna `fotoUrl` del modelo pasa a llamarse `fotoClave`: el nombre viejo invita justo al error que M1 de T-004 describe (guardar ahí una URL y pintarla). Nada escribe hoy esa columna, así que el renombrado no migra datos. En SQLite se hace con `ALTER TABLE "Negocio" RENAME COLUMN`, escrito a mano en la migración: la redefinición de tabla que genera Prisma borraría los `CHECK` de `estado` y `origen` (mismo cuidado que ya se documentó en el change `agregar-buscador`).
- El validador que cierra M1 vive junto a `obtenerPaginaRegistrada` en `src/lib/enlaces.ts` (o su vecino en `src/lib/fotos/`): una función que recibe lo guardado y devuelve o la URL interna construida por el servidor, o `null`. `MarcadorFoto` deja de recibir una URL y pasa a recibir la clave; con `null` pinta el marcador de posición. Así el componente no puede pintar una URL arbitraria ni por accidente.

## 5. Orden del pipeline en el registro y limpieza de huérfanos

El orden de defensas de `src/lib/registro/procesar.ts` no cambia; la foto se inserta como paso 4.5:

1. campo trampa → 2. cupo por IP → 3. validación de campos (aquí solo se mira **tamaño y tipo declarado** de la foto, que es barato) → 4. duplicado por número → **4.5 procesar y guardar la imagen** → 5. escritura en la base.

Procesar después del paso 4 es lo que garantiza que un bot no pague CPU de imagen y que un duplicado no deje archivos. Como el paso 5 puede fallar igual (carrera de unicidad, `updateMany` que no afecta filas porque el admin ya resolvió la ficha), el guardado de la foto se envuelve en un `try/finally` lógico: si la escritura no se concreta, se borra la clave recién creada. La escritura de la base es la que manda; el almacén es lo que se compensa.

Para el reemplazo en un reenvío: primero se escribe la clave nueva, luego se actualiza la fila y **solo si la actualización afectó una fila** se borra la clave anterior. Al revés se perdería la foto de una ficha que el admin acababa de resolver.

## 6. Límite del cuerpo de las Server Actions

El default de Next para el cuerpo de una Server Action es 1 MB: con él, una foto de 3 MB fallaría con un error genérico antes de llegar a nuestra validación y el dueño vería un error feo en vez de "Esa foto pesa más de 5 MB…". Se sube `serverActions.bodySizeLimit` en `next.config.ts` a un valor ligeramente por encima de 5 MB (p. ej. `6mb`) para que **nuestro** mensaje sea el que se vea, y se deja el rechazo por tamaño en el servidor. Es configuración, no una puerta abierta: el tope real lo sigue poniendo la validación de 5 MB.

## 7. Alternativas descartadas

- **Comprimir en el cliente** antes de subir (canvas/WebAssembly): reduce la subida en 4G, pero exige JavaScript de cliente en un formulario que hoy funciona sin él y, sobre todo, no se le puede creer al cliente — el servidor tendría que validar y recomprimir igual. Doble trabajo por una mejora que el PRD no pide.
- **Guardar la foto en `public/`**: rompe el criterio de "no accesible si no está publicada" y mete archivos en el árbol del repo (ADR-006 lo prohíbe explícitamente).
- **Guardar el original además de las variantes**: útil si algún día cambian los tamaños, pero conserva el EXIF con GPS (dato personal) y multiplica el almacenamiento. ADR-006 ya asumió la consecuencia de fijar tamaños por adelantado.
- **Guardar los bytes en la base (BLOB)**: simplifica el borrado, pero hincha la base y el backup, y no sobrevive al cambio de proveedor de DB que E0-3 tiene pendiente.
