import { readFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { crearAlmacenLocal, directorioDeFotos } from "../src/lib/fotos/almacen";
import { esClaveFotoValida } from "../src/lib/fotos/clave";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import {
  AVISO_FOTO_NO_GUARDADA,
  MENSAJES_ERROR_FOTO,
  MENSAJES_ERROR_REGISTRO,
  TEXTO_CASILLA_SIN_FOTO,
  TEXTO_POLITICA_FOTO,
} from "../src/lib/registro/textos";
import { CAMPO_TRAMPA } from "../src/lib/registro/validacion";
import { crearClientePrueba } from "./db";
import {
  archivoDeFormulario,
  bytesDeRelleno,
  htmlDisfrazadoDeJpg,
  jpegDePrueba,
  pngBombaDePixeles,
  pngDePrueba,
  svgDePrueba,
  webpDePrueba,
} from "./fotos-fixtures";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";

// Spec: registro-negocio, requirements "El servidor solo acepta la foto si es
// una imagen real de máximo 5 MB", "La foto se guarda comprimida, sin
// metadatos y con una referencia que genera el servidor", "El reenvío tras un
// rechazo permite cambiar o quitar la foto" y "El servidor valida todos los
// campos…" (scenario "hay que volver a elegir la foto"). tasks.md #12 a #16.
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719992xxx.

const IP = "203.0.113.20"; // TEST-NET-3, reservado para documentación
const NUMERO = "7719992001";
const AHORA = new Date("2026-09-03T12:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let jpeg: Buffer;

/** Almacén real (el de las pruebas, `FOTOS_DIR`) con registro de llamadas. */
function almacenEspia() {
  const real = crearAlmacenLocal(directorioDeFotos());
  const guardadas: string[] = [];
  const borradas: string[] = [];
  return {
    guardadas,
    borradas,
    almacen: {
      async guardar(clave: string, variante: "tarjeta" | "ficha", bytes: Buffer) {
        guardadas.push(clave);
        await real.guardar(clave, variante, bytes);
      },
      leer: real.leer,
      async borrar(clave: string) {
        borradas.push(clave);
        await real.borrar(clave);
      },
    },
  };
}

async function archivosDelAlmacen(): Promise<string[]> {
  try {
    return (await readdir(directorioDeFotos())).sort();
  } catch {
    return [];
  }
}

function formulario(
  extra: Record<string, string | File> = {},
  whatsapp = NUMERO,
): FormData {
  const datos = new FormData();
  datos.set("nombre", "Plomería Ficticia La de la Foto");
  datos.set("categoriaId", String(categoriaId));
  datos.set("whatsapp", whatsapp);
  datos.set("coloniaId", String(coloniaId));
  datos.set("consentimiento", "on");
  // Campo oculto con la versión del aviso que pintó el formulario
  // (change `versionar-aviso-privacidad`): sin él, el envío se rechaza.
  datos.set(CAMPO_VERSION_AVISO, VERSION_AVISO);
  for (const [clave, valor] of Object.entries(extra)) datos.set(clave, valor);
  return datos;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;
  jpeg = await jpegDePrueba();
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  await prisma.negocio.deleteMany();
});

describe("alta con foto", () => {
  // Scenario: la foto se sirve comprimida y en dos tamaños
  // Scenario: el cliente no puede fijar la referencia de la foto
  it("guarda las dos variantes y una clave opaca que generó el servidor", async () => {
    const espia = almacenEspia();
    const resultado = await procesarRegistro(
      formulario({
        foto: archivoDeFormulario(jpeg),
        // Intento de fijar la referencia a mano (mass assignment):
        fotoClave: "https://evil.example/pixel.png",
        fotoUrl: "data:image/svg+xml,<svg onload=alert(1)>",
      }),
      { prisma, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );
    expect(resultado).toEqual({ exito: true });

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: NUMERO },
    });
    expect(esClaveFotoValida(creado.fotoClave)).toBe(true);
    expect(creado.fotoClave).not.toContain("evil.example");
    expect(creado.fotoClave).not.toContain("data:");
    expect(creado.fotoClave).not.toBe(creado.id);

    const clave = creado.fotoClave as string;
    const tarjeta = await espia.almacen.leer(clave, "tarjeta");
    const ficha = await espia.almacen.leer(clave, "ficha");
    expect(tarjeta).not.toBeNull();
    expect(ficha).not.toBeNull();
    expect((await sharp(tarjeta as Buffer).metadata()).format).toBe("webp");
    // El original no se conserva en ninguna parte: solo hay dos archivos.
    const archivos = await archivosDelAlmacen();
    expect(archivos.filter((nombre) => nombre.startsWith(clave))).toHaveLength(2);
  });

  // Scenario: registrarse sin foto / alta solo con obligatorios
  it("sin foto se guarda igual, sin error y sin archivos", async () => {
    const espia = almacenEspia();
    const resultado = await procesarRegistro(formulario(), {
      prisma,
      ip: IP,
      ahora: AHORA,
      almacen: espia.almacen,
    });

    expect(resultado).toEqual({ exito: true });
    expect(espia.guardadas).toHaveLength(0);
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: NUMERO },
    });
    expect(creado.fotoClave).toBeNull();
  });

  // Scenario: varios archivos en el mismo envío
  it("con tres archivos en el campo se queda con el primero y descarta los demás", async () => {
    const espia = almacenEspia();
    const datos = formulario();
    datos.delete("foto");
    datos.append("foto", archivoDeFormulario(jpeg, "primera.jpg"));
    datos.append("foto", archivoDeFormulario(await pngDePrueba(), "segunda.png", "image/png"));
    datos.append("foto", archivoDeFormulario(await webpDePrueba(), "tercera.webp", "image/webp"));

    expect(await procesarRegistro(datos, {
      prisma,
      ip: IP,
      ahora: AHORA,
      almacen: espia.almacen,
    })).toEqual({ exito: true });

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: NUMERO },
    });
    const archivos = await archivosDelAlmacen();
    expect(
      archivos.filter((nombre) => nombre.startsWith(creado.fotoClave as string)),
    ).toHaveLength(2);
    expect(new Set(espia.guardadas)).toEqual(new Set([creado.fotoClave]));
  });
});

