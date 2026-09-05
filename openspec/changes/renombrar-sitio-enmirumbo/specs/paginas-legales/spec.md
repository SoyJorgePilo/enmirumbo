# Delta: paginas-legales

Regla de marca en los dos documentos (resolución del fundador del 2026-09-04): la **primera** mención de cada documento presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca" y todas las demás dicen "EnMiRumbo" a secas. No existe la forma compuesta "EnMiRumbo Tizayuca". Es el único cambio de redacción; lo demás del texto aprobado no se toca, salvo el correo del directorio, que sustituye a su placeholder.

## MODIFIED Requirements

### Requirement: Página del aviso de privacidad integral en `/aviso-de-privacidad`

El sitio DEBE publicar el aviso de privacidad integral en la ruta `/aviso-de-privacidad` (segmento reservado en `src/lib/rutas-reservadas.ts`), dentro del layout global, con un solo `h1` con el texto literal "Aviso de privacidad" y sus secciones como `h2`, sin saltos de jerarquía. La página DEBE mostrar, arriba del contenido, la versión vigente del aviso y la fecha en que se publicó ese texto, en una sola línea con la forma literal "Versión 2 · Última actualización: " seguida de la fecha escrita en español (por ejemplo "3 de septiembre de 2026"), donde `2` es el identificador de versión vigente. El bloque literal del requirement "Texto completo del aviso de privacidad integral" no incluye esa versión: se antepone a esa misma línea al pintarla, y por eso queda fuera de la huella del guardián (todo lo demás de ese bloque, incluida la fecha, sí entra). Los términos y condiciones NO llevan versión: su línea de última actualización se pinta tal cual. La página DEBE llevar un enlace visible a los términos y condiciones con el texto "Términos y condiciones", y NO DEBE llevar ningún enlace a una página que no exista.

#### Scenario: el dueño abre el aviso de privacidad

- **WHEN** el dueño de un negocio abre `/aviso-de-privacidad` en su celular
- **THEN** ve, dentro del layout con header y footer, el encabezado "Aviso de privacidad", la línea "Versión 2 · Última actualización: " con su fecha, y el contenido completo del aviso

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

El aviso de privacidad DEBE tener un identificador de versión estable, declarado como un literal único en un solo módulo del código, del que lo leen todas las superficies que lo muestran o lo guardan (la página integral, el bloque de consentimiento del formulario y el servidor que registra la constancia). El identificador DEBE ser una cadena que solo avanza: la versión vigente es `2` —estrenada por el rebrand a "EnMiRumbo" (T-019), que cambió el nombre del sitio dentro del texto publicado— y una versión ya publicada NUNCA DEBE reutilizarse para otro texto. La versión identifica al aviso completo, que a estos efectos son tres piezas inseparables: el aviso simplificado del formulario, el literal de la casilla de consentimiento y el aviso integral de `/aviso-de-privacidad`. Los términos y condiciones NO entran en esta versión.

#### Scenario: una sola fuente de la versión

- **WHEN** se revisa dónde está escrito el identificador de versión del aviso
- **THEN** aparece una sola vez en el código, y la página del aviso, el formulario de registro y el servidor lo leen de ahí, sin copias

#### Scenario: la versión vigente

- **WHEN** se consulta la versión vigente del aviso
- **THEN** es `2`, y corresponde al texto que hoy publican `/aviso-de-privacidad` y el bloque de consentimiento del formulario

### Requirement: Cambiar el texto del aviso sin subir la versión rompe la verificación

La verificación automática del proyecto DEBE incluir un guardián que ate la versión al texto: calcula una huella del contenido versionado del aviso —el texto del aviso simplificado, el literal de la casilla de consentimiento y todo el contenido publicado del aviso integral (encabezado, marca de borrador mientras se publique, línea de última actualización, introducción, secciones con sus párrafos y viñetas, y el enlace de cierre), excluyendo únicamente la propia línea de versión— y la compara contra la huella anclada para la versión vigente. Si no coinciden, la verificación DEBE fallar y decir qué hacer: subir la versión y anclar su huella. Las huellas de las versiones ya publicadas DEBEN quedar registradas y NO DEBEN modificarse —en particular, la de la versión `1` se queda tal cual aunque su texto ya no se publique: es la prueba de contra qué texto se firmaron las constancias que la citan—; la tabla de huellas DEBE vivir junto a la verificación y no junto al texto, para que corregir el texto y "arreglar" la huella no sean el mismo gesto distraído. La verificación DEBE comprobar además que la versión vigente tiene huella anclada y que es la última de la tabla.

