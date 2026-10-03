/**
 * Ayudantes de las pruebas del panel en Astro (change
 * `migrar-panel-admin-base-astro`, Fase 5a): la siembra de la cola y del
 * listado, las cookies de sesión firmadas a mano y la limpieza.
 *
 * LA SIEMBRA ES DETERMINISTA, para que la captura de Next
 * (`scripts/diff-html.mjs --capturar-5a`) y las pruebas sobre la build pinten
 * el MISMO HTML: identificadores fijos, nombres fijos, fechas de registro
 * fijas a mediodía (ninguna zona horaria las cambia de día) y las esperas de
 * la cola como desfases de `ahora` lejos de los cortes (3 h, 50 h, 8 meses),
 * así que dos capturas en el mismo minuto dicen lo mismo (design.md §7).
 *
 * Todo ficticio: WhatsApp de la serie 77199951xx–77199956xx (exclusiva de
 * 5a), nombres "… Ficticio/a …", secretos y contraseñas generados aquí.
 */
import { createHash } from "node:crypto";

import { claveDeCupo } from "../src/lib/cupos/compartido";
import { CUPO_ACCESO_PANEL } from "../src/lib/admin/acceso";
import { DURACION_SESION_MS, NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";

/** Lo mínimo del cliente de Prisma que usan estas funciones (el de las pruebas o el de la captura). */
type Cliente = {
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T>;
};

/** Prefijos de WhatsApp de 5a: ninguna otra prueba los usa. */
export const PREFIJOS_5A = ["77199951", "77199952", "77199953", "77199954", "77199955", "77199956"] as const;

const HORA = 60 * 60 * 1000;

/** Un identificador fijo con forma de cuid (25 caracteres, empieza con "c"). */
export function idFijo(etiqueta: string): string {
  return `c5a${createHash("sha256").update(etiqueta).digest("hex").slice(0, 22)}`;
}

/** Mediodía UTC del día `dia` de 2026 (un día que ninguna zona horaria de América cambia). */
function mediodia(mes: number, dia: number): Date {
  return new Date(Date.UTC(2026, mes - 1, dia, 18, 0, 0));
}

async function idDeCategoria(prisma: Cliente): Promise<number> {
  const [fila] = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM "Categoria" ORDER BY id LIMIT 1`);
  if (!fila) throw new Error("no hay categorías sembradas (seedCatalogos)");
  return fila.id;
}

async function idDeColonia(prisma: Cliente, nombre: string): Promise<number> {
  const [fila] = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM "Colonia" WHERE nombre = $1`, nombre);
  if (!fila) throw new Error(`no está sembrada la colonia «${nombre}» (seedCatalogos)`);
  return fila.id;
}

type Alta = {
  id: string;
  nombre: string;
  whatsapp: string;
  estado: string;
  registradoEn: Date;
  colonia?: string;
  coloniaOtra?: string;
  publicadoEn?: Date | null;
  despublicadoEn?: Date | null;
  numeroVerificadoEn?: Date | null;
  rechazadoEn?: Date | null;
};

