# Etapa C (seguridad y tests adversariales) — versionar-aviso-privacidad

**Worktree:** `.claude/worktrees/wt-t012` · rama `feature/versionar-aviso-privacidad`
**Gates al cierre (iteración 2):** `npm test` ✅ **62 archivos / 1655 tests** · `npm run lint` ✅ (0 problemas) · `npm run build` ✅ (salida 0)
**Git:** no toqué git. Solo escribí tests (`tests/aviso-version-seguridad-adversarial.test.ts`) y este reporte.
**Etapa A saltada:** verificado y correcto. La superficie visual nueva son tres líneas de texto y un `<input type="hidden">` dentro de componentes que ya existían; no hay pantalla, estado ni interacción nueva. No es un hallazgo.

## VEREDICTO: PASA al validador

| Severidad | Iteración 1 | Tras la iteración 2 |
|---|---|---|
| Crítico | 0 | **0** |
| Alto | 0 | **0** |
| Medio | 4 | **0** (los 4 corregidos y re-verificados) |
| Bajo | 4 | **3 abiertos** (2 corregidos, 2 aceptados con justificación, 1 nuevo) |

Nada bloqueante. Los tres bajos abiertos son deuda con nombre, no defectos de esta entrega.

---

## 1. Re-verificación de la iteración 2 (lo primero, porque es lo que se pidió)

Verifiqué las cuatro correcciones **contra el código real**, no contra el reporte del dev, y las sometí a **prueba por mutación**: revertí cada corrección en `src/lib/legales/version.ts` y comprobé que la suite se pone en rojo. Los archivos quedaron restaurados byte a byte (comprobado por comparación de contenido).

### MEDIO-1 — CORREGIDO ✅

`PiezasDelAviso` gana `marcaBorrador`, y `PIEZAS_VIGENTES_DEL_AVISO` la deriva de `HAY_PLACEHOLDERS_PENDIENTES` (`src/lib/legales/version.ts:97-102`), no de un literal: el interruptor real es el que entra en la huella. `contenidoVersionadoDelAviso` la inserta entre el `h1` y la línea de última actualización (`version.ts:126-129`), que es donde `DocumentoLegalView` la pinta.

**Mutación (`marcaBorrador: null` fijo):** el guardián del dev cae con 2 casos en rojo —"incluye la marca de borrador… en su lugar de lectura" y **"el texto publicado hoy coincide con la huella de la versión vigente"**— y mi caso de regresión también. Es decir: vaciar `PLACEHOLDERS_LEGALES` para retirar la advertencia de borrador ya no pasa desapercibido; obliga a estrenar versión. El escenario de explotación que reporté queda cerrado.

### MEDIO-2 — CORREGIDO ✅

`tests/aviso-version.test.ts:111-147`: el patrón se deriva de `VERSION_AVISO` con escape de metacaracteres, y el recorrido incluye `prisma/` (saltando `generated` y `migrations`). Es exactamente lo que hacía falta, y además cubre el caso `"2-legal"` que el escape contempla. Mi escaneo dinámico queda de segundo par de ojos.

### MEDIO-3 — CORREGIDO ✅

`versionAvisoEsPosterior` (`version.ts:44-70`) compara por orden numérico; `enteroDeVersion` usa `/^\d+$/`, que en JS es ASCII estricto y —a diferencia de otros lenguajes— no acepta `"1\n"`, así que no hay laterales por salto de línea. El reenvío la usa en `procesar.ts:359-363`.

**Rollback comprobado end-to-end:** constancia `"2"`, vigente `"1"`, reenvío → la ficha vuelve a la cola y **no se escribe reaceptación**. Antes se escribía una de una versión más vieja rotulada como "más nueva".

### MEDIO-4 — CORREGIDO ✅ (lo ataqué por todos los caminos que se me ocurrieron)

Sobre una ficha `rechazado` **sin versión** (que hoy son todas las que existirían en producción), intenté fabricar la reaceptación por:

1. **Reenvío normal, válido y con casilla marcada** → no se anota nada; la constancia sigue nula.
2. **Mass assignment** de `reconsintioAvisoEn`, `reconsintioAvisoVersion` y `consintioAvisoVersion` en el POST —este último para volver la constancia "comparable" y desbloquear la escritura— → los tres se ignoran; `datos` se construye campo por campo (`validacion.ts:302-319`) y las columnas se escriben después.
3. **Insistencia** (dos reenvíos seguidos) → el segundo es duplicado, no escribe.
4. **Constancias no ordenables** sembradas a mano: `""`, `" 1"`, `"-1"`, `"1.0"`, `"v1"`, `"٠"` (dígito árabe-índigo), `"0e0"` → ninguna estrena reaceptación.
5. **Contraprueba** con constancia `"0"` (anterior de verdad) → la reaceptación **sí** se anota, así que los casos de arriba no pasan por estar la función rota.

