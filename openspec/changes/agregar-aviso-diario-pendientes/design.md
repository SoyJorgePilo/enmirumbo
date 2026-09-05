# Diseño: agregar-aviso-diario-pendientes

Cuatro decisiones que no se caen de maduras: dónde se dispara, con qué proveedor, cómo se evita el correo doble sin tablas nuevas y qué significa "el día".

## 1. Dónde se dispara: encima de la purga, no en una tarea nueva

**Decisión:** el aviso se intenta dentro de `/api/tareas/purgar-rechazados`, después del trabajo de la purga.

El plan Hobby del hosting admite **dos tareas programadas diarias** y `vercel.json` ya declara exactamente dos (`docs/despliegue.md` §6: "Cualquier tarea futura obliga a pasar a Pro o a dispararla desde fuera"). Las opciones eran:

| Opción | Costo | Por qué no |
|---|---|---|
| Ruta propia + tercer cron en `vercel.json` | plan Pro (~20 USD/mes) por un correo diario | Un producto que todavía no lanza no paga un plan por una notificación |
| Ruta propia + workflow programado de GitHub Actions que le pega con `curl` | gratis | Suma una pieza de infraestructura y un secreto más que mantener, y el cron de Actions se retrasa con frecuencia. Queda como salida si algún día el aviso necesita otro horario |
| **Encima de una tarea que ya corre** | gratis | Acopla dos trabajos que no tienen nada que ver — se compensa con la regla de independencia de la spec |

Se elige la purga y no el barrido de fotos porque es la tarea que ya toca el estado de los registros y porque su horario se puede mover sin consecuencias: solo tiene que correr una vez al día. **Y se mueve**, de 09:17 a **13:17 UTC (~07:17 en Tizayuca)**, para que el correo esté en la bandeja al empezar la jornada y no a las tres de la mañana. El barrido de fotos se queda en su 09:47 UTC. La ruta sigue siendo una ruta HTTP normal (ADR-007): si mañana el sitio se muda, viaja con él y solo cambia quién la llama.

**El acoplamiento se paga con dos reglas explícitas en la spec:** el aviso se intenta pase lo que pase con la purga, y el fallo del aviso no toca lo que la purga ya hizo. Además el intento lleva su propio límite de espera (unos pocos segundos, con `AbortController`), porque el presupuesto de tiempo de la función es de la purga y el correo es el invitado.

Si algún día el aviso necesita hora propia, extraerlo a `/api/tareas/avisar-pendientes` es mover una función y agregar una entrada de cron: nada de la spec cambia salvo dónde se dispara.

## 2. Proveedor: Resend

**Decisión:** Resend, llamando su API HTTP con `fetch` (sin SDK).

- **Capa gratis holgada:** 3 000 correos al mes y 100 al día. Este aviso manda como mucho uno al día.
- **Dominio propio verificable** con registros DNS en Namecheap, que es donde vive `enmirumbo.com`. Mandar desde `avisos@enmirumbo.com` con SPF/DKIM del dominio es lo que evita la carpeta de spam.
- **API HTTP, no SMTP.** Un entorno serverless con conexiones SMTP salientes es justo el tipo de cosa que falla en producción y no en local.
- **Trae claves de idempotencia**, que es lo que resuelve el §3 sin tablas nuevas.
- **`fetch` en vez del SDK:** una llamada HTTP con dos cabeceras y un JSON no justifica una dependencia más en un proyecto que ya cuida el peso; y el día que se cambie de proveedor, lo que se reescribe son quince líneas dentro del adaptador.

Descartados: **SMTP de Gmail con contraseña de aplicación** (credencial personal del fundador dentro del despliegue, y entrega peor), **Amazon SES** (barato pero pide salir del sandbox y configurar más de lo que este caso merece), **Postmark/Loops** (sin capa gratis útil para esto).

**Recomendación operativa para el buzón destino (no es spec, es cómo configurarlo):** poner en `AVISOS_CORREO_DESTINO` **el Gmail directo del admin**, no una dirección que reenvíe. El reenvío de Namecheap hacia Gmail puede tropezar con SPF en el salto (DKIM sobrevive, SPF no siempre) y mandar a spam justo el correo del día en que sí hay pendientes. `contacto@enmirumbo.com` se queda para lo suyo: es la dirección publicada en el aviso de privacidad y, una vez que Resend verifique el dominio, sirve como remitente o como "responder a". Cambiar de opinión después es cambiar el valor de una variable, sin tocar código ni spec.

**La forma del código es la del almacén de fotos** (`src/lib/fotos/almacen.ts`): un puerto con dos adaptadores —Resend cuando la configuración está completa, y uno que no manda nada y deja constancia cuando no lo está—. Así el fail-safe es una decisión de fábrica y no un `if` repartido por la ruta, y las pruebas usan un adaptador de mentira sin tocar la red.

