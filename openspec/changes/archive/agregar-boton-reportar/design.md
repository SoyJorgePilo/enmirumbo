# Diseño: agregar-boton-reportar

Solo las decisiones que no se caen de maduras. Lo demás sigue los patrones ya establecidos por `agregar-formulario-registro` y `agregar-panel-admin`.

## 1. Página propia para el formulario, no un bloque dentro de la ficha

El reporte vive en `/negocio/<slug>-<id>/reportar`, no en un `<details>` desplegable dentro de la ficha.

- La ficha es la página del Flujo B del PRD §7 y su presupuesto es salir a WhatsApp en menos de 2 segundos: meterle un formulario que el 99% de las visitas no va a usar le agrega marcado, campos y un `<form>` que hoy no tiene.
- Sin JavaScript de cliente (regla dura del proyecto), un formulario inline exige que el POST vuelva a renderizar la ficha completa para pintar errores, mezclando dos flujos en una sola pantalla.
- Una página aparte permite `noindex` sin tocar la indexabilidad de la ficha, que sí es SEO (PRD §8).
- El ticket lo dice en esos términos: el botón "lleva a un mini-formulario".

El identificador se extrae con `extraerIdDeSegmentoFicha`, el mismo helper de la ficha, así que un enlace viejo con el nombre anterior del negocio también abre el reporte.

## 2. El cupo de reportes es un contador propio, y sin encabezado declarado no existe

Se reutiliza `crearCupoPorIp` de `src/lib/registro/limite-ip.ts` (la fábrica ya está pensada para esto: el panel la usa con su propia ventana para los intentos de acceso) con un mapa nuevo, 3 eventos por hora.

Dos consecuencias que la spec fija como comportamiento observable:

- **Contadores separados.** Compartir el mapa haría que reportar dos fichas dejara a un vecino sin poder registrar su negocio desde la misma casa; en un municipio con mucho NAT compartido eso es un bloqueo real de la conversión que el proyecto persigue.
- **Sin `REGISTRO_ENCABEZADO_IP` no hay cupo.** Es la política ya vigente (hallazgo ALTO 1 de T-003): confiar en un encabezado que escribe quien envía la petición es peor que no tener límite, porque da falsa sensación de protección. Por eso el anti-abuso del reporte no puede descansar solo en la IP, y de ahí el tope por negocio del §3.

Ese cupo, además, sigue siendo en memoria del proceso: provisional a sabiendas hasta E0-3, igual que el del registro.

## 3. Tope de reportes pendientes por negocio: 10, y quien reporta no se entera

El tope es la defensa que sigue en pie cuando el cupo por IP no opera (despliegue sin encabezado declarado, o alguien con muchas IPs). Acota lo único que un atacante puede lograr: llenar el panel de ruido sobre una ficha concreta.

- **10** es cómodo para el caso legítimo (un negocio que de verdad cerró puede juntar varios avisos en un día) y ridículo para el abusivo: pasado ese punto, el admin ya tiene toda la señal que necesita.
- **Se cuentan solo los pendientes**, no los históricos: en cuanto el admin atiende, el negocio vuelve a admitir reportes. Si contara el total, atender un reporte de hace meses dejaría a esa ficha sorda para siempre.
- **Quien reporta ve la confirmación normal.** Decir "este negocio ya tiene demasiados reportes" delata el estado interno de la moderación y le sirve a quien está probando el sistema; y para el vecino honesto la información sería inútil (su aviso ya está dado por otros). No se pierde nada real.

## 4. Motivo como texto con CHECK, no como enum de Prisma

SQLite no tiene enums y el proyecto ya resolvió esto con `estado` y `origen` del negocio (ADR-001): columna de texto, conjunto de valores en `src/lib/`, CHECK en la migración. Se repite el patrón para `motivo` y para el estado del reporte.

Los valores guardados (`cerrado`, `no_real`, `datos_incorrectos`, `inapropiado`) son estables e independientes del copy: cambiar la etiqueta que ve el vecino no obliga a migrar datos. La lista es cerrada a propósito —un campo de motivo libre convertiría la cola del admin en un buzón anónimo sin cota, que es justo lo que el ticket evita con el comentario opcional acotado.

**Cuidado con la migración:** la redefinición de tabla que genera Prisma en SQLite borró los CHECK existentes en un change anterior (`agregar-buscador`, task 3). Aquí se crea una tabla nueva, así que no debería redefinir `Negocio`; hay que verificarlo leyendo el SQL generado antes de commitearlo y confirmar con `prisma migrate status` que no hay drift.

## 5. El comentario se guarda tal cual y se escapa al mostrarlo

No se sanea el texto al guardarlo (no se le quitan etiquetas ni se "limpia"): se guarda lo que el vecino escribió y se muestra escapado, que es el tratamiento que ya recibe todo lo capturado por terceros en este proyecto (el motivo de rechazo, "¿Qué ofreces?", la consulta del buscador). Sanear al escribir destruye información y da la falsa sensación de que el dato ya es seguro en cualquier contexto; escapar al pintar es donde el riesgo realmente vive. El único lugar donde ese comentario se muestra es el panel, tras sesión válida.

## 6. Por qué no hay estado "despublicado" en este change

El reporte informa; repararlo (bajar una ficha que ya cerró) exige una transición `publicado → algo` que hoy no existe en `src/lib/admin/transiciones.ts`, donde toda escritura está condicionada a `estado: en_revision`. Agregarla implica decidir si es un estado nuevo, si la ficha vuelve a la cola, qué pasa con su fecha de publicación y qué ve el negocio afectado — decisiones de producto con su propio ticket. El T-011 lo dejó explícitamente fuera y aquí se respeta, con el hallazgo anotado en `proposal.md`.
