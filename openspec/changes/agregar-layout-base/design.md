# Diseño técnico: agregar-layout-base

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz).

## 1. Tokens en `@theme` de CSS, no en `tailwind.config`

El proyecto usa Tailwind v4, cuya configuración es CSS-first: los tokens se declaran en el bloque `@theme` de `src/app/globals.css` (como ya hace la plantilla) y generan utilidades automáticamente. No se debe crear un `tailwind.config.{js,ts}`: sería configuración muerta o conflictiva. El criterio del ticket "config de Tailwind" se cumple con `@theme`.

## 2. Verde WhatsApp: dos tokens para cumplir AA

El verde oficial de WhatsApp (#25D366) sobre blanco, o blanco sobre él, ronda 1.9:1 de contraste — muy por debajo del AA (4.5:1) que exige el ticket. Propuesta: dos tokens documentados en el propio `@theme`:

- **Verde marca/acción para superficies y acentos** (#25D366): fondos de botones cuyo texto sea oscuro, sellos, detalles. Nunca para texto sobre blanco.
- **Verde acción oscuro accesible** (p. ej. #128C4B o el tono más cercano al de WhatsApp que alcance ≥4.5:1 sobre blanco): texto verde, enlaces de acción y botones con texto blanco.

El valor exacto del tono oscuro se ajusta en implementación verificando el contraste; el requirement de la spec fija el resultado observable (AA), no el hexadecimal. Ningún otro color de la paleta debe ser llamativo: neutrales (blanco/grises/casi negro) para todo lo demás, de modo que el verde no tenga competencia (PRD §11 y contexto del ticket).

## 3. Tipografía: pila de sistema, sin fuentes web

El público usa celulares de gama media en 4G con presupuesto <2s (PRD §8). Se retira el Geist de la plantilla (`next/font`) y se define la tipografía como token con la pila de sistema (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`): cero bytes de fuente, cero layout shift, se ve nativa en cada dispositivo. Si más adelante la identidad visual pide una fuente propia, será un change aparte con su costo medido.

## 4. Se retira el dark mode heredado

La plantilla trae `prefers-color-scheme: dark` y clases `dark:` sueltas. El MVP define una sola paleta clara: mantener dos temas duplicaría el trabajo de contraste AA en cada feature sin que el PRD lo pida. Se elimina el media query y las clases `dark:` residuales.
