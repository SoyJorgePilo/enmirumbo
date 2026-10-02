# Diseño: agregar-andamio-astro

## 1. Convivencia con Next en la raíz hasta el corte

**Decisión:** Astro ocupa la raíz con su `srcDir` por defecto (`./src`, páginas en `src/pages/`). En la rama `migracion-astro`, **el único build que se corre es el de Astro**: `npm run build`, `dev` y `start` pasan a Astro, y ningún script ni paso del CI vuelve a invocar `next build` o `next dev`. Next se queda como **código fuente inerte**: `src/app/`, `next.config.ts` y el paquete `next` permanecen instalados solo para que la suite actual los siga importando, y para servir de referencia mientras cada fase traslada sus rutas. La referencia viva del comportamiento es producción (`main`), no un build local de Next.

**Por qué no correr los dos builds:**

- Chocan por convención de archivos. Next trata `src/pages/` como Pages Router y `src/middleware.ts` como su propio middleware; Astro usa exactamente esas dos rutas. En la Fase 1 `src/pages/` aún está vacío, pero en cuanto la Fase 2 agregue endpoints `.ts` (`sitemap.xml.ts`, `robots.txt.ts`), `next build` intentaría convertirlos en rutas suyas. `pageExtensions` no lo evita sin romper las convenciones del App Router (`page.tsx`, `layout.tsx`).
- Doble tiempo de CI sin ganancia: el diff de HTML de la Fase 2 compara contra producción.
- Vercel solo puede publicar uno de los dos por despliegue.

**Por qué no mover Astro a otro `srcDir`** (p. ej. `src/astro/`): evitaría el choque, pero obligaría a mover todo en el corte y a reescribir rutas e imports en cada fase. Con el `srcDir` por defecto, el corte solo borra `src/app/` y `next.config.ts`.

**Qué sigue dependiendo de Next en la rama, a propósito:**

- 46 archivos de pruebas importan `src/app/` y ~24 simulan `next/headers`/`next/navigation`; corren en Vitest sin build de Next. Se reescriben fase por fase (ADR-013).
- `tests/despliegue.test.ts` y `tests/tls-certificado-supabase.test.ts` importan `next.config.ts`; `tests/analitica-exclusion-admin.test.ts` lee la versión de `next` en `package.json`. Por eso `next.config.ts` y `next` no se tocan hasta T-027.

**Costo aceptado:** sin `next build`, nada revisa los tipos de `src/app/`. Se compensa con un paso de tipos explícito en el CI (requirement "El CI prueba el nuevo marco…"): `astro check`, y `tsc --noEmit` si `astro check` no cubriera `src/app/`. `next-env.d.ts` está en `.gitignore` y no se genera sin Next; el CI debe pasar sin él.

## 2. Tailwind por el PostCSS que ya existe

Astro usa Vite, y Vite carga `postcss.config.mjs` de la raíz solo. Ese archivo ya monta `@tailwindcss/postcss` para Next. **Decisión:** reutilizarlo y no agregar `@tailwindcss/vite` (que el spike sí usó). Así hay un solo pipeline de CSS para los dos marcos durante la convivencia, cero dependencias nuevas, y no se procesa Tailwind dos veces. Las páginas de la Fase 2 importarán `src/app/globals.css` en su sitio (no copia, a diferencia del spike, que estaba fuera de la raíz); se mueve en el corte.

## 3. Capa de compatibilidad

`src/components/compat/link.tsx` exporta `Link` y `src/components/compat/imagen.tsx` exporta `Imagen`, ambos componentes de servidor sin estado.

- `Link` pinta `<a>` con `href` y el resto de las props tal cual. No reproduce la precarga ni la navegación del lado del cliente de Next: hoy no existen en el HTML servido, y el sitio no lleva JS propio.
- `Imagen` cubre solo las props que usa `MarcadorFoto` (`src`, `alt`, `fill`, `priority`, `unoptimized`, `sizes`, `className`) y pinta un `<img>` con los mismos atributos que `next/image` emite en servidor para esa combinación (incluido el `style` de relleno, `decoding`, `loading`/`fetchpriority`). No hay optimizador: el `src` se respeta tal cual, como hoy con `unoptimized`.
- **Paridad comprobada contra Next mientras exista:** las pruebas de la capa renderizan el componente propio y el de Next con las mismas props y comparan el HTML. En T-027, al retirar `next`, esas pruebas se congelan con el HTML literal esperado.
- **Por qué una capa y no `<a>`/`<img>` directos en cada componente** (lo que sugería ADR-013): el marcado de `next/image` no es trivial, y repetirlo a mano en cada uso abre la puerta a diferencias silenciosas; con la capa el cambio en los 20 componentes es una línea de `import` y la paridad se prueba en un solo lugar.

## 4. Vitest con Astro

`vitest.config.mts` se envuelve con `getViteConfig` de `astro/config` para poder renderizar `.astro` con la Container API en las fases siguientes. Se conservan sin cambio el alias `@`, `include`, `fileParallelism: false`, `env`, `globalSetup` y la carga de `.env`. Si el envoltorio alterara cualquiera de esos valores, la suite lo delata (requirement "La suite completa sigue en verde").

## 5. ESLint sin `eslint-config-next`

Configuración plana con `typescript-eslint` (recomendadas), `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` con el mismo subconjunto de reglas que hoy activa `core-web-vitals`, y `eslint-plugin-astro` para `.astro`. Solo se pierden las reglas `@next/next/*`, que no aplican fuera de Next. El único `eslint-disable` del repo (`react-hooks/exhaustive-deps` en `formulario-registro.tsx`) sigue resolviendo a una regla existente. `eslint-config-next` se queda en `devDependencies` hasta el corte (ADR-013, Fase 6), sin usarse.

## 6. Configuración de Astro

`output: 'server'`; adaptador `@astrojs/vercel` con `includeFiles: ["./certs/supabase-root-2021-ca.crt"]` (equivale a `outputFileTracingIncludes` de `next.config.ts`, que se queda mientras sus pruebas lo lean); `@astrojs/react`. Sin servicio de optimización de imágenes que exponga un endpoint propio (las fotos ya salen en su tamaño final y WebP; spec `directorio-publico`). Middleware, cabeceras, `checkOrigin` y `env.schema` entran con las fases que los usan, no aquí.
