import { readFileSync } from "node:fs";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { avisarPendientes } from "../src/lib/avisos/aviso";
import { CLAVE_AVISO_PREFIJO, claveDelDia, fechaEnTizayuca } from "../src/lib/avisos/dia";
import { contarPendientes } from "../src/lib/avisos/pendientes";
import {
  asuntoDelAviso,
  cuerpoDelAviso,
  NOMBRE_REMITENTE_AVISO,
} from "../src/lib/avisos/textos";
import {
  configuracionDeCorreo,
  faltantesDeCorreo,
  reiniciarAvisoDeCorreoSinConfigurar,
  VARIABLE_CORREO_API_KEY,
  VARIABLE_CORREO_DESTINO,
  VARIABLE_CORREO_REMITENTE,
} from "../src/lib/correo/configuracion";
import { correoDeAvisos } from "../src/lib/correo/correo";
import {
  crearCorreoResend,
  MS_LIMITE_ENVIO_CORREO,
  reiniciarMemoriaDeEnviosDeCorreo,
  URL_API_RESEND,
} from "../src/lib/correo/resend";
import { obtenerColaDeRevision } from "../src/lib/admin/consultas";
import { obtenerNegociosReportados } from "../src/lib/admin/reportes";
import { crearClientePrueba } from "./db";

/**
 * Spec `revision-admin` · Requirements "Un aviso al día por correo cuando hay
 * pendientes, y ninguno cuando no los hay" y "El correo dice cuántos hay,
 * nunca quiénes son"; spec `despliegue` · Requirement "Sin la configuración
 * del correo, el aviso no se manda y se nota en el log" (change
 * `agregar-aviso-diario-pendientes`, tasks 2.x, 3.x, 4.1 y 6.x).
 *
 * Aquí se prueban las piezas; el enganche con la tarea programada vive en
 * `tests/aviso-pendientes-tarea.test.ts`.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771998 7xxx, y ninguna
 * dirección de correo real — `@ejemplo.invalid` no existe ni puede existir.
 */

const PREFIJO = "7719987";
const AHORA = new Date("2026-09-04T13:17:00.000Z");

/** Entorno completo de mentiras. Ninguna de estas direcciones es de nadie. */
const ENTORNO_COMPLETO = {
  [VARIABLE_CORREO_API_KEY]: "re_llave_de_mentiras",
  [VARIABLE_CORREO_REMITENTE]: "avisos@ejemplo.invalid",
  [VARIABLE_CORREO_DESTINO]: "buzon@ejemplo.invalid",
  SITIO_URL: "https://enmirumbo.example",
};

/** El entorno completo menos una variable, para probar cada hueco. */
function sinLaVariable(nombre: string): Record<string, string | undefined> {
  const copia: Record<string, string | undefined> = { ...ENTORNO_COMPLETO };
  delete copia[nombre];
  return copia;
}

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

async function alta(
  whatsapp: string,
  datos: Record<string, unknown> = {},
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio del Aviso",
      categoriaId,
      whatsapp,
      coloniaId,
      consintioAvisoEn: AHORA,
      registradoEn: AHORA,
      ...datos,
    },
  });
  return creado.id;
}

async function edicionPendienteDe(negocioId: string, estado = "pendiente"): Promise<void> {
  await prisma.edicionPendiente.create({
    data: {
      negocioId,
      nombre: "Negocio Ficticio del Aviso",
      categoriaId,
      whatsapp: `${PREFIJO}900`,
      coloniaId,
      estado,
    },
  });
}

