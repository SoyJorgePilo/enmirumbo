# Tareas: versionar-aviso-privacidad

Orden por dependencia. Cada tarea se puede terminar y comprobar sola. TDD: donde la tarea es un test, va primero (rojo) y la siguiente lo pone en verde.

## Versión y guardián (fuente única)

- [x] 1. Crear `src/lib/legales/version.ts` con el literal `VERSION_AVISO = "1"` y la función que arma el **contenido versionado** del aviso en orden de lectura: el aviso simplificado (`TEXTO_AVISO_PRIVACIDAD`), el literal de la casilla (`TEXTO_CONSENTIMIENTO`) y todo el contenido de `AVISO_PRIVACIDAD` (h1, última actualización, introducción, secciones con párrafos y viñetas, enlace de cierre), sin incluir la propia versión.
- [x] 2. Test del módulo: la versión es una cadena no vacía y el contenido versionado incluye las tres piezas (una frase de cada una) y **no** incluye texto de los términos ni el literal de la versión.
- [x] 3. Test guardián `tests/aviso-version.test.ts`: calcula la huella del contenido versionado y la compara con la anclada en la tabla `version → huella` del propio test; falla con un mensaje que dice qué hacer (subir la versión y anclar la huella que imprime) y comprueba que la versión vigente es la última de la tabla y tiene huella.
- [x] 4. Anclar la huella de la versión `1` con el texto de hoy y dejar el test en verde.
- [x] 5. Test de regresión del guardián: alterando el contenido versionado (con un doble del módulo de textos) sin tocar la versión, la comprobación falla; subiendo versión y huella, pasa.

## La versión a la vista

- [x] 6. Test de `/aviso-de-privacidad`: la línea de arriba es "Versión 1 · Última actualización: " con su fecha, la versión sale del literal del módulo (no está escrita a mano en la página) y el resto de la jerarquía de encabezados no cambia.
- [x] 7. Pintar la versión en `src/components/legales/documento-legal.tsx`, solo para el aviso: `/terminos` conserva su línea "Última actualización: " tal cual.
- [x] 8. Test del bloque de consentimiento del registro: antes de la casilla aparece "Estás aceptando la versión 1 del aviso de privacidad.", con la misma versión que muestra la página del aviso.
- [x] 9. Agregar ese literal en `src/lib/registro/textos.ts` (armado con `VERSION_AVISO`) y pintarlo en `src/components/registro/aviso-consentimiento.tsx`, sin volverlo un campo ni agregar JavaScript de cliente.

## Modelo y migración

- [x] 10. Agregar a `prisma/schema.prisma` las tres columnas nulables sin default: `consintioAvisoVersion` (String?), `reconsintioAvisoEn` (DateTime?) y `reconsintioAvisoVersion` (String?), documentadas con su significado.
- [x] 11. Generar la migración y comprobar que se aplica sobre una base con negocios en revisión, publicados y rechazados sin perder datos: las filas existentes quedan con las tres columnas nulas (test en la suite del modelo, junto a los casos de `modelo-rechazo.test.ts`).
- [x] 12. Test del modelo: se puede persistir y recuperar la constancia con versión y la reaceptación con su fecha y su versión; una ficha sin reaceptación las tiene nulas.

## El alta sella la versión

- [x] 13. Test de la acción de registro: un alta válida queda con `consintioAvisoVersion` igual a la versión vigente, con sus dos campos de reaceptación nulos, y la versión no se puede fijar desde el envío (aunque venga en el POST, se guarda la del servidor).
- [x] 14. Escribir la versión en el alta de `src/lib/registro/procesar.ts`, junto a `consintioAvisoEn` (mismo bloque, para que no se puedan separar).

## Nadie consiente lo que no vio

