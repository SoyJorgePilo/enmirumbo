# Tareas: agregar-analitica-cookieless

Orden por dependencia. Cada tarea se puede terminar y comprobar sola. El dev trabaja en TDD: donde la tarea es un test, va primero (rojo) y la siguiente lo pone en verde.

## Configuración fail-safe (nada funciona hasta que esto es seguro)

- [x] 1. Test `tests/analitica-config.test.ts`: `configuracionAnalitica()` devuelve `null` si falta cualquiera de las dos variables, si vienen vacías o de puros espacios, o si `NEXT_PUBLIC_UMAMI_SRC` no es una URL absoluta con esquema `https:`; devuelve `{ src, websiteId }` solo con las dos válidas; y con la configuración a medias deja **una sola** advertencia en el log por proceso (dos llamadas seguidas = una advertencia).
- [x] 2. Crear `src/lib/analitica/config.ts` que satisfaga ese test, con la misma disciplina que `src/lib/admin/config.ts`. Leer las variables con la expresión literal `process.env.NEXT_PUBLIC_UMAMI_SRC` / `process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID` (nunca con acceso dinámico: Next las sustituye por texto en el build; ver `design.md` §2).

## Componente del script

- [x] 3. Test `tests/analitica-script.test.ts`: sin configuración, el componente no pinta nada (`""` de marcado); con configuración, pinta **exactamente una** etiqueta `<script>` con `defer`, el `src` configurado, el identificador del sitio y la opción que excluye la cadena de consulta.
- [x] 4. Crear `src/components/analitica/script-analitica.tsx` (Server Component, sin `"use client"`) que lo cumpla. Confirmar contra la documentación del tracker de Umami Cloud el nombre exacto del atributo que excluye la cadena de consulta (`data-exclude-search`) y dejarlo anotado en el comentario del archivo (`design.md` §3).

## Grupo de rutas público (así se excluye `/admin` por construcción)

- [x] 5. Ajustar `rutasExistentes` en `tests/layout.test.ts` para que ignore las carpetas de grupo entre paréntesis al armar la ruta (hoy `(publico)/terminos/page.tsx` se leería como `/(publico)/terminos`), y la comprobación de `tests/directorio-consultas.test.ts` que exige que toda carpeta de `src/app` esté en `SEGMENTOS_RESERVADOS` (un grupo no es un segmento de URL). Con las carpetas todavía sin mover, la suite sigue verde.
- [x] 6. Mover a `src/app/(publico)/` las rutas públicas —`page.tsx`, `[categoria]/`, `negocio/`, `buscar/`, `registro/`, `aviso-de-privacidad/`, `terminos/`— sin tocar su contenido. `src/app/layout.tsx`, `not-found.tsx` y `admin/` se quedan donde están. Comprobar con `npm run build` que la lista de rutas generadas es idéntica a la de antes (ninguna URL cambia) y que la suite completa sigue verde.
- [x] 7. Crear `src/app/(publico)/layout.tsx`: Server Component mínimo que renderiza `{children}` y `<ScriptAnalitica />`, sin `<html>`, `<body>`, header ni footer (esos siguen en el layout raíz).
- [x] 8. Test `tests/analitica-exclusion-admin.test.ts`: con la configuración puesta, el marcado del layout público trae el script y el de las páginas de `/admin` (acceso, cola, detalle, aprobado, rechazado) no trae ni script ni ningún atributo `data-umami-*`; además, ninguna carpeta de página bajo `src/app/admin` vive dentro del grupo `(publico)` (comprobación estructural sobre el árbol de archivos).

## Contrato de eventos (fuente única)

