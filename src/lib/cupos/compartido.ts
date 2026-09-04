/**
 * Cupos anti-abuso en un almacén COMPARTIDO (la base), no en la memoria del
 * proceso.
 *
 * Iteración 2 del change `preparar-deploy-produccion`, hallazgo A4 de la etapa
 * C. El problema, en una frase: el destino es serverless (ADR-007), donde cada
 * instancia viva tiene su propio `Map`. Un contador en RAM le da al atacante
 * tantos intentos como instancias consiga que la plataforma levante, y además
 * se evapora cuando la instancia se recicla. Para el límite de intentos de
 * acceso al panel —lo único que frena la fuerza bruta contra
 * `PANEL_CONTRASENA`, la única credencial del sitio— eso no es un detalle:
 * el techo efectivo deja de ser "5 cada 10 minutos" y pasa a ser "los que
 * quepan".
 *
 * QUÉ NO ESTÁ AQUÍ, Y POR QUÉ. Los cupos del formulario público (3 altas por
 * hora) y del botón "Reportar" (3 por hora) siguen en memoria. No es un
 * olvido: el aviso de privacidad **ya publicado** dice, literal, que la IP de
 * quien envía el formulario se usa *"por menos de una hora, solo en su
 * memoria… No la guardamos en la base de datos"*. Moverlos aquí —aunque fuera
 * como HMAC— haría falsa esa frase, y este change tiene prohibido tocar el
 * texto legal aprobado. Queda declarado como pendiente en
 * `docs/despliegue.md` §10 y en `PENDIENTES_OPERATIVOS_LEGALES`, con la
 * redacción que la revisión legal (E6-3) tendría que aprobar para moverlos.
 *
 * CÓMO SE GUARDA. Una fila por intento, con la hora, y la clave DERIVADA: un
 * HMAC-SHA256 de la procedencia con el secreto de sesión del panel, truncado.
 * No se puede volver atrás sin el secreto —y rotar el secreto invalida el
 * histórico entero, que es justo lo que se quiere—, y las filas se borran en
 * cuanto salen de la ventana.
 *
 * CÓMO SE CUENTA. Ventana deslizante sobre las marcas de tiempo, idéntica a la
 * que hacía el contador en memoria: nada de ventanas fijas que al reiniciarse
 * regalan el doble de intentos en el borde.
 *
 * ATÓMICO. Comprobar y apartar van dentro de una transacción con cerrojo
 * consultivo por clave, por la misma razón que el tope de reportes (hallazgo
 * A3): en READ COMMITTED, un `COUNT(*)` no bloquea las filas que cuenta, así
 * que dos intentos simultáneos leerían el mismo "van 4" y pasarían los dos.
 */
import { createHmac } from "node:crypto";

import type { CupoPorIp } from "@/lib/registro/limite-ip";

