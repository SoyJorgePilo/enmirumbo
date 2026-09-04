# Tareas: agregar-paginas-legales

Orden por dependencia. Cada tarea se puede terminar y comprobar sola. El dev trabaja en TDD: donde la tarea es un test, va primero (rojo) y la siguiente lo pone en verde.

## Contenido legal (fuente única)

- [x] 1. Crear `src/lib/legales/textos.ts` con el contenido aprobado del **aviso de privacidad** (encabezado, marca de borrador, fecha de última actualización, intro y las 10 secciones con sus párrafos y viñetas), literal como está en `specs/paginas-legales/spec.md`.
- [x] 2. Agregar en el mismo módulo el contenido aprobado de los **términos y condiciones** (encabezado, marca de borrador, fecha, intro y las 10 secciones), literal como está en la spec.
- [x] 3. Declarar en el mismo módulo `PLACEHOLDERS_LEGALES`: la lista única de datos pendientes del humano (nombre o razón social del responsable, domicilio, correo ARCO / de contacto, WhatsApp del directorio, fecha de publicación y jurisdicción), y usarla para interpolar el texto.
- [x] 4. Test del módulo: todo placeholder entre corchetes que aparezca en los textos está declarado en `PLACEHOLDERS_LEGALES` y viceversa; ningún texto trae dato de contacto, correo, teléfono o domicilio inventado.

## Página del aviso de privacidad

- [x] 5. Test de `/aviso-de-privacidad`: un solo `h1` con "Aviso de privacidad", cada sección como `h2` sin saltos de jerarquía, y la línea "Última actualización: " con su fecha.
- [x] 6. Crear `src/app/aviso-de-privacidad/page.tsx` (Server Component, dentro del layout global) que pinta el contenido del módulo con esa semántica.
- [x] 7. Test de los **seis elementos mínimos** (PRD §8), uno por scenario de la spec: responsable con domicilio y contacto, datos tratados, finalidades, medios para limitar uso o divulgación, ARCO con "en un máximo de 20 días hábiles", y procedimiento de cambios.
- [x] 8. Test de la sección "Qué queda público y qué no": WhatsApp y teléfono visibles para cualquiera, colonia sí / domicilio exacto no, indexación por buscadores, y lo que nunca se publica (fecha de registro, notas internas, motivo de rechazo).
- [x] 9. Agregar la `metadata` propia de la página (título y descripción del documento, **sin** `noindex`) y su test. (metadata implementada en la etapa A; test en `tests/legales-paginas.test.ts`, describe "indexables y con metadata propia")
- [x] 10. Agregar al final del aviso el enlace "Términos y condiciones" hacia `/terminos`, con área táctil ≥44px, y su test. (enlace implementado; test en `tests/legales-paginas.test.ts`: "cierra con el enlace Términos y condiciones hacia /terminos")

## Página de términos y condiciones

- [x] 11. Test de `/terminos`: un solo `h1` con "Términos y condiciones", secciones como `h2`, línea de última actualización y `metadata` propia sin `noindex`.
- [x] 12. Crear `src/app/terminos/page.tsx` (Server Component dentro del layout) pintando el contenido del módulo.
- [x] 13. Test del deslinde: intermediario informativo, el trato es directo entre vecino y negocio, no se responde por daños ni desacuerdos, y qué significa (y qué no) el sello "Negocio verificado".
- [x] 14. Test de las **reglas de moderación del PRD §6.3**: las cinco viñetas completas (ilegales/licencia no demostrable con sus ejemplos, ofensivo-discriminatorio-sexual, fichas de terceros sin autorización, fotos que no cumplen, datos falsos), rechazo con motivo y reenvío, borrado a los 90 días, y el derecho de retirar fichas con baja inmediata a petición del negocio.
- [x] 15. Agregar el enlace "Aviso de privacidad" hacia `/aviso-de-privacidad` en la sección de datos personales, con área táctil ≥44px, y su test. (enlace implementado; test en `tests/legales-paginas.test.ts`: "enlazan al aviso de privacidad desde la sección de datos personales")

## Borrador y placeholders

- [x] 16. Test de la marca de borrador: mientras `PLACEHOLDERS_LEGALES` no esté vacía, las dos páginas muestran arriba el literal "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance."; con la lista vacía, la marca desaparece. (implementado en `DocumentoLegalView`; tests: la regla "si y solo si quedan pendientes" en `tests/legales-paginas.test.ts` y la lista ya vacía, simulada, en `tests/legales-borrador.test.ts`)

## Footer (layout-base)

- [x] 17. Actualizar en `tests/layout.test.ts` el caso "el footer no tiene ningún enlace mientras no existan las páginas legales": ahora exige exactamente dos enlaces, con los textos "Aviso de privacidad" y "Términos y condiciones", hacia `/aviso-de-privacidad` y `/terminos`, y `problemasDeEnlaces(htmlFooter)` sigue en `[]`.
- [x] 18. Reemplazar en `src/components/footer.tsx` el comentario que reservaba el espacio de E6 por los dos enlaces, con `min-h-11` (44px) cada uno.
- [x] 19. Ajustar en `tests/layout.test.ts` el caso "señala un enlace inventado": `/aviso-de-privacidad` ya no sirve de ejemplo de ruta inexistente (ahora existe) — usar una ruta legal mal escrita, por ejemplo `/terminos-y-condiciones`, y afirmar que `rutasExistentes` contiene `/aviso-de-privacidad` y `/terminos`.

