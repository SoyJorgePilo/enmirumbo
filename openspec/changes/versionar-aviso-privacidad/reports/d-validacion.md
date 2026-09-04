# Etapa D (validación) — versionar-aviso-privacidad

**Worktree:** `.claude/worktrees/wt-t012` · rama `feature/versionar-aviso-privacidad` · puerto 3600
**Ticket:** `docs/tickets/T-012-version-del-aviso.md`
**Base real del change:** `8149403` (merge del PR #11). El `main` local estaba desactualizado; el diff se validó contra la base verdadera, no contra ese ref.

## VEREDICTO: APRUEBA

0 críticos, 0 altos, 0 medios. Dos correcciones de integración aplicadas por mí al fusionar `main` (§6) y una observación informativa (§5). Los 4 deltas están implementados, el alcance está limpio y los tres gates quedaron en verde **después** de la fusión, no antes.

---

## 1. Spec: los 4 deltas, requirement por requirement

No confié en el mapa del dev: recorrí los scenarios contra el diff y contra el código.

| Delta | Requirements | Verificado |
|---|---|---|
| `paginas-legales` | Versión estable en un solo lugar · Guardián versión↔texto · Página del aviso (MODIFIED) · Texto completo del aviso (MODIFIED, enmienda de la foto) | `src/lib/legales/version.ts` es la única declaración; el test de fuente única **deriva** el patrón de `VERSION_AVISO` y recorre `src/` y `prisma/`. El guardián hashea el contenido publicado, con 7 mutaciones que lo ponen en rojo (incluidas "quitar la marca de borrador" y "completar un placeholder"). |
| `modelo-datos` | La constancia guarda contra qué versión se dio | Tres columnas nulables sin default; migración `20260905120000` sin `UPDATE`, `DEFAULT` ni `NOT NULL`; `tests/modelo-version-aviso.test.ts` comprueba la migración sobre una base con los tres estados. |
| `registro-negocio` | Nadie consiente lo que no tuvo enfrente · Consentimiento con constancia (MODIFIED) · Una sola ficha por WhatsApp (MODIFIED, enmienda "posterior") | Comparación en `validacion.ts:221` **antes** de tocar la base; la versión que se sella es siempre `VERSION_AVISO` del servidor (`procesar.ts:430`); reaceptación en el mismo `updateMany` condicionado a `rechazado`. |
| `revision-admin` | Detalle del registro (MODIFIED) | `constanciaConVersion` y `etiquetaReaceptacion` en `detalle-registro.tsx`; los tres campos en la proyección del panel y en ninguna otra. |

**Scenarios sin cobertura: ninguno.** Los cuatro scenarios que la iteración 2 reescribió o agregó (rollback, ficha sin versión, etiqueta sin sobre-atribuir, foto en datos recogidos) tienen test propio, y los verifiqué también contra el servidor real (§4).

**Enmiendas de spec:** las tres están marcadas como enmienda dentro del requirement que modifican, con el hallazgo que las originó y el motivo. Correcto: el texto legal es contenido aprobado, y cambiarlo sin dejar rastro en la spec es justo lo que este change existe para impedir.

## 2. Ticket T-012: los 5 criterios

- **Identificador estable y visible** — `Versión 1 · Última actualización: …` en `/aviso-de-privacidad` y "Estás aceptando la versión 1 del aviso de privacidad." antes de la casilla. Comprobado en el HTML servido.
- **Se guarda la versión junto al timestamp (migración)** — sí, y como par inseparable escrito en el mismo objeto literal.
- **Cambiar el texto sin subir la versión hace fallar un test** — comprobado *de verdad*, no en teoría: la fusión con `main` lo puso en rojo (§3).
- **El panel muestra la versión aceptada** — los tres casos, verificados en el panel corriendo.
- **El reenvío actualiza la versión aceptada solo si la casilla se marcó con el texto nuevo enfrente** — resuelto como reaceptación aparte, sin tocar la constancia original. La spec definió la interacción exacta, que era lo que el ticket pedía.

## 3. La prueba de fuego: el guardián en la fusión con `main`

Al fusionar `origin/main` (PRs #12 y #13), git resolvió `src/lib/legales/textos.ts` sin conflicto —las dos enmiendas tocan hunks distintos— y por eso mismo **nadie se habría enterado de que el aviso publicado cambió**. El guardián sí:

```
El texto del aviso de privacidad cambió sin estrenar versión: la huella de la
versión "1" ya no es la anclada. Sube VERSION_AVISO … Huella del texto de hoy:
08ce983c…
```

Es el primer caso real del guardián fuera de su propio change, y es exactamente el fallo que el ticket quería forzar: un merge limpio que altera contenido legal y exige una decisión de versión.

**Decisión tomada (siguiendo la recomendación escrita del dev, `reports/b-dev.md` §5):** se **volvió a anclar la huella de la versión `1`** en vez de estrenar la `2`. La excepción es válida porque la `1` la estrena este mismo change y todavía no ampara ninguna constancia: la columna `consintioAvisoVersion` no existe en ninguna base desplegada. Estrenar una `2` afirmaría que existió una `1` publicada que nunca salió de la rama. La decisión —y que después del merge a `main` ya no hay excepción— queda escrita en la cabecera de `HUELLAS_POR_VERSION`.

**Fusión de los dos textos, revisada frase por frase:** no se duplicó ni se perdió nada. La viñeta de "Qué datos recogemos" **enumera** el dato (nuestra enmienda) y el párrafo de "Qué queda público" **describe el tratamiento** (PR #12). Son complementarias, no redundantes; la frase vieja "Hoy el formulario todavía no pide fotos" desapareció con la fusión, como debía.

**Migraciones:** 6 en orden cronológico (la nuestra, `20260905120000`, va después de las de T-008 y T-015). `prisma migrate deploy` sobre base recreada: aplicadas. `prisma migrate diff --from-migrations --to-schema`: *empty migration* → **sin drift**.

## 4. Verificación en servidor real (puerto 3600, build de producción)

- **Alta sella versión:** contra la base de desarrollo real, un alta válida queda con `consintioAvisoVersion = "1"` y los dos campos de reaceptación nulos.
- **Desfase a media captura:** un envío declarando la versión `"0"` **no crea ficha** (0 filas) y responde con el literal exacto "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla.", conservando lo capturado.
- **Panel, los tres casos:** `31 jul 2026, 04:00 a.m. (versión 1)`; `(versión no registrada)` en la ficha anterior al versionado; y en la que se reenvió, la constancia `(versión 0)` **más** la línea `El reenvío aceptó la versión 1 del aviso` con la fecha del reenvío. Ninguna dice "Aceptó una versión más nueva".
- **Formulario sin JS:** el campo viaja renderizado en el HTML — `<input type="hidden" name="avisoVersion" value="1"/>`.
- **`/terminos` no se versiona:** conserva su línea tal cual.
- **Nada se fuga:** ni la portada, ni el buscador, ni el log del servidor contienen los campos nuevos.

## 5. Seguridad (re-verificada, no heredada)

El reporte de `c-seguridad` cierra sin críticos, altos ni medios; verifiqué por muestreo sus afirmaciones fuertes y las sostuve todas: la comparación es de orden y no de desigualdad, "sin versión" no genera reaceptación, la cota de 20 se aplica en el borde y truncar no puede producir la versión vigente, y la marca de borrador entró a la huella. Los tres bajos aceptados (BAJO-2 `CHECK` del par, BAJO-3 seed, BAJO-5 versión ordenable) están documentados y BAJO-5 ya tiene test que lo grita.

Mis propias comprobaciones: sin secretos ni datos personales reales en el diff (todos los teléfonos son `771999xxxx` ficticios o el `7711234567` de ejemplo de la spec); `src/lib/directorio.ts` **no se tocó** y su proyección es una lista blanca explícita; sin `any`; sin dependencias nuevas (`package.json` intacto); ningún archivo nuevo con `"use client"`.

**BAJO-6 (informativo, no bloqueante) · `src/lib/directorio.ts:12`** — el comentario que enumera los campos internos que la proyección pública no expone menciona `consintioAvisoEn` pero no las tres columnas nuevas. El comportamiento es correcto (lista blanca + tests adversariales); es documentación que conviene completar al consolidar la spec.

## 6. Correcciones aplicadas por mí (transparencia)

Las dos son de integración o documentación, ninguna cambia comportamiento:

1. **`prisma/schema.prisma:57-62`** — el comentario de la reaceptación seguía describiendo la regla **anterior** a los hallazgos MEDIO-3/MEDIO-4 ("una versión DISTINTA… o cualquiera, si aquella no tiene versión"), que es justo la que seguridad rechazó por producir evidencia falsa. Reescrito para decir lo que el código hace y la spec enmendada exige. Dejarlo habría plantado en el modelo de datos la invitación a reintroducir el defecto.
2. **`tests/aviso-version-seguridad-adversarial.test.ts:682-689`** — tras la fusión, `RegistroAdminDetalle` exige `despublicadoEn`, `motivoDespublicacion` y `girosIds` (T-015). El literal de prueba no los traía y `npm run build` fallaba con TS2739 aunque `npm test` pasara (vitest no typechequea). Añadidos como nulos/vacío, con nota de por qué están.

## 7. Gates mecánicos (ejecutados por mí, después de la fusión)

| Gate | Resultado |
|---|---|
| `npm run lint` | ✅ 0 problemas |
| `npm test` | ✅ **66 archivos / 1848 tests** |
| `npm run build` | ✅ compila y genera las 11 estáticas |
| `prisma migrate deploy` sobre base recreada | ✅ 6 migraciones |
| Drift `migrate diff` | ✅ vacío |
| Seeds | ✅ catálogos + 12 negocios ficticios |

Antes de la fusión también estaban en verde (62 archivos / 1655 tests): la diferencia es lo que `main` trajo.

## 8. Qué verifiqué por muestreo

Diff completo de los 8 archivos de código de producción y del módulo nuevo; los 4 deltas leídos íntegros contra la implementación; los tres tests nuevos leídos completos; los +5 líneas de las 8 suites ajenas (todos son el campo oculto en sus fixtures: sin ese campo el envío se rechaza, así que el ajuste era obligado y no es scope creep); el texto legal fusionado, párrafo por párrafo, contra el bloque literal de la spec.

## 9. Pendientes humanos (no bloquean el merge; sí el lanzamiento)

1. **Los placeholders del aviso siguen sin completar** (`[NOMBRE O RAZÓN SOCIAL]`, `[DOMICILIO]`, `[CORREO ARCO]`, `[WHATSAPP]`, `[FECHA DE PUBLICACIÓN]`) y la página lo dice con su marca de borrador. Completarlos **estrena la versión 2**: es contenido publicado y entra en la huella.
2. **Revisión legal (E6-3).** Si el abogado reescribe el texto, misma regla.
3. **Re-solicitar el consentimiento a las fichas ya publicadas** cuando estrene la `2` es decisión legal humana, fuera de este change. Hoy todas las fichas existentes se quedan con la versión nula: "no consta" es la verdad, no un defecto.
4. **CI de GitHub Actions en verde en el PR.** Mi validación local no lo sustituye. El merge lo hace un humano.

---

## 10. Segunda fusión con `main` (T-010, analítica cookieless) — post-PR

`main` avanzó con el PR #14 mientras este PR se abría, así que hubo que fusionar otra vez y re-validar. **El veredicto no cambia.**

**Dos conflictos, resueltos conservando ambos lados:**

1. **`tests/foto-adversarial.test.ts`** — git lo trata como **binario**: la suite lleva a propósito un byte NUL y un `U+202E` (override de derecha a izquierda) entre sus nombres de archivo hostiles, así que la fusión de texto no aplica y git no puede combinar nada. Se rehicieron a mano los tres hunks de este change (el campo oculto de la versión en el fixture del formulario) sobre la versión de `main`, que movió las páginas públicas al grupo de rutas `(publico)`. Verificado con un diff de los tres lados (base / nuestro / suyo): la única diferencia contra `main` son nuestros tres hunks.
2. **`docs/metricas-pipeline.md`** — las dos filas nuevas, en orden de merge.

**Un fallo real que la fusión destapó:** `tests/legales-paginas.test.ts` comprobaba que la versión no estuviera escrita a mano leyendo `src/app/aviso-de-privacidad/page.tsx`, ruta que T-010 movió a `src/app/(publico)/…`. El test **falló** en vez de pasar en falso (leía el archivo con `readFileSync`, así que la ruta inexistente reventó): buen diseño del dev, porque un `existsSync` silencioso habría dejado el guardián de "una sola fuente" apagado sin que nadie lo notara. Ruta corregida.

**El contenido publicado del aviso NO cambió** en esta fusión —T-010 solo tocó comentarios y rutas de `textos.ts`—, así que el guardián siguió en verde con la huella ya anclada, sin decisión de versión que tomar. Es el contraste útil con la primera fusión: el guardián salta cuando cambia lo que el titular lee y se calla cuando cambia el andamio.

**Gates re-ejecutados sobre el árbol fusionado:** `npm run lint` ✅ · `npm test` ✅ **73 archivos / 1986 tests** · `npm run build` ✅ · `migrate deploy` ✅ 7 migraciones en orden · drift ✅ vacío · verificación en servidor real repetida entera (alta, desfase, los tres casos del panel, campo oculto en el HTML) ✅.

**Observación nueva (informativa, no de este change):** la sección "Cookies y datos de navegación" del aviso dice "Si más adelante agregamos alguna herramienta para medir visitas, lo decimos aquí antes de encenderla". T-010 ya trae esa herramienta, apagada mientras no se configure (`ScriptAnalitica` devuelve `null` sin configuración). Encenderla obliga a editar ese párrafo y, con este change dentro, **a estrenar la versión 2 del aviso**. Que ese cable quede tenso es exactamente lo que T-012 venía a conseguir; conviene que quien despliegue la analítica lo sepa antes y no después.
