/**
 * Sembrador de las tareas programadas (change `migrar-tareas-programadas-astro`,
 * design.md §6; tasks.md #3). Deja la base y el almacén de fotos en el estado
 * inicial de un caso, igual para Next y para Astro, y dice cómo quedaron
 * después. Lo usan el diff (`scripts/diff-html.mjs --capturar-6a|--solo-6a`) y
 * las pruebas sobre la build.
 *
 * Todo ficticio (repo público + LFPDPPP): WhatsApp de la serie `77199966xx`,
 * nombres inventados, claves de foto `f6a…` fijas (así los dos lados las
 * comparan sin traducir) y marcas de cupo con clave `f6a-tareas:…`. Lo que
 * siembra lo borra `limpiarTareas`, por prefijo; nunca toca nada ajeno salvo
 * en `barrido-detenido` con `vaciarBase` (solo en la base del diff, que es
 * suya: la suite comprueba en cambio que la base ya está vacía).
 *
 *   npx tsx scripts/sembrar-tareas.mjs <estado> <FOTOS_DIR>     (DATABASE_URL del entorno)
 *   npx tsx scripts/sembrar-tareas.mjs --limpiar <FOTOS_DIR>
 *
 * `consultar(sql, params)` devuelve las filas (un `pg.Client` envuelto).
 */
import { mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PREFIJO_WHATSAPP = "77199966";
export const PREFIJO_CUPO = "f6a-tareas:";
const PREFIJO_FOTO = "f6a";
const DIA_MS = 24 * 60 * 60 * 1000;

/** Una clave de foto válida (`[0-9a-f]{32}`) y fija: `f6a000…0<n>`. */
export const claveDeFoto = (n) => `${PREFIJO_FOTO}${String(n).padStart(29, "0")}`;
const whatsapp = (n) => `${PREFIJO_WHATSAPP}${String(n).padStart(2, "0")}`;

/** Los nombres de las fichas en revisión del caso de privacidad: no pueden salir en el correo. */
export const NOMBRES_EN_REVISION = ["Tortillería Ficticia La Esquina", "Estética Inventada Brillo", "Cerrajería de Mentiras Llave"];

/**
 * Los estados iniciales. Cada ficha: `[n, estado, { diasRechazo?, foto?, nombre? }]`;
 * `huerfanas`: `[n, "vieja" | "reciente"]`; `fotoRota`: la clave cuya variante
 * `ficha` es un DIRECTORIO (el almacén no la puede borrar, la técnica que
 * nombra `src/lib/purga/rechazados.ts`).
 */
export const ESTADOS_6A = {
  vacio: { fichas: [] },
  // Un rechazado de 91 días con foto, una huérfana vieja y una marca de cupo caducada.
  puerta: { fichas: [[1, "rechazado", { diasRechazo: 91, foto: 1 }]], huerfanas: [[9, "vieja"]], cupoCaducado: true },
  // Dos de 91 (uno con foto), uno de 89, uno sin fecha de rechazo, uno en revisión y una marca caducada.
  purga: {
    fichas: [
      [1, "rechazado", { diasRechazo: 91, foto: 1 }],
      [2, "rechazado", { diasRechazo: 91 }],
      [3, "rechazado", { diasRechazo: 89 }],
      [4, "rechazado", {}],
      [5, "en_revision", {}],
    ],
    cupoCaducado: true,
  },
  "purga-foto-rota": { fichas: [[1, "rechazado", { diasRechazo: 91, foto: 2 }], [2, "rechazado", { diasRechazo: 91 }]], fotoRota: 2 },
  // Un rechazado de 91 días y uno en revisión: lo que el aviso tiene que contar.
  aviso: { fichas: [[1, "rechazado", { diasRechazo: 91 }], [5, "en_revision", {}]] },
  "sin-pendientes": { fichas: [[1, "rechazado", { diasRechazo: 91 }]] },
  "tres-pendientes": {
    fichas: NOMBRES_EN_REVISION.map((nombre, i) => [20 + i, "en_revision", { nombre }]),
  },
  // Publicado, en revisión y rechazado reciente con foto; una huérfana vieja y otra recién escrita.
  barrido: {
    fichas: [
      [30, "publicado", { foto: 3 }],
      [31, "en_revision", { foto: 4 }],
      [32, "rechazado", { diasRechazo: 10, foto: 5 }],
    ],
    huerfanas: [[6, "vieja"], [7, "reciente"]],
  },
  // Ninguna ficha en la base y una huérfana en el almacén: la salvaguarda lo detiene.
  "barrido-detenido": { fichas: [], huerfanas: [[6, "vieja"]], baseVacia: true },
  // Un rechazado de 91 días con foto: con el almacén inalcanzable no se puede purgar.
  "con-foto": { fichas: [[1, "rechazado", { diasRechazo: 91, foto: 1 }]] },
};

function escribirFoto(fotosDir, clave, antiguedadMs, ahora, rota = false) {
  mkdirSync(fotosDir, { recursive: true });
  const fecha = new Date(ahora.getTime() - antiguedadMs);
  for (const variante of ["tarjeta", "ficha"]) {
    const archivo = path.join(fotosDir, `${clave}.${variante}.webp`);
    if (rota && variante === "ficha") mkdirSync(archivo, { recursive: true });
    else writeFileSync(archivo, `bytes ficticios ${variante}`);
    utimesSync(archivo, fecha, fecha);
  }
}

/** Borra lo que siembra este módulo: fichas `77199966xx`, marcas `f6a-tareas:` y archivos `f6a…`. */
export async function limpiarTareas(consultar, fotosDir) {
  await consultar(`DELETE FROM "Negocio" WHERE whatsapp LIKE $1`, [`${PREFIJO_WHATSAPP}%`]);
  await consultar(`DELETE FROM "IntentoDeCupo" WHERE clave LIKE $1`, [`${PREFIJO_CUPO}%`]);
  let nombres = [];
  try {
    nombres = readdirSync(fotosDir);
  } catch {
    return;
  }
  for (const nombre of nombres) {
    if (nombre.startsWith(PREFIJO_FOTO)) rmSync(path.join(fotosDir, nombre), { recursive: true, force: true });
  }
}

/**
 * Deja la base y el almacén en `estado`. `vaciarBase`: en `barrido-detenido`,
 * borra TODAS las fichas (solo la base del diff); sin ella, exige que no haya
 * ninguna y lanza si las hay.
 */
export async function sembrarTareas(consultar, fotosDir, estado, { ahora = new Date(), vaciarBase = false } = {}) {
  const definicion = ESTADOS_6A[estado];
  if (!definicion) throw new Error(`estado desconocido del sembrador: ${estado}`);
  await limpiarTareas(consultar, fotosDir);
  if (definicion.baseVacia) {
    if (vaciarBase) await consultar(`DELETE FROM "Negocio"`);
    const [{ total }] = await consultar(`SELECT count(*)::int AS total FROM "Negocio"`);
    if (total !== 0) throw new Error(`barrido-detenido necesita la base sin fichas y hay ${total}`);
  }
  const [categoria] = await consultar(`SELECT id FROM "Categoria" ORDER BY id LIMIT 1`);
  if (!categoria) throw new Error("la base no tiene catálogos: corre `npm run db:seed`");
  for (const [n, estadoFicha, { diasRechazo, foto, nombre }] of definicion.fichas) {
    const clave = foto === undefined ? null : claveDeFoto(foto);
    await consultar(
      `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "consintioAvisoEn", estado, "rechazadoEn", "publicadoEn", "motivoRechazo", "fotoClave")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `cf6atareas${String(n).padStart(15, "0")}`,
        nombre ?? `Negocio Ficticio de Tareas ${n}`,
        categoria.id,
        whatsapp(n),
        new Date(ahora.getTime() - 200 * DIA_MS),
        estadoFicha,
        diasRechazo === undefined ? null : new Date(ahora.getTime() - diasRechazo * DIA_MS),
        estadoFicha === "publicado" ? new Date(ahora.getTime() - 30 * DIA_MS) : null,
        estadoFicha === "rechazado" ? "Motivo ficticio de prueba" : null,
        clave,
      ],
    );
    if (clave) escribirFoto(fotosDir, clave, 2 * 60 * 60 * 1000, ahora, foto === definicion.fotoRota);
  }
  for (const [n, edad] of definicion.huerfanas ?? []) {
    escribirFoto(fotosDir, claveDeFoto(n), edad === "vieja" ? 60 * 60 * 1000 : 0, ahora);
  }
  if (definicion.cupoCaducado) {
    await consultar(`INSERT INTO "IntentoDeCupo" (id, clave, "ocurrioEn") VALUES ($1, $2, $3)`, [
      "cf6atareascupo000000001",
      `${PREFIJO_CUPO}caducado`,
      new Date(ahora.getTime() - 2 * 60 * 60 * 1000),
    ]);
  }
}

/** Cómo quedó lo sembrado: fichas (WhatsApp → estado), archivos `f6a…` y marcas `f6a-tareas:`. */
export async function resumenDeTareas(consultar, fotosDir) {
  const fichas = await consultar(`SELECT whatsapp, estado FROM "Negocio" WHERE whatsapp LIKE $1 ORDER BY whatsapp`, [`${PREFIJO_WHATSAPP}%`]);
  const [{ cupos }] = await consultar(`SELECT count(*)::int AS cupos FROM "IntentoDeCupo" WHERE clave LIKE $1`, [`${PREFIJO_CUPO}%`]);
  let archivos = [];
  try {
    archivos = readdirSync(fotosDir).filter((n) => n.startsWith(PREFIJO_FOTO)).sort();
  } catch {
    archivos = [];
  }
  return { fichas: fichas.map((f) => `${f.whatsapp}:${f.estado}`), archivos, cupos };
}

/**
 * Un `consultar` sobre `DATABASE_URL` (o la que se pase), y cómo cerrarlo.
 *
 * @param {string | undefined} [url]
 * @returns {Promise<{ consultar: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>, cerrar: () => Promise<void> }>}
 */
export async function conectar(url = process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  // Las columnas son `timestamp` sin zona y `pg` serializa un `Date` en la hora LOCAL: se manda en UTC, como Prisma (B2 de la etapa C).
  const utc = (params) => params?.map((p) => (p instanceof Date ? p.toISOString() : p));
  return { consultar: async (sql, params) => (await cliente.query(sql, utc(params))).rows, cerrar: () => cliente.end() };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const [primero, segundo] = process.argv.slice(2);
  const { consultar, cerrar } = await conectar();
  try {
    if (primero === "--limpiar") await limpiarTareas(consultar, path.resolve(segundo));
    else await sembrarTareas(consultar, path.resolve(segundo), primero, { vaciarBase: true });
    console.log(JSON.stringify(await resumenDeTareas(consultar, path.resolve(segundo))));
  } finally {
    await cerrar();
  }
}
