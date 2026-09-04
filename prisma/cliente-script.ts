/**
 * Cliente Prisma de los comandos de `prisma/` (seed, seed de demostración,
 * relleno del buscador y barrido de fotos huérfanas).
 *
 * Un solo lugar donde se elige el adaptador, para que cambiar de driver no sea
 * cuatro ediciones y un olvido. PostgreSQL en todos los entornos (ADR-004,
 * change `preparar-deploy-produccion`): el mismo `@prisma/adapter-pg` que usa
 * la aplicación en Supabase.
 *
 * Las guardas de "¿a qué base apunto?" NO viven aquí: cada comando decide su
 * política con `prisma/guardas-entorno.ts`.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { motivoDeConexionInsegura } from "../src/lib/base-datos/conexion";
import { URL_BASE_LOCAL_POR_DEFECTO } from "../src/lib/base-local";

export function crearClienteDeScript(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? URL_BASE_LOCAL_POR_DEFECTO;

  // Mismo fail-closed que la aplicación (hallazgo A2 de la etapa C): estos
  // comandos son justo los que se corren contra Supabase desde una laptop, y
  // por ese canal viaja también la contraseña de la base.
  const inseguridad = motivoDeConexionInsegura(connectionString);
  if (inseguridad !== null) throw new Error(inseguridad);

  const adapter = new PrismaPg({
    connectionString,
    // Los comandos son de un solo hilo: más conexiones no los harían más
    // rápidos y sí competirían con el servidor de desarrollo.
    max: 2,
  });
  return new PrismaClient({ adapter });
}
