/**
 * Adaptador de Resend, con `fetch` y sin SDK (design.md §2).
 *
 * Una llamada HTTP con tres cabeceras y un JSON no justifica una dependencia
 * más en un proyecto que cuida el peso; y el día que se cambie de proveedor,
 * lo que se reescribe son estas quince líneas.
 *
 * DOS COSAS QUE ESTE ADAPTADOR HACE Y LA SPEC EXIGE:
 *
 * 1. **Límite de espera propio.** El presupuesto de tiempo de la función es de
 *    la purga, y el correo es el invitado: un proveedor que no contesta no se
 *    lleva por delante la tarea programada. `AbortController` corta a los
 *    pocos segundos y el intento cuenta como fallido.
 * 2. **Clave de idempotencia.** Va en la cabecera `Idempotency-Key`. Resend
 *    guarda las claves **24 horas** y descarta el segundo envío con la misma:
 *    ahí se apoya la garantía de "un correo al día" sin tablas nuevas
 *    (design.md §3).
 *
 * **EL 409 SE PARTE EN DOS, Y ESTO ES LO FINO DE TODO EL ARCHIVO** (hallazgo
 * MEDIO-1 de la etapa C). Resend responde `409` cuando esa clave ya se usó:
 * `invalid_idempotent_request` si el cuerpo cambió —los conteos de la tarde no
 * son los de la mañana— y `concurrent_idempotent_requests` si hay otro envío
 * con la misma clave en vuelo. La primera versión de este adaptador traducía
 * los dos a "mandado", con este razonamiento: si la clave está usada, el correo
 * del día ya salió.
 *
 * **El razonamiento tenía un agujero, y la propia documentación del proveedor
 * lo confirma.** El mensaje oficial de `invalid_idempotent_request` dice: *"This
 * idempotency key **has been used** with this HTTP method and endpoint within
 * the last 24 hours, but the request body was modified"*. Usada por una
 * PETICIÓN, no por un envío aceptado. O sea que un primer intento que el
 * proveedor rechazó —el caso realista: dominio sin verificar, remitente
 * inválido— puede dejar la clave ocupada durante 24 h; y entonces el segundo
 * disparo del día, con los conteos ya cambiados, recibía un 409 y la tarea
 * respondía **200 con "mandado" sin que al buzón hubiera llegado nada**. Verde
 * cuando está roto es justo lo que este proyecto no se permite (spec: "Cuando
 * el envío falle … la respuesta NO DEBE ser de éxito").
 *
 * Ahora se distingue por lo único que se puede saber con certeza:
 *
 * - **409 con un envío aceptado ANTES en este mismo proceso y con esta misma
 *   clave** → "mandado". No hay duda: el correo de hoy salió y lo vimos salir.
 *   Es el caso del disparo repetido, que es el que la spec quiere que no mande
 *   un segundo correo.
 * - **409 "en frío"** (este proceso no vio salir nada) → **"fallido"**. Puede
 *   que el correo saliera desde otra instancia, o puede que la clave la haya
 *   quemado un rechazo: desde aquí no se distingue, así que se avisa. Un falso
 *   rojo hace que el operador mire el panel del proveedor; un falso verde deja
 *   al admin sin avisos 24 h y sin enterarse.
 *
 * Reintentar con una clave distinta NO es una salida: si el primer intento sí
 * salió, mandaría un segundo correo el mismo día, que es exactamente lo que la
 * clave existe para evitar.
 *
 * Ni la credencial ni el buzón destino salen nunca en un mensaje de error: lo
 * que se registra es el código de respuesta y el nombre del fallo. El cuerpo de
 * la respuesta **no se lee nunca** —trae de vuelta el destinatario, el
 * remitente y el texto del correo—, solo se descarta.
 */
import type { ConfiguracionCorreo } from "./configuracion";
import type { MensajeAviso, PuertoCorreo, ResultadoEnvio } from "./puerto";

/** Dirección de la API de envío del proveedor. */
export const URL_API_RESEND = "https://api.resend.com/emails";

