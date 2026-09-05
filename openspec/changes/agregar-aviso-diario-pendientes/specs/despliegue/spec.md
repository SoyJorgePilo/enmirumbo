# Delta de spec: despliegue

## ADDED Requirements

### Requirement: El aviso diario de pendientes viaja en la tarea programada que ya existe

El aviso por correo de los registros que esperan revisión (T-020; PRD §11, "notificaciones de pendientes") NO DEBE declarar una tarea programada nueva: DEBE intentarse dentro de la tarea diaria que ya corre —la purga de rechazados—, porque el plan del hosting admite dos tareas programadas diarias y `vercel.json` ya declara exactamente dos (`docs/despliegue.md` §6). En consecuencia, el aviso hereda la puerta de esa tarea: solo se intenta cuando el disparo trae el secreto configurado, y quien pide la ruta sin él recibe el mismo 404 de siempre, sin que nada delate que ahí dentro hay además un envío de correo.

**Los dos trabajos son independientes en las dos direcciones.** Que el correo no se pueda mandar NO DEBE impedir que la purga borre lo que le toca, y que la purga no se complete NO DEBE impedir que el aviso salga: son dos obligaciones distintas —una de la LFPDPPP y otra de la operación— y encadenarlas convierte un fallo en dos.

La tarea que lleva el aviso DEBE correr a una hora en la que el correo sirva para trabajar ese mismo día: **13:17 UTC, que son las 07:17 en Tizayuca**. Un aviso que llega a las tres de la mañana se lee cuando ya se perdió media jornada; a las siete acompaña el primer café. Cambiar la hora de la purga no le cuesta nada a la purga, que solo necesita correr una vez al día.

El intento de envío DEBE tener un **límite de espera propio**: un proveedor que no contesta NO DEBE llevarse por delante la tarea programada ni agotar el tiempo de la función. Pasado ese límite, el aviso cuenta como fallido y la tarea termina.

Cuando el envío falle —porque el proveedor lo rechazó, respondió error o no contestó dentro del límite—, la respuesta de la tarea NO DEBE ser de éxito: DEBE llevar un código de error que el programador de tareas registre como fallo, y el motivo DEBE quedar en el log como error. Un 200 con la mala noticia adentro haría que el admin se quedara sin avisos y sin enterarse. Ni la respuesta ni el log DEBEN traer nombres, números de WhatsApp, colonias ni identificadores de ningún registro: solo conteos y el estado en que quedó el aviso.

#### Scenario: la tarea corre y el aviso sale

- **WHEN** el programador de tareas llama a la ruta con el secreto correcto, con la configuración del correo completa y con registros esperando en la cola
- **THEN** la purga hace su trabajo, sale un correo al buzón configurado y la respuesta es de éxito, con los conteos de la purga y el estado del aviso, sin ningún dato personal

#### Scenario: el envío falla y la purga no se ve arrastrada

- **WHEN** la tarea corre y el proveedor de correo responde con error
- **THEN** los registros rechazados que ya cumplieron 90 días quedan igualmente eliminados, la respuesta NO es de éxito, el log dice que falló el aviso y no nombra a ningún negocio

#### Scenario: el proveedor no contesta

- **WHEN** el proveedor de correo deja la petición colgada más allá del límite de espera
- **THEN** la tarea no se queda esperando: corta el intento, lo cuenta como aviso fallido, lo deja en el log y responde con error

#### Scenario: la purga no se completa y el aviso sí sale

- **WHEN** la tarea corre, algún registro que ya cumplió el plazo no se puede eliminar y la configuración del correo está completa con pendientes en la cola
- **THEN** el correo se manda igual, y la respuesta sigue sin ser de éxito por lo de la purga

#### Scenario: la hora a la que llega el correo

- **WHEN** se revisa la declaración de la tarea programada y el documento de despliegue
- **THEN** la tarea que lleva el aviso está declarada a las 13:17 UTC (~07:17 en Tizayuca), y el documento dice que esa hora es para que el correo esté en la bandeja al empezar el día

#### Scenario: alguien encuentra la ruta

- **WHEN** cualquier persona pide esa ruta sin el secreto, o con uno equivocado
- **THEN** recibe el mismo 404 vacío de siempre, no se manda ningún correo y la respuesta no delata que esa tarea también avisa por correo

### Requirement: Sin la configuración del correo, el aviso no se manda y se nota en el log

El envío del aviso DEBE depender por completo de variables de entorno: `RESEND_API_KEY` (la credencial del proveedor), `AVISOS_CORREO_REMITENTE` (la dirección desde la que sale, en un dominio verificado con el proveedor), `AVISOS_CORREO_DESTINO` (el buzón del directorio que lo recibe) y la `SITIO_URL` que ya existe, de la que sale el enlace al panel.

Si falta cualquiera de las cuatro, el sistema NO DEBE mandar nada, DEBE dejar constancia en el log nombrando la que falta —una sola vez por proceso, no una por corrida ni una por petición— y **todo lo demás DEBE seguir funcionando**: la purga corre igual y la tarea responde como siempre, porque no configurar el correo es una decisión legítima (en la máquina de quien desarrolla lo normal es no tenerlo) y no un fallo que haya que reportar. Una configuración a medias —proveedor sí, buzón destino no— se trata exactamente igual que la falta total: no se manda nada y el log dice cuál de las cuatro falta.

