/**
 * La base PostgreSQL local de desarrollo, en un solo lugar.
 *
 * Change `preparar-deploy-produccion` (T-013), design.md §3: el spike eligió
 * `npx prisma dev` —el servidor PostgreSQL 17 que trae el propio Prisma— en
 * vez de Docker, porque no pide instalar nada más que las dependencias del
 * repositorio y un clon recién hecho arranca con un solo comando
 * (`npm run db:local`). Sus puertos son fijos, así que la URL también:
 *
 *   51214 → la base de desarrollo
 *   51215 → la base "sombra" que `prisma migrate dev` usa para detectar drift
 *
 * Quien prefiera un Postgres de verdad (mismo motor y versión que el CI) solo
 * tiene que poner su propia `DATABASE_URL` en `.env`; nada aquí lo impide.
 * Ver `docs/despliegue.md` §"Base de datos local".
 */

export const PUERTO_BASE_LOCAL = 51214;
export const PUERTO_SOMBRA_LOCAL = 51215;

const urlLocal = (puerto: number) =>
  `postgresql://postgres:postgres@localhost:${puerto}/template1?sslmode=disable`;

/** Lo que se usa cuando no hay `DATABASE_URL` (clon recién hecho, sin .env). */
export const URL_BASE_LOCAL_POR_DEFECTO = urlLocal(PUERTO_BASE_LOCAL);

/** Base sombra de `prisma migrate dev` en la misma instalación local. */
export const URL_SOMBRA_LOCAL_POR_DEFECTO = urlLocal(PUERTO_SOMBRA_LOCAL);