- [x] 15. Test: un envío cuya versión declarada no es la vigente (otra, inventada o ausente) no crea ni modifica nada y responde con "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." asociado a la casilla, conservando lo capturado.
- [x] 16. Agregar el campo oculto con la versión pintada en el bloque de consentimiento y el mensaje nuevo en `MENSAJES_ERROR_REGISTRO`.
- [x] 17. Implementar la comparación en `src/lib/registro/validacion.ts` (antes de tocar la base) y comprobar que el error se pinta junto a la casilla, con la casilla desmarcada y el aviso nuevo a la vista.
- [x] 18. Test adversarial (`tests/registro-adversarial.test.ts`): mandar una versión vieja, una versión con caracteres raros o repetida no consigue guardar una constancia con esa versión ni saltarse la casilla.

## El reenvío tras rechazo

- [x] 19. Test en `tests/registro-reenvio.test.ts`: reenvío con la **misma** versión vigente → la constancia original (fecha y versión) no cambia y los campos de reaceptación siguen nulos.
- [x] 20. Test: reenvío con una versión **distinta** → la constancia original queda intacta y la reaceptación queda con la fecha del reenvío y la versión vigente; un segundo reenvío con otra versión sobrescribe la reaceptación, no la constancia.
- [x] 21. Test: reenvío de una ficha **sin versión registrada** (anterior al versionado) → la constancia sigue sin versión y se anota la reaceptación.
- [x] 22. Implementar la regla en el bloque de reenvío (4b) de `src/lib/registro/procesar.ts`, dentro del mismo `updateMany` condicionado al estado `rechazado` que ya existe.

## Panel

- [x] 23. Test del detalle (`tests/admin-paginas.test.ts`): la constancia se muestra como "fecha (versión N)"; sin versión muestra "versión no registrada"; con reaceptación aparece la línea "Aceptó una versión más nueva del aviso" y sin ella no aparece.
      **Nota de implementación:** la fecha se pinta con el `FORMATO_FECHA` que ya usan las demás fechas internas del panel ("03 sept 2026, 09:00"), no con la escritura larga del ejemplo de la spec ("3 de septiembre de 2026"). La spec fija la forma —fecha + "(versión N)"— y el ejemplo ilustra la fecha; usar el formato del panel mantiene la coherencia de la pantalla y conserva la hora, que en una constancia LFPDPPP es parte de la evidencia.
- [x] 24. Sumar los tres campos a la proyección de `src/lib/admin/consultas.ts` y pintarlos en `src/components/admin/detalle-registro.tsx`.

## Datos de demostración y fugas

- [x] 25. Poblar la versión vigente en los negocios de `prisma/seed-demo.ts` y dejar uno con reaceptación, para que el panel tenga ese caso; test en `tests/seed-demo.test.ts`.
      **Corrección de la tarea:** "todos con la versión vigente **y** uno con reaceptación" no se puede cumplir a la vez sin sembrar un dato falso: la reaceptación solo se escribe cuando la versión aceptada es DISTINTA de la de la constancia, y hoy la única versión publicada es la `1`. Un negocio con `consintioAvisoVersion = "1"` y `reconsintioAvisoVersion = "1"` haría que el panel mostrara "Aceptó una versión más nueva del aviso" mintiendo. Se siembra entonces: 11 negocios con la versión vigente y uno (la barbería `en_revision`) como ficha **anterior al versionado** —constancia sin versión— con su reaceptación. Ese caso es el que la propia spec de `registro-negocio` contempla ("o cuando la constancia original no tiene versión"), y de paso le da al panel los dos casos que tiene que saber pintar: "versión no registrada" y la línea de reaceptación.
- [x] 26. Test adversarial: la proyección pública de `src/lib/directorio.ts` no devuelve ninguno de los tres campos nuevos (sumarlos a la lista de campos internos que vigilan `tests/legales-adversarial.test.ts` y `tests/directorio-adversarial.test.ts`) y no aparecen en el log del servidor.

## Cierre

- [x] 27. Confirmar que ningún archivo nuevo declara `"use client"` y que el registro sigue funcionando con el JavaScript deshabilitado (el campo oculto viaja en el HTML).
- [x] 28. `npm run lint`, `npm run build` y `npm test` en verde, con la migración aplicada y el seed de demostración corrido.

## Encargo adicional (aprobado por el orquestador durante la implementación)

