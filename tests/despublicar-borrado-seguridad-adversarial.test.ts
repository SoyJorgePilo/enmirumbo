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
import { borrarRegistroAccion } from "../src/app/admin/registros/[id]/accion-borrar";
import { despublicarRegistroAccion } from "../src/app/admin/registros/[id]/accion-despublicar";
import ConfirmarBorradoPage from "../src/app/admin/registros/[id]/borrar/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
  VARIABLE_URL_SITIO,
} from "../src/lib/admin/config";
import {
  contarAtrasados,
  entradaALaCola,
  obtenerColaDeRevision,
} from "../src/lib/admin/consultas";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  ETIQUETA_COLA_DESPUBLICADA,
  ETIQUETA_POR_QUE_DESPUBLICO,
} from "../src/lib/admin/textos";
import {
  LIMITE_MOTIVO_DESPUBLICACION,
  aprobarRegistro,
  borrarNegocio,
  despublicarFicha,
} from "../src/lib/admin/transiciones";
import {
  columnasDeTabla,
  consultarConPrisma,
  tablasDelEsquema,
} from "./catalogo-db";
import { crearClientePrueba } from "./db";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";

// Etapa C (seguridad y pruebas adversariales) del change
// `agregar-despublicar-y-borrado-arco`. Lo que el camino feliz no cubre:
// palabra de confirmación con unicode tramposo, carreras entre transiciones y
// el borrado, barrido de residuo en TODAS las tablas, reloj de la cola con un
// rastro imposible y escape del motivo hostil dentro del panel.
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771999 4xxx.

const CONTRASENA = "contrasena-de-prueba-nada-real";
const SECRETO = "s".repeat(LONGITUD_MINIMA_SECRETO);
const URL_SITIO = "https://necesitouno.example";
const PREFIJO = "7719994";

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let girosIds: number[];

function conSesion() {
  peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

function formulario(campos: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

let contador = 0;
/** Ficha publicada ficticia, con giros y colonia del catálogo. */
async function fichaPublicada(nombre = "Refaccionaria Ficticia La Tuerca") {
  contador += 1;
  return prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      coloniaId,
      whatsapp: `${PREFIJO}${String(contador).padStart(3, "0")}`,
      telefonoFijo: "7717774001",
      direccion: "Bodega ficticia sin número",
      consintioAvisoEn: new Date("2026-09-01T09:00:00.000Z"),
      registradoEn: new Date("2026-01-05T09:00:00.000Z"),
      estado: "publicado",
      publicadoEn: new Date("2026-08-21T12:00:00.000Z"),
      giros: { connect: girosIds.map((id) => ({ id })) },
    },
  });
}

beforeAll(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_URL_SITIO] = URL_SITIO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  girosIds = (await prisma.giro.findMany({ orderBy: { id: "asc" }, take: 3 })).map(
    (giro) => giro.id,
  );
});