La marca de borrador entra en la huella porque es contenido publicado: advierte al titular de que el texto que está aceptando todavía no pasó la revisión legal, y si quedara fuera, retirarla de la página no estrenaría versión y dejaría la verificación en verde.

#### Scenario: alguien edita el aviso y no sube la versión

- **WHEN** se cambia una frase del aviso integral, del aviso simplificado o del literal de la casilla, dejando la versión vigente como está
- **THEN** la verificación automática falla e indica que el texto del aviso cambió sin estrenar versión

#### Scenario: se estrena versión junto con el texto

- **WHEN** se cambia el texto del aviso, se sube la versión a la siguiente y se ancla la huella nueva
- **THEN** la verificación pasa, las huellas de las versiones anteriores siguen registradas tal cual y la tabla gana un renglón

#### Scenario: versión sin huella

- **WHEN** se sube la versión vigente sin anclar su huella
- **THEN** la verificación falla, porque la versión vigente siempre debe tener su huella en la tabla

#### Scenario: el guardián no se pisa con los placeholders

- **WHEN** el humano completa uno de los placeholders del aviso (por ejemplo el domicilio del responsable)
- **THEN** la verificación falla mientras no se estrene versión: completar un placeholder cambia el texto del aviso y por lo tanto estrena versión

#### Scenario: retirar la marca de borrador también estrena versión

- **WHEN** se dejan de publicar los placeholders y con ellos desaparece la marca de borrador de la página
- **THEN** la verificación falla mientras no se estrene versión: la marca es contenido publicado y entra en la huella

### Requirement: Texto completo del aviso de privacidad integral

El contenido publicado en `/aviso-de-privacidad` DEBE ser literalmente el siguiente (los encabezados marcados con `##` son los `h2` de la página; las viñetas son listas). Es contenido aprobado, no copy libre: cambiarlo cambia esta spec.

```
Aviso de privacidad

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Este aviso explica, sin rodeos, qué datos nos das cuando registras tu negocio en EnMiRumbo, el directorio de negocios de Tizayuca, para qué los usamos, qué queda público y cómo puedes pedirnos que los corrijamos o los borremos.

## Quién es responsable de tus datos

El responsable del directorio EnMiRumbo y de los datos personales que nos das es [NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento], con domicilio en [DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento], Tizayuca, Hidalgo, México.

Para cualquier cosa relacionada con tus datos escríbenos al correo contacto@enmirumbo.com o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento].

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

Para ejercerlos escríbenos al correo contacto@enmirumbo.com o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento] y dinos:

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

#### Scenario: el aviso nombra al sitio con la marca vigente

- **WHEN** el dueño lee la introducción del aviso y la sección "Quién es responsable de tus datos"
- **THEN** la introducción presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca" y la sección del responsable ya dice "EnMiRumbo" a secas, sin la marca anterior y sin la localidad pegada al nombre

#### Scenario: nada de esto necesita conocimiento legal para entenderse

- **WHEN** un vecino sin formación legal lee el aviso completo
- **THEN** todas las frases están en español mexicano llano, en segunda persona ("tus datos", "escríbenos"), sin latinismos ni fórmulas de contrato

#### Scenario: la foto está en la lista de datos que se recogen

- **WHEN** el dueño lee la sección "Qué datos recogemos"
- **THEN** la viñeta de datos opcionales nombra la foto del negocio, junto con el resto de lo que el formulario captura

### Requirement: Los términos declaran al directorio como intermediario informativo y deslindan las operaciones

Los términos DEBEN establecer que EnMiRumbo es un intermediario informativo: solo muestra información, no presta los servicios ni vende los productos de las fichas, y no cobra por publicar ni cobra comisiones. DEBEN deslindar expresamente al directorio de todo lo que ocurre entre el vecino y el negocio —precio, trabajo, entrega, pago, garantía, tiempos y cualquier problema— y de la veracidad de la información que cada negocio escribe. DEBEN además explicar qué significa el sello "Negocio verificado" (que el negocio existe y que el número registrado es suyo) y qué NO se verifica (calidad, precios, licencias, permisos, seguros ni que la información siga vigente).

#### Scenario: deslinde de la operación entre vecino y negocio

- **WHEN** un vecino contrata un servicio con un negocio que encontró en el directorio y algo sale mal
- **THEN** los términos ya le dijeron, en la sección "Somos un intermediario informativo, no el negocio", que ese trato es directo entre él y el negocio y que el directorio no es parte, no lo garantiza y no responde por él

#### Scenario: alcance real del sello "Negocio verificado"

- **WHEN** alguien quiere saber qué respalda el sello de verificado
- **THEN** los términos dicen que solo se confirmó que el negocio existe y que el número es de quien lo registró, y enumeran lo que no se verifica (calidad, precios, licencias, permisos, seguros y vigencia de la información)

### Requirement: Texto completo de los términos y condiciones

El contenido publicado en `/terminos` DEBE ser literalmente el siguiente (los encabezados marcados con `##` son los `h2` de la página). Es contenido aprobado, no copy libre.

