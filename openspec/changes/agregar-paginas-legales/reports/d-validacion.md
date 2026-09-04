# Reporte de validación — agregar-paginas-legales

Etapa D. Validación independiente del árbol principal en `feature/agregar-paginas-legales`:
verifiqué el diff (`git diff main` + untracked) contra la spec enmendada, el ticket y el
código real. Los reportes de a-ui, b-dev y c-seguridad se leyeron como contexto, **no como
evidencia**: cada afirmación que uso abajo la reverifiqué yo.

## Veredicto

**APROBADO.** Cero hallazgos bloqueantes. Un residual BAJO ya declarado en el código con su
ticket (E0-3) y trasladado al PR como criterio de lanzamiento.

## Gates mecánicos (ejecutados por mí)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | verde (exit 0, sin warnings) |
| `npm run build` | verde (exit 0); `/aviso-de-privacidad` y `/terminos` se generan como **estáticas** (`○`) |
| `npm test` | verde: **975 tests en 36 archivos**, exit 0 |

Coincide con lo que reportó la etapa C (975). El CI de GitHub Actions debe quedar en verde
en el PR: esta corrida local no lo sustituye.

## 1. Spec → implementación

Los tres deltas (`paginas-legales` 9 requirements, `layout-base` 2 MODIFIED,
`registro-negocio` 1 MODIFIED) tienen implementación verificable. Ningún scenario sin cubrir.

