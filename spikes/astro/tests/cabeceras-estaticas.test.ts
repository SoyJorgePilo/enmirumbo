import { describe, expect, it } from "vitest";

import { cabecerasPara } from "../src/lib/cabeceras";
import { rutasConCabecerasEstaticas } from "../src/lib/cabeceras-estaticas";

const RUTAS_DEL_ADAPTADOR = [
  { src: "^/_astro(?:/(.*))$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
  { handle: "filesystem" },
  { src: "^/$", dest: "_render" },
  { src: "^/.*$", dest: "_render", status: 404 },
];

describe("cabeceras de los archivos que sirve la CDN (prerenderizados)", () => {
  const rutas = rutasConCabecerasEstaticas(RUTAS_DEL_ADAPTADOR, [
    "estatica/index.html",
    "_astro/client.abc.js",
    "favicon.svg",
  ]);
  const indiceFilesystem = rutas.findIndex((r) => "handle" in r && r.handle === "filesystem");
  const nuevas = rutas.slice(1, indiceFilesystem);

  it("agrega una ruta por archivo ANTES de `filesystem`, con continue y las cabeceras de producción", () => {
    expect(nuevas).toHaveLength(3);
    for (const ruta of nuevas) {
      expect(ruta).toMatchObject({ headers: cabecerasPara("/"), continue: true });
    }
    // Las del adaptador se conservan, en su orden.
    expect(rutas[0]).toEqual(RUTAS_DEL_ADAPTADOR[0]);
    expect(rutas.slice(indiceFilesystem)).toEqual(RUTAS_DEL_ADAPTADOR.slice(1));
  });

  it("la página prerenderizada se reconoce con y sin diagonal final, y por su index.html", () => {
    const [pagina] = nuevas;
    const patron = new RegExp((pagina as { src: string }).src);
    expect(patron.test("/estatica")).toBe(true);
    expect(patron.test("/estatica/")).toBe(true);
    expect(patron.test("/estatica/index.html")).toBe(true);
    expect(patron.test("/estatica-otra")).toBe(false);
  });

  it("los demás archivos se reconocen por su ruta exacta, con los puntos escapados", () => {
    const patron = new RegExp((nuevas[1] as { src: string }).src);
    expect(patron.test("/_astro/client.abc.js")).toBe(true);
    expect(patron.test("/_astro/clientXabc.js")).toBe(false);
  });
});
