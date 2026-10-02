/**
 * Cliente Prisma del spike, perezoso, con el mismo adaptador de driver que la
 * app (`@prisma/adapter-pg`). Solo se crea si `revisarConexion` dio el visto
 * bueno: nunca se abre una conexión remota sin `verify-full`.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

let cliente: PrismaClient | null = null;

export function prisma(url: string): PrismaClient {
  cliente ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return cliente;
}