- [x] 29. La sección "Qué datos recogemos" del aviso no nombraba la foto del negocio, que el formulario captura desde T-008, y el elemento (2) de la LFPDPPP exige enumerar los datos tratados. La viñeta de opcionales ahora la incluye ("…, el link de tu Facebook y, si la subes, una foto de tu negocio."). La enmienda queda declarada en el delta de `paginas-legales` de este change, con el requirement completo.
- [x] 30. Ese cambio de texto fue el primer caso de uso real del guardián: dejó la suite en rojo con el mensaje de qué hacer. **Decisión:** se volvió a anclar la huella de la versión `1` en lugar de estrenar la `2`, porque la `1` la estrena este mismo change y todavía no ampara ninguna constancia guardada (la columna no existe en ninguna base desplegada). La regla —y su única excepción, válida solo antes del merge— queda escrita en `tests/aviso-version.test.ts`.

## Iteración 2 — correcciones de la etapa C (`reports/c-seguridad.md`)

- [x] 31. **MEDIO-1** · La marca de borrador es contenido publicado dentro del documento legal: entra en `contenidoVersionadoDelAviso`, en su lugar de lectura (entre el `h1` y la línea de actualización). Quitarla o reescribirla ahora deja el guardián en rojo (dos casos nuevos en la prueba por mutación). Huella de la versión `1` vuelta a anclar.
- [x] 32. **MEDIO-2** · El guardián de fuente única deriva el patrón de `VERSION_AVISO` (nada anclado a mano, con escape por si algún día la versión no es un entero desnudo) y recorre también `prisma/`.
- [x] 33. **MEDIO-3** · La reaceptación se decide con "la vigente es POSTERIOR a la de la constancia" (`versionAvisoEsPosterior`, comparación numérica), no con `!==`: tras un despliegue revertido ya no se anota como "más nueva" una versión más vieja. Test del caso rollback en `registro-reenvio` y en la suite adversarial.
- [x] 34. **MEDIO-4** · "Sin versión" se trata como **no comparable**: una ficha anterior al versionado no genera reaceptación en su primer reenvío (el formulario es anónimo; nadie estrena evidencia de consentimiento sobre la ficha de otro) y el panel sigue mostrando "versión no registrada". Y la etiqueta del panel describe el hecho sin sobre-atribuirlo: "El reenvío aceptó la versión N del aviso". Enmiendas marcadas en los deltas de `registro-negocio`, `revision-admin` y `modelo-datos`.
- [x] 35. **BAJO-1** · `avisoVersion` entra en `LIMITES_LONGITUD` (20) y se recorta al leer, como cualquier otro campo.
- [x] 36. **BAJO-4** · Salto de línea final en `tests/registro-adversarial.test.ts`.
- [x] 37. **BAJO-2** (evaluado, **documentado y no implementado**) · Un `CHECK` de par nulo/no nulo sobre `Negocio` no es una sentencia simple en SQLite: obliga a reconstruir la tabla (crear, copiar, borrar, renombrar) y este repo tiene la política contraria por escrito — la migración `20260905090000_renombra_foto_url_a_foto_clave` evita a propósito la redefinición que Prisma genera, porque perdería los `CHECK` de `estado` y `origen` escritos a mano en la inicial. Reconstruir la tabla principal (4 índices únicos, 2 claves foráneas y la relación m-n de giros) para blindar un invariante que hoy sostiene el único camino de escritura —las dos columnas se escriben en el mismo objeto literal— es más riesgo que defensa. Queda como deuda anotada en el reporte.
- [x] 38. **BAJO-3** (sin cambio, ya documentado) · Que el seed de demostración reescriba la constancia de sus 12 fichas ficticias es deliberado (§4.9) y `prisma/guardas-entorno.ts` impide correrlo fuera de una base local.
- [x] 39. Las dos CARACTERIZACIONES de la etapa C volteadas a REGRESIÓN en su archivo (MEDIO-1 y MEDIO-3), más un caso nuevo de MEDIO-4. Suite adversarial: 28 casos en verde.
- [x] 40. Gates completos otra vez: `npm run lint`, `npm run build` y `npm test` (62 archivos / 1644 tests) en verde, con la base recreada, el seed corrido y el panel comprobado a mano en el puerto 3600.
