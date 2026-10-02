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
import { FILTRO_TODOS, type FiltroEstadoListado } from "@/lib/admin/listado-parametros";
import { ESTADO_EDICION_PENDIENTE } from "@/lib/gestion/estados";
import { ESTADO_NEGOCIO_DEFAULT, type EstadoNegocio, type OrigenNegocio } from "@/lib/negocio";
import { tieneByteNulo } from "@/lib/texto";

/** Meta operativa del PRD §10: responder cada registro en menos de 48 horas. */
export const HORAS_META_REVISION = 48;

const HORA_MS = 60 * 60 * 1000;

/**
 * De qué es este renglón de la cola (spec `revision-admin`, requirement "Cola
 * de revisión…" MODIFIED por `agregar-enlace-de-gestion`): un alta nueva o una
 * edición que el negocio mandó desde su enlace.
 */
export type TipoRenglonCola = "alta" | "edicion";

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
  /**
   * `"alta"` o `"edicion"` (change `agregar-enlace-de-gestion`). La cola es
   * una sola lista con las dos cosas y cada renglón dice de qué se trata con
   * una etiqueta de TEXTO, no con un color ni con el orden.
   */
  tipo: TipoRenglonCola;
  /**
   * A dónde lleva "Revisar": el detalle del registro para un alta, el detalle
   * comparativo para una edición.
   */
  hrefDetalle: string;
  /**
   * Cuándo confirmó su código por SMS, o `null`/`undefined` si no lo ha
   * hecho (spec `revision-admin` MODIFIED de T-016, ADR-011; etiqueta
   * "Número verificado por SMS"). Opcional a propósito, mismo criterio que
   * `agregar-despublicar-y-borrado-arco`: los renglones de edición no lo
   * traen, y `TarjetaCola` entonces no pinta ninguna etiqueta.
   */
  numeroVerificadoEn?: Date | null;
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
   * Cuándo se generó el enlace de gestión vigente, o `null` si la ficha nunca
   * se aprobó (change `agregar-enlace-de-gestion`, requirement "Aprobar un
   * registro genera su enlace de gestión…"): el detalle dice que TIENE enlace
   * y desde cuándo, y nada más. **La huella no se lee aquí ni en ninguna otra
   * consulta del panel**, porque el panel no puede mostrar el enlace: no lo
   * conoce (design.md §3). `tests/admin-adversarial.test.ts` lo vigila.
   */
  tokenGestionCreadoEn: Date | null;
  /**
   * Ids de los giros ya asignados (requirement "Aprobar asigna giros…",
   * scenario "republicar conserva los giros"): el formulario de aprobar llega
   * con ellos marcados para que republicar una ficha despublicada no los
   * borre en silencio (`aprobarRegistro` hace `giros: { set: … }`).
   */
  girosIds: number[];
  /**
   * Cuándo confirmó su código por SMS, o `null` si nunca lo hizo (spec
   * `revision-admin` MODIFIED de T-016, ADR-011). Con la capacidad apagada es
   * `null` en todas las fichas, así que el detalle del lanzamiento no pinta
   * ninguna de las dos líneas de verificación — exactamente el de hoy.
   */
  numeroVerificadoEn: Date | null;
};

/**
 * Renglón del listado "Todos los negocios" (change `agregar-listado-
 * gestion-panel`, tasks.md #3): lo mínimo para reconocer una ficha y llegar
 * a ella, nada más — ni WhatsApp, ni teléfono, ni dirección, ni foto, ni
 * motivos (requirement "El listado hereda... la mínima exposición de datos
 * del panel").
 */
export type RegistroListadoItem = {
  id: string;
  nombre: string;
  /** La del catálogo o el texto libre que capturó, mismo criterio que la cola. */
  coloniaTexto: string;
  registradoEn: Date;
  estado: EstadoNegocio;
  /** Mismo criterio que `RegistroColaItem.vieneDeDespublicacion`. */
  vieneDeDespublicacion: boolean;
};

export type ParametrosListadoDeNegocios = {
  estado: FiltroEstadoListado;
  pagina: number;
  porPagina: number;
};

export type ResultadoListadoDeNegocios = {
  registros: RegistroListadoItem[];
  total: number;
};

/** Lo poco que estas consultas necesitan de Prisma (facilita probarlas). */
export type ClientePanel = {
  negocio: {
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
  };
  edicionPendiente: {
    findMany(args: unknown): Promise<unknown[]>;
  };
};

type FilaCola = {
  id: string;
  nombre: string;
  registradoEn: Date;
  despublicadoEn: Date | null;
  coloniaOtra: string | null;
  colonia: { nombre: string } | null;
  /** T-016: nula en todas las fichas mientras la capacidad esté apagada. */
  numeroVerificadoEn: Date | null;
};

/** Renglón de la cola que viene de una edición esperando revisión. */
type FilaColaEdicion = {
  id: string;
  negocioId: string;
  creadaEn: Date;
  coloniaOtra: string | null;
  colonia: { nombre: string } | null;
  negocio: { nombre: string };
};

