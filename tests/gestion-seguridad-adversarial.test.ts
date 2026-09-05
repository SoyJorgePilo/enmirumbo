import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

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
import EditarPage from "../src/app/(gestion)/editar/[token]/page";
import GraciasEdicionPage from "../src/app/(gestion)/editar/[token]/gracias/page";
import LayoutGestion, {
  metadata as metadataGestion,
} from "../src/app/(gestion)/layout";
import LayoutPublico from "../src/app/(publico)/layout";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import DetalleEdicionPage from "../src/app/admin/ediciones/[id]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
} from "../src/lib/admin/config";
import {
  VARIABLE_SRC as VARIABLE_ANALITICA_SRC,
  VARIABLE_WEBSITE_ID as VARIABLE_ANALITICA_ID,
} from "../src/lib/analitica/config";
import { obtenerRegistroParaPanel } from "../src/lib/admin/consultas";
import { obtenerEdicionParaPanel } from "../src/lib/admin/ediciones";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { despublicarFicha } from "../src/lib/admin/transiciones";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { CAMPOS_PROHIBIDOS_EN_EDICION } from "../src/lib/gestion/campos";
import { aplicarEdicion, descartarEdicion } from "../src/lib/gestion/ediciones";
import { regenerarEnlaceDeGestion } from "../src/lib/gestion/enlace";
import { ESTADO_EDICION_PENDIENTE } from "../src/lib/gestion/estados";
import { reiniciarCupoDeEdiciones } from "../src/lib/gestion/limite-ip";
import { procesarEdicion } from "../src/lib/gestion/procesar-edicion";
import { leerSobre, opcionesCookieSobre } from "../src/lib/gestion/sobre";
import { ERROR_GUARDAR_EDICION } from "../src/lib/gestion/textos";
import {
  generarTokenGestion,
  huellaDeToken,
  huellasIguales,
  negocioDelToken,
  pareceToken,
} from "../src/lib/gestion/token";
import { ESTADO_NEGOCIO_PUBLICADO } from "../src/lib/negocio";
import {
  VARIABLE_ENCABEZADO_IP,
  reiniciarLimitePorIp,
} from "../src/lib/registro/limite-ip";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";
import {
  NoEncontradoSimulado,
  peticion,
  reiniciarPeticion,
} from "./admin-mocks";

/**
 * ETAPA C (seguridad-test) del change `agregar-enlace-de-gestion` (T-014).
 *
 * Lo que el camino feliz del dev no cubre: entradas hostiles en el token y en
 * el envío de ediciones, transiciones ilegales, mass assignment, el sobre del
 * enlace y las superficies del panel con identificadores fabricados a mano.
 *
 * Cada `describe` dice qué invariante defiende y, cuando corresponde, qué
 * hallazgo del reporte `reports/c-seguridad.md` lo originó.
 *
 * **Estado tras la vuelta 2 (iteración 2 del dev):** los cuatro hallazgos
 * accionables están cerrados, y los tests que los documentaban dejaron de
 * "tolerar las dos formas" para **fijar la corregida** — son cerrojos de
 * regresión, no descripciones de un defecto:
 *
 * - `[A1]` (§7) — el token ya no sale hacia un tercero: la ruta vive en el
 *   grupo `(gestion)`, que no monta el tracker. Los tests recorren la cadena
 *   real de layouts, así que defienden la propiedad y no la ubicación.
 * - `[M1]` / `[M1b]` (§4) — una edición solo se declara aplicada si llegó a la
 *   ficha, y un negocio ocupa un solo renglón de la cola.
 * - `[R1]` (§4) — la ventana nueva que abrió invertir la transacción.
 * - `[M2]` (§5) — un identificador hostil responde 404, nunca un 500.
 * - `[B1]` (§2) — único que sigue tolerando las dos formas: es deuda
 *   declarada del borde compartido con el registro público, fuera del alcance
 *   de este change.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771000 8xxx.
 */

const PREFIJO = "7710008";
const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const ENCABEZADO_IP = "x-forwarded-for";
const IP = "198.51.100.7";
const AHORA = new Date("2026-09-12T12:00:00.000Z");
/** Raíz del App Router, para los guardianes que miran la estructura. */
const RAIZ_DE_APP = join(__dirname, "..", "src", "app");

const normalizado = (html: string) => html.replace(/\s+/g, " ");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

const abrirEdicion = (token: string) =>
  render(
    EditarPage({
      params: Promise.resolve({ token }),
    } as Parameters<typeof EditarPage>[0]),
  );

/** Publica un negocio ficticio con su enlace de gestión vigente. */
async function altaPublicadaConEnlace(
  whatsapp: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
  const token = generarTokenGestion();
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Panadería Ficticia El Trigal",
      categoriaId,
      coloniaId,
      whatsapp,
      queOfreces: "Pan dulce inventado",
      direccion: "Calle inventada 12",
      horario: "L-D 7am-9pm",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      estado: ESTADO_NEGOCIO_PUBLICADO,
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
    nombre: "Panadería Ficticia El Trigal",
    categoriaId: String(categoriaId),
    whatsapp: `${PREFIJO}001`,
    coloniaId: String(coloniaId),
    coloniaOtra: "",
    queOfreces: "Pan dulce inventado",
    telefonoFijo: "",
    direccion: "Calle inventada 12",
    horario: "L-D 7am-9pm",
    facebookUrl: "",
    ...cambios,
  };
  for (const [clave, valor] of Object.entries(base)) datos.set(clave, valor);
  return datos;
}

const contexto = (ip: string | null = IP) => ({ prisma, ip, ahora: AHORA });

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "restaurantes-y-fondas" } })
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
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_ENCABEZADO_IP] = ENCABEZADO_IP;
  peticion.encabezados[ENCABEZADO_IP] = IP;
});

afterEach(() => {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_ENCABEZADO_IP];
});

// ── 1. El token como segmento de URL hostil ─────────────────────────────────
//
// El token es lo único que separa a un desconocido de los datos de contacto
// completos de un negocio y de la capacidad de proponerle cambios a su ficha.
// Todo lo que no sea EXACTAMENTE el token vigente tiene que morir antes de
// llegar a la base, y morir igual: mismo 404, sin excepciones del motor.

