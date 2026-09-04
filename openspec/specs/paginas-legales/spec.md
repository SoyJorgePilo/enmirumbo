# Spec: paginas-legales

## Requirements

### Requirement: Página del aviso de privacidad integral en `/aviso-de-privacidad`

El sitio DEBE publicar el aviso de privacidad integral en la ruta `/aviso-de-privacidad` (segmento reservado en `src/lib/rutas-reservadas.ts`), dentro del layout global, con un solo `h1` con el texto literal "Aviso de privacidad" y sus secciones como `h2`, sin saltos de jerarquía. La página DEBE mostrar, arriba del contenido, la versión vigente del aviso y la fecha en que se publicó ese texto, en una sola línea con la forma literal "Versión 1 · Última actualización: " seguida de la fecha escrita en español (por ejemplo "3 de septiembre de 2026"), donde `1` es el identificador de versión vigente. El bloque literal del requirement "Texto completo del aviso de privacidad integral" no incluye esa versión: se antepone a esa misma línea al pintarla, y por eso queda fuera de la huella del guardián (todo lo demás de ese bloque, incluida la fecha, sí entra). Los términos y condiciones NO llevan versión: su línea de última actualización se pinta tal cual. La página DEBE llevar un enlace visible a los términos y condiciones con el texto "Términos y condiciones", y NO DEBE llevar ningún enlace a una página que no exista.

#### Scenario: el dueño abre el aviso de privacidad

- **WHEN** el dueño de un negocio abre `/aviso-de-privacidad` en su celular
- **THEN** ve, dentro del layout con header y footer, el encabezado "Aviso de privacidad", la línea "Versión 1 · Última actualización: " con su fecha, y el contenido completo del aviso

#### Scenario: la versión que se muestra es la vigente

- **WHEN** se compara la versión que muestra la página con el literal declarado en el código
- **THEN** son la misma, sin que nadie tenga que actualizar la página a mano al estrenar versión

#### Scenario: jerarquía de encabezados del aviso

- **WHEN** se inspecciona el HTML de `/aviso-de-privacidad`
- **THEN** hay exactamente un `h1` y cada sección del aviso es un `h2`, sin saltos de jerarquía

#### Scenario: el aviso enlaza a los términos

- **WHEN** el dueño llega al final del aviso de privacidad
- **THEN** encuentra un enlace con el texto "Términos y condiciones" que lo lleva a `/terminos`, y ningún enlace del aviso apunta a una página inexistente

### Requirement: El aviso de privacidad tiene una versión estable declarada en un solo lugar

El aviso de privacidad DEBE tener un identificador de versión estable, declarado como un literal único en un solo módulo del código, del que lo leen todas las superficies que lo muestran o lo guardan (la página integral, el bloque de consentimiento del formulario y el servidor que registra la constancia). El identificador DEBE ser una cadena que solo avanza: la versión vigente es `1` y una versión ya publicada NUNCA DEBE reutilizarse para otro texto. La versión identifica al aviso completo, que a estos efectos son tres piezas inseparables: el aviso simplificado del formulario, el literal de la casilla de consentimiento y el aviso integral de `/aviso-de-privacidad`. Los términos y condiciones NO entran en esta versión.

#### Scenario: una sola fuente de la versión

- **WHEN** se revisa dónde está escrito el identificador de versión del aviso
- **THEN** aparece una sola vez en el código, y la página del aviso, el formulario de registro y el servidor lo leen de ahí, sin copias

#### Scenario: la versión vigente

- **WHEN** se consulta la versión vigente del aviso
- **THEN** es `1`, y corresponde al texto que hoy publican `/aviso-de-privacidad` y el bloque de consentimiento del formulario

### Requirement: Cambiar el texto del aviso sin subir la versión rompe la verificación

La verificación automática del proyecto DEBE incluir un guardián que ate la versión al texto: calcula una huella del contenido versionado del aviso —el texto del aviso simplificado, el literal de la casilla de consentimiento y todo el contenido publicado del aviso integral (encabezado, marca de borrador mientras se publique, línea de última actualización, introducción, secciones con sus párrafos y viñetas, y el enlace de cierre), excluyendo únicamente la propia línea de versión— y la compara contra la huella anclada para la versión vigente. Si no coinciden, la verificación DEBE fallar y decir qué hacer: subir la versión y anclar su huella. Las huellas de las versiones ya publicadas DEBEN quedar registradas y NO DEBEN modificarse; la tabla de huellas DEBE vivir junto a la verificación y no junto al texto, para que corregir el texto y "arreglar" la huella no sean el mismo gesto distraído. La verificación DEBE comprobar además que la versión vigente tiene huella anclada y que es la última de la tabla.

La marca de borrador entra en la huella porque es contenido publicado: advierte al titular de que el texto que está aceptando todavía no pasó la revisión legal, y si quedara fuera, retirarla de la página no estrenaría versión y dejaría la verificación en verde.