type FilaListado = {
  id: string;
  nombre: string;
  registradoEn: Date;
  despublicadoEn: Date | null;
  estado: string;
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
  tokenGestionCreadoEn: Date | null;
  categoria: { nombre: string };
  giros: Array<{ id: number }>;
};

/**
 * La colonia que se le enseña al admin: la del catálogo si ya está
 * normalizada, si no el texto libre que capturó el negocio. Una sola función
 * para que la cola y el listado digan lo mismo del mismo registro.
 */
function textoDeColonia(fila: {
  colonia: { nombre: string } | null;
  coloniaOtra: string | null;
}): string {
  return fila.colonia?.nombre ?? fila.coloniaOtra?.trim() ?? "Colonia no capturada";
}

/**
 * ¿Este registro llegó a la cola por una despublicación? Mismo criterio para
 * la cola y para la etiqueta del listado: `despublicadoEn` posterior a
 * `registradoEn` (si el negocio reenvió después, lo último que le pasó fue el
 * reenvío y la etiqueta no aplica).
 */
function vieneDeDespublicacion(registradoEn: Date, despublicadoEn: Date | null): boolean {
  return despublicadoEn !== null && despublicadoEn.getTime() > registradoEn.getTime();
}

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
  const [filas, ediciones] = (await Promise.all([
    prisma.negocio.findMany({
      where: { estado: ESTADO_NEGOCIO_DEFAULT },
      orderBy: [{ registradoEn: "asc" }, { id: "asc" }],
      select: {
        id: true,
        nombre: true,
        registradoEn: true,
        despublicadoEn: true,
        coloniaOtra: true,
        colonia: { select: { nombre: true } },
        // T-016: la etiqueta "Número verificado por SMS" del renglón. Con la
        // capacidad apagada esto es nulo en todas las filas, así que la cola
        // del lanzamiento se ve exactamente como se ve hoy.
        numeroVerificadoEn: true,
      },
    }),
    // Las ediciones que esperan revisión entran a la MISMA cola (PRD §6.4).
    // Solo las `pendiente`: las aplicadas y las descartadas se quedan en la
    // tabla por trazabilidad, no en la lista de pendientes del admin.
    prisma.edicionPendiente.findMany({
      where: { estado: ESTADO_EDICION_PENDIENTE },
      orderBy: [{ creadaEn: "asc" }, { id: "asc" }],
      select: {
        id: true,
        // Hace falta para que un negocio no ocupe dos renglones (ver abajo).
        negocioId: true,
        creadaEn: true,
        coloniaOtra: true,
        colonia: { select: { nombre: true } },
        negocio: { select: { nombre: true } },
      },
    }),
  ])) as [FilaCola[], FilaColaEdicion[]];

  // UN NEGOCIO, UN RENGLÓN (requirement "un negocio publicado con edición
  // pendiente aparece en la cola una sola vez"; hallazgo MEDIO 1b de la etapa
  // C). Si el negocio ya entró a la cola por sí mismo —está `en_revision`
  // porque el admin lo despublicó—, su edición NO abre un segundo renglón: lo
  // que el admin tiene enfrente es la ficha bajada, y hasta que no la vuelva a
  // publicar esos cambios no se pueden aplicar (`aplicarEdicion` responde
  // "ficha-no-publicada"). Mostrarlos sería una cola que miente sobre cuánto
  // trabajo hay y que empuja al admin justo a ese callejón.
  //
  // La edición NO se pierde ni se toca: sigue `pendiente`, y en cuanto la
  // ficha vuelve al directorio reaparece en la cola con su reloj intacto.
  //
  // Se deduplica contra las altas que ya se leyeron, sin nombrar ningún estado
  // aquí: el filtro de visibilidad del directorio sigue viviendo en un solo
  // sitio (`src/lib/directorio.ts`, guardián de `tests/directorio-consultas`).
  const negociosYaEnLaCola = new Set(filas.map((fila) => fila.id));

  const renglones: Array<{ entrada: Date; item: RegistroColaItem }> = [
    ...filas.map((fila) => {
      const entrada = entradaALaCola(fila.registradoEn, fila.despublicadoEn);
      return {
        entrada,
        item: {
          id: fila.id,
          nombre: fila.nombre,
          coloniaTexto: textoDeColonia(fila),
          esperaTexto: textoEspera(entrada, ahora),
          atrasado: estaAtrasado(entrada, ahora),
          vieneDeDespublicacion: vieneDeDespublicacion(
            fila.registradoEn,
            fila.despublicadoEn,
          ),
          tipo: "alta" as const,
          hrefDetalle: `/admin/registros/${fila.id}`,
          numeroVerificadoEn: fila.numeroVerificadoEn,
        },
      };
    }),
    // El reloj de una edición cuenta desde que el negocio la mandó, y si la
    // reemplaza por otra más nueva se reinicia con ella: lo que el admin tiene
    // que revisar es lo nuevo (requirement del indicador de 48 horas).
    ...ediciones
      .filter((edicion) => !negociosYaEnLaCola.has(edicion.negocioId))
      .map((edicion) => ({
        entrada: edicion.creadaEn,
        item: {
          id: edicion.id,
          nombre: edicion.negocio.nombre,
          coloniaTexto: textoDeColonia(edicion),
          esperaTexto: textoEspera(edicion.creadaEn, ahora),
          atrasado: estaAtrasado(edicion.creadaEn, ahora),
          // Una edición nunca "viene de una despublicación": solo un negocio
          // PUBLICADO tiene enlace con el que mandarla.
          vieneDeDespublicacion: false,
          tipo: "edicion" as const,
          hrefDetalle: `/admin/ediciones/${edicion.id}`,
        },
      })),
  ];

  // Del más antiguo al más reciente sin importar de qué tipo sea. Un negocio
  // publicado con edición pendiente aparece UNA sola vez y como "Edición",
  // porque los publicados no entran a la cola por sí mismos.
  return renglones
    .sort(
      (uno, otro) =>
        uno.entrada.getTime() - otro.entrada.getTime() ||
        uno.item.id.localeCompare(otro.item.id),
    )
    .map(({ item }) => item);
}