```
Términos y condiciones

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Estas son las reglas de EnMiRumbo, el directorio de negocios de Tizayuca, para los negocios que se registran y para los vecinos que los buscan. Al usar el sitio o registrar tu negocio, aceptas lo que dice aquí.

## Qué es EnMiRumbo

Es un directorio de negocios y servicios de Tizayuca, Hidalgo. Sirve para dos cosas: que un negocio publique su ficha gratis y que un vecino lo encuentre y le escriba por WhatsApp. Nada más.

No cobramos por registrarse, no vendemos nada, no cobramos comisiones y no hay cuentas ni contraseñas.

## Somos un intermediario informativo, no el negocio

EnMiRumbo solo muestra información. No prestamos los servicios ni vendemos los productos que aparecen en las fichas.

Cuando le escribes a un negocio por WhatsApp, sales de este sitio. Lo que pase después —el precio, el trabajo, la entrega, el pago, la garantía, los tiempos y cualquier problema— es un trato directo entre tú y ese negocio. EnMiRumbo no es parte de ese trato, no lo garantiza, no lo supervisa y no responde por él.

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

Si encuentras una ficha falsa, un negocio que ya cerró o algo que rompe estas reglas, escríbenos al correo contacto@enmirumbo.com o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]. Lo revisamos y actuamos.

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

#### Scenario: los términos nombran al sitio con la marca vigente

- **WHEN** el vecino lee la entrada de los términos, el encabezado "Qué es EnMiRumbo" y la sección del deslinde
- **THEN** la entrada presenta al sitio como "EnMiRumbo, el directorio de negocios de Tizayuca" y de ahí en adelante los términos dicen "EnMiRumbo" a secas, sin la marca anterior y sin la localidad pegada al nombre

#### Scenario: lenguaje llano también en los términos

- **WHEN** un vecino sin formación legal lee los términos
- **THEN** los entiende: frases cortas, segunda persona y ningún párrafo de contrato en mayúsculas o en jerga

### Requirement: Placeholders visibles y marca de borrador mientras falten datos del responsable

Todo dato que solo una persona puede aportar (nombre o razón social del responsable, domicilio, WhatsApp del directorio, fecha de publicación y jurisdicción) DEBE aparecer en la página como un placeholder visible entre corchetes con la indicación de que falta completarlo, nunca como un dato inventado, un espacio en blanco o texto de relleno. Mientras quede al menos un placeholder sin completar, ambas páginas DEBEN mostrar arriba, de forma visible, la marca de borrador con el texto literal "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance." Los placeholders pendientes DEBEN estar declarados en un solo lugar del código, de modo que la verificación automática pueda listarlos y el checklist de lanzamiento no dependa de que alguien los busque a ojo.

El correo del directorio ya NO es un placeholder: con el dominio comprado, el canal de contacto y de ejercicio de derechos ARCO es `contacto@enmirumbo.com` y DEBE publicarse literalmente en los tres lugares donde el texto lo pide (las dos apariciones del aviso —"Quién es responsable de tus datos" y "Tus derechos ARCO"— y la sección "Si ves algo raro" de los términos). Publicar un correo que nadie atiende sería peor que un placeholder honesto: el buzón DEBE existir y recibir antes de que el texto se publique. Los demás datos del responsable siguen pendientes, así que la marca de borrador **se queda**.

Los datos que faltan no son lo único pendiente antes de retirar la marca de borrador. Junto a los placeholders DEBE declararse, en el mismo módulo y en la misma forma recorrible, la lista de los **pendientes operativos**, cada uno con el compromiso o el tratamiento del que habla, con lo que el sistema hace hoy y con el ticket que lo resuelve, para que la revisión legal y el checklist de lanzamiento los vean sin buscarlos a ojo. Esta lista NO se publica en las páginas: el texto legal dice lo que el responsable se compromete a hacer, no el estado del backlog; lo que las páginas no DEBEN hacer es prometer automatismos que no existen.

Un renglón entra en esa lista por cualquiera de estas tres razones, no solo por la primera: (a) el texto publicado promete una operación que el sistema todavía no hace solo; (b) el texto publicado obliga al sistema a quedarse corto a propósito, de modo que cambiarlo primero es condición para mejorar la defensa; o (c) el sistema trata datos personales que el texto publicado no menciona. La lista DEBE reflejar la realidad del sistema en cada momento: un renglón sale cuando deja de ser cierto, y entra en cuanto lo es.

Un pendiente DEBE salir de esa lista **solo en la parte que el sistema ya puede hacer de verdad, no entero**, porque un checklist de lanzamiento que miente por omisión es peor que un renglón de más. De las cuatro letras de ARCO, el panel resuelve la cancelación y la oposición —despublicar una ficha y borrar un registro de forma definitiva son acciones suyas—, así que esa parte ya no DEBE aparecer como pendiente; **el acceso y la rectificación sí DEBEN seguir declarados**, con su ticket, porque el aviso los promete ("escríbenos y los quitamos", "rectificarlos si están mal") y el panel no tiene ninguna pantalla para entregarle al negocio una copia de sus datos, corregirlos ni quitar un campo de su ficha: eso sigue haciéndose a mano contra la base.

Hoy la lista tiene **cuatro** renglones: (1) el acceso y la rectificación, que se atienden a mano contra la base; (2) el aviso dice que los datos los tratan "los proveedores que hacen funcionar el sitio (hospedaje y base de datos)" sin nombrarlos, y ADR-004 exige nombrar al encargado del tratamiento antes del lanzamiento, cosa que solo puede escribirse cuando la cuenta exista; (3) el aviso dice que la IP de quien envía el formulario se usa "por menos de una hora, solo en su memoria" y que "no la guardamos en la base de datos", así que los cupos del formulario público y de los reportes se quedan contando en la memoria de cada instancia —más flojos de lo que podrían ser— hasta que la revisión legal apruebe otra redacción; y (4) el aviso no menciona que, al enviar el formulario de acceso al panel, el sistema guarde una fila por intento con un HMAC de la IP (nunca la IP) y la hora, para frenar la fuerza bruta contra la única credencial del sitio. La eliminación de los registros rechazados a los 90 días NO DEBE aparecer en la lista: el sistema la ejecuta sin intervención humana.

Los textos publicados del aviso y de los términos no dependen de esta lista y siguen siendo verdad: la despublicación y el borrado se ejecutan a mano y a petición del titular, después de que el admin verifica la titularidad por WhatsApp; el titular sigue sin tener "un botón que lo haga solo". La frase "todo esto lo atendemos a mano, cuando tú lo pides" habla de lo que el titular pide; la eliminación de los registros rechazados a los 90 días no es una solicitud suya y la ejecuta el sistema por su cuenta, así que el texto promete menos de lo que se cumple, nunca más.

Completar un placeholder del aviso o retirar su marca de borrador cambia el contenido publicado del aviso y, por lo tanto, DEBE estrenar versión (ver el requirement "Cambiar el texto del aviso sin subir la versión rompe la verificación"). En los términos no, porque no se versionan. Publicar el correo del directorio es exactamente ese caso, y viaja en la misma versión `2` que el cambio de marca.

#### Scenario: el domicilio del responsable todavía no existe

- **WHEN** el humano abre `/aviso-de-privacidad` antes de la revisión legal
- **THEN** en lugar del domicilio lee "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]", y lo mismo para el nombre del responsable y el WhatsApp del directorio

#### Scenario: el correo ya no es un placeholder

- **WHEN** el dueño de un negocio busca a dónde escribir para ejercer sus derechos ARCO, o un vecino busca dónde reportar una ficha falsa
- **THEN** lee el correo `contacto@enmirumbo.com` escrito completo —en las dos secciones del aviso y en "Si ves algo raro" de los términos—, sin corchetes ni la nota de "completar antes del lanzamiento"

#### Scenario: marca de borrador visible

- **WHEN** cualquier persona abre cualquiera de las dos páginas legales mientras siga habiendo placeholders sin completar
- **THEN** lee arriba "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance."

#### Scenario: publicar el correo no retira la marca de borrador

- **WHEN** se publica el correo del directorio y siguen faltando el nombre del responsable, su domicilio, el WhatsApp, la fecha de publicación y la jurisdicción
- **THEN** las dos páginas siguen mostrando la marca de borrador, porque la revisión legal y los datos del responsable siguen pendientes

#### Scenario: los pendientes son verificables

- **WHEN** se corre la verificación automática del sitio
- **THEN** puede listar cuáles placeholders siguen sin completar —cinco, ya sin el correo—, y ninguna página legal contiene un dato de contacto o un domicilio inventado

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

## ADDED Requirements

### Requirement: El rebrand estrena la versión 2 del aviso, sin tocar la evidencia de la 1

Cambiar el nombre del sitio dentro del texto publicado del aviso —la introducción, la sección "Quién es responsable de tus datos" y el aviso simplificado del formulario— DEBE tratarse como lo que es: un cambio del contenido versionado. Lo mismo vale para publicar el correo del directorio en lugar de su placeholder. Los dos cambios llegan juntos, así que estrenan **una sola** versión: la `2`, con su huella nueva anclada. NO DEBE re-anclarse la huella de la versión `1`, aunque su texto ya no se publique: esa huella es la prueba de contra qué texto se firmaron las constancias que citan la versión `1`.

Las constancias ya guardadas NO DEBEN modificarse: una ficha que consintió la versión `1` sigue diciendo `1`, con su fecha, y la reaceptación —cuando la haya— se anota hacia adelante con la mecánica que ya existe. El sistema NO DEBE pedirle nada al titular por este cambio ni mandarle ningún mensaje: el aviso promete avisar por WhatsApp antes de aplicar un cambio importante —"por ejemplo, si empezamos a usar tus datos para algo nuevo"—, y un cambio de marca no altera qué datos se recogen, para qué se usan, con quién se comparten ni qué queda público. La versión nueva se publica en la misma página, que es exactamente lo que la sección "Cambios a este aviso" promete.

#### Scenario: la huella de la versión 1 sobrevive al rebrand

- **WHEN** se revisa la tabla de huellas después de publicar el aviso con la marca nueva
- **THEN** tiene dos renglones, el de la versión `1` es idéntico al de antes del rebrand y el de la `2` corresponde al texto que hoy se publica

#### Scenario: una constancia vieja no se reescribe

- **WHEN** el admin abre el detalle de una ficha que consintió antes del rebrand
- **THEN** ve la constancia con su fecha de siempre y la versión `1`, sin que nadie le haya cambiado la versión a `2`

#### Scenario: el rebrand no le pide nada al negocio ya publicado

- **WHEN** se despliega el aviso con la marca nueva y hay fichas publicadas
- **THEN** ninguna se despublica, a nadie se le manda un mensaje por el cambio y el directorio sigue funcionando igual

#### Scenario: el formulario abierto antes del despliegue no se guarda a ciegas

- **WHEN** un dueño abrió el formulario con la versión `1` a la vista, se despliega el rebrand y él envía después
- **THEN** no se guarda ningún registro y ve "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." junto a la casilla, con sus datos todavía en el formulario y el aviso nuevo a la vista
