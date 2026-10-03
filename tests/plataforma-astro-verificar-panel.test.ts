/**
 * Spec `plataforma-astro` (change `migrar-verificacion-sms-astro`, Fase 3b-2;
 * tasks.md #7), sobre la SALIDA SERVIDA con el Twilio FALSO:
 *
 * - "Confirmar desde Astro deja la marca que el panel muestra, sin publicar
 *   nada": la fila antes y después de dos confirmaciones, las consultas del
 *   panel y el panel de Next (que sigue en Next hasta la Fase 5) pintado con
 *   esa fila;
 * - "Pedir la pantalla del código no tiene efectos": tres `GET` (y un `HEAD`)
 *   con la cookie del 303, sin escribir, sin proveedor y sin cookies.
 *
 * Todo ficticio: WhatsApp 77199988xx, credenciales `ACtest…`, secretos
 * generados aquí, IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { BOTON_CONFIRMAR, Frasco, enviarFormulario } from "../scripts/enviar-formulario.mjs";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import { TarjetaCola } from "../src/components/admin/tarjeta-cola";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION, VARIABLE_URL_SITIO } from "../src/lib/admin/config";
import { obtenerColaDeRevision, obtenerRegistroParaPanel } from "../src/lib/admin/consultas";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { BOTON_APROBAR, BOTON_RECHAZAR, BOTON_WHATSAPP_VERIFICACION } from "../src/lib/admin/textos";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
} from "../src/lib/verificacion/config";
import { COOKIE_PASO } from "../src/lib/verificacion/paso";
import { ETIQUETA_COLA_NUMERO_VERIFICADO_SMS, textoNumeroVerificadoSms } from "../src/lib/verificacion/textos";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";
import { borrarNegociosSembrados } from "./limpieza";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";
import { clavesDeLosTopes, cookieDePaso, leerLlamadas } from "./verificar-astro";

const RUTA = "/registro/verificar";
const URL_PUBLICA = "https://enmirumbo.example";
const SECRETO = randomBytes(32).toString("hex");
const SECRETO_SESION = randomBytes(32).toString("hex");
const WHATSAPP = Array.from({ length: 10 }, (_, i) => `77199988${String(i).padStart(2, "0")}`);
/** El mismo formateador que usa el detalle para la constancia (`tests/verificacion-panel.test.ts`). */
const FORMATO_FECHA_PANEL = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

let prisma: PrismaClient;
let dir = "";
let e: Emulador;
let guion = "";
let registro = "";
let categoriaId = 0;
let coloniaId = 0;
const ids: string[] = [];

const llamadas = () => leerLlamadas(registro);

async function registrar(whatsapp: string, ip: string) {
  const frasco = new Frasco();
  writeFileSync(guion, "enviado,approved");
  const r = await enviarFormulario({
    urlPagina: new URL("/registro", e.base).toString(),
    elecciones: { nombre: "Tlapalería Ficticia Del Panel", categoriaId: String(categoriaId), whatsapp, coloniaId: String(coloniaId), consentimiento: "on" },
    cabecerasExtra: { "x-forwarded-for": ip },
    frasco,
  });
  const id = (await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } })).id;
  ids.push(id);
  return { r, frasco, id };
}

function confirmar(frasco: Frasco, ip: string) {
  return enviarFormulario({ urlPagina: new URL(RUTA, e.base).toString(), boton: BOTON_CONFIRMAR, elecciones: { codigo: "123456" }, frasco, cabecerasExtra: { "x-forwarded-for": ip } });
}

