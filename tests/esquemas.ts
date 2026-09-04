import { URL_BASE_LOCAL_POR_DEFECTO } from "../src/lib/base-local";

/**
 * Cómo usa la suite la base PostgreSQL de prueba (change
 * `preparar-deploy-produccion`, design.md §3 y §5).
 *
 * Módulo deliberadamente flaco —solo texto y URLs— porque lo importan tanto
 * las pruebas como `vitest.config.mts`, que se evalúa antes de que exista
 * nada del cliente de Prisma.
 *
 * LA BASE LOCAL ES DE USAR Y TIRAR. `tests/global-setup.ts` borra y vuelve a
 * crear el esquema `public` de `DATABASE_URL` en cada corrida. No es descuido:
 * el servidor de `npx prisma dev` (PGlite) comparte UNA SOLA SESIÓN entre
 * todas las conexiones, así que un `SET search_path` de la suite se le filtra
 * a cualquier otro proceso conectado —incluido `next dev`— y la separación
 * "una base para desarrollar, otra para probar" sería mentira. Lo honesto es
 * decirlo: lo que hay en la base local son catálogos y negocios ficticios que
 * se vuelven a poner con `npm run db:seed` y `npm run db:seed:demo`.
 * Quien quiera conservarlos, que apunte `DATABASE_URL` a otro Postgres.
 *
 * Los dos esquemas de abajo son la excepción: pruebas que necesitan una base
 * donde nadie más haya escrito. Se aíslan sin tocar el `search_path` de la
 * sesión —le dicen el esquema al cliente de Prisma, que califica sus
 * consultas— salvo la que replica migraciones a mano, que sí lo mueve y lo
 * deja como estaba al terminar.
 */

/** Esquema donde vive la base de prueba: el mismo que usa la aplicación. */
export const ESQUEMA_PRUEBAS = "public";

/** Esquema propio del seed de demostración (necesita una base sin escribir). */
export const ESQUEMA_SEED_DEMO = "pruebas_seed_demo";

/** Esquema desechable donde se replica el árbol de migraciones a mano. */
export const ESQUEMA_MIGRACION = "pruebas_migracion";

/** Los que `tests/global-setup.ts` deja recién creados antes de la corrida. */
export const ESQUEMAS_DE_LA_SUITE = [
  ESQUEMA_PRUEBAS,
  ESQUEMA_SEED_DEMO,
  ESQUEMA_MIGRACION,
] as const;

/** La base contra la que corre la suite. */
export function urlDeLaBaseDePrueba(): string {
  return process.env.DATABASE_URL ?? URL_BASE_LOCAL_POR_DEFECTO;
}

/** La misma base, con el `?schema=` que la CLI de Prisma espera. */
export function urlDeEsquema(esquema: string): string {
  const url = new URL(urlDeLaBaseDePrueba());
  url.searchParams.set("schema", esquema);
  return url.toString();
}
