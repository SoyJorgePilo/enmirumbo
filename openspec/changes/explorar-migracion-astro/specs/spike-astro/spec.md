# Delta: spike-astro

> Capacidad temporal del spike de ADR-013 (Fase 0). **No se consolida a `openspec/specs/` al archivar** (ver `proposal.md`). Todo lo de abajo ocurre en `spikes/astro/` y en su preview de Vercel; ningún comportamiento de producción cambia.

## ADDED Requirements

### Requirement: El spike vive aislado de la app y de producción

La mini-app del spike DEBE vivir completa en `spikes/astro/` y desplegarse en un preview de Vercel de un proyecto distinto al de producción. NO DEBE modificar nada bajo `src/`, el `package.json` raíz, el CI, `vercel.json` ni el despliegue o la base de producción; los únicos cambios permitidos fuera de `spikes/` son excluir ese directorio de la compilación de tipos y del lint de la app, y los documentos de decisión. El build, las pruebas y el lint de la app DEBEN quedar exactamente como estaban. Ninguna credencial (URL de la base, secreto de la cookie, tokens de Vercel) DEBE quedar en el repo: viven en variables de entorno del proyecto del spike. Los datos que el spike muestra DEBEN ser ficticios.

#### Scenario: el spike tiene su propio preview

- **WHEN** alguien abre la URL del preview del spike
- **THEN** ve las páginas del spike servidas por Astro, y el sitio de producción sigue sirviendo la app de Next sin ningún cambio

#### Scenario: la app no se entera del spike

- **WHEN** se corren en la raíz el build, la suite de pruebas y el lint, igual que en el CI
- **THEN** pasan igual que antes del spike, sin compilar ni analizar ningún archivo de `spikes/`

#### Scenario: nada sensible en el repo

- **WHEN** se revisa el diff del change
- **THEN** no hay cambios en `src/`, `package.json` raíz, `.github/`, ni `vercel.json`, y no aparece ninguna credencial, URL de base real, ni nombre o WhatsApp de un negocio real

### Requirement: El formulario del spike funciona sin JavaScript

El spike DEBE tener una página con un formulario HTML `method="POST"` que invoca una Astro Action con entrada de formulario, servida con la `Referrer-Policy` más estricta que hoy usan gestión y admin (`strict-origin`). Con el JavaScript del navegador apagado, un envío válido DEBE procesarse en el servidor y responder con una redirección a una página de confirmación (POST/Redirect/GET), de modo que recargar la confirmación no reenvía el formulario. Un envío inválido DEBE volver a la página del formulario con el mensaje de error en español, sin pasar el texto del usuario por la URL. Ningún envío nativo DEBE salir con `Origin: null` ni recibir un 500 (la regresión de T-010 y T-014).

#### Scenario: envío válido sin JavaScript

- **WHEN** el vecino, con el JavaScript apagado, elige un motivo y toca "Enviar reporte"
- **THEN** el servidor procesa el envío, responde con una redirección y el navegador termina en la página de confirmación con una petición `GET`

#### Scenario: recargar la confirmación no reenvía

- **WHEN** el vecino recarga la página de confirmación
- **THEN** el navegador no ofrece reenviar el formulario y el servidor no procesa un segundo envío

#### Scenario: error de validación sin JavaScript

- **WHEN** el vecino, con el JavaScript apagado, toca "Enviar reporte" sin elegir motivo
- **THEN** vuelve a la página del formulario y ve el texto "Dinos qué pasa con este negocio", y la URL no lleva nada de lo que escribió

#### Scenario: sin Origin nulo ni 500

- **WHEN** se envía el formulario de forma nativa desde la página con `Referrer-Policy: strict-origin`, con el JavaScript apagado, en Chrome y en Firefox
- **THEN** la petición sale con el `Origin` del propio sitio (no `null`) y ninguna respuesta del flujo es un 500

### Requirement: La sesión del spike viaja en una cookie firmada leída en middleware

El spike DEBE emitir, desde una acción del servidor, una cookie de sesión firmada con un secreto de entorno, marcada `HttpOnly`, `SameSite` y `Secure` (el preview es HTTPS). El middleware DEBE leer y verificar esa cookie en cada petición a una ruta protegida: con una cookie válida la ruta responde 200; sin cookie, con una cookie alterada o con una firma inválida, DEBE responder 307 hacia la página de acceso del spike, sin mostrar contenido protegido. Si el secreto no está configurado, el spike DEBE fallar a la vista en vez de emitir cookies sin firma (PRD v2 §2.5).

#### Scenario: la cookie se emite con sus atributos

- **WHEN** alguien entra por la página de acceso del spike
- **THEN** la respuesta trae una cookie de sesión con `HttpOnly`, `SameSite` y `Secure`, cuyo valor va firmado

#### Scenario: con cookie válida, la ruta protegida abre

- **WHEN** alguien con la cookie recién emitida pide la ruta protegida
- **THEN** recibe 200 con el contenido protegido

#### Scenario: sin cookie, 307

- **WHEN** alguien pide la ruta protegida sin cookie
- **THEN** recibe 307 hacia la página de acceso y ningún contenido protegido aparece en la respuesta

#### Scenario: cookie alterada, 307