async function alta(prisma: Cliente, categoriaId: number, a: Alta): Promise<void> {
  const coloniaId = a.colonia ? await idDeColonia(prisma, a.colonia) : null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "consintioAvisoEn", "consintioAvisoVersion", estado, "registradoEn",
       "coloniaId", "coloniaOtra", "publicadoEn", "despublicadoEn", "motivoDespublicacion", "numeroVerificadoEn", "rechazadoEn", "motivoRechazo")
     VALUES ($1, $2, $3, $4, $5, '1', $6, $5, $7, $8, $9, $10, $11, $12, $13, $14)`,
    a.id,
    a.nombre,
    categoriaId,
    a.whatsapp,
    a.registradoEn,
    a.estado,
    coloniaId,
    a.coloniaOtra ?? null,
    a.publicadoEn ?? null,
    a.despublicadoEn ?? null,
    a.despublicadoEn ? "Motivo ficticio de la despublicación" : null,
    a.numeroVerificadoEn ?? null,
    a.rechazadoEn ?? null,
    a.rechazadoEn ? "Motivo ficticio del rechazo" : null,
  );
}

/** Los identificadores de la cola sembrada (para las aserciones y para limpiar). */
export const COLA_5A = {
  atrasada: idFijo("cola-atrasada"),
  reciente: idFijo("cola-reciente"),
  despublicada: idFijo("cola-despublicada"),
  verificada: idFijo("cola-verificada"),
  conEdicion: idFijo("cola-con-edicion"),
  edicion: idFijo("cola-edicion"),
  reportadaTres: idFijo("cola-reportada-tres"),
  reportadaUna: idFijo("cola-reportada-una"),
} as const;

/** Nombres y WhatsApp sembrados en la cola (lo que NO debe salir sin sesión). */
export const SEMBRADO_COLA = {
  nombres: [
    "Herrería Ficticia Atrasada 5a",
    "Estética Ficticia Reciente 5a",
    "Fonda Ficticia Despublicada 5a",
    "Papelería Ficticia Verificada 5a",
    "Carnicería Ficticia Con Edición 5a",
    "Carnicería Ficticia Editada 5a",
    "Taller Ficticio Reportado Tres 5a",
    "Lavandería Ficticia Reportada Una 5a",
  ],
  whatsapps: ["7719995101", "7719995102", "7719995103", "7719995104", "7719995105", "7719995106", "7719995107"],
};

/**
 * La cola del scenario "cola igual a la de hoy": dos altas (50 h, atrasada, y
 * 3 h), una edición pendiente (5 h), una ficha despublicada hace una hora con
 * registro de hace ocho meses, una verificada por SMS (20 h) y dos negocios
 * publicados con 3 y 1 reportes pendientes.
 */
export async function sembrarCola(prisma: Cliente, ahora: Date = new Date()): Promise<void> {
  const categoriaId = await idDeCategoria(prisma);
  const t = (horas: number) => new Date(ahora.getTime() - horas * HORA);
  const [n, w] = [SEMBRADO_COLA.nombres, SEMBRADO_COLA.whatsapps];
  await alta(prisma, categoriaId, { id: COLA_5A.atrasada, nombre: n[0], whatsapp: w[0], estado: "en_revision", registradoEn: t(50), colonia: "Huicalco" });
  await alta(prisma, categoriaId, { id: COLA_5A.reciente, nombre: n[1], whatsapp: w[1], estado: "en_revision", registradoEn: t(3), coloniaOtra: "Colonia Ficticia Escrita A Mano" });
  await alta(prisma, categoriaId, {
    id: COLA_5A.despublicada,
    nombre: n[2],
    whatsapp: w[2],
    estado: "en_revision",
    registradoEn: t(24 * 240),
    publicadoEn: t(24 * 200),
    despublicadoEn: t(1),
    colonia: "Atempa",
  });
  await alta(prisma, categoriaId, { id: COLA_5A.verificada, nombre: n[3], whatsapp: w[3], estado: "en_revision", registradoEn: t(20), numeroVerificadoEn: t(19), colonia: "Geovillas" });
  await alta(prisma, categoriaId, { id: COLA_5A.conEdicion, nombre: n[4], whatsapp: w[4], estado: "publicado", registradoEn: t(24 * 30), publicadoEn: t(24 * 29), colonia: "Nacozari" });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EdicionPendiente" (id, "negocioId", nombre, "categoriaId", whatsapp, "coloniaId", estado, "creadaEn")
     VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7)`,
    COLA_5A.edicion,
    COLA_5A.conEdicion,
    n[5],
    categoriaId,
    w[4],
    await idDeColonia(prisma, "Nacozari"),
    t(5),
  );
  await alta(prisma, categoriaId, { id: COLA_5A.reportadaTres, nombre: n[6], whatsapp: w[5], estado: "publicado", registradoEn: t(24 * 60), publicadoEn: t(24 * 59), colonia: "Huitzila" });
  await alta(prisma, categoriaId, { id: COLA_5A.reportadaUna, nombre: n[7], whatsapp: w[6], estado: "publicado", registradoEn: t(24 * 90), publicadoEn: t(24 * 89), colonia: "Emiliano Zapata" });
  const reportes: Array<[string, string, string, number]> = [
    [idFijo("reporte-1"), COLA_5A.reportadaTres, "cerrado", 30],
    [idFijo("reporte-2"), COLA_5A.reportadaTres, "datos_incorrectos", 20],
    [idFijo("reporte-3"), COLA_5A.reportadaTres, "no_real", 10],
    [idFijo("reporte-4"), COLA_5A.reportadaUna, "cerrado", 7],
  ];
  for (const [id, negocioId, motivo, horas] of reportes) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Reporte" (id, "negocioId", motivo, comentario, estado, "creadoEn") VALUES ($1, $2, $3, 'comentario ficticio', 'pendiente', $4)`,
      id,
      negocioId,
      motivo,
      t(horas),
    );
  }
}

const ESTADOS_DEL_LISTADO = ["publicado", "en_revision", "rechazado"] as const;

/** WhatsApp del renglón `i` del listado (serie 77199952xx–77199956xx). */
export function whatsappDelListado(i: number): string {
  return `${PREFIJOS_5A[1 + Math.floor(i / 100)]}${String(i % 100).padStart(2, "0")}`;
}

/**
 * `cantidad` negocios para "Todos los negocios" (hasta 500), con estados
 * alternados, un despublicado de cada 7 publicados y fechas de registro
 * fijas (un día distinto por renglón, a mediodía UTC).
 */
