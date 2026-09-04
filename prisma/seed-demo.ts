/**
 * Seed de NEGOCIOS FICTICIOS para desarrollo (spec `modelo-datos`,
 * requirement "Seed de negocios ficticios para desarrollo, separado del de
 * catálogos"; design.md §6 del change `agregar-directorio-publico`).
 *
 * Se corre con `npm run db:seed:demo`, aparte del seed de catálogos: ese es
 * parte del arranque de cualquier entorno y sus conteos son solo de catálogo,
 * así que no puede traer negocios de mentira.
 *
 * LFPDPPP + repo público: TODO lo de aquí es inventado. Nombres que se leen
 * como inventados, WhatsApp de la serie reservada de pruebas `771999xxxx`,
 * teléfonos fijos `771777xxxx`, direcciones genéricas que no corresponden a
 * ningún negocio real de Tizayuca y ninguna foto.
 *
 * Idempotente por número de WhatsApp (`upsert`), así que correrlo dos veces
 * deja la base igual.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import sharp from "sharp";

import { PrismaClient } from "../src/generated/prisma/client";
import { datosDeBusqueda } from "../src/lib/busqueda";
import { almacenDeFotos, type AlmacenFotos } from "../src/lib/fotos/almacen";
import { esClaveFotoValida, generarClaveFoto } from "../src/lib/fotos/clave";
import { procesarFoto } from "../src/lib/fotos/procesar";
import type { EstadoNegocio } from "../src/lib/negocio";
import {
  type EntornoScriptDb,
  apuntaABaseLocal,
  esEntornoDeProduccion,
  normalizarValorDeEntorno,
} from "./guardas-entorno";

export type NegocioDemo = {
  nombre: string;
  /** Slug de la categoría del catálogo (`prisma/seed.ts`). */
  categoriaSlug: string;
  /** Slug de la colonia del catálogo, o `null` para el caso "Otra". */
  coloniaSlug: string | null;
  /** Texto libre de la colonia cuando no es del catálogo ("Otra"). */
  coloniaOtra?: string;
  whatsapp: string;
  estado: EstadoNegocio;
  /** Fecha fija (no `now()`) para que el orden del listado sea reproducible. */
  publicadoEn?: string;
  /** Fecha del rechazo; solo tiene sentido con estado `rechazado`. */
  rechazadoEn?: string;
  /** Motivo que escribió el admin al rechazar (ficticio). */
  motivoRechazo?: string;
  queOfreces?: string;
  entregaADomicilio?: boolean;
  telefonoFijo?: string;
  direccion?: string;
  horario?: string;
  facebookUrl?: string;
  /**
   * Slugs de giros del catálogo (`prisma/seed.ts`), como los asignaría el
   * admin al aprobar. Mientras el panel (T-005) no exista, esta es la única
   * forma de probar la búsqueda por giro (change `agregar-buscador`,
   * design.md §3).
   */
  giros?: string[];
  /**
   * Le genera una foto al vuelo (un rectángulo de color, nunca un archivo
   * versionado ni la foto de un negocio real). Sirve para ver en desarrollo
   * tanto la tarjeta con imagen como el marcador de posición del que no tiene
   * (spec `modelo-datos`, requirement "El seed de demostración deja fichas con
   * foto…").
   */
  conFoto?: boolean;
};

/**
 * El conjunto cubre a propósito los casos que el directorio necesita probar:
 * varias categorías (incluida la de deporte) y colonias, con y sin entregas a
 * domicilio, uno con todos los opcionales y otro con solo los obligatorios,
 * uno con colonia "Otra" sin normalizar, uno `en_revision` y uno `rechazado`.
 * Dos de "Servicios del hogar" comparten `publicadoEn` para dejar a la vista
 * el desempate por nombre. La categoría "Otro" se queda sin negocios para
 * poder ver el estado vacío del listado.
 *
 * Para el buscador (change `agregar-buscador`) además hay negocios con giros
 * asignados, incluida la fonda: su giro "Fonda / comida corrida" no aparece
 * ni en su nombre ni en su "¿Qué ofreces?", así que es el único que demuestra
 * de verdad que se busca por giro (design.md §3). Y hay palabras clave con
 * acentos ("Fútbol", "desparasitación") para probar la insensibilidad.
 */
