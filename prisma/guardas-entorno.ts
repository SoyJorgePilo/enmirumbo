/**
 * Guardas de entorno compartidas por los scripts de `prisma/` que escriben en
 * la base (`seed-demo.ts` y `backfill-busqueda.ts`).
 *
 * Vivían dentro de `seed-demo.ts`; se extrajeron en la iteración 2 del change
 * `agregar-buscador` (hallazgo B-1 de la etapa C: dos scripts con el mismo
 * perfil de riesgo tenían criterios distintos). Cada script decide QUÉ hacer
 * con estas respuestas y escribe su propio mensaje —lo que se comparte es
 * cómo se reconoce un entorno peligroso, no la política.
 */

export type EntornoScriptDb = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  /** A qué base apunta el comando (ADR-001: en dev, siempre SQLite local). */
  DATABASE_URL?: string;
};

export const normalizarValorDeEntorno = (valor?: string) =>
  valor?.trim().toLowerCase() ?? "";

/**
 * Producción se detecta por entorno. La comparación ignora mayúsculas y
 * espacios: `NODE_ENV=" Production "` es producción igual.
 */
export function esEntornoDeProduccion(env: EntornoScriptDb): boolean {
  return (
    normalizarValorDeEntorno(env.NODE_ENV) === "production" ||
    normalizarValorDeEntorno(env.VERCEL_ENV) === "production"
  );
}

/**
 * ¿La base a la que apunta el comando es un archivo SQLite local?
 *
 * ADR-001: en desarrollo la base siempre es `file:…`. Cualquier otra cosa
 * (`postgresql://`, `prisma://`, `libsql://`…) es una base remota, y una base
 * remota de este proyecto es, hoy por hoy, la de verdad. Sin `DATABASE_URL`
 * se usa el default local de `prisma7.config.ts`, así que se considera local.
 */
export function apuntaABaseLocal(env: EntornoScriptDb): boolean {
  const url = normalizarValorDeEntorno(env.DATABASE_URL);
  return url === "" || url.startsWith("file:");
}
