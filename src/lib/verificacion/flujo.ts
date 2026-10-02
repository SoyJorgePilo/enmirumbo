/**
 * El flujo de la verificación por SMS, sin nada de Next.js dentro (spec
 * `registro-negocio` de T-016; design.md §2).
 *
 * Aquí vive TODA la regla: cuándo se pide un código, cuándo no, qué se le
 * escribe a la ficha y qué se le contesta al dueño. Las Server Actions
 * (`src/lib/verificacion/acciones.ts`) solo leen cookies, llaman aquí y
 * redirigen — el mismo reparto que `procesarRegistro` / `accion.ts` en el
 * registro.
 *
 * Todo se inyecta —prisma, proveedor, configuración, reloj—, así que la suite
 * recorre el flujo entero sin red, sin credenciales y sin un request de Next.
 *
 * Dos reglas del requirement que conviene tener a la vista al leer el código:
 *
 * 1. **El registro ya existe cuando esto corre.** Nada de lo que pase aquí
 *    puede perder una ficha: si algo falla, el dueño va a la pantalla de
 *    gracias de siempre y el admin lo confirma por WhatsApp como hoy.
 * 2. **Verificar no publica.** La única columna que se escribe es
 *    `numeroVerificadoEn`. El estado, el origen y la cola no se tocan.
 */

import type { ClienteCupos } from "@/lib/cupos/compartido";

import type { PasoVerificacion } from "./paso";
import { crearPasoInicial } from "./paso";
import type { ProveedorVerificacion } from "./proveedor";
import {
  apartarCupoDeCodigos,
  apartarEnvioSeguido,
  apartarReenvioDelRegistro,
  apartarTopeDiario,
  apuntarIntentoDelRegistro,
  intentosDelRegistroAgotados,
  type ContextoTopesPorRegistro,
} from "./limites";

/** Lo poco que este módulo necesita de Prisma (facilita probarlo). */
export type ClienteVerificacion = {
  negocio: {
    findUnique(args: {
      where: { id: string };
      select: { whatsapp: true; numeroVerificadoEn: true };
    }): Promise<{ whatsapp: string; numeroVerificadoEn: Date | null } | null>;
    updateMany(args: {
      where: { id: string; numeroVerificadoEn: null };
      data: { numeroVerificadoEn: Date };
    }): Promise<{ count: number }>;
  };
};

/** La ficha que este envío acaba de crear o actualizar. */
export type FichaParaVerificar = {
  id: string;
  /** El WhatsApp ya normalizado a 10 dígitos. */
  whatsapp: string;
  /** ¿Ya traía su marca de verificación? (reenvío tras rechazo). */
  yaVerificado: boolean;
};

export type ContextoVerificacion = {
  /** `null` con la capacidad apagada: entonces aquí no pasa nada. */
  proveedor: ProveedorVerificacion | null;
  /**
   * Cliente del almacén COMPARTIDO de cupos, donde viven los topes por
   * registro desde el hallazgo [C-2] (`src/lib/cupos/compartido.ts`). Es el
   * mismo Prisma; va aparte porque son dos superficies distintas.
   */
  cupos: ClienteCupos;
  /** Secreto con el que se firma la cookie de paso y se derivan las claves. */
  secreto: string;
  /** Tope diario global de verificaciones iniciadas. */
  topeDiario: number;
  /** IP del cliente para el cupo de códigos; `null` si no se declara. */
  ip: string | null;
  ahora?: Date;
};

/** Los topes por registro, atados a esta ficha. */
export function topesDe(
  contexto: ContextoVerificacion,
  negocioId: string,
): ContextoTopesPorRegistro {
  return {
    cupos: contexto.cupos,
    negocioId,
    secreto: contexto.secreto,
    ahora: contexto.ahora,
  };
}

/**
 * Pide el código al proveedor pasando antes por las dos cotas del canal:
 * cupo por IP → tope diario → proveedor. Las dos primeras son gratis; la
 * tercera cuesta dinero.
 *
 * **El turno de envío (cooldown de 60 s) NO se aparta aquí** (hallazgo [C-3]).
 * Vive en los dos llamadores, porque cada uno lo necesita en un momento
 * distinto: el primer envío lo aparta después de decidir que va a mandar, y el
 * reenvío tiene que apartarlo ANTES de gastar uno de los dos reenvíos del
 * dueño. Meterlo aquí dentro fue lo que produjo [C-3].
 */