describe("adversarial · el token: formas hostiles del segmento de URL", () => {
  /** Cliente que grita si alguien le pregunta a la base. */
  function clienteQueNoDebeConsultarse() {
    const consultas: unknown[] = [];
    return {
      consultas,
      negocio: {
        findUnique: async (args: unknown) => {
          consultas.push(args);
          return null;
        },
      },
    };
  }

  const BASURA: Array<[string, string]> = [
    ["vacío", ""],
    ["un espacio", " "],
    ["42 caracteres (uno de menos)", "A".repeat(42)],
    ["44 caracteres (uno de más)", "A".repeat(44)],
    ["con un salto de línea pegado", `${"A".repeat(43)}\n`],
    ["con un retorno de carro pegado", `${"A".repeat(43)}\r`],
    ["con un espacio pegado", `${"A".repeat(42)} `],
    ["con un byte nulo", `${"A".repeat(42)}\u0000`],
    ["con una barra (otra ruta)", `${"A".repeat(21)}/${"A".repeat(21)}`],
    ["con un punto (extensión)", `${"A".repeat(39)}.php`],
    ["con base64 clásico (+ / =)", `${"A".repeat(40)}+/=`],
    ["con un carácter de ancho completo", `${"A".repeat(42)}Ａ`],
    ["con un emoji", `${"A".repeat(41)}🙂`],
    ["con un porciento sin decodificar", `${"A".repeat(40)}%41`],
    ["una travesía de directorios", "../../admin/cola"],
    ["100 KB de basura", "A".repeat(100_000)],
    ["comillas y ángulos", `${"A".repeat(39)}"<>'`],
    ["un carácter de control", `${"A".repeat(42)}\u0007`],
  ];

  it.each(BASURA)(
    "un token %s no llega ni a preguntarle a la base",
    async (_etiqueta, candidato) => {
      const cliente = clienteQueNoDebeConsultarse();

      await expect(
        negocioDelToken(cliente, candidato, ESTADO_NEGOCIO_PUBLICADO),
      ).resolves.toBeNull();
      // Que la forma se filtre ANTES es lo que impide que un `%00` en la URL
      // convierta un 404 en un 500 del motor (PostgreSQL aborta con 22021
      // cualquier consulta con un byte nulo, ver src/lib/texto.ts).
      expect(cliente.consultas).toHaveLength(0);
      expect(pareceToken(candidato)).toBe(false);
    },
  );

  it("un token bien formado pero inventado sí consulta, y también responde null", async () => {
    const cliente = clienteQueNoDebeConsultarse();
    const inventado = generarTokenGestion();

    await expect(
      negocioDelToken(cliente, inventado, ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();
    expect(cliente.consultas).toHaveLength(1);
    // Y lo que viajó a la base fue la HUELLA, nunca el token.
    expect(JSON.stringify(cliente.consultas[0])).not.toContain(inventado);
    expect(JSON.stringify(cliente.consultas[0])).toContain(huellaDeToken(inventado));
  });

  it.each([
    ["cambiando la caja de una letra", (t: string) => cambiarCaja(t)],
    ["cambiando `-` por `_`", (t: string) => t.replace("-", "_")],
    ["invirtiéndolo", (t: string) => [...t].reverse().join("")],
  ])("el token vigente %s ya no abre nada", async (_etiqueta, romper) => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}001`);
    const alterado = romper(token);

    // Si la mutación no cambió nada (token sin `-`, palíndromo) no hay caso.
    if (alterado === token) return;
    await expect(
      negocioDelToken(prisma, alterado, ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();
    await expect(abrirEdicion(alterado)).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("la huella guardada en la base no sirve como token", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}002`);
    const huella = huellaDeToken(token);

    // Quien se lleve un respaldo tiene la huella; con ella no abre nada.
    await expect(
      negocioDelToken(prisma, huella, ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();
    await expect(abrirEdicion(huella)).rejects.toBeInstanceOf(NoEncontradoSimulado);
  });

  it("una huella vacía en la fila no abre con un token vacío", async () => {
    // `timingSafeEqual` de dos buffers vacíos devuelve `true`: si la
    // resolución no cortara antes por la falsedad de la columna, una fila con
    // la huella en blanco abriría con cualquier cosa que hashee a "".
    expect(huellasIguales("", "")).toBe(true);

    const { id } = await altaPublicadaConEnlace(`${PREFIJO}003`);
    await prisma.negocio.update({ where: { id }, data: { tokenGestionHash: "" } });

    await expect(negocioDelToken(prisma, "", ESTADO_NEGOCIO_PUBLICADO)).resolves.toBeNull();
    await expect(
      negocioDelToken(prisma, generarTokenGestion(), ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();
  });

  it("huellas de distinta longitud se comparan sin lanzar", () => {
    // `timingSafeEqual` LANZA si los buffers no miden lo mismo: sin la guarda
    // de longitud, una huella truncada en la base sería un 500.
    expect(() => huellasIguales("a".repeat(64), "a".repeat(63))).not.toThrow();
    expect(huellasIguales("a".repeat(64), "a".repeat(63))).toBe(false);
    expect(huellasIguales("", "a")).toBe(false);
  });

  it("un token que no abre nada tampoco delata nada en el HTML del 404", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}004`);
    // Los tres casos que la spec exige indistinguibles terminan en la MISMA
    // excepción, que es lo que produce el mismo `not-found.tsx` del sitio.
    const inventado = generarTokenGestion();
    const malFormado = "esto-no-es-un-token";

    await expect(abrirEdicion(inventado)).rejects.toBeInstanceOf(NoEncontradoSimulado);
    await expect(abrirEdicion(malFormado)).rejects.toBeInstanceOf(NoEncontradoSimulado);
    // …y el vigente sí abre, para que el test no pase por vacío.
    expect(await abrirEdicion(token)).toContain("Edita tu ficha");
  });
});

function cambiarCaja(token: string): string {
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    const otra = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
    if (otra !== c) return token.slice(0, i) + otra + token.slice(i + 1);
  }
  return token;
}

// ── 2. Mass assignment y entradas hostiles en el envío de edición ───────────

describe("adversarial · el envío de edición no puede fijar lo que no le toca", () => {
  it("ni un solo campo prohibido llega a la fila de la edición", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}010`);
    const otro = await altaPublicadaConEnlace(`${PREFIJO}011`);

    const hostil = envio({ nombre: "Panadería Ficticia Renombrada" });
    // Todo lo que un atacante intentaría colar en un POST a pelo.
    for (const campo of CAMPOS_PROHIBIDOS_EN_EDICION) hostil.set(campo, "1");
    hostil.set("id", "identificador-elegido-por-el-cliente");
    hostil.set("negocioId", otro.id);
    hostil.set("negocio", otro.id);
    hostil.set("creadaEn", "1999-01-01T00:00:00.000Z");
    hostil.set("resueltaEn", "1999-01-01T00:00:00.000Z");
    hostil.set("motivoDescarte", "me lo descarto yo solito");
    hostil.set("estado", "aplicada");
    hostil.set("consentimiento", "on");

    await expect(procesarEdicion(token, hostil, contexto())).resolves.toEqual({ exito: true });

    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    // Se ató al negocio DEL TOKEN, no al que venía en el cuerpo.
    expect(edicion.negocioId).toBe(id);
    expect(edicion.id).not.toBe("identificador-elegido-por-el-cliente");
    expect(edicion.estado).toBe(ESTADO_EDICION_PENDIENTE);
    expect(edicion.creadaEn.toISOString()).toBe(AHORA.toISOString());
    expect(edicion.resueltaEn).toBeNull();
    expect(edicion.motivoDescarte).toBeNull();
    // Y el otro negocio no tiene ninguna edición a su nombre.
    expect(
      await prisma.edicionPendiente.count({ where: { negocioId: otro.id } }),
    ).toBe(0);

    // La ficha del token tampoco se movió: ni su estado, ni su enlace.
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.estado).toBe(ESTADO_NEGOCIO_PUBLICADO);
    expect(ficha.nombre).toBe("Panadería Ficticia El Trigal");
    expect(ficha.tokenGestionHash).toBe(huellaDeToken(token));
    expect(ficha.consintioAvisoEn).not.toBeNull();
  });

  it.each([
    ["javascript:", "javascript:alert(document.cookie)"],
    ["data:", "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="],
    ["vbscript:", "vbscript:msgbox(1)"],
    ["file:", "file:///etc/passwd"],
    ["sin esquema (//host)", "//evil.example/perfil"],
    ["con credenciales incrustadas", "https://facebook.com@evil.example/perfil"],
  ])("una página %s se rechaza y no queda ninguna edición", async (_e, url) => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}012`);

    const resultado = await procesarEdicion(token, envio({ facebookUrl: url }), contexto());

    expect(resultado).toMatchObject({ exito: false });
    if (!resultado.exito && !resultado.noEncontrado) {
      expect(resultado.estado.errores.facebookUrl).toBe(
        MENSAJES_ERROR_REGISTRO.facebookUrl,
      );
    }
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  it("un campo de 100 KB rebota y no se devuelve entero al navegador", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}013`);
    const enorme = "ñ".repeat(100_000);

    const resultado = await procesarEdicion(token, envio({ nombre: enorme }), contexto());

    expect(resultado).toMatchObject({ exito: false });
    if (!resultado.exito && !resultado.noEncontrado) {
      expect(resultado.estado.errores.nombre).toBeDefined();
      // Amplificación cerrada: el eco vuelve recortado, no los 100 KB.
      expect(resultado.estado.valores.nombre.length).toBeLessThan(1000);
    }
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  it.each([
    ["dígitos arábigo-índigos", "٧٧١٠٠٠٨٠٠١"],
    ["dígitos de ancho completo", "７７１０００８００１"],
    ["letras que se parecen a dígitos", "77lOOO8OO1"],
  ])("un WhatsApp con %s no se acepta ni se guarda", async (_e, numero) => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}014`);

    const resultado = await procesarEdicion(token, envio({ whatsapp: numero }), contexto());

    expect(resultado).toMatchObject({ exito: false });
    expect(await prisma.edicionPendiente.count({ where: { negocioId: id } })).toBe(0);
  });

  it.each([
    ["un byte nulo en medio", `771000\u00008009`],
    ["marcas de dirección invisibles", "\u202e7710008009\u202c"],
    ["separadores y lada de país", "+52 (771) 000-8009"],
  ])(
    "un WhatsApp con %s se guarda normalizado a 10 dígitos y nada más",
    async (_e, numero) => {
      const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}014`);

      await expect(
        procesarEdicion(token, envio({ whatsapp: numero }), contexto()),
      ).resolves.toEqual({ exito: true });

      const edicion = await prisma.edicionPendiente.findFirstOrThrow({
        where: { negocioId: id },
      });
      // Lo que llega a la base son puros dígitos: ni el byte nulo (que
      // PostgreSQL rechaza) ni las marcas invisibles sobreviven al
      // normalizador, así que el número tampoco puede reventar la consulta.
      expect(edicion.whatsapp).toBe(`${PREFIJO}009`);
      expect(edicion.whatsapp).toMatch(/^\d{10}$/);
    },
  );

  /**
   * HALLAZGO BAJO — el byte nulo en un campo de texto libre de la edición.
   *
   * PostgreSQL aborta con 22021 cualquier `INSERT` que lleve `\u0000` en una
   * columna de texto, y `validarRegistro` no lo filtra (solo lo hacen los
   * bordes que ya arregló la etapa C de `preparar-deploy-produccion`:
   * comentario del reporte, motivos del panel y URL de ficha).
   *
   * Lo que este test fija es lo que de verdad importa: pase lo que pase, el
   * dueño NO se lleva una excepción sin manejar (un 500), la edición que ya
   * tenía esperando sigue intacta y ningún detalle técnico se le enseña. Vale
   * tanto si el envío se guarda (byte nulo filtrado en el borde, que es el
   * arreglo sugerido) como si rebota con el literal de "no pudimos guardar".
   */
  it("[B1] un byte nulo en el nombre no revienta el envío ni pierde lo anterior", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}015`);
    await procesarEdicion(token, envio({ horario: "L-V 9am-2pm" }), contexto());
    const previa = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });

    const resultado = await procesarEdicion(
      token,
      envio({ nombre: "Panadería\u0000 Ficticia" }),
      contexto(),
    );

    if (resultado.exito) {
      // Se guardó: entonces el byte nulo se filtró en el borde.
      const nueva = await prisma.edicionPendiente.findFirstOrThrow({
        where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
      });
      expect(nueva.nombre).not.toContain("\u0000");
    } else {
      expect(resultado.noEncontrado).toBeFalsy();
      if (!resultado.noEncontrado) {
        expect(resultado.estado.errores.general).toBe(ERROR_GUARDAR_EDICION);
        // Sin detalles técnicos del motor en lo que ve el dueño.
        expect(JSON.stringify(resultado.estado)).not.toMatch(/22021|PostgresError|prisma/i);
      }
      // Y su edición anterior sigue en pie: la transacción no la sacrificó.
      const sigue = await prisma.edicionPendiente.findUniqueOrThrow({
        where: { id: previa.id },
      });
      expect(sigue.estado).toBe(ESTADO_EDICION_PENDIENTE);
      expect(sigue.horario).toBe("L-V 9am-2pm");
    }
  });

  it("el cupo por IP no se elude anteponiendo saltos falsos al encabezado", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}016`);

    // Tres envíos legítimos desde el proxy de confianza agotan el cupo.
    for (const horario of ["L-V 8am", "L-V 9am", "L-V 10am"]) {
      await procesarEdicion(token, envio({ horario }), contexto());
    }

    // El atacante inventa saltos a la izquierda para estrenar clave de cupo:
    // el último valor lo pone el proxy y es el que cuenta.
    const { headers } = await import("next/headers");
    peticion.encabezados[ENCABEZADO_IP] = `10.0.0.1, 192.0.2.99, ${IP}`;
    const { ipDeEncabezados } = await import("../src/lib/registro/limite-ip");
    const ip = ipDeEncabezados(await headers());
    expect(ip).toBe(IP);

    const resultado = await procesarEdicion(token, envio({ horario: "L-V 11am" }), {
      prisma,
      ip,
      ahora: AHORA,
    });
    expect(resultado).toMatchObject({ exito: false });

    // Y la pendiente sigue siendo la tercera, no la del cuarto intento.
    const pendiente = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });
    expect(pendiente.horario).toBe("L-V 10am");
  });
});