export const NEGOCIOS_DEMO: NegocioDemo[] = [
  {
    nombre: "Plomería Hermanos Rosales (ficticio)",
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "huicalco",
    whatsapp: "7719995001",
    estado: "publicado",
    publicadoEn: "2026-08-01T10:00:00.000Z",
    queOfreces: "Plomería, destape de drenajes y bombas de agua.",
    entregaADomicilio: true,
    telefonoFijo: "7717775001",
    direccion: "A un lado de la primaria, calle Morelos",
    horario: "L-S 9am-7pm",
    facebookUrl: "https://www.facebook.com/plomeriaficticiatzy",
    giros: ["plomeria"],
  },
  {
    nombre: "Electricidad Rápida JR (ficticio)",
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "atempa",
    whatsapp: "7719995002",
    estado: "publicado",
    // Mismo instante que el anterior: el desempate lo decide el nombre.
    publicadoEn: "2026-08-01T10:00:00.000Z",
    queOfreces: "Instalaciones, corto circuito y centros de carga.",
    entregaADomicilio: true,
    telefonoFijo: "7717775002",
    direccion: "Calle Inventada 12, a una cuadra del parque",
  },
  {
    nombre: "Cerrajería Puerta Abierta (ficticio)",
    categoriaSlug: "servicios-del-hogar",
    coloniaSlug: "huicalco",
    whatsapp: "7719995003",
    estado: "publicado",
    // El más reciente de su categoría: encabeza el listado.
    publicadoEn: "2026-08-20T10:00:00.000Z",
  },
  {
    nombre: "Fonda Doña Cuquita (ficticia)",
    categoriaSlug: "restaurantes-y-fondas",
    coloniaSlug: "tizayuca-centro",
    whatsapp: "7719995004",
    estado: "publicado",
    publicadoEn: "2026-08-05T10:00:00.000Z",
    // Sigue siendo el negocio "solo con lo obligatorio" (sin "¿Qué ofreces?"),
    // y por eso mismo es el fixture de la búsqueda por giro: "comida" no está
    // en ninguno de sus textos, solo en el giro que le asignó el admin.
    giros: ["fonda-comida-corrida"],
  },
  {
    nombre: "Estética Glamour de Mentiras",
    categoriaSlug: "belleza",
    coloniaSlug: "haciendas-de-tizayuca",
    whatsapp: "7719995005",
    estado: "publicado",
    publicadoEn: "2026-08-06T10:00:00.000Z",
    queOfreces: "Corte, tinte, uñas y maquillaje para eventos.",
    horario: "L-S 10am-8pm",
  },
  {
    nombre: "Academia de Futbol Halcones (ficticia)",
    categoriaSlug: "clubes-y-escuelas-deportivas",
    coloniaSlug: "nuevo-tizayuca",
    whatsapp: "7719995006",
    estado: "publicado",
    publicadoEn: "2026-08-07T10:00:00.000Z",
    // Con acento a propósito: quien busca "futbol" tiene que encontrarlo.
    queOfreces: "Fútbol infantil de 6 a 12 años, martes y jueves.",
    telefonoFijo: "7717775006",
    direccion: "Cancha de la unidad deportiva (referencia inventada)",
    horario: "Ma-J 5pm-6:30pm",
    // A propósito NO es de Facebook: la ficha debe mostrar el dominio real
    // sin prometer Facebook (hallazgo M4 de T-003).
    facebookUrl: "https://halcones-ficticios.example.mx/perfil",
    giros: ["futbol"],
    // El de la foto. Su categoría tiene otro negocio publicado SIN foto (el
    // club de natación), así que ese listado enseña los dos casos juntos.
    conFoto: true,
  },
  {
    nombre: "Club de Natación Delfines de Mentiras",
    categoriaSlug: "clubes-y-escuelas-deportivas",
    coloniaSlug: "fuentes-de-tizayuca",
    whatsapp: "7719995007",
    estado: "publicado",
    publicadoEn: "2026-08-08T10:00:00.000Z",
    queOfreces: "Natación para niños desde 4 años y para adultos.",
    horario: "Ma-J 5pm-8pm, S 9am-12pm",
    giros: ["natacion"],
  },
  {
    nombre: "Abarrotes La Esperanza Inventada",
    categoriaSlug: "abarrotes-y-comercio",
    // Caso "Otra" sin normalizar: sin colonia del catálogo, solo texto libre.
    coloniaSlug: null,
    coloniaOtra: "Fraccionamiento Los Sauces Imaginarios",
    whatsapp: "7719995008",
    estado: "publicado",
    publicadoEn: "2026-08-09T10:00:00.000Z",
    queOfreces: "Abarrotes, refrescos y recargas.",
    entregaADomicilio: true,
  },
  {
    nombre: "Veterinaria Patitas de Mentiras",
    categoriaSlug: "salud",
    coloniaSlug: "olmos-ampliacion-olmos",
    whatsapp: "7719995009",
    estado: "publicado",
    publicadoEn: "2026-08-10T10:00:00.000Z",
    queOfreces: "Consultas, vacunas y desparasitación.",
    telefonoFijo: "7717775009",
    direccion: "Frente al jardín del fraccionamiento (referencia inventada)",
    horario: "L-S 9am-7pm",
    facebookUrl: "https://www.facebook.com/veterinariaficticiatzy",
  },
  {
    nombre: "Taller Mecánico El Tuerca Ficticio",
    categoriaSlug: "talleres",
    coloniaSlug: "zona-industrial",
    whatsapp: "7719995010",
    estado: "publicado",
    publicadoEn: "2026-08-11T10:00:00.000Z",
    queOfreces: "Afinación, frenos y suspensión.",
    telefonoFijo: "7717775010",
    direccion: "Bodega 3 de un parque industrial inventado",
    horario: "L-V 8am-6pm",
  },
  {
    // En revisión: no debe aparecer en /belleza ni tener ficha.
    nombre: "Barbería El Buen Corte Imaginario",
    categoriaSlug: "belleza",
    coloniaSlug: "tizayuca-centro",
    whatsapp: "7719995011",
    estado: "en_revision",
    queOfreces: "Corte de caballero y barba (negocio de mentira, en revisión).",
    telefonoFijo: "7717775011",
    direccion: "Calle Imaginaria 45",
    horario: "L-S 10am-8pm",
  },
  {
    // Rechazado: tampoco aparece ni tiene ficha. Trae fecha y motivo del
    // rechazo (spec modelo-datos MODIFIED por agregar-panel-admin) para que el
    // panel y la purga futura de 90 días tengan un caso realista que probar.
    nombre: "Taller Fantasma Rechazado",
    categoriaSlug: "talleres",
    coloniaSlug: "zona-industrial",
    whatsapp: "7719995012",
    estado: "rechazado",
    queOfreces: "Negocio de mentira rechazado por el admin.",
    rechazadoEn: "2026-08-02T11:00:00.000Z",
    motivoRechazo:
      "El número no contesta y no pudimos confirmar que el negocio exista (motivo ficticio).",
  },
];

