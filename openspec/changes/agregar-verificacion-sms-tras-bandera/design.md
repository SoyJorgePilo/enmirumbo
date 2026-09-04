# Diseño: agregar-verificacion-sms-tras-bandera

Solo lo que no es obvio: el orden exacto del flujo, cómo sabe el servidor de qué ficha es el código sin ponerla en la URL, qué pasa al abandonar, cómo se acotan los reintentos y por dónde pasa la frontera con el proveedor.

## 1. Por qué el registro se crea ANTES del código

La alternativa —guardar el registro solo después de verificar— es la que usan los productos con cuenta, y aquí sería un error caro:

- El PRD §6.1 promete "llena el formulario, lo envía y listo". Si el SMS no llega (cobertura mala en Tizayuca, número portado, proveedor caído, tope diario alcanzado), un registro que dependa del código **se pierde**, y con él un negocio que ya había hecho todo su trabajo. El diferenciador del directorio es la revisión humana, que no necesita el SMS para nada.
- Guardar después obliga a sostener el formulario completo —incluida la foto de hasta 5 MB— en algún lado mientras dura la verificación: una cola en memoria, una tabla temporal o una cookie gigante. Las tres son superficies nuevas con datos personales dentro, justo lo que el PRD §8 pide no acumular.
- Con el registro guardado primero, la verificación es **aditiva**: escribe una fecha en una fila que ya existe. Si falla en cualquier punto, el sistema queda en el estado de hoy, que es un estado bueno.

Consecuencia aceptada y escrita en la spec: un número que nunca confirma su código igual llega a la cola. Es exactamente lo que pasa hoy con todos los registros, y el admin lo resuelve con su conversación de WhatsApp de siempre.

## 2. El flujo, paso a paso (bandera encendida)

1. `POST /registro` (la Server Action de hoy). Se ejecutan **sin cambios** las defensas y el guardado en el orden ya especificado: honeypot → cupo de altas por IP → validación → unicidad del número (o reenvío tras rechazo) → foto → alta con estado, origen y constancia. Hasta aquí no existe la verificación.
2. Con la ficha ya escrita, y **solo si** la configuración está completa (§4) y la ficha no está ya verificada, se pide el código: cupo de códigos por IP → tope diario global → `puerto.iniciar(numero)`, con un tiempo de espera corto y acotado.
3. Si el proveedor confirma que mandó el código: se pone la cookie de paso (§3) y se redirige a `/registro/verificar`.
4. Si cualquier cosa de (2) falla —cupo, tope, error del proveedor, tiempo agotado, número que el proveedor rechaza— se redirige a `/registro/gracias`, exactamente como con la bandera apagada. **El dueño no se entera**: enterarlo solo sirve para preocuparlo por algo que no tiene que resolver.
5. `POST /registro/verificar`: se lee la cookie, se valida su firma y su caducidad, se cuentan los intentos y se llama a `puerto.comprobar(numero, codigo)`. Si el proveedor dice que sí, se escribe `numeroVerificadoEn`, se borra la cookie y se redirige a `/registro/gracias?verificado=1` (una bandera de presentación, sin dato personal ni identificador). Si dice que no, se vuelve a la pantalla con el error por campo, sumando un intento a la cookie.
6. `POST /registro/verificar/reenviar`: cooldown y tope de reenvíos leídos de la cookie, más los mismos cupo por IP y tope diario. Nunca reenvía más rápido de 60 s ni más de 2 veces.

Todo es POST → `redirect` → GET, el mismo patrón sin JavaScript que ya usan el panel y el formulario de reporte: recargar cualquier pantalla no repite ninguna acción ni cuesta un SMS.

## 3. Cómo sabe el servidor de qué ficha se trata: cookie firmada, no la URL

El identificador del negocio **no puede** viajar en la URL de la pantalla del código: quedaría en el historial del teléfono y en el log de acceso de cualquier proxy, y —peor— cualquiera que adivinara o consiguiera un identificador podría abrir esa pantalla y quemar intentos de una ficha ajena. Tampoco puede viajar como campo del formulario: lo que se pinta en el HTML vuelve como el cliente quiera (el mismo hallazgo que ya obligó a reconstruir la ruta de la ficha en el formulario de reporte en vez de ligarla a la acción).

Se usa una **cookie de paso firmada por el servidor**, con el patrón de la cookie de sesión del panel y de la cookie de borrador del reporte:

- Contenido: identificador del negocio, los cuatro últimos dígitos del número (para pintar la explicación sin guardar el número entero), el conteo de intentos, el de reenvíos y la marca del último envío.
- Firma HMAC-SHA256 con `VERIFICACION_SMS_SECRETO`; atributos `HttpOnly`, `SameSite=Lax`, `Path` acotado a `/registro/verificar` y `Secure` cuando el sitio se sirve por HTTPS.
- Caducidad de 15 minutos, holgada frente a la del código del proveedor (10 minutos por defecto en Verify) y corta frente a un celular compartido.
- Sin cookie válida, la ruta responde 404: no confirma si el registro existe.