async function pedirCodigo(
  contexto: ContextoVerificacion,
  whatsapp: string,
): Promise<"enviado" | "sin-cupo" | "no-se-pudo"> {
  const ahora = contexto.ahora ?? new Date();
  if (!contexto.proveedor) return "no-se-pudo";
  if (!apartarCupoDeCodigos(contexto.ip, ahora)) return "sin-cupo";
  if (!apartarTopeDiario(contexto.topeDiario, ahora)) return "no-se-pudo";

  const resultado = await contexto.proveedor.iniciar(whatsapp);
  return resultado === "enviado" ? "enviado" : "no-se-pudo";
}

/**
 * Tras guardar la ficha: pide el código y devuelve el paso que hay que poner
 * en la cookie, o `null` si el dueño se va derecho a la pantalla de gracias.
 *
 * Devuelve `null` —y el dueño NO se entera de por qué, que es el requirement—
 * en todos estos casos:
 *
 * - la capacidad está apagada o mal configurada (no hay proveedor);
 * - el envío no creó ni actualizó ninguna ficha (campo trampa, duplicado):
 *   **no existe forma de mandar un SMS a un número suelto**;
 * - la ficha ya estaba verificada (reenvío tras rechazo del mismo número);
 * - el cupo por IP está agotado, el tope diario alcanzado, el proveedor falló,
 *   tardó de más o no acepta ese número.
 */
export async function pedirCodigoParaFicha(
  ficha: FichaParaVerificar | null,
  contexto: ContextoVerificacion,
): Promise<PasoVerificacion | null> {
  if (!contexto.proveedor) return null;
  if (!ficha) return null;
  if (ficha.yaVerificado) return null;

  const ahora = contexto.ahora ?? new Date();
  // El turno de envío se aparta también en el PRIMER envío —el que sale del
  // formulario—, para que un reenvío inmediato sí choque con la espera de 60 s.
  if (!(await apartarEnvioSeguido(topesDe(contexto, ficha.id)))) return null;
  if ((await pedirCodigo(contexto, ficha.whatsapp)) !== "enviado") return null;

  return crearPasoInicial(ficha.id, ficha.whatsapp, ahora);
}

/** Qué contestarle a quien escribió un código. */
export type ResultadoConfirmacion =
  | { resultado: "confirmado" }
  | { resultado: "incompleto" }
  | { resultado: "no-coincide" }
  | { resultado: "vencido" }
  | { resultado: "error-proveedor" }
  /** Se gastaron los 5 códigos de este registro (contados en el servidor). */
  | { resultado: "agotado" }
  | { resultado: "sin-ficha" };

/** ¿Este desenlace gasta uno de los 5 intentos del registro? */
export function gastaIntento(resultado: ResultadoConfirmacion["resultado"]): boolean {
  // Gasta intento el código que SÍ se probó contra el proveedor, coincida o
  // no, esté vencido o no. No gastan: un campo que ni se le mandó
  // (`incompleto`) ni una falla del proveedor, que no es culpa del dueño.
  return resultado === "no-coincide" || resultado === "vencido";
}

/**
 * Comprueba el código contra el proveedor y, solo si lo confirma, escribe la
 * marca de verificación.
 *
 * La escritura va condicionada a `numeroVerificadoEn: null`: dos
 * confirmaciones seguidas no pisan la fecha original, y —sobre todo— es la
 * ÚNICA columna que se toca. La ficha sigue en `en_revision`, sin publicar y
 * sin adelantar la cola.
 *
 * El tope de 5 códigos se cuenta EN EL SERVIDOR contra el identificador del
 * registro (hallazgo [C-2]), no en la cookie: rebobinar la credencial de paso
 * ya no revive ningún intento. Se pregunta ANTES de llamar al proveedor —un
 * registro agotado no le cuesta ni una petición— y se apunta DESPUÉS, solo si
 * el desenlace de verdad gastó un intento.
 */
