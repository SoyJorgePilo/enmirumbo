# Tareas: explorar-migracion-astro

> `[x]` hecho y verificado · `[~]` hecho en lo verificable en local; falta la parte que exige infraestructura humana (preview de Vercel, base desechable, Firefox). Detalle en `reports/b-dev.md` y `docs/decisiones/ADR-013-spike.md` §Pendiente humano.

- [x] 1. Excluir `spikes/` del `tsconfig.json` y de `globalIgnores` en `eslint.config.mjs`; verificar que build, pruebas y lint de la raíz siguen en verde.
  - Build y lint en verde; `tsc --listFilesOnly` no incluye ningún archivo de `spikes/`. La suite tiene 2 pruebas de carreras intermitentes (`tests/reportes-seguridad-adversarial.test.ts` A1/A2) que fallan igual SIN este cambio (ver reporte).
- [x] 2. Andamio en `spikes/astro/`: `package.json` propio, Astro con `output: 'server'`, `@astrojs/vercel` y `@astrojs/react`; `npm run build` del spike en verde.
- [~] 3. Proyecto de Vercel aparte (Root Directory `spikes/astro`) y base PostgreSQL desechable con datos ficticios; credenciales solo en variables de entorno. Preview arriba.
  - Hecho: `.env.example` del spike, semilla ficticia (`prisma/semilla.sql`). Pendiente humano: crear el proyecto de Vercel y la base de Supabase.
- [~] 4. Middleware con `cabecerasDeSeguridad()` importada de `src/lib/seguridad/csp.ts`; capturar cabeceras de página dinámica, prerenderizada, 404, 307 y redirección del formulario.
  - Capturadas contra la salida de `astro build` en el emulador local. Las prerenderizadas necesitaron una integración propia (el middleware no corre en la CDN). Falta la captura en el preview.
- [~] 5. Página con un componente React de `src/components/` renderizado en servidor; captura de consola sin violaciones de CSP.
  - `/componente-react` con `SelloVerificado` y `EtiquetaADomicilio`; consola de Chrome vacía en local. Falta la captura en el preview.
- [x] 6. Formulario de reporte con Astro Action (`accept: 'form'`), PRG y error "Dinos qué pasa con este negocio"; página con `Referrer-Policy: strict-origin`.
- [~] 7. Probar el formulario con JS apagado en Chrome y Firefox: `Origin` del sitio, sin 500, recarga sin reenvío.
  - Chrome 154 con JS apagado en local: pasa. Firefox no está instalado aquí; falta Chrome y Firefox en el preview.
- [~] 8. Sesión: emitir cookie firmada (`HttpOnly`, `SameSite`, `Secure`), verificarla en middleware; evidencia de 200 / 307 sin cookie / 307 con cookie alterada / error visible sin secreto.
  - Las cuatro evidencias, en local. Falta repetirlas en el preview (HTTPS real).
- [~] 9. Página de lectura con Prisma sobre `sslmode=verify-full` y certificado de Supabase vía `includeFiles`; evidencia en la salida del build y error visible sin certificado o sin URL.
  - Certificado dentro de `_render.func/certs/`; lectura contra la base local; errores visibles sin URL, sin `verify-full` y sin certificado. Falta la conexión `verify-full` real contra Supabase.
- [~] 10. Rendimiento: red sin JS propio en páginas sin formulario; Lighthouse móvil del spike y de la portada de producción en la misma corrida.
  - 0 JS propio en todas las páginas (local). Lighthouse local 100, solo indicativo; falta la corrida comparada en el preview.
- [~] 11. Escribir `docs/decisiones/ADR-013-spike.md` con veredicto, evidencia y costo por punto y recomendación go/no-go.
  - Escrito con la evidencia local y los costos encontrados; veredictos del preview en "sin evidencia aún" y SIN recomendación go/no-go hasta que haya preview.
- [ ] 12. Si algún punto falla: ADR-013 a `rechazada` y su fila en `docs/decisiones/README.md`; si no, dejar su estado como está.
  - No aplica todavía: ningún punto tiene veredicto de preview.