**Por qué un secreto propio y no reusar `PANEL_SESION_SECRETO`:** son dos superficies con vidas distintas —rotar el secreto del panel invalida las sesiones del admin y no tiene por qué tirar verificaciones en curso, ni al revés— y mezclar los dominios de firma es cómo una credencial termina usada para algo que nadie revisó. La alternativa evaluada y descartada fue **derivar** la clave de firma del `TWILIO_AUTH_TOKEN` (que existe exactamente cuando la capacidad está encendida, así que ahorraría una variable): funcionaría, pero ata la validez de las cookies a la rotación de una credencial del proveedor y usa un secreto de un tercero para un propósito que ese tercero no conoce. Una variable más es más barata que esa deuda. **Queda como duda para el humano** (§7).

El conteo de intentos vive en la cookie firmada, no en la base: no hace falta una columna para algo que dura 15 minutos, y el proveedor lleva su propio tope de intentos por verificación, que es el que de verdad protege el canal. La cookie es la defensa cómoda; Twilio Verify es la que no se puede burlar borrando cookies. Borrar la cookie no regala intentos ilimitados: cada código nuevo pasa igual por el cupo por IP, por el tope diario y por el tope del proveedor.

## 4. Configuración: una sola función que decide si la capacidad existe

Un módulo (`src/lib/verificacion/config.ts`) lee el entorno y devuelve **o** la configuración completa **o** "apagada", con el aviso único en el log cuando está a medias. Es el mismo molde del `EntornoPanel` y de la configuración de la analítica, y tiene una propiedad que hay que conservar: **todo el resto del código pregunta una sola vez**. No hay `if (process.env.…)` regados; si esa función dice "apagada", ni la ruta existe, ni el adaptador real se construye, ni se importa el SDK del proveedor.

Bandera con valor exacto `1` (no "true", no "sí", no cualquier cosa no vacía): un valor tipeado a medias no debe encender un canal que cuesta dinero.

## 5. El puerto y el adaptador simulado

```
iniciar(numeroE164): "enviado" | "rechazado-por-el-proveedor" | "error"
comprobar(numeroE164, codigo): "confirmado" | "no-coincide" | "vencido" | "error"
```

Dos operaciones, resultados discriminados, cero excepciones del SDK escapando hacia arriba. El adaptador real habla con Twilio Verify (que genera, caduca y compara el código: no se reimplementa nada de eso, ADR-011); el adaptador de pruebas responde lo que la prueba diga. Como en `AlmacenFotos`, el adaptador se **inyecta**, así que la suite no necesita credenciales, no toca la red y puede recorrer las cuatro ramas de error sin provocarlas de verdad. El número se convierte a formato internacional (`+52` + los 10 dígitos guardados) en el adaptador, no en el dominio: el formato es un detalle del proveedor.

Un punto que conviene fijar por escrito: el adaptador **no reintenta solo**. Un reintento automático contra un canal que cobra por mensaje es una factura que crece sin que nadie la mire; si el proveedor falla, el flujo degrada y el dueño puede pedir reenvío a mano, con su cooldown.

## 6. Anti-abuso: qué acota qué

| Defensa | Qué evita | Dónde vive |
| --- | --- | --- |
| Cupo de altas por IP (3/hora, ya existe) | Barrido de registros | `src/lib/registro/limite-ip.ts` |
| Cupo de códigos por IP (3/hora, contador propio) | Usar reenvíos para multiplicar SMS desde una IP | `crearCupoPorIp`, mapa propio |
| Cooldown de 60 s y máximo 2 reenvíos por registro | Machacar "Reenviar" | Cookie firmada |
| Máximo 5 códigos escritos por registro | Adivinar el código a fuerza bruta | Cookie + tope del proveedor |
| Tope diario global (50 por defecto) | Que una noche mala se convierta en una factura | Contador en memoria del proceso |

El tope diario **corta**, a diferencia del umbral de altas diarias del PRD §8, que solo avisa. La razón está escrita en la spec: lo que se protege aquí es dinero que se gasta solo, y cortar degrada al flujo manual, que es un flujo completo y bueno. Su limitación —contador por proceso, igual que los cupos por IP— queda documentada en la sección de activación: con varias instancias el gasto real puede ser un múltiplo del tope. Es la misma deuda que ya tienen los otros cupos y se paga junto con ellos cuando E0-3 defina almacén compartido.

## 7. Decisiones que el humano puede querer revisar

- **Secreto propio (`VERIFICACION_SMS_SECRETO`) vs. derivarlo del token de Twilio.** Aquí se eligió el secreto propio (§3).
- **Números**: 3 códigos por IP/hora, 60 s de cooldown, 2 reenvíos, 5 intentos, 50 verificaciones al día. Salen de la escala del PRD (decenas de altas), no de una medición.
- **Cortar al llegar al tope diario** en vez de solo avisar.
