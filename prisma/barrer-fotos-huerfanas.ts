/**
 * Comando del barrido de fotos sin dueño (`npm run fotos:barrer-huerfanos`).
 *
 * La lógica vive en `src/lib/fotos/huerfanas.ts` —con sus tres salvaguardas y
 * sus tests—; esto es solo el envoltorio que abre la base, la conecta con el
 * almacén configurado en `FOTOS_DIR` y cuenta qué pasó.
 *
 * Con `-- --dry-run` no borra nada: solo informa. Recomendado la primera vez
 * que se corre contra un almacén de verdad.
 *
 * Con `-- --forzar` se salta la guarda de proporción, que es la que impide que
 * apuntar a la base equivocada (staging, `test.db`) se lleve por delante las
 * fotos de todos los negocios publicados. Se escribe a mano, después de haber
 * mirado el `--dry-run`.
 *
 * En producción esto lo dispara un cron —la ruta `/api/tareas/barrer-fotos-huerfanas`,
 * que corre la MISMA lógica— junto con la purga de registros rechazados a los
 * 90 días (PRD §8), el otro barrido periódico del sistema. Este comando queda
 * para operar a mano: el `--dry-run` y el `--forzar` no tienen equivalente por
 * HTTP a propósito.
 *
 * Mira el almacén configurado, sea el disco local o Supabase Storage: el
 * barrido se lo pregunta al puerto, no al sistema de archivos.
 */
import { almacenDeFotos } from "../src/lib/fotos/almacen";
import { barrerFotosHuerfanas } from "../src/lib/fotos/huerfanas";
import { crearClienteDeScript } from "./cliente-script";

const ejecutadoDirecto =
  process.argv[1]?.endsWith("barrer-fotos-huerfanas.ts") ?? false;

if (ejecutadoDirecto) {
  try {
    // `tsx` no lee .env solo (a diferencia de la CLI de Prisma).
    process.loadEnvFile();
  } catch {
    // Sin .env: se usa la base de dev por default, igual que prisma7.config.ts.
  }

  const soloInformar = process.argv.includes("--dry-run");
  const forzar = process.argv.includes("--forzar");
  const prisma = crearClienteDeScript();

  const almacen = almacenDeFotos();
  console.log(`Barriendo fotos sin dueño en ${almacen.descripcion()}`);
  barrerFotosHuerfanas({ prisma, almacen, soloInformar, forzar })
    .then((resultado) => {
      console.log(resultado.mensaje);
      if (resultado.enPeriodoDeGracia > 0) {
        console.log(
          `(${resultado.enPeriodoDeGracia} fotos son demasiado recientes para juzgarlas: se revisarán en la próxima corrida.)`,
        );
      }
      if (resultado.noBorrables > 0) {
        console.log(
          `(${resultado.noBorrables} claves no se dejaron borrar: revisa si hay directorios o permisos raros en el almacén.)`,
        );
      }
      if (resultado.ignoradas > 0) {
        console.log(
          `(${resultado.ignoradas} archivos del directorio no los escribió este sistema y no se tocaron.)`,
        );
      }
      if (!resultado.barrido) process.exitCode = 1;
    })
    .catch((error) => {
      console.error("No se pudo barrer el almacén de fotos:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