#### Scenario: alguien edita el aviso y no sube la versión

- **WHEN** se cambia una frase del aviso integral, del aviso simplificado o del literal de la casilla, dejando la versión en `1`
- **THEN** la verificación automática falla e indica que el texto del aviso cambió sin estrenar versión

#### Scenario: se estrena versión junto con el texto

- **WHEN** se cambia el texto del aviso, se sube la versión a `2` y se ancla la huella nueva
- **THEN** la verificación pasa, la huella de la versión `1` sigue registrada tal cual y la tabla queda con dos entradas

#### Scenario: versión sin huella

- **WHEN** se sube la versión vigente sin anclar su huella
- **THEN** la verificación falla, porque la versión vigente siempre debe tener su huella en la tabla

#### Scenario: el guardián no se pisa con los placeholders

- **WHEN** el humano completa uno de los placeholders del aviso (por ejemplo el domicilio del responsable)
- **THEN** la verificación falla mientras no se estrene versión: completar un placeholder cambia el texto del aviso y por lo tanto estrena versión

#### Scenario: retirar la marca de borrador también estrena versión

- **WHEN** se dejan de publicar los placeholders y con ellos desaparece la marca de borrador de la página
- **THEN** la verificación falla mientras no se estrene versión: la marca es contenido publicado y entra en la huella

### Requirement: El aviso integral trae los seis elementos mínimos de la LFPDPPP

El aviso de privacidad integral DEBE contener, cada uno en una sección propia y visible, los seis elementos mínimos que exige el PRD §8: (1) identidad y domicilio del responsable, (2) los datos personales que se tratan, (3) las finalidades del tratamiento, (4) los medios para limitar el uso o la divulgación de los datos, (5) el mecanismo para ejercer los derechos ARCO, incluido el plazo de respuesta de máximo 20 días hábiles, y (6) el procedimiento por el cual se comunicarán los cambios al aviso. Ninguno DEBE quedar implícito ni repartido entre líneas sueltas.

El elemento (4) DEBE describir la operación real de hoy y no prometer automatismos que no existen. Dos condiciones: (a) el plazo de supresión de 90 días DEBE acotarse a los registros **rechazados** —que es lo que dicen el PRD §6.3 y §8, lo mismo que declara `/terminos` y lo único que el modelo puede fechar, con `rechazadoEn`—, nunca a todo registro "que no se publicó", porque una ficha en revisión no tiene reloj de purga y el aviso quedaría prometiendo una supresión imposible; y (b) el aviso DEBE decir que las solicitudes del titular se atienden a mano y a petición (la despublicación en cuanto llega el mensaje; lo demás confirmado en máximo 20 días hábiles), sin dar a entender que una solicitud suya se resuelva sola. La supresión de los rechazados a los 90 días no es una solicitud del titular: esa sí la ejecuta el sistema por su cuenta, y el aviso no DEBE prometer menos plazo del que se cumple.

#### Scenario: identidad y domicilio del responsable

- **WHEN** el dueño busca quién es responsable de sus datos
- **THEN** encuentra la sección "Quién es responsable de tus datos" con el nombre del responsable, su domicilio y los canales de contacto (los datos que aún no existen aparecen como placeholder entre corchetes)

#### Scenario: datos tratados y finalidades

- **WHEN** el dueño lee el aviso
- **THEN** encuentra la sección "Qué datos recogemos", que enumera los campos obligatorios y opcionales del formulario, y la sección "Para qué usamos tus datos", que enumera las finalidades (revisar el negocio, publicar la ficha, avisarle por WhatsApp y contar registros en números generales)

#### Scenario: medios para limitar el uso o la divulgación

- **WHEN** el dueño quiere que su teléfono fijo deje de aparecer, o que su ficha se baje del directorio
- **THEN** encuentra la sección "Cómo limitar el uso o la divulgación de tus datos", que le dice qué puede pedir (no publicar un dato, despublicar la ficha, borrarla de forma definitiva), que la despublicación se hace en cuanto llega su mensaje y que todo se atiende a mano, sin botón automático, con confirmación en un máximo de 20 días hábiles

#### Scenario: el plazo de 90 días es el de los registros rechazados

- **WHEN** el dueño lee lo que pasa con los datos de un registro que no se publicó
- **THEN** el aviso dice que los datos de los registros **rechazados** se eliminan definitivamente a los 90 días —lo mismo que `/terminos` y que el PRD §6.3— y NO promete borrar los que siguen en revisión

#### Scenario: derechos ARCO con plazo de 20 días hábiles

- **WHEN** el dueño quiere corregir o borrar sus datos
- **THEN** encuentra la sección "Tus derechos ARCO" con los cuatro derechos, los datos que debe incluir en su solicitud, los canales para mandarla y la frase de que se le contesta "en un máximo de 20 días hábiles", sin costo