afterAll(async () => {
  delete process.env[VARIABLE_CONTRASENA];
  delete process.env[VARIABLE_SECRETO_SESION];
  delete process.env[VARIABLE_URL_SITIO];
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarPeticion();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

// ── 1. La palabra de confirmación, con unicode tramposo ─────────────────────

describe("adversarial · la palabra BORRAR no se puede falsificar con unicode", () => {
  /**
   * La comparación es `trim().toUpperCase() === "BORRAR"`. Lo que se prueba
   * aquí es que "ignorar mayúsculas y espacios de sobra" no se convierta en
   * "acepta cualquier cosa que se le parezca": un homoglifo cirílico o un
   * carácter de ancho completo se leen igual en la pantalla de un celular,
   * y esta es la acción irreversible del sitio.
   */
  it.each([
    ["homoglifos cirílicos (В, О, А)", "\u0412\u041ERR\u0410R"],
    ["ancho completo", "\uFF22\uFF2F\uFF32\uFF32\uFF21\uFF32"],
    ["con espacio de ancho cero al final", "BORRAR\u200B"],
    ["con guion suave en medio", "BOR\u00ADRAR"],
    ["con un carácter nulo pegado", "BORRAR\u0000"],
    ["en negritas matemáticas", "\u{1D401}\u{1D40E}\u{1D411}\u{1D411}\u{1D400}\u{1D411}"],
    ["con acento", "BORRÁR"],
    ["con punto final", "BORRAR."],
    ["repetida", "BORRAR BORRAR"],
    ["dentro de una frase", "sí, BORRAR esta ficha"],
    ["en inglés", "DELETE"],
  ])("no borra con la palabra %s", async (_caso, escrito) => {
    const ficha = await fichaPublicada();
    conSesion();

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(ficha.id, formulario({ confirmarBorrado: escrito })),
      ),
    ).toBe(`/admin/registros/${ficha.id}/borrar?errorBorrar=palabra`);
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
  });

  /**
   * La tolerancia declarada por la spec, y nada más que ella. El U+FEFF entra
   * aquí y no en la lista de arriba porque `trim()` de JavaScript lo cuenta
   * como espacio: lo que queda es la palabra exacta, así que el desenlace es
   * el que el admin pidió al llegar a esta pantalla.
   */
  it.each([
    ["espacio duro alrededor", " borrar "],
    ["espacio irrompible alrededor", "\u00A0BORRAR\u00A0"],
    ["marca de orden de bytes al inicio", "\uFEFFBORRAR"],
    ["saltos de línea y tabulaciones", "\n\tBORRAR \r\n"],
  ])("sí borra con %s, que es solo espacio de sobra", async (_caso, escrito) => {
    const ficha = await fichaPublicada();
    conSesion();

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(ficha.id, formulario({ confirmarBorrado: escrito })),
      ),
    ).toBe("/admin/borrado-hecho?resultado=borrado");
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).toBeNull();
  });

  it("un campo de confirmación repetido no cuela la palabra buena por detrás", async () => {
    const ficha = await fichaPublicada();
    conSesion();
    const datos = new FormData();
    datos.append("confirmarBorrado", "no");
    datos.append("confirmarBorrado", "BORRAR");

    expect(
      await urlDeRedireccion(() => borrarRegistroAccion(ficha.id, datos)),
    ).toBe(`/admin/registros/${ficha.id}/borrar?errorBorrar=palabra`);
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
  });

  it("un campo de confirmación que es un archivo no borra nada", async () => {
    const ficha = await fichaPublicada();
    conSesion();
    const datos = new FormData();
    datos.set("confirmarBorrado", new File(["BORRAR"], "confirmacion.txt"));

    expect(
      await urlDeRedireccion(() => borrarRegistroAccion(ficha.id, datos)),
    ).toBe(`/admin/registros/${ficha.id}/borrar?errorBorrar=palabra`);
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
  });

  it("una palabra desmedida no truena ni borra", async () => {
    const ficha = await fichaPublicada();
    conSesion();

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(
          ficha.id,
          formulario({ confirmarBorrado: "BORRAR".repeat(20_000) }),
        ),
      ),
    ).toBe(`/admin/registros/${ficha.id}/borrar?errorBorrar=palabra`);
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
  });
});

// ── 2. Sesión inválida (no solo ausente) ────────────────────────────────────