export type ResultadoSeedDemo = {
  sembrado: boolean;
  mensaje: string;
  total: number;
};

/** Lo único que el seed necesita saber del entorno (así se puede probar). */
export type EntornoSeedDemo = EntornoScriptDb & {
  /** Permiso explícito para sembrar una base que no es un archivo local. */
  SEED_DEMO_PERMITIR?: string;
};

/** Variable con la que se asume el riesgo de sembrar una base no local. */
export const VARIABLE_PERMISO_SEED_DEMO = "SEED_DEMO_PERMITIR";

const normalizar = normalizarValorDeEntorno;

// Cómo se reconoce un entorno peligroso vive en `./guardas-entorno`, que este
// script comparte con `backfill-busqueda.ts` (iteración 2 del change
// `agregar-buscador`, hallazgo B-1). La POLÍTICA sigue siendo de cada script:
// aquí, producción no se abre ni con permiso.
export { apuntaABaseLocal, esEntornoDeProduccion };

/**
 * Razón por la que este comando NO debe sembrar, o `null` si puede.
 *
 * Hallazgo M4 de la etapa C: mirar solo `NODE_ENV`/`VERCEL_ENV` no alcanza,
 * porque `DATABASE_URL=<base de producción> npm run db:seed:demo` desde una
 * máquina local pasa esa guarda y deja 12 negocios de mentira publicados en
 * el directorio real (y el `upsert` por WhatsApp puede pisar una ficha real).
 * El permiso explícito sirve para bases remotas de prueba, pero NUNCA para
 * saltarse la guarda de producción.
 */
