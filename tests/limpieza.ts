import { NEGOCIOS_DEMO } from "../prisma/seed-demo";
import type { PrismaClient } from "../src/generated/prisma/client";
import { almacenDeFotos } from "../src/lib/fotos/almacen";

/**
 * Limpieza de lo que un archivo de pruebas sembró en la base COMPARTIDA.
 *
 * La suite corre sus archivos uno tras otro contra el mismo esquema
 * (`fileParallelism: false`), en un orden que no está fijo: lo que un archivo
 * deja lo ve el siguiente. Hallazgo A1 de `migrar-directorio-publico-astro`
 * (d-validacion.md): los 12 negocios demo que quedaban sembrados rompían la
 * "cola vacía" del admin y el "nada que barrer" de las fotos huérfanas.
 */

/** WhatsApp (ficticios, 771999xxxx) de los negocios de `sembrarNegociosDemo`. */
export const WHATSAPP_DEMO: string[] = NEGOCIOS_DEMO.map((demo) => demo.whatsapp);

/**
 * Borra los negocios con esos WhatsApp (sus ediciones y reportes caen en
 * cascada) y las dos variantes de cada foto que tenían en el almacén de
 * pruebas. Las `clavesExtra` son fotos guardadas sin negocio que las apunte
 * (p. ej. la de un negocio que la propia prueba ya borró).
 */
export async function borrarNegociosSembrados(
  prisma: PrismaClient,
  whatsapps: string[],
  clavesExtra: string[] = [],
): Promise<void> {
  const negocios = await prisma.negocio.findMany({
    where: { whatsapp: { in: whatsapps } },
    select: { fotoClave: true },
  });
  await prisma.negocio.deleteMany({ where: { whatsapp: { in: whatsapps } } });
  const claves = new Set([...negocios.map((n) => n.fotoClave), ...clavesExtra]);
  for (const clave of claves) {
    if (clave) await almacenDeFotos().borrar(clave);
  }
}