describe("adversarial · una sesión rota tampoco despublica ni borra", () => {
  const casos = [
    ["firma alterada", () => `${Date.now() + 3_600_000}.firmaInventadaDeUnAtacante`],
    ["firmada con otro secreto", () => crearValorDeSesion("otro-secreto-cualquiera-1234567890")],
    ["ya caducada", () => crearValorDeSesion(SECRETO, new Date(Date.now() - 9 * 3_600_000))],
    ["basura", () => "no-es-una-sesion"],
  ] as const;

  it.each(casos)("con la cookie %s, el borrado no ocurre", async (_caso, valor) => {
    const ficha = await fichaPublicada();
    peticion.cookies[NOMBRE_COOKIE_SESION] = valor();

    expect(
      await urlDeRedireccion(() =>
        borrarRegistroAccion(ficha.id, formulario({ confirmarBorrado: "BORRAR" })),
      ),
    ).toBe("/admin");
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
  });

  it.each(casos)("con la cookie %s, la despublicación no ocurre", async (_caso, valor) => {
    const ficha = await fichaPublicada();
    peticion.cookies[NOMBRE_COOKIE_SESION] = valor();

    expect(
      await urlDeRedireccion(() =>
        despublicarRegistroAccion(ficha.id, formulario({ motivo: "Sin sesión válida" })),
      ),
    ).toBe("/admin");
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.despublicadoEn).toBeNull();
  });

  it("sin el panel configurado, ni una cookie bien firmada borra (fail-safe)", async () => {
    const ficha = await fichaPublicada();
    conSesion();
    const secreto = process.env[VARIABLE_SECRETO_SESION];
    delete process.env[VARIABLE_SECRETO_SESION];
    try {
      expect(
        await urlDeRedireccion(() =>
          borrarRegistroAccion(ficha.id, formulario({ confirmarBorrado: "BORRAR" })),
        ),
      ).toBe("/admin");
      expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).not.toBeNull();
    } finally {
      process.env[VARIABLE_SECRETO_SESION] = secreto!;
    }
  });
});

// ── 3. El borrado no deja residuo en NINGUNA tabla ──────────────────────────

describe("adversarial · después del borrado no queda residuo en ninguna tabla", () => {
  /**
   * Barrido agnóstico del esquema: recorre TODAS las tablas y TODAS sus
   * columnas de la base ya migrada y busca el identificador y el WhatsApp del
   * negocio borrado. A diferencia del invariante de las claves foráneas,
   * este test también caza una tabla futura que guarde el id en una columna
   * suelta (sin clave foránea declarada), que es justo la forma en que un dato
   * personal sobrevive a un borrado ARCO sin que nadie se entere.
   */
  it("ni el identificador ni el WhatsApp aparecen en ninguna columna de la base", async () => {
    const ficha = await fichaPublicada("Panadería Ficticia La Migaja");
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: {
        estado: "en_revision",
        despublicadoEn: new Date(),
        motivoDespublicacion: "El dueño ficticio pidió que la bajáramos",
      },
    });

    expect(await borrarNegocio(prisma, ficha.id)).toEqual({ resultado: "borrado" });

    const consultar = consultarConPrisma(prisma);
    const tablas = await tablasDelEsquema(consultar);
    expect(tablas.length).toBeGreaterThan(0);

    const rastros: string[] = [];
    for (const tabla of tablas) {
      for (const columna of await columnasDeTabla(consultar, tabla)) {
        const filas = await consultar(
          `SELECT 1 FROM "${tabla}" WHERE CAST("${columna}" AS TEXT) IN ($1, $2, $3) LIMIT 1`,
          ficha.id,
          ficha.whatsapp,
          "El dueño ficticio pidió que la bajáramos",
        );
        if (filas.length > 0) rastros.push(`${tabla}.${columna}`);
      }
    }

    expect(rastros, `el borrado dejó rastro en ${rastros.join(", ")}`).toEqual([]);
  });

  it("no se lleva por delante los catálogos ni a los negocios vecinos", async () => {
    const victima = await fichaPublicada("Cerrajería Ficticia Don Llavín");
    const testigo = await fichaPublicada("Tortillería Ficticia El Comal");
    const girosAntes = await prisma.giro.count();
    const coloniasAntes = await prisma.colonia.count();

    await borrarNegocio(prisma, victima.id);

    expect(await prisma.negocio.findUnique({ where: { id: testigo.id } })).not.toBeNull();
    expect(
      (
        await prisma.negocio.findUniqueOrThrow({
          where: { id: testigo.id },
          include: { giros: true },
        })
      ).giros,
    ).toHaveLength(3);
    expect(await prisma.giro.count()).toBe(girosAntes);
    expect(await prisma.colonia.count()).toBe(coloniasAntes);
  });
});

// ── 4. Carreras entre el borrado y las demás transiciones ───────────────────