- **WHEN** alguien pide la ruta protegida con la cookie de sesión modificada a mano
- **THEN** recibe 307 hacia la página de acceso, igual que sin cookie

#### Scenario: sin secreto, falla a la vista

- **WHEN** el spike corre sin la variable del secreto de sesión
- **THEN** el acceso responde con un error visible y no emite ninguna cookie

### Requirement: El spike sirve las mismas cabeceras de seguridad que producción

Toda respuesta del spike —páginas renderizadas por petición, páginas prerenderizadas, la redirección del formulario, el 307 de la sesión y el 404— DEBE llevar exactamente las cabeceras y valores que hoy produce `cabecerasDeSeguridad()` de `src/lib/seguridad/csp.ts` (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), salvo la página del formulario, donde `Referrer-Policy` es `strict-origin`. La CSP DEBE ser la misma política, sin `nonce`. Una página que renderiza en servidor un componente React existente de `src/components/` DEBE cargar sin ninguna violación de CSP en la consola del navegador.

#### Scenario: cabeceras en todas las respuestas

- **WHEN** se piden al preview una página dinámica, una prerenderizada, la ruta protegida sin cookie, una ruta inexistente y el envío del formulario
- **THEN** cada respuesta trae las cuatro cabeceras con los mismos valores que `cabecerasDeSeguridad()`, salvo `Referrer-Policy: strict-origin` en la página del formulario

#### Scenario: la CSP no lleva nonce

- **WHEN** se lee la cabecera `Content-Security-Policy` de cualquier página del spike
- **THEN** es idéntica a `politicaDeSeguridadDeContenido()` y no contiene `nonce-`

#### Scenario: componente React sin violaciones

- **WHEN** se abre en Chrome la página que renderiza un componente React de `src/components/`, con la consola abierta
- **THEN** el componente se ve completo y la consola no muestra ninguna violación de Content-Security-Policy

### Requirement: El spike lee de PostgreSQL con TLS verificado

Una página del spike DEBE leer datos con Prisma de una base PostgreSQL desechable —nunca la de producción— conectando con `sslmode=verify-full` y validando contra el certificado de Supabase empaquetado en la función del preview mediante `includeFiles` del adaptador de Vercel. Los datos sembrados DEBEN ser ficticios. Si la conexión no puede verificarse o falta la configuración, la página DEBE fallar a la vista, sin inventar datos ni caer a una conexión sin verificar (PRD v2 §2.5).

#### Scenario: la página muestra datos de la base desechable

- **WHEN** alguien abre la página de lectura del spike en el preview
- **THEN** ve los negocios ficticios sembrados en la base desechable

#### Scenario: el certificado viaja con la función

- **WHEN** se inspecciona la salida del build del adaptador de Vercel
- **THEN** el certificado de Supabase está incluido junto a la función que atiende la página de lectura

#### Scenario: sin verificación, no hay datos

- **WHEN** la página de lectura corre sin el certificado o sin la URL de la base
- **THEN** responde con un error visible y no muestra ningún dato

### Requirement: El spike no es más lento que la portada actual

Las páginas del spike sin formulario interactivo DEBEN entregar 0 KB de JavaScript propio (sin contar el de terceros declarado en la CSP). La página de lectura del spike DEBE obtener en Lighthouse móvil una puntuación de rendimiento mayor o igual a la de la portada actual de producción, medidas las dos en la misma corrida y con la misma configuración.

#### Scenario: cero JS propio

- **WHEN** se carga en el preview cualquier página del spike sin formulario interactivo
- **THEN** la pestaña de red no muestra ningún archivo JavaScript servido por el propio sitio

#### Scenario: Lighthouse no baja

- **WHEN** se corre Lighthouse móvil sobre la página de lectura del spike y sobre la portada de producción
- **THEN** la puntuación de rendimiento del spike es mayor o igual a la de la portada (hoy 100)

### Requirement: El spike termina en un reporte de veredicto

El spike DEBE entregar `docs/decisiones/ADR-013-spike.md` con, para cada uno de los cinco puntos (formulario sin JS, sesión, cabeceras y CSP, base, rendimiento), un veredicto "pasa", "falla" o "pasa con costo", la evidencia que lo sostiene (cabeceras capturadas, códigos de respuesta, capturas de consola y de Lighthouse, salida del build) y, en "pasa con costo", cuál es el costo. El reporte DEBE cerrar con una recomendación go/no-go. Si algún punto falla, ADR-013 DEBE pasar a estado `rechazada` con el porqué y su fila en `docs/decisiones/README.md` DEBE reflejarlo.

#### Scenario: un veredicto por punto

- **WHEN** alguien abre `docs/decisiones/ADR-013-spike.md`
- **THEN** encuentra los cinco puntos, cada uno con su veredicto, su evidencia y, si aplica, su costo, y una recomendación go/no-go al final

#### Scenario: un punto falla

- **WHEN** el reporte marca al menos un punto como "falla"
- **THEN** ADR-013 queda en estado `rechazada` con la referencia al reporte, y el índice de decisiones lo muestra así

#### Scenario: todos pasan

- **WHEN** ningún punto falla
- **THEN** el reporte recomienda go o no-go con sus costos, y el estado de ADR-013 queda como está, en espera del porqué del fundador
