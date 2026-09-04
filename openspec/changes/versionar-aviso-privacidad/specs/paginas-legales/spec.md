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
