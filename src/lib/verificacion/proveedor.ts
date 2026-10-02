/**
 * El PUERTO del proveedor de verificación por SMS (spec `registro-negocio` de
 * T-016; ADR-011; design.md §5), con su adaptador simulado para pruebas.
 *
 * Mismo patrón que `AlmacenFotos`/`FOTOS_DIR`: dos operaciones, resultados
 * discriminados, cero excepciones del proveedor escapando hacia arriba, y el
 * adaptador se INYECTA. Gracias a eso la suite recorre las siete ramas —código
 * correcto, equivocado, vencido, proveedor caído, número rechazado— sin llamar
 * a la red y sin exigir credenciales de nadie.
 *
 * Lo que este puerto NO hace, y es lo importante: **no genera, no guarda y no
 * compara ningún código**. Eso lo hace el proveedor (ADR-011). Aquí solo se le
 * pregunta "¿mandaste el código?" y "¿el que escribió el dueño es el bueno?".
 *
 * `proveedor-twilio.ts` (el adaptador real) vive en su propio archivo y SOLO
 * se importa desde `proveedorDeVerificacion`, que devuelve `null` sin
 * configuración: con la capacidad apagada nada del proveedor se construye.
 */

import { normalizarWhatsapp } from "@/lib/whatsapp";

import type { ConfiguracionVerificacion } from "./config";

/** Qué pasó al pedirle al proveedor que mande el código. */
export type ResultadoIniciar = "enviado" | "rechazado-por-el-proveedor" | "error";

/** Qué dijo el proveedor del código que escribió el dueño. */
export type ResultadoComprobar = "confirmado" | "no-coincide" | "vencido" | "error";

/**
 * El puerto. Dos operaciones y nada más: lo que el dominio necesita saber del
 * proveedor cabe entero aquí.
 */
export type ProveedorVerificacion = {
  /** Pide que le manden el código al número (en su forma de 10 dígitos). */
  iniciar(numero: string): Promise<ResultadoIniciar>;
  /** Pregunta si el código escrito es el bueno para ese número. */
  comprobar(numero: string, codigo: string): Promise<ResultadoComprobar>;
};

/** Lada de México. El formato internacional es un detalle del proveedor. */
const LADA_MEXICO = "+52";

/**
 * El número en formato internacional, o `null` si lo guardado no tiene forma
 * de número mexicano.
 *
 * La conversión vive AQUÍ y no en el dominio (design.md §5): la base guarda
 * 10 dígitos —lo que `normalizarWhatsapp` produce— y el `+52` es lenguaje del
 * proveedor, no del directorio.
 */
export function aE164(numero: string): string | null {
  const nacional = normalizarWhatsapp(numero);
  return nacional === null ? null : `${LADA_MEXICO}${nacional}`;
}

/** Lo que el adaptador simulado apunta para que la prueba lo revise. */
export type ProveedorSimulado = ProveedorVerificacion & {
  /** Números a los que se pidió mandar código, en orden. */
  iniciados: string[];
  /** Cada comprobación pedida, en orden. */
  comprobados: Array<{ numero: string; codigo: string }>;
};

type GuionSimulado<T> = T | readonly T[];

/** Saca el desenlace de esta llamada del guion (el último se repite). */
function siguiente<T>(guion: GuionSimulado<T>, llamada: number): T {
  if (!Array.isArray(guion)) return guion as T;
  const lista = guion as readonly T[];
  return lista[Math.min(llamada, lista.length - 1)];
}

/**
 * Adaptador de pruebas: responde lo que la prueba diga y no habla con nadie.
 *
 * Cada operación acepta un desenlace fijo o una lista (para recorrer, por
 * ejemplo, "primero no coincide, luego confirmado" sin montar un servidor).
 */
export function crearProveedorSimulado(
  guion: {
    alIniciar?: GuionSimulado<ResultadoIniciar>;
    alComprobar?: GuionSimulado<ResultadoComprobar>;
  } = {},
): ProveedorSimulado {
  const iniciados: string[] = [];
  const comprobados: Array<{ numero: string; codigo: string }> = [];
  const alIniciar = guion.alIniciar ?? "enviado";
  const alComprobar = guion.alComprobar ?? "confirmado";

  return {
    iniciados,
    comprobados,
    async iniciar(numero) {
      const llamada = iniciados.length;
      iniciados.push(numero);
      return siguiente(alIniciar, llamada);
    },
    async comprobar(numero, codigo) {
      const llamada = comprobados.length;
      comprobados.push({ numero, codigo });
      return siguiente(alComprobar, llamada);
    },
  };
}

/**
 * El proveedor real, o `null` si la capacidad está apagada.
 *
 * El adaptador se importa DINÁMICAMENTE, después de comprobar que hay
 * configuración: con la capacidad apagada el módulo del proveedor ni siquiera
 * se evalúa, así que no hay cliente que construir, no se leen credenciales y
 * no sale ninguna petición (requirement "El adaptador real solo DEBE
 * construirse cuando la configuración está completa"). Es el único punto del
 * código que lo instancia.
 */
export async function proveedorDeVerificacion(
  configuracion: ConfiguracionVerificacion | null,
): Promise<ProveedorVerificacion | null> {
  if (!configuracion) return null;
  const { crearProveedorTwilio } = await import("./proveedor-twilio");
  return crearProveedorTwilio(configuracion);
}
