# Reporte dev — agregar-formulario-registro

> **Estado: iteración 2.** La etapa C regresó el change con 1 hallazgo alto y 6
> medios; todos quedaron corregidos. El detalle está en la sección
> "Iteración 2 — correcciones de seguridad", al final. Lo de arriba es la
> iteración 1, que sigue vigente salvo donde la iteración 2 lo corrige.

## Resumen

Las 19 tareas de `tasks.md` quedaron completas. La Server Action mock de la
etapa UI desapareció: el formulario ahora valida en el servidor, normaliza el
WhatsApp a 10 dígitos antes de tocar la base (hallazgo M1 de T-001), guarda el
negocio en `en_revision`/`organico` con `consintioAvisoEn` puesto por el
servidor y redirige a la pantalla de gracias. `npm run lint`, `npm run build` y
`npm test` (177 tests, 10 archivos) en verde. El envío sin JavaScript se
verificó con POST reales contra el servidor: 303 a `/registro/gracias`, fila
creada y número normalizado.

## Qué se construyó

### Archivos nuevos

| Archivo | Qué es |
| --- | --- |
| `src/lib/whatsapp.ts` | `normalizarWhatsapp` — única puerta del número al modelo (design.md §3) |
| `src/lib/prisma.ts` | cliente Prisma de aplicación, instancia única y perezosa (design.md §6, tarea 1) |
| `src/lib/registro/textos.ts` | textos literales de la spec + cotas de longitud |
| `src/lib/registro/tipos.ts` | contrato cliente↔servidor (`EstadoAccionRegistro`, `DatosNegocioValidados`) |
| `src/lib/registro/ejemplos.ts` | ejemplos de "¿Qué ofreces?" por categoría (tarea 4) |
| `src/lib/registro/validacion.ts` | lectura del `FormData` + validación pura (tarea 3) |
| `src/lib/registro/limite-ip.ts` | cupo de 3 altas/hora por IP + lectura de la IP (tarea 14) |
| `src/lib/registro/procesar.ts` | el flujo completo del envío, probado sin request de Next (tareas 7-9, 14, 15) |
| `src/app/registro/accion.ts` | Server Action delgada: IP → `procesarRegistro` → `redirect` |
| `tests/whatsapp.test.ts`, `tests/registro-validacion.test.ts`, `tests/registro-limite-ip.test.ts`, `tests/registro-accion.test.ts`, `tests/registro-pagina.test.ts` | 131 tests nuevos |

### Archivos modificados

- `src/app/registro/page.tsx` — catálogos desde Prisma; `export const dynamic = "force-dynamic"`.
- `src/components/registro/formulario-registro.tsx` — importa la acción real y los módulos de `src/lib/registro/`; `ORDEN_CAMPOS_PARA_FOCO` corregido y exportado; prop opcional `estadoInicial` (solo para poder renderizar el estado de error en tests).
- `src/components/registro/aviso-consentimiento.tsx`, `src/app/registro/gracias/page.tsx` — textos desde `src/lib/registro/textos.ts`.
- `tests/layout.test.ts` — lista blanca de hrefs derivada de las rutas reales; test de `"use client"` acotado a `layout-base`; dos tests nuevos del delta.
- `openspec/changes/.../tasks.md` — todas marcadas con nota de archivo.

### Archivos eliminados

- `src/app/registro/accion-mock.ts` y `src/lib/mock/agregar-formulario-registro.ts` (su contenido real se repartió entre `textos.ts`, `tipos.ts` y `ejemplos.ts`; los catálogos mock los reemplazó Prisma). No queda ninguna referencia a `mock` en `src/`.

## Mapa scenario → verificación (44 scenarios)

`V` = `tests/registro-validacion.test.ts`, `A` = `tests/registro-accion.test.ts`,
`P` = `tests/registro-pagina.test.ts`, `W` = `tests/whatsapp.test.ts`,
`L` = `tests/registro-limite-ip.test.ts`, `LB` = `tests/layout.test.ts`.

### registro-negocio (40)