- [x] 9. Test `tests/analitica-eventos.test.ts`: los cuatro nombres de evento son `whatsapp-tarjeta`, `whatsapp-ficha`, `llamar` y `como-llegar`; el armado de atributos devuelve exactamente dos propiedades (`categoria` y `colonia`); `colonia` vale el slug del catálogo cuando lo hay y `otra` cuando el negocio tiene texto libre o no tiene colonia; todos los valores casan con `[a-z0-9-]+`.
- [x] 10. Crear `src/lib/analitica/eventos.ts` con los nombres y el armado de atributos (`design.md` §3). Es el único lugar del código donde se escribe el prefijo `data-umami-event`.

## La categoría del negocio llega hasta la tarjeta

- [x] 11. Test en `tests/directorio-consultas.test.ts`: `NegocioListado` y `NegocioFicha` traen el `slug` de la categoría del negocio, en el listado, en la búsqueda y en la ficha; la proyección sigue sin exponer `estado`, `origen`, `registradoEn`, `consintioAvisoEn`, `tokenGestion` ni coordenadas.
- [x] 12. Sumar `categoria: { select: { slug: true } }` a `CAMPOS_LISTADO` en `src/lib/directorio.ts` y mapearlo a `categoriaSlug` en `aListado`.

## Eventos en el directorio público

- [x] 13. Test de la tarjeta (`tests/directorio-paginas.test.ts` o suite propia): el botón de WhatsApp de la tarjeta lleva el evento `whatsapp-tarjeta` con `categoria` y `colonia`; en la página de resultados la `categoria` es la del negocio, no una de la página; con un negocio de colonia "Otra", `colonia` vale `otra`.
- [x] 14. Pasar `categoriaSlug` y `coloniaSlug` a `TarjetaNegocio` desde el listado y desde `/buscar`, y aplicar los atributos del contrato en su botón de WhatsApp (`src/components/directorio/tarjeta-negocio.tsx`).
- [x] 15. Test de la ficha: "Enviar WhatsApp" lleva `whatsapp-ficha`, "Llamar" lleva `llamar` y "Cómo llegar" lleva `como-llegar`, los tres con `categoria` y `colonia`; el enlace a la página registrada **no** lleva ningún atributo de evento; los botones que no aplican siguen sin renderizarse.
- [x] 16. Aplicar los atributos en `src/components/directorio/botones-contacto.tsx`, recibiendo los slugs desde `src/app/(publico)/negocio/[ficha]/page.tsx`.

## Privacidad de la medición (el gate que no se negocia)

- [x] 17. Test adversarial `tests/analitica-privacidad.test.ts`, sobre el HTML servido de un listado, la página de resultados y la ficha de un negocio sembrado con nombre, WhatsApp, teléfono, dirección, horario y colonia "Otra" con texto libre: ningún atributo `data-umami-event-*` contiene ninguno de esos valores ni el identificador del negocio; las únicas propiedades presentes son `categoria` y `colonia`; ningún valor de propiedad tiene espacios, acentos ni signos.
- [x] 18. Test en la misma suite: sin configuración, ninguna página pública trae etiqueta `<script>` externa ni referencia al dominio del proveedor, y los atributos `data-*` siguen presentes sin cambiar el `href` ni el comportamiento de los botones.
- [x] 19. Test del registro (`tests/registro-pagina.test.ts`): el botón "Enviar" no lleva ningún atributo de evento, la página de gracias tampoco, y ninguna de las dos pantallas agrega JavaScript de cliente.

## Documentación y decisión

