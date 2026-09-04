# Delta de spec: paginas-legales

> **Enmienda aprobada: T-008 cumple la promesa del texto.**
>
> El aviso de privacidad que publicó T-007 dice hoy, palabra por palabra, "Hoy
> el formulario todavía no pide fotos; el día que las pida, aquí te decimos qué
> se puede publicar en ellas". Este change hace que el formulario **sí** pida
> fotos, así que esa frase pasa a ser falsa en el momento en que se mergea: un
> aviso de privacidad que describe mal el tratamiento no es una imprecisión de
> copy, es un defecto legal (LFPDPPP, PRD §8). La enmienda no inventa nada
> nuevo: escribe la política que el propio aviso prometía escribir, y que ya
> vive aplicada en la spec `registro-negocio` (política del PRD §6.1) y en la
> moderación del PRD §6.3.
>
> Se modifican dos requirements: el que enumera qué queda público (su prosa y
> el scenario de la foto) y el del texto literal del aviso (el párrafo de la
> sección "Qué queda público y qué no").

## MODIFIED Requirements

### Requirement: El aviso integral advierte que el WhatsApp y el teléfono quedan públicos

El aviso integral DEBE decir con claridad, en su propia sección, qué información de la ficha queda visible para cualquier persona en internet —incluidos el nombre del negocio, el WhatsApp y el teléfono fijo, con botones para escribir o marcar directo—, que la colonia se publica pero el domicilio exacto no, salvo que el propio dueño lo escriba, que los buscadores pueden indexar la ficha, y qué datos NO se publican nunca (la fecha de registro, las notas internas de la revisión y el motivo de un rechazo). Es el mismo mensaje que el aviso simplificado del formulario, aquí en su versión completa.

La enumeración DEBE cuadrar exactamente con lo que la ficha pública sirve hoy, así que incluye además: (a) que la dirección o las referencias que el dueño escriba alimentan el botón "Cómo llegar" de la ficha, que abre Google Maps con esa dirección en el teléfono de quien lo toca (`construirEnlaceComoLlegar` en `src/lib/enlaces.ts`) —el dato no se comparte con nadie desde el servidor, pero sale hacia un tercero en cuanto un vecino usa el botón, y el dueño tiene derecho a saberlo antes de escribirlo—; y (b) que la foto del negocio es pública, con la política de qué se puede retratar y qué pasa si no se cumple. Esa política ya no se puede aplazar: el formulario captura fotos desde T-008, así que el aviso DEBE decir qué se acepta (el local, los productos o el trabajo), qué no (personas que se puedan reconocer, porque este aviso cubre los datos del titular y no la imagen de terceros) y que una foto que no cumpla no se publica. DEBE decir además que la imagen se guarda comprimida y sin los metadatos que trae el archivo —la ubicación GPS de la toma, entre otros—, porque ese dato no se publica ni se conserva.

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
- Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario y el link de tu Facebook.

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
