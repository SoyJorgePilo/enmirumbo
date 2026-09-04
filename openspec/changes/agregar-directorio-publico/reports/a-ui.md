# Reporte UI · agregar-directorio-publico

Capa de interfaz completa con datos mock centralizados. Todo Server Component, cero `"use client"` nuevo. `npm run lint` y `npm run build` en verde (verificados al final de este reporte).

## Archivos creados

- `src/lib/mock/agregar-directorio-publico.ts` — datos mock + funciones mock centralizadas (ver "Qué reemplaza el dev" abajo).
- `src/components/directorio/sello-verificado.tsx`
- `src/components/directorio/etiqueta-domicilio.tsx`
- `src/components/directorio/marcador-foto.tsx`
- `src/components/directorio/tarjeta-negocio.tsx`
- `src/components/directorio/botones-contacto.tsx`
- `src/app/[categoria]/page.tsx` — listado por categoría con filtro por colonia
- `src/app/negocio/[ficha]/page.tsx` — ficha de negocio
- `src/app/not-found.tsx` — 404 global en español

## Archivos modificados

- `src/app/page.tsx` — home real (antes provisional): categorías, bloque deporte, CTA de registro.
- `src/lib/estilos-boton.ts` — se agregó `CLASE_BOTON_SECUNDARIO` (mismo tamaño/área táctil que el primario, sin verde) para "Llamar", "Cómo llegar", el enlace a la página registrada y la entrada "Ver clubes y escuelas deportivas" de la home, de modo que nada compita visualmente con "Enviar WhatsApp".
- `openspec/changes/agregar-directorio-publico/tasks.md` — marcadas `[x]` las tareas 6–15 (con nota de qué falta: tests formales y conexión a datos reales donde aplica). NO se tocaron las tareas 1–5 (módulos de `src/lib/` sobre Prisma con tests) ni 16–20 (suites de test, revisión cross-viewport formal, auditoría final).

No se tocó `tests/`, `prisma/`, `src/generated/` ni ningún archivo de `registro-negocio`.

## Qué reemplaza el dev (contrato exacto)

Los **componentes** (`src/components/directorio/*`) NO importan del mock: reciben props ya resueltas (strings de href, textos, booleans). Conectar Prisma es cambiar solo las **páginas** (`src/app/page.tsx`, `src/app/[categoria]/page.tsx`, `src/app/negocio/[ficha]/page.tsx`), sustituyendo los imports de `src/lib/mock/agregar-directorio-publico.ts` por los módulos reales de `tasks.md`:

| Import mock actual | Lo reemplaza (tasks.md) |
|---|---|
| `CATEGORIAS_MOCK`, `obtenerCategoriaPorSlug` | Prisma `Categoria` (igual patrón que ya usa `src/app/registro/page.tsx`) |
| `COLONIAS_CATALOGO_MOCK`, `obtenerColoniaCatalogoPorSlug` | Prisma `Colonia` |
| `obtenerNegociosPorCategoriaMock`, `obtenerColoniasConNegociosMock`, `obtenerNegocioPorIdMock` | `src/lib/directorio.ts` (tarea 2) — el módulo real DEBE aplicar `estado: "publicado"` por construcción y excluir `estado/origen/registradoEn/consintioAvisoEn/tokenGestion` del select |
| `construirSlugFicha`, `extraerIdDeSegmentoFicha` | módulo real de la tarea 3 (design.md §2) — mi versión mock NO cubre los casos límite que tasks.md exige (acentos/signos, nombre vacío al slugificar, segmento sin guiones); son responsabilidad del dev con tests |
| `construirEnlaceWhatsapp`, `construirEnlaceComoLlegar`, `obtenerDominioVisible` | módulo real de enlaces salientes (tarea 4, design.md §4) — mi versión mock ya reutiliza `normalizarWhatsapp` y `slugify` existentes, pero no tiene tests de los casos raros (WhatsApp con formato feo, URL punycode, cadena no-URL) |
| Segmentos reservados de la raíz | tarea 1 (lista + test); no la implementé porque no hay riesgo real con los slugs mock (ninguno colisiona con `registro`/`negocio`) — el dev debe crear esa lista antes de que el catálogo real crezca |

## Formas de datos que esperan los componentes (props)