export function motivoParaNoSembrar(env: EntornoSeedDemo): string | null {
  if (esEntornoDeProduccion(env)) {
    return "Este comando siembra negocios de mentira y no corre en producción. No se creó nada.";
  }
  if (!apuntaABaseLocal(env) && normalizar(env.SEED_DEMO_PERMITIR) !== "1") {
    return (
      "DATABASE_URL no apunta a un archivo SQLite local (ADR-001) y este comando siembra " +
      "negocios de mentira: podría contaminar la base de verdad. No se creó nada. " +
      `Si de verdad quieres sembrar esa base, vuelve a correrlo con ${VARIABLE_PERMISO_SEED_DEMO}=1.`
    );
  }
  return null;
}

/** Paleta neutra del sitio (globals.css): nada de colores nuevos. */
const COLORES_FOTO_DEMO = [
  { r: 199, g: 191, b: 174 },
  { r: 174, g: 188, b: 199 },
  { r: 184, g: 199, b: 174 },
  { r: 199, g: 174, b: 187 },
];

function colorParaNombre(nombre: string) {
  let suma = 0;
  for (let i = 0; i < nombre.length; i++) suma = (suma * 31 + nombre.charCodeAt(i)) >>> 0;
  return COLORES_FOTO_DEMO[suma % COLORES_FOTO_DEMO.length];
}

/**
 * "Foto" de demostración: un rectángulo de color generado AL VUELO y pasado
 * por el mismo pipeline de producción (`procesarFoto`), para que lo que se ve
 * en desarrollo sea exactamente lo que el sitio serviría.
 *
 * Nunca un archivo de imagen versionado, nunca la foto de un negocio ni de
 * una persona real (repo público + LFPDPPP, PRD §8).
 */
async function guardarFotoDemo(
  almacen: AlmacenFotos,
  clave: string,
  nombre: string,
): Promise<void> {
  const original = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: colorParaNombre(nombre) },
  })
    .png()
    .toBuffer();

  const procesada = await procesarFoto(original);
  if (!procesada.ok) {
    throw new Error(`No se pudo generar la foto de demostración: ${procesada.motivo}`);
  }
  await almacen.guardar(clave, "tarjeta", procesada.variantes.tarjeta);
  await almacen.guardar(clave, "ficha", procesada.variantes.ficha);
}

/**
 * Siembra (o actualiza) los negocios ficticios. Idempotente por WhatsApp.
 * Necesita los catálogos ya poblados (`npm run db:seed`): si falta una
 * categoría o una colonia, avisa con un mensaje que dice qué hacer.
 *
 * También es idempotente en las fotos: si el negocio ya tenía una clave
 * válida se reutiliza (se reescriben sus dos variantes), y si dejó de tener
 * foto se borran las que tenía. Correrlo dos veces deja una sola foto por
 * negocio sembrado y ningún archivo suelto.
 */