// ── 3. Lo que una edición aplicada le hace a la ficha pública ───────────────

describe("adversarial · texto hostil que entra por la edición y sale por la ficha", () => {
  it("un nombre con HTML y un `</script>` se escapan en la ficha y en el JSON-LD", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}020`);
    const hostil = '</script><img src=x onerror="alert(1)">Panadería «Ficticia»';

    await procesarEdicion(
      token,
      envio({ nombre: hostil, queOfreces: '<script>alert("xss")</script>' }),
      contexto(),
    );
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    await expect(aplicarEdicion(prisma, edicion.id, AHORA)).resolves.toMatchObject({
      resultado: "aplicada",
    });

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    const html = await render(
      FichaNegocioPage({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(negocio.nombre, negocio.id),
        }),
        searchParams: Promise.resolve({}),
      } as Parameters<typeof FichaNegocioPage>[0]),
    );

    // Ni una etiqueta viva: React escapa el texto…
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;img src=x");
    // …y el bloque de datos estructurados escapa el `<`, así que el
    // `</script>` del nombre no puede cerrar el `<script type=ld+json>`.
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    // El único `</script>` literal del HTML es el cierre real de la etiqueta.
    expect(html.split("</script>")).toHaveLength(2);
  });

  it("aplicar una edición no reabre la ficha a un enlace externo sin rel", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}021`);
    await procesarEdicion(
      token,
      envio({ facebookUrl: "https://m.facebook.example/pagina-inventada" }),
      contexto(),
    );
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    await aplicarEdicion(prisma, edicion.id, AHORA);

    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    const html = normalizado(
      await render(
        FichaNegocioPage({
          params: Promise.resolve({
            ficha: construirSegmentoFicha(negocio.nombre, negocio.id),
          }),
          searchParams: Promise.resolve({}),
        } as Parameters<typeof FichaNegocioPage>[0]),
      ),
    );

    expect(html).toContain("m.facebook.example");
    expect(html).toContain('rel="noopener noreferrer"');
    // Y la ficha pública sigue sin mencionar el modo edición ni la huella.
    expect(html).not.toContain("/editar/");
    expect(html).not.toContain(huellaDeToken(token));
  });
});