describe("la foto que no cumple se rechaza con el literal de la spec", () => {
  it.each([
    ["más de 5 MB", () => bytesDeRelleno(6 * 1024 * 1024), "demasiadoGrande"],
    ["HTML disfrazado de .jpg", () => htmlDisfrazadoDeJpg(), "noEsImagen"],
    ["SVG", () => svgDePrueba(), "noEsImagen"],
    ["bomba de píxeles", () => pngBombaDePixeles(), "noEsImagen"],
  ] as const)("%s: no se guarda nada", async (_caso, generar, motivo) => {
    const espia = almacenEspia();
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(generar()) }),
      { prisma, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );

    expect(resultado).toEqual({
      exito: false,
      estado: expect.objectContaining({
        errores: { foto: MENSAJES_ERROR_FOTO[motivo] },
      }),
    });
    expect(await prisma.negocio.findUnique({ where: { whatsapp: NUMERO } })).toBeNull();
    expect(await archivosDelAlmacen()).toEqual(antes);
  });

  it("el mensaje no incluye ningún detalle técnico del archivo", async () => {
    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(htmlDisfrazadoDeJpg(), "secreto-interno.jpg") }),
      { prisma, ip: IP, ahora: AHORA },
    );
    if (resultado.exito) throw new Error("debió rechazarse");
    const mensaje = resultado.estado.errores.foto ?? "";
    expect(mensaje).toBe(MENSAJES_ERROR_FOTO.noEsImagen);
    expect(mensaje).not.toContain("secreto-interno");
    expect(mensaje).not.toContain("sharp");
  });
});

