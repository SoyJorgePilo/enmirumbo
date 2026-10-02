/**
 * Spec `plataforma-astro` (change `migrar-directorio-publico-astro`, T-023,
 * Fase 2b), requirement "Lo despublicado desaparece de toda superficie
 * migrada en la siguiente petición" (design.md §6). tasks.md #12.
 *
 * De punta a punta contra la SALIDA SERVIDA: un negocio publicado con foto,
 * giro y colonia aparece en sus ocho superficies; el admin lo despublica
 * (`despublicarFicha`, la misma transición del panel) y, sin reconstruir nada,
 * la siguiente petición ya no lo muestra en ninguna: la ficha responde la 404
 * dinámica y la foto el 404 vacío.
 *
 * La función corre con `NODE_ENV=development` para leer las fotos del disco de
 * la suite (ver `tests/fotos-ruta-salida.test.ts`). Datos 100% ficticios.
 */
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { despublicarFicha } from "../src/lib/admin/transiciones";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { procesarFoto } from "../src/lib/fotos/procesar";
import { crearClientePrueba } from "./db";
import { jpegDePrueba } from "./fotos-fixtures";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const NOMBRE = "Hojalatería Despublicable Inventada";
const QUE_OFRECE = "Laminado y pintura de mentiras para coches inventados.";
const WHATSAPP = "7719996401";
const MOTIVO = "Motivo ficticio que nunca debe verse en público";

let prisma: PrismaClient;
let emulador: Emulador;
let id = "";
let clave = "";

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await prisma.negocio.deleteMany({ where: { whatsapp: WHATSAPP } });
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { slug: "talleres" } });
  const colonia = await prisma.colonia.findFirstOrThrow({ where: { slug: "huitzila" } });
  clave = generarClaveFoto();
  const procesada = await procesarFoto(await jpegDePrueba(1200, 900));
  if (!procesada.ok) throw new Error(procesada.motivo);
  await almacenDeFotos().guardar(clave, "tarjeta", procesada.variantes.tarjeta);
  await almacenDeFotos().guardar(clave, "ficha", procesada.variantes.ficha);
  const creado = await prisma.negocio.create({
    data: {
      nombre: NOMBRE,
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      whatsapp: WHATSAPP,
      queOfreces: QUE_OFRECE,
      ...datosDeBusqueda(NOMBRE, QUE_OFRECE),
      estado: "publicado",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      publicadoEn: new Date("2030-01-01T10:00:00.000Z"),
      fotoClave: clave,
      giros: { connect: [{ slug: "hojalateria-y-pintura" }] },
    },
  });
  id = creado.id;
  construirSiHaceFalta();
  emulador = await levantarEmulador({
    NODE_ENV: "development",
    SITIO_URL: "https://enmirumbo.example",
    FOTOS_DIR: path.resolve(raiz, process.env.FOTOS_DIR ?? ".fotos-test"),
  });
}, 240_000);

afterAll(async () => {
  emulador?.detener();
  await prisma?.negocio.deleteMany({ where: { whatsapp: WHATSAPP } });
  await prisma?.$disconnect();
});

const ficha = () => `/negocio/${construirSegmentoFicha(NOMBRE, id)}`;
/** Las superficies del scenario que listan negocios (la home no lista ninguno). */
const listados = () => [
  "/talleres",
  "/talleres?colonia=huitzila",
  "/hojalateria-y-pintura",
  "/hojalateria-y-pintura-huitzila",
  "/buscar?q=hojalateria",
  "/sitemap.xml",
];

describe("despublicar · de punta a punta sobre la salida", () => {
  it("antes: aparece en sus superficies, y nada se queda en una caché compartida", async () => {
    for (const ruta of listados()) {
      const r = await emulador.pedir(ruta);
      expect(r.status, ruta).toBe(200);
      const cuerpo = await r.text();
      expect(cuerpo, ruta).toContain(ruta === "/sitemap.xml" ? id : NOMBRE);
      if (ruta !== "/sitemap.xml") expect(r.headers.get("cache-control"), ruta).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
    }
    // El filtro de colonias de la categoría ofrece su colonia.
    expect(await (await emulador.pedir("/talleres")).text()).toContain("?colonia=huitzila");
    const f = await emulador.pedir(ficha());
    expect(f.status).toBe(200);
    expect(await f.text()).toContain(NOMBRE);
    const foto = await emulador.pedir(`/api/foto/${clave}/ficha`);
    expect(foto.status).toBe(200);
    expect(foto.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("después de despublicar: ningún dato suyo, la ficha da la 404 dinámica y la foto el 404 vacío", async () => {
    expect((await despublicarFicha(prisma, id, MOTIVO)).resultado).toBe("despublicada");

    const prohibidos = [NOMBRE, QUE_OFRECE, WHATSAPP, clave, MOTIVO, "2030-01-01"];
    for (const ruta of ["/", ...listados()]) {
      const r = await emulador.pedir(ruta);
      const cuerpo = await r.text();
      expect(r.status, ruta).toBe(200);
      for (const dato of [...prohibidos, id]) expect(cuerpo, `${ruta} · ${dato}`).not.toContain(dato);
    }
    // Los conteos ya no lo incluyen: su colonia (sin más negocios del giro) deja el filtro.
    expect(await (await emulador.pedir("/talleres")).text()).not.toContain("?colonia=huitzila");

    const f = await emulador.pedir(ficha());
    expect(f.status).toBe(404);
    const html = await f.text();
    expect(html).toContain("No encontramos esta página");
    for (const dato of prohibidos) expect(html, dato).not.toContain(dato);

    const foto = await emulador.pedir(`/api/foto/${clave}/ficha`);
    expect(foto.status).toBe(404);
    expect(foto.headers.get("cache-control")).toBe("no-store");
    expect((await foto.arrayBuffer()).byteLength).toBe(0);
  });
});
