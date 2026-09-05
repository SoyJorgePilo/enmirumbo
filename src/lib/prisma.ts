/**
 * Cliente Prisma de la aplicación (design.md §6 del change
 * `agregar-formulario-registro`; adaptador y guarda de producción del change
 * `preparar-deploy-produccion`, design.md §6).
 *
 * Instancia única y perezosa: se crea en la primera consulta, no al importar
 * el módulo (así `next build` no abre la base para prerenderizar), y se
 * guarda en `globalThis` fuera de producción para que la recarga en caliente
 * de `next dev` no abra una conexión nueva por render.
 *
 * PostgreSQL en todos los entornos (ADR-004): el mismo `@prisma/adapter-pg`
 * en la laptop, en las pruebas, en el CI y en Supabase.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { motivoDeConexionInsegura } from "@/lib/base-datos/conexion";
import { URL_BASE_LOCAL_POR_DEFECTO } from "@/lib/base-local";
import { esProduccion, type EntornoSitio } from "@/lib/sitio";

/** Nombre de la variable con la dirección de la base. */
export const VARIABLE_BASE_DATOS = "DATABASE_URL";

/**
 * A qué base se conecta el sistema, o `null` si no hay ninguna que valga.
 *
 * Fuera de producción, sin variable, se usa la base PostgreSQL local
 * (`npm run db:local`): un clon recién hecho arranca sin configurar nada.
 * EN PRODUCCIÓN NO HAY DEFAULT: un default silencioso ahí es un sitio que
 * arranca conectado a una base que no existe y que solo se descubre cuando un
 * vecino ve una pantalla de error. Mismo criterio que `urlSitio`.
 */
export function urlBaseDeDatos(env: EntornoSitio = process.env): string | null {
  const declarada = (env[VARIABLE_BASE_DATOS] ?? "").trim();
  if (declarada !== "") return declarada;
  return esProduccion(env) ? null : URL_BASE_LOCAL_POR_DEFECTO;
}

/** Lo que se le dice a quien opera el sitio cuando falta la variable. */
export const MENSAJE_SIN_BASE_DATOS =
  `[base] falta ${VARIABLE_BASE_DATOS}: en producción no se cae a ninguna base local por defecto, ` +
  `así que ninguna pantalla que lea datos va a funcionar hasta que se configure (ver docs/despliegue.md).`;

/**
 * Razón por la que esta configuración de base NO se puede usar, o `null`.
 *
 * Dos motivos, los dos de la misma familia: cosas que sin comprobación se
 * descubren en producción, tarde y con datos de vecinos adentro.
 *
 * 1. Falta la dirección en producción (no hay default silencioso).
 * 2. La dirección apunta fuera de esta máquina y NO pide TLS. `pg` no cifra
 *    salvo que se lo pidan (hallazgo A2 de la etapa C), así que sin esto todo
 *    el conjunto de datos personales del directorio cruzaría Internet en
 *    claro. Contra una base local no aplica: los bytes no salen del equipo.
 */
export function motivoParaNoAbrirLaBase(
  env: EntornoSitio = process.env,
): string | null {
  const url = urlBaseDeDatos(env);
  if (url === null) return MENSAJE_SIN_BASE_DATOS;
  const inseguridad = motivoDeConexionInsegura(url);
  return inseguridad === null ? null : `[base] ${inseguridad}`;
}

let yaSeAviso = false;

/**
 * Deja constancia en el log —UNA SOLA VEZ por proceso— de que la base no se
 * puede abrir: o falta la dirección, o iría sin cifrar hacia fuera.
 *
 * Una vez y no por petición: cualquiera puede pedir una página pública, así
 * que avisar en cada lectura sería una forma gratis de inundar el log. Mismo
 * patrón que `avisarSinUrlSitioUnaVez`, y se llama en el mismo sitio: el
 * tronco de `src/app/layout.tsx`, o sea al ARRANCAR.
 */
export function avisarSinBaseDeDatosUnaVez(env: EntornoSitio = process.env): void {
  const motivo = motivoParaNoAbrirLaBase(env);
  if (yaSeAviso || motivo === null) return;
  yaSeAviso = true;
  console.error(motivo);
}

/** Solo para pruebas: permite volver a observar el aviso. */
export function reiniciarAvisoDeBaseDeDatos(): void {
  yaSeAviso = false;
}

/**
 * Conexiones abiertas como mucho por proceso.
 *
 * Deliberadamente bajo: en un hosting serverless (ADR-007) hay muchas
 * instancias vivas a la vez, y cada una con un pool grande agota el
 * presupuesto de conexiones del agrupador de Supabase (ADR-004) mucho antes de
 * que al sitio le haga falta esa concurrencia. Un directorio de un pueblo no
 * necesita diez conexiones por instancia; necesita no tumbar la base.
 */
const CONEXIONES_POR_PROCESO = 5;

const almacenGlobal = globalThis as typeof globalThis & {
  prismaEnMiRumbo?: PrismaClient;
};

/** Cliente compartido; PostgreSQL por el adaptador `pg` (ADR-004). */
export function obtenerPrisma(): PrismaClient {
  if (!almacenGlobal.prismaEnMiRumbo) {
    // FAIL-CLOSED: antes que abrir una conexión en claro hacia un servidor
    // remoto —con todos los datos personales del directorio dentro—, no se
    // abre ninguna y se dice por qué.
    const motivo = motivoParaNoAbrirLaBase();
    if (motivo !== null) {
      avisarSinBaseDeDatosUnaVez();
      throw new Error(motivo);
    }
    const connectionString = urlBaseDeDatos()!;
    const adapter = new PrismaPg({ connectionString, max: CONEXIONES_POR_PROCESO });
    almacenGlobal.prismaEnMiRumbo = new PrismaClient({ adapter });
  }
  return almacenGlobal.prismaEnMiRumbo;
}