describe("adversarial · carreras entre el borrado y las otras transiciones", () => {
  it("dos borrados en paralelo: uno borra, el otro dice que ya no existe, ninguno truena", async () => {
    const ficha = await fichaPublicada();

    const resultados = await Promise.all([
      borrarNegocio(prisma, ficha.id),
      borrarNegocio(prisma, ficha.id),
    ]);

    expect(resultados.map((r) => r.resultado).sort()).toEqual(["borrado", "ya-no-existe"]);
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).toBeNull();
  });

  it("despublicar y borrar en paralelo termina con la fila borrada y sin excepción", async () => {
    const ficha = await fichaPublicada();

    const [despublicacion, borrado] = await Promise.all([
      despublicarFicha(prisma, ficha.id, "Carrera contra el borrado"),
      borrarNegocio(prisma, ficha.id),
    ]);

    expect(["despublicada", "ya-no-publicada", "no-encontrado"]).toContain(
      despublicacion.resultado,
    );
    expect(borrado.resultado).toBe("borrado");
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).toBeNull();
  });

  it("una despublicación que llega después del borrado no revive nada", async () => {
    const ficha = await fichaPublicada();
    await borrarNegocio(prisma, ficha.id);

    expect(await despublicarFicha(prisma, ficha.id, "Llego tarde")).toEqual({
      resultado: "no-encontrado",
    });
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).toBeNull();
  });

  /**
   * `aprobarRegistro` escribe DOS veces: el `updateMany` condicionado y, en
   * seguida, el `update` que fija los giros (una relación no cabe en el
   * `updateMany`). Un borrado que cae justo en medio de las dos —dos pestañas
   * del admin, o una solicitud ARCO atendida mientras se aprobaba— hace que la
   * segunda escritura ya no encuentre la fila.
   *
   * Lo que este test fija como invariante es lo que no puede fallar nunca: el
   * borrado gana, la fila NO resucita y la acción no revienta (hallazgo MEDIO 1
   * de esta etapa, corregido por el dev en la iteración 2).
   */
  it("un borrado en medio de una aprobación no resucita la fila", async () => {
    const ficha = await fichaPublicada();
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: { estado: "en_revision", giros: { set: [] } },
    });

    const clienteConCarrera = {
      ...prisma,
      negocio: {
        findUnique: (args: unknown) => prisma.negocio.findUnique(args as never),
        updateMany: async (args: unknown) => {
          const resultado = await prisma.negocio.updateMany(args as never);
          // La otra pestaña borra justo entre las dos escrituras de aprobar.
          await prisma.negocio.deleteMany({ where: { id: ficha.id } });
          return resultado;
        },
        update: (args: unknown) => prisma.negocio.update(args as never),
        deleteMany: (args: unknown) => prisma.negocio.deleteMany(args as never),
      },
      giro: { findMany: (args: unknown) => prisma.giro.findMany(args as never) },
      colonia: { findUnique: (args: unknown) => prisma.colonia.findUnique(args as never) },
    };

    // Enmienda del dev (iteración 2, hallazgo MEDIO 1 de esta misma etapa):
    // antes esto lanzaba P2025 —un 500 dentro de la Server Action— y el test
    // toleraba las dos formas con un `.catch()`. Ya no hace falta tolerar
    // nada: la segunda escritura de `aprobarRegistro` distingue "la fila
    // desapareció" de un error de verdad y responde `no-encontrado`, que es lo
    // que el panel sabe convertir en un mensaje normal.
    const resultado = await aprobarRegistro(clienteConCarrera, ficha.id, {
      girosIds: girosIds.slice(0, 1),
      coloniaId: null,
      origen: "organico",
    });

    expect(resultado).toEqual({ resultado: "no-encontrado" });
    expect(await prisma.negocio.findUnique({ where: { id: ficha.id } })).toBeNull();
    const vinculos = await prisma.$queryRawUnsafe<Array<{ B: string }>>(
      `SELECT "B" FROM "_GiroToNegocio" WHERE "B" = $1`,
      ficha.id,
    );
    expect(vinculos).toEqual([]);
  });

  /**
   * El `catch` que arregló el MEDIO 1 solo puede tragarse el código exacto de
   * "el registro no existe" (`P2025`). Un `catch` más laxo —comparar por
   * mensaje, por prefijo, o dar por hecho que todo lo que sale de un `update`
   * es una fila perdida— convertiría una base caída en un "no encontrado":
   * el admin vería que su aprobación "no aplicaba" y la ficha se quedaría sin
   * publicar en silencio, que es peor que el 500 que veníamos a quitar. Estos
   * casos son los que se le parecen y NO deben tragarse.
   */
  it.each([
    ["sin código", () => new Error("la base se cayó")],
    ["con un código parecido", () => Object.assign(new Error("x"), { code: "P2025 " })],
    ["con el código en minúsculas", () => Object.assign(new Error("x"), { code: "p2025" })],
    ["con el código solo en el mensaje", () => new Error("falló algo: P2025")],
    ["que ni siquiera es un Error", () => "P2025"],
  ])("un fallo %s de la segunda escritura se propaga, no se lee como 'no-encontrado'", async (
    _caso,
    construir,
  ) => {
    const ficha = await fichaPublicada();
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: { estado: "en_revision", giros: { set: [] } },
    });

    const clienteQueFalla = {
      negocio: {
        findUnique: (args: unknown) => prisma.negocio.findUnique(args as never),
        updateMany: (args: unknown) => prisma.negocio.updateMany(args as never),
        update: () => Promise.reject(construir()),
        deleteMany: (args: unknown) => prisma.negocio.deleteMany(args as never),
      },
      giro: { findMany: (args: unknown) => prisma.giro.findMany(args as never) },
      colonia: { findUnique: (args: unknown) => prisma.colonia.findUnique(args as never) },
    };

    await expect(
      aprobarRegistro(clienteQueFalla, ficha.id, {
        girosIds: [],
        coloniaId: null,
        origen: "organico",
      }),
    ).rejects.toBeDefined();
  });

  it("dos despublicaciones en paralelo: solo una escribe el rastro", async () => {
    const ficha = await fichaPublicada();

    const resultados = await Promise.all([
      despublicarFicha(prisma, ficha.id, "Primera pestaña"),
      despublicarFicha(prisma, ficha.id, "Segunda pestaña"),
    ]);

    expect(resultados.filter((r) => r.resultado === "despublicada")).toHaveLength(1);
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(negocio.estado).toBe("en_revision");
    expect(["Primera pestaña", "Segunda pestaña"]).toContain(
      negocio.motivoDespublicacion,
    );
  });
});

