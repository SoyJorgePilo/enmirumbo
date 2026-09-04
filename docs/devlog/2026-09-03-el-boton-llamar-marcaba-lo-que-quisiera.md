# 2026-09-03 · El botón "Llamar" que marcaba lo que quisiera el negocio

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el directorio público ya existe completo — home, listado por categoría con filtro de colonia y ficha con botón de WhatsApp (T-004, PR [#6](https://github.com/SoyJorgePilo/necesitouno/pull/6)). Con esto cerramos el Flujo B entero del PRD y el MVP anda ya rondando el 40% de las historias P0.

## Qué construimos

Desde hoy, cualquiera puede entrar a NecesitoUno desde su celular y hacer el recorrido completo sin registrarse: la home muestra las 8 categorías como botones grandes más el bloque "Deporte en Tizayuca" al mismo nivel; cada categoría abre un listado en URL limpia (`/servicios-del-hogar`) con filtro por colonia, donde solo aparecen negocios ya `publicado`; cada tarjeta lleva a una ficha con toda la información que el negocio registró, el sello "Negocio verificado" y los botones de contacto — WhatsApp siempre primero, y "Llamar", "Cómo llegar" o su página solo si el negocio los capturó. Todo servido por el servidor, sin JavaScript de cliente: probamos el recorrido completo home → categoría → filtro → ficha con `curl`, sin navegador de por medio.

Para poder probar todo esto sin usar datos de negocios reales, el seed de desarrollo ahora tiene 12 negocios de mentira — nombres inventados, WhatsApp de la serie ficticia `771999xxxx`, con el aviso explícito de que son datos falsos tanto en el código como en el mensaje que imprime al sembrarlos. Y como sembrar datos falsos por accidente en la base de producción sería un problema serio, el comando ahora se niega a correr si `DATABASE_URL` no apunta a un archivo SQLite local (ADR-001) — ni con variables de entorno mal puestas, ni con un permiso a medias: falla cerrado.

## La decisión interesante

Hasta T-003 nos habíamos preocupado sobre todo de la superficie que *recibe* datos (el formulario de registro). T-004 fue la primera vez que auditamos en serio la superficie que los *muestra* — y ahí aprendimos que leer no es gratis.

Lo primero que se verificó, byte a byte, fue que un negocio en revisión sea indistinguible de uno que no existe: la ficha de un negocio `en_revision` y la de un id inventado devuelven exactamente el mismo código, el mismo cuerpo de respuesta y los mismos encabezados. Ni el `tokenGestion` (la llave secreta para editar la ficha, que llega en E8) ni los timestamps internos (`registradoEn`, `publicadoEn`, `consintioAvisoEn`) viajan en ninguna respuesta pública — se verificó grepeando el HTML servido de verdad, no solo leyendo el código.

Pero el hallazgo que de verdad valió la pena fue otro. El formulario de registro le pide al negocio su "teléfono fijo" y solo valida que no pase de 20 caracteres — no que sean puros dígitos. La ficha tomaba ese texto tal cual y lo metía en un botón `tel:`. Alguien podía registrar, en el campo de teléfono, un código real de desvío de llamadas (`*21*5512345678#`) y quedaba ahí, esperando. No era una falla de tipo "roban tus datos": el que se veía afectado no era el negocio que escribió el código raro, era el vecino que le daba clic a "Llamar" pensando que iba a marcar una tienda y en realidad ejecutaba, desde su propio teléfono, una secuencia que nada tiene que ver con hacer una llamada.

La corrección no fue escapar mejor el texto (eso ya lo hacía React); fue no confiar nunca en que lo que se guardó como "teléfono" sea marcable. Ahora el botón solo existe si el dato se normaliza a diez dígitos nacionales, igual que ya hacíamos con el WhatsApp — si no se puede normalizar, no hay botón "Llamar". Y ahí quedó una pregunta chiquita pero real: ¿y el dato que sí registró el negocio, aunque no sirva para marcar? Se decidió no perderlo: se muestra como texto plano ("Teléfono: …") sin ningún enlace, y esa decisión quedó escrita en la spec consolidada, no solo en la cabeza de quien la tomó.

## Qué aprendimos

Que la lectura pública merece la misma desconfianza que la escritura. Es fácil pensar "ya validamos lo que entra, con eso basta" — pero un dato que entró limpio hace tres pasos puede volverse peligroso hasta que llega a un componente muy específico que lo interpreta de una forma que nadie tuvo en mente al escribir la validación original. La corrección correcta no fue parchar el componente, fue mover la normalización al origen — el mismo criterio que ya usábamos para WhatsApp — para que ningún componente futuro tenga que acordarse de blindarse solo.

## Siguiente paso

Arranca E3: el panel del admin para revisar, aprobar y rechazar negocios por WhatsApp. Es la pieza que falta del camino crítico — hoy el directorio puede mostrar negocios publicados, pero nadie los está publicando todavía más que a mano.

---
*Tickets/PRs relacionados: T-004 · PR #6*