**Mutación (volver a `vigente !== anterior`):** **10 casos míos en rojo**, incluidos los cinco caminos de arriba. La corrección está bien sujeta.

La segunda mitad de MEDIO-4 —la sobre-atribución— también está: la etiqueta pasó a `El reenvío aceptó la versión N del aviso` (`detalle-registro.tsx:24-37`), con la fecha como valor, y hay un fallback `El reenvío volvió a aceptar el aviso` para el caso defensivo de versión nula. La línea describe el hecho comprobable y ya no se lo atribuye al titular, que era el punto.

### Enmiendas de spec

Las tres tocan literal aprobado y las tres llevan su bloque `> **Enmienda aprobada durante la implementación de T-012**` con el texto anterior y el motivo (`registro-negocio:86-89`, `revision-admin:11`, `modelo-datos:13` y `:40`). El scenario "reenvío de una ficha anterior al versionado" cambió de resultado y está reescrito, y hay scenario nuevo para el rollback. La spec y el código dicen lo mismo. Que la enmienda sea legítima es punto de control del validador; desde seguridad, la dirección del cambio es la correcta y no relaja ninguna garantía.

### Bajos de la iteración 1

- **BAJO-1 — CORREGIDO ✅.** `LIMITES_LONGITUD.avisoVersion = 20`, aplicado en `leerEnvioRegistro` (`validacion.ts:145-152`) **después** del `trim`. Verifiqué que truncar no abre una puerta: `"1"+"x"*40`, `"1"+NUL*40`, `"1;"+"9"*40` y `"1\t"+"1"*40` se truncan a algo que sigue sin ser `"1"`, y ninguno guarda nada. No hay un segundo `trim` posterior que pudiera limpiar el resto tras el corte (`recortar()` solo toca `campos`), así que tampoco por ahí.
- **BAJO-4 — CORREGIDO ✅.** Salto de línea final restaurado.
- **BAJO-2 — ACEPTADO, y su razonamiento me convence.** Verifiqué la política que alega: la migración `20260905090000_renombra_foto_url_a_foto_clave` documenta por escrito que evita la redefinición de tabla que Prisma genera para SQLite porque perdería los `CHECK` de `estado` y `origen` de la migración inicial (`20260903204928_inicial/migration.sql:40-41`), y la del texto normalizado hizo lo mismo. Un `CHECK` de par nulo/no nulo exige justo esa reconstrucción de `Negocio`, con sus 4 índices únicos, 2 claves foráneas y la relación m-n de giros, para blindar un invariante que hoy sostiene el único camino de escritura. Reconstruir la tabla principal es más riesgo que defensa: **acepto la deuda** en los términos en que la dejó escrita.
  *Sugerencia sin severidad, más barata que el `CHECK`:* que las dos columnas de la reaceptación se produzcan en un solo lugar (un `columnasDeReaceptacion(ahora, version)` en `version.ts`), de modo que un tercer escritor futuro —el flujo ARCO de E3-6, por ejemplo— no pueda tomar una sin la otra. Hoy el par se arma en dos sitios distintos (`procesar.ts` y `seed-demo.ts`) y nada más que la disciplina los mantiene juntos.
- **BAJO-3 — SIN CAMBIO, justificado.** Que el seed de demostración reescriba la constancia de sus 12 fichas ficticias es deliberado y está acotado por `prisma/guardas-entorno.ts` (bloquea producción y bases no locales) y por el prefijo `771999xxxx`. De acuerdo.

---

## 2. Hallazgo nuevo de la iteración 2

### BAJO-5 · La reaceptación depende de que la versión vigente sea ordenable, y nada lo vigila

**Dónde:** `src/lib/legales/version.ts:36-70` (`enteroDeVersion` / `versionAvisoEsPosterior`).

La corrección de MEDIO-3/MEDIO-4 introduce una dependencia nueva: `versionAvisoEsPosterior` devuelve `false` para **cualquier** cadena no entera, incluida la del primer argumento. `design.md §1` deja abierta la puerta a un `"2-legal"` ("el día que el humano quiera `"2-legal"` no hay migración de por medio") y el propio guardián de fuente única escapa metacaracteres por si eso pasa. Si algún día `VERSION_AVISO` deja de ser un entero desnudo, **ninguna reaceptación volverá a anotarse jamás**, en silencio y con la suite en verde: el fallo no se manifiesta como error sino como una columna que deja de llenarse.

No es explotable por un tercero; es un modo de fallo silencioso de la evidencia, que es el bien que este change protege. Mitigación: una línea.

**Test añadido (cierra el hueco desde ya):** "la versión vigente tiene que ser ordenable, o la reaceptación se apaga en silencio" — falla en cuanto `VERSION_AVISO` no sea comparable, con el motivo escrito encima.

---

