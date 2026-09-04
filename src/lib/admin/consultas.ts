/**
 * Consultas del panel de revisión (spec `revision-admin`, requirements de la
 * cola, del indicador de 48 horas y del detalle del registro).
 *
 * Este módulo es el único que lee datos para el panel, y lo hace SIN filtro
 * de estado publicado: a diferencia de `src/lib/directorio.ts`, aquí se ven
 * los datos personales completos de registros sin publicar. Por eso ninguna
 * página pública lo importa y toda pantalla que lo use pasa antes por
 * `requerirSesionAdmin()` (design.md §3).
 *
 * Recibe el cliente Prisma como parámetro para poder probarse contra la base
 * de prueba, igual que `procesarRegistro`. Nada de lo que lee se escribe en
 * el log.
 */
import { ESTADO_NEGOCIO_DEFAULT, type EstadoNegocio, type OrigenNegocio } from "@/lib/negocio";

/** Meta operativa del PRD §10: responder cada registro en menos de 48 horas. */
export const HORAS_META_REVISION = 48;

const HORA_MS = 60 * 60 * 1000;

/** Fila de la cola, ya lista para pintar. */
export type RegistroColaItem = {
  id: string;
  nombre: string;
  /** La del catálogo o el texto libre que capturó el negocio. */
  coloniaTexto: string;
  /** Desde cuándo espera, en palabras ("Hace 3 horas", "Hace 2 días"). */
  esperaTexto: string;
  /** Lleva más de 48 horas esperando (PRD §10). */
  atrasado: boolean;
};

/** Todo lo que el detalle del panel muestra de un registro. */
export type RegistroAdminDetalle = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  whatsapp: string;
  /** Nombre del catálogo, o `null` si la colonia sigue pendiente de normalizar. */
  coloniaNombre: string | null;
  /** Texto libre capturado cuando el negocio eligió "Otra". */
  coloniaOtra: string | null;
  /** `true` cuando hay texto libre y todavía no se eligió colonia del catálogo. */
  coloniaPendiente: boolean;
  queOfreces: string | null;
  entregaADomicilio: boolean;
  telefonoFijo: string | null;
  direccion: string | null;
  horario: string | null;
  facebookUrl: string | null;
  estado: EstadoNegocio;
  origen: OrigenNegocio;
  registradoEn: Date;
  publicadoEn: Date | null;
  /** Constancia del consentimiento del aviso de privacidad (PRD §8). */
  consintioAvisoEn: Date;
  rechazadoEn: Date | null;
  motivoRechazo: string | null;
};

/** Lo poco que estas consultas necesitan de Prisma (facilita probarlas). */
export type ClientePanel = {
  negocio: {
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown>;
  };
};

type FilaCola = {
  id: string;
  nombre: string;
  registradoEn: Date;
  coloniaOtra: string | null;
  colonia: { nombre: string } | null;
};

type FilaDetalle = FilaCola & {
  whatsapp: string;
  queOfreces: string | null;
  entregaADomicilio: boolean;
  telefonoFijo: string | null;
  direccion: string | null;
  horario: string | null;
  facebookUrl: string | null;
  estado: string;
  origen: string;
  publicadoEn: Date | null;
  consintioAvisoEn: Date;
  rechazadoEn: Date | null;
  motivoRechazo: string | null;
  categoria: { nombre: string };
};

/** Horas completas que lleva esperando un registro. */
function horasEsperando(registradoEn: Date, ahora: Date): number {
  return Math.floor((ahora.getTime() - registradoEn.getTime()) / HORA_MS);
}

/**
 * Desde cuándo espera, en palabras. Hasta la meta de 48 horas se cuenta en
 * horas (que es la unidad en la que el admin opera); a partir de ahí, en
 * días, para no leer "Hace 213 horas".
 */
export function textoEspera(registradoEn: Date, ahora: Date): string {
  const horas = horasEsperando(registradoEn, ahora);
  if (horas < 1) return "Hace menos de una hora";
  if (horas === 1) return "Hace 1 hora";
  if (horas < HORAS_META_REVISION) return `Hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "Hace 1 día" : `Hace ${dias} días`;
}

/** ¿Este registro se pasó de la meta operativa de 48 horas? */
export function estaAtrasado(registradoEn: Date, ahora: Date): boolean {
  return horasEsperando(registradoEn, ahora) > HORAS_META_REVISION;
}

/** Cuántos de la cola llevan más de 48 horas esperando. */
export function contarAtrasados(cola: ReadonlyArray<RegistroColaItem>): number {
  return cola.filter((registro) => registro.atrasado).length;
}

/**
 * Registros en revisión, del más antiguo al más reciente (el que lleva más
 * tiempo esperando, arriba). El "ahora" se inyecta para poder probar el
 * indicador de 48 horas sin depender del reloj.
 */
export async function obtenerColaDeRevision(
  prisma: ClientePanel,
  ahora: Date = new Date(),
): Promise<RegistroColaItem[]> {
  const filas = (await prisma.negocio.findMany({
    where: { estado: ESTADO_NEGOCIO_DEFAULT },
    orderBy: [{ registradoEn: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nombre: true,
      registradoEn: true,
      coloniaOtra: true,
      colonia: { select: { nombre: true } },
    },
  })) as FilaCola[];

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    coloniaTexto:
      fila.colonia?.nombre ?? fila.coloniaOtra?.trim() ?? "Colonia no capturada",
    esperaTexto: textoEspera(fila.registradoEn, ahora),
    atrasado: estaAtrasado(fila.registradoEn, ahora),
  }));
}

/**
 * Detalle completo de un registro, o `null` si ese identificador no existe
 * (el panel responde entonces como no encontrado, sin sugerir nada).
 */
export async function obtenerRegistroParaPanel(
  prisma: ClientePanel,
  id: string,
): Promise<RegistroAdminDetalle | null> {
  if (!id) return null;

  const fila = (await prisma.negocio.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      whatsapp: true,
      registradoEn: true,
      coloniaOtra: true,
      colonia: { select: { nombre: true } },
      categoria: { select: { nombre: true } },
      queOfreces: true,
      entregaADomicilio: true,
      telefonoFijo: true,
      direccion: true,
      horario: true,
      facebookUrl: true,
      estado: true,
      origen: true,
      publicadoEn: true,
      consintioAvisoEn: true,
      rechazadoEn: true,
      motivoRechazo: true,
    },
  })) as FilaDetalle | null;

  if (!fila) return null;

  const coloniaOtra = fila.coloniaOtra?.trim() || null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoriaNombre: fila.categoria.nombre,
    whatsapp: fila.whatsapp,
    coloniaNombre: fila.colonia?.nombre ?? null,
    coloniaOtra,
    coloniaPendiente: fila.colonia === null && coloniaOtra !== null,
    queOfreces: fila.queOfreces,
    entregaADomicilio: fila.entregaADomicilio,
    telefonoFijo: fila.telefonoFijo,
    direccion: fila.direccion,
    horario: fila.horario,
    facebookUrl: fila.facebookUrl,
    estado: fila.estado as EstadoNegocio,
    origen: fila.origen as OrigenNegocio,
    registradoEn: fila.registradoEn,
    publicadoEn: fila.publicadoEn,
    consintioAvisoEn: fila.consintioAvisoEn,
    rechazadoEn: fila.rechazadoEn,
    motivoRechazo: fila.motivoRechazo,
  };
}