#### Scenario: procedimiento de cambios al aviso

- **WHEN** el dueño quiere saber qué pasa si el aviso cambia
- **THEN** encuentra la sección "Cambios a este aviso", que dice que la versión nueva se publica en esa misma página con su fecha actualizada y que un cambio importante se le avisa por WhatsApp al número registrado antes de aplicarlo

### Requirement: El aviso integral advierte que el WhatsApp y el teléfono quedan públicos

El aviso integral DEBE decir con claridad, en su propia sección, qué información de la ficha queda visible para cualquier persona en internet —incluidos el nombre del negocio, el WhatsApp y el teléfono fijo, con botones para escribir o marcar directo—, que la colonia se publica pero el domicilio exacto no, salvo que el propio dueño lo escriba, que los buscadores pueden indexar la ficha, y qué datos NO se publican nunca (la fecha de registro, las notas internas de la revisión y el motivo de un rechazo). Es el mismo mensaje que el aviso simplificado del formulario, aquí en su versión completa.

La enumeración DEBE cuadrar exactamente con lo que la ficha pública sirve hoy, así que incluye además: (a) que la dirección o las referencias que el dueño escriba alimentan el botón "Cómo llegar" de la ficha, que abre Google Maps con esa dirección en el teléfono de quien lo toca (`construirEnlaceComoLlegar` en `src/lib/enlaces.ts`) —el dato no se comparte con nadie desde el servidor, pero sale hacia un tercero en cuanto un vecino usa el botón, y el dueño tiene derecho a saberlo antes de escribirlo—; y (b) que la foto del negocio es pública, con la política de qué se puede retratar y qué pasa si no se cumple. El formulario captura fotos, así que el aviso DEBE decir qué se acepta (el local, los productos o el trabajo), qué no (personas que se puedan reconocer, porque este aviso cubre los datos del titular y no la imagen de terceros) y que una foto que no cumpla no se publica. DEBE decir además que la imagen se guarda comprimida y sin los metadatos que trae el archivo —la ubicación GPS de la toma, entre otros—, porque ese dato no se publica ni se conserva.

#### Scenario: el aviso dice que el WhatsApp queda a la vista

- **WHEN** el dueño lee la sección "Qué queda público y qué no"
- **THEN** lee que su WhatsApp y su teléfono fijo quedan visibles en su ficha para cualquiera que entre al directorio y que cualquier persona puede escribirle o marcarle desde ahí

#### Scenario: el aviso distingue colonia de domicilio

- **WHEN** el dueño lee la misma sección
- **THEN** lee que se publica su colonia y no su domicilio exacto, y que si él escribe una dirección o referencias, eso sí se publica tal cual, con la advertencia de pensarlo si atiende desde su casa

#### Scenario: la dirección alimenta el botón "Cómo llegar"

- **WHEN** el dueño lee la misma sección
- **THEN** lee que la dirección o las referencias que escriba alimentan el botón "Cómo llegar" de su ficha, y que quien lo toque abre Google Maps buscando esa dirección con su colonia y "Tizayuca, Hidalgo"

#### Scenario: la foto del negocio también es pública

- **WHEN** el dueño lee la misma sección
- **THEN** lee que, si sube una foto de su negocio, esa foto también es pública; que debe mostrar su local, sus productos o su trabajo y no personas que se puedan reconocer; que una foto que no cumple no se publica; y que la imagen se guarda comprimida y sin los metadatos del archivo, como la ubicación GPS

#### Scenario: lo que nunca se publica

- **WHEN** el dueño lee la misma sección
- **THEN** lee que la fecha de registro, las notas internas de la revisión y el motivo de un rechazo solo los ve quien administra el directorio

### Requirement: Texto completo del aviso de privacidad integral

El contenido publicado en `/aviso-de-privacidad` DEBE ser literalmente el siguiente (los encabezados marcados con `##` son los `h2` de la página; las viñetas son listas). Es contenido aprobado, no copy libre: cambiarlo cambia esta spec.

