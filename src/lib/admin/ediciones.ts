/**
 * Lo que el panel lee de una edición para compararla con lo publicado (spec
 * `revision-admin`, requirement "El detalle de una edición compara lo
 * publicado con lo propuesto"; change `agregar-enlace-de-gestion`, tasks.md
 * #20).
 *
 * La comparación se calcula EN EL MOMENTO DE MIRAR, campo contra campo: la
 * edición guarda un snapshot de lo que quedaría publicado, no un diff, así que
 * "qué cambia" siempre se responde contra lo que la ficha dice hoy (design.md
 * §1). Si el admin normalizó la colonia después de que el negocio mandó los
 * cambios, la comparación lo refleja sin ambigüedad.
 *
 * Sin filtro de estado publicado, como el resto de `src/lib/admin/`: aquí se
 * ven datos personales completos, así que ninguna página pública importa este
 * módulo y toda pantalla que lo use pasa antes por `requerirSesionAdmin()`.
 * Nada de lo que lee se escribe en el log.
 */
import { construirSegmentoFicha } from "@/lib/ficha-url";
import { ESTADO_EDICION_PENDIENTE } from "@/lib/gestion/estados";
import { tieneByteNulo } from "@/lib/texto";

/** Un campo con su valor publicado, su valor propuesto y si cambió. */
export type CampoComparado = {
  /** Clave estable para el `key` de React y para las pruebas. */
  clave: string;
  etiqueta: string;
  publicado: string;
  propuesto: string;
  cambio: boolean;
};

export type EdicionParaPanel = {
  id: string;
  negocioId: string;
  negocioNombre: string;
  /**
   * Segmento de la ficha pública, para armar el link absoluto del aviso. Se
   * calcula con el nombre que la ficha tiene AHORA: leída después de aplicar,
   * el link ya apunta a la ficha con el nombre nuevo.
   */
  segmentoFicha: string;
  creadaEn: Date;
  estado: string;
  motivoDescarte: string | null;
  /** El WhatsApp de hoy y el propuesto, para el botón de verificación. */
  whatsappPublicado: string;
  whatsappPropuesto: string;
  /** Dispara la advertencia de la spec y la re-verificación obligatoria. */
  cambiaWhatsapp: boolean;
  campos: CampoComparado[];
};

/** Lo poco que este módulo necesita de Prisma (facilita probarlo). */
export type ClienteEdicionesPanel = {
  edicionPendiente: {
    findUnique(args: unknown): Promise<unknown>;
  };
};

type FilaCampos = {
  nombre: string;
  categoriaId: number;
  whatsapp: string;
  coloniaId: number | null;
  coloniaOtra: string | null;
  queOfreces: string | null;
  entregaADomicilio: boolean;
  telefonoFijo: string | null;
  direccion: string | null;
  horario: string | null;
  facebookUrl: string | null;
  categoria: { nombre: string };
  colonia: { nombre: string } | null;
};

type FilaEdicion = FilaCampos & {
  id: string;
  negocioId: string;
  estado: string;
  creadaEn: Date;
  motivoDescarte: string | null;
  negocio: FilaCampos & { id: string; nombre: string };
};

const SELECT_CAMPOS = {
  nombre: true,
  categoriaId: true,
  whatsapp: true,
  coloniaId: true,
  coloniaOtra: true,
  queOfreces: true,
  entregaADomicilio: true,
  telefonoFijo: true,
  direccion: true,
  horario: true,
  facebookUrl: true,
  categoria: { select: { nombre: true } },
  colonia: { select: { nombre: true } },
} as const;

/** Lo que el admin lee cuando un opcional viene vacío. */
const SIN_CAPTURAR = "No capturado";

/** La colonia como texto: la del catálogo, o el libre marcado como tal. */
function coloniaComoTexto(fila: FilaCampos): string {
  if (fila.colonia) return fila.colonia.nombre;
  const libre = fila.coloniaOtra?.trim();
  return libre ? `${libre} (escrita como "Otra", sin normalizar)` : SIN_CAPTURAR;
}