- [x] 20. Agregar a `.env.example` el bloque de analítica: `NEXT_PUBLIC_UMAMI_SRC` (valor típico `https://cloud.umami.is/script.js`) y `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, con el enlace para crear la cuenta gratuita (https://cloud.umami.is), la nota de que **no son secretos** (viajan en el HTML), la de que se inyectan en el build (cambiarlas exige redesplegar), la de que sin ellas el sitio funciona igual sin medir nada, y el recordatorio de verificar en el panel del proveedor que el filtrado de bots está activo.
- [x] 21. Test de `.env.example` (junto a los que ya revisan variables en `tests/admin-config.test.ts` o suite propia): el archivo menciona las dos variables y el enlace de la cuenta, y no trae ningún valor real pegado (las líneas están comentadas).
- [x] 22. Actualizar `docs/decisiones/ADR-005-analitica.md`: pasa de "propuesta — se decide al ejecutar E7" a decidida, citando este change y la fecha; conservar la nota de revisión (verificar los límites del plan gratuito con números reales).

## Cierre

- [x] 23. Confirmar con `npm run build` que ningún archivo nuevo declara `"use client"`, que el tamaño del bundle de cliente no crece sin configuración y que las páginas públicas se ven completas con el JavaScript deshabilitado.
- [x] 24. `npm run lint`, `npm run build` y `npm test` en verde.
## Iteración 2 — correcciones de la auditoría (etapa C: 1 alto, 4 medios)

Tareas que no estaban en el plan original: salen de `reports/c-seguridad.md`. El detalle, con las mediciones, está en `reports/b-dev.md` §"Iteración 2".

- [x] 26. (A-1, alto) Cortar el referente del panel: `src/app/admin/layout.tsx` con `referrer: "no-referrer"`, que emite `<meta name="referrer" content="no-referrer">` en el `<head>` de las seis pantallas. Test de la política en todas ellas + verificación del HTML servido con sesión firmada y del efecto en un navegador real.
- [x] 27. (M-2) Título estático en `/buscar` (`Buscar — NecesitoUno Tizayuca`): el tracker manda `document.title`, así que un título con el término del vecino esquivaría `data-exclude-search`. Guardián actualizado y la interacción con T-009 documentada en el código y en ADR-005.
- [x] 28. (M-1) Diagnóstico corregido y medido de nuevo (el nodo lo inserta React al hidratar; no se ejecuta ni manda nada). Tests que fijan lo que sí es nuestro: la 404 vive fuera del grupo y nadie puede meter un `not-found.tsx` dentro; canario de versiones de React/Next.
- [x] 29. (M-3) Modelo de confianza y deuda de CSP escritos donde sobreviven al merge: `.env.example` y ADR-005, con **los dos** dominios (`script-src cloud.umami.is` y `connect-src gateway.umami.is`). Tests que exigen que ambos archivos lo digan.
- [x] 30. (M-4) Medido el secuestro del clic de "Llamar" (3.0 s de retraso con 3 s de latencia del proveedor) y mitigado: el evento va en una envoltura, no en el enlace. Test que prohíbe instrumentar un enlace que no abre pestaña nueva.

## Iteración 3 — A-2 de la re-auditoría (el arreglo de A-1 rompía el panel sin JS)

- [x] 31. (A-2, alto) Cambiar el valor de la política del panel a `strict-origin` (oculta la ruta **y** conserva el `Origin`, del que dependen las Server Actions sin JavaScript) y alinear los cuatro sitios que fijaban el literal: layout del panel, test (invariante en vez de cadena), enmienda del delta (por intención) y ADR-005 (para que T-013 no copie el valor roto a una cabecera). Verificado contra servidor real: acceso sin JS → 303 + cookie; navegación panel→público → referente sin ruta.
- [x] 32. (O-1) Ruta comodín `src/app/admin/[...resto]/page.tsx` para que las URLs inexistentes de `/admin` —que también llevan identificador de registro— respondan 404 bajo la misma política. Sin leer ni escribir nada y con la misma respuesta de antes.

## Cierre (continuación)

- [ ] 25. (pendiente a propósito: es del humano, después del merge) **Pasos humanos, después del merge** (no bloquean el PR): crear la cuenta en el proveedor, dar de alta el sitio, pegar las dos variables en el entorno de producción y redesplegar; verificar en el panel que llegan visitas y los cuatro eventos, que `/admin` no aparece en ninguna ruta medida, que el filtrado de bots está activo y que el plan gratuito aguanta el volumen previsto (300 visitas/semana + eventos, la revisión que pide ADR-005).
