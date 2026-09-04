import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// La Server Action lee `headers()` y corta con `redirect()`/`notFound()`, que
// solo existen dentro de un request real: se simulan igual que en las suites
// del panel para poder mandarle envíos directos al servidor.
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
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import { reportarNegocio } from "../src/app/negocio/[ficha]/reportar/accion";
import ReportarGraciasPage, {
  metadata as metadataGracias,
} from "../src/app/negocio/[ficha]/reportar/gracias/page";
import ReportarNegocioPage, {
  metadata as metadataReportar,
} from "../src/app/negocio/[ficha]/reportar/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  DURACION_BORRADOR_S,
  NOMBRE_COOKIE_BORRADOR,
  codificarBorrador,
  decodificarBorrador,
} from "../src/lib/reportes/borrador";
import { reiniciarCupoDeReportes } from "../src/lib/reportes/limite";
import { ETIQUETA_MOTIVO_REPORTE, MOTIVOS_REPORTE } from "../src/lib/reportes/motivos";
import {
  AYUDA_COMENTARIO_REPORTE,
  BOTON_ENVIAR_REPORTE,
  CONTROL_REPORTAR,
  ENLACE_VOLVER_A_LA_FICHA,
  ERROR_COMENTARIO_LARGO_REPORTE,
  ERROR_CUPO_REPORTES,
  ERROR_GUARDADO_REPORTE,
  ERROR_MOTIVO_REPORTE,
  ETIQUETA_COMENTARIO_REPORTE,
  ETIQUETA_QUE_PASA,
  FRASE_REPORTAR,
  LIMITE_COMENTARIO_REPORTE,
  MENSAJE_REPORTE_ENVIADO,
} from "../src/lib/reportes/textos";
import {
  NoEncontradoSimulado,
  peticion,
  reiniciarPeticion,
  urlDeRedireccion,
} from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico (delta del change `agregar-boton-reportar`) ·
// Requirements del control de la ficha, del mini-formulario, de la validación
// server-side, de la confirmación y del anti-abuso (tasks.md #7, #8 y #9).
//
// Datos 100% ficticios (repo público + LFPDPPP): números 771000 5xxx.

const raiz = join(__dirname, "..");
const PREFIJO = "7710005";
const ENCABEZADO_IP = "x-forwarded-for";
const IP = "203.0.113.30"; // TEST-NET-3, reservado para documentación
const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let categoriaId: number;
let idPublicado = "";
let idEnRevision = "";
let idRechazado = "";
let segmentoPublicado = "";

const NOMBRE_PUBLICADO = "Tortillería Ficticia La Mano";

async function alta(
  nombre: string,
  whatsapp: string,
  estado: "en_revision" | "publicado" | "rechazado",
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      whatsapp,
      consintioAvisoEn: new Date(),
      estado,
      publicadoEn: estado === "publicado" ? new Date() : null,
    },
  });
  return creado.id;
}

function envio(campos: Record<string, string | string[]> = {}): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    for (const uno of Array.isArray(valor) ? valor : [valor]) {
      formData.append(clave, uno);
    }
  }
  return formData;
}

/**
 * Corre la acción ya ligada al negocio publicado de la suite. Desde la
 * iteración 3 la acción solo recibe el identificador: la ruta de la ficha la
 * reconstruye el servidor (hallazgo M3).
 */
const reportar = (formData: FormData, id = idPublicado) => reportarNegocio(id, formData);

