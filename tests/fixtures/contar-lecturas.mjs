/**
 * Sonda SOLO para pruebas (change `migrar-registro-astro`, hallazgos M1/M2 de
 * c-seguridad). Se carga antes que el emulador, en su mismo proceso:
 *
 *   node --import ./tests/fixtures/contar-lecturas.mjs scripts/servir-salida-vercel.mjs
 *
 * Cuenta cuántas veces se interpreta un cuerpo como formulario
 * (`Request.prototype.formData`) y el pico de memoria residente del proceso.
 * Lo escribe como JSON en `CONTAR_LECTURAS_ARCHIVO` cada vez que cambia.
 * No toca nada más: la llamada original sigue igual.
 */
import { writeFileSync } from "node:fs";

const archivo = process.env.CONTAR_LECTURAS_ARCHIVO;
if (!archivo) throw new Error("contar-lecturas: falta CONTAR_LECTURAS_ARCHIVO");

const estado = { lecturas: 0, picoRssMb: 0 };
const escribir = () => writeFileSync(archivo, JSON.stringify(estado));

const original = Request.prototype.formData;
Request.prototype.formData = function formData() {
  estado.lecturas += 1;
  escribir();
  return original.call(this);
};

const medir = () => {
  const rss = Math.round(process.memoryUsage.rss() / (1024 * 1024));
  if (rss > estado.picoRssMb) {
    estado.picoRssMb = rss;
    escribir();
  }
};
medir();
setInterval(medir, 10).unref();