El sistema NUNCA DEBE suplir un hueco con un valor propio: ni destinatario por defecto, ni remitente de pruebas del proveedor, ni un enlace a `localhost` cuando falte `SITIO_URL` —el mismo criterio que ya rige para el link de la ficha que el panel arma (requirement "En producción ninguna configuración requerida falta en silencio")—.

`AVISOS_CORREO_DESTINO` es un dato personal en un repositorio público (LFPDPPP, PRD §8): su valor NO DEBE aparecer en el código, ni en los seeds, ni en las pruebas, ni en `.env.example` con una dirección real, con el mismo trato que `WHATSAPP_ADMIN`. Las cuatro variables DEBEN quedar documentadas en `docs/despliegue.md` con para qué sirven, si son obligatorias y qué pasa sin ellas.

#### Scenario: nada configurado

- **WHEN** la tarea programada corre sin ninguna de las variables del correo
- **THEN** no se manda ningún correo, el log deja constancia de que el aviso está apagado y nombra lo que falta, y la purga responde con normalidad

#### Scenario: proveedor configurado y buzón destino sin configurar

- **WHEN** la tarea corre con la credencial del proveedor y el remitente puestos, pero sin `AVISOS_CORREO_DESTINO`
- **THEN** no se manda nada a ninguna dirección, el log nombra `AVISOS_CORREO_DESTINO` como la que falta, y la tarea responde igual que si el correo no estuviera configurado en absoluto

#### Scenario: sin `SITIO_URL` no sale un correo con un enlace roto

- **WHEN** la tarea corre con todo el correo configurado pero sin `SITIO_URL`
- **THEN** no se manda ningún correo —porque su único enlace sería un `localhost` inservible—, y el log lo dice nombrando la variable

#### Scenario: el aviso del log no se repite

- **WHEN** la tarea corre varias veces con la configuración incompleta dentro del mismo proceso
- **THEN** el log lo dice una sola vez, no una por corrida

#### Scenario: las variables nuevas están documentadas

- **WHEN** se revisa `docs/despliegue.md` después de este cambio
- **THEN** trae `RESEND_API_KEY`, `AVISOS_CORREO_REMITENTE` y `AVISOS_CORREO_DESTINO` con su descripción y su valor esperado, y la verificación automática que exige documentar toda variable leída del entorno sigue pasando

#### Scenario: el buzón del directorio no vive en el repositorio

- **WHEN** se busca la dirección de correo configurada en el código, los seeds, las pruebas y `.env.example`
- **THEN** no aparece en ninguno: solo el nombre de la variable y un ejemplo que no es una dirección real

## MODIFIED Requirements

### Requirement: La purga de rechazados se dispara sola en producción

El borrado de los registros rechazados a los 90 días (PRD §8) DEBE ejecutarse sin intervención humana, mediante una tarea programada que corra al menos una vez al día en producción. El disparo DEBE ser una petición HTTP a una ruta del propio sistema que solo actúa si trae el secreto configurado; sin secreto configurado, o con un secreto que no coincide, la ruta DEBE comportarse como si no existiera (404) y NO DEBE borrar nada. La ruta NO DEBE ser indexable y su respuesta DEBE limitarse a conteos, sin ningún dato personal. El mecanismo NO DEBE depender de nada exclusivo del hosting: cualquier programador de tareas capaz de hacer una petición con encabezado DEBE poder dispararlo (ADR-007).

Esta misma tarea DEBE llevar encima el **aviso diario de pendientes** (requirement "El aviso diario de pendientes viaja en la tarea programada que ya existe"), que se intenta después del trabajo de la purga y de forma independiente de su resultado. Su respuesta DEBE decir, además de los conteos de la purga, **en qué quedó el aviso** —mandado, sin pendientes que avisar, sin configurar o fallido—, porque ese estado es lo único que el operador puede mirar para saber si el correo del día salió. Ese dato es un estado, no un dato personal: la regla de "solo conteos" sigue intacta.

#### Scenario: la tarea programada corre

- **WHEN** el programador de tareas llama a la ruta con el secreto correcto
- **THEN** el sistema elimina los registros rechazados que ya cumplieron 90 días, responde con los conteos de lo que hizo y con el estado del aviso del día, y lo deja en el log sin nombres ni números de nadie

#### Scenario: alguien encuentra la ruta

- **WHEN** cualquier persona pide esa ruta sin el secreto, o con uno equivocado
- **THEN** recibe la misma respuesta 404 que una ruta inexistente y no se borra ningún registro

#### Scenario: sin secreto configurado

- **WHEN** el sistema corre sin el secreto de tareas configurado
- **THEN** la ruta responde 404 a todo el mundo y ninguna purga se ejecuta

#### Scenario: programación declarada

- **WHEN** se revisa la configuración del despliegue
- **THEN** la tarea está declarada con su frecuencia diaria y `docs/despliegue.md` explica cómo dispararla desde cualquier otro programador de tareas si el hosting cambia

#### Scenario: la respuesta dice si el correo del día salió

- **WHEN** el operador revisa la respuesta de la tarea de un día en el que había pendientes y el correo se mandó, y la de otro día en el que la cola estaba vacía
- **THEN** en la primera lee que el aviso se mandó y en la segunda que no había nada que avisar, sin que ninguna traiga nombres, números ni identificadores
