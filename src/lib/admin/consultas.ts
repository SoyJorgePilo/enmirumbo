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
  /**
   * `true` cuando este renglón llegó a la cola por una despublicación y no por
   * un alta nueva (spec `agregar-despublicar-y-borrado-arco`, requirement
   * "Cola de revisión…", etiqueta "Ya estaba publicada, la despublicaste").
   * Es `false` si el negocio reenvió sus datos después de la despublicación:
   * entonces lo último que le pasó fue el reenvío, y por ahí entró a la cola.
   */
  vieneDeDespublicacion: boolean;
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
  /**
   * Referencia interna de la foto tal como está guardada. El panel la pinta
   * pasándola por `urlDeFoto(..., "panel")`; sin sesión, esa dirección no
   * sirve nada (spec `revision-admin`).
   */
  fotoClave: string | null;
  estado: EstadoNegocio;
  origen: OrigenNegocio;
  registradoEn: Date;
  publicadoEn: Date | null;
  /** Constancia del consentimiento del aviso de privacidad (PRD §8). */
  consintioAvisoEn: Date;
  /**
   * Versión del aviso que se aceptó en esa constancia, o `null` si la ficha
   * es anterior al versionado (change `versionar-aviso-privacidad`): el panel
   * lo dice, no inventa una versión.
   */
  consintioAvisoVersion: string | null;
  /**
   * Reaceptación: cuándo y qué versión, si un reenvío aceptó una versión
   * POSTERIOR a la de la constancia original (hallazgos MEDIO-3 y MEDIO-4 de
   * T-012; ver `procesarRegistro`). No es "otra distinta": con una versión más
   * vieja —un rollback del despliegue— o con una constancia sin versión no se
   * anota nada, y el panel sigue diciendo "versión no registrada".
   */
  reconsintioAvisoEn: Date | null;
  reconsintioAvisoVersion: string | null;
  rechazadoEn: Date | null;
  motivoRechazo: string | null;
  /**
   * Rastro de la última despublicación (spec `agregar-despublicar-y-
   * borrado-arco`): nulos si la ficha nunca se despublicó, y entonces el
   * detalle no pinta sus rótulos ("Cuándo la despublicaste" / "Por qué la
   * despublicaste"). El motivo es interno del panel: no sale a lo público.
   */
  despublicadoEn: Date | null;
  motivoDespublicacion: string | null;
  /**
   * Ids de los giros ya asignados (requirement "Aprobar asigna giros…",
   * scenario "republicar conserva los giros"): el formulario de aprobar llega
   * con ellos marcados para que republicar una ficha despublicada no los
   * borre en silencio (`aprobarRegistro` hace `giros: { set: … }`).
   */
  girosIds: number[];
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
  despublicadoEn: Date | null;
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
  fotoClave: string | null;
  estado: string;
  origen: string;
  publicadoEn: Date | null;
  consintioAvisoEn: Date;
  consintioAvisoVersion: string | null;
  reconsintioAvisoEn: Date | null;
  reconsintioAvisoVersion: string | null;
  rechazadoEn: Date | null;
  motivoRechazo: string | null;
  motivoDespublicacion: string | null;
  categoria: { nombre: string };
  giros: Array<{ id: number }>;
};

/** Horas completas que lleva esperando un registro. */
function horasEsperando(registradoEn: Date, ahora: Date): number {
  return Math.floor((ahora.getTime() - registradoEn.getTime()) / HORA_MS);
}

/**
 * Cuándo entró el registro a la cola: lo más reciente que le pasó, entre su
 * registro (o reenvío, que pisa `registradoEn`) y su despublicación
 * (design.md §3). Una ficha registrada hace ocho meses y despublicada hoy
 * lleva esperando desde hoy; si después de despublicarla el negocio reenvía,
 * manda el reenvío. Así el reloj sobrevive a cualquier orden de eventos sin
 * tener que limpiar el rastro de la despublicación en tres flujos distintos.
 */
export function entradaALaCola(
  registradoEn: Date,
  despublicadoEn: Date | null,
): Date {
  if (despublicadoEn === null) return registradoEn;
  return despublicadoEn.getTime() > registradoEn.getTime() ? despublicadoEn : registradoEn;
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
 *
 * La espera —y el orden— se cuentan desde `entradaALaCola`, no desde
 * `registradoEn` a secas: una ficha despublicada hoy no puede aparecer arriba
 * y marcada como atrasada solo porque su negocio se registró hace meses. El
 * orden final se calcula en memoria porque ese máximo no es una columna; la
 * cola es la lista de pendientes de un solo admin, así que son decenas de
 * filas, no miles.
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
      despublicadoEn: true,
      coloniaOtra: true,
      colonia: { select: { nombre: true } },
    },
  })) as FilaCola[];

  return filas
    .map((fila) => ({
      fila,
      entrada: entradaALaCola(fila.registradoEn, fila.despublicadoEn),
    }))
    .sort(
      (uno, otro) =>
        uno.entrada.getTime() - otro.entrada.getTime() ||
        uno.fila.id.localeCompare(otro.fila.id),
    )
    .map(({ fila, entrada }) => ({
      id: fila.id,
      nombre: fila.nombre,
      coloniaTexto:
        fila.colonia?.nombre ?? fila.coloniaOtra?.trim() ?? "Colonia no capturada",
      esperaTexto: textoEspera(entrada, ahora),
      atrasado: estaAtrasado(entrada, ahora),
      vieneDeDespublicacion:
        fila.despublicadoEn !== null &&
        fila.despublicadoEn.getTime() > fila.registradoEn.getTime(),
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
      fotoClave: true,
      estado: true,
      origen: true,
      publicadoEn: true,
      consintioAvisoEn: true,
      consintioAvisoVersion: true,
      reconsintioAvisoEn: true,
      reconsintioAvisoVersion: true,
      rechazadoEn: true,
      motivoRechazo: true,
      despublicadoEn: true,
      motivoDespublicacion: true,
      giros: { select: { id: true } },
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
    fotoClave: fila.fotoClave,
    estado: fila.estado as EstadoNegocio,
    origen: fila.origen as OrigenNegocio,
    registradoEn: fila.registradoEn,
    publicadoEn: fila.publicadoEn,
    consintioAvisoEn: fila.consintioAvisoEn,
    consintioAvisoVersion: fila.consintioAvisoVersion,
    reconsintioAvisoEn: fila.reconsintioAvisoEn,
    reconsintioAvisoVersion: fila.reconsintioAvisoVersion,
    rechazadoEn: fila.rechazadoEn,
    motivoRechazo: fila.motivoRechazo,
    despublicadoEn: fila.despublicadoEn,
    motivoDespublicacion: fila.motivoDespublicacion,
    girosIds: fila.giros.map((giro) => giro.id),
  };
}
