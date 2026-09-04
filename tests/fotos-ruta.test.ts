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
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico, requirement "La foto de un negocio no publicado no
// es accesible públicamente"; revision-admin, scenario "la foto del registro en
// revisión no sale del panel". tasks.md #10.
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719993xxx.

const SECRETO = "secreto-de-pruebas-larguisimo-para-firmar-1234567890";
const BYTES = Buffer.from("bytes de una foto de mentiras");

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
const claves: Record<string, string> = {};

/**
 * Firma común de las dos rutas que sirven fotos. Se escribe a mano (en vez de
 * usar `typeof`) porque `RouteContext<'…'>` lleva la ruta en el tipo y las dos
 * no son intercambiables para TypeScript, aunque reciban lo mismo.
 */
type ManejadorDeFoto = (
  peticion: Request,
  contexto: { params: Promise<{ clave: string; variante: string }> },
) => Promise<Response>;

/** Petición a una de las dos rutas, con los parámetros que trae la URL. */
function pedir(
  ruta: ManejadorDeFoto,
  clave: string,
  variante: string,
): Promise<Response> {
  return ruta(new Request(`http://localhost/foto/${clave}/${variante}`), {
    params: Promise.resolve({ clave, variante }),
  });
}

/** Todo lo observable de una respuesta 404, para poder compararlas. */
async function huella(respuesta: Response) {
  return {
    status: respuesta.status,
    cabeceras: [...respuesta.headers.entries()].sort(),
    cuerpo: await respuesta.text(),
  };
}

async function negocioConFoto(
  nombre: string,
  whatsapp: string,
  estado: string,
): Promise<string> {
  const clave = generarClaveFoto();
  await prisma.negocio.create({
    data: {
      nombre,
      categoriaId,
      coloniaId,
      whatsapp,
      estado,
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      fotoClave: clave,
      ...(estado === "publicado" ? { publicadoEn: new Date("2026-08-02T10:00:00.000Z") } : {}),
    },
  });
  const almacen = almacenDeFotos();
  await almacen.guardar(clave, "tarjeta", BYTES);
  await almacen.guardar(clave, "ficha", BYTES);
  return clave;
}

beforeAll(async () => {
  process.env.PANEL_CONTRASENA = "contrasena-de-pruebas-larga-y-fea";
  process.env.PANEL_SESION_SECRETO = SECRETO;

  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719993" } } });
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } })
  ).id;

  claves.publicado = await negocioConFoto(
    "Cerrajería de Mentiras Publicada",
    "7719993001",
    "publicado",
  );
  claves.enRevision = await negocioConFoto(
    "Barbería de Mentiras en Revisión",
    "7719993002",
    "en_revision",
  );
  claves.rechazada = await negocioConFoto(
    "Taller de Mentiras Rechazado",
    "7719993003",
    "rechazado",
  );
  claves.inventada = generarClaveFoto();
});

afterAll(async () => {
  for (const clave of Object.values(claves)) await almacenDeFotos().borrar(clave);
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "7719993" } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  reiniciarPeticion();
});

describe("ruta pública de fotos", () => {
  // Scenario: la foto de una ficha publicada sí se sirve
  it("sirve la foto de un negocio publicado, como WebP y con caché acotada", async () => {
    const respuesta = await pedir(fotoPublica, claves.publicado, "tarjeta");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/webp");
    expect(respuesta.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await respuesta.arrayBuffer())).toEqual(BYTES);
  });

  it("sirve las dos variantes del publicado y ninguna otra", async () => {
    expect((await pedir(fotoPublica, claves.publicado, "ficha")).status).toBe(200);
    expect((await pedir(fotoPublica, claves.publicado, "original")).status).toBe(404);
    expect((await pedir(fotoPublica, claves.publicado, "../ficha")).status).toBe(404);
  });

  // Scenarios: foto de un registro en revisión / rechazado / referencia inventada
  it("las cuatro respuestas de 'no hay foto' son indistinguibles", async () => {
    const enRevision = await huella(await pedir(fotoPublica, claves.enRevision, "ficha"));
    const rechazada = await huella(await pedir(fotoPublica, claves.rechazada, "ficha"));
    const inventada = await huella(await pedir(fotoPublica, claves.inventada, "ficha"));
    const basura = await huella(await pedir(fotoPublica, "../../etc/passwd", "ficha"));

    expect(enRevision.status).toBe(404);
    expect(enRevision.cuerpo).toBe("");
    expect(rechazada).toEqual(enRevision);
    expect(inventada).toEqual(enRevision);
    expect(basura).toEqual(enRevision);
  });

  it("ni un byte de la imagen de un registro en revisión", async () => {
    const respuesta = await pedir(fotoPublica, claves.enRevision, "tarjeta");
    expect(await respuesta.arrayBuffer()).toHaveProperty("byteLength", 0);
  });

  it("la cookie de sesión no abre la ruta pública para un no publicado", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
    expect((await pedir(fotoPublica, claves.enRevision, "ficha")).status).toBe(404);
  });
});

describe("ruta del panel", () => {
  // Scenario: la foto del registro en revisión no sale del panel
  it("sin sesión responde el mismo 404 que la ruta pública", async () => {
    const delPanel = await huella(await pedir(fotoDelPanel, claves.enRevision, "ficha"));
    const publica = await huella(await pedir(fotoPublica, claves.inventada, "ficha"));
    expect(delPanel).toEqual(publica);
  });

  it("con sesión válida sirve la foto de un registro en revisión, sin caché", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
    const respuesta = await pedir(fotoDelPanel, claves.enRevision, "ficha");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await respuesta.arrayBuffer())).toEqual(BYTES);
  });

  it("una cookie con firma inventada no sirve nada", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = `${Date.now() + 100000}.firma-inventada`;
    expect((await pedir(fotoDelPanel, claves.enRevision, "ficha")).status).toBe(404);
  });

  it("con sesión, una clave inventada sigue siendo 404", async () => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
    expect((await pedir(fotoDelPanel, claves.inventada, "ficha")).status).toBe(404);
  });
});