## Aviso simplificado del formulario (E1-6 / M3)

- [x] 20. Test del texto nuevo: el aviso simplificado dice que el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás quedan a la vista de cualquiera, y ya no aparece "Cuando publiquemos el aviso completo, aquí va a estar el enlace."
- [x] 21. Reescribir `TEXTO_AVISO_PRIVACIDAD` en `src/lib/registro/textos.ts` con el literal aprobado en el delta de `registro-negocio`, y agregar el literal del enlace "Lee el aviso de privacidad completo".
- [x] 22. Actualizar en `tests/registro-pagina.test.ts` el caso "el bloque de consentimiento no tiene ningún enlace mientras E6 no exista": ahora exige el enlace al aviso integral (mismo tab, sin `target`), y la página de registro ya puede contener `href`.
- [x] 23. Actualizar `src/components/registro/aviso-consentimiento.tsx`: enlace "Lee el aviso de privacidad completo" hacia `/aviso-de-privacidad` con área táctil ≥44px, y quitar el `TODO(E6)`.

## Cierre

- [x] 24. Confirmar que ningún archivo nuevo declara `"use client"` (lo vigila la suite de `layout-base`) y que las dos páginas se ven completas con el JavaScript deshabilitado. (verificado: sin la directiva en los archivos nuevos; el HTML servido por SSR trae el contenido completo, confirmado con `curl` a `/aviso-de-privacidad` y `/terminos`)
- [x] 25. Confirmar que las rutas nuevas no rompen la reserva de segmentos: `tests/directorio-consultas.test.ts` sigue en verde con las carpetas `aviso-de-privacidad` y `terminos` en `src/app` (ya están en `SEGMENTOS_RESERVADOS`). (`npm run build` genera ambas rutas sin conflicto y la suite completa —951 tests, incluida `tests/directorio-consultas.test.ts`— pasa en verde)
- [ ] 26. Revisión visual (humana, con navegador) de las dos páginas y del footer a 390 / 768 / 1280 px: sin scroll horizontal, ancho de lectura cómodo y enlaces tocables. (Queda para el humano. Lo automatizable ya está cubierto: `tests/legales-paginas.test.ts` comprueba que los enlaces entre documentos reservan 44px y que la vista no usa anchos fijos; `tests/layout.test.ts`, que los dos del footer también.)
- [x] 27. `npm run lint`, `npm run build` y `npm test` en verde.

## Iteración 2 — enmienda tras la auditoría de seguridad (etapa C)

Enmienda de spec aprobada por el orquestador; los tres bloques van marcados con "**Enmienda (auditoría de seguridad, aprobada):**" en `specs/paginas-legales/spec.md`.

- [x] 28. (ALTO-1) Acotar el plazo de 90 días del aviso a los registros **rechazados** ("Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días."), igual que `/terminos` y el PRD §6.3/§8: enmienda de la spec (requirement de los seis elementos + bloque literal), texto en `src/lib/legales/textos.ts` y tests línea por línea.
- [x] 29. (ALTO-1) Convertir la `CARACTERIZACIÓN` de `tests/legales-adversarial.test.ts` en caso de **regresión** del hallazgo corregido, sin perder ninguno de los 18 casos de la etapa C.
- [x] 30. (MEDIO-1) Quitar del aviso toda promesa de automatismo: la despublicación es "en cuanto nos llega tu mensaje" y se agrega el párrafo "Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo… en un máximo de 20 días hábiles".
- [x] 31. (MEDIO-1) Declarar `PENDIENTES_OPERATIVOS_LEGALES` junto a `PLACEHOLDERS_LEGALES` (flujo ARCO del panel → E3-6; purga de rechazados → E0-3), con su scenario nuevo y sus tests, y comprobar que **no** se publica en las páginas.
- [x] 32. (MEDIO-2) Sumar a "Qué queda público y qué no" el botón "Cómo llegar" (la dirección se abre en Google Maps en el teléfono de quien lo toca) y la foto del negocio (pública si la ficha llega a llevarla; el formulario todavía no las pide, T-008 escribirá su política), con dos scenarios nuevos y sus tests.
- [x] 33. (MEDIO-2) Mover `fotoUrl` de `CAMPOS_PUBLICOS_SIN_DECLARAR` a `CAMPO_PUBLICO_DECLARADO` en `tests/legales-adversarial.test.ts`: ya está declarada en el aviso.
- [x] 34. Gates de la iteración 2: `npm run lint`, `npm run build` y `npm test` en verde (975 tests, los 18 adversariales incluidos), y verificación del HTML servido por `next start`.
