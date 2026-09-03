# Reporte Dev — agregar-layout-base

**Agente:** b-dev · **Fecha:** 2026-09-03 · **Rama:** `feature/agregar-layout-base` (sin tocar git)

## Alcance de esta etapa

La etapa A (`a-ui.md`) entregó la totalidad del change: este change es interfaz estática pura, sin modelo de datos, lógica de servidor ni mocks que reemplazar. Mi trabajo fue la **verificación independiente** de los 13 scenarios de `specs/layout-base/spec.md` contra el código real y el HTML/CSS generado por `npm run build`, con la instrucción de corregir cualquier incumplimiento.

**Resultado: los 13 scenarios cumplen. Cero correcciones necesarias.** No modifiqué ningún archivo de producto. Las 9 tareas de `tasks.md` ya estaban `- [x]` y su evidencia se reconfirmó aquí.

## Restricción de esta corrida: verificación manual, sin tests

Por indicación explícita del pipeline **no se instaló Vitest ni ninguna dependencia** en esta rama: el PR #2 (`feature/agregar-modelo-datos`, pendiente de merge) ya agrega la infraestructura de tests y duplicarla crearía conflicto de `package.json`. Todos los scenarios se verificaron manualmente; el mapa siguiente documenta el comando o inspección exacta y su resultado.

## Mapa scenario → verificación (13/13)

Base de evidencia: `npm run build` en verde (Next 16.3.3, `/` prerenderizada estática) y el HTML resultante en `.next/server/app/index.html`; CSS compilado en `.next/static/chunks/*.css`.

| # | Scenario (requirement) | Verificación (comando/inspección) | Resultado |
| --- | --- | --- | --- |
| 1 | Header con marca y posicionamiento | Regex sobre el HTML prerenderizado: `<header>` contiene "NecesitoUno" y "Tizayuca"; código en `src/components/header.tsx` | Cumple: wordmark + posicionamiento en `<header>`, en todas las páginas vía `layout.tsx` |
| 2 | Footer presente sin enlaces muertos | Extracción de todos los `href` de `<a>` del HTML: la lista completa es `['/']` (el enlace del header, ruta existente). Footer sin `<a>`; comentario reserva el espacio E6 | Cumple: cero enlaces muertos |
| 3 | Verde de acción tokenizado y documentado | Lectura de `src/app/globals.css`: `--color-accion: #25d366` en `@theme` con comentario "COLOR DE ACCIÓN PRINCIPAL"; utilidades `bg-accion`/`text-accion-fuerte` generadas (presentes en CSS compilado) | Cumple |
| 4 | El layout consume solo tokens | `grep '#[0-9a-fA-F]{3,6}'` sobre `layout.tsx`, `page.tsx`, `src/components/` → 0 resultados; única fuente de hexadecimales es `@theme` | Cumple |
| 5 | Celular a 390px | Inspección de clases: cero anchos fijos, `min-w-`, `whitespace-nowrap`, `text-[...]` ni `w-[...]` en layout/header/footer/home (grep vacío); contenedores fluidos `w-full max-w-3xl` | Cumple por construcción (confirmación visual final: pasada del validador en navegador) |
| 6 | Adaptación a escritorio | Inspección de clases: `max-w-3xl mx-auto` en header, main y footer; breakpoints `sm:` solo aumentan padding/tamaño de texto | Cumple |
| 7 | Estructura semántica | Conteo por regex en HTML prerenderizado: `<header>` 1, `<main>` 1, `<footer>` 1, `<h1>` exactamente 1, `<h2>`–`<h6>` 0 (sin saltos posibles) | Cumple |
| 8 | Contraste AA de los tokens | Recálculo **independiente** (script Python, fórmula de luminancia relativa WCAG 2.1) de las 8 combinaciones texto/fondo; coincide con la tabla de `a-ui.md`: mínimo 4.92:1 (`accion-fuerte`/`superficie`), máximo 17.93:1. #25D366 como texto da 1.98:1 y está documentado como prohibido en `globals.css` | Cumple: 8/8 ≥ 4.5:1 |
| 9 | Áreas táctiles | Único elemento interactivo del layout: `<Link>` del header con `min-h-11`; CSS compilado confirma `--spacing: .25rem` → 11 × 4px = **44px** exactos | Cumple |
| 10 | Documento es-MX con metadata | HTML prerenderizado: `<html lang="es-MX">`; `<title>` y meta description comparados **carácter por carácter** contra los literales de la spec → idénticos | Cumple |
| 11 | Sin JS de cliente en el layout | `grep '"use client"'` en `src/` (excluyendo `src/generated/`) → 0; `grep "NecesitoUno\|Tizayuca\|Bienvenido"` sobre `.next/static/chunks/*.js` → 0 (ningún chunk contiene código del layout/home; los chunks presentes son el runtime de Next/React, inevitable e igual para toda app) | Cumple |
| 12 | Home provisional visible | HTML prerenderizado: `h1` "Bienvenido, vecino de Tizayuca" + frase literal "Muy pronto vas a poder encontrar aquí los negocios y servicios de Tizayuca." dentro de `main`, con header y footer | Cumple |
| 13 | Sin rastros de la plantilla | Grep sobre el HTML de `next.svg`, `vercel`, `create next app`, `Get started`, `Deploy`, `geist` → 0; sin imports de `next/image`/`next/font`/`.svg` en los componentes; `globals.css` sin `prefers-color-scheme` ni `geist` | Cumple |

## Gates

- `npm run lint` → verde (0 errores/avisos).
- `npm run build` → verde; `/` y `/_not-found` prerenderizadas estáticas.
- `npm test` → no existe en esta rama por diseño (ver restricción arriba); llega con el merge del PR #2.

## Correcciones realizadas

Ninguna. La entrega de la etapa A pasó las 13 verificaciones sin ajustes.

## Decisiones técnicas de esta etapa

- No reimplementar ni refactorizar nada que ya cumpliera la spec (simplicidad primero; la etapa A no dejó deuda).
- Verificación de contraste recalculada desde cero (no confiando en la tabla de a-ui) para que sea evidencia independiente.

## Propuestas fuera de alcance / deuda

1. **Portar los scenarios verificables de `layout-base` a tests automatizados cuando el repo tenga la infra de Vitest mergeada** (PR #2): los scenarios 2, 4, 7, 9, 10, 11, 12 y 13 son automatizables casi directo (render del layout + asserts sobre HTML, grep de fuentes, y el cálculo de contraste como test unitario sobre los tokens).
2. Pendientes ya listados en `proposal.md`: favicon de marca, `error.tsx`/`not-found.tsx` en español, home real (E2-1), páginas legales del footer (E6).
3. Confirmación visual en navegador a 390/768/1280 px como pasada final del validador (los scenarios 5 y 6 se verificaron por inspección de clases; el render real es la única evidencia visual definitiva).
