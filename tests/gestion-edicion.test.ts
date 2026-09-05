import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import { enviarEdicion } from "../src/app/(gestion)/editar/[token]/accion";
import EditarPage, { metadata as metadataEditar } from "../src/app/(gestion)/editar/[token]/page";
import { metadata as metadataGracias } from "../src/app/(gestion)/editar/[token]/gracias/page";
import GraciasPage from "../src/app/(gestion)/editar/[token]/gracias/page";
import { metadata as metadataLayoutGestion } from "../src/app/(gestion)/layout";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  AVISO_EDICION_PENDIENTE,
  BOTON_ENVIAR_CAMBIOS,
  ERROR_CUPO_EDICION,
  ERROR_WHATSAPP_DUPLICADO_EDICION,
  FRASE_EDICION,
  MENSAJE_CAMBIOS_RECIBIDOS,
  NOTA_PRIVACIDAD_VIGENTE,
  TITULO_EDICION,
} from "../src/lib/gestion/textos";
import { reiniciarCupoDeEdiciones } from "../src/lib/gestion/limite-ip";
import { procesarEdicion } from "../src/lib/gestion/procesar-edicion";
import { generarTokenGestion, huellaDeToken } from "../src/lib/gestion/token";
import {
  VARIABLE_ENCABEZADO_IP,
  reiniciarLimitePorIp,
} from "../src/lib/registro/limite-ip";
import { COLONIA_OTRA_VALOR, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import { NoEncontradoSimulado, peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";

/**
 * Spec `registro-negocio` (delta del change `agregar-enlace-de-gestion`) ·
 * Requirements "El enlace de gestión abre la ficha en modo edición…", "Un
 * token que no es exactamente el vigente no abre nada ni delata nada",
 * "Enviar la edición no toca la ficha pública…", "La edición pasa por las
 * mismas validaciones del registro…", "Mandar cambios cuando ya hay otros
 * esperando reemplaza a los anteriores" y "Anti-abuso del envío de ediciones,
 * con cupo propio" (tasks.md #9-#16).
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771000 6xxx.
 */

const PREFIJO = "7710006";
const ENCABEZADO_IP = "x-forwarded-for";
const IP = "203.0.113.44";

const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let categoriaId: number;
let otraCategoriaId: number;
let coloniaId: number;

/** Publica un negocio con enlace de gestión y devuelve su id y su token. */
async function altaPublicadaConEnlace(
  whatsapp: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
  const token = generarTokenGestion();
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Tortillería Ficticia La Espiga",
      categoriaId,
      coloniaId,
      whatsapp,
      queOfreces: "Tortilla de maíz inventada",
      telefonoFijo: "7717776001",
      direccion: "Frente a un mercado inventado",
      horario: "L-D 6am-2pm",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      origen: "organico",
      tokenGestionHash: huellaDeToken(token),
      tokenGestionCreadoEn: new Date("2026-08-02T10:00:00.000Z"),
      ...extra,
    },
  });
  return { id: creado.id, token };
}

/** Envío completo y válido del formulario de edición. */
function envio(cambios: Record<string, string> = {}): FormData {
  const datos = new FormData();
  const base: Record<string, string> = {
    nombre: "Tortillería Ficticia La Espiga",
    categoriaId: String(categoriaId),
    whatsapp: `${PREFIJO}001`,
    coloniaId: String(coloniaId),
    coloniaOtra: "",
    queOfreces: "Tortilla de maíz inventada",
    telefonoFijo: "7717776001",
    direccion: "Frente a un mercado inventado",
    horario: "L-D 6am-2pm",
    facebookUrl: "",
    ...cambios,
  };
  for (const [clave, valor] of Object.entries(base)) datos.set(clave, valor);
  return datos;
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const abrir = (token: string) =>
  render(
    EditarPage({
      params: Promise.resolve({ token }),
    } as Parameters<typeof EditarPage>[0]),
  );

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "restaurantes-y-fondas" } })
  ).id;
  otraCategoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  reiniciarPeticion();
  reiniciarCupoDeEdiciones();
  reiniciarLimitePorIp();
  process.env[VARIABLE_ENCABEZADO_IP] = ENCABEZADO_IP;
  peticion.encabezados[ENCABEZADO_IP] = IP;
});

afterEach(() => {
  delete process.env[VARIABLE_ENCABEZADO_IP];
});

// ── El enlace abre el formulario prellenado ─────────────────────────────────

