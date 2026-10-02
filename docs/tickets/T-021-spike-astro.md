# T-021 · Spike de Astro: ¿se puede migrar sin romper lo que no se negocia?

**Estado:** en-review <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E9 (docs/backlog.md)
**Referencias PRD:** v2 §10 (técnica reemplazable); §2.1, §2.5, §2.7
**Depende de:** — (ADR-013)
**OpenSpec change:** `explorar-migracion-astro`
**PR:** —

## Contexto

ADR-013 propone migrar de Next.js a Astro (Fases 1-6) pero lo condiciona a un spike: cinco puntos donde la migración podría romper un principio de negocio. Este ticket es solo ese spike, en un directorio aparte que NO entra a producción ni toca `src/`. Su entregable es evidencia para decidir ADR-013, no código reutilizable.

## Criterios de aceptación

- [ ] Existe una mini-app Astro aislada (`spikes/astro/`) desplegada en un preview de Vercel, sin tocar `src/`, `package.json` raíz ni la base de producción.
- [ ] **Formulario sin JavaScript:** un formulario `POST` que invoca una Astro Action funciona con JS desactivado, redirige tras el éxito (POST/Redirect/GET) y, ante error de validación, vuelve a la página con el mensaje en español. Sin `Origin: null` ni 500 (la regresión de T-010 y T-014).
- [ ] **Sesión por cookies:** una cookie firmada, `HttpOnly` y `SameSite`, se emite y se lee en middleware; una ruta protegida responde 307 sin ella.
- [ ] **CSP y cabeceras:** las cabeceras que hoy produce `cabecerasDeSeguridad()` (`src/lib/seguridad/csp.ts`) se sirven en todas las respuestas, la CSP sin `nonce` se mantiene, y una página con un componente React renderizado en servidor no genera violaciones en la consola.
- [ ] **Base:** una página del spike lee de PostgreSQL con Prisma sobre `sslmode=verify-full` y el certificado de Supabase empaquetado (`includeFiles`), contra una base desechable, nunca la de producción.
- [ ] **Rendimiento:** Lighthouse móvil de la página del spike ≥ al de la portada actual (100) y 0 KB de JS propio en las páginas sin formulario interactivo.
- [ ] Un reporte `docs/decisiones/ADR-013-spike.md` con veredicto por punto (pasa / falla / pasa con costo), evidencia y recomendación go/no-go. Si algún punto falla, ADR-013 pasa a `rechazada`.

## Fuera de alcance de este ticket

- Migrar cualquier ruta, componente o prueba real (Fases 1-6, tickets posteriores).
- Cambiar `package.json`, CI, `vercel.json` o el despliegue de producción.
- Reescribir componentes sin React.

## Notas

- El porqué de la migración está pendiente del fundador (ADR-013 §Pendiente): el spike mide viabilidad, no justifica la decisión.
- Aunque es desechable, toca superficies sensibles (sesión, formulario, CSP, datos), así que corre por la ruta completa. La etapa C puede acotarse a esos cuatro puntos.
- Las credenciales del preview y la base desechable van por variables de entorno; nada de secretos en el repo (repo público).