```ts
// TarjetaNegocio (src/components/directorio/tarjeta-negocio.tsx)
type TarjetaNegocioProps = {
  nombre: string;
  coloniaNombre: string;       // nombre de catálogo o el texto libre "Otra"
  entregaADomicilio: boolean;
  fotoUrl?: string | null;     // null hoy siempre (E1-3 fuera de alcance)
  hrefFicha: string;           // "/negocio/<slug>-<id>", ya armado
  hrefWhatsapp: string;        // "https://wa.me/52..." ya armado, con ?text=
};

// BotonesContacto (src/components/directorio/botones-contacto.tsx)
type BotonesContactoProps = {
  nombre: string;
  hrefWhatsapp: string;
  telefonoFijo?: string | null;
  hrefComoLlegar?: string | null;   // null si el negocio no capturó dirección/referencias
  pagina?: { href: string; dominio: string } | null; // null si no registró página o la URL no se pudo interpretar
};

// MarcadorFoto (src/components/directorio/marcador-foto.tsx)
type MarcadorFotoProps = { fotoUrl?: string | null; className?: string };
// El padre debe ser `relative` con alto definido (usa <Image fill>).

// SelloVerificado / EtiquetaADomicilio: sin props.
```

Los tipos de datos "de negocio" que las páginas consumen del mock (y que el dev debe replicar en `src/lib/directorio.ts`) son `NegocioListado` y `NegocioFicha`, definidos con comentarios en `src/lib/mock/agregar-directorio-publico.ts` — ahí está la proyección exacta de campos públicos (design.md §5).

## Decisiones de UI sin respaldo literal de la spec (a validar)

1. **Estilo de "Ver clubes y escuelas deportivas" en la home**: usé `CLASE_BOTON_SECUNDARIO` (neutro), no verde. La spec no dice el color; decidí reservar el verde de acción SOLO para "Registra tu negocio gratis" (mandato literal de `layout-base`) para no tener dos "botones primarios" verdes compitiendo entre sí en la misma pantalla, y porque el verde en el resto del sitio significa específicamente "WhatsApp/contacto" (PRD §11).
2. **Copy "Ver su página (dominio.com)"** para el enlace a la página registrada en la ficha: la spec (requirement M4) solo exige que "muestre el dominio real" sin decir el texto exacto del botón. Propongo este texto; necesita visto bueno o ajuste de copy.
3. **Orden de las secciones de la home**: bienvenida → "Busca por categoría" → "Deporte en Tizayuca" → "¿Tienes un negocio en Tizayuca?". La spec exige mismo nivel visual entre categorías y deporte, no un orden específico; puse categorías primero por ser la navegación principal.
4. **Patrón "stretched link" en la tarjeta** (`after:absolute after:inset-0` en el nombre + `z-10` en el botón de WhatsApp): decisión técnica para que "el resto de la tarjeta lleva a la ficha" y "el botón de WhatsApp sale directo sin pasar por la ficha" convivan sin anidar `<a>` dentro de `<a>` (HTML inválido). No hay mención de esto en la spec ni en design.md; es la solución estándar para este patrón.
5. **Filtro de colonia como pills con `aria-current`**: estilo de fila de enlaces con la opción activa marcada con borde `accion-fuerte` + fondo `superficie`. Sin literal de la spec sobre el estilo visual, solo el requisito de que se distinga.
6. **Ícono SVG del marcador de foto**: dibujo genérico de "imagen" (rectángulo + círculo + montaña), decorativo (`aria-hidden`). No hay spec de diseño gráfico; es un placeholder neutro razonable.

## Copy verificado carácter por carácter contra la spec

Confirmé contra `specs/directorio-publico/spec.md` y `specs/layout-base/spec.md` (MODIFIED): "¿Qué necesitas en Tizayuca?", "Encuentra negocios y servicios de aquí cerquita y contáctalos directo por WhatsApp.", "Busca por categoría", "Deporte en Tizayuca", "Escuelas, clubes y entrenadores para que los niños (y los grandes) se muevan.", "Ver clubes y escuelas deportivas", "¿Tienes un negocio en Tizayuca?", "Registra tu negocio gratis", "<Categoría> en Tizayuca", "Todavía no hay negocios publicados en esta categoría.", "No encontramos negocios de esta categoría en esa colonia.", "Ver todas las colonias", "Negocio verificado", "A domicilio", "Enviar WhatsApp", "Llamar", "Cómo llegar", "No encontramos esta página", "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita.", "Ir al inicio", mensaje de WhatsApp "Hola, te vi en NecesitoUno Tizayuca. ¿Me das informes?" — todos literales.

