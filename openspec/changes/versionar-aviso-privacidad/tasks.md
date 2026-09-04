# Tareas: versionar-aviso-privacidad

Orden por dependencia. Cada tarea se puede terminar y comprobar sola. TDD: donde la tarea es un test, va primero (rojo) y la siguiente lo pone en verde.

## Versión y guardián (fuente única)

- [ ] 1. Crear `src/lib/legales/version.ts` con el literal `VERSION_AVISO = "1"` y la función que arma el **contenido versionado** del aviso en orden de lectura: el aviso simplificado (`TEXTO_AVISO_PRIVACIDAD`), el literal de la casilla (`TEXTO_CONSENTIMIENTO`) y todo el contenido de `AVISO_PRIVACIDAD` (h1, última actualización, introducción, secciones con párrafos y viñetas, enlace de cierre), sin incluir la propia versión.
- [ ] 2. Test del módulo: la versión es una cadena no vacía y el contenido versionado incluye las tres piezas (una frase de cada una) y **no** incluye texto de los términos ni el literal de la versión.
- [ ] 3. Test guardián `tests/aviso-version.test.ts`: calcula la huella del contenido versionado y la compara con la anclada en la tabla `version → huella` del propio test; falla con un mensaje que dice qué hacer (subir la versión y anclar la huella que imprime) y comprueba que la versión vigente es la última de la tabla y tiene huella.
- [ ] 4. Anclar la huella de la versión `1` con el texto de hoy y dejar el test en verde.
- [ ] 5. Test de regresión del guardián: alterando el contenido versionado (con un doble del módulo de textos) sin tocar la versión, la comprobación falla; subiendo versión y huella, pasa.

## La versión a la vista

- [ ] 6. Test de `/aviso-de-privacidad`: la línea de arriba es "Versión 1 · Última actualización: " con su fecha, la versión sale del literal del módulo (no está escrita a mano en la página) y el resto de la jerarquía de encabezados no cambia.
- [ ] 7. Pintar la versión en `src/components/legales/documento-legal.tsx`, solo para el aviso: `/terminos` conserva su línea "Última actualización: " tal cual.
- [ ] 8. Test del bloque de consentimiento del registro: antes de la casilla aparece "Estás aceptando la versión 1 del aviso de privacidad.", con la misma versión que muestra la página del aviso.
- [ ] 9. Agregar ese literal en `src/lib/registro/textos.ts` (armado con `VERSION_AVISO`) y pintarlo en `src/components/registro/aviso-consentimiento.tsx`, sin volverlo un campo ni agregar JavaScript de cliente.

## Modelo y migración

- [ ] 10. Agregar a `prisma/schema.prisma` las tres columnas nulables sin default: `consintioAvisoVersion` (String?), `reconsintioAvisoEn` (DateTime?) y `reconsintioAvisoVersion` (String?), documentadas con su significado.
- [ ] 11. Generar la migración y comprobar que se aplica sobre una base con negocios en revisión, publicados y rechazados sin perder datos: las filas existentes quedan con las tres columnas nulas (test en la suite del modelo, junto a los casos de `modelo-rechazo.test.ts`).
- [ ] 12. Test del modelo: se puede persistir y recuperar la constancia con versión y la reaceptación con su fecha y su versión; una ficha sin reaceptación las tiene nulas.

## El alta sella la versión

- [ ] 13. Test de la acción de registro: un alta válida queda con `consintioAvisoVersion` igual a la versión vigente, con sus dos campos de reaceptación nulos, y la versión no se puede fijar desde el envío (aunque venga en el POST, se guarda la del servidor).
- [ ] 14. Escribir la versión en el alta de `src/lib/registro/procesar.ts`, junto a `consintioAvisoEn` (mismo bloque, para que no se puedan separar).

## Nadie consiente lo que no vio

- [ ] 15. Test: un envío cuya versión declarada no es la vigente (otra, inventada o ausente) no crea ni modifica nada y responde con "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla." asociado a la casilla, conservando lo capturado.
- [ ] 16. Agregar el campo oculto con la versión pintada en el bloque de consentimiento y el mensaje nuevo en `MENSAJES_ERROR_REGISTRO`.
- [ ] 17. Implementar la comparación en `src/lib/registro/validacion.ts` (antes de tocar la base) y comprobar que el error se pinta junto a la casilla, con la casilla desmarcada y el aviso nuevo a la vista.
- [ ] 18. Test adversarial (`tests/registro-adversarial.test.ts`): mandar una versión vieja, una versión con caracteres raros o repetida no consigue guardar una constancia con esa versión ni saltarse la casilla.

## El reenvío tras rechazo

- [ ] 19. Test en `tests/registro-reenvio.test.ts`: reenvío con la **misma** versión vigente → la constancia original (fecha y versión) no cambia y los campos de reaceptación siguen nulos.
- [ ] 20. Test: reenvío con una versión **distinta** → la constancia original queda intacta y la reaceptación queda con la fecha del reenvío y la versión vigente; un segundo reenvío con otra versión sobrescribe la reaceptación, no la constancia.
- [ ] 21. Test: reenvío de una ficha **sin versión registrada** (anterior al versionado) → la constancia sigue sin versión y se anota la reaceptación.
- [ ] 22. Implementar la regla en el bloque de reenvío (4b) de `src/lib/registro/procesar.ts`, dentro del mismo `updateMany` condicionado al estado `rechazado` que ya existe.

## Panel

- [ ] 23. Test del detalle (`tests/admin-paginas.test.ts`): la constancia se muestra como "fecha (versión N)"; sin versión muestra "versión no registrada"; con reaceptación aparece la línea "Aceptó una versión más nueva del aviso" y sin ella no aparece.
- [ ] 24. Sumar los tres campos a la proyección de `src/lib/admin/consultas.ts` y pintarlos en `src/components/admin/detalle-registro.tsx`.

## Datos de demostración y fugas

- [ ] 25. Poblar la versión vigente en los negocios de `prisma/seed-demo.ts` y dejar uno con reaceptación, para que el panel tenga ese caso; test en `tests/seed-demo.test.ts`.
- [ ] 26. Test adversarial: la proyección pública de `src/lib/directorio.ts` no devuelve ninguno de los tres campos nuevos (sumarlos a la lista de campos internos que vigilan `tests/legales-adversarial.test.ts` y `tests/directorio-adversarial.test.ts`) y no aparecen en el log del servidor.

## Cierre

- [ ] 27. Confirmar que ningún archivo nuevo declara `"use client"` y que el registro sigue funcionando con el JavaScript deshabilitado (el campo oculto viaja en el HTML).
- [ ] 28. `npm run lint`, `npm run build` y `npm test` en verde, con la migración aplicada y el seed de demostración corrido.
