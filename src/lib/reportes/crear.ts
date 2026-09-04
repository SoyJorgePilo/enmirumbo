/**
 * Creación de un reporte del botón "Reportar" (spec `directorio-publico`,
 * requirements "El servidor valida el motivo y el comentario del reporte",
 * "Anti-abuso del reporte sin captcha…" y "Del reportante no se pide ni se
 * guarda ningún dato").
 *
 * Es el corazón de la Server Action, separado de ella para poder probarlo sin
 * un request de Next.js: la acción (`src/app/(publico)/negocio/[ficha]/reportar/
 * accion.ts`) solo saca la IP de los encabezados, llama aquí y redirige.
 * Recibe el cliente Prisma como parámetro, igual que `procesarRegistro` y las
 * consultas del panel.
 *
 * Orden de las defensas (design.md §2 y §3):
 *   1. campo trampa (honeypot) → descarte silencioso, sin tocar la base;
 *   2. motivo de la lista cerrada y cota del comentario (validación pura);
 *   3. el negocio existe y está `publicado` (si no, "no encontrado", el mismo
 *      para inexistente, en revisión y rechazado: no delata nada);
 *   4. cupo por IP: se comprueba y se aparta EN UN SOLO PASO SÍNCRONO;
 *   5. alta ATÓMICA condicionada al tope de pendientes del negocio.
 *
 * **Las dos defensas de volumen son a prueba de peticiones simultáneas**
 * (hallazgos A1 y A2 de la etapa C). Node atiende varias peticiones a la vez y
 * cede el turno en cada `await`: comprobar, ceder el turno y actuar después es
 * lo mismo que no comprobar cuando llegan catorce envíos juntos, que es lo que
 * hace cualquier cliente HTTP/2 sin proponérselo. Por eso aquí:
 *
 * - el cupo por IP se pide con `apartarCupoDeReportes`, que pregunta y aparta
 *   sin ceder el turno a la mitad;
 * - el tope por negocio NO se consulta con un `count` para decidir después:
 *   la condición viaja DENTRO del `INSERT`, en una sola sentencia que SQLite
 *   ejecuta atómicamente, y se mira cuántas filas escribió para saber si
 *   entró o si el negocio ya estaba en el tope.
 *
 * NADA de lo que escribe en el log lleva el comentario, la IP ni datos del
 * negocio: solo el evento (PRD §8).
 */
import { randomUUID } from "node:crypto";

import { ESTADO_NEGOCIO_PUBLICADO } from "@/lib/negocio";

import { ESTADO_REPORTE_PENDIENTE } from "./estados";
import { TOPE_REPORTES_PENDIENTES_POR_NEGOCIO, apartarCupoDeReportes } from "./limite";
import { esMotivoReporteValido } from "./motivos";
import { LIMITE_COMENTARIO_REPORTE } from "./textos";

/**
 * Lo poco que este módulo necesita de Prisma (facilita probarlo).
 *
 * `$executeRaw` es la forma **con parámetros ligados** (plantilla etiquetada:
 * cada `${…}` viaja como parámetro, no como texto concatenado), no la
 * `Unsafe`. Está en el tipo porque el alta tiene que ser una sola sentencia
 * condicionada, y eso no se puede expresar con `reporte.create`.
 */
export type ClienteReportes = {
  negocio: { findUnique(args: unknown): Promise<unknown> };
  $executeRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<number>;
};

export type EntradaReporte = {
  negocioId: string;
  /** Tal como llega de un `FormData`: sin ninguna garantía de forma. */
  motivo: unknown;
  /** Texto crudo del comentario; vacío si no escribió nada. */
  comentario: string;
  /** Contenido del campo trampa: cualquier cosa con texto es un bot. */
  trampa: string;
  /** IP del cliente para el cupo, o `null` si el despliegue no la declara. */
  ip: string | null;
  /** Momento del envío; se inyecta en pruebas. */
  ahora?: Date;
};

export type ResultadoReporte =
  /** Guardado. */
  | { resultado: "creado" }
  /**
   * No se guardó nada y quien reportó DEBE ver la misma confirmación que un
   * reporte legítimo: honeypot lleno y tope de pendientes del negocio. Decir
   * la verdad aquí delataría la trampa o el estado interno de la moderación.
   */
  | { resultado: "descartado-silencioso" }
  /** Ese negocio no existe o no está publicado (404, indistinguibles). */
  | { resultado: "no-encontrado" }
  /** Esta IP ya gastó sus 3 reportes de la hora. */
  | { resultado: "cupo-agotado" }
  | { resultado: "error"; error: "motivo" | "comentario" | "servidor" };

/** Identificación del fallo apta para el log: nunca datos del reporte. */
function resumenDeError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return `código ${String((error as { code?: unknown }).code)}`;
  }
  return error instanceof Error ? error.name : "desconocido";
}