export async function sembrarListado(prisma: Cliente, cantidad: number): Promise<void> {
  if (cantidad > 500) throw new Error("sembrarListado: a lo sumo 500");
  const categoriaId = await idDeCategoria(prisma);
  for (let i = 0; i < cantidad; i++) {
    const estado = ESTADOS_DEL_LISTADO[i % 3];
    const registradoEn = new Date(mediodia(1, 1).getTime() - i * 24 * HORA);
    const despublicado = estado === "en_revision" && i % 7 === 1;
    await alta(prisma, categoriaId, {
      id: idFijo(`listado-${i}`),
      nombre: `Negocio Ficticio Del Listado ${String(i).padStart(3, "0")}`,
      whatsapp: whatsappDelListado(i),
      estado,
      registradoEn,
      colonia: i % 2 === 0 ? "Tizayuca Centro" : undefined,
      coloniaOtra: i % 2 === 0 ? undefined : "Fraccionamiento Ficticio",
      publicadoEn: estado === "publicado" || despublicado ? registradoEn : null,
      despublicadoEn: despublicado ? new Date(registradoEn.getTime() + HORA) : null,
      rechazadoEn: estado === "rechazado" ? registradoEn : null,
    });
  }
}

/** Borra todo lo sembrado por 5a (ediciones y reportes caen en cascada). */
export async function borrarLoDe5a(prisma: Cliente): Promise<void> {
  const patrones = PREFIJOS_5A.map((p) => `${p}%`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Negocio" WHERE whatsapp LIKE ANY($1::text[])`, patrones);
}

/** Cuántos negocios de 5a quedan en la base (lo que vigila el `afterAll`). */
export async function cuantosDe5a(prisma: Cliente): Promise<number> {
  const [fila] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM "Negocio" WHERE whatsapp LIKE ANY($1::text[])`,
    PREFIJOS_5A.map((p) => `${p}%`),
  );
  return Number(fila.n);
}

// ── Cookies de sesión firmadas a mano (design.md §1.5 y §2.1) ───────────────

export type TipoDeSesion =
  | "vigente"
  | "firma-alterada"
  | "otro-secreto"
  | "vencida"
  | "no-canonica"
  | "dieciseis-digitos";

/** El VALOR de `nu_panel` de ese tipo, firmado con `secreto` (o con otro, si se pide). */
export function valorDeSesion(tipo: TipoDeSesion, secreto: string, ahora: Date = new Date()): string {
  switch (tipo) {
    case "vigente":
      return crearValorDeSesion(secreto, ahora);
    case "firma-alterada": {
      const valor = crearValorDeSesion(secreto, ahora);
      const ultimo = valor.at(-1) === "A" ? "B" : "A";
      return `${valor.slice(0, -1)}${ultimo}`;
    }
    case "otro-secreto":
      return crearValorDeSesion(`${secreto}-otro`, ahora);
    case "vencida":
      // Venció hace un segundo.
      return crearValorDeSesion(secreto, new Date(ahora.getTime() - DURACION_SESION_MS - 1000));
    case "no-canonica":
      // La misma caducidad firmada, escrita con un cero a la izquierda.
      return `0${crearValorDeSesion(secreto, ahora)}`;
    case "dieciseis-digitos":
      // Caducidad de 16 dígitos (la fecha más lejana que admite `Date`), bien firmada.
      return crearValorDeSesion(secreto, new Date(8.64e15 - DURACION_SESION_MS));
  }
}

/** La cabecera `cookie` con la sesión de ese tipo. */
export function cookieDeSesion(tipo: TipoDeSesion, secreto: string, ahora: Date = new Date()): string {
  return `${NOMBRE_COOKIE_SESION}=${valorDeSesion(tipo, secreto, ahora)}`;
}

export const SESIONES_INVALIDAS: ReadonlyArray<Exclude<TipoDeSesion, "vigente">> = [
  "firma-alterada",
  "otro-secreto",
  "vencida",
  "no-canonica",
  "dieciseis-digitos",
];

// ── Intentos de acceso (filas de `IntentoDeCupo`) ───────────────────────────

/** La clave del cupo de acceso de esa IP con ese secreto (nunca la IP en claro). */
export function claveDeAcceso(ip: string, secreto: string): string {
  return claveDeCupo(CUPO_ACCESO_PANEL, ip, secreto);
}

/** Cuántas filas de intentos tiene esa IP. */
export async function intentosDe(prisma: Cliente, ip: string, secreto: string): Promise<number> {
  const [fila] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM "IntentoDeCupo" WHERE clave = $1`,
    claveDeAcceso(ip, secreto),
  );
  return Number(fila.n);
}

/** Borra las filas de intentos de esas IP (las de la prueba; nunca las de otra). */
export async function borrarIntentos(prisma: Cliente, ips: Iterable<string>, secreto: string): Promise<void> {
  const claves = [...ips].map((ip) => claveDeAcceso(ip, secreto));
  if (claves.length) await prisma.$executeRawUnsafe(`DELETE FROM "IntentoDeCupo" WHERE clave = ANY($1::text[])`, claves);
}

/** Envejece las filas de intentos de esa IP `ms` milisegundos (la ventana vence sin tocar el reloj de `src/lib/`). */
export async function envejecerIntentos(prisma: Cliente, ip: string, secreto: string, ms: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "IntentoDeCupo" SET "ocurrioEn" = "ocurrioEn" - ($2::text || ' milliseconds')::interval WHERE clave = $1`,
    claveDeAcceso(ip, secreto),
    String(ms),
  );
}