export async function confirmarCodigo(
  prisma: ClienteVerificacion,
  paso: PasoVerificacion,
  codigo: string,
  contexto: ContextoVerificacion,
): Promise<ResultadoConfirmacion> {
  // Un campo que no son 6 dígitos ni se le manda al proveedor: cuesta dinero
  // y la respuesta ya se sabe.
  if (!/^\d{6}$/.test(codigo)) return { resultado: "incompleto" };
  if (!contexto.proveedor) return { resultado: "error-proveedor" };

  const ficha = await prisma.negocio.findUnique({
    where: { id: paso.negocioId },
    select: { whatsapp: true, numeroVerificadoEn: true },
  });
  if (!ficha) return { resultado: "sin-ficha" };
  // Ya verificada: no se vuelve a molestar al proveedor por algo ya cierto.
  if (ficha.numeroVerificadoEn !== null) return { resultado: "confirmado" };

  const topes = topesDe(contexto, paso.negocioId);
  if (await intentosDelRegistroAgotados(topes)) return { resultado: "agotado" };

  const respuesta = await contexto.proveedor.comprobar(ficha.whatsapp, codigo);
  if (respuesta === "no-coincide" || respuesta === "vencido") {
    await apuntarIntentoDelRegistro(topes);
    // Y si ese fue el quinto, no hay pantalla a la que volver.
    if (await intentosDelRegistroAgotados(topes)) return { resultado: "agotado" };
    return { resultado: respuesta === "vencido" ? "vencido" : "no-coincide" };
  }
  if (respuesta === "error") return { resultado: "error-proveedor" };

  await prisma.negocio.updateMany({
    where: { id: paso.negocioId, numeroVerificadoEn: null },
    data: { numeroVerificadoEn: contexto.ahora ?? new Date() },
  });
  return { resultado: "confirmado" };
}

/** Qué contestarle a quien tocó "Reenviar el código". */
export type ResultadoReenvio =
  | { resultado: "enviado"; paso: PasoVerificacion }
  | { resultado: "espera-reenvio" }
  | { resultado: "cupo" }
  | { resultado: "agotado" }
  | { resultado: "sin-ficha" };

/**
 * Reenvía el código con las cuatro cotas del canal. Las dos POR REGISTRO
 * —espera de 60 s y tope de 2 reenvíos— se cuentan EN EL SERVIDOR desde el
 * hallazgo [C-2]: rebobinar la cookie ya no los revive.
 *
 * **EL ORDEN DE LAS DOS PRIMERAS ES EL HALLAZGO [C-3]**, y es este:
 *
 * 1. **el turno de envío (60 s)**. Va primero porque un clic bloqueado por la
 *    espera **no manda ningún SMS**, y lo que no cuesta dinero no puede costar
 *    un reenvío. Con el orden invertido —como quedó al cerrar [C-2]— tres
 *    toques impacientes en 40 segundos gastaban los dos reenvíos del dueño con
 *    cero mensajes enviados, y el tercero le borraba la credencial de paso y lo
 *    echaba de la pantalla del código con "Ya lo intentaste varias veces",
 *    justo cuando el primer SMS podía estar llegándole. El primer toque de
 *    "Reenviar" SIEMPRE cae dentro del cooldown —la pantalla se abre segundos
 *    después del envío del formulario—, así que era el caso normal, no el borde;
 * 2. **el tope de 2 reenvíos**, apartado atómicamente;
 * 3. la existencia de la ficha;
 * 4. dentro de `pedirCodigo`: el cupo por IP y el tope diario;
 * 5. y solo al final, el proveedor, que es lo único que cuesta dinero.
 *
 * **Esto NO reabre [C-2]:** el cooldown también está anclado en el servidor (1
 * envío cada 60 s por registro), así que machacar el botón sigue sin poder
 * provocar más de un intento por minuto, y la propiedad que cerró [C-2] queda
 * intacta — **un reenvío que SÍ llega al proveedor sigue gastando reenvío,
 * salga bien o mal**. Dos reenvíos separados por más de 60 s contra un
 * proveedor caído agotan el tope, que es lo que cierra la vía de "reintentos
 * gratis e ilimitados" contra el canal que cuesta dinero.
 */
export async function reenviarCodigo(
  prisma: ClienteVerificacion,
  paso: PasoVerificacion,
  contexto: ContextoVerificacion,
): Promise<ResultadoReenvio> {
  const topes = topesDe(contexto, paso.negocioId);
  // 1. La espera de 60 s, ANTES de tocar el tope de reenvíos: un clic que no
  //    manda SMS no le cuesta un reenvío a nadie (hallazgo [C-3]).
  if (!(await apartarEnvioSeguido(topes))) return { resultado: "espera-reenvio" };
  // 2. Y solo entonces, uno de los dos reenvíos del registro.
  if (!(await apartarReenvioDelRegistro(topes))) return { resultado: "agotado" };

  const ficha = await prisma.negocio.findUnique({
    where: { id: paso.negocioId },
    select: { whatsapp: true, numeroVerificadoEn: true },
  });
  if (!ficha) return { resultado: "sin-ficha" };

  const envio = await pedirCodigo(contexto, ficha.whatsapp);
  if (envio === "sin-cupo") return { resultado: "cupo" };
  if (envio === "no-se-pudo") return { resultado: "espera-reenvio" };

  return { resultado: "enviado", paso };
}
