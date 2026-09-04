# Propuesta: agregar-analitica-cookieless

**Ticket:** `docs/tickets/T-010-analitica.md` (E7-1; P0)
**PRD:** §9 ("Instrumentar analítica desde el día 1 con proveedor cookieless (sin banner de cookies…) y eventos definidos: formulario iniciado, formulario enviado, vista de ficha, clic a WhatsApp, clic a llamar, clic a cómo llegar. Los conteos excluyen bots y crawlers"), §10 (los umbrales que deciden el destino del MVP: clics a WhatsApp / vistas de ficha, % de registros completados, visitantes únicos semanales), §8 (meta de <2s en 4G y LFPDPPP)
**Decisión técnica:** `docs/decisiones/ADR-005-analitica.md` (Umami Cloud primero, migrar a Plausible si aprietan los límites)

## Por qué

El directorio ya está completo de punta a punta (registro, listados, ficha, buscador, panel) pero no mide nada: hoy no podríamos responder ninguna de las seis filas del PRD §10, que son las que deciden si el MVP sigue o cambia de rumbo. El PRD §9 pide la analítica "desde el día 1" y el ticket exige que la implementación sea **fail-safe**: sin llaves configuradas no se carga nada, no se pide nada a ningún dominio externo y el sitio funciona exactamente igual, para que el humano cree la cuenta y pegue las variables cuando quiera, sin bloquear el despliegue.

## Qué cambia

- **Script de medición condicional**: el sitio carga un único script externo (el del proveedor cookieless de ADR-005) **solo** si están las dos variables `NEXT_PUBLIC_UMAMI_SRC` y `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, y solo si la primera es una URL absoluta `https://`. Sin ellas: cero etiquetas `<script>`, cero peticiones externas, cero bytes de JavaScript, y una advertencia en el log únicamente cuando la configuración está a medias.
- **Cero banner**: por ser cookieless, ninguna pantalla suma aviso, banner ni interruptor de consentimiento (PRD §9, principio rector de fricción cero).
- **`/admin` fuera de la medición**: ninguna página del panel carga el script ni manda nada. No es solo higiene de métricas: las URLs del panel (`/admin/registros/<id>`) apuntan a un registro concreto de una persona y no tienen por qué llegar a un tercero (PRD §8, LFPDPPP). Para lograrlo por construcción y no por disciplina, las rutas públicas pasan a un grupo de rutas `(publico)` cuyo layout es el único que inyecta el script (ver `design.md` §1); las URLs no cambian.
- **Eventos con atributos `data-*`, sin JavaScript propio** (los Server Components pueden llevarlos): `whatsapp-tarjeta`, `whatsapp-ficha`, `llamar` y `como-llegar`, cada uno con dos propiedades y nada más: `categoria` y `colonia`, siempre slugs del catálogo.
- **El embudo del registro se mide con vistas de página**: `/registro` es "formulario iniciado" y `/registro/gracias` es "formulario enviado" (proxy de conversión del PRD §10, ">70% de registros completados"). No se instrumenta el botón "Enviar" porque un clic con errores de validación no es un registro.
- **Las vistas de ficha las cuenta el proveedor solo** (pageview), que es el denominador de la métrica "clics a WhatsApp / vistas de ficha".
- **Cero datos personales en la medición**: ni nombre de negocio, ni WhatsApp, ni teléfono, ni dirección, ni el texto libre de colonia. Cuando la colonia no es del catálogo (caso "Otra"), la propiedad vale `otra`. Además se excluye la **cadena de consulta** de las URLs medidas, porque `/buscar?q=…` lleva texto que escribió el vecino.
- **Presupuesto de peso**: un solo script, diferido, sin gestor de etiquetas y sin `"use client"` en ningún archivo nuevo.
- **`.env.example`** documenta las dos variables, el link para crear la cuenta, el valor típico del script, que se inyectan en tiempo de build (cambiarlas exige redesplegar) y que sin ellas el sitio corre igual, sin medir.

## Capacidades afectadas

- `layout-base` (ADDED + MODIFIED): reglas globales de la medición — carga condicional y fail-safe, exclusión de `/admin`, contrato de eventos y regla de cero datos personales, presupuesto de peso, exclusión de bots y documentación en `.env.example`. Se modifica el requirement del layout como Server Component para dejar declarada la única excepción a "sin JavaScript de cliente".
- `directorio-publico` (MODIFIED + ADDED): la tarjeta del listado y los botones de la ficha suman los atributos de evento con `categoria` y `colonia`; se declara que la vista de ficha se mide sola.
- `registro-negocio` (ADDED): el embudo del registro se mide con las vistas de sus dos pantallas, sin instrumentar el botón ni dejar viajar ningún dato del formulario.