// ── 5. El reloj de la cola no se puede romper con un rastro imposible ───────

describe("adversarial · el reloj de la cola ante un rastro de despublicación imposible", () => {
  it("una despublicación en el futuro no fabrica antigüedad negativa ni atrasos", async () => {
    const futuro = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const ficha = await fichaPublicada("Vidriería Ficticia El Reflejo");
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: {
        estado: "en_revision",
        despublicadoEn: futuro,
        motivoDespublicacion: "Reloj del servidor desfasado",
      },
    });

    const cola = await obtenerColaDeRevision(prisma);
    const renglon = cola.find((item) => item.id === ficha.id);

    expect(renglon).toBeDefined();
    expect(renglon!.esperaTexto).not.toMatch(/-/);
    expect(renglon!.esperaTexto).toBe("Hace menos de una hora");
    expect(renglon!.atrasado).toBe(false);
    expect(contarAtrasados(cola)).toBe(0);
  });

  it("una despublicación en el futuro manda el renglón al final, nunca arriba", async () => {
    const viejo = await prisma.negocio.create({
      data: {
        nombre: "Herrería Ficticia El Yunque",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}901`,
        consintioAvisoEn: new Date(),
        registradoEn: new Date(Date.now() - 60 * 60 * 60 * 1000),
      },
    });
    const conFuturo = await fichaPublicada("Vidriería Ficticia El Reflejo");
    await prisma.negocio.update({
      where: { id: conFuturo.id },
      data: {
        estado: "en_revision",
        despublicadoEn: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    const cola = await obtenerColaDeRevision(prisma);
    expect(cola[0].id).toBe(viejo.id);
    expect(cola[cola.length - 1].id).toBe(conFuturo.id);
  });

  it("con la despublicación exactamente igual al registro, el renglón no se marca", async () => {
    const cuando = new Date("2026-02-02T10:00:00.000Z");
    const ficha = await prisma.negocio.create({
      data: {
        nombre: "Lavandería Ficticia La Espuma",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}902`,
        consintioAvisoEn: cuando,
        registradoEn: cuando,
        despublicadoEn: cuando,
      },
    });

    const cola = await obtenerColaDeRevision(prisma);
    const renglon = cola.find((item) => item.id === ficha.id);
    expect(renglon!.vieneDeDespublicacion).toBe(false);
    expect(entradaALaCola(cuando, cuando).getTime()).toBe(cuando.getTime());
  });

  it("una despublicación anterior al registro (reenvío posterior) no manda el reloj", () => {
    const registro = new Date("2026-03-10T12:00:00.000Z");
    const despublicacion = new Date("2026-01-01T12:00:00.000Z");
    expect(entradaALaCola(registro, despublicacion).getTime()).toBe(registro.getTime());
  });
});

