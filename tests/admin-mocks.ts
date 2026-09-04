/**
 * Simulación del request de Next.js para probar las páginas y las Server
 * Actions del panel sin levantar el servidor.
 *
 * `cookies()` y `headers()` solo existen dentro de un request real, y
 * `redirect()`/`notFound()` cortan el flujo lanzando. Aquí se sustituyen por
 * equivalentes controlables: así los tests pueden mandar una petición CON o
 * SIN cookie de sesión a cualquier pantalla o acción del panel —que es
 * exactamente el escenario "llega directamente al servidor una petición de
 * aprobar sin cookie de sesión válida" de la spec `revision-admin`.
 *
 * No es un mock de la lógica: la sesión que se firma, la contraseña que se
 * compara y las consultas a la base son las de producción.
 */

export class RedireccionSimulada extends Error {
  constructor(readonly url: string) {
    super(`redirect(${url})`);
    this.name = "RedireccionSimulada";
  }
}

export class NoEncontradoSimulado extends Error {
  constructor() {
    super("notFound()");
    this.name = "NoEncontradoSimulado";
  }
}

export type CookiePuesta = {
  nombre: string;
  valor: string;
  opciones: Record<string, unknown>;
};

/** Estado del "request" en curso. Cada test lo arma a su gusto. */
export const peticion = {
  /** Cookies que manda el navegador. */
  cookies: {} as Record<string, string>,
  /** Encabezados de la petición (IP del proxy, protocolo…). */
  encabezados: {} as Record<string, string>,
  /** Cookies que el servidor pidió guardar en la respuesta. */
  puestas: [] as CookiePuesta[],
};

export function reiniciarPeticion(): void {
  peticion.cookies = {};
  peticion.encabezados = {};
  peticion.puestas = [];
}

export async function cookies() {
  return {
    get(nombre: string) {
      const valor = peticion.cookies[nombre];
      return valor === undefined ? undefined : { name: nombre, value: valor };
    },
    set(nombre: string, valor: string, opciones: Record<string, unknown> = {}) {
      peticion.puestas.push({ nombre, valor, opciones });
    },
    delete(nombre: string) {
      peticion.puestas.push({ nombre, valor: "", opciones: { maxAge: 0 } });
    },
  };
}

export async function headers() {
  return new Headers(peticion.encabezados);
}

export function redirect(url: string): never {
  throw new RedireccionSimulada(url);
}

export function notFound(): never {
  throw new NoEncontradoSimulado();
}

/** Corre algo que debe redirigir y devuelve a dónde mandó. */
export async function urlDeRedireccion(
  accion: () => unknown | Promise<unknown>,
): Promise<string> {
  try {
    await accion();
  } catch (error) {
    if (error instanceof RedireccionSimulada) return error.url;
    throw error;
  }
  throw new Error("se esperaba una redirección y no hubo ninguna");
}