describe("registro-negocio · el enlace abre la ficha en modo edición", () => {
  // Scenario: el dueño abre su enlace
  it("pinta el título, la frase, el botón y todos los campos ya puestos", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}001`);
    const html = normalizado(await abrir(token));

    expect(html).toContain(TITULO_EDICION);
    expect(html).toContain(FRASE_EDICION);
    expect(html).toContain(BOTON_ENVIAR_CAMBIOS);
    expect(html).toContain('value="Tortillería Ficticia La Espiga"');
    expect(html).toContain(`${PREFIJO}001`);
    expect(html).toContain("Tortilla de maíz inventada");
    expect(html).toContain("L-D 6am-2pm");
    // La categoría y la colonia vienen marcadas en sus selectores.
    expect(html).toContain(`<option value="${categoriaId}" selected=""`);
    expect(html).toContain(`<option value="${coloniaId}" selected=""`);
  });

  // Scenario: la edición no vuelve a pedir consentimiento
  it("no lleva checkbox de consentimiento y sí la nota del aviso vigente", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}002`);
    const html = normalizado(await abrir(token));

    expect(html).toContain(NOTA_PRIVACIDAD_VIGENTE);
    expect(html).toContain("Lee el aviso de privacidad completo");
    expect(html).not.toContain('name="consentimiento"');
    expect(html).not.toContain('id="consentimiento"');
  });

  // Scenario: negocio con colonia "Otra" sin normalizar
  it("conserva la colonia 'Otra' con su texto libre, sin inventarle una del catálogo", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}003`, {
      coloniaId: null,
      coloniaOtra: "Barrio Inventado del Progreso",
    });
    const html = normalizado(await abrir(token));

    expect(html).toContain(`<option value="${COLONIA_OTRA_VALOR}" selected=""`);
    expect(html).toContain('value="Barrio Inventado del Progreso"');
  });

  it("no ofrece cambiar la foto (fuera de los campos editables del ticket)", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}004`);
    const html = await abrir(token);
    expect(html).not.toContain('type="file"');
  });
});

// ── El 404 indistinguible ───────────────────────────────────────────────────