describe("el bot no paga procesamiento de imagen", () => {
  // Scenario: el bot no paga procesamiento (campo trampa)
  it("con el campo trampa lleno no se procesa ni se guarda nada", async () => {
    const espia = almacenEspia();
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ [CAMPO_TRAMPA]: "soy un bot", foto: archivoDeFormulario(jpeg) }),
      { prisma, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );

    expect(resultado).toEqual({ exito: true }); // se finge éxito, como siempre
    expect(espia.guardadas).toHaveLength(0);
    expect(await archivosDelAlmacen()).toEqual(antes);
    expect(await prisma.negocio.count()).toBe(0);
  });

  // Scenario: el bot no paga procesamiento (IP sin cupo)
  it("con la IP sin cupo no se procesa ni se guarda nada", async () => {
    const espia = almacenEspia();
    for (let i = 0; i < 3; i++) {
      await procesarRegistro(formulario({}, `771999200${i + 2}`), {
        prisma,
        ip: IP,
        ahora: AHORA,
      });
    }
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(jpeg) }),
      { prisma, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );

    if (resultado.exito) throw new Error("debió rechazarse por cupo");
    expect(resultado.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.limiteIp);
    expect(espia.guardadas).toHaveLength(0);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });

  // Scenario: sin archivos huérfanos cuando el alta falla (número duplicado)
  it("con el número ya registrado no se procesa ni queda archivo", async () => {
    await procesarRegistro(formulario(), { prisma, ip: IP, ahora: AHORA });
    reiniciarLimitePorIp();
    const espia = almacenEspia();
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(jpeg) }),
      { prisma, ip: "203.0.113.21", ahora: AHORA, almacen: espia.almacen },
    );

    if (resultado.exito) throw new Error("debió rechazarse por duplicado");
    expect(resultado.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(espia.guardadas).toHaveLength(0);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });
});

describe("sin archivos huérfanos cuando la escritura falla", () => {
  // Scenario: sin archivos huérfanos cuando el alta falla (la base falla)
  it("si el alta truena, la clave recién guardada se borra", async () => {
    const espia = almacenEspia();
    const prismaQueFalla = {
      categoria: prisma.categoria,
      colonia: prisma.colonia,
      negocio: {
        findUnique: prisma.negocio.findUnique.bind(prisma.negocio),
        count: prisma.negocio.count.bind(prisma.negocio),
        updateMany: prisma.negocio.updateMany.bind(prisma.negocio),
        create: async () => {
          throw new Error("la base se cayó (simulado)");
        },
      },
    };
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(jpeg) }),
      { prisma: prismaQueFalla, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.servidor);
    // Una sola clave (dos variantes) guardada, y esa misma clave borrada.
    expect(new Set(espia.guardadas).size).toBe(1);
    expect(espia.borradas).toEqual([espia.guardadas[0]]);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });
});

