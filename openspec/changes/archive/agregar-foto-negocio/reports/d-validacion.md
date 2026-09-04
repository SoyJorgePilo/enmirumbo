# Reporte de validación · agregar-foto-negocio (T-008)

**Veredicto: APROBADO, con un bloqueo declarado para el humano.**

El change cumple su spec, sus criterios de aceptación y los tres gates
mecánicos, y la auditoría de seguridad cierra limpia tras tres iteraciones. La
fusión con `main` (T-007 legales + T-009 SEO) está resuelta y verificada. Hay
**un solo asunto que un humano tiene que resolver antes del merge**, y no es
del código de T-008 sino de la colisión entre dos specs aprobadas: el aviso de
privacidad afirma hoy que "el formulario todavía no pide fotos", y a partir de
este change eso deja de ser verdad. Por eso el PR se abre **en borrador**.

Nada de lo que sigue se tomó de los reportes de las etapas anteriores: todo se
re-verificó contra el diff, contra el código y —lo que se podía— contra un
servidor real en el puerto 3200.

---

## 1. El bloqueo: el aviso de privacidad deja de decir la verdad

`src/lib/legales/textos.ts` (aviso de privacidad, sección "Qué queda público y
qué no") publica hoy:

> "Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual
> que lo demás. **Hoy el formulario todavía no pide fotos**; el día que las
> pida, aquí te decimos qué se puede publicar en ellas."

Con este change el formulario **sí** pide fotos. La segunda mitad de ese
párrafo pasa a ser una afirmación falsa en un documento con efectos legales
(LFPDPPP), publicado en `/aviso-de-privacidad`.

No lo corrijo por mi cuenta, y el motivo es de proceso, no de pereza: ese texto
está fijado **literalmente** por la spec consolidada `paginas-legales`
(`openspec/specs/paginas-legales/spec.md`, línea 140) y además por un scenario
(línea 84: *"…y que hoy el formulario todavía no pide fotos"*). Cambiarlo es
cambiar una spec aprobada de otra capacidad; eso pasa por `/spec` y por la
aprobación humana, que es justo el punto de control que este pipeline no se
salta. Un validador que reescribe specs para que su propio change encaje es
exactamente el fallo que el proceso quiere evitar.

**Qué hace falta (decisión + trabajo, chico):** enmendar el requirement de
`paginas-legales` para que el párrafo describa la foto como campo que el
formulario ya captura y con qué política se publica (PRD §6.1), actualizar
`src/lib/legales/textos.ts`, el scenario y las dos aserciones de
`tests/legales-paginas.test.ts` (líneas 73, 492 y 495). Puede ir en este mismo
PR una vez aprobada la enmienda, o como fix inmediato antes del merge.

Lo que sí hice, porque no toca ningún literal aprobado: el guardián de
privacidad de T-007 (`CAMPO_PUBLICO_DECLARADO`, `tests/legales-adversarial.test.ts`)
declara ahora `fotoClave` en lugar de `fotoUrl`, con el mismo criterio con el
que el validador de T-009 declaró `categoriaNombre`. El guardián sigue
exigiendo que cada campo de la proyección pública esté declarado en el aviso.

## 2. Spec: 17 requirements, 66 scenarios

Los cuatro deltas (`registro-negocio` 8/32, `directorio-publico` 5/19,
`modelo-datos` 3/9, `revision-admin` 1/6) tienen implementación verificable.
Muestreo de los scenarios donde es más fácil mentir:

| Scenario | Verificado por mí |
| --- | --- |
| "el trabajo por foto no se multiplica" | `decodificarUnaVez()` abre el original una vez y las dos variantes salen del mapa en crudo (`procesar.ts:125-191`) |
| "fotos difíciles de comprimir no bloquean el formulario" | el turno del semáforo envuelve **solo** el decodificado; la escalera de calidad corre fuera (`procesar.ts:235-268`) |
| "llegan más fotos de las que caben a la vez" | `conCupoDeImagen` devuelve `{ok:false}` sin esperar; el turno se libera en `finally` (`semaforo.ts:45-56`) |
| "la ubicación del celular no se publica ni se guarda" | servidor real: subí un JPEG con EXIF `Make`/GPS; las dos variantes salen sin EXIF, sin ICC y sin XMP, y los bytes no contienen ni "ValidadorPhone" ni "GPS" |
| "foto de un registro en revisión" | `/api/foto/<clave>/tarjeta` → 404 y `/admin/foto/<clave>/ficha` sin cookie → 404; con cookie → 200 `no-store` |
| "referencia externa guardada a mano" | escribí `https://evil.example/pixel.png` en `fotoClave` de una ficha publicada: 0 apariciones del dominio en el HTML, 0 `<img>`, `og:image` cae a la imagen de marca y el JSON-LD no emite `image` |
| "la tarjeta no usa la foto grande" | listado y página de giro piden `…/tarjeta`; la ficha, `…/ficha` |
| "el listado no descarga lo que no se ve" | solo la primera tarjeta va sin `loading="lazy"` (`ListaNegocios`, `prioridad={indice === 0}`) |
| "peso de las variantes" | en el servidor real, tarjeta 292 B (400×300) y ficha 2 022 B (1200×900) desde un JPEG de 26 KB; el tope de 60/250 KB lo impone `generarVariante` bajando calidad y, si hace falta, lado mayor |
| "la casilla de quitar foto es igual para todos" | la casilla se pinta siempre con el mismo literal, sin consultar si el número tiene ficha |

Los 7 literales nuevos y los dos del panel se compararon **carácter por
carácter** contra el texto de los deltas: coinciden.

## 3. Ticket: los 8 criterios de aceptación

Los 8 se cumplen. El de la referencia interna (`fotoUrl` solo admite valores
del servidor, M1 de T-004) queda cerrado por construcción: la columna se llama
`fotoClave`, es `@unique`, y todo consumidor pasa por `urlDeFoto`, que exige
`^[0-9a-f]{32}$`.

## 4. Alcance

Sin scope creep. Lo único que no pide la spec literalmente es el barrido de
huérfanas (`npm run fotos:barrer-huerfanos`), que entra como cierre del
hallazgo M-3 de la auditoría —una foto sin fila es un dato personal fuera del
alcance de cualquier operación ARCO— y queda documentado como deuda operativa
(cron en T-013).

## 5. tasks.md

Las 37 tareas están hechas. Una imprecisión menor, no bloqueante: la #12 dice
que "los tests comparan contra la spec, no contra el código", y en realidad
comparan contra las constantes de `textos.ts`. La comparación contra la spec la
hice yo a mano (§2) y salió limpia; queda anotado porque el día que alguien
cambie un literal, la suite no se va a enterar.

## 6. Seguridad

El reporte `c-seguridad.md` cierra con 0 críticos, 0 altos, 0 medios y 3 bajos
aceptados. Re-verifiqué por mi cuenta:

- **Sin secretos ni datos reales en el diff.** Ningún archivo de imagen
  versionado; `.fotos/` y `.fotos-test/` ignorados; los WhatsApp del seed y de
  las suites siguen en las series ficticias `771000001x` / `771999xxxx`.
- **Ningún endpoint sobre-expone campos.** La proyección pública suma
  `fotoClave` y nada más; el detalle del panel la usa contra `/admin/foto/…`,
  que sin sesión responde el mismo 404 que el sitio público.
- **El DoS de descompresión (A-1)** quedó acotado por concurrencia y el turno
  cubre solo el decodificado (M-5). La medición de la etapa C es coherente con
  el código que leí.

## 7. Gates mecánicos, corridos por mí

Antes de la fusión, sobre la base de la rama:

- `npm run lint` — limpio
- `npm run build` — OK
- `npm test` — **1156/1156**

Después de la fusión con `origin/main`, con el cliente de Prisma regenerado:

- `npm run lint` — limpio
- `npm run build` — OK (y también con `SITIO_URL=https://necesitouno.mx`)
- `npm test` — **1548/1548** (59 archivos)

Y en servidor real (`next start -p 3200`, base migrada desde cero + seeds):
registro sin JavaScript con foto de 26 KB → 303 y dos variantes escritas →
404 público mientras está en revisión → foto visible en el panel con sesión →
aprobación → foto en tarjeta, en ficha, en la página de giro `/futbol`, en
`og:image` y en el JSON-LD.

## 8. Convenciones

UI en español mexicano, sin `any`, sin `@ts-expect-error`. Una dependencia
nueva, `sharp`, pineada a `0.35.4`: justificada en `proposal.md`, ya estaba en
el árbol como opcional de Next y es lo que permite cumplir "comprimida en el
servidor" del PRD §6.1.

## 9. Cierre del hallazgo M3 de T-009

`imagenesDeLaFicha` (og:image) e `imagenAbsoluta` (JSON-LD) leían `fotoUrl` y
devolvían tal cual cualquier `https://` guardado en la base. Ahora reciben la
clave interna y construyen la URL con `urlDeFoto`. No hay lista blanca de
dominios que mantener: **la lista blanca es la construcción**, porque la
columna dejó de guardar direcciones. Verificado en servidor real (§2) y
reforzado en `tests/seo-seguridad-adversarial.test.ts`, cuyo caso "una foto con
un esquema hostil nunca sale como og:image" ahora incluye
`https://evil.example/pixel.png`, un subdominio parecido al propio, una ruta
interna inventada y `../../etc/passwd`.

## 10. Deudas y pendientes que van al PR

- **Bloqueante para el humano:** el párrafo del aviso de privacidad (§1).
- Cron del barrido de huérfanas → T-013. La guarda es *fail-closed*: si el
  barrido se planta sale con código 1 y no borra; quien monte el cron tiene que
  vigilar ese código o las huérfanas se acumulan en silencio.
- `serverActions.bodySizeLimit: "6mb"` es global y también sube el tope de
  cuerpo de las acciones del panel. Riesgo aceptado y razonado en `design.md`
  §6.1; la salida, si E0-3 lo pide, es un límite en el proxy del proveedor.
- `FOTOS_DIR` en el despliegue: el adaptador local escribe en disco, que en
  serverless es efímero. Publicar con fotos depende de E0-3 (ADR-006).
- Revisión visual con fotos reales a 390/768/1280 px: sin ojos humanos no se
  puede afirmar que la foto no le roba protagonismo al botón de WhatsApp.

**El CI de GitHub Actions tiene que quedar en verde en el PR.** Mi corrida
local no lo sustituye: el runner instala desde cero (`npm ci`) y `sharp` trae
binarios por plataforma, que es justo lo que aquí no se puede comprobar.
El merge lo hace un humano, siempre.
