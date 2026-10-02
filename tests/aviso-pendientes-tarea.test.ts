import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { GET as purgarRechazadosRuta } from "../src/app/api/tareas/purgar-rechazados/route";
import type { PrismaClient } from "../src/generated/prisma/client";
import { CLAVE_AVISO_PREFIJO } from "../src/lib/avisos/dia";
import { reiniciarAvisoDeCorreoSinConfigurar } from "../src/lib/correo/configuracion";
import { reiniciarMemoriaDeEnviosDeCorreo } from "../src/lib/correo/resend";
import { crearClientePrueba } from "./db";

/**
 * Spec `despliegue` · Requirements "El aviso diario de pendientes viaja en la
 * tarea programada que ya existe", "Sin la configuración del correo, el aviso
 * no se manda y se nota en el log" y "La purga de rechazados se dispara sola
 * en producción" (MODIFIED) — change `agregar-aviso-diario-pendientes`,
 * tasks 5.x y 6.x.
 *
 * Aquí se prueba el ENGANCHE: que los dos trabajos no se tumben entre ellos,
 * que la respuesta diga en qué quedó el aviso y que la puerta del secreto
 * siga cerrando igual. Las piezas están en `tests/aviso-pendientes.test.ts`.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771998 6xxx, y ninguna
 * dirección de correo real — `@ejemplo.invalid` no existe ni puede existir.
 */

const PREFIJO = "7719986";
const SECRETO = "secreto-de-pruebas-del-aviso-que-no-sirve-en-ningun-lado";

let prisma: PrismaClient;
let categoriaId: number;

const pedir = (encabezados: Record<string, string> = {}) =>
  purgarRechazadosRuta(
    new Request("https://enmirumbo.example/api/tareas/purgar-rechazados", {
      headers: encabezados,
    }),
  );

/** Deja el correo configurado con puras mentiras. */
function configurarCorreo(): void {
  process.env.RESEND_API_KEY = "re_llave_de_mentiras";
  process.env.AVISOS_CORREO_REMITENTE = "avisos@ejemplo.invalid";
  process.env.AVISOS_CORREO_DESTINO = "buzon@ejemplo.invalid";
  process.env.SITIO_URL = "https://enmirumbo.example";
}

function desconfigurarCorreo(): void {
  delete process.env.RESEND_API_KEY;
  delete process.env.AVISOS_CORREO_REMITENTE;
  delete process.env.AVISOS_CORREO_DESTINO;
  delete process.env.SITIO_URL;
}

/** Un proveedor de correo de mentiras, con la misma memoria que el de verdad. */
function proveedorDeMentiras(responder?: () => Promise<Response>) {
  const claves: string[] = [];
  const usadas = new Set<string>();
  const red = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opciones) => {
    const init = opciones as RequestInit;
    claves.push((init.headers as Record<string, string>)["Idempotency-Key"]);
    if (responder) return responder();
    const clave = claves[claves.length - 1];
    if (usadas.has(clave)) {
      return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
        status: 409,
      });
    }
    usadas.add(clave);
    return new Response(JSON.stringify({ id: "correo-de-mentiras" }), { status: 200 });
  });
  return { claves, red, mandados: () => usadas.size };
}

/** Un alta esperando en la cola: con esto el correo del día tiene motivo. */
async function pendienteEnLaCola(whatsapp: string): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio de la Tarea",
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date(),
    },
  });
  return creado.id;
}

/**
 * Un rechazado que ya cumplió el plazo y que la purga NO va a poder borrar: su
 * foto vive en un almacén inalcanzable, así que la fila se queda y cuenta como
 * fallida (mismo mecanismo que `tests/purga-rechazados.test.ts`). Es la forma
 * honesta de provocar "la purga no se completó" sin fingir un error.
 */
async function conFotoInalcanzable(whatsapp: string): Promise<void> {
  // Con esto, `almacenDeFotos()` devuelve el almacén que no se puede usar:
  // el sistema se cree desplegado y no hay almacén configurado.
  process.env.VERCEL_ENV = "production";
  const { reiniciarAlmacenDeFotos } = await import("../src/lib/fotos/almacen");
  reiniciarAlmacenDeFotos();
  const creado = await rechazadoHace(whatsapp, 120);
  await prisma.negocio.update({
    where: { id: creado.id },
    data: { fotoClave: "a".repeat(32) },
  });
}

