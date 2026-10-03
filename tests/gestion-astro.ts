/**
 * Ayudantes de las pruebas de `/editar/[token]` sobre la build y de la captura
 * de fixtures de Next (change `migrar-enlace-gestion-astro`, Fase 4, tasks.md
 * #3). Los usan `tests/plataforma-astro-gestion*.test.ts` y
 * `scripts/diff-html.mjs --capturar-4` (con `tsx`).
 *
 * - Siembra las fichas con enlace de la Fase 4 (publicada, con pendiente,
 *   colonia "Otra", en revisión, rechazada, despublicada, borrada y
 *   regenerada) con tokens GENERADOS AQUÍ (`generarEnlaceDeGestion`): ningún
 *   token se escribe en un archivo; en los fixtures sale como `<T>`.
 * - El disparador de PostgreSQL que hace fallar la escritura de una edición
 *   (scenario "el guardado falla"). Solo se dispara con un horario que lleve
 *   `MARCA_FALLA_GUARDADO`, así que no estorba a ninguna otra prueba aunque un
 *   archivo se cuelgue antes de quitarlo; cada archivo lo quita en `afterAll`.
 * - Buscar un token (completo y su prefijo de 8) en cuerpos, cabeceras y log.
 *
 * Todo ficticio: WhatsApp 7719996xxx, ids `c4…`, dominios `.example`.
 */
import { generarEnlaceDeGestion } from "../src/lib/gestion/token";