async function reportePendienteDe(negocioId: string, estado = "pendiente"): Promise<void> {
  await prisma.reporte.create({
    data: { negocioId, motivo: "cerrado", estado },
  });
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
  reiniciarAvisoDeCorreoSinConfigurar();
  // La memoria de envíos aceptados es del proceso: sin esto, una prueba
  // heredaría el "ya salió hoy" de la anterior y un 409 en frío no lo sería.
  reiniciarMemoriaDeEnviosDeCorreo();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 3.1 Los conteos salen de la cola, no de consultas nuevas ───────────────

describe("aviso · cuenta lo mismo que el admin ve en la cola", () => {
  // Scenario: hay pendientes de los tres tipos
  it("cuenta altas nuevas, ediciones y reportes por separado", async () => {
    await alta(`${PREFIJO}001`);
    await alta(`${PREFIJO}002`);
    const publicado = await alta(`${PREFIJO}003`, {
      estado: "publicado",
      publicadoEn: AHORA,
    });
    await edicionPendienteDe(publicado);
    const reportado = await alta(`${PREFIJO}004`, { estado: "publicado", publicadoEn: AHORA });
    await reportePendienteDe(reportado);
    await reportePendienteDe(reportado);

    expect(await contarPendientes(prisma)).toEqual({
      altas: 2,
      ediciones: 1,
      reportes: 2,
      total: 5,
    });
  });

  // Scenario: el panel está al día
  it("con la cola vacía no cuenta nada", async () => {
    await alta(`${PREFIJO}010`, { estado: "publicado", publicadoEn: AHORA });
    await alta(`${PREFIJO}011`, { estado: "rechazado", rechazadoEn: AHORA });

    expect(await contarPendientes(prisma)).toEqual({
      altas: 0,
      ediciones: 0,
      reportes: 0,
      total: 0,
    });
  });

  // Scenario: los conteos dicen lo mismo que la cola
  it("un en_revision con edición pendiente cuenta UNA vez, como la cola", async () => {
    const enRevision = await alta(`${PREFIJO}020`);
    await edicionPendienteDe(enRevision);
    const publicado = await alta(`${PREFIJO}021`, { estado: "publicado", publicadoEn: AHORA });
    await edicionPendienteDe(publicado);

    const conteo = await contarPendientes(prisma);
    const cola = await obtenerColaDeRevision(prisma, AHORA);

    expect(conteo).toMatchObject({ altas: 1, ediciones: 1 });
    // Exactamente los renglones que el admin tiene enfrente, ni uno más.
    expect(conteo.altas + conteo.ediciones).toBe(cola.length);
  });

  it("las ediciones aplicadas y descartadas no son pendientes", async () => {
    const publicado = await alta(`${PREFIJO}030`, { estado: "publicado", publicadoEn: AHORA });
    await edicionPendienteDe(publicado, "aplicada");
    await edicionPendienteDe(publicado, "descartada");

    expect(await contarPendientes(prisma)).toMatchObject({ ediciones: 0, total: 0 });
  });

  // Scenario: un negocio que espera revisión y además tiene reportes
  it("los reportes se cuentan por reporte y no le restan nada al alta", async () => {
    const enRevision = await alta(`${PREFIJO}040`);
    await reportePendienteDe(enRevision);
    await reportePendienteDe(enRevision);
    await reportePendienteDe(enRevision);

    const conteo = await contarPendientes(prisma);
    const reportados = await obtenerNegociosReportados(prisma);

    expect(conteo).toEqual({ altas: 1, ediciones: 0, reportes: 3, total: 4 });
    // La cola pinta UN negocio con tres reportes; el correo dice tres.
    expect(reportados).toHaveLength(1);
    expect(reportados[0].totalPendientes).toBe(3);
  });

  it("los reportes ya atendidos no cuentan", async () => {
    const publicado = await alta(`${PREFIJO}050`, { estado: "publicado", publicadoEn: AHORA });
    await reportePendienteDe(publicado, "atendido");

    expect(await contarPendientes(prisma)).toMatchObject({ reportes: 0, total: 0 });
  });
});

// ── 4.1 El día es el de Tizayuca ────────────────────────────────────────────

describe("aviso · el día que cuenta es el de Tizayuca", () => {
  it("a las 13:17 UTC (07:17 local) el día es el mismo", () => {
    expect(fechaEnTizayuca(new Date("2026-09-04T13:17:00.000Z"))).toBe("2026-09-04");
  });

  // Scenario: dos disparos del mismo día de Tizayuca que en UTC son días
  // distintos (17:00 y 20:00 locales: 23:00 UTC y 02:00 UTC del día siguiente)
  it("dos disparos del mismo día local comparten clave aunque cambie el día UTC", () => {
    const tarde = new Date("2026-09-04T23:00:00.000Z");
    const noche = new Date("2026-09-05T02:00:00.000Z");

    expect(tarde.toISOString().slice(0, 10)).not.toBe(noche.toISOString().slice(0, 10));
    expect(claveDelDia(tarde)).toBe(claveDelDia(noche));
    expect(claveDelDia(noche)).toBe(`${CLAVE_AVISO_PREFIJO}2026-09-04`);
  });

  it("dos días locales distintos NO comparten clave", () => {
    // 23:00 locales del 3 (05:00 UTC del 4) contra las 07:17 locales del 4.
    expect(claveDelDia(new Date("2026-09-04T05:00:00.000Z"))).toBe(
      `${CLAVE_AVISO_PREFIJO}2026-09-03`,
    );
    expect(claveDelDia(new Date("2026-09-04T13:17:00.000Z"))).toBe(
      `${CLAVE_AVISO_PREFIJO}2026-09-04`,
    );
  });

  it("la clave depende solo de la fecha, nunca de los conteos", () => {
    // Guardián barato: si alguien mete los conteos en la clave, un pendiente
    // nuevo a media tarde abriría la puerta a un segundo correo (design §3).
    const fuente = readFileSync(new URL("../src/lib/avisos/dia.ts", import.meta.url), "utf8");
    expect(fuente.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(
      /altas|ediciones|reportes|total/i,
    );
  });
});

// ── 3.2 Los textos del correo, literales ────────────────────────────────────

describe("aviso · los textos son los de la spec, carácter por carácter", () => {
  const ENLACE = "https://enmirumbo.example/admin";

  // Scenario: el correo de un día con los tres tipos
  it("con 2 altas, 1 edición y 2 reportes", () => {
    expect(asuntoDelAviso(5)).toBe("EnMiRumbo: 5 pendientes por revisar");
    expect(cuerpoDelAviso({ altas: 2, ediciones: 1, reportes: 2, total: 5 }, ENLACE)).toBe(
      [
        "Hay pendientes en la cola de EnMiRumbo:",
        "",
        "Altas nuevas: 2",
        "Ediciones: 1",
        "Reportes sin atender: 2",
        "",
        `Entra al panel: ${ENLACE}`,
        "",
        "Acuérdate: la meta es contestarle a cada negocio en menos de 48 horas.",
        "",
        "Este aviso lo manda solo el sistema, una vez al día y nada más cuando hay algo esperando.",
      ].join("\n"),
    );
  });

  // Scenario: un día con un solo pendiente
  it("con un solo pendiente el asunto va en singular y sobra toda línea en cero", () => {
    expect(asuntoDelAviso(1)).toBe("EnMiRumbo: 1 pendiente por revisar");
    const cuerpo = cuerpoDelAviso({ altas: 0, ediciones: 1, reportes: 0, total: 1 }, ENLACE);
    expect(cuerpo).toContain("Ediciones: 1");
    expect(cuerpo).not.toContain("Altas nuevas");
    expect(cuerpo).not.toContain("Reportes sin atender");
    expect(cuerpo).not.toContain(": 0");
  });

  // Scenario: un día en el que solo hay reportes
  it("con tres reportes y nada más", () => {
    expect(asuntoDelAviso(3)).toBe("EnMiRumbo: 3 pendientes por revisar");
    const cuerpo = cuerpoDelAviso({ altas: 0, ediciones: 0, reportes: 3, total: 3 }, ENLACE);
    expect(cuerpo).toContain("Reportes sin atender: 3");
    expect(cuerpo).not.toContain("Altas nuevas");
    expect(cuerpo).not.toContain("Ediciones");
  });

  it("las tres líneas van siempre en el mismo orden", () => {
    const cuerpo = cuerpoDelAviso({ altas: 1, ediciones: 1, reportes: 1, total: 3 }, ENLACE);
    expect(cuerpo.indexOf("Altas nuevas")).toBeLessThan(cuerpo.indexOf("Ediciones"));
    expect(cuerpo.indexOf("Ediciones")).toBeLessThan(cuerpo.indexOf("Reportes sin atender"));
  });

  it("el remitente se presenta como EnMiRumbo, sin la marca anterior ni la localidad pegada", () => {
    expect(NOMBRE_REMITENTE_AVISO).toBe("EnMiRumbo");
    const cuerpo = cuerpoDelAviso({ altas: 1, ediciones: 0, reportes: 0, total: 1 }, ENLACE);
    for (const prohibido of ["NecesitoUno", "EnMiRumbo Tizayuca", "Directorio Tizayuca"]) {
      expect(`${asuntoDelAviso(1)} ${cuerpo}`).not.toContain(prohibido);
    }
  });
});

// ── 2.2 El lector de configuración, fail-safe ───────────────────────────────

describe("aviso · sin configuración completa no se manda nada", () => {
  // Scenario: nada configurado
  it("sin ninguna variable, nombra las cuatro que faltan", () => {
    expect(faltantesDeCorreo({})).toEqual([
      VARIABLE_CORREO_API_KEY,
      VARIABLE_CORREO_REMITENTE,
      VARIABLE_CORREO_DESTINO,
      "SITIO_URL",
    ]);
    expect(configuracionDeCorreo({})).toBeNull();
  });

  // Scenario: proveedor configurado y buzón destino sin configurar
  it("con proveedor y remitente pero sin destino, nombra solo el destino", () => {
    const resto = sinLaVariable(VARIABLE_CORREO_DESTINO);
    expect(faltantesDeCorreo(resto)).toEqual([VARIABLE_CORREO_DESTINO]);
    expect(configuracionDeCorreo(resto)).toBeNull();
  });

  // Scenario: sin `SITIO_URL` no sale un correo con un enlace roto
  it("sin SITIO_URL no hay configuración, porque el enlace sería inservible", () => {
    expect(faltantesDeCorreo(sinLaVariable("SITIO_URL"))).toEqual(["SITIO_URL"]);
  });

  /**
   * Hallazgo MEDIO-2 de la etapa C: la guarda comparaba contra la cadena
   * literal `http://localhost:3000`, así que cualquier variante —otro puerto,
   * la IP de loopback, la de la red de casa— pasaba y el aviso salía todos los
   * días con un enlace que desde el celular del admin no abre nada.
   */
  it.each([
    ["http://localhost:3000"],
    ["http://localhost:3001"],
    ["http://localhost"],
    ["https://LOCALHOST:8443"],
    ["http://127.0.0.1:3000"],
    ["http://127.1.2.3"],
    ["http://[::1]:3000"],
    ["http://0.0.0.0:3000"],
    ["http://192.168.1.50:3000"],
    ["http://10.0.0.8"],
    ["http://172.16.4.20"],
    ["http://169.254.10.1"],
    ["http://mi-laptop:3000"],
    ["http://servidor.local"],
    ["http://panel.localhost"],
  ])("un SITIO_URL de %s deja el aviso apagado: ese enlace no abre desde un celular", (valor) => {
    expect(faltantesDeCorreo({ ...ENTORNO_COMPLETO, SITIO_URL: valor })).toEqual(["SITIO_URL"]);
    expect(configuracionDeCorreo({ ...ENTORNO_COMPLETO, SITIO_URL: valor })).toBeNull();
  });

  it("un dominio público de verdad sí vale, con o sin puerto", () => {
    for (const valor of [
      "https://enmirumbo.example",
      "https://www.enmirumbo.example",
      "https://enmirumbo.example:8443",
      "http://203.0.113.10",
    ]) {
      expect(faltantesDeCorreo({ ...ENTORNO_COMPLETO, SITIO_URL: valor }), valor).toEqual([]);
    }
  });

  it("valores de puros espacios son como no tenerlos", () => {
    expect(faltantesDeCorreo({ ...ENTORNO_COMPLETO, [VARIABLE_CORREO_API_KEY]: "   " })).toEqual([
      VARIABLE_CORREO_API_KEY,
    ]);
  });

  it("con las cuatro puestas, la configuración trae el enlace del panel", () => {
    expect(configuracionDeCorreo(ENTORNO_COMPLETO)).toEqual({
      apiKey: "re_llave_de_mentiras",
      remitente: "avisos@ejemplo.invalid",
      destino: "buzon@ejemplo.invalid",
      urlPanel: "https://enmirumbo.example/admin",
    });
  });

  it("nunca inventa un valor propio para un hueco", () => {
    const fuente = readFileSync(
      new URL("../src/lib/correo/configuracion.ts", import.meta.url),
      "utf8",
    );
    // Ni remitente de pruebas del proveedor, ni buzón por defecto.
    expect(fuente).not.toContain("resend.dev");
    expect(fuente).not.toMatch(/\?\?\s*"[^"]*@/);
  });

  // Scenario: el aviso del log no se repite
  it("el log lo dice UNA sola vez por proceso, no una por corrida", async () => {
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await avisarPendientes({ prisma, env: {}, ahora: AHORA })).toBe("sin-configurar");
    expect(await avisarPendientes({ prisma, env: {}, ahora: AHORA })).toBe("sin-configurar");
    expect(await avisarPendientes({ prisma, env: {}, ahora: AHORA })).toBe("sin-configurar");

    expect(avisos).toHaveBeenCalledTimes(1);
    const dicho = avisos.mock.calls.flat().join(" ");
    expect(dicho).toContain("[aviso]");
    expect(dicho).toContain(VARIABLE_CORREO_API_KEY);
    expect(dicho).toContain(VARIABLE_CORREO_DESTINO);
  });
});