| # | Requirement · Scenario | Verificación |
| --- | --- | --- |
| 1 | Página en una pantalla · el dueño llega al registro desde la home | `LB` "la home enlaza a /registro..." + `P` "tiene un solo h1 y un solo formulario"; header/footer del layout global comprobados en el HTML servido (curl a `/registro`: `<header>`, `<footer>`, un `h1`) |
| 2 | Página en una pantalla · mobile-first a 390px | `P` "los controles tocables reservan al menos 44px" + revisión del HTML (sin anchos fijos, `w-full`, `max-w-3xl` del layout). **Manual pendiente**: comprobación visual en navegador (ver "Deuda") |
| 3 | Campos · formulario vacío al abrir | `P` "no trae ningún campo prellenado ni mensajes de error" + `P` etiquetas literales (10 casos) |
| 4 | Campos · listas cerradas del catálogo | `P` "ofrece las 8 categorías y las 21 colonias..., más 'Otra'" (y que "Otra" va al final) |
| 5 | Campos · alta solo con obligatorios | `A` "crea el negocio en_revision/organico con solo los obligatorios"; `V` "acepta los 5 obligatorios y deja los opcionales en null" |
| 6 | Ejemplo dinámico · servicios del hogar | `V` "servicios del hogar usa el ejemplo literal del PRD" |
| 7 | Ejemplo dinámico · deporte | `V` "clubes y escuelas deportivas usa el ejemplo literal del PRD" |
| 8 | Ejemplo dinámico · cambia al cambiar de categoría sin borrar lo escrito | **Iteración 2**: `V` "el ejemplo sigue al id elegido en el select..." (`ejemploParaCategoriaElegida`, la regla completa del `onChange`) + `P` "los campos son no controlados: cambiar de categoría no borra lo escrito". **Manual pendiente**: el cambio en vivo en navegador |
| 9 | WhatsApp · variantes del mismo número | `W` (8 formatos) + `V` (3 formatos) + `A` "normaliza el WhatsApp antes de tocar la base" |
| 10 | WhatsApp · menos de 10 dígitos | `W` + `V` con el mensaje literal |
| 11 | WhatsApp · texto que no es un número | `W` ("no tengo", "771 999 45") + `V` |
| 12 | WhatsApp · normaliza aunque el navegador no valide | `A` (el `FormData` llega sin pasar por el navegador) + POST manual con `+52 771 999 7777` → fila `7719997777` |
| 13 | Validación · obligatorios vacíos | `A` "un envío vacío no guarda nada y devuelve los 5 mensajes"; foco: `P` "el orden de búsqueda del foco es el mismo que el de la pantalla" |
| 14 | Validación · "¿Qué ofreces?" demasiado largo | `V` (250 y 200 exactos) + `A` |
| 15 | Validación · Facebook con esquema no permitido | `V` (6 entradas hostiles, incluidas `javascript:` y `data:`) + `A` |
| 16 | Validación · categoría o colonia fuera del catálogo | `V` (9 casos, incluidos "abc" y "1.5") + `A` (no crea nada) |
| 17 | Validación · no se pierde lo capturado | `A` "devuelve todo lo capturado (menos el checkbox)" + `P` "vuelve a pintar todo lo capturado..." + POST manual (el HTML de respuesta trae `value="no tengo"` y el resto) |
| 18 | Una sola ficha · número ya registrado | `A` "rechaza un número que ya tiene ficha con el mensaje literal" |
| 19 | Una sola ficha · duplicado con otro formato | `A` "detecta el duplicado aunque venga con otro formato" + POST manual (`771-999-7777` contra `7719997777`) |
| 20 | Una sola ficha · carrera entre dos envíos | `A` "la unicidad de la base también se traduce al mensaje de duplicado" (consulta previa neutralizada con un Proxy; el rechazo lo produce la constraint real de SQLite) |
| 21 | Consentimiento · aviso visible sin salir del formulario | `P` "el aviso simplificado se lee dentro del formulario, con el texto literal" |
| 22 | Consentimiento · sin checkbox no hay envío | `V` + `A` "sin consentimiento no crea nada" |
| 23 | Consentimiento · constancia | `A` (el `consintioAvisoEn` guardado cae en la ventana del procesamiento) + `A` (ignora el `consintioAvisoEn` del cliente) |
| 24 | Consentimiento · sin enlaces muertos | `P` "el bloque de consentimiento no tiene ningún enlace" (ni un `href` en toda la página) + `LB` lista blanca de hrefs |
| 25 | Colonia Otra · registro con "Otra" | `V` + `A` "colonia 'Otra': guarda el texto libre sin colonia de catálogo" |
| 26 | Colonia Otra · sin texto | `V` '"Otra" sin texto libre pide el nombre de la colonia' |
| 27 | Colonia Otra · texto residual con colonia de catálogo | `V` "ignora el texto libre cuando se eligió una colonia del catálogo" |
| 28 | Envío exitoso · registro exitoso | `A` (estado, origen, sin giros, sin publicar) + `P` pantalla de gracias con el mensaje literal + POST manual (303 → `/registro/gracias`) |
| 29 | Envío exitoso · el cliente no puede autopublicarse | `A` "ignora estado, origen, publicadoEn, tokenGestion y la fecha de consentimiento del cliente" |
| 30 | Envío exitoso · recarga tras el éxito | `P` "no tiene ningún formulario que se pueda reenviar al recargar" + patrón POST-Redirect-GET verificado (303 con `Location: /registro/gracias`) |
| 31 | Envío exitoso · falla al guardar | `A` "una falla de la base da el mensaje genérico sin detalles técnicos" |
| 32 | Anti-abuso · bot que llena el honeypot | `A` "el honeypot lleno finge éxito y no guarda nada" + POST manual (303 a gracias, cero filas nuevas) |
| 33 | Anti-abuso · límite por IP | `L` (5 tests) + `A` "el cuarto alta de la misma IP en una hora se rechaza sin guardar" |
| 34 | Anti-abuso · alerta por volumen diario | `A` "deja una alerta en el log cuando las altas del día superan el umbral" (+ el caso que no alerta) |
| 35 | Anti-abuso · el honeypot no molesta a las personas | `P` "está fuera de pantalla, no es enfocable ni se anuncia" + `A` "un envío con el campo trampa vacío se procesa normal" |
| 36 | Estados · enviando | **Iteración 2**: `A` "dos envíos idénticos seguidos dejan un solo registro" (la garantía de servidor) + `P` (estado base del botón + `useFormStatus`/`disabled={pending}`/"Enviando..."). **Manual pendiente**: el doble toque real en navegador |
| 37 | Estados · errores anunciados | **Iteración 2**: `P` "elige el primer campo con error según el orden de la pantalla" (`primerCampoConError`) + `P` "asocia el mensaje al campo para los lectores de pantalla" + `P` orden del foco. **Manual pendiente**: la llamada a `.focus()` (no hay jsdom en el repo) |
| 38 | Estados · teclado numérico | `P` "el campo de WhatsApp pide teclado numérico" + HTML servido (`inputMode="numeric"`, atributo insensible a mayúsculas en HTML) |
| 39 | Sin JS · envío sin JS | **Manual, verificado**: POST multipart directo a `/registro` con los campos ocultos `$ACTION_*` que Next sirve para el envío progresivo → 303 a `/registro/gracias` y fila creada; un POST inválido devolvió 200 con el mensaje de error y los valores capturados |
| 40 | Sin JS · JS acotado al ejemplo y al botón | `P` "solo el formulario y el botón declaran 'use client'" + `P` "el envío es un `<form>` con Server Action, sin onSubmit ni fetch" |

