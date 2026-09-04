/**
 * Relleno de las columnas de búsqueda (`nombreNormalizado` y
 * `queOfrecesNormalizado`) de los negocios ya guardados.
 *
 * Se corre con `npm run db:backfill:busqueda`. Hace falta una sola vez, al
 * aplicar la migración del change `agregar-buscador` sobre una base que ya
 * tenía fichas: esas filas quedan con el default `""` y, sin este relleno, el
 * buscador no las encontraría (spec `modelo-datos`, scenario "las fichas que
 * ya existían quedan encontrables").
 *
 * Es idempotente y conservador (design.md §1): recalcula con la MISMA función
 * que usa el alta (`datosDeBusqueda`) y solo escribe las filas cuyo valor
 * guardado difiere del calculado. Correrlo dos veces seguidas no cambia nada
 * y no toca ningún otro campo del negocio. También sirve de reparación si
 * algún día un camino de escritura se olvida de mantenerlas.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import {
  type EntornoScriptDb,
  apuntaABaseLocal,
  esEntornoDeProduccion,
  normalizarValorDeEntorno,
} from "./guardas-entorno";

export type ResultadoRelleno = {
  /** ¿Se llegó a tocar la base? `false` si la guarda de entorno lo impidió. */
  rellenado: boolean;
  /** Negocios revisados (todos los de la base). */
  revisados: number;
  /** Negocios cuyas columnas de búsqueda hubo que reescribir. */
  actualizados: number;
  mensaje: string;
};

/** Variable con la que se asume el riesgo de rellenar una base que no es local. */
export const VARIABLE_PERMISO_BACKFILL = "BACKFILL_PERMITIR";

export type EntornoBackfill = EntornoScriptDb & {
  /** Permiso explícito para rellenar una base remota o de producción. */
  BACKFILL_PERMITIR?: string;
};

/**
 * Razón por la que este comando NO debe escribir, o `null` si puede
 * (iteración 2 del change `agregar-buscador`, hallazgo B-1 de la etapa C:
 * `prisma/seed-demo.ts` tenía guarda y este script no, teniendo el mismo
 * perfil —los dos escriben en todas las filas de la base a la que apunte
 * `DATABASE_URL`, sin preguntar).
 *
 * La política **no** es idéntica a la del seed, y la diferencia es a
 * propósito: sembrar negocios de mentira en producción no tiene ningún caso
 * de uso legítimo, pero **rellenar sí** —es justo lo que deja encontrables
 * las fichas que ya existían cuando se aplicó la migración—. Por eso aquí el
 * permiso explícito sí abre la puerta de producción: la guarda está para que
 * nadie lo corra por accidente contra la base equivocada, no para prohibirlo.
 */
export function motivoParaNoRellenar(env: EntornoBackfill): string | null {
  if (normalizarValorDeEntorno(env.BACKFILL_PERMITIR) === "1") return null;

  const enProduccion = esEntornoDeProduccion(env);
  if (!enProduccion && apuntaABaseLocal(env)) return null;

  const donde = enProduccion
    ? "Estás en un entorno de producción"
    : "DATABASE_URL no apunta a un archivo SQLite local (ADR-001)";
  return (
    `${donde} y este comando reescribe el texto de búsqueda de TODOS los negocios ` +
    "de esa base. No se cambió nada. Si de verdad quieres rellenar esa base " +
    `(es lo que hay que hacer una vez, después de aplicar la migración), vuelve ` +
    `a correrlo con ${VARIABLE_PERMISO_BACKFILL}=1.`
  );
}

/** Lo único que el relleno necesita de Prisma (así se puede probar). */
export type ClienteRelleno = {
  negocio: {
    findMany(args: {
      select: {
        id: true;
        nombre: true;
        queOfreces: true;
        nombreNormalizado: true;
        queOfrecesNormalizado: true;
      };
    }): Promise<
      Array<{
        id: string;
        nombre: string;
        queOfreces: string | null;
        nombreNormalizado: string;
        queOfrecesNormalizado: string;
      }>
    >;
    update(args: {
      where: { id: string };
      data: { nombreNormalizado: string; queOfrecesNormalizado: string };
    }): Promise<unknown>;
  };
};

export async function rellenarTextoDeBusqueda(
  prisma: ClienteRelleno,
  env: EntornoBackfill = process.env,
): Promise<ResultadoRelleno> {
  const motivo = motivoParaNoRellenar(env);
  if (motivo) {
    return { rellenado: false, revisados: 0, actualizados: 0, mensaje: motivo };
  }

  const negocios = await prisma.negocio.findMany({
    select: {
      id: true,
      nombre: true,
      queOfreces: true,
      nombreNormalizado: true,
      queOfrecesNormalizado: true,
    },
  });

  let actualizados = 0;
  for (const negocio of negocios) {
    const esperado = datosDeBusqueda(negocio.nombre, negocio.queOfreces);
    const yaEstaBien =
      negocio.nombreNormalizado === esperado.nombreNormalizado &&
      negocio.queOfrecesNormalizado === esperado.queOfrecesNormalizado;
    if (yaEstaBien) continue;

    await prisma.negocio.update({ where: { id: negocio.id }, data: esperado });
    actualizados += 1;
  }

  return {
    rellenado: true,
    revisados: negocios.length,
    actualizados,
    mensaje:
      actualizados === 0
        ? `Nada que hacer: los ${negocios.length} negocios ya tenían su texto de búsqueda al día.`
        : `Texto de búsqueda recalculado en ${actualizados} de ${negocios.length} negocios.`,
  };
}

// Ejecución directa (`npm run db:backfill:busqueda`); al importarse desde los
// tests no corre nada.
const ejecutadoDirecto = process.argv[1]?.endsWith("backfill-busqueda.ts") ?? false;
if (ejecutadoDirecto) {
  try {
    // `tsx` no lee .env solo (a diferencia de la CLI de Prisma).
    process.loadEnvFile();
  } catch {
    // Sin .env: se usa la base de dev por default, igual que prisma7.config.ts.
  }
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  });
  const prisma = new PrismaClient({ adapter });
  rellenarTextoDeBusqueda(prisma)
    .then((resultado) => {
      console.log(resultado.mensaje);
      if (!resultado.rellenado) process.exitCode = 1;
    })
    .catch((error) => {
      console.error("No se pudo rellenar el texto de búsqueda:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
