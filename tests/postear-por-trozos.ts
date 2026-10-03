import http from "node:http";

/**
 * Un POST de cuerpo desmedido que se manda por trozos y deja de escribir en
 * cuanto llega la respuesta (como un navegador). Lo comparten las pruebas de
 * cuerpos grandes contra el emulador (`tests/salida-astro.ts`).
 *
 * Por qué no basta con `write` + esperar `drain` (M2 de c-seguridad.md de
 * `migrar-verificacion-sms-astro`): el emulador responde sin leer todo el
 * cuerpo y cierra; como al cerrar le queda cuerpo sin leer, su sistema manda
 * un RST justo detrás de la respuesta. Si el cliente tenía una escritura
 * pendiente, a veces Node ve primero el EPIPE de esa escritura, destruye el
 * socket y la respuesta, que ya había llegado, nunca se lee. El ayudante viejo
 * ignoraba ese EPIPE y se quedaba esperando un `drain` que nunca llegaba (el
 * 60 s mudo). Es una carrera del transporte entre los dos procesos de prueba:
 * Vercel recibe el cuerpo entero (o lo corta en 4.5 MB) antes de la función.
 *
 * Aquí:
 * - la espera de `drain` también se suelta con la respuesta o el cierre;
 * - una conexión que se cierra SIN respuesta se reintenta con una petición
 *   nueva idéntica (hasta `intentos`), y si nunca hay respuesta falla diciendo
 *   por qué (medido en macOS: se pierde ~1 de cada 80 en serie y 30-40 % con
 *   8 a la vez; 2000 envíos de 7 MiB en paralelo, 0 fallas con 10 intentos); el contenido de la respuesta no se toca, así que las aserciones
 *   de cada prueba valen igual (las que cuentan llamadas, lecturas o cupos
 *   ven además los reintentos);
 * - cada intento tiene su tope de tiempo y falla con un mensaje claro en vez
 *   de agotar el de la prueba.
 */
export type RespuestaCruda = { status: number; cuerpo: string; cabeceras: Headers; escritos: number };

type Opciones = {
  /** Los trozos del cuerpo, en orden; se piden uno a uno (200 MiB no se arman en memoria). */
  trozos: () => Iterable<Buffer | string>;
  intentos?: number;
  limiteMs?: number;
};

/** Se resuelve con el primero de los eventos y quita los demás oyentes. */
function primeroDe(emisor: NodeJS.EventEmitter, eventos: string[]): Promise<void> {
  return new Promise((listo) => {
    const soltar = () => {
      for (const evento of eventos) emisor.off(evento, soltar);
      listo();
    };
    for (const evento of eventos) emisor.once(evento, soltar);
  });
}

function intento(url: URL, cabeceras: Record<string, string>, { trozos, limiteMs }: Required<Opciones>): Promise<RespuestaCruda | { perdida: string }> {
  return new Promise((listo, falla) => {
    let respondio = false;
    let terminado = false;
    let escritos = 0;
    let ultimoError = "sin error";
    const cerrar = (accion: () => void) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      accion();
    };
    const peticion = http.request(url, { method: "POST", headers: cabeceras, agent: false }, (r) => {
      respondio = true;
      const partes: Buffer[] = [];
      r.on("data", (t: Buffer) => partes.push(t));
      r.on("end", () =>
        cerrar(() => {
          const h = new Headers();
          for (let i = 0; i < r.rawHeaders.length; i += 2) h.append(r.rawHeaders[i], r.rawHeaders[i + 1]);
          listo({ status: r.statusCode ?? 0, cuerpo: Buffer.concat(partes).toString("utf8"), cabeceras: h, escritos });
          peticion.destroy();
        }),
      );
      r.on("close", () => {
        if (!r.complete) cerrar(() => falla(new Error(`POST ${url.pathname}: la respuesta ${r.statusCode} se cortó a medias (${escritos} bytes escritos).`)));
      });
    });
    const reloj = setTimeout(
      () =>
        cerrar(() => {
          peticion.destroy();
          falla(new Error(`POST ${url.pathname}: sin respuesta completa en ${limiteMs / 1000} s (${escritos} bytes escritos, ${respondio ? "con la respuesta a medias" : "sin respuesta"}, último error: ${ultimoError}).`));
        }),
      limiteMs,
    );
    // Cortar la subida a media escritura es lo esperado; lo decide "close".
    peticion.on("error", (error: NodeJS.ErrnoException) => (ultimoError = error.code ?? error.message));
    peticion.on("close", () => {
      if (!respondio) cerrar(() => listo({ perdida: ultimoError }));
    });
    void (async () => {
      for (const trozo of trozos()) {
        if (respondio || terminado || peticion.destroyed) return;
        escritos += trozo.length;
        if (!peticion.write(trozo)) await primeroDe(peticion, ["drain", "response", "close"]);
      }
      if (!respondio && !peticion.destroyed) peticion.end();
    })();
  });
}

export async function postearPorTrozos(url: URL, cabeceras: Record<string, string>, opciones: Opciones): Promise<RespuestaCruda> {
  const completas = { intentos: 10, limiteMs: 15_000, ...opciones };
  const perdidas: string[] = [];
  for (let i = 0; i < completas.intentos; i++) {
    const r = await intento(url, cabeceras, completas);
    if (!("perdida" in r)) return r;
    perdidas.push(r.perdida);
  }
  throw new Error(`POST ${url.pathname}: el servidor cerró la conexión sin responder en ${completas.intentos} intentos (${perdidas.join(", ")}).`);
}

/** Un `Buffer` en trozos de `tamano` bytes. */
export function* enTrozos(cuerpo: Buffer, tamano = 64 * 1024): Generator<Buffer> {
  for (let i = 0; i < cuerpo.length; i += tamano) yield cuerpo.subarray(i, i + tamano);
}
