import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  const real = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...real, redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import RegistroGraciasPage from "../src/app/(publico)/registro/gracias/page";
import RegistroPage from "../src/app/(publico)/registro/page";
import RegistroVerificarPage from "../src/app/(publico)/registro/verificar/page";
import { DetalleRegistro } from "../src/components/admin/detalle-registro";
import { TarjetaCola } from "../src/components/admin/tarjeta-cola";
import {
  obtenerColaDeRevision,
  obtenerRegistroParaPanel,
} from "../src/lib/admin/consultas";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import {
  dependenciasDeVerificacion,
  ejecutarConfirmacion,
  ejecutarReenvio,
} from "../src/lib/verificacion/acciones";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
  reiniciarAvisoDeVerificacion,
} from "../src/lib/verificacion/config";
import { reiniciarTopesPorRegistro } from "../src/lib/verificacion/limites";
import { pedirCodigoParaFicha } from "../src/lib/verificacion/flujo";
import { COOKIE_PASO, crearPasoInicial, firmarPaso } from "../src/lib/verificacion/paso";
import { proveedorDeVerificacion } from "../src/lib/verificacion/proveedor";
import { NoEncontradoSimulado, peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * Spec `registro-negocio` (T-016) · EL REQUIREMENT REY: "La verificación por
 * SMS solo existe si está encendida y completamente configurada" (tasks.md
 * #17).
 *
 * Con la capacidad apagada —el estado por defecto y el del LANZAMIENTO— el
 * sitio tiene que comportarse **exactamente igual que si esta capacidad no
 * existiera**. Estas son las pruebas de oro: si alguien enciende algo sin las
 * variables, o pinta un texto nuevo con la bandera apagada, aquí se cae.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771995xxxx.
 */

const raiz = join(__dirname, "..");
const PREFIJO = "771995";
const IP = "203.0.113.99"; // TEST-NET-3
const AHORA = new Date("2026-09-05T12:00:00.000Z");

const VARIABLES = [
  VARIABLE_BANDERA,
  VARIABLE_TWILIO_SID,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_SECRETO,
  VARIABLE_TOPE_DIARIO,
];

function apagarTodo(): void {
  for (const variable of VARIABLES) delete process.env[variable];
}

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

function envio(campos: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const base: Record<string, string> = {
    nombre: "Zapatería Ficticia El Tacón",
    categoriaId: String(categoriaId),
    whatsapp: `${PREFIJO}0001`,
    coloniaId: String(coloniaId),
    consentimiento: "on",
    [CAMPO_VERSION_AVISO]: VERSION_AVISO,
    ...campos,
  };
  for (const [clave, valor] of Object.entries(base)) {
    if (valor !== "") formData.append(clave, valor);
  }
  return formData;
}

const pintar = (elemento: React.ReactElement) => renderToStaticMarkup(elemento);

async function renderAsincrono(pagina: unknown): Promise<string> {
  const resuelta = (await pagina) as React.ReactElement;
  return renderToStaticMarkup(createElement(() => resuelta));
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

beforeEach(async () => {
  apagarTodo();
  reiniciarAvisoDeVerificacion();
  reiniciarLimitePorIp();
  reiniciarTopesPorRegistro();
  await prisma.intentoDeCupo.deleteMany({});
  reiniciarPeticion();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => {
  apagarTodo();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

// Scenario: la ruta del código no existe cuando la capacidad está apagada
describe("registro-negocio · con la capacidad apagada, /registro/verificar no existe", () => {
  const abrir = () =>
    RegistroVerificarPage({
      searchParams: Promise.resolve({}),
    } as unknown as Parameters<typeof RegistroVerificarPage>[0]);

  it("sin ninguna variable responde no encontrado", async () => {
    await expect(abrir()).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("responde igual aunque alguien traiga una cookie de paso puesta", async () => {
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial("cualquier-ficha", `${PREFIJO}0001`, AHORA),
      "secreto-de-pruebas-de-32-caracteres-o-mas",
    );
    await expect(abrir()).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it.each(VARIABLES.filter((v) => v !== VARIABLE_TOPE_DIARIO))(
    "con la configuración a medias (falta %s) sigue sin existir",
    async (faltante) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env[VARIABLE_BANDERA] = "1";
      process.env[VARIABLE_TWILIO_SID] = "AC-de-mentiras-000";
      process.env[VARIABLE_TWILIO_AUTH_TOKEN] = "token-de-mentiras-000";
      process.env[VARIABLE_TWILIO_SERVICE_SID] = "VA-de-mentiras-000";
      process.env[VARIABLE_SECRETO] = "secreto-de-pruebas-de-32-caracteres-o-mas";
      delete process.env[faltante];

      await expect(abrir()).rejects.toBeInstanceOf(NoEncontradoSimulado);
    },
  );

  it("las dos Server Actions también responden no encontrado", async () => {
    const formData = new FormData();
    formData.set("codigo", "123456");
    await expect(
      ejecutarConfirmacion(formData, await dependenciasDeVerificacion()),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);
    await expect(ejecutarReenvio(await dependenciasDeVerificacion())).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
  });
});

// Scenario: sin configuración, el sitio de hoy / nada nuevo en el HTML
describe("registro-negocio · con la capacidad apagada, el registro es el de hoy", () => {
  it("un envío válido guarda la ficha y no pide ningún código", async () => {
    const resultado = await procesarRegistro(envio(), { prisma, ip: IP, ahora: AHORA });
    expect(resultado).toMatchObject({ exito: true });

    const guardada = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}0001` },
    });
    expect(guardada.estado).toBe("en_revision");
    expect(guardada.origen).toBe("organico");
    expect(guardada.numeroVerificadoEn).toBeNull();

    // Y la puerta de la verificación no deja pasar nada: sin configuración
    // no hay proveedor y `pedirCodigoParaFicha` devuelve `null`.
    expect(await dependenciasDeVerificacion()).toBeNull();
  });

  it("no se construye el adaptador del proveedor ni se pide nada a la red", async () => {
    const enRed = vi.spyOn(globalThis, "fetch");
    expect(await proveedorDeVerificacion(null)).toBeNull();

    await procesarRegistro(envio({ whatsapp: `${PREFIJO}0002` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    expect(enRed).not.toHaveBeenCalled();
  });

  it("sin proveedor, pedir código no hace absolutamente nada", async () => {
    const paso = await pedirCodigoParaFicha(
      { id: "una-ficha", whatsapp: `${PREFIJO}0003`, yaVerificado: false },
      { proveedor: null, cupos: prisma, secreto: "x".repeat(32), topeDiario: 50, ip: IP, ahora: AHORA },
    );
    expect(paso).toBeNull();
  });

  /**
   * Los topes por registro se anclaron en la base al cerrar [C-2]. El
   * fail-safe tiene que seguir intacto: con la capacidad apagada no se escribe
   * NI UNA FILA en `IntentoDeCupo`, porque la puerta del proveedor se cruza
   * antes que ninguna cota.
   */
  it("con la capacidad apagada no se escribe ni una fila de cupos", async () => {
    const antes = await prisma.intentoDeCupo.count();
    await procesarRegistro(envio({ whatsapp: `${PREFIJO}0006` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    await pedirCodigoParaFicha(
      { id: "una-ficha", whatsapp: `${PREFIJO}0006`, yaVerificado: false },
      { proveedor: null, cupos: prisma, secreto: "x".repeat(32), topeDiario: 50, ip: IP, ahora: AHORA },
    );
    expect(await prisma.intentoDeCupo.count()).toBe(antes);
  });

  // Scenario: nada nuevo en el HTML con la capacidad apagada
  it("la pantalla de gracias es la de siempre, sin una palabra nueva", async () => {
    const html = await renderAsincrono(
      RegistroGraciasPage({ searchParams: Promise.resolve({}) } as unknown as Parameters<
        typeof RegistroGraciasPage
      >[0]),
    );
    expect(html).toContain(
      "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo.",
    );
    expect(html.toLowerCase()).not.toContain("sms");
    expect(html).not.toContain("¡Listo! Ya confirmamos tu número.");
    expect(html).not.toContain("Ya lo intentaste varias veces");
    expect(html).not.toMatch(/<form[\s>]/);
  });

  it("el formulario de registro no gana ni un campo, ni un texto, ni un script", async () => {
    const html = await renderAsincrono(RegistroPage());
    expect(html.toLowerCase()).not.toContain("sms");
    expect(html.toLowerCase()).not.toContain("código de 6 dígitos");
    expect(html).not.toContain("/registro/verificar");
    // Ni un byte de JavaScript de cliente PROPIO de esta capacidad: la página
    // del formulario ni siquiera importa nada de `verificacion/`. (Que no
    // cargue ningún script externo lo vigila `tests/registro-pagina.test.ts`,
    // desde antes de T-016.)
    for (const ruta of [
      "src/app/(publico)/registro/page.tsx",
      "src/components/registro/formulario-registro.tsx",
    ]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).not.toContain("verificacion/");
    }
  });

  it("la cola y el detalle del panel no mencionan la verificación", async () => {
    await procesarRegistro(envio({ whatsapp: `${PREFIJO}0004` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    const cola = await obtenerColaDeRevision(prisma, AHORA);
    const propios = cola.filter((r) => r.nombre === "Zapatería Ficticia El Tacón");
    expect(propios.length).toBeGreaterThan(0);
    for (const renglon of propios) {
      expect(renglon.numeroVerificadoEn).toBeNull();
      expect(pintar(createElement(TarjetaCola, renglon)).toLowerCase()).not.toContain("sms");
    }

    const registro = await obtenerRegistroParaPanel(prisma, propios[0].id);
    expect(registro).not.toBeNull();
    const html = pintar(createElement(DetalleRegistro, { registro: registro! }));
    expect(html.toLowerCase()).not.toContain("sms");
    expect(html).not.toContain("Sin verificar");
    // Y sigue teniendo lo de siempre.
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Consentimiento del aviso de privacidad");
  });
});

// Scenario: apagar la bandera devuelve el flujo de siempre
describe("registro-negocio · apagar la bandera devuelve el flujo de siempre", () => {
  it("con las credenciales puestas pero sin bandera, no hay capacidad ni advertencia", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[VARIABLE_TWILIO_SID] = "AC-de-mentiras-000";
    process.env[VARIABLE_TWILIO_AUTH_TOKEN] = "token-de-mentiras-000";
    process.env[VARIABLE_TWILIO_SERVICE_SID] = "VA-de-mentiras-000";
    process.env[VARIABLE_SECRETO] = "secreto-de-pruebas-de-32-caracteres-o-mas";

    expect(await dependenciasDeVerificacion()).toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("una ficha ya verificada CONSERVA su marca aunque la capacidad esté apagada", async () => {
    await procesarRegistro(envio({ whatsapp: `${PREFIJO}0005` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    await prisma.negocio.update({
      where: { whatsapp: `${PREFIJO}0005` },
      data: { numeroVerificadoEn: AHORA },
    });
    const guardada = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: `${PREFIJO}0005` },
    });
    expect(guardada.numeroVerificadoEn?.toISOString()).toBe(AHORA.toISOString());
  });
});

describe("registro-negocio · el fail-safe está escrito en un solo lugar", () => {
  /** Todos los `.ts`/`.tsx` bajo `src`, para las revisiones de código. */
  function fuentesDe(dir: string): string[] {
    const rutas: string[] = [];
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) rutas.push(...fuentesDe(ruta));
      else if (/\.tsx?$/.test(entrada.name)) rutas.push(ruta);
    }
    return rutas;
  }

  it("nadie lee las variables del proveedor fuera de `verificacion/config.ts`", () => {
    const permitidos = [
      join(raiz, "src/lib/verificacion/config.ts"),
    ];
    for (const ruta of fuentesDe(join(raiz, "src"))) {
      if (permitidos.includes(ruta)) continue;
      const cuerpo = readFileSync(ruta, "utf8");
      for (const variable of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID", "VERIFICACION_SMS_ACTIVA", "VERIFICACION_SMS_SECRETO"]) {
        expect(cuerpo, `${ruta} lee ${variable} por su cuenta`).not.toContain(
          `process.env.${variable}`,
        );
        expect(cuerpo, `${ruta} lee ${variable} por su cuenta`).not.toContain(
          `process.env["${variable}"]`,
        );
      }
    }
  });

  it("la pantalla del código y su formulario no son Client Components", () => {
    for (const ruta of [
      "src/app/(publico)/registro/verificar/page.tsx",
      "src/components/registro/formulario-verificar-codigo.tsx",
      "src/app/(publico)/registro/gracias/page.tsx",
    ]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).not.toContain('"use client"');
    }
  });

  it("la ruta nueva no entra al sitemap", () => {
    const sitemap = readFileSync(join(raiz, "src/app/sitemap.ts"), "utf8");
    expect(sitemap).not.toContain("/registro/verificar");
    // Y `/registro` sí sigue estando, como siempre.
    expect(sitemap).toContain("/registro");
  });

  it("no quedó ningún mock de la etapa UI en el árbol", () => {
    const restos = fuentesDe(join(raiz, "src")).filter((ruta) => /-mock\.tsx?$/.test(ruta));
    expect(restos).toEqual([]);
  });
});
