import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  aE164,
  crearProveedorSimulado,
  proveedorDeVerificacion,
} from "../src/lib/verificacion/proveedor";
import { crearProveedorTwilio } from "../src/lib/verificacion/proveedor-twilio";

/**
 * Spec `registro-negocio` (T-016) · Requirement "La verificación por SMS solo
 * existe si está encendida y completamente configurada", tercer párrafo: "El
 * trato con el proveedor DEBE pasar por un puerto propio… con el adaptador
 * real detrás, igual que el almacén de fotos vive tras `FOTOS_DIR`"
 * (tasks.md #4 y #5).
 *
 * Ni una sola prueba de este archivo toca la red ni pide credenciales: el
 * adaptador real recibe su `fetch` inyectado y el simulado no habla con nadie.
 *
 * Credenciales de mentira (repo público).
 */

const CONFIGURACION_FALSA = {
  cuentaSid: "AC-de-mentiras-0000000000000000000",
  authToken: "token-de-mentiras-que-no-sirve",
  servicioSid: "VA-de-mentiras-0000000000000000000",
  secreto: "secreto-de-pruebas-de-32-caracteres-o-mas",
  topeDiario: 50,
};

/** Número de la serie de pruebas: no es de nadie. */
const NUMERO = "7710000199";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registro-negocio · el puerto y su adaptador simulado", () => {
  it("`iniciar` recorre sus tres desenlaces sin red y sin credenciales", async () => {
    for (const respuesta of ["enviado", "rechazado-por-el-proveedor", "error"] as const) {
      const proveedor = crearProveedorSimulado({ alIniciar: respuesta });
      expect(await proveedor.iniciar(NUMERO)).toBe(respuesta);
    }
  });

  it("`comprobar` recorre sus cuatro desenlaces", async () => {
    for (const respuesta of ["confirmado", "no-coincide", "vencido", "error"] as const) {
      const proveedor = crearProveedorSimulado({ alComprobar: respuesta });
      expect(await proveedor.comprobar(NUMERO, "123456")).toBe(respuesta);
    }
  });

  it("el simulado apunta lo que le pidieron, para que la prueba lo revise", async () => {
    const proveedor = crearProveedorSimulado();
    await proveedor.iniciar(NUMERO);
    await proveedor.iniciar(NUMERO);
    await proveedor.comprobar(NUMERO, "654321");

    expect(proveedor.iniciados).toEqual([NUMERO, NUMERO]);
    expect(proveedor.comprobados).toEqual([{ numero: NUMERO, codigo: "654321" }]);
  });

  it("el simulado puede responder distinto en cada llamada", async () => {
    const proveedor = crearProveedorSimulado({ alComprobar: ["no-coincide", "confirmado"] });
    expect(await proveedor.comprobar(NUMERO, "111111")).toBe("no-coincide");
    expect(await proveedor.comprobar(NUMERO, "123456")).toBe("confirmado");
    // Agotada la lista, se queda con el último desenlace.
    expect(await proveedor.comprobar(NUMERO, "123456")).toBe("confirmado");
  });
});

describe("registro-negocio · el formato del número es del adaptador", () => {
  it("los 10 dígitos guardados salen como E.164 mexicano", () => {
    expect(aE164("7710000199")).toBe("+527710000199");
  });

  it("un número que ya viene con lada o con signos se normaliza igual", () => {
    expect(aE164("+52 771 000 0199")).toBe("+527710000199");
    expect(aE164("52-771-000-0199")).toBe("+527710000199");
  });

  it("lo que no tiene forma de número mexicano no se inventa", () => {
    expect(aE164("77100")).toBeNull();
    expect(aE164("")).toBeNull();
    expect(aE164("no soy un número")).toBeNull();
  });
});