```
Aviso de privacidad

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Este aviso explica, sin rodeos, qué datos nos das cuando registras tu negocio en NecesitoUno Tizayuca, para qué los usamos, qué queda público y cómo puedes pedirnos que los corrijamos o los borremos.

## Quién es responsable de tus datos

El responsable del directorio NecesitoUno Tizayuca y de los datos personales que nos das es [NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento], con domicilio en [DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento], Tizayuca, Hidalgo, México.

Para cualquier cosa relacionada con tus datos escríbenos al correo [CORREO ARCO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento].

## Qué datos recogemos

Los que tú escribes en el formulario de registro:

- Obligatorios: el nombre de tu negocio, la categoría, tu número de WhatsApp de 10 dígitos y tu colonia.
- Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario, el link de tu Facebook y, si la subes, una foto de tu negocio.

No te pedimos CURP, RFC, credencial de elector ni datos bancarios. Si nos los mandas por WhatsApp, no los guardamos.

Guardamos también la fecha y la hora en que aceptaste este aviso: es la constancia de que nos diste tu permiso para usar tus datos.

Cuando envías el formulario, el servidor usa tu dirección IP por menos de una hora, solo en su memoria, para frenar registros automatizados. No la guardamos en la base de datos ni la ligamos a tu ficha.

## Para qué usamos tus datos

- Para revisar que tu negocio existe y que el número que registraste es tuyo: te escribimos o te llamamos por WhatsApp antes de publicar.
- Para publicar tu ficha en el directorio, que es a lo que vino todo esto: que los vecinos te encuentren y te contacten.
- Para avisarte cuando publicamos tu ficha, para mandarte su link y para decirte, si fuera el caso, por qué no la publicamos.
- Para contar cuántos negocios se registran y cuántos se publican, en números generales, y saber si el directorio está sirviendo.

No usamos tus datos para publicidad de terceros ni para nada distinto de tener el directorio funcionando.

## Qué queda público y qué no

Cuando aprobamos tu registro, tu ficha se publica y cualquier persona con internet puede verla: el nombre de tu negocio, la categoría, tu colonia, lo que escribiste en "¿Qué ofreces?", tu horario, si haces entregas, el link de tu Facebook y —esto es lo más importante— tu WhatsApp y tu teléfono fijo, con botones para escribirte o marcarte directo. Trátalos como números de contacto de tu negocio: quien sea puede verlos y usarlos.

Publicamos tu colonia, no tu domicilio exacto. Si tú escribes una dirección o referencias en el formulario, eso también se publica tal cual: piénsalo si atiendes desde tu casa.

Esa dirección también alimenta el botón "Cómo llegar" de tu ficha: quien lo toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu colonia y "Tizayuca, Hidalgo".

Si subes una foto de tu negocio, esa foto es pública igual que lo demás. La foto es opcional y debe mostrar tu local, tus productos o tu trabajo: que no salgan personas que se puedan reconocer, porque este aviso cubre tus datos y no la imagen de otras personas. Si una foto no cumple, no la publicamos y te decimos por qué al revisar tu registro. Antes de guardarla la comprimimos y le quitamos los datos ocultos que trae el archivo —como la ubicación GPS de dónde se tomó—: eso no se publica ni se conserva.

Buscadores como Google pueden encontrar tu ficha y mostrarla en sus resultados. Para eso está hecho el directorio.

Lo que nunca se publica: la fecha en que te registraste, las notas internas de la revisión y el motivo por el que, en su caso, no publicamos tu ficha. Eso solo lo ve quien administra el directorio.

## Con quién compartimos tus datos

Con nadie. No vendemos, no rentamos ni intercambiamos tus datos.

Los únicos terceros que participan son los proveedores que hacen funcionar el sitio (hospedaje y base de datos), que tratan los datos por cuenta nuestra y nada más para eso.

Solo entregaríamos datos a una autoridad que nos los pida por escrito y conforme a la ley.

## Cómo limitar el uso o la divulgación de tus datos

- Dinos qué no quieres publicar: si prefieres que tu teléfono fijo, tu horario o tu dirección no aparezcan en la ficha, escríbenos y los quitamos.
- Pide que despubliquemos tu ficha: en cuanto nos llega tu mensaje la bajamos del directorio, sin trámites ni explicaciones.
- Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos.
- Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días.

Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo. Escríbenos por WhatsApp o por correo y te confirmamos que quedó hecho en un máximo de 20 días hábiles.

## Tus derechos ARCO

Tienes derecho a acceder a tus datos, a rectificarlos si están mal, a cancelarlos (que los borremos) y a oponerte a que los usemos. Eso son los derechos ARCO.

Para ejercerlos escríbenos al correo [CORREO ARCO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento] y dinos:

- qué quieres: ver tus datos, corregirlos, borrarlos u oponerte a que los usemos;
- el nombre de tu negocio y el número de WhatsApp con el que lo registraste;
- si es una corrección, qué debe decir.

Te contestamos en un máximo de 20 días hábiles y, si tu solicitud procede, la aplicamos en cuanto te respondemos. No cobramos nada por esto.

Como el registro no usa cuentas ni contraseñas, antes de cambiar o borrar algo confirmamos que la solicitud viene del mismo número de WhatsApp con el que se registró el negocio. Es para que nadie más pueda tocar tu ficha.

## Cookies y datos de navegación

El directorio público no usa cookies de publicidad ni rastrea a los vecinos que lo visitan. La única cookie del sitio es la de la sesión de quien administra el directorio. Si más adelante agregamos alguna herramienta para medir visitas, lo decimos aquí antes de encenderla.

## Cambios a este aviso

Si cambiamos este aviso, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Si el cambio es importante —por ejemplo, si empezamos a usar tus datos para algo nuevo—, te avisamos por WhatsApp al número que registraste antes de aplicarlo. Darle una repasada a esta página de vez en cuando es la forma de estar al tanto.

## Si crees que no respetamos tus derechos

Puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, que desde 2025 es la autoridad en materia de protección de datos personales en México.

Términos y condiciones
```

