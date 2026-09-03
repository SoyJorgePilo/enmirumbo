# Reporte Validación — agregar-layout-base

**Agente:** d-validacion · **Fecha:** 2026-09-03 · **Rama:** `feature/agregar-layout-base`

## Veredicto

**APROBADO en primera pasada.** 0 hallazgos bloqueantes. Todo lo reportado por las etapas A/B/C se re-verificó de forma independiente; ninguna afirmación se dio por buena sin evidencia propia.

## Validación por punto

1. **Spec (13/13 scenarios):** verificados contra `git diff main` + untracked y contra el HTML/CSS de `npm run build` ejecutado por mí:
   - Header con marca: `<header>` único con "NecesitoUno" + "Tizayuca" (`src/components/header.tsx`), presente en toda página vía `layout.tsx`.
   - Footer sin enlaces muertos: hrefs del HTML servido = `/` + assets `_next`/favicon; el footer no tiene `<a>` y reserva el espacio E6 en comentario.
   - Tokens: `@theme` en `globals.css` con `--color-accion: #25d366` documentado como "COLOR DE ACCIÓN PRINCIPAL"; cero hexadecimales en componentes (`grep '#[0-9a-fA-F]{3,8}'` → 0 en layout/page/components).
   - Responsive: sin `w-[`, `min-w-`, `whitespace-nowrap` ni `text-[` (grep → 0); contenedores fluidos `w-full max-w-3xl mx-auto`. Verificado por construcción; el render en navegador real queda como confirmación visual del humano al revisar el PR.
   - Accesibilidad: landmarks 1/1/1, `<h1>` exactamente 1, `<h2>+` 0; contraste recalculado por mí con script Node propio (cuarta verificación independiente): 8/8 pares ≥4.5:1 (mín. 4.92:1 `accion-fuerte`/`superficie`), #25D366 como texto = 1.98:1 y documentado como prohibido; `min-h-11` con `--spacing: .25rem` en el CSS compilado = 44px exactos.
   - Server Component/es-MX/metadata: `lang="es-MX"`, `<title>` y meta description idénticos a los literales de la spec; `grep '"use client"'` → 0; `grep "Tizayuca|NecesitoUno"` sobre `.next/static/chunks/*.js` → 0 chunks.
   - Home provisional: `h1` "Bienvenido, vecino de Tizayuca" + frase literal de la spec; rastros de plantilla (`vercel|next.svg|create next app|get started|geist`) → 0.
2. **Ticket T-002:** los 6 criterios de aceptación se cumplen (mapean 1:1 a los requirements de arriba).
3. **Alcance:** el diff toca exactamente lo listado en proposal.md (`globals.css`, `layout.tsx`, `page.tsx`, `src/components/{header,footer}.tsx` + docs del change). Sin scope creep. `src/generated/` NO es parte del change y quedó fuera del commit (ver M-1).
4. **tasks.md:** 9/9 `[x]` y verificadas como hechas.
5. **Seguridad:** 0 críticos/altos en c-seguridad.md; re-verifiqué con grep propio ausencia de secretos, teléfonos/`wa.me`, correos y nombres de negocios reales en todo el diff y docs del change → limpio. `git diff main` sobre configs (`package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `.env.example`) → vacío. **M-1 atendido:** staging explícito por ruta, `git status` verificado antes del commit — `src/generated/` no entró al stage ni al `.gitignore` de esta rama (eso pertenece a PR #2).
6. **Gates mecánicos (ejecutados por mí):** `npm run lint` → verde; `npm run build` → verde (`/` y `/_not-found` estáticas). `npm test` no existe en esta rama por restricción deliberada (la infra Vitest llega con PR #2; deuda de portar los scenarios registrada en b-dev.md §Deuda y c-seguridad.md §Scenarios sin test).
7. **Convenciones:** copy en es-MX coloquial ("Bienvenido, vecino de Tizayuca"); sin `any` (`grep ': any|as any'` → 0); sin dependencias nuevas (diff de `package.json` vacío).

## Hallazgos propios

Ninguno bloqueante. Observaciones ya registradas en proposal.md como fuera de alcance: favicon de plantilla, `error.tsx`/`not-found.tsx` pendientes de ticket.

## Verificado por muestreo

- Recálculo completo de la tabla de contraste (no muestreo: los 9 pares, incluida la combinación prohibida).
- Comparación carácter por carácter de title/description del HTML servido contra spec.md.
- Reproducción de las comprobaciones 1, 3, 6, 10, 11 y 12 de c-seguridad.md con mis propios comandos: todas coinciden.

El merge lo hace un humano con el CI de GitHub Actions en verde; esta validación local no lo sustituye.