### layout-base MODIFIED (4)

| # | Scenario | Verificación |
| --- | --- | --- |
| 41 | home provisional visible | `LB` "la home saluda con los textos literales de la spec" (ya existía) |
| 42 | entrada al registro desde la home | `LB` "la home enlaza a /registro con el texto literal..." + "usa el verde de acción y reserva al menos 44px" |
| 43 | sin rastros de la plantilla | `LB` "no queda nada de create-next-app en src/" (ya existía) |
| 44 | sin enlaces muertos | `LB` "todo href del código de interfaz apunta a una ruta existente" — ahora contra las rutas reales de `src/app` |

### Cómo se hizo la verificación manual (reproducible)

Con el sitio corriendo y `npm run db:seed` aplicado:

1. `curl -s http://localhost:3000/registro > pagina.html`
2. extraer del HTML los `<input type="hidden">` (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`) — son los que hacen funcionar el envío sin JS;
3. `curl -i -X POST http://localhost:3000/registro -H 'Origin: http://localhost:3000' -F <cada oculto> -F 'nombre=...' -F 'categoriaId=1' -F 'whatsapp=+52 771 999 7777' -F 'coloniaId=1' -F 'consentimiento=on'`.

El `<form>` servido es `action="" method="POST" encType="multipart/form-data"`, es decir un POST del navegador a la misma URL: sin JavaScript el envío funciona igual. Las filas ficticias creadas en `prisma/dev.db` durante esta prueba se borraron al terminar.

## Decisiones técnicas

1. **La acción es delgada; la lógica vive en `src/lib/registro/procesar.ts`.** Así todo el flujo (honeypot, cupo, validación, duplicado, alta, alerta) se prueba con un `FormData` y un cliente Prisma, sin montar un request de Next. `accion.ts` solo saca la IP de `await headers()` y hace `redirect` fuera de cualquier `try` (como pide la doc de esta versión).
2. **`procesarRegistro` recibe un `ClienteRegistro`, no el `PrismaClient` entero.** Es el mínimo que necesita (tres modelos, cuatro métodos) y permite envolverlo con un `Proxy` en los tests para reproducir la carrera del scenario 20 contra la constraint real.
3. **El cupo por IP cuenta solo los envíos que llegan a intentar el alta** (ya validados), no cada POST. Una errata al escribir el número no gasta cupo — de otro modo tres typos dejarían fuera a un vecino legítimo del flujo P0 del producto —, y la mitigación de enumeración de design.md §5 se conserva intacta, porque leer el mensaje de "número ya registrado" exige un envío completo y válido, que sí gasta cupo. Está documentado en el propio módulo.
4. **`/registro` es `force-dynamic`.** Lee los catálogos de la base en cada request; si fuera estática, `next build` tendría que abrir la base y en CI no hay ninguna. El costo es un render por visita en una página de baja frecuencia.
5. **El cliente Prisma se crea de forma perezosa** (en la primera consulta, no al importar el módulo) y se cachea en `globalThis` fuera de producción: `next build` no abre la base y `next dev` no acumula conexiones al recargar.
6. **Un solo molde para los mensajes de longitud.** `mensajeLimiteLongitud(200)` produce exactamente el literal de la spec "Deja esto en 200 caracteres o menos", así que los campos cuya cota no tiene texto en la spec (nombre, teléfono, dirección, horario, colonia "Otra", Facebook) reutilizan la misma redacción en vez de inventar variantes. Hay un test que ata el molde al literal.
7. **`facebookUrl` se valida parseando la URL** y exigiendo protocolo `http:`/`https:` (design.md §3), no con un regex de prefijo: eso cierra `javascript:`, `data:`, `file:` y también `//facebook.com/...`.
8. **La validación recorta espacios dos veces** (al leer el `FormData` y dentro de `validarRegistro`) para que la función no dependa de quién la llame: `"   "` nunca es un nombre de negocio válido.
9. **Se corrigió `ORDEN_CAMPOS_PARA_FOCO`** que dejó la etapa UI: ponía el consentimiento entre la colonia y "¿Qué ofreces?", cuando en pantalla va al final. Con errores en el consentimiento y en un opcional, el foco iba al campo equivocado. Un test amarra ese orden al orden real de los `id` en el HTML.
10. **`FormularioRegistro` acepta `estadoInicial` opcional.** Es el único cambio de API que pedí a la capa de UI, y existe para renderizar el estado "error por campo" en un test sin simular un envío. En la página nunca se pasa.
11. **Sin dependencias nuevas.** La validación se escribió a mano (la spec la define campo por campo con textos literales; un esquema de zod habría añadido una dependencia y una capa de traducción de mensajes sin ganar nada). No se instaló ninguna librería de test adicional.
12. **El mock de la etapa UI se eliminó entero.** Los textos literales, los tipos y los ejemplos que vivían en `src/lib/mock/` se movieron a módulos definitivos; los catálogos los da Prisma. Nada del árbol conserva la palabra "mock".

## Deuda y propuestas fuera de alcance

**Deuda que hereda este change (registrar si se acepta):**

1. **Sin proxy al frente no hay límite por IP.** `ipDeEncabezados` depende de `x-forwarded-for`/`x-real-ip`; en un `next start` pelón devuelve `null` y el cupo no aplica (el honeypot sí). En Vercel u otro hosting con proxy sí funciona. Verificarlo es parte del checklist de E0-3; está comentado en `limite-ip.ts`.
2. **El cupo vive en memoria del proceso** (aceptado en design.md §4): se pierde al reiniciar y no se comparte entre instancias.
3. **La "alerta al admin" es un `console.warn`**, con umbral `REGISTRO_UMBRAL_ALTAS_DIARIAS` (30 por defecto). El canal real llega con E3.
4. **Verificación visual pendiente** en 390/768/1280 px y del salto de foco al primer error: sin navegador ni jsdom en este entorno, ambos quedan para la revisión humana del PR. Si el equipo los quiere automatizados, hace falta decidir la herramienta (jsdom en Vitest para el foco, capturas para lo visual) — es un ticket de infraestructura de pruebas, no de este change.

**Propuestas fuera del alcance de la spec (no implementadas):**

5. **Los errores no usan color rojo** (decisión de la etapa UI, ver `a-ui.md`): la señal es `aria-invalid` + borde grueso + "⚠" + negritas. Sigue pendiente de decisión de producto/diseño; si se aprueba el rojo, hay que agregar el token a `globals.css` con su contraste anotado.
6. **Copy pendiente de visto bueno**: botón "Registrar mi negocio", los 6 ejemplos de "¿Qué ofreces?" que no son literales del PRD, y los textos de ayuda. Todos están en `ejemplos.ts` y en el componente, en un solo lugar cada uno.
7. **El campo de colonia "Otra" está siempre visible** (decisión de la etapa UI para no romper el uso sin JavaScript). Si molesta visualmente, la alternativa es mostrarlo/ocultarlo con JS aceptando que sin JS quede visible.
8. **`telefonoFijo` no se normaliza** como el WhatsApp: se guarda tal cual, con cota de 20 caracteres. La spec no lo pide (no participa en ninguna unicidad ni en enlaces `wa.me`); si el panel llega a usarlo para llamar, conviene reutilizar `normalizarWhatsapp` ahí.
9. **La consulta previa de duplicado gasta una lectura por envío válido.** Se podría dejar solo la constraint y traducir siempre el `P2002`, pero la spec pide los dos caminos y la lectura es barata en SQLite.
10. **Los catálogos se leen de la base en cada envío** para validar contra la lista cerrada. Si algún día pesa, se cachean con `cacheTag` y se invalidan al editarlos en el panel (E3); hoy sería optimización especulativa.

---

# Iteración 2 — correcciones de seguridad

Respuesta a `reports/c-seguridad.md` (1 alto, 6 medios). **Se corrigieron los
siete**, más tres de las notas menores. Ningún hallazgo se descarta.

`npm run lint`, `npm run build` y `npm test` en verde: **11 archivos, 253
tests** (218 al cerrar la etapa C → 253; ninguno se borró, ver "Tests de la
etapa C que cambiaron"). Los 42 tests adversariales siguen pasando.

## ALTO 1 — La IP del cupo ya no la elige quien envía

`src/lib/registro/limite-ip.ts`.

`ipDeEncabezados` era un `x-forwarded-for` (primer elemento) o `x-real-ip`, sin
validar nada: detrás de un proxy que antepone la IP real, o sin proxy, la clave
del cupo era una cadena que escribía el atacante. Ahora:

1. **Una sola fuente, declarada por configuración**: `REGISTRO_ENCABEZADO_IP`
   dice qué encabezado publica el proxy del hosting (`x-forwarded-for`,
   `cf-connecting-ip`, `x-real-ip`…). **Sin esa variable no se confía en ningún
   encabezado y se devuelve `null`**, con una advertencia (una sola vez por
   proceso) en el log: `REGISTRO_ENCABEZADO_IP sin configurar: el límite de
   altas por IP queda inactivo`. Es deliberadamente fail-safe: prefiero que el
   cupo no exista y se sepa, a que exista una clave que el cliente escoge —eso
   es peor que no tenerlo, porque da falsa sensación de protección.
2. **Último salto, no el primero**: se toma el último valor de la lista, que es
   el que agrega el salto más cercano (nginx/HAProxy añaden al final; los
   proxies que sobrescriben mandan un solo valor). Lo anterior de la lista lo
   puede escribir el cliente y se ignora.
3. **Forma de IP obligatoria** (`esIpValida`): IPv4 con octetos ≤255, IPv6 por
   forma, con soporte para `[::1]` y para `1.2.3.4:5678`. Cualquier otra cosa
   (`"no-es-una-ip"`, `"unknown"`, 5000 caracteres) → `null`.

Tests: `tests/registro-limite-ip.test.ts` (8 casos nuevos: sin configuración,
último salto, encabezado de un solo valor, 5 formas inválidas, IPv6 y puerto) y
el test reescrito de la suite adversarial.

**Límite que queda anotado, no resuelto** (no lo puede resolver este change):
con el encabezado bien configurado el cupo protege frente a una sola máquina,
pero quien disponga de muchas IPs reales sigue pudiendo barrer el oráculo de
números registrados que el PRD §6.1 pide exponer. Es la mitigación que
`design.md §5` aceptó como suficiente para el MVP; si el admin ve barridos, el
siguiente paso es un almacén compartido con cupo por rango, no por IP (E0-3).

## MEDIO 1 — El mapa de IPs tiene poda y techo

`src/lib/registro/limite-ip.ts`.

`registrarAlta` ahora poda el mapa completo en cada inserción (tira las IPs sin
marcas vigentes en la última hora) y respeta un techo de `MAX_IPS_RASTREADAS`
(5000), desalojando por antigüedad de uso: cada alta borra y reinserta su clave,
así que el orden del `Map` es el de uso reciente y basta desalojar por el
frente. Con las claves ya validadas como IP (ALTO 1), su tamaño también está
acotado por construcción.

Tests: dos casos nuevos en `tests/registro-limite-ip.test.ts` (20 entradas
caducadas desaparecen con un alta posterior a la ventana; con
`MAX_IPS_RASTREADAS + 50` inserciones el mapa nunca pasa del techo) y el test
adversarial reescrito.

## MEDIO 2 — La constancia de consentimiento exige una afirmación

`src/lib/registro/validacion.ts` (`casilla`).

Antes bastaba con que la clave existiera en el `FormData`; un POST crudo con
`consentimiento=` o `consentimiento=false` dejaba una constancia LFPDPPP
(`consintioAvisoEn`) de un envío que nunca afirmó consentir. Ahora se exige un
valor afirmativo (`on`, `true`, `1`, `si`, `sí`, sin distinguir mayúsculas):
`on` es lo que manda un navegador con el checkbox marcado, así que ningún
envío legítimo cambia. Aplica igual al checkbox de entregas a domicilio.

Verificado también sobre HTTP: un POST con `consentimiento=` responde 200 con
"Marca la casilla para poder registrar tu negocio" y no crea fila.

Tests: 13 casos nuevos en `tests/registro-validacion.test.ts` (6 afirmativos, 7
que no lo son) y el test adversarial reescrito, ampliado a `off` y `0`.

## MEDIO 3 — Cota en los tres campos que faltaban y eco truncado

`src/lib/registro/textos.ts`, `validacion.ts`, `procesar.ts`.

- `LIMITES_LONGITUD` incorpora `whatsapp: 30`, `categoriaId: 10` y
  `coloniaId: 10`, y el input de WhatsApp lleva `maxLength` acorde.
- Pasada la cota, el campo se rechaza **con el literal que la spec exige para
  ese campo** ("Revisa tu número de WhatsApp: deben ser 10 dígitos", "Elige una
  categoría", "Elige tu colonia"), no con el mensaje de "texto muy largo": para
  el dueño, un WhatsApp larguísimo es un número mal escrito. Así no se
  introduce ningún texto que la spec no tenga.
- `recortarParaEco` trunca cada valor a su cota antes de devolverlo al
  formulario, de modo que un POST de 100 KB ya no se refleja íntegro en la
  respuesta. Solo se recorta lo que ya excedía el máximo (y por tanto vuelve
  con su mensaje de error al lado); un envío legítimo no pierde ni un carácter,
  lo que cubre el scenario "no se pierde lo capturado".

Tests: cuatro casos nuevos en `tests/registro-validacion.test.ts` (cota de los
tres campos, truncado del eco, y que un envío legítimo pasa intacto) y el test
adversarial reescrito, que ahora manda los 100 KB en los tres campos a la vez.

## MEDIO 4 — `facebookUrl` se guarda normalizada y sin credenciales

`src/lib/registro/validacion.ts` (`urlHttpNormalizada`).

- Se persiste `url.href`, no la cadena cruda: el homógrafo
  `https://facebоok.com/...` queda guardado como
  `https://xn--facebok-ejg.com/...`, o sea que el engaño es **visible** para
  quien lo pinte (ficha pública, panel) en vez de pasar por Facebook.
- Se rechazan las URLs con credenciales incrustadas
  (`https://facebook.com@evil.example/perfil`, `usuario:clave@...`), que son
  phishing puro: el host real es el de después de la arroba. Reutilizo el
  literal de error de la spec para ese campo en vez de inventar un texto nuevo.
- El dominio sigue sin restringirse (`design.md §3`), así que queda anotado
  como **requisito para el ticket que pinte este campo**: `rel="noopener
  noreferrer"` y una etiqueta que no prometa que el enlace lleva a Facebook.

Tests: tres casos nuevos en `tests/registro-validacion.test.ts` y el bloque
adversarial reescrito (uno de rechazo, tres de guardado normalizado).

## MEDIO 5 — `.env.example` documenta las dos variables

`.env.example` gana `REGISTRO_ENCABEZADO_IP` (con el aviso, en mayúsculas, de
que sin ella el límite por IP no se aplica, y ejemplos por hosting) y
`REGISTRO_UMBRAL_ALTAS_DIARIAS` (número, 30 por defecto). Ambas comentadas: son
opcionales y no llevan secretos.

## MEDIO 6 — Scenarios 8, 36 y 37 con test automatizado

Sin instalar nada, extrayendo a funciones puras la decisión que antes solo
existía dentro del componente de cliente:

| # | Scenario | Qué se automatizó |
| --- | --- | --- |
| 8 | el ejemplo cambia al cambiar de categoría | `ejemploParaCategoriaElegida(categorias, categoriaId)` en `src/lib/registro/ejemplos.ts` es ahora la regla completa que ejecuta el `onChange`; el test comprueba hogar → deporte → sin elegir → id inexistente. El componente solo guarda el `value` y llama aquí |
| 36 | tocar dos veces no crea dos registros | el botón deshabilitado es la primera línea, pero la garantía real es del servidor: test "dos envíos idénticos seguidos dejan un solo registro" en `tests/registro-accion.test.ts` |
| 37 | el foco va al primer campo con error | `primerCampoConError(errores)` exportada desde el formulario y probada con cuatro casos (incluido que `general` no roba el foco); el `useEffect` solo llama `.focus()` |

Lo que sigue necesitando navegador y queda declarado como verificación manual:
el `.focus()` efectivo, el doble toque real sobre el botón, la revisión visual a
390/768/1280 px y el envío sin JavaScript (este último verificado a mano con
`curl`, procedimiento documentado en la iteración 1 y repetido tras estos
cambios: 303 a `/registro/gracias`, fila creada con el número normalizado).
Coincido con la recomendación de la etapa C: **ticket de infraestructura de
pruebas (jsdom en Vitest) antes de E3**, que traerá más formularios.

## Notas menores atendidas

- **`Object.hasOwn` en `ejemplos.ts`**: `ejemploQueOfreces("constructor")` ya no
  devuelve una función heredada de `Object.prototype`, sino el ejemplo genérico.
- **Test de `"use client"` por exclusión**: `tests/layout.test.ts` ya no lleva
  una lista fija de seis archivos; barre todo `src/` menos `src/app/registro` y
  `src/components/registro`, así que un archivo nuevo de `layout-base` entra
  solo a la vigilancia.
- **`.env.example`** (MEDIO 5) también responde a la nota de configuración.

## Notas menores que NO cambio, con su razón

- **Campo trampa recortado antes de comparar** (un bot que rellena todo con
  espacios no la dispara): lo dejo igual a propósito. Disparar la trampa con
  espacios en blanco significa **descartar en silencio** el registro de un
  vecino si algún día un autocompletado o un teclado móvil mete un espacio en un
  campo que la persona nunca ve; ese falso positivo no deja rastro para el
  usuario (ve la pantalla de gracias) y cuesta una alta real del flujo P0. Un
  bot que sí llena con espacios acaba creando una ficha que el admin filtra en
  la revisión manual (PRD §6.3), que es el control previsto. Queda como
  comportamiento documentado por el test de la etapa C.
- **`replace(/\D/g,"")` acepta `"<script>7719992022</script>"` como número**:
  lo guardado son siempre los 10 dígitos, así que no hay riesgo; endurecerlo
  (rechazar entradas con letras) cambia el comportamiento que la spec describe
  ("descarta espacios, guiones, puntos y paréntesis") y podría rechazar cosas
  como "771 999 2022 (casa)". Propuesta para el PR, no corrección silenciosa.
- **Cotas en unidades UTF-16** (120 emojis = 240 unidades): cambiar a
  `[...texto].length` altera qué envíos se aceptan justo en el borde; es una
  decisión de producto sobre el texto del mensaje, no un problema de seguridad.
  Queda como propuesta.
- **El cupo se gasta antes de comprobar el duplicado**: es intencional y está
  documentado en `limite-ip.ts`. Si el duplicado no gastara cupo, el barrido de
  números volvería a ser gratis, que es justo lo que `design.md §5` quiere
  acotar. El costo (un vecino que se registra dos veces por error gasta 2 de 3)
  es aceptable frente a eso.

## Tests de la etapa C que cambiaron (y por qué)

Seis tests de `tests/registro-adversarial.test.ts` describían, marcados como
`CARACTERIZACIÓN:`, comportamientos que ahora están corregidos; la propia
cabecera del archivo dice que deben actualizarse cuando el dev corrija. Se
conservaron los datos, los payloads y la intención de cada uno: cambia lo que
se espera, no lo que se prueba.

| Test | Antes | Ahora |
| --- | --- | --- |
| `el WhatsApp no tiene cota…` | el eco devolvía 100 KB | eco truncado a la cota en los tres campos (MEDIO 3) |
| `acepta y guarda tal cual un link…` (4 casos) | se guardaba la cadena cruda | 1 test de rechazo (credenciales) + 3 de guardado normalizado (MEDIO 4) |
| `la IP sale de un encabezado que el cliente puede escribir` | devolvía lo que mandó el cliente | `null` sin configuración; último salto validado con ella (ALTO 1) |
| `basta con que el campo de consentimiento exista…` | creaba ficha y constancia | rechaza los 5 valores no afirmativos + test nuevo de que `on` sí consiente (MEDIO 2) |
| `el mapa de IPs crece sin cota…` | ninguna entrada se liberaba | se comprueba el cupo por IP y que las caducadas se purgan solas (MEDIO 1) |
| `el mapa de ejemplos responde a claves heredadas…` | devolvía una función | devuelve el ejemplo genérico (nota menor) |

Además se renombró `rotar x-forwarded-for anula el cupo…` (ya no se consigue
falsificando el encabezado): conserva las mismas aserciones, porque describen
algo que sigue siendo cierto —cada IP distinta tiene su propio cupo— y ahora
documenta el límite real de la mitigación, no un agujero.

## Archivos tocados en esta iteración

- `src/lib/registro/limite-ip.ts` (ALTO 1, MEDIO 1)
- `src/lib/registro/validacion.ts` (MEDIO 2, 3, 4)
- `src/lib/registro/textos.ts` (MEDIO 3)
- `src/lib/registro/procesar.ts` (MEDIO 3: eco truncado)
- `src/lib/registro/ejemplos.ts` (MEDIO 6, nota menor)
- `src/components/registro/formulario-registro.tsx` (MEDIO 3 y 6: `maxLength`
  del WhatsApp, `primerCampoConError`, `ejemploParaCategoriaElegida`)
- `.env.example` (MEDIO 5)
- `tests/registro-limite-ip.test.ts`, `tests/registro-validacion.test.ts`,
  `tests/registro-accion.test.ts`, `tests/registro-pagina.test.ts` (cobertura
  nueva), `tests/layout.test.ts` (nota menor),
  `tests/registro-adversarial.test.ts` (los seis tests de arriba)
