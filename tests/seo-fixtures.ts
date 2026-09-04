/**
 * Fixtures compartidos por las suites del change `agregar-seo-local`.
 *
 * El seed de demostración (`prisma/seed-demo.ts`) trae un solo negocio por
 * giro, y las páginas de giro necesitan casos que ese conjunto no cubre:
 *
 * - el MISMO giro en dos categorías distintas (requirement "el giro manda, no
 *   la categoría");
 * - el mismo giro en varias colonias (para probar que el filtro por colonia es
 *   real y que la navegación solo ofrece colonias con contenido);
 * - un negocio EN REVISIÓN con giros asignados (nunca debe aparecer).
 *
 * Van aquí y no en el seed de demostración porque ese conjunto es el que ve
 * cualquiera que corra `npm run db:seed:demo` y varias suites afirman sus
 * conteos. LFPDPPP + repo público: todo inventado, con la misma serie de
 * WhatsApp de prueba (`771999xxxx`) y nombres que se leen como ficticios.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";

type NegocioSeo = {
  nombre: string;
  whatsapp: string;
  categoriaSlug: string;
  coloniaSlug: string;
  estado: "publicado" | "en_revision";
  publicadoEn?: string;
  queOfreces?: string;
  /**
   * Referencia interna de la foto (T-008): la clave opaca que genera el
   * servidor, no una ruta ni una URL. Aquí va una clave fija e inventada para
   * que las aserciones de `og:image` y del JSON-LD sean estables.
   */
  fotoClave?: string;
  direccion?: string;
  telefonoFijo?: string;
  horario?: string;
  giros: string[];
};

/**
 * Clave de foto de los fixtures: 32 hexadecimales, la misma forma que genera
 * `generarClaveFoto()` (T-008). No hay archivo detrás —estas suites solo miran
 * el HTML y la metadata—, y de ella sale la URL interna
 * `/api/foto/<clave>/ficha` que se publica en `og:image` y en el JSON-LD.
 */
export const CLAVE_FOTO_SEO = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

/** Prefijo de los WhatsApp de estos fixtures (la limpieza borra `7719995*`). */
export const NEGOCIOS_SEO: NegocioSeo[] = [
  {
    // Mismo giro "plomeria" que el negocio de "Servicios del hogar" del seed,
    // pero en otra categoría: el giro manda, no la categoría.
    nombre: "Destapes El Chorrito Ficticio",
    whatsapp: "7719995020",
    categoriaSlug: "talleres",
    coloniaSlug: "atempa",
    estado: "publicado",
    publicadoEn: "2026-08-15T10:00:00.000Z",
    queOfreces: "Destape de drenajes con máquina (negocio de mentira).",
    giros: ["plomeria"],
  },
  {
    // En revisión CON giros asignados: no puede aparecer en ninguna página.
    nombre: "Plomería Fantasma en Revisión (ficticia)",
    whatsapp: "7719995021",
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "huicalco",
    estado: "en_revision",
    queOfreces: "Negocio de mentira que todavía no aprueba el admin.",
    giros: ["plomeria"],
  },
  {
    // Colonia cuyo nombre ya dice "Tizayuca": el encabezado no lo repite.
    nombre: "Plomería de Haciendas (ficticia)",
    whatsapp: "7719995022",
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "haciendas-de-tizayuca",
    estado: "publicado",
    publicadoEn: "2026-08-03T10:00:00.000Z",
    giros: ["plomeria"],
  },
  {
    // Única ocupante de la combinación `dentista` + `nacozari`, y en revisión:
    // `/dentista-nacozari` no puede mostrar ni un dato suyo (suite adversarial).
    nombre: "Dentista Fantasma en Revisión (ficticia)",
    whatsapp: "7719995024",
    categoriaSlug: "salud",
    coloniaSlug: "nacozari",
    estado: "en_revision",
    queOfreces: "Limpieza dental de mentira, todavía sin aprobar.",
    giros: ["dentista"],
  },
  {
    // Con foto (T-008 la llenará de verdad): la vista previa al compartir usa
    // la foto del negocio en vez de la imagen de marca del sitio. Trae además
    // dirección, teléfono fijo y horario, que la ficha SÍ muestra a las
    // personas y el JSON-LD NO debe publicar.
    nombre: "Panadería La Foto Ficticia",
    whatsapp: "7719995023",
    categoriaSlug: "restaurantes-y-fondas",
    coloniaSlug: "huicalco",
    estado: "publicado",
    publicadoEn: "2026-08-04T10:00:00.000Z",
    queOfreces: "Pan dulce y bolillo recién salido (negocio de mentira).",
    fotoClave: CLAVE_FOTO_SEO,
    direccion: "Calle Inventada 99, junto a la nada",
    telefonoFijo: "7717775023",
    horario: "L-D 7am-9pm",
    giros: ["panaderia"],
  },
];

/** Siembra los fixtures de SEO sobre los catálogos ya poblados. */
export async function sembrarNegociosSeo(prisma: PrismaClient): Promise<void> {
  for (const negocio of NEGOCIOS_SEO) {
    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: negocio.categoriaSlug },
    });
    const colonia = await prisma.colonia.findUniqueOrThrow({
      where: { slug: negocio.coloniaSlug },
    });
    const datos = {
      nombre: negocio.nombre,
      categoriaId: categoria.id,
      coloniaId: colonia.id,
      queOfreces: negocio.queOfreces ?? null,
      fotoClave: negocio.fotoClave ?? null,
      direccion: negocio.direccion ?? null,
      telefonoFijo: negocio.telefonoFijo ?? null,
      horario: negocio.horario ?? null,
      ...datosDeBusqueda(negocio.nombre, negocio.queOfreces),
      estado: negocio.estado,
      origen: "siembra",
      publicadoEn: negocio.publicadoEn ? new Date(negocio.publicadoEn) : null,
    };
    await prisma.negocio.upsert({
      where: { whatsapp: negocio.whatsapp },
      update: { ...datos, giros: { set: negocio.giros.map((slug) => ({ slug })) } },
      create: {
        ...datos,
        whatsapp: negocio.whatsapp,
        giros: { connect: negocio.giros.map((slug) => ({ slug })) },
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });
  }
}