## Datos mock (`src/lib/mock/agregar-directorio-publico.ts`)

9 negocios ficticios (Tizayuca inventado, WhatsApp `771999000X`, ninguno real), cubriendo:

- 4 categorías con negocios: Servicios del hogar (2, en colonias distintas — habilita probar el filtro), Restaurantes y fondas (1, solo obligatorios), Belleza (1, sin teléfono/dirección/página — solo botón WhatsApp), Clubes y escuelas deportivas (2 — bloque deporte), Talleres (1), Abarrotes y comercio (1, colonia "Otra" sin normalizar), Salud (1, todos los opcionales).
- "Otro" queda sin negocios a propósito → demuestra el estado vacío de categoría en `/otro`.
- Un negocio con `facebookUrl` real de Facebook (`plomeria-hermanos-rosales`) y uno con dominio NO-Facebook (`academia-de-futbol-halcones`, hallazgo M4) para probar ambos casos del enlace a la página.
- El array ya viene en el orden que exige la spec (recientes primero, empate por nombre); no expone `publicadoEn` porque es un dato de orden de consulta, no algo que la UI muestre.

## Verificación manual (además de lint/build)

Levanté el server (`next start`) y probé con `curl`:

- Home: un `h1`, tres `h2` ("Busca por categoría", "Deporte en Tizayuca", "¿Tienes un negocio en Tizayuca?"), 8 categorías con sus slugs.
- `/servicios-del-hogar`: 2 tarjetas, filtro con 2 colonias, aria-label de WhatsApp nombrando cada negocio.
- `/servicios-del-hogar?colonia=atempa`: 1 tarjeta.
- `/servicios-del-hogar?colonia=no-existe`: listado completo, sin error (colonia desconocida ignorada).
- `/otro`: estado vacío "Todavía no hay negocios publicados en esta categoría." + CTA de registro.
- `/plomeros-baratos`: 404.
- Ficha completa (`Plomería Hermanos Rosales`): sello, WhatsApp, Llamar, Cómo llegar, "Ver su página (facebook.com)".
- Ficha mínima (`Fonda Doña Cuquita`): sin Llamar ni Cómo llegar.
- Ficha con dominio no-Facebook: "Ver su página (halcones-futbol.example.mx)", nunca dice "Facebook".
- `/negocio/nombre-viejo-inventado-mockneg001` (id real, parte legible inventada): 200 — la ficha se sirve igual (enlace viejo tras cambio de nombre).
- `/negocio/no-existe-xxxxx` y `/cualquier-cosa-que-no-existe`: 404 con los tres textos literales.

## Pendiente para el dev (no es mío)

- Conectar las 3 páginas a `src/lib/directorio.ts` real (Prisma) en vez del mock.
- Implementar `src/lib/` reales de: segmentos reservados (tarea 1), URL de ficha (tarea 3), enlaces salientes (tarea 4) — todos con sus tests de casos límite.
- `prisma/seed-demo.ts` + `db:seed:demo` (tarea 5).
- Actualizar `tests/layout.test.ts`: los 2 scenarios de la home vieja ("Bienvenido, vecino de Tizayuca" / home con un solo h1 sin h2) ya fallan contra la home nueva — esperado, es la tarea 17. Corrí `npx vitest run tests/layout.test.ts`: 20/22 pasan, los 2 que fallan son exactamente esos. También falta ampliar la lista blanca de hrefs para rutas dinámicas y el tratamiento de enlaces externos (tarea 16) — hoy ese test no ve mis hrefs dinámicos porque son `href={...}` (template literal), no `href="..."` literal, así que no rompe nada pero tampoco los cubre.
- Test de privacidad (tarea 18) y revisión formal a 390/768/1280 (tarea 19) — diseñé mobile-first con Tailwind responsive y áreas táctiles `min-h-11` en todo lo tocable, pero no hice captura de pantalla real en los tres anchos.

## `npm run lint` y `npm run build`

Ambos en verde al cierre de esta sesión (última corrida antes de este reporte).
