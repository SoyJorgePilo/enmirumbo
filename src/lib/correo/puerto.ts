/**
 * Por dónde sale un correo del sistema (change `agregar-aviso-diario-
 * pendientes`, design.md §2).
 *
 * Un puerto de UNA sola operación —mandar un texto plano— con la misma forma
 * que el almacén de fotos (`src/lib/fotos/almacen.ts`): dos adaptadores, uno
 * que habla con el proveedor cuando la configuración está completa y otro que
 * no manda nada y lo dice cuando no lo está. Así el fail-safe es una decisión
 * de fábrica y no un `if` repartido por la ruta, y las pruebas no tocan la red.
 *
 * A quién se le manda y desde qué dirección NO viaja en el mensaje: son
 * configuración, y el adaptador los trae dentro desde que se creó. Lo que el
 * mensaje lleva es contenido —y la clave del día, que es lo que le pide al
 * proveedor no mandar dos veces lo mismo—.
 */

/** Lo que se manda: contenido, marca visible y la marca del día. */
export type MensajeAviso = {
  asunto: string;
  /** Texto plano. Sin HTML: no hay nada que maquetar en cuatro renglones. */
  texto: string;
  /** Cómo se presenta el remitente en la bandeja ("EnMiRumbo"). */
  remitenteVisible: string;
  /**
   * Clave de idempotencia del día (`enmirumbo-pendientes-<AAAA-MM-DD>`). Un
   * adaptador que no sepa respetarla DEBE decirlo en su documentación en vez
   * de fingir que cumple: la garantía de "un correo al día" se apoya en ella
   * (design.md §3).
   */
  claveDelDia: string;
};

/** En qué quedó el intento. Son estados, no datos de nadie. */
export type ResultadoEnvio = "mandado" | "no-configurado" | "fallido";

export type PuertoCorreo = {
  mandar(mensaje: MensajeAviso): Promise<ResultadoEnvio>;
  /** Cómo se nombra este puerto en un log. NUNCA lleva credenciales. */
  descripcion(): string;
};