La última línea es el enlace a `/terminos`.

#### Scenario: el texto publicado es el aprobado

- **WHEN** se compara lo que muestra `/aviso-de-privacidad` con el contenido de esta spec
- **THEN** coinciden párrafo por párrafo, sin texto de relleno, sin secciones vacías y sin "lorem ipsum"

#### Scenario: nada de esto necesita conocimiento legal para entenderse

- **WHEN** un vecino sin formación legal lee el aviso completo
- **THEN** todas las frases están en español mexicano llano, en segunda persona ("tus datos", "escríbenos"), sin latinismos ni fórmulas de contrato

#### Scenario: la foto está en la lista de datos que se recogen

- **WHEN** el dueño lee la sección "Qué datos recogemos"
- **THEN** la viñeta de datos opcionales nombra la foto del negocio, junto con el resto de lo que el formulario captura

### Requirement: Página de términos y condiciones en `/terminos`

El sitio DEBE publicar los términos y condiciones en la ruta `/terminos` (segmento reservado), dentro del layout global, con un solo `h1` con el texto literal "Términos y condiciones" y sus secciones como `h2`. DEBE mostrar la línea "Última actualización: " con su fecha, igual que el aviso, y DEBE llevar un enlace visible al aviso de privacidad con el texto "Aviso de privacidad".

#### Scenario: el vecino abre los términos

- **WHEN** cualquier persona abre `/terminos` en su celular
- **THEN** ve, dentro del layout con header y footer, el encabezado "Términos y condiciones", la línea "Última actualización: " con su fecha y el contenido completo

#### Scenario: los términos enlazan al aviso de privacidad

- **WHEN** el dueño lee la sección de los términos que habla de sus datos personales
- **THEN** encuentra un enlace con el texto "Aviso de privacidad" que lo lleva a `/aviso-de-privacidad`

### Requirement: Los términos declaran al directorio como intermediario informativo y deslindan las operaciones

Los términos DEBEN establecer que NecesitoUno Tizayuca es un intermediario informativo: solo muestra información, no presta los servicios ni vende los productos de las fichas, y no cobra por publicar ni cobra comisiones. DEBEN deslindar expresamente al directorio de todo lo que ocurre entre el vecino y el negocio —precio, trabajo, entrega, pago, garantía, tiempos y cualquier problema— y de la veracidad de la información que cada negocio escribe. DEBEN además explicar qué significa el sello "Negocio verificado" (que el negocio existe y que el número registrado es suyo) y qué NO se verifica (calidad, precios, licencias, permisos, seguros ni que la información siga vigente).

#### Scenario: deslinde de la operación entre vecino y negocio

- **WHEN** un vecino contrata un servicio con un negocio que encontró en el directorio y algo sale mal
- **THEN** los términos ya le dijeron, en la sección "Somos un intermediario informativo, no el negocio", que ese trato es directo entre él y el negocio y que el directorio no es parte, no lo garantiza y no responde por él

#### Scenario: alcance real del sello "Negocio verificado"

- **WHEN** alguien quiere saber qué respalda el sello de verificado
- **THEN** los términos dicen que solo se confirmó que el negocio existe y que el número es de quien lo registró, y enumeran lo que no se verifica (calidad, precios, licencias, permisos, seguros y vigencia de la información)

### Requirement: Los términos publican las reglas de moderación del PRD §6.3

Los términos DEBEN publicar las reglas de moderación del PRD §6.3, que de otro modo solo vivirían en el panel del admin: se rechazan (o se retiran, si ya estaban publicadas) las fichas de actividades ilegales o que requieren una licencia no demostrable —con los ejemplos del PRD: medicamentos controlados, armas y préstamos informales—, el contenido ofensivo, discriminatorio o sexual, las fichas de negocios ajenos registradas sin autorización del negocio, y las fotos que no cumplan las reglas de publicación del directorio. DEBEN decir también que rechazar no es definitivo (se avisa el motivo por WhatsApp y el negocio puede corregir y volver a enviar), que los datos de los registros rechazados se borran a los 90 días, y que el directorio se reserva el derecho de no publicar o de retirar una ficha, incluida la baja inmediata cuando el propio negocio la pide.

#### Scenario: las reglas de moderación están publicadas

- **WHEN** un dueño quiere saber por qué podrían rechazarle su ficha
- **THEN** encuentra en `/terminos` la lista completa de las reglas del PRD §6.3, con sus ejemplos, sin tener que preguntarle a nadie

