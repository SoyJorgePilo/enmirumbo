# Propuesta: agregar-layout-base

**Ticket:** `docs/tickets/T-002-layout-base.md` (E0-2, P0)
**PRD:** §6.2 (todas las pantallas públicas comparten el marco visual), §8 (mobile-first, rendimiento <2s en 4G, accesibilidad base), §11 (marca neutral "NecesitoUno" con posicionamiento hiperlocal "Tizayuca" cargado en título, header y metadata)

## Por qué

Todas las pantallas del MVP (home, listados, fichas, formulario, panel) comparten header, footer, tipografía y paleta; definir ese marco antes de las features evita retrabajo de estilos (T-002, contexto). Además, como el nombre no dice "Tizayuca", el PRD §11 exige cargar el posicionamiento hiperlocal en la comunicación desde el primer pixel: header, título y metadata. El verde de WhatsApp queda reservado como color de acción principal — nada compite con él.

## Qué cambia

- Se reemplaza el layout de plantilla de create-next-app por un layout global propio: header con wordmark tipográfico "NecesitoUno" y posicionamiento "Tizayuca", contenido en `<main>`, y footer presente en todas las páginas (con espacio previsto para las páginas legales de E6, sin enlaces muertos).
- La paleta y la tipografía se definen como tokens reutilizables de Tailwind, con el verde WhatsApp documentado como color de acción principal y contraste AA en todas las combinaciones de tokens.
- Documento en `es-MX` con metadata base del sitio (título y descripción que incluyen "Tizayuca").
- El layout es Server Component sin JS de cliente; diseño mobile-first correcto a 390px y adaptado hacia arriba sin scroll horizontal; áreas táctiles ≥44px.
- La página de inicio se sustituye por una home provisional con contenido mínimo que usa el layout (la home real llega con E2-1).

## Capacidades afectadas

- `layout-base` (nueva): marco visual y de accesibilidad compartido por todas las páginas.

## Impacto en código (alto nivel)

- `src/app/layout.tsx`: reescritura (lang, metadata, estructura header/main/footer, tipografía).
- `src/app/globals.css`: tokens de paleta y tipografía en `@theme` (Tailwind v4, ver `design.md`); retiro del dark mode heredado de la plantilla.
- `src/app/page.tsx`: reemplazo por home provisional mínima.
- Componentes nuevos de header y footer (Server Components, p. ej. en `src/components/`).
- Sin cambios en datos, rutas nuevas ni dependencias nuevas.

## Fuera de este change

- La home real con buscador, categorías y bloque "Deporte en Tizayuca" (E2-1).
- Páginas legales del footer y sus enlaces (E6).
- Logo gráfico definitivo (la marca visual se decide fuera del código).
- Componentes de feature (tarjetas, formularios, botones de WhatsApp concretos).
- Favicon/íconos de marca: `src/app/favicon.ico` sigue siendo el de la plantilla de Next.js; conviene un ticket propio de identidad visual mínima.
- Estados globales de error y no-encontrado (`error.tsx`, `not-found.tsx` con textos en español): hoy no existen y las features los van a necesitar; merecen ticket aparte.

## Dudas resueltas en la aprobación

1. **Verde WhatsApp y contraste AA:** aprobada la estrategia de dos tokens de `design.md` — verde marca (#25D366) para superficies y acentos, verde oscuro accesible para texto y botones con texto blanco. La accesibilidad AA del PRD §8 no se negocia por fidelidad de color.
2. **Textos de metadata:** aprobados tal cual el título "NecesitoUno Tizayuca — Encuentra negocios y servicios en Tizayuca" y la descripción propuesta.
3. **Tipografía:** aprobada la pila de sistema (cero bytes de fuente, presupuesto <2s en 4G); se retira Geist de la plantilla.
