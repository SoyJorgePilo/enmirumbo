/**
 * El pegamento de las Actions `entrar` y `salir` en Astro (change
 * `migrar-panel-admin-base-astro`, Fase 5a; tasks.md #11), con un contexto
 * falso: se ata a su ruta, adapta `Astro.cookies` sin agregar opciones, lee la
 * IP con `ipDeEncabezados(request.headers)` y obedece SOLO los destinos de la
 * lista cerrada (`DESTINOS_DEL_ACCESO`). Y las dos entradas de la tabla de
 * Actions (`src/astro/acciones.ts`): ruta, destinos y `trasFallar`.
 *
 * Todo ficticio: contraseña y secreto generados aquí; IPs de documentación.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACCIONES, resolverAccion } from "../src/astro/acciones";
import { DESTINOS_DEL_ACCESO, destinoDelAcceso, entrarDesdeElFormulario, salirDesdeElFormulario } from "../src/astro/panel/acceso";
import { reiniciarIntentosDeAcceso } from "../src/lib/admin/acceso";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, haySesionValida } from "../src/lib/admin/sesion";
import { VARIABLE_ENCABEZADO_IP } from "../src/lib/registro/limite-ip";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CONTRASENA = `clave-ficticia-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");

type Puesta = { nombre: string; valor: string; opciones: unknown };

function contexto(routePattern: string, cabeceras: Record<string, string> = {}) {
  const puestas: Puesta[] = [];
  return {
    puestas,
    routePattern,
    request: new Request("https://enmirumbo.example/admin", { method: "POST", headers: { "x-forwarded-for": "203.0.113.77", ...cabeceras } }),
    cookies: {
      get: () => undefined,
      set: (nombre: string, valor: string, opciones?: unknown) => void puestas.push({ nombre, valor, opciones }),
    },
  };
}

const envio = (contrasena: string) => {
  const f = new FormData();
  f.set("contrasena", contrasena);
  return f;
};

const anterior = { ...process.env };
beforeEach(async () => {
  process.env[VARIABLE_CONTRASENA] = CONTRASENA;
  process.env[VARIABLE_SECRETO_SESION] = SECRETO;
  process.env[VARIABLE_ENCABEZADO_IP] = "x-forwarded-for";
  await reiniciarIntentosDeAcceso();
});
afterEach(async () => {
  await reiniciarIntentosDeAcceso();
  for (const clave of [VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION, VARIABLE_ENCABEZADO_IP]) {
    if (anterior[clave] === undefined) delete process.env[clave];
    else process.env[clave] = anterior[clave];
  }
});

describe("acceso en Astro · entrar", () => {
  it("con la contraseña correcta pone la cookie con los atributos de siempre y va a la cola", async () => {
    const c = contexto("/admin", { "x-forwarded-proto": "https" });
    expect(await entrarDesdeElFormulario(envio(CONTRASENA), c)).toEqual({ tipo: "redirigir", ruta: "/admin/cola" });
    expect(c.puestas).toHaveLength(1);
    const [p] = c.puestas;
    expect(p.nombre).toBe(NOMBRE_COOKIE_SESION);
    expect(p.opciones).toEqual({ httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 28800, secure: true });
    expect(haySesionValida(p.valor)).toBe(true);
  });

  it("con otra contraseña va a ?error=incorrecta sin cookie", async () => {
    const c = contexto("/admin");
    expect(await entrarDesdeElFormulario(envio("otra"), c)).toEqual({ tipo: "redirigir", ruta: "/admin?error=incorrecta" });
    expect(c.puestas).toEqual([]);
  });

  it("desde otra ruta no hace nada (ni intento, ni cookie)", async () => {
    for (const ruta of ["/", "/admin/cola", "/admin/negocios", "/admin/[...resto]"]) {
      const c = contexto(ruta);
      expect(await entrarDesdeElFormulario(envio(CONTRASENA), c), ruta).toEqual({ tipo: "fuera-de-ruta" });
      expect(c.puestas, ruta).toEqual([]);
    }
  });

  it("la IP sale del ÚLTIMO valor del encabezado declarado: rotar el primero no da más intentos", async () => {
    for (let i = 0; i < 5; i++) await entrarDesdeElFormulario(envio("otra"), contexto("/admin", { "x-forwarded-for": `198.51.100.${i}, 203.0.113.88` }));
    const sexta = contexto("/admin", { "x-forwarded-for": "198.51.100.99, 203.0.113.88" });
    expect(await entrarDesdeElFormulario(envio(CONTRASENA), sexta)).toEqual({ tipo: "redirigir", ruta: "/admin?error=intentos" });
    expect(sexta.puestas).toEqual([]);
  });
});

describe("acceso en Astro · salir", () => {
  it("borra la cookie con los mismos atributos y va a ?salida=1, haya sesión o no", () => {
    const c = contexto("/admin/cola", { "x-forwarded-proto": "https" });
    expect(salirDesdeElFormulario(c)).toEqual({ tipo: "redirigir", ruta: "/admin?salida=1" });
    expect(c.puestas).toEqual([{ nombre: NOMBRE_COOKIE_SESION, valor: "", opciones: { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 0, secure: true } }]);
  });

  it("desde otra ruta no borra nada", () => {
    for (const ruta of ["/admin", "/admin/negocios", "/"]) {
      const c = contexto(ruta);
      expect(salirDesdeElFormulario(c), ruta).toEqual({ tipo: "fuera-de-ruta" });
      expect(c.puestas, ruta).toEqual([]);
    }
  });
});

describe("acceso en Astro · destinos cerrados", () => {
  it("la lista es exactamente la de design.md §4", () => {
    expect([...DESTINOS_DEL_ACCESO].sort()).toEqual(["/admin", "/admin/cola", "/admin?error=incorrecta", "/admin?error=intentos", "/admin?salida=1"]);
  });

  it("un destino fuera de la lista se trata como /admin", () => {
    for (const ruta of ["/admin?error=x", "/admin/negocios", "https://evil.example/", "//evil.example", "/admin/cola?destino=/x"]) {
      expect(destinoDelAcceso({ tipo: "redirigir", ruta } as never), ruta).toEqual({ tipo: "redirigir", ruta: "/admin" });
    }
  });

  it("la tabla de Actions: entrar en /admin y salir en /admin/cola, con los destinos cerrados", async () => {
    expect(ACCIONES.entrar.ruta).toBe("/admin");
    expect(ACCIONES.salir.ruta).toBe("/admin/cola");
    for (const nombre of ["entrar", "salir"]) {
      expect(ACCIONES[nombre].destinos, nombre).toBe(DESTINOS_DEL_ACCESO);
      // Un destino fuera de la lista no se obedece.
      expect(await resolverAccion(nombre, { data: { tipo: "redirigir", ruta: "/admin/negocios" } }, { params: {} }), nombre).not.toEqual({ tipo: "redirigir", ruta: "/admin/negocios" });
    }
  });

  it("trasFallar (cuerpo ilegible o de más de 6 MiB) va a /admin sin tocar nada", async () => {
    for (const nombre of ["entrar", "salir"]) {
      for (const codigo of ["CONTENT_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INTERNAL_SERVER_ERROR", undefined]) {
        expect(await resolverAccion(nombre, { error: { code: codigo } }, { params: {} }), `${nombre} ${codigo}`).toEqual({ tipo: "redirigir", ruta: "/admin" });
      }
    }
  });
});

// El guardián de `clientAddress` (`plataforma-astro-cupos.test.ts`) ya recorre
// `src/astro` y `src/pages`, así que cubre `src/astro/panel/` y `src/pages/admin/`.
describe("acceso en Astro · la IP sale de las cabeceras", () => {
  it("el pegamento pasa las cabeceras de la petición y src/lib usa ipDeEncabezados", () => {
    const pegamento = readFileSync(path.join(raiz, "src/astro/panel/acceso.ts"), "utf8");
    expect(pegamento).toMatch(/ejecutarAcceso\(\s*formData,\s*contexto\.request\.headers/);
    const entrar = readFileSync(path.join(raiz, "src/lib/admin/entrar.ts"), "utf8");
    expect(entrar).toMatch(/ipDeEncabezados\(encabezados\)/);
  });
});