beforeAll(async () => {
  construirSiHaceFalta();
  dir = mkdtempSync(path.join(tmpdir(), "verificar-panel-"));
  guion = path.join(dir, "guion.txt");
  registro = path.join(dir, "llamadas.jsonl");
  writeFileSync(guion, "enviado,approved");
  writeFileSync(registro, "");
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await borrarNegociosSembrados(prisma, WHATSAPP);
  categoriaId = (await prisma.categoria.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  coloniaId = (await prisma.colonia.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
  e = await levantarEmulador(
    {
      SITIO_URL: URL_PUBLICA,
      REGISTRO_ENCABEZADO_IP: "x-forwarded-for",
      [VARIABLE_BANDERA]: "1",
      [VARIABLE_SECRETO]: SECRETO,
      [VARIABLE_TOPE_DIARIO]: "1000",
      [VARIABLE_TWILIO_SID]: "ACtest00000000000000000000000000",
      [VARIABLE_TWILIO_AUTH_TOKEN]: "token-ficticio-de-pruebas",
      [VARIABLE_TWILIO_SERVICE_SID]: "VAtest00000000000000000000000000",
      TWILIO_FALSO_GUION: `@${guion}`,
      TWILIO_FALSO_REGISTRO: registro,
    },
    { precargas: ["tests/fixtures/twilio-falso.mjs"] },
  );
}, 300_000);

afterAll(async () => {
  e?.detener();
  const claves = ids.flatMap((id) => Object.values(clavesDeLosTopes(id, SECRETO)));
  await prisma.intentoDeCupo.deleteMany({ where: { clave: { in: claves } } });
  await borrarNegociosSembrados(prisma, WHATSAPP);
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
  reiniciarPeticion();
});

describe("la marca llega al panel, sin publicar nada", () => {
  let id = "";
  let verificadoEn: Date | null = null;

  it("solo cambia la fecha de verificación, y una segunda confirmación no la pisa", async () => {
    const { frasco, id: nuevo } = await registrar(WHATSAPP[0], "198.51.100.80");
    id = nuevo;
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(antes.numeroVerificadoEn).toBeNull();

    const primera = await confirmar(frasco, "198.51.100.80");
    expect(primera.cadena[1].location).toBe("/registro/gracias?verificado=1");
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.numeroVerificadoEn).toBeInstanceOf(Date);
    expect({ ...despues, numeroVerificadoEn: null }).toEqual(antes);
    verificadoEn = despues.numeroVerificadoEn;

    // Segunda confirmación con una credencial nueva de la misma ficha: va a
    // gracias sin preguntar al proveedor y no pisa la fecha.
    const antesDeLaSegunda = llamadas().length;
    const otro = new Frasco();
    otro.guardar([`${COOKIE_PASO}=${cookieDePaso("vigente", id, SECRETO, "8800")}; Path=${RUTA}`]);
    const segunda = await confirmar(otro, "198.51.100.81");
    expect(segunda.cadena[1].location).toBe("/registro/gracias?verificado=1");
    expect(llamadas()).toHaveLength(antesDeLaSegunda);
    expect(await prisma.negocio.findUniqueOrThrow({ where: { id } })).toEqual(despues);
  });

  it("la cola y el detalle del panel (Next) la muestran, con 'Escribirle por WhatsApp' y aprobar y rechazar de siempre; sigue en revisión", async () => {
    expect(verificadoEn).not.toBeNull();
    const cola = await obtenerColaDeRevision(prisma);
    const renglon = cola.find((r) => r.id === id);
    expect(renglon?.numeroVerificadoEn?.toISOString()).toBe(verificadoEn!.toISOString());
    expect(renderToStaticMarkup(createElement(TarjetaCola, renglon!))).toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);

    const detalle = await obtenerRegistroParaPanel(prisma, id);
    expect(detalle).toMatchObject({ estado: "en_revision", publicadoEn: null });
    expect(detalle?.numeroVerificadoEn?.toISOString()).toBe(verificadoEn!.toISOString());

    process.env[VARIABLE_CONTRASENA] = "contrasena-ficticia-del-panel";
    process.env[VARIABLE_SECRETO_SESION] = SECRETO_SESION;
    process.env[VARIABLE_URL_SITIO] = URL_PUBLICA;
    try {
      reiniciarPeticion();
      peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO_SESION);
      const pagina = await DetalleRegistroAdminPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(createElement(() => pagina));
      expect(html).toContain(textoNumeroVerificadoSms(FORMATO_FECHA_PANEL.format(verificadoEn!)));
      for (const literal of [BOTON_WHATSAPP_VERIFICACION, BOTON_APROBAR, BOTON_RECHAZAR]) expect(html, literal).toContain(literal);
    } finally {
      delete process.env[VARIABLE_CONTRASENA];
      delete process.env[VARIABLE_SECRETO_SESION];
      delete process.env[VARIABLE_URL_SITIO];
    }
  });

  it("la ficha no aparece en ninguna página pública ni en el sitemap de la build", async () => {
    expect(await (await e.pedir("/sitemap.xml")).text()).not.toContain(id);
    expect((await e.pedir(`/negocio/x-${id}`)).status).toBe(404);
    expect(await (await e.pedir("/buscar?q=Tlapaler%C3%ADa")).text()).not.toContain("Tlapalería Ficticia Del Panel");
  });
});

describe("pedir la pantalla del código no tiene efectos", () => {
  it("el GET del módulo de /registro (tres GET y un HEAD con la cookie del 303): 200, el mismo cuerpo, sin cookies, una sola petición al proveedor y sin escribir", async () => {
    const { r, frasco } = await registrar(WHATSAPP[1], "198.51.100.82");
    expect(r.cadena[1].location).toBe(RUTA);
    expect(llamadas().filter((l) => l.parametros.To === `+52${WHATSAPP[1]}`)).toHaveLength(1);
    const cookie = frasco.cabecera(new URL(RUTA, e.base).toString())!;
    const negocios = await prisma.negocio.count();
    const cupos = await prisma.intentoDeCupo.count();
    const fila = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[1] } });
    const totalLlamadas = llamadas().length;
    const cuerpos: string[] = [];
    for (let i = 0; i < 3; i++) {
      const g = await e.pedir(RUTA, { headers: { cookie } });
      expect(g.status).toBe(200);
      expect(g.headers.getSetCookie()).toEqual([]);
      cuerpos.push(await g.text());
    }
    const head = await e.pedir(RUTA, { method: "HEAD", headers: { cookie } });
    expect(head.status).toBe(200);
    expect(head.headers.getSetCookie()).toEqual([]);
    expect(cuerpos[1]).toBe(cuerpos[0]);
    expect(cuerpos[2]).toBe(cuerpos[0]);
    expect(llamadas()).toHaveLength(totalLlamadas);
    expect(await prisma.negocio.count()).toBe(negocios);
    expect(await prisma.intentoDeCupo.count()).toBe(cupos);
    expect(await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: WHATSAPP[1] } })).toEqual(fila);
  });
});
