# Reporte de validación — agregar-formulario-registro

Etapa D (compuerta final antes de git). Alcance revisado: `git diff main` +
los 31 archivos sin seguimiento de `git status`, la spec
(`registro-negocio`, 12 requirements / 40 scenarios; `layout-base` MODIFIED,
4 scenarios), el ticket T-003, `tasks.md` y los tres reportes previos.

Los reportes de las etapas A, B y C se leyeron como pistas, **no como
evidencia**: todo lo que sigue lo verifiqué contra el código, contra la suite
ejecutada por mí y contra el servidor corriendo.

## Veredicto: APROBADO — 1a pasada, sin hallazgos bloqueantes

0 críticos · 0 altos · 0 medios · 3 notas informativas. Commiteado, empujado y
con PR abierto hacia `main`.

## Compuertas mecánicas (ejecutadas por mí)

| Gate | Resultado |
| --- | --- |
| `npm run lint` | limpio, sin salida |
| `npm test` | **11 archivos, 264 tests, todos en verde** (2.98s) |
| `npm run build` | compila; rutas `/` y `/registro/gracias` estáticas, `/registro` dinámica (`ƒ`) |
| Dependencias nuevas | ninguna — `package.json` y `package-lock.json` no aparecen en el diff |
| `any` / `@ts-ignore` | ninguno en `src/` ni `tests/` (fuera de `src/generated/`) |

## 1. Spec: los 44 scenarios tienen implementación verificable

Verifiqué el mapa scenario→código por muestreo y, para los de más riesgo,
**contra el servidor real** con POST directos (sin JavaScript de cliente,
usando los campos ocultos `$ACTION_*` que Next sirve para el envío
progresivo). Lo que comprobé de punta a punta:

| Scenario | Comprobación mía |
| --- | --- |
| Envío exitoso + gracias + POST-Redirect-GET | POST válido → **303 `Location: /registro/gracias`**; fila creada; la pantalla de gracias trae el mensaje literal del PRD y ningún `<form>` |
| Normalización del WhatsApp (M1 de T-001) | envié `+52 771 999 7788`; lo persistido es `7719997788` |
| Duplicado con otro formato | reenvié `771-999-7788` → 200 con el texto literal "Este número ya tiene una ficha registrada…" y **ninguna segunda fila** |
| El cliente no puede autopublicarse | POST con `estado=publicado`, `origen=siembra`, `publicadoEn`, `tokenGestion`, `consintioAvisoEn=1999-01-01`, `fotoUrl`, `latitud`, `giros` → fila en `en_revision` / `organico`, sin publicar, sin token, con `consintioAvisoEn` puesto por el servidor |
| Honeypot | POST con `sitio_web` lleno → **303 a gracias y cero filas** (no delata la trampa) |
| Errores por campo, en español y literales | un POST con 5 errores a la vez devolvió los 5 textos exactos de la spec |
| No se pierde lo capturado | el HTML de error reeco los valores; `queOfreces` de 250 vuelve truncado a 200 (MEDIO 3 cerrado) |
| Aviso simplificado sin enlaces muertos | el texto literal está en el HTML servido y **no hay ni un `href`** en todo el bloque de consentimiento |
| Listas cerradas | 8 categorías y 21 colonias leídas de la base + `<option value="otra">Otra</option>` al final |
| Teclado numérico / mobile | `inputMode="numeric"` en WhatsApp; controles `py-3` / `min-h-11`; un solo `<h1>` y un solo `<form>` |
| Funciona sin JS | el formulario completo se sirve en el HTML (no solo en el payload RSC) con `method="POST"` y los `$ACTION_*`; todos los POST de arriba se hicieron con `curl`, sin ejecutar JS |
| Ejemplo dinámico | sin JS se sirve el genérico "ej. palabras clave de lo que ofreces"; los 8 slugs del catálogo tienen ejemplo y los 2 literales del PRD coinciden carácter por carácter |

Lo único que no puedo cerrar en este entorno es lo que exige navegador real:
comprobación visual a 390/768/1280 px, el salto de foco efectivo, el doble
toque del botón y el cambio de ejemplo en vivo. Están declarados como tales
por las tres etapas y van al cuerpo del PR como revisión humana.

## 2. Ticket T-003: los 10 criterios de aceptación se cumplen

Los verifiqué uno por uno (detalle en el PR). Los dos hallazgos heredados de
T-001 que el ticket obligaba a resolver quedan cerrados: **M1** (unicidad solo
por cadena exacta) con `normalizarWhatsapp` como única puerta de entrada del
número al modelo — comprobado sobre la base, no solo en tests — y el **bajo de
URLs** con `urlHttpNormalizada`, que además persiste `url.href` y rechaza
credenciales incrustadas.

## 3. Alcance: sin scope creep