/**
 * Cuánto se espera al proveedor antes de darlo por perdido. Unos pocos
 * segundos: la tarea programada tiene su propio presupuesto y no es este.
 */
export const MS_LIMITE_ENVIO_CORREO = 5_000;

/**
 * La última clave con la que ESTE proceso vio un envío aceptado.
 *
 * Es lo único que permite leer un 409 sin adivinar (ver el encabezado). No
 * sustituye a la idempotencia del proveedor —en serverless cada instancia
 * tiene su propia memoria y lo normal es no saber nada—: solo añade certeza
 * cuando la hay. Se guarda una sola clave porque solo hay una por día.
 */
let claveConEnvioAceptado: string | null = null;

/** Solo para pruebas: deja el proceso sin memoria de envíos aceptados. */
export function reiniciarMemoriaDeEnviosDeCorreo(): void {
  claveConEnvioAceptado = null;
}

/**
 * Cómo se presenta este cliente ante el proveedor.
 *
 * No es decorativo: Resend **bloquea con un 403 (código 1010) toda petición sin
 * `User-Agent`**, antes incluso de que llegue a su API
 * (`resend.com/docs/knowledge-base/403-error-1010`). El `fetch` de Node manda
 * hoy un `user-agent: node` por su cuenta, así que esto no arregla un fallo
 * actual: le quita la dependencia de un detalle del runtime a algo que, si
 * cambiara, fallaría TODOS los días en producción y en ningún sitio más.
 */
const AGENTE_DE_USUARIO = "EnMiRumbo";

export function crearCorreoResend(configuracion: ConfiguracionCorreo): PuertoCorreo {
  const { apiKey, remitente, destino } = configuracion;

  return {
    async mandar(mensaje: MensajeAviso): Promise<ResultadoEnvio> {
      const control = new AbortController();
      const alarma = setTimeout(() => control.abort(), MS_LIMITE_ENVIO_CORREO);
      try {
        const respuesta = await fetch(URL_API_RESEND, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": mensaje.claveDelDia,
            "User-Agent": AGENTE_DE_USUARIO,
          },
          body: JSON.stringify({
            from: `${mensaje.remitenteVisible} <${remitente}>`,
            to: [destino],
            subject: mensaje.asunto,
            text: mensaje.texto,
          }),
          signal: control.signal,
        });

        // El cuerpo NO se lee —trae de vuelta el destinatario, el remitente y
        // el texto del correo— pero sí se descarta, para no dejar el flujo
        // abierto esperando al recolector en un servidor de vida larga
        // (BAJO-1 de la etapa C). En serverless da igual; aquí no cuesta nada.
        void respuesta.body?.cancel().catch(() => {});

        if (respuesta.ok) {
          claveConEnvioAceptado = mensaje.claveDelDia;
          return "mandado";
        }

        if (respuesta.status === 409) {
          if (claveConEnvioAceptado === mensaje.claveDelDia) {
            console.log(
              "[aviso] el correo de hoy ya salió con esta misma clave: no se manda otro",
            );
            return "mandado";
          }
          console.error(
            "[aviso] el proveedor respondió 409: la clave de hoy ya se usó en otra petición y " +
              "ESTE intento no mandó nada. Si el intento anterior fue rechazado, hoy no ha salido " +
              "ningún aviso: míralo en el panel del proveedor (docs/despliegue.md §6.1).",
          );
          return "fallido";
        }

        console.error(
          `[aviso] el proveedor de correo respondió ${respuesta.status}: el aviso de hoy NO salió`,
        );
        return "fallido";
      } catch (error) {
        // Ni el mensaje del proveedor ni ningún dato: solo qué clase de fallo
        // fue. `AbortError` es nuestro propio límite de espera.
        const clase = error instanceof Error ? error.name : "error desconocido";
        console.error(
          `[aviso] no se pudo hablar con el proveedor de correo (${clase}): el aviso de hoy NO salió`,
        );
        return "fallido";
      } finally {
        clearTimeout(alarma);
      }
    },

    descripcion() {
      return "Resend (api.resend.com)";
    },
  };
}
