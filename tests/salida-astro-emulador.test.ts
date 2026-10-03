/**
 * El emulador de la salida de Vercel (`scripts/servir-salida-vercel.mjs`,
 * `tests/salida-astro.ts`) es infraestructura de pruebas, no producto: estas
 * pruebas lo cuidan a él (O6 de la etapa C de `migrar-panel-admin-base-astro`).
 *
 * 1. Reconstruir `.vercel/output` (`astro build` la vacía con `emptyDir` y la
 *    vuelve a escribir, con otros nombres de trozo si cambió el código)
 *    dejaba a un emulador vivo sirviendo 500 en cuanto cargaba un trozo
 *    diferido (`ERR_MODULE_NOT_FOUND`), y uno que arrancaba a media
 *    reconstrucción terminaba con código 1 ("el emulador terminó (1)"). Cada
 *    emulador sirve ahora una copia propia (enlaces duros) de la salida. La
 *    prueba simula la ventana en que la salida no está (la aparta y la
 *    regresa), sin pagar un segundo build.
 * 2. `TRACE` tumbaba el proceso: `new Request` lanzaba fuera del `try`.
 */
import { existsSync, renameSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const salida = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.vercel/output");
const apartada = `${salida}-apartada-por-la-prueba`;

let emulador: Emulador | undefined;

beforeAll(async () => {
  construirSiHaceFalta();
  emulador = await levantarEmulador();
}, 300_000);

afterAll(() => emulador?.detener());

/** Una petición cruda (sin `fetch`, que no deja mandar `TRACE`). */
function pedirCrudo(base: string, metodo: string, ruta: string): Promise<number> {
  return new Promise((listo, falla) => {
    const peticion = request(`${base}${ruta}`, { method: metodo }, (respuesta) => {
      respuesta.resume();
      respuesta.on("end", () => listo(respuesta.statusCode ?? 0));
    });
    peticion.on("error", falla);
    peticion.end();
  });
}

describe("el emulador de la salida de Vercel", () => {
  it("un emulador vivo sigue sirviendo igual mientras la salida se reconstruye", async () => {
    // Rutas que NO se pidieron antes: cada una carga trozos diferidos de la
    // función (la home, el acceso del panel, la 404), que es cuando se caía.
    const rutas = ["/", "/admin", "/no-existe-ficticia"];
    const estados = () => Promise.all(rutas.map(async (ruta) => (await emulador!.pedir(ruta)).status));

    expect(existsSync(apartada), "quedó una salida apartada de otra corrida").toBe(false);
    renameSync(salida, apartada);
    let durante: number[];
    try {
      durante = await estados();
    } finally {
      renameSync(apartada, salida);
    }
    expect(durante).not.toContain(500);
    expect(durante).toEqual(await estados());
    expect(emulador!.registro()).not.toContain("ERR_MODULE_NOT_FOUND");
  });

  it("un `TRACE` recibe una respuesta y el emulador sigue de pie", async () => {
    const estado = await pedirCrudo(emulador!.base, "TRACE", "/");
    expect(estado).toBeGreaterThanOrEqual(400);
    expect((await emulador!.pedir("/")).status).not.toBe(500);
  });
});