Cada archivo nuevo mapea a una tarea de `tasks.md` y a un requirement. No hay
esquema nuevo ni migraciones (el modelo de T-001 se consume tal cual), no hay
pin de mapa (pospuesto en `design.md` §2 y aprobado en la propuesta),
`latitud`/`longitud` quedan nulos —lo confirmé en la fila creada—, no hay foto
(E1-3), ni panel, ni enlace de gestión, ni páginas legales. `src/lib/estilos-boton.ts`
no es un extra: lo pide el delta de `layout-base` ("estilo de acción principal,
verde WhatsApp, ≥44px") y lo comparten la home y el botón de envío.

El único archivo existente que se tocó además de la home es
`tests/layout.test.ts`, previsto por el ticket y por la spec. Revisé que el
ajuste esté justificado por el delta y nada más:

- la lista blanca de hrefs deja de ser la constante `"/"` y pasa a derivarse de
  los `page.tsx` de `src/app` → **más estricta que antes**: un enlace a una
  ruta inexistente (los legales de E6) sigue rompiendo la suite;
- el test de `"use client"` se acota a los archivos de `layout-base`. Contrasté
  con la spec consolidada: el scenario dice literalmente "se revisa **el
  layout, el header y el footer**" (`openspec/specs/layout-base/spec.md:75-78`),
  así que la acotación devuelve el test a su requirement en vez de debilitarlo,
  y está hecha por exclusión, no con una lista fija.

## 4. tasks.md: 19/19 hechas y verdaderas

Muestreé 6 (1, 3, 5, 14, 16, 17) contra el código: todas están donde dicen y
hacen lo que dicen. La 19 lleva anotado su pendiente humano en vez de fingirse
completa, que es lo correcto.

## 5. Seguridad: re-verificada por mi cuenta

El veredicto de la etapa C es limpio tras 1 iteración (1 alto + 6 medios). No
lo di por bueno: releí `limite-ip.ts`, `validacion.ts` y `procesar.ts` enteros
y confirmé cada corrección en el código (IP solo del encabezado declarado y del
último salto, validada como IP, con `null` fail-safe; poda y techo del mapa;
`casilla` exige valor afirmativo; cotas para `whatsapp`/`categoriaId`/`coloniaId`
+ `recortarParaEco`; `url.href` sin userinfo; `.env.example` documentado;
scenarios 8/36/37 automatizados).

Barridos propios sobre todo el diff:

- **Datos personales**: ningún WhatsApp de negocio real. Los de prueba usan el
  rango ficticio `771999xxxx`; `7711234567` solo aparece como ejemplo en la
  spec aprobada y en comentarios.
- **Secretos**: cero. `.env.example` solo suma dos variables comentadas y sin
  valor (`REGISTRO_ENCABEZADO_IP`, `REGISTRO_UMBRAL_ALTAS_DIARIAS`); ningún
  `.env` real está rastreado.
- **Sobre-exposición**: no hay endpoint nuevo (Server Action, no ruta pública),
  el alta se arma con `DatosNegocioValidados` campo por campo y la respuesta de
  error solo devuelve lo que el propio cliente mandó, truncado.
- **Logs**: los 7 `console.*` registran eventos, conteos o `resumenDeError`
  (código de Prisma o nombre del error); ninguno interpola número, nombre,
  dirección ni IP.
- Sin `dangerouslySetInnerHTML` ni SQL crudo.

**Los 2 riesgos residuales tienen dueño y no se pierden**: quedan escritos en
`c-seguridad.md`, en la cabecera de `limite-ip.ts:142-162`, en `.env.example`
con aviso en mayúsculas ("SIN ESTA VARIABLE EL LÍMITE… NO SE APLICA") y en el
cuerpo del PR, dirigidos a **E0-3**:

- **R1** — sin `REGISTRO_ENCABEZADO_IP` configurada no hay cupo por IP (estado
  por defecto; el código avisa una vez por proceso en el log).
- **R2** — con más de un salto de confianza encadenado, todos comparten clave y
  el cupo podría cerrar el registro a todo el mundo.

## 6. Convenciones

UI 100 % en español mexicano coloquial ("Registra tu negocio gratis", "¿A qué
se dedica?", "Sin espacios ni guiones — nosotros lo acomodamos"), sin
anglicismos ni jerga de producto. Server Components por defecto: solo
`formulario-registro.tsx` y `boton-enviar.tsx` declaran `"use client"`, y el
aviso legal y el honeypot se pasan ya renderizados como props para que su texto
no viaje al bundle. Un solo `eslint-disable` (exhaustive-deps del efecto de
foco) y dos `!` no nulos, los tres con comentario que explica por qué.

## Notas informativas (no bloquean; para el PR o el checkpoint)

1. `tests/registro-pagina.test.ts:99` — `nombre.replace(/\//g, "/")` no hace
   nada (sustituye `/` por `/`); sobra o quería ser otra cosa.
2. `tests/registro-accion.test.ts:122,134` y `tests/registro-validacion.test.ts:405`
   usan `7797990000` / `7799990000` como **teléfono fijo**, fuera de la
   convención `771999xxxx` de `design.md` §7. Son igual de inventados (lada 779
   local, terminación en ceros) y no hay riesgo LFPDPPP, pero conviene unificar
   la convención cuando se toquen esos tests.
3. Al consolidar `openspec/specs/` en el `/checkpoint`, el delta deja dos
   scenarios de enlaces muertos en `layout-base` (el del footer, en "Layout
   global", y el nuevo "sin enlaces muertos" de la home). No se contradicen,
   pero vale fusionarlos o delimitarlos al archivar.

## Recordatorio

El CI de GitHub Actions debe quedar en verde en el PR: esta validación local no
lo sustituye. **El merge lo hace un humano**, y con él van la revisión visual a
390/768/1280 px, el copy pendiente de visto bueno (botón "Registrar mi
negocio", los 6 ejemplos que no son literales del PRD, los textos de ayuda) y
la decisión sobre si los errores deben llevar rojo (hoy son `aria-invalid` +
borde grueso + "⚠" + negritas, para no romper la paleta de una sola vía de
T-002).