/** Lo poco que este módulo necesita de Prisma (así se puede probar en aislado). */
export type ClienteCupos = {
  $transaction<T>(operacion: (tx: TransaccionCupos) => Promise<T>): Promise<T>;
  intentoDeCupo: {
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

export type TransaccionCupos = {
  $queryRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<unknown>;
  intentoDeCupo: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

export type SolicitudDeCupo = {
  /** Nombre del cupo: dos cupos distintos nunca comparten contador. */
  cupo: string;
  /** Procedencia (una IP), o `null` si el despliegue no la declara. */
  ip: string | null;
  /** Cuántos eventos admite la ventana. */
  maximo: number;
  /** Cuánto dura la ventana. */
  ventanaMs: number;
  /** Momento de referencia; se inyecta en pruebas. */
  ahora?: Date;
  /** Con qué se deriva la clave. Sin secreto no se guarda nada. */
  secreto: string;
  /** Contador en memoria del proceso: caché caliente y red de seguridad. */
  respaldo: CupoPorIp;
};

/**
 * La clave que se guarda: nunca la IP.
 *
 * Lleva el nombre del cupo dentro del mensaje, así que agotar los intentos del
 * panel no consume ningún otro cupo aunque venga de la misma procedencia.
 */
export function claveDeCupo(cupo: string, ip: string, secreto: string): string {
  return createHmac("sha256", secreto).update(`${cupo}:${ip}`).digest("hex").slice(0, 32);
}

let yaSeAvisoDelRespaldo = false;

/** Solo para pruebas: permite volver a observar el aviso del respaldo. */
export function reiniciarAvisoDeRespaldo(): void {
  yaSeAvisoDelRespaldo = false;
}

function avisarDelRespaldoUnaVez(cupo: string, error: unknown): void {
  if (yaSeAvisoDelRespaldo) return;
  yaSeAvisoDelRespaldo = true;
  console.error(
    `[cupos] la base no respondió al contar el cupo "${cupo}" ` +
      `(${error instanceof Error ? error.name : "error desconocido"}): se usa el contador en memoria de ESTA ` +
      "instancia, que no se comparte con las demás. El límite sigue operando, pero más flojo.",
  );
}

/**
 * Comprueba el cupo Y lo aparta, en una sola operación atómica.
 *
 * Devuelve `true` si quedaba cupo —y entonces YA lo apartó— y `false` si
 * estaba agotado. Sin procedencia (`ip === null`) no hay a quién contarle
 * nada: se concede, igual que hacía el contador en memoria, porque confiar en
 * un encabezado que escribe quien manda la petición sería peor que no tener
 * límite (y el despliegue lo avisa por su cuenta).
 */
export async function apartarCupoCompartido(
  prisma: ClienteCupos,
  solicitud: SolicitudDeCupo,
): Promise<boolean> {
  const { cupo, ip, maximo, ventanaMs, secreto, respaldo } = solicitud;
  const ahora = solicitud.ahora ?? new Date();
  if (!ip) return true;

  // Sin secreto no se puede derivar la clave sin guardar la IP en claro, y eso
  // no se hace: se cae al contador en memoria, que es lo que había antes.
  if (secreto.trim() === "") {
    return apartarEnMemoria(respaldo, ip, ahora);
  }

  const clave = claveDeCupo(cupo, ip, secreto);
  const desde = new Date(ahora.getTime() - ventanaMs);

  try {
    const concedido = await prisma.$transaction(async (tx) => {
      // Serializa por clave: sin esto, dos intentos simultáneos cuentan los
      // mismos 4 y pasan los dos (mismo motivo que el tope de reportes).
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${clave})::bigint)::text AS cerrojo`;

      // Lo que ya salió de la ventana se borra aquí mismo: la tabla no crece y
      // no queda ni un rastro más viejo que el cupo.
      await tx.intentoDeCupo.deleteMany({
        where: { clave, ocurrioEn: { lte: desde } },
      });

      const vigentes = await tx.intentoDeCupo.count({
        where: { clave, ocurrioEn: { gt: desde } },
      });
      if (vigentes >= maximo) return false;

      await tx.intentoDeCupo.create({ data: { clave, ocurrioEn: ahora } });
      return true;
    });

    // La memoria se mantiene caliente aunque mande la base: si la base se cae
    // a mitad de un ataque, el respaldo no arranca de cero.
    if (concedido) respaldo.registrar(ip, ahora);
    return concedido;
  } catch (error) {
    avisarDelRespaldoUnaVez(cupo, error);
    return apartarEnMemoria(respaldo, ip, ahora);
  }
}

/**
 * El respaldo: el contador en memoria de ESTA instancia. Su máximo y su
 * ventana los lleva el propio `CupoPorIp`, que se construyó con los mismos.
 */
function apartarEnMemoria(respaldo: CupoPorIp, ip: string, ahora: Date): boolean {
  if (respaldo.bloqueada(ip, ahora)) return false;
  respaldo.registrar(ip, ahora);
  return true;
}

/**
 * ¿Esta procedencia ya agotó el cupo? Consulta de solo lectura: sirve para
 * pruebas y diagnóstico, NO para decidir —para eso está `apartarCupoCompartido`,
 * que no deja ventana entre la pregunta y la respuesta.
 */
export async function cupoCompartidoAgotado(
  prisma: ClienteCupos,
  solicitud: SolicitudDeCupo,
): Promise<boolean> {
  const { cupo, ip, maximo, ventanaMs, secreto, respaldo } = solicitud;
  const ahora = solicitud.ahora ?? new Date();
  if (!ip) return false;
  if (secreto.trim() === "") return respaldo.bloqueada(ip, ahora);

  const clave = claveDeCupo(cupo, ip, secreto);
  const desde = new Date(ahora.getTime() - ventanaMs);
  try {
    const vigentes = await prisma.$transaction(async (tx) =>
      tx.intentoDeCupo.count({ where: { clave, ocurrioEn: { gt: desde } } }),
    );
    return vigentes >= maximo;
  } catch (error) {
    avisarDelRespaldoUnaVez(cupo, error);
    return respaldo.bloqueada(ip, ahora);
  }
}

/** Solo para pruebas y operación: vacía lo apuntado de un cupo. */
export async function olvidarCupoCompartido(
  prisma: ClienteCupos,
  cupo: string,
  respaldo: CupoPorIp,
): Promise<void> {
  respaldo.reiniciar();
  try {
    await prisma.intentoDeCupo.deleteMany({ where: { clave: { startsWith: "" } } });
  } catch {
    // Si la base no responde, con haber vaciado la memoria basta: esto solo lo
    // llaman las pruebas y la operación manual.
  }
}

// ── Retención: que la tabla no se quede con lo que ya no sirve ──────────────

/**
 * Cuánto puede sobrevivir una marca antes de que la recoja la limpieza diaria.
 *
 * NO es la ventana de ningún cupo: es el techo de TODAS. `apartarCupoCompartido`
 * ya borra lo que sale de la ventana **de la clave que se está consultando**,
 * que es lo que mantiene el contador correcto; esto recoge lo otro: la
 * procedencia que probó una vez y no volvió, cuya fila nadie vuelve a mirar.
 *
 * Una hora es holgado a propósito (la ventana más larga en uso son los 10
 * minutos del panel): borrar por debajo de la ventana de un cupo lo debilitaría
 * en silencio, y hay una prueba que exige que este techo siga siendo mayor que
 * la ventana más larga que el sistema use.
 */
export const RETENCION_MAXIMA_DE_CUPOS_MS = 60 * 60 * 1000;

/**
 * Filas que la tabla admite antes de podar por antigüedad.
 *
 * Es la paridad con `MAX_IPS_RASTREADAS = 5000` del contador en memoria, con
 * una diferencia que conviene tener escrita: allá el techo eran IPs distintas y
 * aquí son FILAS, así que este es el más estricto de los dos. Existe por lo
 * mismo que aquél: `/admin` es una página pública y anónima, cada envío desde
 * una procedencia nueva escribe una fila, y una escritura sin cota disponible
 * sin autenticarse no puede quedarse sin techo aunque llenarla cueste millones
 * de peticiones.
 *
 * Se poda por lo MÁS VIEJO, igual que el desalojo del mapa en memoria. El
 * efecto secundario es el mismo que allá y se acepta con los ojos abiertos:
 * bajo una avalancha, una procedencia bloqueada podría recuperar su margen
 * antes de tiempo. Con 5000 filas y una ventana de 10 minutos, eso pide un
 * volumen que el propio hosting cortaría antes.
 */
export const MAX_FILAS_DE_CUPOS = 5000;

/** Lo poco que la limpieza necesita de Prisma. */
export type ClienteLimpiezaDeCupos = {
  intentoDeCupo: {
    deleteMany(args: unknown): Promise<{ count: number }>;
    count(args?: unknown): Promise<number>;
  };
  $executeRaw(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<number>;
};

export type ResultadoLimpiezaDeCupos = {
  /** Marcas borradas por viejas. */
  caducadas: number;
  /** Marcas borradas por techo de filas (las más antiguas). */
  podadas: number;
};

/**
 * Recoge lo que el conteo de cupos deja atrás. La llama la tarea programada
 * diaria (`src/lib/purga/rechazados.ts`).
 *
 * Dos barridos, por dos razones distintas:
 *
 * 1. **Retención** (LFPDPPP art. 11, RLFPDPPP art. 37: suprimir cuando la
 *    finalidad se cumple). Una marca fuera de la ventana ya no sirve para
 *    contar nada, así que conservarla es guardar un dato derivado de la IP de
 *    un tercero sin ninguna finalidad. Esto es lo que hace CIERTO lo que
 *    declara `PENDIENTES_OPERATIVOS_LEGALES` sobre cuánto dura el dato.
 * 2. **Cota**. Ver `MAX_FILAS_DE_CUPOS`.
 *
 * Como todo lo que sale de aquí, informa CONTEOS: ni una clave, ni una IP.
 */
export async function limpiarCuposCaducados(
  prisma: ClienteLimpiezaDeCupos,
  opciones: { ahora?: Date; retencionMs?: number; maximoFilas?: number } = {},
): Promise<ResultadoLimpiezaDeCupos> {
  const ahora = opciones.ahora ?? new Date();
  const retencionMs = opciones.retencionMs ?? RETENCION_MAXIMA_DE_CUPOS_MS;
  const maximoFilas = opciones.maximoFilas ?? MAX_FILAS_DE_CUPOS;

  const { count: caducadas } = await prisma.intentoDeCupo.deleteMany({
    where: { ocurrioEn: { lte: new Date(ahora.getTime() - retencionMs) } },
  });

  const vivas = await prisma.intentoDeCupo.count();
  if (vivas <= maximoFilas) return { caducadas, podadas: 0 };

  // Prisma no sabe expresar "borra las N más antiguas" (`deleteMany` no admite
  // orden ni límite), así que va en SQL, con parámetro ligado.
  const podadas = await prisma.$executeRaw`
    DELETE FROM "IntentoDeCupo"
    WHERE "id" IN (
      SELECT "id" FROM "IntentoDeCupo" ORDER BY "ocurrioEn" ASC LIMIT ${vivas - maximoFilas}
    )
  `;
  return { caducadas, podadas };
}
