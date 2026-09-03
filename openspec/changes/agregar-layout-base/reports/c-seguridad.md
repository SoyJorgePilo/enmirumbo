# Reporte Seguridad y Tests — agregar-layout-base

**Agente:** c-seguridad · **Fecha:** 2026-09-03 · **Rama:** `feature/agregar-layout-base` (sin tocar git)

## Alcance auditado

Diff completo contra `main` (`git diff main --stat`: solo `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`) más los untracked del change (`src/components/header.tsx`, `src/components/footer.tsx`, `docs/tickets/T-002-layout-base.md`, `openspec/changes/agregar-layout-base/`). `src/generated/` excluido de la auditoría de código por instrucción (artefacto local de otra corrida), pero sí evaluado como riesgo operativo (ver M-1).

Change de layout estático puro: sin formularios, sin datos, sin rutas dinámicas, sin dependencias nuevas, sin archivos de config tocados (verificado: `git diff main -- package.json next.config.ts tsconfig.json eslint.config.mjs .gitignore .env.example` → vacío). La superficie de ataque real es mínima; la auditoría se concentró en fugas al repo público, XSS/HTML crudo, enlaces y regresiones de config.

## Hallazgos

### Medio

- **M-1 · `src/generated/` untracked y sin entrada en `.gitignore` — riesgo de commit accidental de artefacto local al repo público.**
  Evidencia: `git status` lo lista como untracked; `git check-ignore -v src/generated` → no ignorado; `grep -rn "generated" .gitignore` → sin resultados. Contiene `src/generated/prisma` (cliente Prisma generado por la corrida de PR #2, que no está mergeada en esta rama).
  Escenario concreto: el validador (único que toca git) hace `git add -A` o `git add .` al preparar el PR y comitea al repo público un artefacto generado que no pertenece a este change, ensuciando el diff del PR y creando conflicto con PR #2.
  Mitigación (no aplicada por mí, no es código de producto): el validador debe hacer staging explícito por ruta (los 3 modificados + `src/components/` + ticket + `openspec/changes/agregar-layout-base/`), nunca `git add -A`. La entrada de `.gitignore` para `src/generated` pertenece a PR #2; si PR #2 no la trae, levantar chore.

### Crítico / Alto

Ninguno.

### Informativos (sin acción en este change)

- **I-1:** El único `dangerouslySetInnerHTML` en el HTML compilado (`.next/server/app/index.html`, payload RSC) proviene de la página de error interna de Next.js (estilos inline de `next-error-h1`), contenido estático del framework, no del código del change. En `src/` no existe ninguno (verificado abajo). No es hallazgo.
- **I-2:** La meta descripción promete "Registro gratis para negocios locales" antes de que exista el registro; el literal fue aprobado por el humano en la spec (proposal.md "Dudas resueltas" §2), así que no lo cuento como promesa falsa auditable. Se materializa con E1.
- **I-3:** `favicon.ico` sigue siendo el de la plantilla; ya está registrado como fuera de alcance en proposal.md. Sin riesgo de seguridad.

## Comprobaciones adversariales (manuales, reproducibles)

Sin infra de tests en esta rama por restricción deliberada del orquestador (PR #2 la trae; prohibido duplicarla). Cada verificación queda como comando + resultado, reproducible desde la raíz del repo:

| # | Comprobación | Comando | Resultado |
| --- | --- | --- | --- |
| 1 | XSS / HTML crudo / JS de cliente en código del change | `grep -rInE 'dangerouslySetInnerHTML\|innerHTML\|use client' src/app src/components` | 0 resultados |
| 2 | Enlaces externos y `target=_blank` sin `rel` | `grep -rInE 'href=\|target=\|https?://' src/app/layout.tsx src/app/page.tsx src/components/` | Único href: `href="/"` (header.tsx:13). Cero enlaces externos, cero `target` |
| 3 | Enlaces muertos en el HTML servido | `grep -oE 'href="[^"]*"' .next/server/app/index.html \| sort -u` | Solo `/`, assets `/_next/*` y favicon: todos existentes |
| 4 | Secretos / datos personales (LFPDPPP) en todo el diff + docs del change | grep de patrones de teléfono MX, `wa.me/<número>`, correos, `api[_-]?key`, `secret`, `password`, `token` sobre `src/`, ticket y `openspec/changes/agregar-layout-base/` | 0 datos personales, 0 secretos (todos los hits de "token" son *design tokens* de Tailwind) |
| 5 | Nombres de negocios reales en copy | Lectura de header/footer/home: solo "NecesitoUno", "Tizayuca", "Hidalgo" y copy genérico en es-MX | Limpio |
| 6 | Regresión en archivos de config | `git diff main -- .env.example package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs .gitignore` | Vacío: ningún config tocado; sin variables de entorno nuevas |
| 7 | Contraste AA — recálculo independiente (tercera verificación, script Node propio, luminancia WCAG 2.1) | script inline `node -e` sobre los 8 pares de tokens | 8/8 ≥ 4.5:1 (mín. 4.92:1 `accion-fuerte`/`superficie`; máx. 17.93:1). #25D366 como texto: 1.98:1, documentado como prohibido en `globals.css` — coincide con a-ui y b-dev |
| 8 | Metadata y lang contra literales de la spec | `grep -oE 'lang="[^"]*"\|<title>[^<]*</title>\|name="description" content="[^"]*"' .next/server/app/index.html` | `lang="es-MX"`; título y descripción idénticos carácter por carácter a spec.md §"Server Component" |
| 9 | Landmarks y jerarquía en HTML servido | Conteo de `<header`, `<main`, `<footer`, `<h1`, `<h2` en `index.html` | 1/1/1/1/0 — correcto |
| 10 | Código del layout en bundles de cliente | `grep -l "Tizayuca\|NecesitoUno" .next/static/chunks/*.js` | 0 chunks: el layout no envía JS propio |
| 11 | Rastros de plantilla en HTML servido | `grep -ciE 'vercel\|next\.svg\|create next app\|get started\|geist' .next/server/app/index.html` | 0 |
| 12 | Hexadecimales sueltos en componentes | `grep -rInE '#[0-9a-fA-F]{3,8}\b' src/app/layout.tsx src/app/page.tsx src/components/` | 0 (única fuente: `@theme`) |

Nota sobre superficie adversarial clásica (entradas hostiles, transiciones de estado, colisiones de slug): **no existe en este change** — no hay input de usuario, ni estado, ni rutas dinámicas. Queda para los changes de E1/E2.

## Scenarios sin test

Los 13 scenarios carecen de test automatizado por la restricción deliberada de la corrida (documentada en b-dev.md §"Restricción"); el mapa del dev cubre 13/13 con verificación manual y mis comprobaciones lo reconfirman de forma independiente. **No es hallazgo bloqueante**, pero sí deuda con fecha: al mergear PR #2, portar los scenarios 2, 4, 7, 9, 10, 11, 12 y 13 a Vitest (ya propuesto por el dev; lo suscribo y añado el cálculo de contraste del punto 7 como test unitario de tokens).

## Gates

- `npm run lint` → verde.
- `npm run build` → verde (`/` y `/_not-found` estáticas).
- `npm test` → no existe en esta rama (restricción documentada; llega con PR #2).

## Veredicto

**Limpio para pasar al validador.** 0 críticos, 0 altos, 1 medio (M-1, operativo: staging explícito del validador, no requiere cambio de código de este change ni regreso al dev/ui). Pendientes para el validador: pasada visual 390/768/1280 px (scenarios 5 y 6) y respetar la instrucción de staging de M-1.