## Impacto en código (alto nivel)

- Módulo nuevo `src/lib/analitica/config.ts` (lectura y validación fail-safe de las dos variables, con la misma disciplina que `src/lib/admin/config.ts`) y `src/lib/analitica/eventos.ts` (nombres de evento y armado de las propiedades `categoria`/`colonia`: fuente única del contrato).
- Componente nuevo `src/components/analitica/script-analitica.tsx` (Server Component; devuelve `null` sin configuración).
- Grupo de rutas `src/app/(publico)/` con su `layout.tsx`: mudanza sin cambio de URL de `page.tsx`, `[categoria]/`, `negocio/`, `buscar/`, `registro/`, `aviso-de-privacidad/` y `terminos/`. `src/app/layout.tsx`, `not-found.tsx` y `admin/` se quedan fuera.
- `src/lib/directorio.ts`: la proyección del listado suma el `slug` de la categoría del negocio (hoy no se lee), para que la propiedad `categoria` sea correcta también en `/buscar`, donde los resultados son de categorías mezcladas.
- `src/components/directorio/tarjeta-negocio.tsx` y `botones-contacto.tsx`: atributos `data-*` en los botones.
- `tests/layout.test.ts` y `tests/directorio-consultas.test.ts`: sus dos helpers que recorren `src/app` deben ignorar las carpetas de grupo entre paréntesis (hoy `(publico)` se leería como un segmento de URL y como una ruta no reservada).
- Suites nuevas: configuración fail-safe, render del script, contrato de eventos, exclusión de `/admin` y adversarial de privacidad (ningún dato del negocio dentro de un atributo `data-umami-event-*`).
- `.env.example` y `docs/decisiones/ADR-005-analitica.md` (pasa de "propuesta" a decidida al ejecutarse E7).
- **Sin dependencias nuevas, sin migración de base de datos.**

## Fuera de este change

- **Vista propia de métricas contra los umbrales del §10 (E7-2)**: al inicio se usa la UI del proveedor, como permite el backlog.
- **Contadores en base propia**: la analítica es para decidir, no es registro contable (ADR-005).
- **"Altas aprobadas" como evento**: E7-1 lo menciona, pero la aprobación ocurre en `/admin`, que queda excluido a propósito. Ese número sale de la base (una consulta del panel), no del proveedor. Si se quiere en el mismo tablero, es otro ticket.
- **Analítica de términos buscados**: excluir la cadena de consulta la apaga de raíz. Saber qué busca la gente y no encuentra es valioso para la siembra del PRD §9, pero tiene su propia conversación de privacidad y su propio ticket.
- **Evento del enlace "Ver su página"** y de los enlaces del footer: el PRD §9 no los lista.
- **Medición de la página 404** (queda fuera del grupo público) y de los legales que sí quedan dentro sin instrumentación propia.
- **Respetar la señal "Do Not Track" del navegador** (`data-do-not-track`): es una opción del tracker que reduce datos; decisión de producto, no de este ticket.
- **Cambiar de proveedor** (Umami → Plausible del ADR-005) y **política de CSP** que liste el dominio del proveedor: hoy el sitio no tiene CSP; cuando E0-3 defina hosting y cabeceras, habrá que sumarlo.
- **Alertas automáticas cuando una métrica cruza su umbral**: el PRD §10 se revisa a mano.

## Dudas resueltas en la aprobación

1. **URL de la ficha como pageview**: aprobada tal cual — es la misma URL pública que cualquiera comparte; el "ni nombres de negocio" del ticket aplica a propiedades de eventos, no a las URLs públicas que el proveedor mide por diseño. Sin ella no existe el denominador del §10.
2. **Grupo de rutas `(publico)`**: aprobada la mudanza — exclusión por construcción vale más que una disciplina vigilada; las URLs no cambian.
3. **`data-exclude-search`**: aprobado el precio — proteger `?q=` importa más que medir el filtro de colonia. Confirmar el atributo contra la documentación de Umami al implementar; si ya no existe, aplicar el fallback del design y anotarlo.