// ── 2.4 El adaptador nulo ───────────────────────────────────────────────────

describe("aviso · el adaptador de cuando no hay configuración", () => {
  it("no toca la red y responde que no está configurado", async () => {
    const red = vi.spyOn(globalThis, "fetch");
    const puerto = correoDeAvisos({});

    expect(
      await puerto.mandar({ asunto: "x", texto: "y", claveDelDia: "z", remitenteVisible: "w" }),
    ).toBe("no-configurado");
    expect(red).not.toHaveBeenCalled();
    expect(puerto.descripcion()).toContain("SIN CONFIGURAR");
  });

  it("su descripción no lleva ninguna credencial ni ninguna dirección", () => {
    expect(correoDeAvisos(ENTORNO_COMPLETO).descripcion()).not.toContain("re_llave_de_mentiras");
    expect(correoDeAvisos(ENTORNO_COMPLETO).descripcion()).not.toContain("buzon@ejemplo.invalid");
  });
});

// ── 2.3 El adaptador de Resend ──────────────────────────────────────────────

describe("aviso · el adaptador que habla con el proveedor", () => {
  const mensaje = {
    asunto: "EnMiRumbo: 1 pendiente por revisar",
    texto: "Hay pendientes en la cola de EnMiRumbo:",
    claveDelDia: `${CLAVE_AVISO_PREFIJO}2026-09-04`,
    remitenteVisible: "EnMiRumbo",
  };

  const puerto = () =>
    crearCorreoResend({
      apiKey: "re_llave_de_mentiras",
      remitente: "avisos@ejemplo.invalid",
      destino: "buzon@ejemplo.invalid",
      urlPanel: "https://enmirumbo.example/admin",
    });

  it("manda un texto plano con la clave del día en su cabecera", async () => {
    const red = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));

    expect(await puerto().mandar(mensaje)).toBe("mandado");

    const [url, opciones] = red.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_API_RESEND);
    const cabeceras = opciones.headers as Record<string, string>;
    expect(cabeceras["Idempotency-Key"]).toBe(`${CLAVE_AVISO_PREFIJO}2026-09-04`);
    expect(cabeceras.Authorization).toBe("Bearer re_llave_de_mentiras");
    const cuerpo = JSON.parse(opciones.body as string) as Record<string, unknown>;
    expect(cuerpo.from).toBe("EnMiRumbo <avisos@ejemplo.invalid>");
    expect(cuerpo.to).toEqual(["buzon@ejemplo.invalid"]);
    expect(cuerpo.subject).toBe(mensaje.asunto);
    expect(cuerpo.text).toBe(mensaje.texto);
    // Texto plano: nada de HTML que un cliente de correo tenga que interpretar.
    expect(cuerpo.html).toBeUndefined();
  });

  it("un error del proveedor es un envío fallido, y el log no filtra nada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "domain is not verified" }), { status: 403 }),
    );
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await puerto().mandar(mensaje)).toBe("fallido");

    const dicho = errores.mock.calls.flat().join(" ");
    expect(dicho).toContain("[aviso]");
    expect(dicho).toContain("403");
    expect(dicho).not.toContain("re_llave_de_mentiras");
    expect(dicho).not.toContain("buzon@ejemplo.invalid");
  });

  it("si el proveedor no contesta, corta por su cuenta y cuenta como fallido", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, opciones) =>
        new Promise((_resolver, rechazar) => {
          (opciones as RequestInit).signal?.addEventListener("abort", () =>
            rechazar(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const enCurso = puerto().mandar(mensaje);
    await vi.advanceTimersByTimeAsync(MS_LIMITE_ENVIO_CORREO + 100);

    expect(await enCurso).toBe("fallido");
    vi.useRealTimers();
  });

  it("el límite de espera son unos pocos segundos, no el presupuesto de la función", () => {
    expect(MS_LIMITE_ENVIO_CORREO).toBeGreaterThan(1_000);
    expect(MS_LIMITE_ENVIO_CORREO).toBeLessThanOrEqual(8_000);
  });

  /**
   * Idempotencia, la parte fina (hallazgo MEDIO-1 de la etapa C).
   *
   * El proveedor responde 409 cuando esa clave YA SE USÓ hoy —usada por una
   * petición, no necesariamente por un envío aceptado: lo dice su propia
   * documentación—. Así que un 409 en frío puede significar "el correo ya
   * salió" o "la clave la quemó un intento rechazado y hoy no ha salido nada".
   */
  it("un 409 en frío es un fallo, porque puede significar que hoy no salió nada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
    );
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await puerto().mandar(mensaje)).toBe("fallido");
    const dicho = errores.mock.calls.flat().join(" ");
    expect(dicho).toContain("409");
    expect(dicho).not.toContain("re_llave_de_mentiras");
    expect(dicho).not.toContain("buzon@ejemplo.invalid");
  });

  it("un 409 DESPUÉS de un envío aceptado con esa clave es 'ya salió el de hoy'", async () => {
    let primera = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
        status: 409,
      });
    });
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await puerto().mandar(mensaje)).toBe("mandado");
    // Segundo disparo del mismo día: no manda otro, y no es un fallo.
    expect(await puerto().mandar(mensaje)).toBe("mandado");
    expect(errores).not.toHaveBeenCalled();
  });

  it("el envío aceptado de AYER no tapa el 409 de hoy", async () => {
    let primera = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
      }
      return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
        status: 409,
      });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await puerto().mandar({ ...mensaje, claveDelDia: `${CLAVE_AVISO_PREFIJO}2026-09-03` })).toBe(
      "mandado",
    );
    expect(await puerto().mandar(mensaje)).toBe("fallido");
  });

  it("se presenta con un User-Agent, que el proveedor exige", async () => {
    // Sin `User-Agent` Resend bloquea la petición con un 403 (código 1010)
    // antes de que llegue a su API. Hoy el `fetch` de Node manda uno solo;
    // esto lo deja de depender del runtime.
    const red = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));

    await puerto().mandar(mensaje);

    const cabeceras = (red.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(cabeceras["User-Agent"]).toBeTruthy();
  });

  it("descarta el cuerpo de la respuesta en vez de dejarlo colgando", async () => {
    let cancelado = false;
    const cuerpo = new ReadableStream<Uint8Array>({
      cancel() {
        cancelado = true;
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(cuerpo, { status: 200 }));

    await puerto().mandar(mensaje);

    expect(cancelado, "el cuerpo se cancela").toBe(true);
  });

  it("y NUNCA lo lee: ahí vuelven el destinatario, el remitente y el texto", () => {
    // Guardián de fuente, que es donde esto se rompería: si alguien añade un
    // `await respuesta.json()` "para mejorar el mensaje de error", el cuerpo
    // del 422 de Resend —que devuelve el payload entero— acabaría en el log.
    const fuente = readFileSync(new URL("../src/lib/correo/resend.ts", import.meta.url), "utf8");
    for (const lectura of [".json()", ".text()", ".arrayBuffer()", ".formData()", ".blob()"]) {
      expect(fuente, lectura).not.toContain(`respuesta${lectura}`);
    }
  });
});