describe("registro-negocio · un token que no es el vigente no abre nada", () => {
  const esperarNoEncontrado = async (token: string) => {
    await expect(abrir(token)).rejects.toBeInstanceOf(NoEncontradoSimulado);
  };

  // Scenario: token inventado
  it("un token inventado responde no encontrado", async () => {
    await esperarNoEncontrado(generarTokenGestion());
  });

  it("una cadena que ni siquiera tiene forma de token responde igual", async () => {
    await esperarNoEncontrado("no-es-un-token");
    await esperarNoEncontrado("");
    await esperarNoEncontrado("a".repeat(5_000));
  });

  it("un token alterado en un carácter no abre la ficha de su dueño", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}010`);
    const alterado = `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
    await esperarNoEncontrado(alterado);
    // Y el bueno sí abre, para que el caso anterior signifique algo.
    expect(await abrir(token)).toContain(TITULO_EDICION);
  });

  // Scenario: token invalidado por una regeneración
  it("el token anterior deja de abrir cuando se genera uno nuevo", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}011`);
    const nuevo = generarTokenGestion();
    await prisma.negocio.update({
      where: { id },
      data: { tokenGestionHash: huellaDeToken(nuevo), tokenGestionCreadoEn: new Date() },
    });

    await esperarNoEncontrado(token);
    expect(await abrir(nuevo)).toContain(TITULO_EDICION);
    // La ficha sigue publicada, sin cambios.
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.estado).toBe("publicado");
  });

  // Scenario: token de un negocio que no está publicado
  it.each(["en_revision", "rechazado"])(
    "un token de una ficha en estado %s responde no encontrado",
    async (estado) => {
      const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}01${estado.length}`);
      await prisma.negocio.update({ where: { id }, data: { estado } });
      await esperarNoEncontrado(token);
    },
  );

  // Spec `modelo-datos` · Scenario: el enlace de un negocio borrado no resuelve
  it("el enlace de un negocio borrado no resuelve", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}013`);
    await prisma.negocio.deleteMany({ where: { id } });
    await esperarNoEncontrado(token);
  });

  // Scenario: la página de edición no se indexa ni se enlaza
  it("las dos pantallas declaran noindex, nofollow", () => {
    for (const metadata of [metadataEditar, metadataGracias]) {
      expect(metadata.robots).toEqual({ index: false, follow: false });
      // Ninguna declara política de referente por su cuenta: la hereda del
      // layout del grupo, para que cubra también las pantallas que se agreguen
      // (y para que nadie la "endurezca" a `no-referrer`, que rompe el envío
      // sin JavaScript — ver `src/app/(gestion)/layout.tsx`).
      expect(metadata.referrer).toBeUndefined();
    }
  });

  // Scenario: el token no se va en el Referer
  it("el grupo del modo edición corta la ruta en el referente de todo enlace saliente", () => {
    // `strict-origin` manda solo el origen (`https://sitio/`), nunca
    // `/editar/<token>`: la URL de edición no llega a ningún destino, ni
    // siquiera a otra página del propio sitio (que es donde la analítica
    // reenviaría el referente como ruta).
    expect(metadataLayoutGestion.referrer).toBe("strict-origin");
  });

  // Scenario: el token no aparece en el log
  it("ni el camino feliz ni el de error escriben el token en el log", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}014`);
    const escrito: string[] = [];
    const espias = (["log", "warn", "error", "info", "debug"] as const).map((nivel) =>
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        escrito.push(args.map(String).join(" "));
      }),
    );
    try {
      await abrir(token);
      await expect(abrir(generarTokenGestion())).rejects.toBeInstanceOf(
        NoEncontradoSimulado,
      );
      // Y un envío que falla por validación.
      await enviarEdicion(
        token,
        { errores: {}, valores: {} as never },
        envio({ whatsapp: "123" }),
      );
    } finally {
      for (const espia of espias) espia.mockRestore();
    }

    for (const linea of escrito) {
      expect(linea).not.toContain(token);
      // Ni recortado: ningún tramo largo del token puede asomar.
      expect(linea).not.toContain(token.slice(0, 12));
    }
  });
});

// ── El envío ────────────────────────────────────────────────────────────────

describe("registro-negocio · enviar la edición no toca la ficha pública", () => {
  // Scenario: los cambios entran a revisión y la ficha no se mueve
  it("crea una edición pendiente y la ficha sigue exactamente igual", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}020`);
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id } });

    const destino = await urlDeRedireccion(() =>
      enviarEdicion(
        token,
        { errores: {}, valores: {} as never },
        envio({
          whatsapp: `${PREFIJO}020`,
          horario: "L-D 6am-8pm",
          direccion: "Frente a un mercado inventado, local 12",
        }),
      ),
    );
    expect(destino).toBe(`/editar/${token}/gracias`);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues).toEqual(antes);

    const pendientes = await prisma.edicionPendiente.findMany({
      where: { negocioId: id, estado: "pendiente" },
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].horario).toBe("L-D 6am-8pm");
    expect(pendientes[0].direccion).toBe("Frente a un mercado inventado, local 12");
  });

  it("la confirmación dice el literal de la spec y no repite el envío", async () => {
    const html = normalizado(await render(GraciasPage()));
    expect(html).toContain(MENSAJE_CAMBIOS_RECIBIDOS);
    // Scenario: recargar la confirmación — no hay ningún formulario que
    // reenviar, y el token no aparece en ningún href de esta pantalla.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/editar/");
  });

  // Scenario: WhatsApp inválido en la edición
  it("un WhatsApp de menos de 10 dígitos rebota con su literal y no guarda nada", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}021`);
    const estado = await enviarEdicion(
      token,
      { errores: {}, valores: {} as never },
      envio({ whatsapp: "771123456", horario: "L-D 7am-9pm" }),
    );

    expect(estado.errores.whatsapp).toBe(MENSAJES_ERROR_REGISTRO.whatsapp);
    // Lo capturado vuelve intacto.
    expect(estado.valores.horario).toBe("L-D 7am-9pm");
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  // Scenario: WhatsApp que ya tiene otra ficha
  it("un número que ya está en otra ficha rebota con su literal", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}022`);
    await altaPublicadaConEnlace(`${PREFIJO}023`);

    const estado = await enviarEdicion(
      token,
      { errores: {}, valores: {} as never },
      envio({ whatsapp: `${PREFIJO}023` }),
    );

    expect(estado.errores.whatsapp).toBe(ERROR_WHATSAPP_DUPLICADO_EDICION);
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  it("conservar su propio número no cuenta como duplicado", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}024`);
    await urlDeRedireccion(() =>
      enviarEdicion(
        token,
        { errores: {}, valores: {} as never },
        envio({ whatsapp: `${PREFIJO}024`, horario: "L-V 8am-4pm" }),
      ),
    );
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(1);
  });

  // Scenario: campos que no le tocan
  it("ignora estado, origen, giros, fechas, consentimiento y token del cliente", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}025`);
    const datos = envio({ whatsapp: `${PREFIJO}025` });
    for (const [clave, valor] of Object.entries({
      estado: "publicado",
      origen: "siembra",
      giro: "1",
      publicadoEn: "2020-01-01",
      registradoEn: "2020-01-01",
      consintioAvisoEn: "2020-01-01",
      consintioAvisoVersion: "9",
      tokenGestionHash: "huella-falsificada",
      tokenGestionCreadoEn: "2020-01-01",
      fotoClave: "clave-falsificada",
      negocioId: "otro-negocio",
      id: "otro-id",
    })) {
      datos.set(clave, valor);
    }

    await urlDeRedireccion(() =>
      enviarEdicion(token, { errores: {}, valores: {} as never }, datos),
    );

    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    // La edición pertenece al negocio del TOKEN, no al que dijo el envío.
    expect(edicion.negocioId).toBe(id);
    expect(Object.keys(edicion)).not.toContain("estado_negocio");
    expect(edicion.estado).toBe("pendiente");

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.origen).toBe("organico");
    expect(ficha.tokenGestionHash).not.toBe("huella-falsificada");
    expect(ficha.consintioAvisoEn).toEqual(new Date("2026-08-01T10:00:00.000Z"));
  });
});