export async function crearReporte(
  prisma: ClienteReportes,
  entrada: EntradaReporte,
): Promise<ResultadoReporte> {
  const ahora = entrada.ahora ?? new Date();

  // 1. Campo trampa: misma confirmación que un envío legítimo, sin guardar
  //    nada y sin tocar la base (requirement "bot que llena el honeypot").
  //
  //    Se compara SIN espacios, igual que el honeypot de altas (`texto()` de
  //    `src/lib/registro/validacion.ts` recorta antes de mirar): un
  //    autocompletado o un teclado que deje un espacio en el campo escondido
  //    no puede tirarle el aviso a una persona, que además vería la
  //    confirmación de éxito y nunca se enteraría (hallazgo M1 de la etapa C).
  //    Un bot que llena formularios escribe algo, no un espacio.
  if (entrada.trampa.trim() !== "") {
    console.warn("[reportes] envío descartado: campo trampa lleno");
    return { resultado: "descartado-silencioso" };
  }

  // 2. Validación pura: el formulario funciona sin JavaScript y un envío puede
  //    llegar directo, así que la lista cerrada se hace valer aquí.
  if (!esMotivoReporteValido(entrada.motivo)) {
    return { resultado: "error", error: "motivo" };
  }
  const motivo = entrada.motivo;

  const comentario = entrada.comentario.trim();
  if (comentario.length > LIMITE_COMENTARIO_REPORTE) {
    return { resultado: "error", error: "comentario" };
  }

  // 3. Solo se reportan fichas publicadas. Un negocio en revisión, uno
  //    rechazado y un id inventado caen en la MISMA rama: la respuesta no
  //    puede servir para averiguar si esa ficha existe.
  let negocio: { estado: string } | null;
  try {
    negocio = (await prisma.negocio.findUnique({
      where: { id: entrada.negocioId },
      select: { estado: true },
    })) as { estado: string } | null;
  } catch (error) {
    console.error(`[reportes] no se pudo leer el negocio: ${resumenDeError(error)}`);
    return { resultado: "error", error: "servidor" };
  }
  if (!negocio || negocio.estado !== ESTADO_NEGOCIO_PUBLICADO) {
    return { resultado: "no-encontrado" };
  }

  // 4. Cupo por IP (3/hora, contador propio). Se comprueba y se aparta de un
  //    tirón: desde aquí hasta el `return` de abajo no se cede el turno, así
  //    que una ráfaga simultánea no puede colarse por la ventana entre las dos
  //    operaciones. Sin `REGISTRO_ENCABEZADO_IP` declarado la IP llega `null`
  //    y este cupo no opera (design.md §2).
  //
  //    Va DESPUÉS de comprobar el negocio a propósito: sondear fichas que no
  //    existen no le gasta el cupo a nadie, y así el cupo tampoco se convierte
  //    en un oráculo de cuáles fichas existen.
  if (!apartarCupoDeReportes(entrada.ip, ahora)) {
    console.warn("[reportes] envío rechazado: cupo por IP agotado");
    return { resultado: "cupo-agotado" };
  }

  // 5. Alta con el tope DENTRO de la sentencia: una sola operación que inserta
  //    solo si el negocio sigue por debajo de sus reportes pendientes. Si el
  //    tope ya estaba alcanzado no escribe nada y devuelve 0 filas.
  //
  //    El `id` lo pone la aplicación porque el `@default(cuid())` del schema lo
  //    genera el cliente de Prisma, no la base: un `INSERT` directo no pasa por
  //    ahí. `randomUUID` es aleatorio y no lleva ningún dato del reportante.
  //
  //    El estado lo fija el servidor: el formulario público solo puede crear
  //    reportes `pendiente` (spec `revision-admin`). Ni una columna del
  //    reportante, porque no existe ninguna.
  let filas: number;
  try {
    filas = await prisma.$executeRaw`
      INSERT INTO "Reporte" ("id", "negocioId", "motivo", "comentario", "estado", "creadoEn", "atendidoEn")
      SELECT ${randomUUID()}, ${entrada.negocioId}, ${motivo}, ${comentario === "" ? null : comentario}, ${ESTADO_REPORTE_PENDIENTE}, ${ahora}, NULL
      WHERE (
        SELECT COUNT(*) FROM "Reporte"
        WHERE "negocioId" = ${entrada.negocioId} AND "estado" = ${ESTADO_REPORTE_PENDIENTE}
      ) < ${TOPE_REPORTES_PENDIENTES_POR_NEGOCIO}
    `;
  } catch (error) {
    console.error(`[reportes] no se pudo guardar el reporte: ${resumenDeError(error)}`);
    return { resultado: "error", error: "servidor" };
  }

  if (filas === 0) {
    console.warn("[reportes] envío descartado: tope de pendientes del negocio");
    return { resultado: "descartado-silencioso" };
  }

  return { resultado: "creado" };
}
