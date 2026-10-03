/**
 * `src/astro/tareas.ts` (change `migrar-tareas-programadas-astro`, design.md
 * §3; tasks.md #9): la puerta de las tareas programadas en Astro y su 404.
 *
 * - `tareaAutorizada(peticion, env)` lee `CRON_SECRET` EN CADA PETICIÓN (no al
 *   cargar el módulo), lo recorta, trata el vacío como "no" y delega en
 *   `secretoDeTareaCorrecto` (tiempo constante, sin cambios).
 * - `respuestaDeTareaNoExistente()`: 404, sin cuerpo y SIN NINGUNA cabecera
 *   propia (las cuatro de seguridad las pone el middleware). Medido en Next:
 *   su `notFound()` desde un Route Handler tampoco trae `Content-Type`,
 *   `Cache-Control` ni `X-Robots-Tag` (b-dev).
 *
 * Secreto ficticio, generado para la prueba.
 */
import { describe, expect, it } from "vitest";

import { respuestaDeTareaNoExistente, tareaAutorizada } from "../src/astro/tareas";

const SECRETO = "f6a-secreto-de-pruebas-0123456789abcdef0123456789abcdef";
const pedir = (headers: Record<string, string> = {}) => new Request("https://enmirumbo.example/api/tareas/purgar-rechazados", { headers });
const env = (valor: string | undefined) => ({ CRON_SECRET: valor });

describe("tareaAutorizada", () => {
  it("con el secreto correcto, sí", () => {
    expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }), env(SECRETO))).toBe(true);
  });

  it.each([
    ["sin Authorization", {}],
    ["equivocado de la misma longitud", { authorization: `Bearer ${"x".repeat(SECRETO.length)}` }],
    ["truncado en un carácter", { authorization: `Bearer ${SECRETO.slice(0, -1)}` }],
    ["con un carácter de más", { authorization: `Bearer ${SECRETO}x` }],
    ["sin Bearer", { authorization: SECRETO }],
    ["bearer en minúsculas", { authorization: `bearer ${SECRETO}` }],
    ["Bearer con dos espacios", { authorization: `Bearer  ${SECRETO}` }],
    ["Basic", { authorization: `Basic ${SECRETO}` }],
    ["Authorization vacío", { authorization: "" }],
  ])("%s: no", (_caso, headers) => {
    expect(tareaAutorizada(pedir(headers as Record<string, string>), env(SECRETO))).toBe(false);
  });

  it.each([
    ["sin CRON_SECRET", undefined],
    ["CRON_SECRET vacío", ""],
    ["CRON_SECRET de puros espacios", "   "],
  ])("%s: no, ni con el secreto de antes ni con un Bearer vacío", (_caso, valor) => {
    expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }), env(valor))).toBe(false);
    expect(tareaAutorizada(pedir({ authorization: "Bearer " }), env(valor))).toBe(false);
    expect(tareaAutorizada(pedir({ authorization: "Bearer    " }), env(valor))).toBe(false);
  });

  it("recorta los espacios de CRON_SECRET, como Next", () => {
    expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }), env(`  ${SECRETO}\n`))).toBe(true);
  });

  it("lee CRON_SECRET en cada petición (por defecto, de process.env)", () => {
    const antes = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }))).toBe(false);
      process.env.CRON_SECRET = SECRETO;
      expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }))).toBe(true);
      process.env.CRON_SECRET = "otro-secreto";
      expect(tareaAutorizada(pedir({ authorization: `Bearer ${SECRETO}` }))).toBe(false);
    } finally {
      if (antes === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antes;
    }
  });
});

describe("respuestaDeTareaNoExistente", () => {
  it("404, cuerpo vacío y ninguna cabecera propia", async () => {
    const r = respuestaDeTareaNoExistente();
    expect(r.status).toBe(404);
    expect(await r.text()).toBe("");
    expect([...r.headers]).toEqual([]);
  });

  it("cada llamada es una respuesta nueva (el middleware le agrega cabeceras)", () => {
    expect(respuestaDeTareaNoExistente()).not.toBe(respuestaDeTareaNoExistente());
  });
});