export async function sembrarNegociosDemo(
  prisma: PrismaClient,
  env: EntornoSeedDemo = process.env,
  almacen: AlmacenFotos = almacenDeFotos(),
): Promise<ResultadoSeedDemo> {
  const motivo = motivoParaNoSembrar(env);
  if (motivo) {
    return { sembrado: false, total: 0, mensaje: motivo };
  }

  for (const demo of NEGOCIOS_DEMO) {
    const categoria = await prisma.categoria.findUnique({
      where: { slug: demo.categoriaSlug },
    });
    if (!categoria) {
      throw new Error(
        `Falta la categoría "${demo.categoriaSlug}" en el catálogo. Corre primero: npm run db:seed`,
      );
    }

    let coloniaId: number | null = null;
    if (demo.coloniaSlug) {
      const colonia = await prisma.colonia.findUnique({
        where: { slug: demo.coloniaSlug },
      });
      if (!colonia) {
        throw new Error(
          `Falta la colonia "${demo.coloniaSlug}" en el catálogo. Corre primero: npm run db:seed`,
        );
      }
      coloniaId = colonia.id;
    }

    const slugsDeGiros = demo.giros ?? [];
    for (const slug of slugsDeGiros) {
      const giro = await prisma.giro.findUnique({ where: { slug } });
      if (!giro) {
        throw new Error(
          `Falta el giro "${slug}" en el catálogo. Corre primero: npm run db:seed`,
        );
      }
    }
    // Al actualizar se usa `set` (reemplaza el vínculo entero), así el seed es
    // idempotente también en los giros (design.md §3): una segunda corrida no
    // deja giros repetidos ni giros viejos colgando. En el alta solo cabe
    // `connect`, que sobre una fila nueva es lo mismo.
    const girosAlCrear = { connect: slugsDeGiros.map((slug) => ({ slug })) };
    const girosAlActualizar = { set: slugsDeGiros.map((slug) => ({ slug })) };

    // Foto: se reutiliza la clave que ya tuviera (idempotencia) y se limpia la
    // anterior si este negocio dejó de llevar foto.
    const previo = await prisma.negocio.findUnique({
      where: { whatsapp: demo.whatsapp },
      select: { fotoClave: true },
    });
    const claveAnterior = previo?.fotoClave ?? null;
    let fotoClave: string | null = null;
    if (demo.conFoto) {
      fotoClave = esClaveFotoValida(claveAnterior) ? claveAnterior : generarClaveFoto();
      await guardarFotoDemo(almacen, fotoClave, demo.nombre);
    } else if (claveAnterior) {
      await almacen.borrar(claveAnterior);
    }

    const datos = {
      nombre: demo.nombre,
      categoriaId: categoria.id,
      coloniaId,
      coloniaOtra: demo.coloniaOtra ?? null,
      queOfreces: demo.queOfreces ?? null,
      // Camino de escritura como cualquier otro: el texto del buscador lo
      // calcula `datosDeBusqueda`, nunca se escribe a mano (design.md §1).
      ...datosDeBusqueda(demo.nombre, demo.queOfreces),
      entregaADomicilio: demo.entregaADomicilio ?? false,
      telefonoFijo: demo.telefonoFijo ?? null,
      direccion: demo.direccion ?? null,
      horario: demo.horario ?? null,
      facebookUrl: demo.facebookUrl ?? null,
      fotoClave,
      estado: demo.estado,
      // Datos de siembra, no de un registro real del formulario.
      origen: "siembra",
      publicadoEn: demo.publicadoEn ? new Date(demo.publicadoEn) : null,
      // Explícitamente nulos cuando no aplican: el `upsert` es idempotente,
      // así que volver a sembrar limpia el rastro de un rechazo anterior.
      rechazadoEn: demo.rechazadoEn ? new Date(demo.rechazadoEn) : null,
      motivoRechazo: demo.motivoRechazo ?? null,
    };

    await prisma.negocio.upsert({
      where: { whatsapp: demo.whatsapp },
      update: { ...datos, giros: girosAlActualizar },
      create: {
        ...datos,
        giros: girosAlCrear,
        whatsapp: demo.whatsapp,
        consintioAvisoEn: new Date("2026-07-31T10:00:00.000Z"),
        registradoEn: new Date("2026-07-31T10:00:00.000Z"),
      },
    });
  }

  return {
    sembrado: true,
    total: NEGOCIOS_DEMO.length,
    mensaje: `Sembrados ${NEGOCIOS_DEMO.length} negocios de MENTIRA (nombres inventados y WhatsApp 771999xxxx). No son negocios reales de Tizayuca: son solo para ver el directorio en desarrollo.`,
  };
}

// Ejecución directa (`npm run db:seed:demo`); al importarse desde los tests
// no corre nada.
const ejecutadoDirecto = process.argv[1]?.endsWith("seed-demo.ts") ?? false;
if (ejecutadoDirecto) {
  try {
    // `tsx` no lee .env solo (a diferencia de la CLI de Prisma).
    process.loadEnvFile();
  } catch {
    // Sin .env: se usa la base de dev por default, igual que prisma7.config.ts.
  }
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  });
  const prisma = new PrismaClient({ adapter });
  sembrarNegociosDemo(prisma)
    .then((resultado) => {
      console.log(resultado.mensaje);
      if (!resultado.sembrado) process.exitCode = 1;
    })
    .catch((error) => {
      console.error("No se pudieron sembrar los negocios de demostración:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
