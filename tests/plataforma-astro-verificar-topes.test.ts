/**
 * Spec `plataforma-astro` (change `migrar-verificacion-sms-astro`, Fase 3b-2;
 * tasks.md #6): "Los topes del canal de SMS y su atomicidad se conservan
 * sobre la salida construida". Sobre la SALIDA SERVIDA con el Twilio FALSO.
 *
 * La espera de 60 s se vence ENVEJECIENDO las filas de `IntentoDeCupo` del
 * registro (design.md §6): no se duerme ni se toca el reloj de `src/lib/`.
 * La ráfaga de reenvíos solo corre con backends independientes (PostgreSQL
 * real, como el CI); en PGlite (`prisma dev`) se salta con aviso.
 *
 * Todo ficticio: WhatsApp 77199989xx, credenciales `ACtest…`, secreto
 * generado aquí, IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { BOTON_CONFIRMAR, BOTON_REENVIAR, Frasco, enviarFormulario } from "../scripts/enviar-formulario.mjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { MENSAJE_GRACIAS } from "../src/lib/registro/textos";
import { MENSAJE_INTENTOS_AGOTADOS_VERIFICAR, TEXTO_CUPO_IP_CODIGOS, TEXTO_ESPERA_REENVIO } from "../src/lib/verificacion/textos";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO } from "../src/lib/verificacion/paso";
import { crearClientePrueba } from "./db";
import { urlDeLaBaseDePrueba } from "./esquemas";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";
import { type Llamada, clavesDeLosTopes, cuposDeLaFicha, envejecerEspera, leerLlamadas } from "./verificar-astro";

const RUTA = "/registro/verificar";
const SECRETO = randomBytes(32).toString("hex");
const WHATSAPP = Array.from({ length: 30 }, (_, i) => `77199989${String(i).padStart(2, "0")}`);
const ENCENDIDA = {
  SITIO_URL: "https://enmirumbo.example",
  [VARIABLE_BANDERA]: "1",
  [VARIABLE_SECRETO]: SECRETO,
  [VARIABLE_TOPE_DIARIO]: "1000",
  [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
  [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
  [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
};

/** ¿Este servidor da conexiones con backends independientes? (como `concurrencia-real.test.ts`) */
async function hayBackendsIndependientes(): Promise<boolean> {
  const a = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  const b = new pg.Client({ connectionString: urlDeLaBaseDePrueba() });
  try {
    await a.connect();
    await b.connect();
    const pid = async (c: pg.Client) => (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    return (await pid(a)) !== (await pid(b));
  } catch {
    return false;
  } finally {
    await a.end().catch(() => {});
    await b.end().catch(() => {});
  }
}
const backendsIndependientes = await hayBackendsIndependientes();
if (!backendsIndependientes) {
  console.warn("[verificar-topes] la base multiplexa todas las conexiones (PGlite): la ráfaga de reenvíos se salta aquí y corre con PostgreSQL real (CI).");
}

let prisma: PrismaClient;
let dir = "";
let categoriaId = 0;
let coloniaId = 0;
const ids: string[] = [];

type ConTwilio = { e: Emulador; guion: string; llamadas: () => Llamada[] };

async function levantar(nombre: string, entorno: Record<string, string | undefined>): Promise<ConTwilio> {
  const registro = path.join(dir, `${nombre}.jsonl`);
  const guion = path.join(dir, `${nombre}-guion.txt`);
  writeFileSync(registro, "");
  writeFileSync(guion, "enviado,approved");
  const e = await levantarEmulador({ ...entorno, TWILIO_FALSO_GUION: `@${guion}`, TWILIO_FALSO_REGISTRO: registro }, { precargas: ["tests/fixtures/twilio-falso.mjs"] });
  return { e, guion, llamadas: () => leerLlamadas(registro) };
}

const consultar = (sql: string, params: unknown[]) => prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);

async function registrar(c: ConTwilio, whatsapp: string, ip: string) {
  const frasco = new Frasco();
  writeFileSync(c.guion, "enviado,approved");
  const r = await enviarFormulario({
    urlPagina: new URL("/registro", c.e.base).toString(),
    elecciones: { nombre: "Mercería Ficticia De Los Topes", categoriaId: String(categoriaId), whatsapp, coloniaId: String(coloniaId), consentimiento: "on" },
    cabecerasExtra: { "x-forwarded-for": ip },
    frasco,
  });
  const ficha = await prisma.negocio.findUnique({ where: { whatsapp } });
  if (ficha) ids.push(ficha.id);
  return { r, frasco, id: ficha?.id ?? "", guardada: frasco.valor(COOKIE_PASO) };
}