// ── 4. Transiciones ilegales y concurrencia del panel ───────────────────────

describe("adversarial · una edición no puede mover una ficha que ya no está publicada", () => {
  /**
   * HALLAZGO MEDIO 1 — CERRADO EN LA ITERACIÓN 2. Este test pasa de tolerar
   * las dos formas a **fijar la corregida**.
   *
   * Antes, `aplicarEdicion` cerraba la edición y DESPUÉS escribía el negocio
   * condicionado a `publicado`: si el admin despublicaba en otra pestaña, la
   * edición quedaba `aplicada` sin haber llegado nunca a la ficha, los cambios
   * del dueño se perdían para siempre y el panel decía "Listo, la ficha ya se
   * actualizó" ofreciendo avisarle al negocio. Ahora el orden está invertido
   * (`src/lib/gestion/ediciones.ts`): primero la ficha, y la edición solo se
   * cierra si esa escritura afectó una fila.
   *
   * (Despublicar devuelve la ficha a `en_revision`, no a un estado propio:
   * `src/lib/admin/transiciones.ts`.)
   */
  it("[M1] si la ficha ya no está publicada no se aplica nada y la edición sigue esperando", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}030`);
    await procesarEdicion(
      token,
      envio({ nombre: "Panadería Ficticia Resucitada", horario: "24 horas" }),
      contexto(),
    );
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    // Otra pestaña despublica mientras el admin miraba la comparación.
    await despublicarFicha(prisma, id, "Solicitud del propio negocio", AHORA);

    const resultado = await aplicarEdicion(prisma, edicion.id, AHORA);

    // El desenlace es HONESTO: dice que no se aplicó, no lo contrario.
    expect(resultado).toEqual({ resultado: "ficha-no-publicada" });

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    // La ficha no vuelve al directorio y conserva SUS datos.
    expect(ficha.estado).not.toBe(ESTADO_NEGOCIO_PUBLICADO);
    expect(ficha.despublicadoEn).not.toBeNull();
    expect(ficha.nombre).toBe("Panadería Ficticia El Trigal");
    expect(ficha.horario).toBe("L-D 7am-9pm");

    // Y el enlace de gestión de una ficha despublicada deja de abrir.
    await expect(
      negocioDelToken(prisma, token, ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();

    // LO QUE ARREGLA EL HALLAZGO: los cambios del dueño NO se perdieron.
    const releida = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(releida.estado).toBe(ESTADO_EDICION_PENDIENTE);
    expect(releida.resueltaEn).toBeNull();
  });

  it("[M1] y al volver a publicar la ficha, esos mismos cambios sí se aplican", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}038`);
    await procesarEdicion(token, envio({ horario: "24 horas" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    await despublicarFicha(prisma, id, "Motivo inventado de la prueba", AHORA);
    await aplicarEdicion(prisma, edicion.id, AHORA);
    // El admin la vuelve a publicar (aquí, directo: lo que importa es el
    // estado, no por qué transición llegó).
    await prisma.negocio.update({
      where: { id },
      data: { estado: ESTADO_NEGOCIO_PUBLICADO },
    });

    await expect(aplicarEdicion(prisma, edicion.id, AHORA)).resolves.toMatchObject({
      resultado: "aplicada",
    });
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.horario).toBe("24 horas");
  });

  /**
   * HALLAZGO MEDIO 1b — CERRADO EN LA ITERACIÓN 2. `obtenerColaDeRevision`
   * deduplica: una edición no abre renglón si su negocio ya está en la cola
   * por sí mismo. Antes el mismo negocio ocupaba dos renglones —"Alta nueva" y
   * "Edición"— y el segundo llevaba justo al callejón del M1.
   */
  it("[M1b] un negocio bajado con edición pendiente ocupa UN solo renglón", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}037`);
    await procesarEdicion(token, envio({ horario: "Solo fines de semana" }), contexto());
    await despublicarFicha(prisma, id, "Motivo inventado de la prueba", AHORA);

    const { obtenerColaDeRevision } = await import("../src/lib/admin/consultas");
    const cola = await obtenerColaDeRevision(prisma, AHORA);
    const suyos = cola.filter((fila) => fila.nombre === "Panadería Ficticia El Trigal");

    expect(suyos).toHaveLength(1);
    // Y el renglón que queda es la ficha bajada, que es lo que el admin tiene
    // que resolver primero: la edición no se puede aplicar hasta entonces.
    expect(suyos[0].tipo).toBe("alta");
    expect(suyos[0].hrefDetalle).toBe(`/admin/registros/${id}`);

    // La edición no se tocó ni se perdió: sigue esperando su turno.
    const pendiente = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    expect(pendiente.estado).toBe(ESTADO_EDICION_PENDIENTE);

    // Y al volver la ficha al directorio, reaparece como "Edición".
    await prisma.negocio.update({
      where: { id },
      data: { estado: ESTADO_NEGOCIO_PUBLICADO },
    });
    const despues = (await obtenerColaDeRevision(prisma, AHORA)).filter(
      (fila) => fila.nombre === "Panadería Ficticia El Trigal",
    );
    expect(despues).toHaveLength(1);
    expect(despues[0].tipo).toBe("edicion");
    expect(despues[0].hrefDetalle).toBe(`/admin/ediciones/${pendiente.id}`);
  });
  /**
   * REGRESIÓN DE LA ITERACIÓN 2 — la otra mitad del orden invertido.
   *
   * Escribir la ficha ANTES de cerrar la edición abre una ventana nueva: si la
   * edición deja de ser la pendiente **dentro** de la transacción (el dueño
   * mandó otros cambios en ese instante), la ficha ya quedó escrita con lo
   * VIEJO. El código lanza un centinela para que la transacción revierta esa
   * escritura; este test comprueba que la excepción **sale** de la función que
   * corre dentro de `$transaction` —que es lo único que provoca el ROLLBACK— y
   * que el desenlace no es "aplicada".
   *
   * Se ejercita con un cliente de juguete, no contra la base, porque lo que se
   * mide es el contrato con la transacción: que aborte, no que Postgres sepa
   * abortar.
   */
  it("[R1] si la edición deja de ser la pendiente dentro de la transacción, se aborta", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}039`);
    await procesarEdicion(token, envio({ horario: "Lo viejo" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    let fichaEscrita = false;
    let transaccionAbortada = false;
    const cliente = {
      edicionPendiente: {
        findUnique: (args: unknown) => prisma.edicionPendiente.findUnique(args as never),
        findFirst: (args: unknown) => prisma.edicionPendiente.findFirst(args as never),
        create: (args: unknown) => prisma.edicionPendiente.create(args as never),
        updateMany: async () => ({ count: 0 }),
      },
      negocio: {
        findFirst: (args: unknown) => prisma.negocio.findFirst(args as never),
        updateMany: async () => ({ count: 1 }),
      },
      async $transaction<T>(operacion: (tx: unknown) => Promise<T>): Promise<T> {
        const tx = {
          // Dentro de la transacción: la ficha SÍ se escribe…
          negocio: {
            updateMany: async () => {
              fichaEscrita = true;
              return { count: 1 };
            },
          },
          // …y la edición ya no es la pendiente (el dueño la reemplazó).
          edicionPendiente: { updateMany: async () => ({ count: 0 }) },
        };
        try {
          return await operacion(tx);
        } catch (error) {
          // Esto es lo que hace un ROLLBACK de verdad: la escritura de la
          // ficha se deshace y el error sube.
          transaccionAbortada = true;
          throw error;
        }
      },
    };

    const resultado = await aplicarEdicion(cliente as never, edicion.id, AHORA);

    expect(fichaEscrita).toBe(true);
    // Sin esta excepción, la ficha se habría quedado escrita con lo viejo.
    expect(transaccionAbortada).toBe(true);
    expect(resultado.resultado).not.toBe("aplicada");
    expect(["reemplazada", "ya-resuelta", "no-encontrada"]).toContain(resultado.resultado);
  });

  it("[R1] una edición reemplazada por el dueño no escribe lo viejo en la ficha", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}046`);
    await procesarEdicion(token, envio({ horario: "Lo viejo" }), contexto());
    const vieja = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });
    // El dueño manda otros cambios: la anterior deja de ser la pendiente.
    await procesarEdicion(token, envio({ horario: "Lo nuevo" }), contexto());

    const resultado = await aplicarEdicion(prisma, vieja.id, AHORA);

    expect(resultado).toEqual({ resultado: "reemplazada" });
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    // Ni lo viejo ni lo nuevo: no se aplicó nada.
    expect(ficha.horario).toBe("L-D 7am-9pm");
    const nueva = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });
    expect(nueva.horario).toBe("Lo nuevo");
  });

  it("una edición ya descartada no se puede aplicar después", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}031`);
    await procesarEdicion(token, envio({ horario: "Solo domingos" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    await descartarEdicion(prisma, edicion.id, "No coincide con lo verificado", AHORA);
    const resultado = await aplicarEdicion(prisma, edicion.id, AHORA);

    expect(resultado.resultado).not.toBe("aplicada");
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.horario).toBe("L-D 7am-9pm");
    // El motivo del descarte tampoco se perdió por el intento.
    const releida = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(releida.estado).toBe("descartada");
    expect(releida.motivoDescarte).toBe("No coincide con lo verificado");
  });

  it("descartar una edición ya aplicada no deshace la ficha", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}032`);
    await procesarEdicion(token, envio({ horario: "L-V 6am-3pm" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });
    await aplicarEdicion(prisma, edicion.id, AHORA);

    const resultado = await descartarEdicion(prisma, edicion.id, "Me arrepentí", AHORA);

    expect(resultado.resultado).not.toBe("descartada");
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.horario).toBe("L-V 6am-3pm");
    const releida = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(releida.estado).toBe("aplicada");
    expect(releida.motivoDescarte).toBeNull();
  });

  it("dos regeneraciones seguidas dejan UN solo enlace vivo", async () => {
    const { id, token: original } = await altaPublicadaConEnlace(`${PREFIJO}033`);

    const [uno, otro] = await Promise.all([
      regenerarEnlaceDeGestion(prisma, id, AHORA),
      regenerarEnlaceDeGestion(prisma, id, AHORA),
    ]);
    expect(uno.resultado).toBe("regenerado");
    expect(otro.resultado).toBe("regenerado");

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    const vivos = [uno, otro].filter(
      (r) => r.resultado === "regenerado" && huellaDeToken(r.token) === ficha.tokenGestionHash,
    );
    // Exactamente uno de los dos quedó escrito; el otro y el original mueren.
    expect(vivos).toHaveLength(1);
    await expect(
      negocioDelToken(prisma, original, ESTADO_NEGOCIO_PUBLICADO),
    ).resolves.toBeNull();
  });

  it("regenerar el enlace de una ficha rechazada no escribe nada", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}034`, {
      estado: "rechazado",
      publicadoEn: null,
      rechazadoEn: AHORA,
      motivoRechazo: "Motivo inventado",
    });

    await expect(regenerarEnlaceDeGestion(prisma, id, AHORA)).resolves.toEqual({
      resultado: "no-publicado",
    });
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(ficha.tokenGestionHash).toBe(huellaDeToken(token));
    expect(ficha.estado).toBe("rechazado");
  });

  it("un motivo de descarte se rechaza por longitud contando puntos de código", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}035`);
    await procesarEdicion(token, envio({ horario: "Cerrado" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    // 300 emojis = 600 unidades UTF-16, pero 300 caracteres para quien lee.
    const conEmojis = "\u{1F32E}".repeat(300);
    await expect(
      descartarEdicion(prisma, edicion.id, conEmojis, AHORA),
    ).resolves.toEqual({ resultado: "descartada" });

    const releida = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect([...(releida.motivoDescarte ?? "")]).toHaveLength(300);
  });

  it("un motivo de descarte solo con espacios y bytes nulos no descarta nada", async () => {
    const { id, token } = await altaPublicadaConEnlace(`${PREFIJO}036`);
    await procesarEdicion(token, envio({ horario: "Cerrado" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id },
    });

    await expect(
      descartarEdicion(prisma, edicion.id, " \u0000 \t\n ", AHORA),
    ).resolves.toEqual({ resultado: "error", error: "motivo" });

    const releida = await prisma.edicionPendiente.findUniqueOrThrow({
      where: { id: edicion.id },
    });
    expect(releida.estado).toBe(ESTADO_EDICION_PENDIENTE);
    expect(releida.motivoDescarte).toBeNull();
  });
});

// ── 5. Identificadores hostiles en las pantallas del panel ──────────────────

describe("adversarial · el panel con identificadores fabricados a mano", () => {
  /**
   * HALLAZGO MEDIO 2 — CERRADO EN LA ITERACIÓN 2. Este test pasa de tolerar
   * las dos formas a **fijar la corregida**.
   *
   * `obtenerEdicionParaPanel` interpolaba el `id` del `params` en un
   * `findUnique` sin filtrar el byte nulo: PostgreSQL abortaba la consulta
   * con 22021 y la pantalla respondía un **500** en vez del 404 que responde
   * con cualquier otro identificador inventado. Ahora filtra en el borde con
   * `tieneByteNulo`, el mismo criterio que `extraerIdDeSegmentoFicha` en lo
   * público (`src/lib/ficha-url.ts`).
   *
   * Exigencia de hoy: **el desenlace es `notFound()` y nada más**. Una
   * excepción del motor ya no se acepta — comprobado además por HTTP contra el
   * sitio servido: 404, el mismo código que un identificador inventado.
   */
  it.each([
    ["con un byte nulo", "clx000\u0000000000000000000"],
    ["vacío", ""],
    ["de 100 KB", "a".repeat(100_000)],
    ["con comillas de SQL", "' OR 1=1 --"],
    ["con un ángulo", "<script>"],
    ["con un salto de línea", "clx000\n000"],
  ])("[M2] un identificador de edición %s responde no encontrado", async (_e, id) => {
    conSesion();
    const { id: negocioId, token } = await altaPublicadaConEnlace(`${PREFIJO}040`);
    await procesarEdicion(token, envio({ horario: "Solo con cita" }), contexto());

    // Ni pinta nada, ni revienta: el 404 del panel, igual que con cualquier
    // otro identificador que no existe.
    await expect(
      render(
        DetalleEdicionPage({
          params: Promise.resolve({ id }),
          searchParams: Promise.resolve({}),
        } as Parameters<typeof DetalleEdicionPage>[0]),
      ),
    ).rejects.toBeInstanceOf(NoEncontradoSimulado);

    // Y la edición no se tocó.
    const pendiente = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId },
    });
    expect(pendiente.estado).toBe(ESTADO_EDICION_PENDIENTE);
  });

  it("[M2] el detalle de un REGISTRO con un byte nulo también responde no encontrado", async () => {
    // La otra puerta de la misma clase, deuda anterior al change que el dev
    // cerró en la misma pasada.
    await expect(
      obtenerRegistroParaPanel(prisma, "clx000\u0000000000000000000"),
    ).resolves.toBeNull();
  });

  it("el detalle de una edición nunca devuelve la huella ni datos internos", async () => {
    const { id: negocioId, token } = await altaPublicadaConEnlace(`${PREFIJO}041`);
    await procesarEdicion(token, envio({ horario: "L-S 7am-8pm" }), contexto());
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId },
    });

    const paraPanel = await obtenerEdicionParaPanel(prisma, edicion.id);
    const serializado = JSON.stringify(paraPanel);

    expect(serializado).not.toContain(huellaDeToken(token));
    expect(serializado).not.toContain(token);
    expect(serializado).not.toMatch(/tokenGestion/i);
    expect(serializado).not.toContain("consintioAviso");
    expect(serializado).not.toContain("publicadoEn");
  });
});

// ── 6. El sobre: el único momento en que el enlace se ve ────────────────────

describe("adversarial · el sobre del enlace en claro", () => {
  it("la cookie es httpOnly, de vida corta y no viaja fuera de /admin", () => {
    const enHttps = opcionesCookieSobre(true);

    expect(enHttps.httpOnly).toBe(true);
    expect(enHttps.path).toBe("/admin");
    expect(enHttps.sameSite).toBe("lax");
    expect(enHttps.secure).toBe(true);
    // Nada de sesiones eternas: el enlace en claro caduca solo.
    expect(enHttps.maxAge).toBeLessThanOrEqual(120);
    // En local (http) no se marca `secure` o el navegador la tiraría.
    expect(opcionesCookieSobre(false).secure).toBe(false);
  });

  it.each([
    ["sin separador", "solo-un-token-sin-punto"],
    ["vacía", ""],
    ["solo el punto", "."],
    ["sin token después del punto", "negocio-uno."],
    ["de otro negocio", "negocio-dos.token-de-otro"],
    ["con el id como prefijo de otro más largo", "negocio-uno-bis.token"],
    ["con el id vacío", ".token"],
  ])("un sobre %s no entrega ningún enlace", (_e, valor) => {
    const almacen = {
      get: () => ({ value: valor }),
      set: () => {},
    };
    expect(leerSobre(almacen, "negocio-uno")).toBeNull();
  });

  it("un sobre legítimo solo entrega el enlace de SU negocio", () => {
    const token = generarTokenGestion();
    const almacen = {
      get: () => ({ value: `negocio-uno.${token}` }),
      set: () => {},
    };
    expect(leerSobre(almacen, "negocio-uno")).toBe(token);
    expect(leerSobre(almacen, "negocio-dos")).toBeNull();
    expect(leerSobre(almacen, "")).toBeNull();
  });
});

// ── 7. La cuarta fuga del token en la URL: el script de la analítica ────────

describe("adversarial · la cuarta fuga del token (design.md §4 solo cierra tres)", () => {
  const SRC_ANALITICA = "https://cloud.umami.is/script.js";

  beforeEach(() => {
    process.env[VARIABLE_ANALITICA_SRC] = SRC_ANALITICA;
    process.env[VARIABLE_ANALITICA_ID] = "id-de-sitio-ficticio";
  });

  afterEach(() => {
    delete process.env[VARIABLE_ANALITICA_SRC];
    delete process.env[VARIABLE_ANALITICA_ID];
  });

  /**
   * HALLAZGO ALTO 1 — CERRADO EN LA ITERACIÓN 2.
   *
   * `design.md` §4 enumera las tres fugas de un secreto que viaja en la URL
   * (`Referer`, buscadores, log del servidor) y las cierra. Faltaba una
   * cuarta: `/editar/[token]` había nacido DENTRO del grupo `(publico)`, y ese
   * layout —y solo ese— inyecta el tracker de la analítica. El tracker manda
   * la RUTA de cada vista al recolector del proveedor;
   * `data-exclude-search="true"` quita la cadena de consulta, no el
   * `pathname` (`src/components/analitica/script-analitica.tsx:42`). Es decir:
   * cada vez que un dueño abría su enlace, el token completo salía del sitio
   * hacia un tercero y se quedaba en su base de datos.
   *
   * El arreglo es el mismo mecanismo con el que `/admin` quedó fuera de la
   * medición (design.md §1 de `agregar-analitica-cookieless`): la ruta vive
   * ahora en el grupo `(gestion)`, que no monta el script. La URL no cambió
   * —un grupo de rutas no es un segmento— y el marco visual tampoco, porque
   * viene del layout raíz.
   *
   * Estos tests defienden la PROPIEDAD, no la ubicación: el primero recorre la
   * cadena real de layouts que envuelve al archivo de la página, así que
   * seguirá mordiendo si mañana alguien mueve la ruta a un grupo medido, crea
   * un layout intermedio con el script, o se lo agrega al de `(gestion)`.
   */
  const RAIZ_APP = RAIZ_DE_APP;

  /**
   * El código de un archivo sin sus comentarios. Hace falta porque los propios
   * layouts EXPLICAN por qué no montan el tracker, y una búsqueda de texto
   * plano confundiría la explicación con el defecto.
   */
  function sinComentarios(codigo: string): string {
    return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  /** Los `layout.tsx` que envuelven a un archivo de página, de dentro a fuera. */
  function cadenaDeLayouts(archivoDePagina: string): string[] {
    const layouts: string[] = [];
    let carpeta = dirname(archivoDePagina);
    for (;;) {
      const layout = join(carpeta, "layout.tsx");
      if (readdirSync(carpeta).includes("layout.tsx")) layouts.push(layout);
      if (carpeta === RAIZ_APP) break;
      carpeta = dirname(carpeta);
    }
    return layouts;
  }

  it.each([
    ["la pantalla del modo edición", join(RAIZ_APP, "(gestion)/editar/[token]/page.tsx")],
    ["su confirmación", join(RAIZ_APP, "(gestion)/editar/[token]/gracias/page.tsx")],
  ])(
    "[A1] ningún layout que envuelve a %s inyecta la analítica",
    (_cual, pagina) => {
      const cadena = cadenaDeLayouts(pagina);
      // Que la cadena exista: si el recorrido no encontrara ningún layout,
      // este test pasaría por vacío y no diría nada.
      expect(cadena).toContain(join(RAIZ_APP, "layout.tsx"));
      expect(cadena).toContain(join(RAIZ_APP, "(gestion)/layout.tsx"));
      for (const layout of cadena) {
        const codigo = sinComentarios(readFileSync(layout, "utf8"));
        expect(codigo, layout).not.toMatch(/<ScriptAnalitica\b/);
        expect(codigo, layout).not.toContain("umami");
        expect(codigo, layout).not.toContain("analitica");
      }
    },
  );

  it("[A1] la pantalla del modo edición no carga ningún script de terceros", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}050`);
    const pagina = await EditarPage({
      params: Promise.resolve({ token }),
    } as Parameters<typeof EditarPage>[0]);

    const html = renderToStaticMarkup(
      createElement(LayoutGestion, { children: pagina } as never),
    );

    expect(html).toContain("Edita tu ficha");
    // Ninguna etiqueta que CARGUE a un tercero: `<script src=…>` es la que
    // mandaría la URL —y con ella el token— fuera del sitio. Se mira el `src`
    // y no cualquier `<script>` por lo mismo que el guardián del panel
    // (`tests/analitica-exclusion-admin.test.ts`): esta pantalla tiene un
    // `<form>` con Server Action, y React emite un script EN LÍNEA para
    // reproducir el envío cuando se renderiza fuera del runtime de Next. Ese
    // no sale del sitio ni lleva la URL a ningún lado.
    expect(html).not.toContain(SRC_ANALITICA);
    expect([...html.matchAll(/<script\b[^>]*\bsrc=/g)]).toHaveLength(0);
    expect(html).not.toContain("umami");
    expect(html).not.toContain("data-website-id");
  });

  it("[A1] la confirmación de la edición tampoco, y también lleva el token en la URL", () => {
    const html = renderToStaticMarkup(
      createElement(LayoutGestion, {
        children: createElement(GraciasEdicionPage),
      } as never),
    );

    // `/editar/<token>/gracias` es el destino del redirect: la ruta que el
    // navegador tiene delante al medirse sigue llevando el secreto. Aquí no
    // hay formulario, así que se puede exigir lo máximo: ni un `<script>`.
    expect(html).not.toContain(SRC_ANALITICA);
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toContain("umami");
  });

  it("[A1] el layout que sí mide sigue midiendo (el arreglo no apagó la analítica)", () => {
    const publico = readFileSync(join(RAIZ_APP, "(publico)/layout.tsx"), "utf8");
    expect(publico).toMatch(/<ScriptAnalitica\s*\/>/);

    // Y no basta con que el código lo diga: que de verdad se pinte. "Apagar la
    // analítica entera" también habría puesto los [A1] de arriba en verde, y
    // habría sido una corrección falsa — la spec `layout-base` pide que las
    // páginas públicas se midan.
    const html = renderToStaticMarkup(
      createElement(LayoutPublico, {
        children: createElement("p", null, "contenido público"),
      } as never),
    );
    expect(html).toContain("contenido público");
    expect(html).toContain(SRC_ANALITICA);
    expect(html).toContain("data-website-id");
  });
});