**Verificación literal, carácter por carácter (el corazón de este change).** No la hice a
ojo: rendericé `AVISO_PRIVACIDAD` y `TERMINOS` desde `src/lib/legales/textos.ts` a la misma
forma canónica del bloque aprobado de la spec (h1, marca de borrador, "Última
actualización: ", intro, `##` por sección, `- ` por viñeta, enlace de cierre) y lo comparé
con `diff` contra los dos bloques cercados extraídos de
`specs/paginas-legales/spec.md`:

- Aviso de privacidad (6 573 bytes): **idéntico**, byte por byte.
- Términos y condiciones (4 329 bytes): **idéntico**, byte por byte.

Lo mismo para el aviso simplificado: extraje el literal de
`specs/registro-negocio/spec.md` y lo comparé con `TEXTO_AVISO_PRIVACIDAD` en
`src/lib/registro/textos.ts` → **idéntico**. El literal del enlace
("Lee el aviso de privacidad completo") y el del checkbox (sin cambios) también coinciden.

La enmienda legal quedó aplicada en los tres lugares que tenían que decir lo mismo (spec,
código y tests): el texto servido, el bloque aprobado de la spec y las aserciones de
`tests/legales-paginas.test.ts` / `tests/legales-adversarial.test.ts` transcriben la misma
frase. No hay rastro de la redacción previa a la enmienda en ninguna superficie.

## 2. Ticket → criterios de aceptación

| Criterio | Verificado en |
| --- | --- |
| Aviso integral con los 6 elementos mínimos LFPDPPP + ARCO ≤20 días hábiles + placeholders marcados | 10 secciones `h2`, una por elemento; "en un máximo de 20 días hábiles" en la sección ARCO; 7 placeholders entre corchetes |
| Términos: intermediario informativo, deslinde, reglas de moderación §6.3 | secciones "Somos un intermediario informativo, no el negocio", "Qué verificamos y qué no", "Reglas para registrar un negocio" (5 viñetas con los ejemplos del PRD) |
| Footer enlaza ambas páginas con área táctil ≥44px | `src/components/footer.tsx`: dos `Link` con `min-h-11` (=44px) |
| Aviso simplificado dice que WhatsApp/teléfono quedan públicos (E1-6/M3) y enlaza al integral | literal nuevo + `Link` a `/aviso-de-privacidad`, misma pestaña, `min-h-11` |
| Indexables, español llano, mobile-first, sin JS de cliente | metadata propia sin `noindex`; ningún `"use client"`; ambas rutas estáticas en el build |
| Lista blanca de enlaces reconoce las rutas nuevas | `tests/layout.test.ts`: `rutasExistentes` las contiene; `/terminos-y-condiciones` y `/aviso-privacidad` siguen fallando |

Criterio 6 con matiz correcto: el caso "el footer no tiene ningún enlace" fue **sustituido**,
no borrado, conforme al delta de `layout-base`.

## 3. Alcance

Sin scope creep. El diff toca exactamente lo que la propuesta anunció: 4 archivos nuevos de
producto, 4 suites nuevas, 4 archivos modificados y el ticket. **Sin dependencias nuevas**
(`package.json` intacto), sin migraciones, sin tocar la base. Verifiqué el staging con
`git add -An .`: solo archivos de este change; nada de `.claude/worktrees/` ni de los
changes de foto y SEO que corren en paralelo.

## 4. tasks.md

33 de 34 tareas `[x]` y realmente hechas (muestreé 1, 3, 10, 16, 18, 21, 28, 31, 32, 33
contra el código). La única `[ ]` es la **26**, declarada desde el inicio como humana
(revisión visual con navegador a 390/768/1280 px): no es automatizable sin navegador real y
va listada como pendiente humano en el PR. Lo automatizable de esa tarea sí está cubierto
(44px de área táctil, sin anchos fijos).

## 5. Seguridad

El reporte de la etapa C cierra ALTO-1, MEDIO-1, MEDIO-2 y MEDIO-3. Reverifiqué contra el
código, no contra el reporte:

- **Coherencia del plazo de 90 días:** barrí los plazos del texto servido. Solo aparecen
  "20 días hábiles" (2×, aviso) y "90 días" (1× aviso, 1× términos), y los dos de 90 días
  dicen **rechazados**, igual que el PRD §6.3. Ningún plazo compite ni se contradice.
- **Sin promesas de automatismo:** el aviso dice "lo atendemos a mano, cuando tú lo pides:
  no hay un botón que lo haga solo".
- **El backlog no se publica:** grep de `E3-6`, `E0-3`, `backlog`, `purga`, `ticket`,
  `rechazadoEn` sobre el texto servido de ambas páginas → cero coincidencias.
  `PENDIENTES_OPERATIVOS_LEGALES` existe en el módulo, con compromiso/estado/ticket, y no lo
  importa ningún componente.
- **La enumeración de "qué queda público" cuadra con el código real:**
  `construirEnlaceComoLlegar` (`src/lib/enlaces.ts:66-79`) arma exactamente
  `dirección, colonia, "Tizayuca, Hidalgo"` hacia Google Maps — que es literalmente lo que
  dice el aviso. `CAMPOS_FICHA` (`src/lib/directorio.ts:66-73`) publica nombre, colonia,
  entregas, WhatsApp, `fotoUrl`, queOfreces, teléfono fijo, dirección, horario y
  `facebookUrl`: todos declarados en el aviso. Lo que el aviso promete que **nunca** se
  publica (fecha de registro, notas internas, motivo de rechazo) no está en la proyección,
  igual que `estado`, `origen`, `consintioAvisoEn`, `tokenGestion` y las coordenadas.
- **Otras afirmaciones contra el código:** la IP vive en memoria del proceso con ventana de
  una hora y no toca la base (`src/lib/registro/limite-ip.ts`, `VENTANA_LIMITE_MS`); la
  única cookie del sitio es la de sesión del panel (`src/lib/admin/sesion.ts`).
- **Datos personales y secretos (repo público + LFPDPPP):** cero correos, teléfonos reales,
  dominios, claves o variables de entorno nuevas en el diff. Los datos de prueba son
  ficticios y están rotulados ("Reparadora Adversarial Legales (ficticia)", WhatsApp
  `7717779301` de la serie reservada a ese archivo, borrada en el `afterAll`).

**Residual BAJO aceptado (no bloquea):** la eliminación de los rechazados a los 90 días
sigue sin ejecutor (E0-3) y el flujo ARCO no tiene pantalla (E3-6). Está declarado en el
código con su ticket y elevado a criterio de lanzamiento; va explícito en el PR.

## 6. Convenciones

Español mexicano coloquial y en segunda persona en toda la UI. Cero `any`. Cero
`"use client"` en lo nuevo. Cero `dangerouslySetInnerHTML`. Sin dependencias nuevas. El
contenido vive como datos en `src/lib/legales/textos.ts`, mismo patrón que
`src/lib/registro/textos.ts` y `src/lib/admin/textos.ts`; el componente no sabe de contenido
y el módulo no sabe de markup.

## Qué verifiqué por muestreo

Comparación literal completa (no muestreo) de los tres textos legales; `diff` mecánico
spec↔código. Muestreo dirigido en: cobertura scenario→test de los 4 scenarios nuevos de la
enmienda; las 18 aserciones de `tests/legales-adversarial.test.ts` (título por título, con
el caso `REGRESIÓN (hallazgo ALTO-1, corregido)` en el lugar de la `CARACTERIZACIÓN`);
`tests/legales-borrador.test.ts` (la marca se apaga sola y quedan los 10 `h2`); los tres
casos reescritos de `tests/layout.test.ts` y los dos de `tests/registro-pagina.test.ts`;
la reserva de segmentos en `src/lib/rutas-reservadas.ts`; y la salida de rutas del build.

## Pendientes humanos (van en el PR)

1. **Revisión visual** a 390 / 768 / 1280 px de las dos páginas y del footer (tarea 26).
2. **Los 7 placeholders del responsable**: nombre o razón social, domicilio, correo ARCO,
   correo de contacto, WhatsApp del directorio, fecha de publicación y jurisdicción.
3. **Revisión legal profesional (E6-3)** antes de retirar la marca de borrador.
4. **Pendientes operativos**: E3-6 (flujo ARCO en el panel) y E0-3 (purga de rechazados a
   los 90 días) — criterios de lanzamiento, no de merge.
5. **Constancia por versión del aviso**: el texto legal ya cambió una vez dentro de este
   mismo change y la constancia sigue siendo solo un timestamp. Merece ticket propio.

El merge lo hace un humano, con el CI en verde.