## 3. Decisión que el dev dejó a validación: el título y la descripción, fuera de la huella

**Estoy de acuerdo con dejarlos fuera, y recomiendo confirmarlo.** Tres razones:

1. **La huella prueba contra qué texto se consintió.** Nadie consiente un `<title>`: la `DESCRIPCION_AVISO_PRIVACIDAD` ni siquiera se pinta en la página, aparece en el resultado del buscador. No es el documento, es cómo se anuncia el documento.
2. **El falso positivo es el enemigo del guardián.** Meterlos obligaría a estrenar versión del aviso legal —con su constancia, su tabla de huellas y su decisión humana— por retocar una descripción de SEO. Un guardián que salta por motivos que no importan enseña a la gente a "arreglar la huella" sin leer, que es exactamente el gesto distraído que `design.md §4` quiere impedir.
3. **La frontera queda declarada.** El requirement de `paginas-legales` enumera qué entra; que la marca de borrador haya entrado y la metadata no, con el criterio "lo que el titular lee al consentir", es una línea defendible y escrita.

**Salvedad, sin severidad:** la descripción **parafrasea** el aviso ("qué datos pide… cómo ejercer tus derechos ARCO"). Si algún día prometiera algo que el cuerpo del aviso no dice, nada lo detectaría. Eso no es un problema de versionado sino de coherencia, y el repo ya tiene el molde para resolverlo: `tests/legales-adversarial.test.ts` › "lo que el aviso promete vs. lo que la ficha publica". Un caso análogo que compare metadata contra el cuerpo sería el lugar correcto, en su propio ticket.

**Observación relacionada (informativa):** la huella se calcula sobre el **modelo de contenido**, no sobre el HTML servido. Un cambio en `DocumentoLegalView` que dejara de pintar una pieza no movería la huella. Hoy lo cubren otras suites (`legales-paginas` compara el bloque literal completo contra la spec y `legales-adversarial` vigila la marca de borrador), así que no lo cuento como hallazgo; conviene tenerlo presente el día que alguien toque ese componente.

---

## 4. Lo que quedó limpio en la auditoría (ambas iteraciones)

- **Inmutabilidad de la constancia.** Ningún camino —alta, reenvío, panel, mass assignment del POST, campo repetido, campo como archivo— escribe `consintioAvisoEn`/`consintioAvisoVersion` con un valor del cliente. `datos` se construye campo por campo, así que el spread no cuela claves; el par se escribe después, en un bloque literal (`procesar.ts:430-434`). La reaceptación va dentro del `updateMany` condicionado a `estado = 'rechazado'` (`procesar.ts:365-383`): si el admin resolvió la ficha en medio, no se afecta ninguna fila ni se escribe evidencia.
- **El campo oculto solo compara.** Se lee, se recorta, se compara y se descarta. No llega a la base, no vuelve al formulario, no entra al log —comprobado con espía sobre `console.warn`, `error` y `log`.
- **Fugas.** Las tres columnas no aparecen en la proyección pública (`src/lib/directorio.ts`, lista explícita), ni en HTML de ficha/listado, ni en URLs, ni en logs. Único consumidor: el panel, detrás de sesión.
- **Inyección y XSS.** Todo por Prisma; ningún SQL crudo con entrada de usuario; ningún `dangerouslySetInnerHTML`. La versión —que ahora se interpola también en la **etiqueta** del panel— sale escapada: comprobado con `1"><img src=x onerror=alert(1)>` y `</dd><script>alert(2)</script>` guardados en la base.
- **Migración sobre base con datos.** Tres `ADD COLUMN` nulables, sin `DEFAULT`, sin `NOT NULL`, sin `UPDATE` de relleno. Fichas viejas intactas y sin versión inventada.
- **Secretos y datos personales.** Ninguna variable de entorno nueva (`.env.example` sin cambios). Todo dato de prueba ficticio: `771999xxxx`, `7710008xxx`, `7710009xxx`, IPs RFC 5737, nombres inventados.
- **Abuso.** El desfase se resuelve antes de tocar la base y antes de gastar cupo de IP; el honeypot y el límite por IP cubren el reenvío igual que el alta (comprobado que un reenvío atrapado por la trampa no deja ni rastro de reaceptación). No aparece superficie nueva sin protección.

---

## 5. Scenarios sin test

**Ninguno automatizable sin cobertura**, también tras la iteración 2. Recorrí los scenarios de los cuatro deltas —incluidos los reescritos y el nuevo de rollback— contra el mapa del dev y contra el código de los tests. Los dos matices que había en la iteración 1 quedaron cerrados: el de la fuente única (MEDIO-2) y el de la marca de borrador (MEDIO-1). Sigue en pie, como deuda aceptada, que "la versión no viaja sola" se comprueba sobre las filas presentes y no como invariante del esquema (BAJO-2).