// ── 6. El motivo hostil vive dentro del panel, escapado ─────────────────────

describe("adversarial · el motivo de la despublicación es texto, nunca marcado vivo", () => {
  const MOTIVO_HOSTIL =
    '</textarea><img src=x onerror="alert(1)"><script>alert(2)</script> & fin';

  it("el detalle lo pinta escapado y sin ninguna etiqueta viva", async () => {
    const ficha = await fichaPublicada("Estudio Ficticio La Toma");
    conSesion();
    await urlDeRedireccion(() =>
      despublicarRegistroAccion(ficha.id, formulario({ motivo: MOTIVO_HOSTIL })),
    );

    const html = await render(
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id: ficha.id }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );

    expect(html).toContain(ETIQUETA_POR_QUE_DESPUBLICO);
    expect(html).not.toMatch(/<img\s/i);
    expect(html).not.toMatch(/<script>alert/i);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  /**
   * Enmienda del dev (iteración 2, hallazgo BAJO 3 de esta misma etapa): el
   * motivo ya NO se recorta en silencio —viajaba truncado a media palabra
   * dentro del WhatsApp del negocio—, se rechaza con error de formulario. Este
   * test conserva su intención adversarial: la cota se cuenta por PUNTOS DE
   * CÓDIGO, así que un motivo de emojis ni se parte a la mitad de un par
   * sustituto ni vale el doble de lo que se ve escrito.
   */
  it("un motivo de puros emojis se guarda entero: la cota cuenta lo que se ve, no unidades UTF-16", async () => {
    const ficha = await fichaPublicada("Nevería Ficticia El Copo");
    // 401 puntos de código pero 801 unidades UTF-16: una cota que contara
    // `.length` lo rechazaría (o lo cortaría en medio de un par sustituto).
    const motivo = `a${"😀".repeat(400)}`;
    expect([...motivo].length).toBeLessThanOrEqual(LIMITE_MOTIVO_DESPUBLICACION);
    expect(motivo.length).toBeGreaterThan(LIMITE_MOTIVO_DESPUBLICACION);

    expect(await despublicarFicha(prisma, ficha.id, motivo)).toEqual({
      resultado: "despublicada",
    });
    const guardado = (
      await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } })
    ).motivoDespublicacion!;
    expect(guardado).toBe(motivo);
    // Y lo guardado se puede volver a leer y a serializar sin excepción.
    expect(() => JSON.stringify(guardado)).not.toThrow();
    expect(guardado).not.toContain("�");
  });

  it("un motivo de emojis que sí se pasa de la cota se rechaza sin escribir nada", async () => {
    const ficha = await fichaPublicada("Paletería Ficticia La Michoacanita");
    const motivo = "😀".repeat(LIMITE_MOTIVO_DESPUBLICACION + 1);

    expect(await despublicarFicha(prisma, ficha.id, motivo)).toEqual({
      resultado: "error",
      error: "longitud",
    });
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.motivoDespublicacion).toBeNull();
  });

  it("ni el motivo ni el nombre viajan en la URL a la que redirige la despublicación", async () => {
    const ficha = await fichaPublicada("Farmacia Ficticia San Ficticio");
    conSesion();
    const motivo = "El dueño ficticio nos escribió por WhatsApp";

    const destino = await urlDeRedireccion(() =>
      despublicarRegistroAccion(ficha.id, formulario({ motivo })),
    );

    expect(destino).toBe(`/admin/registros/${ficha.id}/despublicado`);
    expect(destino).not.toContain(motivo);
    expect(destino).not.toContain("Farmacia");
    expect(destino).not.toContain(ficha.whatsapp);
  });

  it("el rechazo por longitud no escribe nada y no devuelve ni un fragmento del motivo", async () => {
    const ficha = await fichaPublicada("Boutique Ficticia La Percha");
    conSesion();
    const motivo = `El dueño ficticio nos pidió que la bajáramos ${"y lo explicó larguísimo ".repeat(
      40,
    )}`;
    expect([...motivo].length).toBeGreaterThan(LIMITE_MOTIVO_DESPUBLICACION);

    const destino = await urlDeRedireccion(() =>
      despublicarRegistroAccion(ficha.id, formulario({ motivo })),
    );

    expect(destino).toBe(`/admin/registros/${ficha.id}?errorDespublicar=longitud`);
    expect(destino).not.toContain("dueño");
    expect(destino).not.toContain("Boutique");
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(negocio.estado).toBe("publicado");
    expect(negocio.despublicadoEn).toBeNull();
    expect(negocio.motivoDespublicacion).toBeNull();
  });

  it("el error de la despublicación tampoco devuelve el texto que se escribió", async () => {
    const ficha = await fichaPublicada();
    conSesion();

    const destino = await urlDeRedireccion(() =>
      despublicarRegistroAccion(ficha.id, formulario({ motivo: "   " })),
    );
    expect(destino).toBe(`/admin/registros/${ficha.id}?errorDespublicar=motivo`);
  });
});