// ── Reemplazo de la pendiente ───────────────────────────────────────────────

describe("registro-negocio · mandar cambios cuando ya hay otros esperando", () => {
  // Scenario: aviso al abrir con cambios pendientes
  it("el formulario se prellena con lo último que él mandó y lo avisa", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}030`);
    await urlDeRedireccion(() =>
      enviarEdicion(
        token,
        { errores: {}, valores: {} as never },
        envio({ whatsapp: `${PREFIJO}030`, horario: "L-D 5am-11pm" }),
      ),
    );

    const html = normalizado(await abrir(token));
    expect(html).toContain(AVISO_EDICION_PENDIENTE);
    // Lo pendiente, no lo publicado.
    expect(html).toContain("L-D 5am-11pm");
    expect(html).not.toContain("L-D 6am-2pm");
  });

  it("sin cambios pendientes no se pinta el aviso", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}031`);
    expect(await abrir(token)).not.toContain(AVISO_EDICION_PENDIENTE);
  });

  // Scenario: los cambios nuevos sustituyen a los viejos
  it("el segundo envío reemplaza al primero y reinicia su reloj", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}032`);
    const estadoVacio = { errores: {}, valores: {} as never };

    await urlDeRedireccion(() =>
      enviarEdicion(token, estadoVacio, envio({ whatsapp: `${PREFIJO}032`, horario: "viejo" })),
    );
    const primera = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    await urlDeRedireccion(() =>
      enviarEdicion(token, estadoVacio, envio({ whatsapp: `${PREFIJO}032`, horario: "nuevo" })),
    );

    const pendientes = await prisma.edicionPendiente.findMany({
      where: { negocioId: id, estado: "pendiente" },
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].horario).toBe("nuevo");
    expect(pendientes[0].creadaEn.getTime()).toBeGreaterThanOrEqual(
      primera.creadaEn.getTime(),
    );

    // La anterior quedó cerrada, y SIN motivo: un reemplazo del dueño no es un
    // descarte del admin (no hay nada que avisarle a nadie).
    const anterior = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: primera.id },
    });
    expect(anterior.estado).toBe("descartada");
    expect(anterior.motivoDescarte).toBeNull();
    expect(anterior.resueltaEn).not.toBeNull();
  });

  // Scenario: dos envíos casi simultáneos
  //
  // Se ejercita `procesarEdicion` —el módulo donde vive la regla— y no la
  // Server Action, para pasarle el cliente de la suite: el servidor local
  // (PGlite) multiplexa TODAS las conexiones sobre una sola sesión de
  // PostgreSQL, así que dos clientes con pool propio se pisan el protocolo y
  // el resultado sería ruido del entorno, no del código (ver tests/db.ts).
  // Con un solo cliente las dos peticiones siguen solapándose de verdad: lo
  // que decide el desenlace es el índice único parcial y el reintento.
  it("dos envíos casi simultáneos dejan exactamente una pendiente, sin error técnico", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}033`);
    const contexto = { prisma, ip: IP };

    const resultados = await Promise.all([
      procesarEdicion(token, envio({ whatsapp: `${PREFIJO}033`, horario: "uno" }), contexto),
      procesarEdicion(token, envio({ whatsapp: `${PREFIJO}033`, horario: "dos" }), contexto),
    ]);

    // Los dos ven el mismo éxito: nadie recibe un error técnico.
    for (const resultado of resultados) expect(resultado).toEqual({ exito: true });
    expect(
      await prisma.edicionPendiente.count({ where: { negocioId: id, estado: "pendiente" } }),
    ).toBe(1);
  });

  it("un choque con el índice único se reintenta y el dueño ve su confirmación", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}034`);
    // El envío del otro dueño "gana" justo antes de que este escriba: cuando
    // esta transacción llega, ya hay una pendiente que no vio al empezar.
    await prisma.edicionPendiente.create({
      data: {
        negocioId: id,
        nombre: "Tortillería Ficticia La Espiga",
        categoriaId,
        whatsapp: `${PREFIJO}034`,
        coloniaId,
        horario: "la que ya estaba",
      },
    });

    const resultado = await procesarEdicion(
      token,
      envio({ whatsapp: `${PREFIJO}034`, horario: "la que llega después" }),
      { prisma, ip: IP },
    );

    expect(resultado).toEqual({ exito: true });
    const pendientes = await prisma.edicionPendiente.findMany({
      where: { negocioId: id, estado: "pendiente" },
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].horario).toBe("la que llega después");
  });
});

// ── Anti-abuso ──────────────────────────────────────────────────────────────

describe("registro-negocio · anti-abuso del envío de ediciones", () => {
  // Scenario: el campo trampa
  it("un envío con el campo trampa lleno ve la misma confirmación y no guarda nada", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}040`);
    const datos = envio({ whatsapp: `${PREFIJO}040` });
    datos.set("sitio_web", "http://spam.example");

    const destino = await urlDeRedireccion(() =>
      enviarEdicion(token, { errores: {}, valores: {} as never }, datos),
    );
    expect(destino).toBe(`/editar/${token}/gracias`);
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  // Scenario: límite por IP
  it("el cuarto envío de la misma hora se rechaza con su literal", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}041`);
    const estadoVacio = { errores: {}, valores: {} as never };

    for (let intento = 0; intento < 3; intento += 1) {
      await urlDeRedireccion(() =>
        enviarEdicion(
          token,
          estadoVacio,
          envio({ whatsapp: `${PREFIJO}041`, horario: `intento ${intento}` }),
        ),
      );
    }

    const estado = await enviarEdicion(
      token,
      estadoVacio,
      envio({ whatsapp: `${PREFIJO}041`, horario: "cuarto" }),
    );
    expect(estado.errores.general).toBe(ERROR_CUPO_EDICION);

    const pendiente = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: "pendiente" },
    });
    expect(pendiente.horario).toBe("intento 2");
  });

  // Scenario: los cupos no se estorban
  it("agotar el cupo de ediciones no consume el de altas del registro", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}042`);
    const estadoVacio = { errores: {}, valores: {} as never };
    for (let intento = 0; intento < 4; intento += 1) {
      await enviarEdicion(
        token,
        estadoVacio,
        envio({ whatsapp: `${PREFIJO}042`, horario: `intento ${intento}` }),
      ).catch(() => undefined);
    }

    // El contador de altas del registro no se movió.
    const { ipBloqueada } = await import("../src/lib/registro/limite-ip");
    expect(ipBloqueada(IP)).toBe(false);
  });
});

// ── La categoría también se puede cambiar ───────────────────────────────────

describe("registro-negocio · la edición cubre todos los campos capturables", () => {
  it("guarda la categoría propuesta sin tocar la de la ficha", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}050`);
    await urlDeRedireccion(() =>
      enviarEdicion(
        token,
        { errores: {}, valores: {} as never },
        envio({ whatsapp: `${PREFIJO}050`, categoriaId: String(otraCategoriaId) }),
      ),
    );

    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    expect(edicion.categoriaId).toBe(otraCategoriaId);
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.categoriaId).toBe(categoriaId);
  });
});
