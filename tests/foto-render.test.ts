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
import { sembrarNegociosDemo } from "../prisma/seed-demo";
import ListadoCategoriaPage from "../src/app/(publico)/[destino]/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import { generarClaveFoto } from "../src/lib/fotos/clave";
import { peticion, reiniciarPeticion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

// Spec: directorio-publico (tarjeta con foto real, ficha con foto, "Solo se
// pinta la foto que generó el servidor", presupuesto de 4G) y revision-admin
// (foto en el detalle del panel). tasks.md #17 a #20.
//
// Datos 100% ficticios: los del seed de demostración más la serie 7719991xxx.

const SECRETO = "secreto-de-pruebas-larguisimo-para-firmar-1234567890";
const CATEGORIA_CON_FOTO = "clubes-y-escuelas-deportivas";
const NOMBRE_CON_FOTO = "Academia de Futbol Halcones (ficticia)";
const NOMBRE_SIN_FOTO = "Club de Natación Delfines de Mentiras";

let prisma: PrismaClient;
let claveDelSembrado: string;
let idConFoto: string;
let idSinFoto: string;
let htmlListado = "";

async function renderListado(categoria: string): Promise<string> {
  const elemento = await ListadoCategoriaPage({
    // `destino` desde T-009: el mismo segmento dinámico resuelve
    // categoría, giro y giro+colonia; la URL de la categoría no cambió.
    params: Promise.resolve({ destino: categoria }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderFicha(segmento: string): Promise<string> {
  const elemento = await FichaNegocioPage({
    params: Promise.resolve({ ficha: segmento }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

async function renderDetalleAdmin(id: string): Promise<string> {
  const elemento = await DetalleRegistroAdminPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(createElement(() => elemento));
}

beforeAll(async () => {
  process.env.PANEL_CONTRASENA = "contrasena-de-pruebas-larga-y-fea";
  process.env.PANEL_SESION_SECRETO = SECRETO;

  prisma = crearClientePrueba();
  await prisma.negocio.deleteMany();
  await seedCatalogos(prisma);
  await sembrarNegociosDemo(prisma, { NODE_ENV: "test" });

  const conFoto = await prisma.negocio.findFirstOrThrow({
    where: { nombre: NOMBRE_CON_FOTO },
  });
  const sinFoto = await prisma.negocio.findFirstOrThrow({
    where: { nombre: NOMBRE_SIN_FOTO },
  });
  claveDelSembrado = conFoto.fotoClave as string;
  idConFoto = conFoto.id;
  idSinFoto = sinFoto.id;

  htmlListado = await renderListado(CATEGORIA_CON_FOTO);
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(() => {
  reiniciarPeticion();
});

describe("listado: la tarjeta pinta la foto real y el marcador cuando no hay", () => {
  // Scenario: contenido de la tarjeta (un negocio con foto y otro sin ella)
  it("un negocio con foto y otro sin ella en el mismo listado", () => {
    expect(htmlListado).toContain(NOMBRE_CON_FOTO);
    expect(htmlListado).toContain(NOMBRE_SIN_FOTO);
    expect(htmlListado.match(/<img/g)).toHaveLength(1);
    // El que no tiene foto conserva el marcador decorativo.
    expect(htmlListado).toContain('aria-hidden="true"');
  });

  // Scenario: la foto se anuncia con el nombre del negocio
  it('la foto se anuncia como "Foto de <nombre del negocio>"', () => {
    expect(htmlListado).toContain(`alt="Foto de ${NOMBRE_CON_FOTO}"`);
  });

  // Scenario: la tarjeta no usa la foto grande
  it("el listado solo pide la variante de tarjeta, nunca la de ficha", () => {
    expect(htmlListado).toContain(`/api/foto/${claveDelSembrado}/tarjeta`);
    expect(htmlListado).not.toContain("/ficha");
    // Y nunca por la ruta del panel.
    expect(htmlListado).not.toContain("/admin/foto/");
  });

  // Scenario: el listado no descarga lo que no se ve
  it("solo la primera tarjeta carga de inmediato; el resto va diferido", () => {
    const imagenes = [...htmlListado.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    for (const imagen of imagenes) {
      // La única foto de este listado es la del primer negocio (el más
      // reciente): si alguna imagen no es la primera, va con carga diferida.
      if (!imagen.includes('fetchpriority="high"')) {
        expect(imagen).toContain('loading="lazy"');
      }
    }
  });

  // Scenario: la maquetación no salta
  it("la tarjeta reserva el mismo espacio con foto y sin foto", () => {
    // Un contenedor de proporción fija por tarjeta, idéntico en las dos: el
    // hueco de la imagen ya está reservado antes de que cargue.
    const contenedores = htmlListado.match(
      /class="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg"/g,
    );
    const tarjetas = htmlListado.match(/<article[\s>]/g);
    expect(contenedores).toHaveLength(tarjetas!.length);
    // Y la imagen se posiciona dentro de ese contenedor, no en el flujo.
    expect(htmlListado).toContain("position:absolute");
  });

  it("el HTML no trae ningún dominio externo ni optimizador con la foto", () => {
    expect(htmlListado).not.toContain("/_next/image");
    expect(htmlListado).not.toContain("http://evil");
    expect(htmlListado).not.toContain("data:image");
  });
});

describe("ficha: con foto y sin foto", () => {
  // Scenario: ficha con foto
  it("la ficha del que tiene foto la muestra en la variante grande", async () => {
    const html = await renderFicha(construirSegmentoFicha(NOMBRE_CON_FOTO, idConFoto));
    expect(html).toContain(`/api/foto/${claveDelSembrado}/ficha`);
    expect(html).toContain(`alt="Foto de ${NOMBRE_CON_FOTO}"`);
  });

  // Scenario: ficha sin foto
  it("la ficha del que no tiene foto no muestra hueco, marco ni texto de imagen", async () => {
    const html = await renderFicha(construirSegmentoFicha(NOMBRE_SIN_FOTO, idSinFoto));
    expect(html).toContain(NOMBRE_SIN_FOTO);
    expect(html).not.toContain("<img");
    // Tampoco el marcador de posición (que es un `<svg>`): en la ficha, sin
    // foto no hay bloque de imagen ninguno. El `aria-hidden` que sí aparece es
    // el "✓" del sello de verificado, que no tiene que ver con la foto.
    expect(html).not.toContain("<svg");
    expect(html.toLowerCase()).not.toContain("foto");
  });
});

describe("panel: la foto bajo el rótulo, por la dirección del panel", () => {
  beforeEach(() => {
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(SECRETO);
  });

  // Scenario: detalle completo
  it("muestra la foto del registro bajo el rótulo, pidiéndola a /admin/foto", async () => {
    const html = await renderDetalleAdmin(idConFoto);
    expect(html).toContain("Foto del negocio");
    expect(html).toContain(`/admin/foto/${claveDelSembrado}/ficha`);
    expect(html).toContain(`alt="Foto de ${NOMBRE_CON_FOTO}"`);
    // Nunca por la ruta pública: esa no serviría un registro sin publicar.
    expect(html).not.toContain(`/api/foto/${claveDelSembrado}`);
  });

  // Scenario: detalle de un registro con solo obligatorios
  it('sin foto dice "Sin foto" y no pinta ninguna imagen', async () => {
    const html = await renderDetalleAdmin(idSinFoto);
    expect(html).toContain("Foto del negocio");
    expect(html).toContain("Sin foto");
    expect(html).not.toContain("<img");
  });
});

describe("solo se pinta la foto que generó el servidor (M1 de T-004)", () => {
  const HOSTILES = [
    ["URL externa", "https://evil.example/pixel.png"],
    ["data: con SVG", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["javascript:", "javascript:alert(1)"],
    ["ruta con ..", "../../etc/passwd"],
    ["ruta absoluta", "/etc/passwd"],
    ["cadena cualquiera", "no-soy-una-clave"],
  ] as const;

  it.each(HOSTILES)(
    "%s guardada a mano: tarjeta y ficha muestran el marcador y no cargan nada",
    async (_caso, valor) => {
      const negocio = await prisma.negocio.create({
        data: {
          nombre: "Tlapalería Hostil de Mentiras",
          categoriaId: (
            await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
          ).id,
          whatsapp: "7719991001",
          consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
          estado: "publicado",
          publicadoEn: new Date("2026-08-30T10:00:00.000Z"),
          fotoClave: valor,
        },
      });

      const listado = await renderListado("talleres");
      const ficha = await renderFicha(
        construirSegmentoFicha(negocio.nombre, negocio.id),
      );

      for (const html of [listado, ficha]) {
        expect(html).not.toContain("<img");
        expect(html).not.toContain("evil.example");
        expect(html).not.toContain("data:image");
        expect(html).not.toContain("javascript:alert");
        expect(html).not.toContain("etc/passwd");
      }
      // El listado sí pinta el marcador de posición decorativo.
      expect(listado).toContain('aria-hidden="true"');

      await prisma.negocio.delete({ where: { id: negocio.id } });
    },
  );

  it("una clave con la forma correcta pero sin archivos no rompe la página", async () => {
    const clave = generarClaveFoto();
    const negocio = await prisma.negocio.create({
      data: {
        nombre: "Refaccionaria Sin Archivos (ficticia)",
        categoriaId: (
          await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
        ).id,
        whatsapp: "7719991002",
        consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
        estado: "publicado",
        publicadoEn: new Date("2026-08-30T10:00:00.000Z"),
        fotoClave: clave,
      },
    });

    const html = await renderListado("talleres");
    // Se pide la imagen (la clave es válida); que el archivo no esté es cosa
    // de la ruta, que responde 404 sin tumbar la página.
    expect(html).toContain(`/api/foto/${clave}/tarjeta`);

    await prisma.negocio.delete({ where: { id: negocio.id } });
  });
});