// ── 3.3 y 6.x: el correo de punta a punta, sin datos de nadie ───────────────

describe("aviso · lo que sale de verdad cuando hay pendientes", () => {
  /** Un proveedor de mentiras con la misma memoria de 24 h que el de verdad. */
  function proveedorDeMentiras() {
    const peticiones: Array<{ clave: string; cuerpo: Record<string, unknown> }> = [];
    const clavesUsadas = new Set<string>();
    const red = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opciones) => {
      const init = opciones as RequestInit;
      const clave = (init.headers as Record<string, string>)["Idempotency-Key"];
      peticiones.push({ clave, cuerpo: JSON.parse(init.body as string) });
      if (clavesUsadas.has(clave)) {
        return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
          status: 409,
        });
      }
      clavesUsadas.add(clave);
      return new Response(JSON.stringify({ id: "correo-de-mentiras" }), { status: 200 });
    });
    return { peticiones, red, mandados: () => clavesUsadas.size };
  }

  // Scenario: hay pendientes de los tres tipos
  it("sale un correo con los conteos y el enlace al panel", async () => {
    await alta(`${PREFIJO}101`);
    await alta(`${PREFIJO}102`);
    const publicado = await alta(`${PREFIJO}103`, { estado: "publicado", publicadoEn: AHORA });
    await edicionPendienteDe(publicado);
    await reportePendienteDe(publicado);
    await reportePendienteDe(publicado);
    const proveedor = proveedorDeMentiras();

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "mandado",
    );

    expect(proveedor.peticiones).toHaveLength(1);
    const { cuerpo } = proveedor.peticiones[0];
    expect(cuerpo.subject).toBe("EnMiRumbo: 5 pendientes por revisar");
    expect(cuerpo.text).toContain("Altas nuevas: 2");
    expect(cuerpo.text).toContain("Ediciones: 1");
    expect(cuerpo.text).toContain("Reportes sin atender: 2");
    expect(cuerpo.text).toContain("Entra al panel: https://enmirumbo.example/admin");
  });

  // Scenario: el panel está al día
  it("con la cola vacía no se manda nada y queda dicho en el log", async () => {
    await alta(`${PREFIJO}110`, { estado: "publicado", publicadoEn: AHORA });
    const proveedor = proveedorDeMentiras();
    const registro = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "sin-pendientes",
    );

    expect(proveedor.red).not.toHaveBeenCalled();
    expect(registro.mock.calls.flat().join(" ")).toContain("[aviso]");
  });

  // Scenario: solo hay reportes sin atender
  it("un solo reporte sin atender basta para que el correo salga", async () => {
    const publicado = await alta(`${PREFIJO}120`, { estado: "publicado", publicadoEn: AHORA });
    await reportePendienteDe(publicado);
    const proveedor = proveedorDeMentiras();

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "mandado",
    );
    expect(proveedor.peticiones[0].cuerpo.subject).toBe("EnMiRumbo: 1 pendiente por revisar");
  });

  // Scenario: el correo no trae datos de nadie
  it("ni el asunto, ni el cuerpo, ni el enlace traen datos de ningún negocio", async () => {
    const id = await alta(`${PREFIJO}130`, {
      nombre: "Tortillería La Ficticia",
      coloniaOtra: "Colonia Inventada del Norte",
      queOfreces: "Tortillas de mentiras",
      direccion: "Calle Que No Existe 123",
      telefonoFijo: `${PREFIJO}131`,
    });
    await prisma.reporte.create({
      data: {
        negocioId: id,
        motivo: "no_real",
        comentario: "Este comentario lo escribió un vecino y no puede salir del panel",
      },
    });
    const proveedor = proveedorDeMentiras();

    await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA });

    const todo = JSON.stringify(proveedor.peticiones[0].cuerpo);
    for (const dato of [
      "Tortillería La Ficticia",
      "Colonia Inventada",
      "Tortillas de mentiras",
      "Calle Que No Existe",
      PREFIJO,
      "lo escribió un vecino",
      id,
    ]) {
      expect(todo, dato).not.toContain(dato);
    }
  });

  // Scenario: el log del envío tampoco los trae
  it("el log del envío no nombra a ningún negocio ni al buzón completo", async () => {
    await alta(`${PREFIJO}140`, { nombre: "Panadería La Ficticia" });
    proveedorDeMentiras();
    const registro = vi.spyOn(console, "log").mockImplementation(() => {});
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA });

    const dicho = [...registro.mock.calls, ...errores.mock.calls].flat().join(" ");
    expect(dicho).toContain("[aviso]");
    expect(dicho).not.toContain("Panadería La Ficticia");
    expect(dicho).not.toContain("buzon@ejemplo.invalid");
    expect(dicho).not.toContain("re_llave_de_mentiras");
  });

  // Scenario: dos disparos el mismo día
  it("dos corridas del mismo día mandan UN solo correo, con la misma clave", async () => {
    await alta(`${PREFIJO}150`);
    const proveedor = proveedorDeMentiras();

    await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA });
    // El segundo disparo trae un pendiente más: la clave NO cambia por eso.
    await alta(`${PREFIJO}151`);
    await avisarPendientes({
      prisma,
      env: ENTORNO_COMPLETO,
      ahora: new Date("2026-09-04T20:00:00.000Z"),
    });

    expect(proveedor.peticiones).toHaveLength(2);
    expect(proveedor.peticiones[0].clave).toBe(proveedor.peticiones[1].clave);
    expect(proveedor.mandados()).toBe(1);
  });

  // Scenario: reintento después de un envío que no salió
  it("un envío que el proveedor no aceptó no gasta el día", async () => {
    await alta(`${PREFIJO}160`);
    vi.spyOn(console, "error").mockImplementation(() => {});
    let primera = true;
    const red = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ id: "correo-de-mentiras" }), { status: 200 });
    });

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "fallido",
    );
    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "mandado",
    );
    expect(red).toHaveBeenCalledTimes(2);
  });
});