describe("reenvío tras un rechazo: cambiar, quitar o dejar la foto", () => {
  /** Ficha rechazada con foto, tal como la dejaría un rechazo del panel. */
  async function fichaRechazadaConFoto(): Promise<string> {
    const espia = almacenEspia();
    await procesarRegistro(formulario({ foto: archivoDeFormulario(jpeg) }), {
      prisma,
      ip: IP,
      ahora: AHORA,
      almacen: espia.almacen,
    });
    reiniciarLimitePorIp();
    await prisma.negocio.update({
      where: { whatsapp: NUMERO },
      data: {
        estado: "rechazado",
        rechazadoEn: AHORA,
        motivoRechazo: "Motivo ficticio de prueba",
      },
    });
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    return ficha.fotoClave as string;
  }

  // Scenario: cambiar la foto al reenviar
  it("una foto nueva reemplaza a la anterior y los archivos viejos desaparecen", async () => {
    const anterior = await fichaRechazadaConFoto();
    const espia = almacenEspia();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(await pngDePrueba(900, 700), "otra.png", "image/png") }),
      { prisma, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );
    expect(resultado).toEqual({ exito: true });

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    expect(ficha.estado).toBe("en_revision");
    expect(ficha.fotoClave).not.toBe(anterior);
    expect(esClaveFotoValida(ficha.fotoClave)).toBe(true);

    const archivos = await archivosDelAlmacen();
    expect(archivos.filter((nombre) => nombre.startsWith(anterior))).toHaveLength(0);
    expect(
      archivos.filter((nombre) => nombre.startsWith(ficha.fotoClave as string)),
    ).toHaveLength(2);
  });

  // Scenario: quitar la foto al reenviar
  it('marcando "Dejar mi ficha sin foto" la ficha queda sin foto y sin archivos', async () => {
    const anterior = await fichaRechazadaConFoto();

    const resultado = await procesarRegistro(formulario({ quitarFoto: "on" }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    expect(resultado).toEqual({ exito: true });

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    expect(ficha.fotoClave).toBeNull();
    const archivos = await archivosDelAlmacen();
    expect(archivos.filter((nombre) => nombre.startsWith(anterior))).toHaveLength(0);
  });

  // Scenario: reenvío que no toca la foto
  it("sin archivo y sin casilla, la ficha conserva exactamente la misma foto", async () => {
    const anterior = await fichaRechazadaConFoto();

    const resultado = await procesarRegistro(
      formulario({ horario: "L-S 9am-8pm (corregido)" }),
      { prisma, ip: IP, ahora: AHORA },
    );
    expect(resultado).toEqual({ exito: true });

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    expect(ficha.fotoClave).toBe(anterior);
    expect(ficha.horario).toBe("L-S 9am-8pm (corregido)");
    const archivos = await archivosDelAlmacen();
    expect(archivos.filter((nombre) => nombre.startsWith(anterior))).toHaveLength(2);
  });

  // Scenario: el reenvío con foto pasa por las mismas defensas
  it("si el admin ya resolvió la ficha, su foto anterior queda intacta y la nueva se borra", async () => {
    const anterior = await fichaRechazadaConFoto();
    // Entre la consulta y la escritura, el admin publica la ficha: el
    // `updateMany` condicionado no afecta ninguna fila.
    const espia = almacenEspia();
    const prismaConCarrera = {
      categoria: prisma.categoria,
      colonia: prisma.colonia,
      negocio: {
        findUnique: prisma.negocio.findUnique.bind(prisma.negocio),
        count: prisma.negocio.count.bind(prisma.negocio),
        create: prisma.negocio.create.bind(prisma.negocio),
        updateMany: async () => {
          await prisma.negocio.update({
            where: { whatsapp: NUMERO },
            data: { estado: "publicado", publicadoEn: AHORA },
          });
          return { count: 0 };
        },
      },
    };

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(jpeg) }),
      { prisma: prismaConCarrera, ip: IP, ahora: AHORA, almacen: espia.almacen },
    );

    if (resultado.exito) throw new Error("debió rechazarse como duplicado");
    expect(resultado.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );

    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    expect(ficha.fotoClave).toBe(anterior);
    const archivos = await archivosDelAlmacen();
    expect(archivos.filter((nombre) => nombre.startsWith(anterior))).toHaveLength(2);
    // La clave nueva se guardó y se limpió: ningún huérfano.
    expect(espia.guardadas.length).toBeGreaterThan(0);
    expect(espia.borradas).toContain(espia.guardadas[0]);
    for (const clave of espia.guardadas) {
      expect(archivos.filter((nombre) => nombre.startsWith(clave))).toHaveLength(0);
    }
  });

  it("un reenvío con foto de 6 MB no toca la ficha rechazada ni deja archivos", async () => {
    const anterior = await fichaRechazadaConFoto();
    const antes = await archivosDelAlmacen();

    const resultado = await procesarRegistro(
      formulario({ foto: archivoDeFormulario(bytesDeRelleno(6 * 1024 * 1024)) }),
      { prisma, ip: IP, ahora: AHORA },
    );

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.demasiadoGrande);
    const ficha = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO } });
    expect(ficha.estado).toBe("rechazado");
    expect(ficha.fotoClave).toBe(anterior);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });
});