#### Scenario: rechazar no es para siempre

- **WHEN** a un negocio le rechazan el registro
- **THEN** los términos ya le dijeron que se le avisa el motivo por WhatsApp, que puede corregir y volver a enviar, y que los datos de un registro rechazado se borran a los 90 días

#### Scenario: retiro de fichas

- **WHEN** un negocio pide que bajen su ficha, o una ficha rompe las reglas
- **THEN** los términos dejan claro que el directorio puede no publicarla o retirarla, y que cuando el negocio lo pide la baja es inmediata

### Requirement: Texto completo de los términos y condiciones

El contenido publicado en `/terminos` DEBE ser literalmente el siguiente (los encabezados marcados con `##` son los `h2` de la página). Es contenido aprobado, no copy libre.

```
Términos y condiciones

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Estas son las reglas de NecesitoUno Tizayuca, para los negocios que se registran y para los vecinos que los buscan. Al usar el sitio o registrar tu negocio, aceptas lo que dice aquí.

## Qué es NecesitoUno Tizayuca

Es un directorio de negocios y servicios de Tizayuca, Hidalgo. Sirve para dos cosas: que un negocio publique su ficha gratis y que un vecino lo encuentre y le escriba por WhatsApp. Nada más.

No cobramos por registrarse, no vendemos nada, no cobramos comisiones y no hay cuentas ni contraseñas.

## Somos un intermediario informativo, no el negocio

NecesitoUno Tizayuca solo muestra información. No prestamos los servicios ni vendemos los productos que aparecen en las fichas.

Cuando le escribes a un negocio por WhatsApp, sales de este sitio. Lo que pase después —el precio, el trabajo, la entrega, el pago, la garantía, los tiempos y cualquier problema— es un trato directo entre tú y ese negocio. NecesitoUno Tizayuca no es parte de ese trato, no lo garantiza, no lo supervisa y no responde por él.

Tampoco respondemos por daños, pérdidas o desacuerdos que salgan de un servicio o una compra contratados con alguien que encontraste aquí. Si algo sale mal, resuélvelo con el negocio; y avísanos, porque nos sirve para moderar el directorio.

## Qué verificamos y qué no

Antes de publicar una ficha le escribimos o le llamamos al número registrado para confirmar dos cosas: que el negocio existe y que el número es de quien lo registró. Eso, y nada más que eso, es lo que significa el sello "Negocio verificado".

Lo que no verificamos: la calidad del trabajo, los precios, que el negocio tenga licencias, permisos o seguros, ni que lo que dice su ficha siga siendo cierto con el tiempo. Esa información la escribe cada negocio y es su responsabilidad que sea verdadera y esté al día.

Si un negocio cierra o cambia sus datos y no nos avisa, su ficha puede quedar desactualizada. Avísanos y la corregimos o la bajamos.

## Reglas para registrar un negocio

Revisamos a mano cada registro antes de publicarlo. Rechazamos —o retiramos, si ya estaba publicada— cualquier ficha que caiga en esto:

- Actividades ilegales, o que necesitan una licencia o un permiso que no se pueda demostrar: venta de medicamentos controlados, armas, préstamos informales y parecidos.
- Contenido ofensivo, discriminatorio o sexual.
- Fichas de negocios ajenos registradas por alguien sin autorización del negocio: solo lo registra su dueño o alguien con su permiso.
- Fotos que no cumplan las reglas de publicación del directorio.
- Datos falsos, un número de contacto que no es del negocio, o registrar la misma ficha varias veces.

Rechazar no es para siempre: te avisamos por WhatsApp con el motivo y puedes corregir y volver a enviar tu registro. Los datos de los registros rechazados se borran a los 90 días.

## Podemos retirar una ficha

Nos reservamos el derecho de no publicar o de retirar cualquier ficha que rompa estas reglas o que ya no corresponda a un negocio real de Tizayuca. Y si el propio negocio nos pide que la bajemos, la bajamos de inmediato.

## Si ves algo raro

Si encuentras una ficha falsa, un negocio que ya cerró o algo que rompe estas reglas, escríbenos al correo [CORREO DE CONTACTO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]. Lo revisamos y actuamos.

## Uso de la información del directorio

Los datos del directorio están para que los vecinos contacten a los negocios uno por uno. Copiarlos de forma masiva —a mano o con programas— para armar otra base de datos, revenderlos o mandar publicidad no está permitido.

## Tus datos personales

Qué datos guardamos, para qué los usamos y qué queda público está explicado en el aviso de privacidad.

Aviso de privacidad

## Cambios a estos términos

Si cambiamos estas reglas, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Seguir usando el sitio después de un cambio significa que lo aceptas.

## Ley aplicable

Estos términos se rigen por las leyes mexicanas. [JURISDICCIÓN PARA CONTROVERSIAS — confirmar en la revisión legal].
```