describe("registro-negocio · el adaptador real de Twilio Verify", () => {
  const peticionesDe = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.map(([url, opciones]) => ({
      url: String(url),
      opciones: opciones as RequestInit,
    }));

  it("pide el código al servicio de Verify y traduce el envío", async () => {
    const fetchFalso = vi.fn(async () =>
      new Response(JSON.stringify({ status: "pending" }), { status: 201 }),
    );
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });

    expect(await proveedor.iniciar(NUMERO)).toBe("enviado");

    const [peticion] = peticionesDe(fetchFalso);
    expect(peticion.url).toContain(CONFIGURACION_FALSA.servicioSid);
    expect(peticion.url).toContain("/Verifications");
    expect(peticion.opciones.method).toBe("POST");
    // El número va en E.164 y el canal es SMS.
    expect(String(peticion.opciones.body)).toContain("%2B527710000199");
    expect(String(peticion.opciones.body)).toContain("Channel=sms");
  });

  it("un número que el proveedor no acepta es 'rechazado-por-el-proveedor'", async () => {
    const fetchFalso = vi.fn(async () =>
      new Response(JSON.stringify({ code: 60200, message: "Invalid parameter" }), {
        status: 400,
      }),
    );
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    expect(await proveedor.iniciar(NUMERO)).toBe("rechazado-por-el-proveedor");
  });

  it("un número sin forma válida ni siquiera sale a la red", async () => {
    const fetchFalso = vi.fn();
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    expect(await proveedor.iniciar("123")).toBe("rechazado-por-el-proveedor");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it.each([500, 502, 503])("un error %d del proveedor es 'error'", async (estado) => {
    const fetchFalso = vi.fn(async () => new Response("boom", { status: estado }));
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    expect(await proveedor.iniciar(NUMERO)).toBe("error");
  });

  it("toda excepción del SDK/red se convierte en 'error', no escapa", async () => {
    const fetchFalso = vi.fn(async () => {
      throw new Error("ECONNRESET contra api.twilio.com");
    });
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    await expect(proveedor.iniciar(NUMERO)).resolves.toBe("error");
    await expect(proveedor.comprobar(NUMERO, "123456")).resolves.toBe("error");
  });

  it("comprueba el código contra el proveedor y traduce los cuatro desenlaces", async () => {
    const casos: Array<[Response, string]> = [
      [new Response(JSON.stringify({ status: "approved" }), { status: 200 }), "confirmado"],
      [new Response(JSON.stringify({ status: "pending" }), { status: 200 }), "no-coincide"],
      // 404: la verificación ya no existe en el proveedor (caducó o se consumió).
      [new Response(JSON.stringify({ code: 20404 }), { status: 404 }), "vencido"],
      [new Response("boom", { status: 500 }), "error"],
    ];
    for (const [respuesta, esperado] of casos) {
      const fetchFalso = vi.fn(async () => respuesta.clone());
      const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
      expect(await proveedor.comprobar(NUMERO, "123456"), esperado).toBe(esperado);
    }
  });

  it("no reintenta solo: una llamada, una petición", async () => {
    const fetchFalso = vi.fn(async () => new Response("boom", { status: 500 }));
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    await proveedor.iniciar(NUMERO);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("la espera está acotada: la petición lleva su señal de aborto", async () => {
    const fetchFalso = vi.fn(async (_url: unknown, opciones: RequestInit) => {
      expect(opciones.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ status: "pending" }), { status: 201 });
    });
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, {
      fetch: fetchFalso as unknown as typeof fetch,
    });
    await proveedor.iniciar(NUMERO);
    expect(fetchFalso).toHaveBeenCalled();
  });

  it("ni el código ni las credenciales se escriben en el log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFalso = vi.fn(async () => {
      throw new Error(`falló con el token ${CONFIGURACION_FALSA.authToken}`);
    });
    const proveedor = crearProveedorTwilio(CONFIGURACION_FALSA, { fetch: fetchFalso });
    await proveedor.iniciar(NUMERO);
    await proveedor.comprobar(NUMERO, "424242");

    const escrito = [...warn.mock.calls, ...error.mock.calls]
      .map((llamada) => llamada.join(" "))
      .join("\n");
    expect(escrito).not.toContain(CONFIGURACION_FALSA.authToken);
    expect(escrito).not.toContain(CONFIGURACION_FALSA.cuentaSid);
    expect(escrito).not.toContain("424242");
    expect(escrito).not.toContain(NUMERO);
  });
});

describe("registro-negocio · con la capacidad apagada no se construye nada del proveedor", () => {
  // Scenario: la suite no llama a la red ni pide credenciales
  it("`proveedorDeVerificacion` devuelve null sin configuración", async () => {
    expect(await proveedorDeVerificacion(null)).toBeNull();
  });

  it("con configuración completa sí devuelve el adaptador real", async () => {
    const proveedor = await proveedorDeVerificacion(CONFIGURACION_FALSA);
    expect(proveedor).not.toBeNull();
    expect(typeof proveedor?.iniciar).toBe("function");
    expect(typeof proveedor?.comprobar).toBe("function");
  });

  it("el puerto no importa el SDK del proveedor: ni una dependencia nueva", () => {
    const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const paquete = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    const dependencias = {
      ...paquete.dependencies,
      ...paquete.devDependencies,
    } as Record<string, string>;
    expect(Object.keys(dependencias)).not.toContain("twilio");
  });

  it("ningún módulo de la capacidad pide un dominio externo fuera del adaptador", () => {
    const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const carpeta = path.join(raiz, "src/lib/verificacion");
    for (const nombre of readdirSync(carpeta)) {
      if (nombre === "proveedor-twilio.ts" || !nombre.endsWith(".ts")) continue;
      const cuerpo = readFileSync(path.join(carpeta, nombre), "utf8");
      // Las URLs en comentarios de documentación no cuentan: se mira el código.
      const sinComentarios = cuerpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(sinComentarios, nombre).not.toMatch(/https?:\/\//);
    }
  });
});
