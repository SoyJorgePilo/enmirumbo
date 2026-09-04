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
import { esBaseLocal } from "../src/lib/base-datos/conexion";

export type EntornoScriptDb = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  /** A qué base apunta el comando (ADR-004: PostgreSQL en todos lados). */
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
 * ¿La base a la que apunta el comando vive en la máquina de quien lo corre?
 *
 * Antes esto se preguntaba por el prefijo `file:`, porque en desarrollo la
 * base era un archivo SQLite (ADR-001). Desde el change
 * `preparar-deploy-produccion` (ADR-004) TODOS los entornos son PostgreSQL, y
 * "local" pasa a significar lo único que sigue siendo cierto: que el host de
 * la conexión es esta misma máquina.
 *
 * ITERACIÓN 2 (hallazgo A1 de la etapa C): el host se pregunta al MISMO parser
 * que usa el driver (`src/lib/base-datos/conexion.ts`), no al `hostname` de la
 * URL. Una cadena puede llevar `?host=db.supabase.co` con `localhost` en la
 * parte visible: el driver se conecta a Supabase y la lectura ingenua decía
 * "es local", con lo que `npm run db:seed:demo` sembraba doce negocios de
 * mentira en la base de verdad sin pedir permiso.
 *
 * Sin `DATABASE_URL` se usa el default local de `src/lib/base-local.ts`, así
 * que se considera local. Una dirección que no se pueda interpretar se
 * considera REMOTA: ante la duda, la respuesta cara es la segura.
 */
export function apuntaABaseLocal(env: EntornoScriptDb): boolean {
  const url = normalizarValorDeEntorno(env.DATABASE_URL);
  if (url === "") return true;
  return esBaseLocal(url);
}