La línea suelta "Aviso de privacidad" es el enlace a `/aviso-de-privacidad`.

#### Scenario: el texto publicado es el aprobado

- **WHEN** se compara lo que muestra `/terminos` con el contenido de esta spec
- **THEN** coinciden párrafo por párrafo, sin texto de relleno ni secciones vacías

#### Scenario: lenguaje llano también en los términos

- **WHEN** un vecino sin formación legal lee los términos
- **THEN** los entiende: frases cortas, segunda persona y ningún párrafo de contrato en mayúsculas o en jerga

### Requirement: Placeholders visibles y marca de borrador mientras falten datos del responsable

Todo dato que solo una persona puede aportar (nombre o razón social del responsable, domicilio, correo de contacto/ARCO, WhatsApp del directorio, fecha de publicación y jurisdicción) DEBE aparecer en la página como un placeholder visible entre corchetes con la indicación de que falta completarlo, nunca como un dato inventado, un espacio en blanco o texto de relleno. Mientras quede al menos un placeholder sin completar, ambas páginas DEBEN mostrar arriba, de forma visible, la marca de borrador con el texto literal "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance." Los placeholders pendientes DEBEN estar declarados en un solo lugar del código, de modo que la verificación automática pueda listarlos y el checklist de lanzamiento no dependa de que alguien los busque a ojo.

Los datos que faltan no son lo único pendiente antes de retirar la marca de borrador. Junto a los placeholders DEBE declararse, en el mismo módulo y en la misma forma recorrible, la lista de los **pendientes operativos**, cada uno con el compromiso o el tratamiento del que habla, con lo que el sistema hace hoy y con el ticket que lo resuelve, para que la revisión legal y el checklist de lanzamiento los vean sin buscarlos a ojo. Esta lista NO se publica en las páginas: el texto legal dice lo que el responsable se compromete a hacer, no el estado del backlog; lo que las páginas no DEBEN hacer es prometer automatismos que no existen.

Un renglón entra en esa lista por cualquiera de estas tres razones, no solo por la primera: (a) el texto publicado promete una operación que el sistema todavía no hace solo; (b) el texto publicado obliga al sistema a quedarse corto a propósito, de modo que cambiarlo primero es condición para mejorar la defensa; o (c) el sistema trata datos personales que el texto publicado no menciona. La lista DEBE reflejar la realidad del sistema en cada momento: un renglón sale cuando deja de ser cierto, y entra en cuanto lo es.

Un pendiente DEBE salir de esa lista **solo en la parte que el sistema ya puede hacer de verdad, no entero**, porque un checklist de lanzamiento que miente por omisión es peor que un renglón de más. De las cuatro letras de ARCO, el panel resuelve la cancelación y la oposición —despublicar una ficha y borrar un registro de forma definitiva son acciones suyas—, así que esa parte ya no DEBE aparecer como pendiente; **el acceso y la rectificación sí DEBEN seguir declarados**, con su ticket, porque el aviso los promete ("escríbenos y los quitamos", "rectificarlos si están mal") y el panel no tiene ninguna pantalla para entregarle al negocio una copia de sus datos, corregirlos ni quitar un campo de su ficha: eso sigue haciéndose a mano contra la base.

Hoy la lista tiene **cuatro** renglones: (1) el acceso y la rectificación, que se atienden a mano contra la base; (2) el aviso dice que los datos los tratan "los proveedores que hacen funcionar el sitio (hospedaje y base de datos)" sin nombrarlos, y ADR-004 exige nombrar al encargado del tratamiento antes del lanzamiento, cosa que solo puede escribirse cuando la cuenta exista; (3) el aviso dice que la IP de quien envía el formulario se usa "por menos de una hora, solo en su memoria" y que "no la guardamos en la base de datos", así que los cupos del formulario público y de los reportes se quedan contando en la memoria de cada instancia —más flojos de lo que podrían ser— hasta que la revisión legal apruebe otra redacción; y (4) el aviso no menciona que, al enviar el formulario de acceso al panel, el sistema guarde una fila por intento con un HMAC de la IP (nunca la IP) y la hora, para frenar la fuerza bruta contra la única credencial del sitio. La eliminación de los registros rechazados a los 90 días NO DEBE aparecer en la lista: el sistema la ejecuta sin intervención humana.

Los textos publicados del aviso y de los términos no dependen de esta lista y siguen siendo verdad: la despublicación y el borrado se ejecutan a mano y a petición del titular, después de que el admin verifica la titularidad por WhatsApp; el titular sigue sin tener "un botón que lo haga solo". La frase "todo esto lo atendemos a mano, cuando tú lo pides" habla de lo que el titular pide; la eliminación de los registros rechazados a los 90 días no es una solicitud suya y la ejecuta el sistema por su cuenta, así que el texto promete menos de lo que se cumple, nunca más.