## 3. Un correo al día sin tablas nuevas

El riesgo real no es el cron del hosting (dispara una vez), sino los disparos manuales: el `curl` documentado en `docs/despliegue.md` §6, el reintento después de un 500 y el día que alguien pruebe la ruta a mano.

| Mecánica | Veredicto |
|---|---|
| Tabla nueva `AvisoDiario` con la fecha mandada | Funciona, pero agrega una migración y una tabla que hay que purgar por una garantía chica. Además `modelo-datos` deja de ser "no cambia" |
| Reutilizar `IntentoDeCupo` como marca del día | **No.** Esa tabla tiene finalidad anti-abuso y una retención de menos de una hora (la propia purga la limpia): la marca del día se borraría sola. Y mezclar finalidades en un almacén de datos derivados es exactamente lo que LFPDPPP art. 11 desaconseja |
| Bandera en memoria del proceso | Inútil en serverless: cada instancia tiene la suya |
| **Clave de idempotencia del proveedor** | **Elegida.** El envío viaja con `Idempotency-Key: enmirumbo-pendientes-<AAAA-MM-DD>` (fecha local). El proveedor descarta el segundo envío del mismo día dentro de su ventana de 24 h, que es justo la que necesitamos |

Consecuencias que la spec fija: la clave depende **solo de la fecha**, no de los conteos, para que un pendiente nuevo a media tarde no abra la puerta a un segundo correo. Y un intento que el proveedor no llegó a aceptar (error de red, timeout, 5xx suyo) no consume nada: el siguiente disparo vuelve a intentarlo con la misma clave, que es el uso para el que existe.

**Riesgo asumido:** la garantía la sostiene el proveedor. Si mañana se cambia a uno sin claves de idempotencia, el peor caso es un correo duplicado un día que alguien dispare la tarea dos veces — molesto, no dañino. El puerto recibe la clave del día como parámetro, así que un adaptador que no la soporte queda obligado a decirlo en su documentación en vez de fingir que cumple.

## 4. "El día" es el de Tizayuca

Tizayuca está en la zona Centro de México, **UTC−6 todo el año** desde que el país eliminó el horario de verano en 2022. La fecha de la clave se calcula con `Intl.DateTimeFormat` sobre `America/Mexico_City` en lugar de restarle seis horas al reloj a mano: si algún día vuelve el horario de verano, el sistema se entera solo y no hay que acordarse de nada.

Importa porque la tarea corre a las 13:17 UTC, que es el mismo día local (07:17), pero un disparo manual de tarde-noche (20:00 local = 02:00 UTC del día siguiente) mandaría un segundo correo si la fecha se sacara del reloj UTC. Ese es el scenario que lo fija en la spec.

## 5. Qué responde la tarea cuando se mezclan dos trabajos

La ruta ya devolvía 500 cuando la purga no se completaba. Ahora hay dos motivos posibles de error y el operador tiene que poder distinguirlos sin abrir el código:

- El cuerpo suma un campo de **estado del aviso** con uno de estos valores: mandado, sin pendientes, sin configurar o fallido. Son estados, no datos personales: la regla de "solo conteos" sigue en pie.
- **Sin configurar no es error.** La respuesta sigue siendo de éxito: es el estado normal en la máquina de quien desarrolla y en un despliegue que todavía no tiene el dominio verificado, y un 500 diario por eso entrenaría al operador a ignorar los 500.
- **Fallido sí es error** (500), porque significa que había algo que avisar y el aviso no llegó.
- El log distingue las dos cosas con prefijos propios (`[purga]` y `[aviso]`), para que la línea diga qué se rompió sin tener que adivinarlo por el código de respuesta.

## 6. Los reportes se cuentan como reportes, no como negocios

El aviso cuenta tres cosas: altas nuevas, ediciones y reportes sin atender. Las dos primeras salen de la lista "Registros por revisar" y ahí un negocio cuenta una sola vez, con el tipo con el que aparece en el panel. Los reportes salen de la otra sección de la cola ("Negocios reportados") y **se cuentan por reporte, no por negocio**: la línea dice "Reportes sin atender" y un número que dijera negocios haría que el admin abriera el panel esperando tres cosas y encontrara siete.

Tampoco se descuenta nada cuando el mismo negocio aparece en las dos secciones: revisar su alta y atender su reporte son dos trabajos distintos, y la cola ya los pinta por separado (`revision-admin`, "La cola avisa qué negocios tienen reportes sin atender"). El total del asunto es la suma de los tres, que es exactamente el número de renglones que el admin va a tener que tocar.

Los tres conteos DEBEN salir de las mismas funciones que arman la cola (`src/lib/admin/consultas.ts`). Escribir consultas nuevas "parecidas" es el camino corto para que dentro de tres meses el correo diga 4 y el panel muestre 5, y el admin deje de creerle al correo.
