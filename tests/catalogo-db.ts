import type pg from "pg";

/**
 * Preguntas al catálogo de PostgreSQL, en un solo lugar.
 *
 * La suite comprueba invariantes del ESQUEMA —qué columnas existen, qué
 * claves foráneas cascadean, qué CHECK siguen vivos—, y esas preguntas se
 * hacen con SQL específico del motor. Antes eran `PRAGMA table_info` y
 * `sqlite_master`; desde el change `preparar-deploy-produccion` son
 * `information_schema` y `pg_catalog`. Concentrarlas aquí evita que la
 * próxima mudanza sea una cacería por veinte archivos.
 *
 * Todas se refieren al esquema en uso (`current_schema()`), que es el que la
 * conexión tenga en su `search_path`.
 */

/** Cómo se le hace una pregunta a la base, venga de donde venga la conexión. */
export type Consultar = (
  consulta: string,
  ...valores: unknown[]
) => Promise<Array<Record<string, unknown>>>;

/** Adaptador para un cliente de Prisma. */
export function consultarConPrisma(prisma: {
  $queryRawUnsafe<T>(consulta: string, ...valores: unknown[]): Promise<T>;
}): Consultar {
  return (consulta, ...valores) =>
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(consulta, ...valores);
}

/** Adaptador para una conexión cruda de `pg`. */
export function consultarConPg(cliente: pg.Client): Consultar {
  return async (consulta, ...valores) =>
    (await cliente.query(consulta, valores)).rows;
}

/** Nombres de todas las tablas del esquema en uso, sin la interna de Prisma. */
export async function tablasDelEsquema(consultar: Consultar): Promise<string[]> {
  const filas = await consultar(
    `SELECT table_name AS nombre
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  return filas.map((fila) => String(fila.nombre));
}

/** Nombres de las columnas de una tabla, en el orden en que están declaradas. */
export async function columnasDeTabla(
  consultar: Consultar,
  tabla: string,
): Promise<string[]> {
  const filas = await declaracionDeColumnas(consultar, tabla);
  return filas.map((columna) => columna.nombre);
}

export type ColumnaDeclarada = {
  nombre: string;
  esNulable: boolean;
  valorPorDefecto: string | null;
};

/** Las columnas de una tabla con lo que la base dice de cada una. */
export async function declaracionDeColumnas(
  consultar: Consultar,
  tabla: string,
): Promise<ColumnaDeclarada[]> {
  const filas = await consultar(
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
      ORDER BY ordinal_position`,
    tabla,
  );
  return filas.map((fila) => ({
    nombre: String(fila.column_name),
    esNulable: fila.is_nullable === "YES",
    valorPorDefecto: (fila.column_default as string | null) ?? null,
  }));
}

export type ClaveForanea = {
  /** Tabla que guarda la referencia. */
  tabla: string;
  /** Columna de esa tabla. */
  columna: string;
  /** Qué hace la base cuando se borra la fila referenciada. */
  alBorrar: string;
};

/** Todas las claves foráneas del esquema en uso que apuntan a `destino`. */
export async function clavesForaneasHacia(
  consultar: Consultar,
  destino: string,
): Promise<ClaveForanea[]> {
  const filas = await consultar(
    `SELECT origen.relname AS tabla,
            atributo.attname AS columna,
            CASE restriccion.confdeltype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE restriccion.confdeltype::text
            END AS al_borrar
       FROM pg_constraint AS restriccion
       JOIN pg_class AS origen ON origen.oid = restriccion.conrelid
       JOIN pg_class AS referida ON referida.oid = restriccion.confrelid
       JOIN pg_namespace AS espacio ON espacio.oid = origen.relnamespace
       JOIN unnest(restriccion.conkey) AS columna_origen(num) ON true
       JOIN pg_attribute AS atributo
         ON atributo.attrelid = origen.oid AND atributo.attnum = columna_origen.num
      WHERE restriccion.contype = 'f'
        AND espacio.nspname = current_schema()
        AND referida.relname = $1
      ORDER BY tabla, columna`,
    destino,
  );
  return filas.map((fila) => ({
    tabla: String(fila.tabla),
    columna: String(fila.columna),
    alBorrar: String(fila.al_borrar),
  }));
}

/** Nombre y definición de las constraints CHECK declaradas sobre una tabla. */
export async function restriccionesCheck(
  consultar: Consultar,
  tabla: string,
): Promise<Array<{ nombre: string; definicion: string }>> {
  const filas = await consultar(
    `SELECT restriccion.conname AS nombre,
            pg_get_constraintdef(restriccion.oid) AS definicion
       FROM pg_constraint AS restriccion
       JOIN pg_class AS tabla ON tabla.oid = restriccion.conrelid
       JOIN pg_namespace AS espacio ON espacio.oid = tabla.relnamespace
      WHERE restriccion.contype = 'c'
        AND espacio.nspname = current_schema()
        AND tabla.relname = $1
      ORDER BY nombre`,
    tabla,
  );
  return filas.map((fila) => ({
    nombre: String(fila.nombre),
    definicion: String(fila.definicion),
  }));
}