function opcional(valor: string | null): string {
  const limpio = valor?.trim();
  return limpio ? limpio : SIN_CAPTURAR;
}

/**
 * Los campos comparables, en el mismo orden en que el formulario los pide.
 * Cada uno se convierte a TEXTO antes de compararse: la marca "Cambió" se
 * decide sobre lo que el admin va a leer, no sobre representaciones internas.
 */
function compararCampos(publicado: FilaCampos, propuesto: FilaCampos): CampoComparado[] {
  const pares: Array<[string, string, (fila: FilaCampos) => string]> = [
    ["nombre", "Nombre", (fila) => fila.nombre],
    ["categoria", "Categoría", (fila) => fila.categoria.nombre],
    ["whatsapp", "WhatsApp", (fila) => fila.whatsapp],
    ["colonia", "Colonia", coloniaComoTexto],
    ["queOfreces", "¿Qué ofreces?", (fila) => opcional(fila.queOfreces)],
    [
      "entregaADomicilio",
      "¿Hace entregas o va a domicilio?",
      (fila) => (fila.entregaADomicilio ? "Sí" : "No"),
    ],
    ["telefonoFijo", "Teléfono fijo", (fila) => opcional(fila.telefonoFijo)],
    ["direccion", "Dirección o referencias", (fila) => opcional(fila.direccion)],
    ["horario", "Horario", (fila) => opcional(fila.horario)],
    ["facebookUrl", "Página que registró", (fila) => opcional(fila.facebookUrl)],
  ];

  return pares.map(([clave, etiqueta, leer]) => {
    const valorPublicado = leer(publicado);
    const valorPropuesto = leer(propuesto);
    return {
      clave,
      etiqueta,
      publicado: valorPublicado,
      propuesto: valorPropuesto,
      cambio: valorPublicado !== valorPropuesto,
    };
  });
}

/**
 * Detalle comparativo de una edición, o `null` si ese identificador no existe
 * (el panel responde entonces como no encontrado, sin sugerir nada).
 */
export async function obtenerEdicionParaPanel(
  prisma: ClienteEdicionesPanel,
  id: string,
): Promise<EdicionParaPanel | null> {
  // El byte nulo se cae AQUÍ, en el borde, con el mismo criterio (y por la
  // misma razón) que `extraerIdDeSegmentoFicha` en el lado público: ningún
  // identificador legítimo lo lleva, solo puede venir de una URL fabricada a
  // mano (`%00`), y buscarlo abortaría la consulta de PostgreSQL. Filtrarlo
  // es lo que hace que esa URL responda el mismo "no encontrado" que
  // cualquier otra inventada, en vez de un error del servidor (hallazgo
  // MEDIO 2 de la etapa C).
  if (!id || tieneByteNulo(id)) return null;

  const fila = (await prisma.edicionPendiente.findUnique({
    where: { id },
    select: {
      id: true,
      negocioId: true,
      estado: true,
      creadaEn: true,
      motivoDescarte: true,
      ...SELECT_CAMPOS,
      negocio: { select: { id: true, ...SELECT_CAMPOS } },
    },
  })) as FilaEdicion | null;

  if (!fila) return null;

  return {
    id: fila.id,
    negocioId: fila.negocioId,
    negocioNombre: fila.negocio.nombre,
    segmentoFicha: construirSegmentoFicha(fila.negocio.nombre, fila.negocio.id),
    creadaEn: fila.creadaEn,
    estado: fila.estado,
    motivoDescarte: fila.motivoDescarte,
    whatsappPublicado: fila.negocio.whatsapp,
    whatsappPropuesto: fila.whatsapp,
    cambiaWhatsapp: fila.negocio.whatsapp !== fila.whatsapp,
    campos: compararCampos(fila.negocio, fila),
  };
}

/** ¿Esta edición sigue esperando revisión? */
export function siguePendiente(edicion: EdicionParaPanel): boolean {
  return edicion.estado === ESTADO_EDICION_PENDIENTE;
}