// ── 7. Transiciones ilegales alrededor de la despublicación ─────────────────

describe("adversarial · transiciones ilegales alrededor de la despublicación", () => {
  it("un rechazado no se puede despublicar para colarlo de nuevo a la cola", async () => {
    const ficha = await fichaPublicada();
    await prisma.negocio.update({
      where: { id: ficha.id },
      data: {
        estado: "rechazado",
        rechazadoEn: new Date("2026-08-26T11:00:00.000Z"),
        motivoRechazo: "No cumple las reglas del directorio",
      },
    });

    expect(await despublicarFicha(prisma, ficha.id, "Intento de colarla")).toEqual({
      resultado: "ya-no-publicada",
    });
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(negocio.estado).toBe("rechazado");
    expect(negocio.despublicadoEn).toBeNull();
    expect(negocio.motivoRechazo).toBe("No cumple las reglas del directorio");
  });

  it("la pantalla de confirmación del borrado no revive un registro ya borrado", async () => {
    const ficha = await fichaPublicada();
    await borrarNegocio(prisma, ficha.id);
    conSesion();

    await expect(
      render(
        ConfirmarBorradoPage({
          params: Promise.resolve({ id: ficha.id }),
          searchParams: Promise.resolve({}),
        }) as Promise<React.ReactElement>,
      ),
    ).rejects.toThrow();
    expect(await prisma.negocio.count({ where: { id: ficha.id } })).toBe(0);
  });

  it("la etiqueta de la cola no aparece en un registro que nunca estuvo publicado", async () => {
    await prisma.negocio.create({
      data: {
        nombre: "Papelería Ficticia El Clip",
        categoriaId,
        coloniaId,
        whatsapp: `${PREFIJO}903`,
        consintioAvisoEn: new Date(),
      },
    });

    const cola = await obtenerColaDeRevision(prisma);
    expect(cola.every((item) => item.vieneDeDespublicacion === false)).toBe(true);
    expect(ETIQUETA_COLA_DESPUBLICADA).toBe("Ya estaba publicada, la despublicaste");
  });
});