async function renderReportar(
  segmento: string,
  searchParams: Record<string, string | string[]> = {},
): Promise<string> {
  const elemento = await ReportarNegocioPage({
    params: Promise.resolve({ ficha: segmento }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idPublicado = await alta(NOMBRE_PUBLICADO, `${PREFIJO}001`, "publicado");
  idEnRevision = await alta("Herrería Ficticia El Yunque", `${PREFIJO}002`, "en_revision");
  idRechazado = await alta("Rifas Ficticias Seguras", `${PREFIJO}003`, "rechazado");
  segmentoPublicado = construirSegmentoFicha(NOMBRE_PUBLICADO, idPublicado);
});

afterAll(async () => {
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarPeticion();
  reiniciarCupoDeReportes();
  delete process.env.REGISTRO_ENCABEZADO_IP;
  await prisma.reporte.deleteMany();
});

describe("directorio-publico · el formulario de reporte", () => {
  // Scenario: formulario de reporte completo
  it("trae el encabezado, el nombre, la frase, los cuatro motivos y el botón", async () => {
    const html = normalizado(await renderReportar(segmentoPublicado));

    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(CONTROL_REPORTAR);
    expect(html).toContain(NOMBRE_PUBLICADO);
    expect(html).toContain(FRASE_REPORTAR);
    expect(html).toContain(ETIQUETA_QUE_PASA);
    for (const motivo of MOTIVOS_REPORTE) {
      expect(html).toContain(`value="${motivo}"`);
      expect(html).toContain(ETIQUETA_MOTIVO_REPORTE[motivo]);
    }
    expect(html).toContain(ETIQUETA_COMENTARIO_REPORTE);
    expect(html).toContain(AYUDA_COMENTARIO_REPORTE);
    expect(html).toContain(BOTON_ENVIAR_REPORTE);
    expect(html).toContain(ENLACE_VOLVER_A_LA_FICHA);
    expect(html).toContain(`href="/negocio/${segmentoPublicado}"`);
  });

  it("ninguna opción viene marcada y el comentario está acotado a 300", async () => {
    const html = await renderReportar(segmentoPublicado);
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
    expect(html).toMatch(/name="comentario"/);
    expect(html).toContain('maxLength="300"');
  });

  // Scenario: el formulario no pide datos del reportante
  it("sus únicos campos son motivo, comentario y el campo trampa", async () => {
    const html = await renderReportar(segmentoPublicado);
    const nombres = [...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(nombres)].sort()).toEqual(["comentario", "motivo", "sitio_web"]);
    expect(html).not.toMatch(/whatsapp|tel[ée]fono|correo|nombre completo/i);
  });

  // Scenario: reportar un negocio que no está publicado
  it.each([
    ["en revisión", () => construirSegmentoFicha("Herrería", idEnRevision)],
    ["rechazado", () => construirSegmentoFicha("Rifas", idRechazado)],
    ["un id que no existe", () => "negocio-que-no-existe-xyz"],
  ])("%s responde 404, idéntico en los tres casos", async (_caso, segmento) => {
    await expect(renderReportar(segmento())).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  // Scenario: la página de reporte no se indexa
  it("la página y su confirmación declaran noindex", () => {
    expect(metadataReportar.robots).toEqual({ index: false, follow: false });
    expect(metadataGracias.robots).toEqual({ index: false, follow: false });
  });

  // Scenario: celular a 390px (lo automatizable: área táctil de cada control)
  it("cada control tocable reserva al menos 44px", async () => {
    const html = await renderReportar(segmentoPublicado);
    // Una opción por motivo, el botón de envío y "Volver a la ficha".
    const tocables = html.match(/min-h-11/g) ?? [];
    expect(tocables.length).toBeGreaterThanOrEqual(MOTIVOS_REPORTE.length + 2);
    // Y el nombre del negocio no puede sacar el layout a lo ancho.
    expect(html).toMatch(/break-words/);
  });

  // Scenario: sin JS de cliente nuevo
  it('ningún archivo nuevo del reporte declara "use client"', () => {
    const archivos = [
      ...archivosDe(join(raiz, "src/app/negocio")),
      ...archivosDe(join(raiz, "src/components/reportes")),
      ...archivosDe(join(raiz, "src/lib/reportes")),
      join(raiz, "src/components/directorio/boton-reportar.tsx"),
    ];
    expect(archivos.length).toBeGreaterThanOrEqual(6);
    for (const ruta of archivos) {
      expect(readFileSync(ruta, "utf8"), ruta).not.toMatch(/["']use client["']/);
    }
  });
});

describe("directorio-publico · los errores vuelven al formulario", () => {
  it.each([
    ["motivo", ERROR_MOTIVO_REPORTE],
    ["comentario", ERROR_COMENTARIO_LARGO_REPORTE],
    ["cupo", ERROR_CUPO_REPORTES],
    ["servidor", ERROR_GUARDADO_REPORTE],
  ])("el error %s se pinta con su literal", async (error, literal) => {
    const html = normalizado(await renderReportar(segmentoPublicado, { error }));
    expect(html).toContain(literal);
  });

  // Scenario: envío sin elegir motivo (el comentario no se pierde).
  //
  // Lo escrito vuelve por la cookie de borrador, NO por la URL: una query
  // string acaba en el log de acceso del proxy y en el historial del teléfono
  // (hallazgo M2 de la etapa C).
  it("conserva el comentario que ya se había escrito, leído de la cookie", async () => {
    peticion.cookies[NOMBRE_COOKIE_BORRADOR] = codificarBorrador(
      "ya no abren los domingos",
      LIMITE_COMENTARIO_REPORTE,
    );

    const html = await renderReportar(segmentoPublicado, { error: "motivo" });
    expect(html).toContain("ya no abren los domingos");
  });

  it("sin cookie de borrador el formulario sale vacío", async () => {
    const html = await renderReportar(segmentoPublicado, { error: "motivo" });
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  it("el comentario ya NO se lee de la URL, aunque alguien la escriba a mano", async () => {
    const html = await renderReportar(segmentoPublicado, {
      error: "motivo",
      comentario: "texto-metido-a-mano-en-la-url",
    });
    expect(html).not.toContain("texto-metido-a-mano-en-la-url");
  });

  // Iteración 3 (hallazgo M3): lo que se liga con `.bind` viaja al navegador
  // como campo oculto sin firmar y vuelve como el cliente quiera, así que la
  // acción liga SOLO el identificador —que valida contra la base— y reconstruye
  // la ruta de la ficha en el servidor.
  it("el formulario liga un solo argumento: el identificador del negocio", () => {
    const fuente = readFileSync(
      join(raiz, "src/app/negocio/[ficha]/reportar/page.tsx"),
      "utf8",
    );
    expect(fuente).toContain("reportarNegocio.bind(null, negocio.id)");
    expect(fuente).not.toMatch(/reportarNegocio\.bind\(null,[^)]*,/);
  });

  it("un error inventado en la URL no pinta ningún aviso", async () => {
    const html = normalizado(await renderReportar(segmentoPublicado, { error: "loquesea" }));
    for (const literal of [
      ERROR_MOTIVO_REPORTE,
      ERROR_COMENTARIO_LARGO_REPORTE,
      ERROR_CUPO_REPORTES,
      ERROR_GUARDADO_REPORTE,
    ]) {
      expect(html).not.toContain(literal);
    }
  });
});

describe("directorio-publico · el envío del reporte", () => {
  // Iteración 3 (hallazgo M3): ningún campo del envío puede mover el destino.
  it("el destino lo arma el servidor: los campos del envío no lo mueven", async () => {
    const formData = envio({ motivo: "cerrado" });
    for (const campo of ["hrefFicha", "href", "next", "redirect", "returnTo"]) {
      formData.append(campo, "https://evil.example");
    }

    const destino = await urlDeRedireccion(() => reportar(formData));
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar/gracias`);
    expect(destino).not.toContain("evil");
    // Y la cookie del borrador tampoco cambia de ruta.
    expect(peticion.puestas.at(-1)?.opciones.path).toBe(
      `/negocio/${segmentoPublicado}/reportar`,
    );
  });

  // Iteración 3: un POST que manda más argumentos ligados de los que la acción
  // declara deja en `formData` lo que quiera el cliente. Responde 404, no un
  // error del servidor, y no escribe nada.
  it.each([
    ["una cadena", "https://evil.example"],
    ["un objeto", { get: () => "cerrado" }],
    ["null", null],
  ])("un envío con %s en vez del formulario responde 404 y no guarda", async (_caso, basura) => {
    await expect(reportar(basura as unknown as FormData)).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario: reporte enviado
  it("un envío válido guarda el reporte y manda a la confirmación", async () => {
    expect(await urlDeRedireccion(() => reportar(envio({ motivo: "cerrado" })))).toBe(
      `/negocio/${segmentoPublicado}/reportar/gracias`,
    );

    const guardados = await prisma.reporte.findMany();
    expect(guardados).toHaveLength(1);
    expect(guardados[0].negocioId).toBe(idPublicado);
    expect(guardados[0].motivo).toBe("cerrado");
  });

  it("guarda el comentario escrito", async () => {
    await urlDeRedireccion(() =>
      reportar(envio({ motivo: "datos_incorrectos", comentario: "El número no contesta" })),
    );
    expect((await prisma.reporte.findMany())[0].comentario).toBe("El número no contesta");
  });

  // Scenario: envío sin elegir motivo
  it("sin motivo vuelve al formulario con el error, y el comentario por cookie", async () => {
    const destino = await urlDeRedireccion(() =>
      reportar(envio({ comentario: "creo que ya cerró" })),
    );

    // En la URL solo el código del error; el texto del vecino, nunca.
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar?error=motivo`);
    expect(destino).not.toContain("cerr");
    expect(await prisma.reporte.count()).toBe(0);

    // Y lo escrito se conserva en la cookie de borrador, para que el
    // formulario lo devuelva puesto.
    const puesta = peticion.puestas.at(-1);
    expect(puesta?.nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(decodificarBorrador(puesta?.valor, LIMITE_COMENTARIO_REPORTE)).toBe(
      "creo que ya cerró",
    );
    expect(puesta?.opciones.httpOnly).toBe(true);
    expect(puesta?.opciones.maxAge).toBe(DURACION_BORRADOR_S);
  });

  // Scenario: motivo fuera de la lista (POST directo)
  it.each([
    ["un motivo inventado", { motivo: "me cae mal" }],
    ["el motivo repetido", { motivo: ["cerrado", "no_real"] }],
    ["el motivo vacío", { motivo: "" }],
  ])("%s vuelve con el error de motivo, sin guardar nada", async (_caso, campos) => {
    const destino = await urlDeRedireccion(() => reportar(envio(campos)));
    expect(destino).toContain("error=motivo");
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario: comentario demasiado largo
  it("un comentario de 301 caracteres vuelve con su error y sin fila", async () => {
    const destino = await urlDeRedireccion(() =>
      reportar(envio({ motivo: "cerrado", comentario: "a".repeat(301) })),
    );
    expect(destino).toContain("error=comentario");
    expect(await prisma.reporte.count()).toBe(0);
  });

  it("un comentario larguísimo no vuelve por la URL ni entero ni recortado", async () => {
    const destino = await urlDeRedireccion(() =>
      reportar(envio({ motivo: "cerrado", comentario: "b".repeat(50_000) })),
    );
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar?error=comentario`);
    expect(destino).not.toContain("bbb");

    // El borrador sí vuelve, recortado a la cota, y solo en la cookie: así el
    // vecino ve qué parte de lo que escribió sí cabía.
    const borrador = decodificarBorrador(
      peticion.puestas.at(-1)?.valor,
      LIMITE_COMENTARIO_REPORTE,
    );
    expect(borrador).toHaveLength(LIMITE_COMENTARIO_REPORTE);
  });

  it("el borrador se guarda sin partir un emoji a la mitad", async () => {
    await urlDeRedireccion(() =>
      reportar(envio({ motivo: "cerrado", comentario: "🌮".repeat(200) })),
    );
    const borrador = decodificarBorrador(
      peticion.puestas.at(-1)?.valor,
      LIMITE_COMENTARIO_REPORTE,
    );
    // 300 unidades UTF-16 son 150 emojis completos: ni medio taco suelto.
    expect(borrador).toBe("🌮".repeat(150));
    expect(borrador).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  // Scenario: bot que llena el honeypot
  it("el honeypot lleno manda a la MISMA confirmación y no guarda nada", async () => {
    const destino = await urlDeRedireccion(() =>
      reportar(envio({ motivo: "cerrado", sitio_web: "http://spam.example" })),
    );
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar/gracias`);
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario: cupo por IP agotado
  it("el cuarto envío de la hora vuelve con el error de cupo", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    peticion.encabezados[ENCABEZADO_IP] = IP;

    for (let i = 0; i < 3; i++) {
      expect(await urlDeRedireccion(() => reportar(envio({ motivo: "cerrado" })))).toContain(
        "/reportar/gracias",
      );
    }
    const destino = await urlDeRedireccion(() => reportar(envio({ motivo: "cerrado" })));
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar?error=cupo`);
    expect(await prisma.reporte.count()).toBe(3);
  });

  // Scenario: sin encabezado de IP declarado
  it("sin la variable de entorno el cupo no bloquea a nadie", async () => {
    peticion.encabezados[ENCABEZADO_IP] = IP;
    for (let i = 0; i < 5; i++) {
      expect(await urlDeRedireccion(() => reportar(envio({ motivo: "cerrado" })))).toContain(
        "/reportar/gracias",
      );
    }
    expect(await prisma.reporte.count()).toBe(5);
  });

  // Scenario: negocio con el tope de pendientes alcanzado
  it("con el tope alcanzado se ve la confirmación de siempre y no se guarda", async () => {
    await prisma.reporte.createMany({
      data: Array.from({ length: 10 }, () => ({ negocioId: idPublicado, motivo: "cerrado" })),
    });

    const destino = await urlDeRedireccion(() => reportar(envio({ motivo: "cerrado" })));
    expect(destino).toBe(`/negocio/${segmentoPublicado}/reportar/gracias`);
    expect(await prisma.reporte.count()).toBe(10);
  });

  // Scenario: reportar un negocio que no está publicado (POST directo)
  it.each([
    ["en revisión", () => idEnRevision],
    ["rechazado", () => idRechazado],
    ["un id que no existe", () => "id-que-no-existe-jamas"],
  ])("un envío contra %s responde 404 y no guarda nada", async (_caso, id) => {
    await expect(reportar(envio({ motivo: "cerrado" }), id())).rejects.toBeInstanceOf(
      NoEncontradoSimulado,
    );
    expect(await prisma.reporte.count()).toBe(0);
  });
});

describe("directorio-publico · la confirmación", () => {
  // Scenario: reporte enviado + Scenario: recargar la confirmación no duplica
  it("muestra el mensaje, vuelve a la ficha y no crea ningún reporte", async () => {
    const elemento = await ReportarGraciasPage({
      params: Promise.resolve({ ficha: segmentoPublicado }),
      searchParams: Promise.resolve({}),
    });
    const html = normalizado(renderToStaticMarkup(createElement(() => elemento)));

    expect(html).toContain(MENSAJE_REPORTE_ENVIADO);
    expect(html).toContain(ENLACE_VOLVER_A_LA_FICHA);
    expect(html).toContain(`href="/negocio/${segmentoPublicado}"`);
    // Sin formulario que reenviar: recargar no repite nada.
    expect(html).not.toContain("<form");
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario: la confirmación no cuenta nada del negocio
  it("no dice cuántos reportes tiene el negocio ni qué va a pasar con la ficha", async () => {
    await prisma.reporte.createMany({
      data: Array.from({ length: 4 }, () => ({ negocioId: idPublicado, motivo: "cerrado" })),
    });
    const elemento = await ReportarGraciasPage({
      params: Promise.resolve({ ficha: segmentoPublicado }),
      searchParams: Promise.resolve({}),
    });
    const html = normalizado(renderToStaticMarkup(createElement(() => elemento)));

    expect(html).not.toMatch(/\b\d+\s+reporte/i);
    expect(html).not.toMatch(/despublic|dar de baja|pendiente/i);
  });
});

describe("directorio-publico · el control de la ficha", () => {
  const renderFicha = async (segmento: string) => {
    const elemento = await FichaNegocioPage({
      params: Promise.resolve({ ficha: segmento }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(createElement(() => elemento));
  };

  // Scenario: la ficha ofrece reportar sin robarle el lugar a WhatsApp
  // + Scenario: tocar el control abre el formulario de reporte
  it("enlaza al formulario de ESE negocio, al final de la ficha", async () => {
    const html = await renderFicha(segmentoPublicado);

    expect(html).toContain(CONTROL_REPORTAR);
    expect(html).toContain(`href="/negocio/${segmentoPublicado}/reportar"`);
    // Va DESPUÉS del bloque de contacto (requirement "reportar queda fuera
    // del bloque de contacto").
    expect(html.indexOf(CONTROL_REPORTAR)).toBeGreaterThan(html.indexOf("wa.me"));
  });

  // Scenario: etiqueta accesible con el nombre del negocio
  it("su etiqueta accesible nombra al negocio", async () => {
    const html = await renderFicha(segmentoPublicado);
    expect(html).toContain(`aria-label="${CONTROL_REPORTAR}: ${NOMBRE_PUBLICADO}"`);
  });

  // Scenario: WhatsApp como acción principal
  it("no usa el verde de acción ni el tamaño del botón principal", () => {
    const fuente = readFileSync(
      join(raiz, "src/components/directorio/boton-reportar.tsx"),
      "utf8",
    );
    expect(fuente).not.toContain("CLASE_BOTON_PRIMARIO");
    expect(fuente).not.toMatch(/\bbg-accion\b/);
    // Y sigue siendo tocable en el celular.
    expect(fuente).toMatch(/\bmin-h-11\b/);
  });

  // Scenario: reportar no está en las tarjetas
  it("ninguna tarjeta del listado ni de resultados trae un control de reportar", () => {
    for (const ruta of [
      "src/components/directorio/tarjeta-negocio.tsx",
      "src/components/directorio/lista-negocios.tsx",
      "src/components/directorio/listado-categoria.tsx",
      "src/components/directorio/listado-giro.tsx",
    ]) {
      expect(readFileSync(join(raiz, ruta), "utf8"), ruta).not.toContain("Reportar");
    }
  });
});

function archivosDe(dir: string): string[] {
  const rutas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) rutas.push(...archivosDe(ruta));
    else if (/\.tsx?$/.test(entrada.name)) rutas.push(ruta);
  }
  return rutas;
}