Completar un placeholder del aviso o retirar su marca de borrador cambia el contenido publicado del aviso y, por lo tanto, DEBE estrenar versión (ver el requirement "Cambiar el texto del aviso sin subir la versión rompe la verificación"). En los términos no, porque no se versionan.

#### Scenario: el domicilio del responsable todavía no existe

- **WHEN** el humano abre `/aviso-de-privacidad` antes de la revisión legal
- **THEN** en lugar del domicilio lee "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]", y lo mismo para el nombre del responsable, el correo ARCO y el WhatsApp del directorio

#### Scenario: marca de borrador visible

- **WHEN** cualquier persona abre cualquiera de las dos páginas legales mientras siga habiendo placeholders sin completar
- **THEN** lee arriba "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance."

#### Scenario: los pendientes son verificables

- **WHEN** se corre la verificación automática del sitio
- **THEN** puede listar cuáles placeholders siguen sin completar, y ninguna página legal contiene un dato de contacto o un domicilio inventado

#### Scenario: los pendientes operativos también están declarados

- **WHEN** la revisión legal o el checklist de lanzamiento revisan qué falta antes de retirar la marca de borrador
- **THEN** encuentran, junto a la lista de placeholders y en el mismo módulo, los cuatro pendientes operativos —el acceso y la rectificación en el panel, el nombre del encargado del tratamiento, los dos cupos que siguen en memoria para no volver falsa la frase de la IP, y lo que se guarda de quien intenta entrar al panel—, cada uno con su ticket, y ninguno de ellos aparece publicado en las páginas legales

#### Scenario: el pendiente ARCO quedó acotado, no retirado

- **WHEN** la revisión legal busca en esa lista qué falta de los derechos ARCO
- **THEN** lee que lo pendiente son el acceso y la rectificación —entregarle al negocio una copia de sus datos, corregirlos o quitar un campo de su ficha—, con la nota de que despublicar y borrar ya son acciones del panel, y ningún pendiente sigue diciendo que falta despublicar o borrar

#### Scenario: la purga ya no es un pendiente

- **WHEN** se recorre la misma lista
- **THEN** la eliminación de los datos de los registros rechazados a los 90 días no aparece, porque el sistema la ejecuta sin intervención humana

#### Scenario: lo que el sistema guarda de quien intenta entrar al panel está declarado

- **WHEN** la revisión legal busca en la lista si el sistema trata algún dato que el aviso no menciona
- **THEN** lee que, al enviar el formulario de `/admin`, se guarda una fila por intento con un HMAC de la IP —nunca la IP— y la hora, con su finalidad, su duración y su ticket, para que decida si el aviso necesita una línea

#### Scenario: el texto legal no cambia porque el sistema estrene automatismos

- **WHEN** se comparan `/aviso-de-privacidad` y `/terminos` con el texto aprobado en esta spec, con el panel ya ofreciendo despublicar y borrar y con la purga de los 90 días corriendo sola
- **THEN** coinciden párrafo por párrafo: siguen diciendo que todo se atiende a mano y a petición, con confirmación en un máximo de 20 días hábiles

### Requirement: Las dos páginas legales son indexables y tienen metadata propia

`/aviso-de-privacidad` y `/terminos` DEBEN ser indexables: ninguna DEBE declarar `noindex` (a diferencia de la página de resultados del buscador y del panel). Cada una DEBE exponer su propio título y su propia descripción, distintos de los del sitio, para que un vecino que las busque llegue a la correcta.

#### Scenario: sin noindex

- **WHEN** se revisa la metadata de las dos páginas legales
- **THEN** ninguna pide a los buscadores que no la indexe

#### Scenario: título y descripción propios

- **WHEN** una de las dos páginas se comparte o aparece en un buscador
- **THEN** su título y su descripción hablan de ese documento y no repiten los del sitio

### Requirement: Las páginas legales son Server Components mobile-first sin JavaScript de cliente

Las dos páginas DEBEN renderizarse como Server Components, sin declarar `"use client"` y sin agregar bundles de cliente propios: son texto. DEBEN verse completas y legibles en un viewport de 390px sin scroll horizontal, con ancho de lectura cómodo en escritorio, y todo elemento tocable (los enlaces entre documentos) DEBE medir al menos 44px en su dimensión menor.

#### Scenario: se leen en el celular

- **WHEN** el dueño abre cualquiera de las dos páginas en un viewport de 390px
- **THEN** el texto se lee completo, sin scroll horizontal, y los enlaces se pueden tocar sin precisión de cirujano

#### Scenario: sin JavaScript de cliente

- **WHEN** se construye el sitio y se revisan las dos páginas legales
- **THEN** ninguna usa la directiva `"use client"` ni agrega JavaScript de cliente propio, y su contenido se ve completo con el JavaScript deshabilitado