function tocar(c: ConTwilio, frasco: Frasco, boton: string, ip: string, extra: { codigo?: string; cookieDelEnvio?: string } = {}) {
  return enviarFormulario({
    urlPagina: new URL(RUTA, c.e.base).toString(),
    boton,
    elecciones: extra.codigo === undefined ? {} : { codigo: extra.codigo },
    frasco,
    cookieDelEnvio: extra.cookieDelEnvio,
    cabecerasExtra: { "x-forwarded-for": ip },
  });
}

const deEnvio = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta === "/Verifications");
const deComprobacion = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta === "/VerificationCheck");

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "verificar-topes-"));
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = (await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
}, 300_000);

afterAll(async () => {
  const claves = ids.flatMap((id) => Object.values(clavesDeLosTopes(id, SECRETO)));
  await prisma.intentoDeCupo.deleteMany({ where: { clave: { in: claves } } });
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("topes por registro", () => {
  let c: ConTwilio;
  beforeAll(async () => {
    c = await levantar("por-registro", { ...ENCENDIDA, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" });
  }, 60_000);
  afterAll(() => c?.e.detener());

  it("reusar la primera cookie no revive intentos: el quinto equivocado va a gracias?agotado=1 y la cookie guardada ya no llega al proveedor", async () => {
    const { frasco, guardada } = await registrar(c, WHATSAPP[0], "198.51.100.90");
    expect(guardada).toBeTruthy();
    writeFileSync(c.guion, "enviado,pending");
    for (let i = 1; i <= 5; i++) {
      const r = await tocar(c, frasco, BOTON_CONFIRMAR, "198.51.100.90", { codigo: "111111", cookieDelEnvio: `${COOKIE_PASO}=${guardada}` });
      if (i < 5) expect(r.cadena[1].location, `intento ${i}`).toBe("/registro/verificar?error=no-coincide");
      else {
        expect(r.cadena[1].location).toBe("/registro/gracias?agotado=1");
        expect(r.final.html).toContain(MENSAJE_INTENTOS_AGOTADOS_VERIFICAR);
        expect(r.final.html).toContain(MENSAJE_GRACIAS);
      }
    }
    writeFileSync(c.guion, "enviado,approved");
    const antes = deComprobacion(c.llamadas()).length;
    const otra = new Frasco();
    otra.guardar([`${COOKIE_PASO}=${guardada}; Path=${RUTA}`]);
    const reuso = await tocar(c, otra, BOTON_CONFIRMAR, "198.51.100.90", { codigo: "123456" });
    expect(reuso.cadena[1].status).toBe(303);
    expect(reuso.cadena[1].location).toBe("/registro/gracias?agotado=1");
    expect(deComprobacion(c.llamadas())).toHaveLength(antes);
  });

  it.runIf(backendsIndependientes)("ráfaga de seis reenvíos simultáneos con la espera vencida: exactamente un SMS y un reenvío gastado; los demás, 'Espera un momento…', sin 500", async () => {
    const { id, guardada } = await registrar(c, WHATSAPP[1], "198.51.100.91");
    await envejecerEspera(consultar, id, SECRETO);
    const antes = deEnvio(c.llamadas()).length;
    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.e.pedir(`${RUTA}?_action=reenviar`, {
          method: "POST",
          body: "",
          headers: { cookie: `${COOKIE_PASO}=${guardada}`, origin: c.e.base, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "198.51.100.91" },
        }),
      ),
    );
    const destinos = respuestas.map((r) => `${r.status} ${r.headers.get("location")}`).sort();
    expect(destinos).toEqual([
      "303 /registro/verificar",
      ...Array.from({ length: 5 }, () => "303 /registro/verificar?errorReenvio=espera-reenvio"),
    ]);
    expect(deEnvio(c.llamadas()).length - antes).toBe(1);
    expect((await cuposDeLaFicha(consultar, id, SECRETO)).reenvios).toBe(1);
    const pantalla = await c.e.pedir(`${RUTA}?errorReenvio=espera-reenvio`, { headers: { cookie: `${COOKIE_PASO}=${guardada}` } });
    expect(await pantalla.text()).toContain(TEXTO_ESPERA_REENVIO);
  });

  it("el cupo de códigos por IP (último salto, con el primero rotado): el cuarto código responde 'Ya pedimos varios códigos…' sin SMS; un registro y un reporte de esa IP se procesan con su propio contador", async () => {
    const ip = (i: number) => `192.0.2.${i}, 203.0.113.77`;
    const a = await registrar(c, WHATSAPP[2], ip(1)); // código 1
    expect(a.r.cadena[1].location).toBe(RUTA);
    await envejecerEspera(consultar, a.id, SECRETO);
    expect((await tocar(c, a.frasco, BOTON_REENVIAR, ip(2))).cadena[1].location).toBe(RUTA); // código 2
    const b = await registrar(c, WHATSAPP[3], ip(3)); // código 3
    expect(b.r.cadena[1].location).toBe(RUTA);
    await envejecerEspera(consultar, a.id, SECRETO);
    const antes = deEnvio(c.llamadas()).length;
    const cuarto = await tocar(c, a.frasco, BOTON_REENVIAR, ip(4));
    expect(cuarto.cadena[1].location).toBe("/registro/verificar?errorReenvio=cupo");
    expect(cuarto.final.html).toContain(TEXTO_CUPO_IP_CODIGOS);
    expect(deEnvio(c.llamadas())).toHaveLength(antes);

    // Un registro de esa IP se guarda (su cupo de altas es otro); ya sin código.
    const tercero = await registrar(c, WHATSAPP[4], ip(5));
    expect(tercero.r.cadena[1].location).toBe("/registro/gracias");
    expect(tercero.id).not.toBe("");
    // Y un reporte de esa IP, también con su propio contador.
    const publicada = await prisma.negocio.create({
      data: { nombre: "Mercería Ficticia Publicada", categoriaId, whatsapp: WHATSAPP[5], consintioAvisoEn: new Date(), estado: "publicado", publicadoEn: new Date() },
    });
    const reporte = await enviarFormulario({
      urlPagina: new URL(`/negocio/x-${publicada.id}/reportar`, c.e.base).toString(),
      elecciones: { motivo: "cerrado" },
      cabecerasExtra: { "x-forwarded-for": ip(6) },
    });
    expect(reporte.cadena[1].status).toBe(303);
    expect(reporte.cadena[1].location).toMatch(/\/reportar\/gracias$/);
  });
});

describe("sin REGISTRO_ENCABEZADO_IP el cupo de códigos por IP no aplica", () => {
  it("cuatro códigos con el mismo x-forwarded-for: los cuatro salen", async () => {
    const c = await levantar("sin-encabezado", { ...ENCENDIDA, REGISTRO_ENCABEZADO_IP: undefined });
    try {
      const antes = deEnvio(c.llamadas()).length;
      const a = await registrar(c, WHATSAPP[10], "203.0.113.78");
      const b = await registrar(c, WHATSAPP[11], "203.0.113.78");
      for (const f of [a, b]) {
        await envejecerEspera(consultar, f.id, SECRETO);
        expect((await tocar(c, f.frasco, BOTON_REENVIAR, "203.0.113.78")).cadena[1].location).toBe(RUTA);
      }
      expect(deEnvio(c.llamadas()).length - antes).toBe(4);
    } finally {
      c.e.detener();
    }
  }, 60_000);
});

describe("tope diario por proceso", () => {
  it("con VERIFICACION_SMS_TOPE_DIARIO=2: dos SMS, el tercer registro va a gracias, el reenvío responde 'Espera un momento…' sin SMS y queda UNA alerta sin números", async () => {
    const c = await levantar("tope-diario", { ...ENCENDIDA, [VARIABLE_TOPE_DIARIO]: "2", REGISTRO_ENCABEZADO_IP: "x-forwarded-for" });
    try {
      const uno = await registrar(c, WHATSAPP[20], "198.51.100.120");
      const dos = await registrar(c, WHATSAPP[21], "198.51.100.121");
      const tres = await registrar(c, WHATSAPP[22], "198.51.100.122");
      expect([uno, dos, tres].map((f) => f.r.cadena[1].location)).toEqual([RUTA, RUTA, "/registro/gracias"]);
      expect(tres.r.cadena[1].setCookie).toEqual([]);
      expect(await prisma.negocio.findUnique({ where: { whatsapp: WHATSAPP[22] } })).not.toBeNull();
      expect(deEnvio(c.llamadas())).toHaveLength(2);

      await envejecerEspera(consultar, uno.id, SECRETO);
      const reenvio = await tocar(c, uno.frasco, BOTON_REENVIAR, "198.51.100.120");
      expect(reenvio.cadena[1].location).toBe("/registro/verificar?errorReenvio=espera-reenvio");
      expect(reenvio.final.html).toContain(TEXTO_ESPERA_REENVIO);
      expect(deEnvio(c.llamadas())).toHaveLength(2);

      const alertas = c.e.registro().split("\n").filter((l) => l.includes("tope diario"));
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).not.toMatch(/\d{10}/);
    } finally {
      c.e.detener();
    }
  }, 60_000);
});