// ── 8. La política de referente del grupo (gestion) ─────────────────────────

describe("adversarial · el referente que sale del modo edición (iteración 2)", () => {
  /**
   * SUPERFICIE NUEVA DE LA ITERACIÓN 2, auditada aquí.
   *
   * El dev cambió `no-referrer` por `strict-origin` porque `no-referrer` hacía
   * que el navegador mandara `Origin: null` en los POST de navegación y Next
   * abortaba la Server Action: **el envío sin JavaScript respondía 500**, que
   * es justo el camino que la spec tiene prometido.
   *
   * Lo que hay que auditar es si `strict-origin` filtra algo. No: manda el
   * ORIGEN pelado, nunca la ruta — y la ruta es el secreto. Lo que NO valdría:
   *
   * - `strict-origin-when-cross-origin` (la cabecera global del sitio,
   *   `src/lib/seguridad/csp.ts`) manda la URL COMPLETA a destinos del mismo
   *   origen, y todos los enlaces de esta pantalla son del mismo origen: el
   *   token llegaría a una página medida y de ahí al tracker.
   * - `same-origin` y `unsafe-url`, por lo mismo.
   * - `origin-when-cross-origin`, igual: URL completa dentro del sitio.
   * - `no-referrer-when-downgrade` y `origin` mandan de más o rompen el POST.
   *
   * Por eso el valor se fija aquí carácter por carácter, y en el LAYOUT (que
   * cubre las pantallas que se agreguen mañana), no en cada página.
   */
  const POLITICAS_QUE_FILTRARIAN_LA_RUTA = [
    "unsafe-url",
    "same-origin",
    "strict-origin-when-cross-origin",
    "origin-when-cross-origin",
    "no-referrer-when-downgrade",
  ];

  it("el layout del grupo declara strict-origin, y ninguna política que mande la ruta", () => {
    const politica = metadataGestion.referrer;

    expect(politica).toBe("strict-origin");
    for (const mala of POLITICAS_QUE_FILTRARIAN_LA_RUTA) {
      expect(politica).not.toBe(mala);
    }
    // `no-referrer` tampoco: es correcto para la fuga pero rompe el envío sin
    // JavaScript (`Origin: null` → la Server Action aborta). Medido con curl
    // contra el sitio servido en la verificación de la etapa C.
    expect(politica).not.toBe("no-referrer");
  });

  it("la política viaja en el LAYOUT, no en cada pantalla suelta", () => {
    // Si estuviera en las páginas, una pantalla nueva del enlace de gestión
    // nacería sin ella y filtraría la ruta el día que alguien la agregue.
    const layout = readFileSync(join(RAIZ_DE_APP, "(gestion)/layout.tsx"), "utf8");
    expect(layout).toContain('referrer: "strict-origin"');

    for (const pagina of [
      "(gestion)/editar/[token]/page.tsx",
      "(gestion)/editar/[token]/gracias/page.tsx",
    ]) {
      const codigo = readFileSync(join(RAIZ_DE_APP, pagina), "utf8");
      const cuerpo = codigo.slice(codigo.lastIndexOf("\nexport const metadata"));
      expect(cuerpo, pagina).not.toMatch(/referrer:\s*"/);
      // Lo que sí siguen declarando ellas: no indexarse.
      expect(cuerpo, pagina).toContain("index: false");
    }
  });

  it("ninguna pantalla del modo edición abre un enlace externo", async () => {
    const { token } = await altaPublicadaConEnlace(`${PREFIJO}060`);
    const html = await abrirEdicion(token);

    // design.md §4: un enlace saliente mandaría el referente al destino. Con
    // `strict-origin` solo se iría el origen, pero la regla de no abrir nada
    // externo desde aquí sigue siendo la primera línea.
    const externos = [...html.matchAll(/href="(https?:)?\/\/[^"]*"/g)];
    expect(externos.map((m) => m[0])).toEqual([]);
    // Y el token no se repite en ningún href de la propia página.
    expect([...html.matchAll(/href="[^"]*"/g)].filter((m) => m[0].includes(token))).toEqual([]);
  });
});