Verifiqué además que el dev **no debilitó** ningún test de la etapa C: mis dos CARACTERIZACIONES quedaron volteadas a REGRESIÓN con la historia escrita encima y aserciones **más** fuertes (la de MEDIO-1 ahora comprueba que quitar la marca cambia la huella), y los tres casos que tocaban la etiqueta del panel se actualizaron al literal nuevo conservando lo que comprobaban.

---

## 6. Tests adversariales (archivo propio, 39 casos en verde)

`tests/aviso-version-seguridad-adversarial.test.ts` — 27 casos en la iteración 1, **39 tras la iteración 2**.

| Bloque | Qué ataca |
|---|---|
| El campo oculto como entrada hostil | Versiones que solo se *parecen* a la vigente (ancho completo `１`, ancho cero, `¹`, byte nulo, salto de línea, `%31`, `0x1`, JSON, `[object Object]`); espacios raros que el recorte sí quita; campo como **archivo multipart**; campo **repetido**; **1 MB** sin amplificación en respuesta ni en log; el mensaje de desfase sin filtrar internals conservando lo capturado; y **la cota nueva de 20 sin puerta trasera** (4 payloads que empiezan por la versión vigente). |
| La constancia no se fabrica ni se pisa | Mass assignment completo de las cuatro columnas de evidencia + ciclo de vida; **transiciones ilegales** (`publicado` y `en_revision`); reaceptación **sin casilla** (5 valores falsos de checkbox); **campo trampa** (éxito fingido, cero escrituras); **rollback** (REGRESIÓN de MEDIO-3); **ficha sin versión** por reenvío, por mass assignment y por insistencia (MEDIO-4); **7 constancias no ordenables**; y la **contraprueba** con constancia `"0"`. |
| El guardián de la huella | Ninguna pieza contiene el separador `\u0000`; **mover una frase de una pieza a otra** cambia la huella; escaneo de fuente única **derivado de `VERSION_AVISO`** y extendido a `prisma/`; **la marca de borrador dentro de la huella** (REGRESIÓN de MEDIO-1, con la comprobación de que quitarla cambia la huella); **la versión vigente tiene que ser ordenable** (BAJO-5); y la migración sin `UPDATE`/`DEFAULT`/`NOT NULL`. |
| El panel pinta sin ejecutar | Versión y reaceptación hostiles guardadas en la base salen escapadas —ahora también desde la **etiqueta**, que interpola la versión—; sin reaceptación no se pinta la línea. |

**Pruebas por mutación de mi propia suite** (para no dejar tests decorativos), las tres con el archivo restaurado después:

| Mutación en `src/` | Resultado |
|---|---|
| `validacion.ts`: comparar con `.normalize("NFKC")` (iteración 1) | 2 casos en rojo (ancho completo y exponente) |
| `version.ts`: volver a `vigente !== anterior` | **10 casos en rojo** (rollback, ficha sin versión por tres caminos, 7 constancias no ordenables) |
| `version.ts`: `marcaBorrador: null` fijo | 1 caso mío + **2 del guardián del dev**, incluido "el texto publicado hoy coincide con la huella" |

Todo dato de prueba es ficticio: WhatsApp de la serie reservada `7710009xxx`, IP `203.0.113.44` (TEST-NET-3, RFC 5737), nombres inventados.

---

## 7. Para el validador

- **Pasa.** 0 críticos, 0 altos, 0 medios. Quedan tres bajos abiertos, ninguno bloqueante: **BAJO-2** (`CHECK` del par, deuda aceptada con razonamiento verificado), **BAJO-3** (el seed reescribe la constancia de sus fichas ficticias, deliberado y acotado) y **BAJO-5** (la versión vigente tiene que seguir siendo ordenable, ya con test de guardia).
- **Confirmar o revertir:** la decisión de dejar título y descripción de metadata fuera de la huella. Mi recomendación es **confirmarla**, por lo escrito en §3, con la salvedad de que la coherencia entre la descripción y el cuerpo del aviso merece su propio caso en `legales-adversarial`, en otro ticket.
- Las dos REGRESIONES (MEDIO-1 y MEDIO-3) y la de MEDIO-4 están marcadas en el archivo con el hallazgo que las originó: si alguna se pone en rojo en el futuro, el motivo está escrito al lado.
- La huella de la versión `1` se re-ancló **dos veces** dentro del change (la enmienda de la foto y ahora la marca de borrador). Es legítimo por la excepción que el propio guardián documenta —la `1` no ampara ninguna constancia hasta el merge—, pero conviene que sea la última: después de `main`, cambiar el texto es estrenar versión.
- Sigue en pie la deuda anunciada por el dev: el conflicto de fusión con el PR exprés sobre `src/lib/legales/textos.ts` pondrá el guardián en rojo, y quien lo resuelva tiene que decidir versión.