describe("hay que volver a elegir la foto", () => {
  // Scenario: hay que volver a elegir la foto
  it("si el envío con foto se rechaza por otro campo, se avisa y no queda archivo", async () => {
    const espia = almacenEspia();
    const antes = await archivosDelAlmacen();
    const datos = formulario({ foto: archivoDeFormulario(jpeg) });
    datos.set("whatsapp", "12"); // WhatsApp inválido
    datos.set("horario", "L-S 9am-7pm");

    const resultado = await procesarRegistro(datos, {
      prisma,
      ip: IP,
      ahora: AHORA,
      almacen: espia.almacen,
    });

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.whatsapp).toBe(MENSAJES_ERROR_REGISTRO.whatsapp);
    expect(resultado.estado.errores.foto).toBe(AVISO_FOTO_NO_GUARDADA);
    // El resto de lo capturado sí vuelve al formulario.
    expect(resultado.estado.valores.horario).toBe("L-S 9am-7pm");
    expect(resultado.estado.valores.nombre).toBe("Plomería Ficticia La de la Foto");
    // Ni un archivo del envío rechazado.
    expect(espia.guardadas).toHaveLength(0);
    expect(await archivosDelAlmacen()).toEqual(antes);
  });

  // El orden de las defensas manda: con OTRO campo mal, la imagen ni se abre,
  // así que el aviso que corresponde es el de "vuelve a elegirla", no el de
  // contenido (que solo se puede saber después de procesar).
  it("con otro campo mal, la foto ni se procesa: se avisa que hay que reponerla", async () => {
    const datos = formulario({
      foto: archivoDeFormulario(svgDePrueba(), "logo.svg", "image/svg+xml"),
    });
    datos.set("nombre", "");

    const resultado = await procesarRegistro(datos, { prisma, ip: IP, ahora: AHORA });

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.nombre).toBe(MENSAJES_ERROR_REGISTRO.nombre);
    expect(resultado.estado.errores.foto).toBe(AVISO_FOTO_NO_GUARDADA);
  });

  // El tope de 5 MB sí se mira en la validación de campos (es un número, no una
  // imagen), así que ese mensaje gana sobre el aviso genérico.
  it("una foto de más de 5 MB conserva su mensaje aunque otro campo falle", async () => {
    const datos = formulario({
      foto: archivoDeFormulario(bytesDeRelleno(6 * 1024 * 1024)),
    });
    datos.set("nombre", "");

    const resultado = await procesarRegistro(datos, { prisma, ip: IP, ahora: AHORA });

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.nombre).toBe(MENSAJES_ERROR_REGISTRO.nombre);
    expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.demasiadoGrande);
  });

  it("sin foto en el envío no aparece el aviso", async () => {
    const datos = formulario();
    datos.set("whatsapp", "12");

    const resultado = await procesarRegistro(datos, { prisma, ip: IP, ahora: AHORA });

    if (resultado.exito) throw new Error("debió rechazarse");
    expect(resultado.estado.errores.foto).toBeUndefined();
  });
});

// tasks.md #26: los literales se comparan contra la SPEC, no contra el
// código. Se busca en todo `openspec/` para que el test siga sirviendo cuando
// el change se archive y los deltas se consoliden en `openspec/specs/`.
describe("los textos de la foto son, carácter por carácter, los de la spec", () => {
  function especificaciones(directorio: string): string {
    return readdirSync(directorio, { withFileTypes: true })
      .map((entrada) => {
        const ruta = join(directorio, entrada.name);
        if (entrada.isDirectory()) return especificaciones(ruta);
        return entrada.name.endsWith(".md") ? readFileSync(ruta, "utf8") : "";
      })
      .join("\n");
  }

  const spec = especificaciones(join(__dirname, "../openspec"));

  it.each([
    ["política del PRD §6.1", TEXTO_POLITICA_FOTO],
    ["casilla de quitar foto", TEXTO_CASILLA_SIN_FOTO],
    ["foto demasiado grande", MENSAJES_ERROR_FOTO.demasiadoGrande],
    ["foto ilegible", MENSAJES_ERROR_FOTO.noEsImagen],
    ["fallo al procesar", MENSAJES_ERROR_FOTO.errorProcesamiento],
    ["servidor sin turno para otra imagen", MENSAJES_ERROR_FOTO.servidorOcupado],
    ["aviso de foto no guardada", AVISO_FOTO_NO_GUARDADA],
  ])("%s", (_caso, literal) => {
    expect(spec).toContain(literal);
  });
});