/**
 * Una página del listado "Todos los negocios" y el total de su filtro (change
 * `agregar-listado-gestion-panel`, requirements de la vista, del filtro y de
 * la paginación).
 *
 * Tres decisiones que se leen aquí:
 *
 * - **El corte lo hace la base.** `skip`/`take` van en la consulta, no en un
 *   `slice` posterior: el HTML que recibe el admin no puede crecer con el
 *   total de fichas de la base (design.md §3). El total se pide aparte con un
 *   `count` del mismo `where`, que también cuenta la base.
 * - **El orden es una columna**, `registradoEn` descendente, con el
 *   identificador como desempate. Sin desempate, dos filas con la misma fecha
 *   pueden intercambiarse entre consultas y un registro aparecería dos veces
 *   —o desaparecería— al pasar de página. No es el reloj de la cola
 *   (`max(registradoEn, despublicadoEn)`, calculado en memoria): ese no es una
 *   columna y no se puede paginar en la base (design.md §2).
 * - **El `select` es la lista de lo que se pinta y nada más**: ni WhatsApp, ni
 *   teléfono, ni dirección, ni foto, ni motivos. `despublicadoEn` entra porque
 *   la etiqueta "Ya estaba publicada, la despublicaste" se deriva de él, y no
 *   sale de esta función (se va como el booleano `vieneDeDespublicacion`).
 *
 * `pagina` llega ya normalizada del borde (`normalizarPagina`, que además la
 * recorta a `PAGINA_MAXIMA` para que el `skip` no se salga del entero que la
 * base admite). Una página más allá de la última no es un error: devuelve
 * cero renglones con el total intacto, que es lo que la pantalla necesita
 * para ofrecer "Ver más nuevos".
 */
export async function obtenerListadoDeNegocios(
  prisma: ClientePanel,
  { estado, pagina, porPagina }: ParametrosListadoDeNegocios,
): Promise<ResultadoListadoDeNegocios> {
  const where = estado === FILTRO_TODOS ? {} : { estado };

  const total = await prisma.negocio.count({ where });

  const filas = (await prisma.negocio.findMany({
    where,
    orderBy: [{ registradoEn: "desc" }, { id: "desc" }],
    skip: (pagina - 1) * porPagina,
    take: porPagina,
    select: {
      id: true,
      nombre: true,
      registradoEn: true,
      despublicadoEn: true,
      estado: true,
      coloniaOtra: true,
      colonia: { select: { nombre: true } },
    },
  })) as FilaListado[];

  return {
    registros: filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      coloniaTexto: textoDeColonia(fila),
      registradoEn: fila.registradoEn,
      estado: fila.estado as EstadoNegocio,
      vieneDeDespublicacion: vieneDeDespublicacion(fila.registradoEn, fila.despublicadoEn),
    })),
    total,
  };
}

/**
 * Detalle completo de un registro, o `null` si ese identificador no existe
 * (el panel responde entonces como no encontrado, sin sugerir nada).
 */
export async function obtenerRegistroParaPanel(
  prisma: ClientePanel,
  id: string,
): Promise<RegistroAdminDetalle | null> {
  // Mismo filtro de byte nulo que el detalle de una edición y que
  // `extraerIdDeSegmentoFicha` en lo público: un `%00` en la URL del detalle
  // abortaría la consulta de PostgreSQL y respondería un error del servidor en
  // vez del "no encontrado" de siempre. Es deuda anterior a este change
  // (la señaló la etapa C al mirar la superficie nueva), y se cierra aquí
  // porque el arreglo es el mismo y dejar una de las dos puertas abierta
  // sería peor que no haberlo mirado.
  if (!id || tieneByteNulo(id)) return null;

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
      // T-016: las dos líneas de verificación junto al WhatsApp.
      numeroVerificadoEn: true,
      // Solo la FECHA del enlace, nunca su huella (design.md §3).
      tokenGestionCreadoEn: true,
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
    tokenGestionCreadoEn: fila.tokenGestionCreadoEn,
    numeroVerificadoEn: fila.numeroVerificadoEn,
    girosIds: fila.giros.map((giro) => giro.id),
  };
}
