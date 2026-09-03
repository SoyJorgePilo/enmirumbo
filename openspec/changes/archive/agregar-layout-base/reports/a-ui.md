# Reporte UI — agregar-layout-base

**Agente:** a-ui · **Fecha:** 2026-09-03 · **Rama:** `feature/agregar-layout-base` (sin tocar git)

## Qué construí

| Archivo | Acción |
| --- | --- |
| `src/app/globals.css` | Reescrito: tokens en `@theme` (paleta neutral + dos verdes de acción + pila de sistema), comentarios que documentan el verde como color de acción principal y los ratios AA. Retirados dark mode, variables de Geist y la regla `body` con Arial suelto. |
| `src/components/header.tsx` | Nuevo. Server Component: wordmark "NecesitoUno" + posicionamiento "Tizayuca", `<Link href="/">` con `min-h-11` (44px). Solo clases de tokens. |
| `src/components/footer.tsx` | Nuevo. Server Component: "NecesitoUno Tizayuca" + línea de identidad; comentario que reserva el espacio para los enlaces legales de E6 (cero enlaces muertos). |
| `src/app/layout.tsx` | Reescrito: `lang="es-MX"`, metadata literal de la spec, sin `next/font`/Geist, estructura `Header` + `<main class="flex-1">` + `Footer` (footer abajo aun con poco contenido), ancho máximo `max-w-3xl` centrado. Tipado con `LayoutProps<"/">` (helper global de esta versión de Next; verificado en `node_modules/next/dist/docs/.../03-file-conventions/layout.md`). |
| `src/app/page.tsx` | Reemplazado por la home provisional: `h1` de bienvenida + frase literal de la spec. Sin ningún import ni asset de la plantilla. |

Sin dependencias nuevas, sin `tailwind.config` (Tailwind v4 CSS-first, design.md §1), sin tocar `src/generated/`.

## Tokens y contraste AA (WCAG 2.1, ≥4.5:1)

Calculado con la fórmula de luminancia relativa de WCAG (script Node durante la implementación):

| Combinación texto / fondo | Ratio | AA |
| --- | --- | --- |
| `tinta` #171717 / `fondo` #FFFFFF | 17.93:1 | ✔ |
| `tinta` #171717 / `superficie` #F4F4F5 | 16.31:1 | ✔ |
| `tinta-suave` #52525B / `fondo` #FFFFFF | 7.73:1 | ✔ |
| `tinta-suave` #52525B / `superficie` #F4F4F5 | 7.03:1 | ✔ |
| `tinta` #171717 / `accion` #25D366 (texto sobre verde marca) | 9.04:1 | ✔ |
| `accion-fuerte` #0F7A41 / `fondo` #FFFFFF (texto/enlace verde) | 5.41:1 | ✔ |
| `accion-fuerte` #0F7A41 / `superficie` #F4F4F5 | 4.92:1 | ✔ |
| blanco #FFFFFF / `accion-fuerte` #0F7A41 (botón verde con texto blanco) | 5.41:1 | ✔ |

- `borde` #E4E4E7 es decorativo (separadores), nunca lleva texto: sin requisito AA.
- **Ajuste sobre design.md §2:** el ejemplo #128C4B da **4.30:1** sobre blanco — falla AA. El token `accion-fuerte` quedó en **#0F7A41** (5.41:1), el tono más cercano al verde WhatsApp con margen real; el design.md ya anticipaba este ajuste ("el valor exacto se ajusta en implementación verificando el contraste").

Nombres de tokens (generan clases Tailwind): `fondo`, `superficie`, `borde`, `tinta`, `tinta-suave`, `accion`, `accion-fuerte` → `bg-fondo`, `text-tinta`, `bg-accion`, `text-accion-fuerte`, etc. Tipografía: `--font-sans` (pila de sistema) → clase `font-sans` aplicada en `<body>`.

**Regla de uso del verde (documentada en `globals.css`):** `accion` (#25D366) solo para superficies/acentos con texto en `tinta`; `accion-fuerte` para texto verde y botones con texto blanco. #25D366 nunca como color de texto sobre fondo claro (1.9:1).

## Decisiones de UI sin respaldo explícito de la spec

1. **Posicionamiento "Tizayuca" en el header en neutral (`tinta-suave`), no en verde.** Design.md permite el verde marca en "sellos", pero el ticket dice "nada compite con él" como color de acción: el header aparece en todas las páginas y le quitaría exclusividad al botón de WhatsApp. Reversible con una clase si el humano prefiere el sello verde.
2. **Ancho máximo `max-w-3xl` centrado** para `main`, header y footer (el "ancho máximo centrado" que la spec da como ejemplo; el valor concreto es mío).
3. **Footer con fondo `superficie`** para delimitarlo del contenido sin introducir color nuevo.
4. La home provisional no usa el verde: todavía no hay ninguna acción que señalar.

## Copy propuesto que necesita visto bueno

- `h1` de la home: **"Bienvenido, vecino de Tizayuca"** (la spec solo pide "un encabezado de bienvenida"; la frase que le sigue sí es literal de la spec).
- Línea del footer: **"Hecho para los vecinos de Tizayuca, Hidalgo."** (acompaña la identificación obligatoria "NecesitoUno Tizayuca").

## Tareas de tasks.md

Las 9 quedaron `- [x]`. Evidencia:

- `npm run lint` y `npm run build` pasan (Next 16.3.3, `/` prerenderizada estática).
- HTML prerenderizado verificado: `lang="es-MX"`, `<title>` y meta description literales, landmarks `header`/`main`/`footer`, un solo `h1`, cero rastros de plantilla (grep de `next.svg|vercel|create next app` vacío).
- `grep` sin `prefers-color-scheme` ni `geist` en `globals.css`; sin `"use client"` en layout/header/footer/home.
- Responsive: sin anchos fijos ni elementos que desborden; todo texto envuelve y el contenedor es fluido (`w-full max-w-3xl`) — correcto a 390px y hacia arriba por construcción. Recomiendo al validador la pasada visual en navegador (390/768/1280) como confirmación final.

## Qué le queda al dev

**Nada.** El change es puramente de interfaz estática: no hay datos mock que reemplazar, ni lógica, ni acciones de servidor. Formas de datos: ningún componente recibe props (`Header` y `Footer` sin props; la home es estática). El dev puede pasar directo a seguridad-test/validador.

Pendientes fuera de este change (ya listados en proposal.md): favicon de marca, `error.tsx`/`not-found.tsx` en español, home real (E2-1), páginas legales (E6).
