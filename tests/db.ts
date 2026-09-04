import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ESQUEMA_PRUEBAS,
  urlDeEsquema,
  urlDeLaBaseDePrueba,
} from "./esquemas";

/**
 * Cuántas conexiones abre cada cliente de la suite: UNA.
 *
 * No es tacañería, es el servidor local. `npx prisma dev` (PGlite) multiplexa
 * TODAS las conexiones sobre una sola sesión de PostgreSQL, así que dos
 * consultas de verdad simultáneas se pisan el protocolo extendido y la base
 * responde cosas como "bind message supplies 5 parameters, but prepared
 * statement \"\" requires 0". Con una sola conexión por cliente, `pg` las
 * encola y el problema desaparece — sin que las pruebas de concurrencia
 * pierdan nada: lo que comprueban es que dos operaciones simultáneas dejen UN
 * solo desenlace, y eso lo decide el `where` de la escritura, no el orden en
 * que viajan los bytes. Contra el `postgres:17` del CI daría igual, porque
 * ahí cada conexión tiene su propia sesión.
 *
 * (Además, el servidor local corta a las 10 conexiones simultáneas, y en un
 * mismo archivo conviven este cliente y el que abre la aplicación.)
 */
const CONEXIONES_POR_CLIENTE = 1;

/**
 * Clientes de base para la suite. El reparto en esquemas y el porqué están en
 * `tests/esquemas.ts`; aquí solo se abren conexiones.
 */

/**
 * Cliente Prisma contra un esquema concreto.
 *
 * El esquema se le pasa al adaptador (que califica las consultas que genera
 * Prisma) y NO se toca el `search_path` de la sesión: el servidor local la
 * comparte entre conexiones y moverla afectaría a todo lo demás.
 */
export function crearClienteEnEsquema(esquema: string): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString: urlDeEsquema(esquema), max: CONEXIONES_POR_CLIENTE },
    { schema: esquema },
  );
  return new PrismaClient({ adapter });
}

/** Cliente Prisma contra la base de prueba compartida por la suite. */
export function crearClientePrueba(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: urlDeLaBaseDePrueba(),
    max: CONEXIONES_POR_CLIENTE,
  });
  return new PrismaClient({ adapter });
}

/**
 * Conexión cruda (sin Prisma) a un esquema de la base de prueba, para lo que
 * se comprueba con SQL a pelo: catálogos del sistema, SQL de migración
 * aplicado a mano…
 *
 * Mueve el `search_path`, que en el servidor local es COMPARTIDO por todas
 * las conexiones. Por eso siempre se cierra con `cerrarConexionCruda`, que lo
 * devuelve al esquema de la suite: si una prueba se lo deja apuntando a su
 * esquema de juguete, la siguiente escribe ahí sin enterarse.
 */
export async function crearConexionCruda(
  esquema: string = ESQUEMA_PRUEBAS,
): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  await cliente.connect();
  await cliente.query(`SET search_path TO "${esquema}"`);
  return cliente;
}

/**
 * Devuelve el `search_path` al esquema de la suite.
 *
 * Hay que llamarla después de cada `prisma migrate deploy` contra un esquema
 * que no sea el compartido: la CLI de Prisma mueve el `search_path` para
 * aplicar ahí las migraciones y, en el servidor local, ese cambio lo ven
 * TODAS las conexiones (la sesión es una sola). Sin esto, el archivo de
 * pruebas siguiente escribe en el esquema de juguete del anterior y falla con
 * errores que no tienen nada que ver con lo que prueba.
 */
export async function restaurarEsquemaCompartido(): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  await cliente.connect();
  try {
    await cliente.query(`SET search_path TO "${ESQUEMA_PRUEBAS}"`);
  } finally {
    await cliente.end();
  }
}

/** Devuelve el `search_path` al esquema de la suite y cierra la conexión. */
export async function cerrarConexionCruda(cliente: pg.Client): Promise<void> {
  try {
    await cliente.query(`SET search_path TO "${ESQUEMA_PRUEBAS}"`);
  } finally {
    await cliente.end();
  }
}

export {
  ESQUEMAS_DE_LA_SUITE,
  ESQUEMA_MIGRACION,
  ESQUEMA_PRUEBAS,
  ESQUEMA_SEED_DEMO,
  urlDeEsquema,
  urlDeLaBaseDePrueba,
} from "./esquemas";
