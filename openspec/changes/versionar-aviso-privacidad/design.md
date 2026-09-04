# Diseño: versionar-aviso-privacidad

Tres decisiones que no se caen por su propio peso. El resto (dónde vive el literal, cómo se pinta la línea) sale de la spec.

## 1. Formato de la versión: entero creciente como cadena

La versión tiene que ser **estable** (una vez publicada no cambia de significado), **comparable** (para saber si la vigente es otra que la de la constancia) y **legible por un humano en el panel**. Se elige un entero creciente escrito como cadena: `"1"`, `"2"`, `"3"`.

- **Fecha (`"2026-09-04"`) descartada**: la fecha de publicación del aviso es hoy un placeholder sin completar (`[FECHA DE PUBLICACIÓN]`), así que no puede ser la identidad de nada; y dos ediciones el mismo día pedirían un sufijo, o sea un entero disfrazado.
- **Semver (`"1.2.0"`) descartado**: no hay diferencia útil entre un cambio "menor" y uno "mayor" de un aviso legal. Si el texto cambia, cambió; quién decide si el cambio es importante —y por lo tanto si se avisa por WhatsApp, como promete la sección "Cambios a este aviso"— es una persona, no un número de versión.
- Se guarda como cadena y no como entero porque es un identificador, no una cantidad: nadie va a sumarle nada, y el día que el humano quiera `"2-legal"` no hay migración de por medio.

La versión vive en `src/lib/legales/version.ts` junto a la función que arma el contenido versionado. `textos.ts` (el contenido) no la importa: es al revés, para que quede claro que el texto no sabe de versiones y la versión sí sabe del texto.

## 2. Tres columnas: la constancia es un par, y la reaceptación es otro par

El ticket anticipaba una columna. Salen tres, y esta es la razón.

`consintioAvisoEn` sin versión no prueba contra qué texto se consintió; una versión sin fecha no prueba cuándo. La constancia es el **par**: `(consintioAvisoEn, consintioAvisoVersion)`. Hasta ahí, una columna nueva.

La tercera y la cuarta salen del criterio 5 del ticket, que pide que el reenvío "actualice la versión aceptada". Hay tres formas de hacerlo y solo una no miente:

1. **Pisar la versión en el reenvío, dejando la fecha**: produce constancias falsas — "consintió el 3 de enero la versión 2", cuando la versión 2 no existía el 3 de enero. Descartada.
2. **Pisar las dos**: contradice la protección que la spec de `registro-negocio` ya sostiene (el formulario es anónimo, quien reenvía puede no ser el titular; pisar sustituye la evidencia del titular por una atribuible a un tercero). Descartada.
3. **Anotar la reaceptación aparte**, sin tocar la original: `(reconsintioAvisoEn, reconsintioAvisoVersion)`. Es la única que conserva la evidencia fuerte y además registra que, cuando el aviso cambió, alguien volvió a marcar la casilla con el texto nuevo enfrente. Elegida.

Se escribe **solo cuando la versión vigente es distinta** de la de la constancia original. Así, que esos campos tengan valor significa algo concreto y consultable; si se escribieran en cada reenvío serían ruido y el panel mostraría una línea que no dice nada nuevo.

Se descartó guardar la reaceptación en una sola columna apoyándose en `registradoEn` (que el reenvío ya reinicia) como su fecha: funciona hoy, pero ata la constancia legal a un campo cuyo propósito es el reloj de las 48 horas del panel. El día que alguien deje de reiniciarlo, la constancia miente sin que nadie se entere.

Las tres columnas son nulables y sin default. Un default (`"1"`, por ejemplo) rellenaría las fichas viejas afirmando algo que nadie puede sostener: que tuvieron enfrente el texto de hoy. Nulo significa "no consta", que es la verdad.

## 3. El desfase de versión se rechaza, no se sella en silencio

El criterio 5 dice "con el texto nuevo enfrente". El formulario se pinta en el servidor con la versión vigente, así que en condiciones normales lo que el dueño leyó y lo que el servidor sella coinciden. La excepción es la ventana entre que se abre el formulario y se manda: si en medio se despliega una versión nueva, sellar la vigente sería registrar un consentimiento contra un texto que esa persona nunca vio.

Solución: el formulario devuelve, en un campo oculto, la versión con la que se pintó. El servidor la usa **solo para comparar**. Si coincide, sigue el flujo normal; si no, no guarda nada, repinta el formulario con el aviso nuevo, desmarca la casilla y muestra el mensaje del delta.

- El campo oculto **no** es una vía de escalada: el valor que se guarda siempre es el del servidor. Lo peor que consigue un atacante mandando basura ahí es que se le pida volver a marcar la casilla.
- La frecuencia es baja: solo durante los minutos posteriores a un despliegue que estrene versión, y el aviso se estrena cuando cambia el texto legal, no en cada release.
- Sin JavaScript funciona igual: es un `input type="hidden"` renderizado en el servidor, no un comportamiento de cliente.
- Casos raros que caen en el mismo camino y está bien que caigan: página restaurada del caché del navegador (botón "atrás") y envíos automatizados que arman el POST a mano.

La alternativa —sellar la vigente y no preguntar— es más simple y probablemente indistinguible en la práctica; queda como duda 3 de la propuesta para que la decida el humano antes de aprobar.

## 4. Por qué el guardián hashea el contenido y no compara archivos

El guardián tiene que fallar cuando cambia lo que el titular lee, no cuando cambia un comentario o el orden de un `import`. Por eso la huella se calcula sobre el **contenido publicado** —las cadenas del aviso simplificado, del literal de la casilla y de todo el documento integral, en orden de lectura— y no sobre el archivo fuente. Es la misma técnica que ya usa `tests/legales-textos.test.ts` para recorrer el documento (`textosDe`), reutilizable tal cual.

La tabla `version → huella` vive en el archivo de test, no en `version.ts`. Si viviera junto al texto, corregir una coma y regenerar la huella serían el mismo gesto y el guardián no guardaría nada. Viviendo en el test, la persona tiene que ir a otro archivo, escribir una versión nueva y anclar su huella: ahí es donde se toma la decisión consciente que el ticket quiere forzar. La huella se imprime en el mensaje de fallo para que anclarla no sea un acertijo.
