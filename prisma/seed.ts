/**
 * Seed idempotente de los catálogos del directorio (PRD §6.1, Apéndices A y B).
 * Se corre con `npm run db:seed` (o `prisma db seed`). Solo datos de catálogo:
 * nunca negocios ni datos personales (repo público + LFPDPPP).
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";
import { crearClienteDeScript } from "./cliente-script";

// Las 8 categorías del formulario (PRD §6.1)
export const CATEGORIAS = [
  "Restaurantes y fondas",
  "Servicios del hogar",
  "Belleza",
  "Salud",
  "Abarrotes y comercio",
  "Talleres",
  "Clubes y escuelas deportivas",
  "Otro",
] as const;

// Colonias y fraccionamientos (PRD Apéndice A; la opción "Otra" no es una fila
// del catálogo: se modela con Negocio.coloniaOtra)
export const COLONIAS = [
  // Centro tradicional
  "Tizayuca Centro",
  "El Pedregal / Pedregal Centro",
  "Huicalco",
  "Atempa",
  "Emiliano Zapata",
  "Nacozari",
  "Olmos / Ampliación Olmos",
  "Nuevo Tizayuca",
  "El Refugio Tepojaco",
  "Huitzila",
  "Zona Industrial",
  // Fraccionamientos
  "Haciendas de Tizayuca",
  "Fuentes de Tizayuca",
  "Geovillas",
  "Rancho Don Antonio",
  "Los Héroes Tizayuca",
  "Andalucía Residencial",
  "Real Toledo",
  "Bosques de Ibiza",
  "Las Campanas",
  "El Cid",
] as const;

// Catálogo curado de giros (PRD Apéndice B; el admin asigna 1-3 al aprobar)
export const GIROS = [
  // Servicios del hogar
  "Plomería",
  "Electricidad",
  "Albañilería",
  "Herrería",
  "Carpintería",
  "Pintura",
  "Jardinería",
  "Fumigación",
  "Reparación de lavadoras y refrigeradores",
  "Cerrajería",
  "Mudanzas",
  // Restaurantes y fondas
  "Fonda / comida corrida",
  "Antojitos",
  "Tacos",
  "Pizzas",
  "Pollos",
  "Mariscos",
  "Panadería",
  "Pastelería",
  // Belleza
  "Estética",
  "Barbería",
  "Uñas",
  "Maquillaje",
  // Salud
  "Consultorio médico",
  "Dentista",
  "Farmacia",
  "Veterinaria",
  "Psicología",
  // Abarrotes y comercio
  "Abarrotes",
  "Papelería",
  "Ferretería",
  "Ropa",
  "Celulares y accesorios",
  "Florería",
  // Talleres
  "Taller mecánico",
  "Hojalatería y pintura",
  "Vulcanizadora",
  "Bicicletas",
  "Motos",
  "Electrónica",
  // Clubes y escuelas deportivas
  "Futbol",
  "Box",
  "Taekwondo / artes marciales",
  "Gimnasio",
  "Danza / zumba",
  "Natación",
  "Basquetbol",
  "Atletismo / corredores",
  "Ciclismo",
] as const;

/**
 * Puebla los tres catálogos con upsert por slug: correrlo de nuevo no cambia
 * slugs existentes ni duplica entradas (los ids se conservan).
 */
export async function seedCatalogos(prisma: PrismaClient): Promise<void> {
  for (const nombre of CATEGORIAS) {
    const slug = slugify(nombre);
    await prisma.categoria.upsert({
      where: { slug },
      update: { nombre },
      create: { nombre, slug },
    });
  }

  for (const nombre of COLONIAS) {
    const slug = slugify(nombre);
    await prisma.colonia.upsert({
      where: { slug },
      update: { nombre },
      create: { nombre, slug },
    });
  }

  for (const nombre of GIROS) {
    const slug = slugify(nombre);
    await prisma.giro.upsert({
      where: { slug },
      update: { nombre },
      create: { nombre, slug },
    });
  }
}

// Ejecución directa (`tsx prisma/seed.ts` vía `prisma db seed` / `npm run db:seed`);
// al importarse desde los tests no corre nada.
const ejecutadoDirecto = process.argv[1]?.endsWith("seed.ts") ?? false;
if (ejecutadoDirecto) {
  const prisma = crearClienteDeScript();
  seedCatalogos(prisma)
    .then(async () => {
      const conteos = {
        categorias: await prisma.categoria.count(),
        colonias: await prisma.colonia.count(),
        giros: await prisma.giro.count(),
      };
      console.log(
        `Catálogos listos: ${conteos.categorias} categorías, ${conteos.colonias} colonias, ${conteos.giros} giros.`,
      );
    })
    .catch((error) => {
      console.error("No se pudo poblar el catálogo:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