export type Consultar = (sql: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;

/** Las fichas de la Fase 4. */
export const FICHAS_DE_4 = [
  "publicada",
  "pendiente",
  "coloniaOtra",
  "revision",
  "rechazada",
  "despublicada",
  "borrada",
  "regenerada",
  "cupo",
  "falla",
  "envios",
  "regenerable",
] as const;
export type FichaDe4 = (typeof FICHAS_DE_4)[number];

/** WhatsApp (ficticios) de cada ficha, en la serie `77199966xx`. */
export function whatsappsDe4(serie = "77199966"): Record<FichaDe4, string> {
  return Object.fromEntries(FICHAS_DE_4.map((ficha, i) => [ficha, `${serie}${String(i + 1).padStart(2, "0")}`])) as Record<
    FichaDe4,
    string
  >;
}

/** Lo que trae la ficha publicada: lo que se ve prellenado en la pantalla. */
export const DATOS_DE_4 = {
  nombre: "Cerrajería Ficticia La Llave",
  queOfreces: "Copias de llaves inventadas",
  telefonoFijo: "7717770400",
  direccion: "Junto a una tienda inventada",
  horario: "L-S 9am-6pm",
} as const;

/** Lo que mandó el dueño de la ficha con pendiente. */
export const HORARIO_PENDIENTE = "L-D 7am-10pm (pendiente ficticia)";
export const COLONIA_OTRA_TEXTO = "Barrio Ficticio Sin Normalizar";

/** El horario que hace fallar el `INSERT` de una edición (disparador de prueba). */
export const MARCA_FALLA_GUARDADO = "Horario ficticio que no se deja guardar";

export type SembradoDe4 = {
  /** Token vigente (o, en las no publicadas, el que tenía) de cada ficha. */
  tokens: Record<FichaDe4, string>;
  /** El token NUEVO de la ficha regenerada (el viejo es `tokens.regenerada`). */
  regeneradaNueva: string;
  ids: Record<FichaDe4, string>;
  whatsapps: Record<FichaDe4, string>;
};

/** Identificador estable (cuid ficticio de 25 caracteres) de cada ficha. */
const idDe = (serie: string, i: number) => `c4g${serie}${String(i).padStart(2, "0")}`.padEnd(25, "0").slice(0, 25);

/**
 * Borra las fichas de la serie y vuelve a sembrarlas desde cero (con sus
 * ediciones: caen en cascada). Devuelve los tokens, que SOLO viven en memoria.
 */
export async function sembrarFichasDe4(
  consultar: Consultar,
  opciones: { categoriaId: number; coloniaId: number; serie?: string },
): Promise<SembradoDe4> {
  const serie = opciones.serie ?? "77199966";
  const whatsapps = whatsappsDe4(serie);
  await borrarFichasDe4(consultar, serie);
  const tokens = {} as Record<FichaDe4, string>;
  const ids = {} as Record<FichaDe4, string>;
  const fecha = new Date("2026-08-02T10:00:00.000Z");
  for (const [i, ficha] of FICHAS_DE_4.entries()) {
    const enlace = generarEnlaceDeGestion(fecha);
    tokens[ficha] = enlace.token;
    ids[ficha] = idDe(serie.slice(-4), i + 1);
    const estado = ficha === "revision" || ficha === "despublicada" ? "en_revision" : ficha === "rechazada" ? "rechazado" : "publicado";
    const otra = ficha === "coloniaOtra";
    await consultar(
      `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "coloniaId", "coloniaOtra", "queOfreces", "telefonoFijo", direccion, horario,
         "consintioAvisoEn", "consintioAvisoVersion", estado, origen, "publicadoEn", "rechazadoEn", "despublicadoEn", "numeroVerificadoEn",
         "tokenGestionHash", "tokenGestionCreadoEn")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '2026-08-01T10:00:00Z', '1', $11, 'organico', $12, $13, $14, $15, $16, $17)`,
      [
        ids[ficha],
        `${DATOS_DE_4.nombre} ${i + 1}`,
        opciones.categoriaId,
        whatsapps[ficha],
        otra ? null : opciones.coloniaId,
        otra ? COLONIA_OTRA_TEXTO : null,
        DATOS_DE_4.queOfreces,
        DATOS_DE_4.telefonoFijo,
        DATOS_DE_4.direccion,
        DATOS_DE_4.horario,
        estado,
        estado === "publicado" || ficha === "despublicada" ? fecha : null,
        ficha === "rechazada" ? fecha : null,
        ficha === "despublicada" ? fecha : null,
        ficha === "publicada" ? fecha : null,
        enlace.columnas.tokenGestionHash,
        fecha,
      ],
    );
  }
  await consultar(
    `INSERT INTO "EdicionPendiente" (id, "negocioId", nombre, "categoriaId", whatsapp, "coloniaId", "queOfreces", "telefonoFijo", direccion, horario, estado, "creadaEn")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendiente', '2026-08-03T10:00:00Z')`,
    [
      idDe(`${serie.slice(-4)}p`, 1),
      ids.pendiente,
      `${DATOS_DE_4.nombre} 2`,
      opciones.categoriaId,
      whatsapps.pendiente,
      opciones.coloniaId,
      DATOS_DE_4.queOfreces,
      DATOS_DE_4.telefonoFijo,
      DATOS_DE_4.direccion,
      HORARIO_PENDIENTE,
    ],
  );
  await consultar(`DELETE FROM "Negocio" WHERE id = $1`, [ids.borrada]);
  const nueva = generarEnlaceDeGestion();
  await consultar(`UPDATE "Negocio" SET "tokenGestionHash" = $1, "tokenGestionCreadoEn" = now() WHERE id = $2`, [
    nueva.columnas.tokenGestionHash,
    ids.regenerada,
  ]);
  return { tokens, regeneradaNueva: nueva.token, ids, whatsapps };
}

/** Le da a la ficha un enlace nuevo (el anterior deja de abrir) y devuelve el token nuevo. */
export async function regenerarEnlace(consultar: Consultar, negocioId: string): Promise<string> {
  const nueva = generarEnlaceDeGestion();
  await consultar(`UPDATE "Negocio" SET "tokenGestionHash" = $1, "tokenGestionCreadoEn" = now() WHERE id = $2`, [
    nueva.columnas.tokenGestionHash,
    negocioId,
  ]);
  return nueva.token;
}

/** Borra las fichas de esa serie (sus ediciones caen en cascada). */
export async function borrarFichasDe4(consultar: Consultar, serie = "77199966"): Promise<void> {
  await consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${serie}%`]);
}

/**
 * El disparador de prueba: hace fallar el `INSERT` de una edición cuyo
 * horario lleva `MARCA_FALLA_GUARDADO` (el resto pasa). Idempotente.
 */
export async function instalarFallaDeGuardado(consultar: Consultar): Promise<void> {
  await consultar(
    `CREATE OR REPLACE FUNCTION prueba_falla_guardado_edicion() RETURNS trigger AS $$
     BEGIN
       IF NEW.horario LIKE '%${MARCA_FALLA_GUARDADO}%' THEN
         RAISE EXCEPTION 'falla de guardado de prueba';
       END IF;
       RETURN NEW;
     END $$ LANGUAGE plpgsql`,
    [],
  );
  await consultar(`DROP TRIGGER IF EXISTS prueba_falla_guardado_edicion ON "EdicionPendiente"`, []);
  await consultar(
    `CREATE TRIGGER prueba_falla_guardado_edicion BEFORE INSERT ON "EdicionPendiente"
     FOR EACH ROW EXECUTE FUNCTION prueba_falla_guardado_edicion()`,
    [],
  );
}

/** Quita el disparador de prueba (y su función). */
export async function quitarFallaDeGuardado(consultar: Consultar): Promise<void> {
  await consultar(`DROP TRIGGER IF EXISTS prueba_falla_guardado_edicion ON "EdicionPendiente"`, []);
  await consultar(`DROP FUNCTION IF EXISTS prueba_falla_guardado_edicion()`, []);
}

/** ¿Queda el disparador de prueba en la base? */
export async function hayFallaDeGuardado(consultar: Consultar): Promise<boolean> {
  const filas = await consultar(`SELECT 1 FROM pg_trigger WHERE tgname = 'prueba_falla_guardado_edicion'`, []);
  return filas.length > 0;
}

/**
 * Lo que dejó la edición en la base para esa ficha, sin ids ni fechas: las
 * pendientes (con sus campos) y cuántas quedaron descartadas. Lo que se
 * compara entre Next y Astro.
 */
export async function resumenDeEdiciones(consultar: Consultar, negocioId: string) {
  const filas = await consultar(
    `SELECT estado, nombre, whatsapp, "coloniaId" IS NULL AS "sinColonia", "coloniaOtra", "queOfreces", "entregaADomicilio", "telefonoFijo",
            direccion, horario, "facebookUrl", "motivoDescarte", "resueltaEn" IS NOT NULL AS resuelta
       FROM "EdicionPendiente" WHERE "negocioId" = $1 ORDER BY "creadaEn", estado`,
    [negocioId],
  );
  return filas;
}

/** La fila completa de la ficha (para exigir que no cambió ni una columna). */
export async function filaDeLaFicha(consultar: Consultar, negocioId: string) {
  const [fila] = await consultar(`SELECT * FROM "Negocio" WHERE id = $1`, [negocioId]);
  return fila ?? null;
}

/** Dónde aparece el token (completo o su prefijo de 8 caracteres) en un texto. */
export function apariciones(texto: string, token: string): string[] {
  const salida: string[] = [];
  for (const aguja of [token, token.slice(0, 8)]) {
    let i = texto.indexOf(aguja);
    while (i !== -1) {
      salida.push(texto.slice(Math.max(0, i - 40), i + aguja.length + 40));
      i = texto.indexOf(aguja, i + 1);
    }
  }
  return salida;
}

/** El texto con cada token cambiado por su marca (`<T>`, `<T2>`…), para los fixtures. */
export function sinTokens(texto: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((t, [marca, token]) => t.replaceAll(token, marca), texto);
}

/**
 * El contexto de `recorrerEnvioDe4` (`scripts/enviar-formulario.mjs`) sobre
 * una siembra: tokens e ids, las marcas `<T…>` con las que salen en los
 * fixtures, regenerar un enlace y leer las ediciones y la fila de una ficha.
 * Lo usan la captura de fixtures y las pruebas sobre la build.
 */
export function contextoDeEnviosDe4(consultar: Consultar, sembrado: () => SembradoDe4, inventado: string) {
  const nuevos: string[] = [];
  const anonimizar = (texto: string) => {
    const s = sembrado();
    return sinTokens(texto, {
      "<T>": s.tokens.publicada,
      "<T-pendiente>": s.tokens.pendiente,
      "<T-colonia-otra>": s.tokens.coloniaOtra,
      "<T-envios>": s.tokens.envios,
      "<T-cupo>": s.tokens.cupo,
      "<T-falla>": s.tokens.falla,
      "<T-regenerable>": s.tokens.regenerable,
      "<T-inventado>": inventado,
      ...Object.fromEntries(nuevos.map((t, i) => [`<T-nuevo-${i}>`, t])),
      "<id-ajeno>": s.ids.revision,
    });
  };
  return {
    nuevos,
    ctx: {
      get tokens() {
        return sembrado().tokens;
      },
      get ids() {
        return sembrado().ids;
      },
      consultar,
      anonimizar,
      regenerar: async (negocioId: string) => {
        nuevos.push(await regenerarEnlace(consultar, negocioId));
      },
      ediciones: (negocioId: string) => resumenDeEdiciones(consultar, negocioId),
      fila: (negocioId: string) => filaDeLaFicha(consultar, negocioId),
    },
    /** Lo que `enviosDe4` necesita de la siembra. */
    datosDeEnvios: () => ({
      whatsappAjeno: sembrado().whatsapps.revision,
      negocioIdAjeno: sembrado().ids.revision,
      tokenAjeno: sembrado().tokens.revision,
      marcaFalla: MARCA_FALLA_GUARDADO,
    }),
  };
}