/** Un rechazado que ya cumplió el plazo: con esto la purga tiene trabajo. */
const rechazadoHace = (whatsapp: string, dias: number) =>
  prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio de la Tarea",
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date(),
      estado: "rechazado",
      rechazadoEn: new Date(Date.now() - dias * 24 * 60 * 60 * 1000),
      motivoRechazo: "Motivo ficticio de prueba",
    },
  });

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
  reiniciarAvisoDeCorreoSinConfigurar();
  reiniciarMemoriaDeEnviosDeCorreo();
  process.env.CRON_SECRET = SECRETO;
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
  desconfigurarCorreo();
  // El almacén se elige una vez por proceso: si una prueba lo dejó "sin
  // configurar", la siguiente lo heredaría.
  (await import("../src/lib/fotos/almacen")).reiniciarAlmacenDeFotos();
});

// ── 5.1 y 5.2: los dos trabajos y la respuesta ─────────────────────────────

describe("tarea · la purga y el aviso no se tumban entre ellos", () => {
  // Scenario: la tarea corre y el aviso sale
  it("purga bien + aviso bien → 200 con los conteos y el estado del aviso", async () => {
    configurarCorreo();
    const viejo = await rechazadoHace(`${PREFIJO}001`, 120);
    await pendienteEnLaCola(`${PREFIJO}002`);
    const proveedor = proveedorDeMentiras();

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      eliminados: 1,
      fallidos: 0,
      cuposLimpiados: 0,
      aviso: "mandado",
    });
    expect(await prisma.negocio.findUnique({ where: { id: viejo.id } })).toBeNull();
    expect(proveedor.mandados()).toBe(1);
  });

  // Scenario: el envío falla y la purga no se ve arrastrada
  it("purga bien + aviso fallido → la purga borró igual, y la respuesta NO es de éxito", async () => {
    configurarCorreo();
    const viejo = await rechazadoHace(`${PREFIJO}010`, 120);
    await pendienteEnLaCola(`${PREFIJO}011`);
    proveedorDeMentiras(
      async () => new Response(JSON.stringify({ message: "nope" }), { status: 500 }),
    );
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ eliminados: 1, aviso: "fallido" });
    // Lo purgado queda purgado: el fallo del correo no deshace nada.
    expect(await prisma.negocio.findUnique({ where: { id: viejo.id } })).toBeNull();

    const dicho = errores.mock.calls.flat().join(" ");
    expect(dicho).toContain("[aviso]");
    expect(dicho).not.toContain("Negocio Ficticio");
    expect(dicho).not.toContain(PREFIJO);
  });

  // Scenario: la purga no se completa y el aviso sí sale
  it("purga incompleta + aviso bien → el correo sale igual y la respuesta sigue sin ser de éxito", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}020`);
    await conFotoInalcanzable(`${PREFIJO}021`);
    const proveedor = proveedorDeMentiras();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ fallidos: 1, aviso: "mandado" });
    expect(proveedor.mandados()).toBe(1);
  });

  it("purga incompleta + aviso fallido → 500, y cada fallo con su prefijo en el log", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}030`);
    await conFotoInalcanzable(`${PREFIJO}031`);
    proveedorDeMentiras(async () => {
      throw new TypeError("fetch failed");
    });
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ fallidos: 1, aviso: "fallido" });
    const dicho = errores.mock.calls.flat().join(" ");
    expect(dicho).toContain("[purga]");
    expect(dicho).toContain("[aviso]");
  });

  // Scenario: la respuesta dice si el correo del día salió
  it("con la cola vacía el aviso queda como 'sin pendientes', y la respuesta es de éxito", async () => {
    configurarCorreo();
    const proveedor = proveedorDeMentiras();

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ aviso: "sin-pendientes" });
    expect(proveedor.red).not.toHaveBeenCalled();
  });

  // Scenario: nada configurado
  it("sin la configuración del correo la tarea responde con normalidad", async () => {
    await pendienteEnLaCola(`${PREFIJO}040`);
    const viejo = await rechazadoHace(`${PREFIJO}041`, 120);
    const proveedor = proveedorDeMentiras();
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ eliminados: 1, aviso: "sin-configurar" });
    expect(proveedor.red).not.toHaveBeenCalled();
    // La purga hizo lo suyo aunque el correo esté apagado.
    expect(await prisma.negocio.findUnique({ where: { id: viejo.id } })).toBeNull();
    expect(avisos.mock.calls.flat().join(" ")).toContain("RESEND_API_KEY");
  });

  // Scenario: proveedor configurado y buzón destino sin configurar
  it("con proveedor y remitente pero sin destino responde igual que sin nada configurado", async () => {
    configurarCorreo();
    delete process.env.AVISOS_CORREO_DESTINO;
    await pendienteEnLaCola(`${PREFIJO}050`);
    const proveedor = proveedorDeMentiras();
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ aviso: "sin-configurar" });
    expect(proveedor.red).not.toHaveBeenCalled();
    const dicho = avisos.mock.calls.flat().join(" ");
    expect(dicho).toContain("AVISOS_CORREO_DESTINO");
    expect(dicho).not.toContain("buzon@ejemplo.invalid");
  });

  /**
   * Scenario: el proveedor no contesta.
   *
   * Que el corte lo dé el propio adaptador a los pocos segundos se prueba con
   * reloj falso en `tests/aviso-pendientes.test.ts` (ahí no hay base de por
   * medio). Aquí se prueba lo que la tarea hace DESPUÉS del corte: no se queda
   * esperando, lo cuenta como aviso fallido y responde con error.
   */
  it("si el proveedor deja la petición colgada, la tarea corta y responde error", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}060`);
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted.", "AbortError"),
    );

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ aviso: "fallido" });
    expect(errores.mock.calls.flat().join(" ")).toContain("AbortError");
  });
});

// ── 5.3 La puerta del secreto no se abrió ni un poco ───────────────────────

describe("tarea · sin el secreto no se manda ningún correo", () => {
  // Scenario: alguien encuentra la ruta
  it.each([
    ["sin encabezado", undefined],
    ["con el secreto equivocado", "Bearer otra-cosa-completamente-distinta"],
    ["sin el prefijo Bearer", SECRETO],
  ])("%s: el mismo 404 de siempre y ni una petición al proveedor", async (_caso, encabezado) => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}070`);
    const proveedor = proveedorDeMentiras();

    await expect(pedir(encabezado ? { authorization: encabezado } : {})).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
    expect(proveedor.red).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado tampoco sale nada", async () => {
    delete process.env.CRON_SECRET;
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}071`);
    const proveedor = proveedorDeMentiras();

    await expect(pedir({ authorization: `Bearer ${SECRETO}` })).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
    expect(proveedor.red).not.toHaveBeenCalled();
  });
});

// ── 6.x Idempotencia de punta a punta ──────────────────────────────────────

describe("tarea · un solo correo al día aunque el disparo se repita", () => {
  // Scenario: dos disparos el mismo día
  it("dos disparos seguidos mandan un solo correo, con la misma clave", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}080`);
    const proveedor = proveedorDeMentiras();

    const primera = await pedir({ authorization: `Bearer ${SECRETO}` });
    const segunda = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ aviso: "mandado" });
    expect(proveedor.claves).toHaveLength(2);
    expect(proveedor.claves[0]).toBe(proveedor.claves[1]);
    expect(proveedor.claves[0]).toMatch(
      new RegExp(`^${CLAVE_AVISO_PREFIJO}\\d{4}-\\d{2}-\\d{2}$`),
    );
    expect(proveedor.mandados()).toBe(1);
  });

  /**
   * Hallazgo MEDIO-1 de la etapa C. El día D falla el primer intento y el
   * proveedor se queda la clave (su documentación dice "has been **used**", no
   * "has been sent"). Al reintentar, los conteos ya son otros y contesta 409.
   * Si eso se leyera como "mandado", la tarea respondería 200 y el admin se
   * quedaría 24 h sin aviso creyendo que todo salió.
   */
  it("un 409 en frío NO se responde en verde: puede ser que hoy no haya salido nada", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}100`);
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    // El proveedor no ha aceptado nada de este proceso: 409 desde el primer
    // disparo, como cuando la clave la quemó un intento rechazado.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
    );

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toMatchObject({ aviso: "fallido" });
    expect(errores.mock.calls.flat().join(" ")).toContain("409");
  });

  // Scenario: reintento después de un envío que no salió
  it("un envío que no salió no gasta el día: el siguiente disparo lo intenta otra vez", async () => {
    configurarCorreo();
    await pendienteEnLaCola(`${PREFIJO}090`);
    vi.spyOn(console, "error").mockImplementation(() => {});
    let primera = true;
    const claves: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opciones) => {
      claves.push(((opciones as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
      if (primera) {
        primera = false;
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ id: "correo-de-mentiras" }), { status: 200 });
    });

    const fallida = await pedir({ authorization: `Bearer ${SECRETO}` });
    const buena = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(fallida.status).toBe(500);
    expect(await fallida.json()).toMatchObject({ aviso: "fallido" });
    expect(buena.status).toBe(200);
    expect(await buena.json()).toMatchObject({ aviso: "mandado" });
    expect(claves[0]).toBe(claves[1]);
  });
});
