# Delta: paginas-legales

## ADDED Requirements

### Requirement: El aviso de privacidad tiene una versión estable declarada en un solo lugar

El aviso de privacidad DEBE tener un identificador de versión estable, declarado como un literal único en un solo módulo del código, del que lo leen todas las superficies que lo muestran o lo guardan (la página integral, el bloque de consentimiento del formulario y el servidor que registra la constancia). El identificador DEBE ser una cadena que solo avanza: la versión vigente de arranque es `1` y una versión ya publicada NUNCA DEBE reutilizarse para otro texto. La versión identifica al aviso completo, que a estos efectos son tres piezas inseparables: el aviso simplificado del formulario, el literal de la casilla de consentimiento y el aviso integral de `/aviso-de-privacidad`. Los términos y condiciones NO entran en esta versión.

#### Scenario: una sola fuente de la versión

- **WHEN** se revisa dónde está escrito el identificador de versión del aviso
- **THEN** aparece una sola vez en el código, y la página del aviso, el formulario de registro y el servidor lo leen de ahí, sin copias

#### Scenario: la versión de arranque

- **WHEN** se consulta la versión vigente del aviso al entregar este change
- **THEN** es `1`, y corresponde al texto que hoy publican `/aviso-de-privacidad` y el bloque de consentimiento del formulario

### Requirement: Cambiar el texto del aviso sin subir la versión rompe la verificación

La verificación automática del proyecto DEBE incluir un guardián que ate la versión al texto: calcula una huella del contenido versionado del aviso —el texto del aviso simplificado, el literal de la casilla de consentimiento y todo el contenido publicado del aviso integral (encabezado, línea de última actualización, introducción, secciones con sus párrafos y viñetas, y el enlace de cierre), excluyendo únicamente la propia línea de versión— y la compara contra la huella anclada para la versión vigente. Si no coinciden, la verificación DEBE fallar y decir qué hacer: subir la versión y anclar su huella. Las huellas de las versiones ya publicadas DEBEN quedar registradas y NO DEBEN modificarse; la tabla de huellas DEBE vivir junto a la verificación y no junto al texto, para que corregir el texto y "arreglar" la huella no sean el mismo gesto distraído. La verificación DEBE comprobar además que la versión vigente tiene huella anclada y que es la última de la tabla.

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

## MODIFIED Requirements

### Requirement: Página del aviso de privacidad integral en `/aviso-de-privacidad`

El sitio DEBE publicar el aviso de privacidad integral en la ruta `/aviso-de-privacidad` (segmento reservado en `src/lib/rutas-reservadas.ts`), dentro del layout global, con un solo `h1` con el texto literal "Aviso de privacidad" y sus secciones como `h2`, sin saltos de jerarquía. La página DEBE mostrar, arriba del contenido, la versión vigente del aviso y la fecha en que se publicó ese texto, en una sola línea con la forma literal "Versión 1 · Última actualización: " seguida de la fecha escrita en español (por ejemplo "3 de septiembre de 2026"), donde `1` es el identificador de versión vigente. El bloque literal del requirement "Texto completo del aviso de privacidad integral" NO cambia con esto: la versión se antepone a esa misma línea al pintarla, y por eso queda fuera de la huella del guardián (todo lo demás de ese bloque, incluida la fecha, sí entra). La página DEBE llevar un enlace visible a los términos y condiciones con el texto "Términos y condiciones", y NO DEBE llevar ningún enlace a una página que no exista.

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

### Requirement: Texto completo del aviso de privacidad integral

**Enmienda aprobada durante la implementación de T-012** (el orquestador la autorizó como parte de este change): la sección "Qué datos recogemos" no nombraba la foto del negocio, que el formulario captura desde T-008. El elemento (2) de la LFPDPPP (PRD §8) exige enumerar los datos tratados, así que la viñeta de opcionales la agrega. El resto del bloque no cambia.

El texto anterior de esa viñeta era: "Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario y el link de tu Facebook."

Esta enmienda es, además, el primer caso de uso del guardián de este change: cambiar el texto dejó la verificación en rojo hasta anclar la huella nueva. Como la versión `1` la estrena este mismo change y todavía no ampara ninguna constancia guardada, se volvió a anclar su huella en lugar de estrenar una `2` (ver `tests/aviso-version.test.ts`, que explica que esa excepción vale solo antes del merge).


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

Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual que lo demás. Hoy el formulario todavía no pide fotos; el día que las pida, aquí te decimos qué se puede publicar en ellas.

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
