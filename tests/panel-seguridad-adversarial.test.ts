/**
 * Etapa C (seguridad) del change `migrar-panel-admin-base-astro` (Fase 5a):
 * pruebas ADVERSARIALES sobre la SALIDA CONSTRUIDA, servida por el emulador
 * del Build Output API, con PostgreSQL. Cubren lo que el camino feliz y las
 * pruebas del dev no prueban:
 *
 * - formas de escribir la ruta del panel (codificación, mayúsculas, puntos,
 *   barras dobles, `;`, `%00`) y combinaciones de `?_action=`: ninguna llega
 *   a una pantalla con datos sin sesión;
 * - cookies manoseadas más allá de las cinco del dev (dos cookies, comillas,
 *   nombre en mayúsculas, signo, hexadecimal, tres partes, prefijo de versión);
 * - CSRF de "Salir" y de "entrar" (Origin ajeno o `null`): 403, sin cookie y
 *   sin intento apartado;
 * - nada de lo que manda el cliente (campos, `?next=`, `Referer`) decide el
 *   destino del 303;
 * - nombres y colonias hostiles en la cola y en el listado: escapados;
 * - `?estado=`/`?pagina=` hostiles con sesión: sin 500 y sin eco;
 * - el log del proceso no trae la contraseña, la cookie ni la IP.
 *
 * Todo ficticio: contraseña y secreto generados aquí, WhatsApp 77199959xx
 * (serie exclusiva de esta prueba), IPs de documentación (RFC 5737).
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { VARIABLE_CONTRASENA, VARIABLE_SECRETO_SESION } from "../src/lib/admin/config";
import { crearClientePrueba } from "./db";
import { borrarIntentos, cookieDeSesion, intentosDe, valorDeSesion } from "./panel-astro";
import { type Emulador, construirSiHaceFalta, levantarEmulador } from "./salida-astro";

const CONTRASENA = `clave-ficticia-c5a-${randomBytes(6).toString("hex")}`;
const SECRETO = randomBytes(32).toString("hex");
const PANEL = { [VARIABLE_CONTRASENA]: CONTRASENA, [VARIABLE_SECRETO_SESION]: SECRETO, REGISTRO_ENCABEZADO_IP: "x-forwarded-for" };
const FORM = { "content-type": "application/x-www-form-urlencoded" };

/** Negocios hostiles (ficticios) que la cola y el listado pintan con sesión. */
const HOSTILES = [
  { id: "c5aadv0000000000000000001", nombre: '<script>alert("c5a")</script>', colonia: "<img src=x onerror=alert(1)>" },
  { id: "c5aadv0000000000000000002", nombre: '"><svg/onload=alert(2)>', colonia: '" onmouseover="alert(3)' },
  { id: "c5aadv0000000000000000003", nombre: "Taller ‮ocinóla‬ Ficticio 🔧 'c' &amp;", colonia: "{{7*7}} ${7*7}" },
  { id: "c5aadv0000000000000000004", nombre: "javascript:alert(4)", colonia: '</a><a href="javascript:alert(5)">x' },
];
const WHATSAPP = (i: number) => `77199959${String(i + 1).padStart(2, "0")}`;

let prisma: PrismaClient;
let e: Emulador;
const ipsUsadas = new Set<string>();
/** Cada valor de cookie de sesión que viajó en esta prueba (para buscarlo en el log). */
const cookiesUsadas = new Set<string>();
const anotar = (cookie: string) => (cookiesUsadas.add(cookie.split("=").slice(1).join("=")), cookie);

async function limpiar() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Negocio" WHERE id LIKE 'c5aadv%'`);
}

beforeAll(async () => {
  construirSiHaceFalta();
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  await limpiar();
  const [cat] = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT id FROM "Categoria" ORDER BY id LIMIT 1`);
  for (const [i, h] of HOSTILES.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "consintioAvisoEn", "consintioAvisoVersion", estado, "registradoEn", "coloniaOtra")
       VALUES ($1, $2, $3, $4, now(), '1', 'en_revision', now() - ($5::text || ' hours')::interval, $6)`,
      h.id,
      h.nombre,
      cat.id,
      WHATSAPP(i),
      String(i + 1),
      h.colonia,
    );
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Reporte" (id, "negocioId", motivo, comentario) VALUES ('c5aadvrep1', $1, 'inapropiado', '<script>alert(9)</script>')`,
    HOSTILES[1].id,
  );
  e = await levantarEmulador(PANEL);
}, 300_000);

afterAll(async () => {
  e?.detener();
  await borrarIntentos(prisma, ipsUsadas, SECRETO);
  await limpiar();
  await prisma.$disconnect();
});

/** Nada sembrado ni de la pantalla con sesión en un cuerpo sin sesión. */
function sinDatos(cuerpo: string, etiqueta: string) {
  for (const [i, h] of HOSTILES.entries()) {
    expect(cuerpo, `${etiqueta}: ${h.id}`).not.toContain(h.id);
    expect(cuerpo, `${etiqueta}: whatsapp`).not.toContain(WHATSAPP(i));
  }
  expect(cuerpo, etiqueta).not.toMatch(/Registros por revisar|negocios? en esta lista|Negocios reportados|Ficticio/);
}

const ip = (n: number) => {
  const valor = `203.0.113.${n}`;
  ipsUsadas.add(valor);
  return valor;
};

describe("adversarial 5a · la ruta del panel escrita de otra forma, sin sesión", () => {
  const VARIANTES = [
    "/admin/cola/",
    "/admin//cola",
    "//admin/cola",
    "/ADMIN/cola",
    "/admin/COLA",
    "/%61dmin/cola",
    "/admin/%63ola",
    "/admin/%2563ola",
    "/admin%2Fcola",
    "/./admin/cola",
    "/admin/./cola",
    "/admin/x/../cola",
    "/admin/%2e%2e/admin/cola",
    "/admin/..%2fadmin/cola",
    "/admin;x/cola",
    "/admin/cola;x",
    "/admin/cola%00",
    "/admin/cola%20",
    "/admin/cola.html",
    "/admin/negocios/",
    "/admin/negocios//?estado=publicado",
    "/admin/cola//",
  ];

  it.each(VARIANTES)("%s: nunca un 200 con datos; si redirige, a una ruta del propio panel", async (ruta) => {
    for (const metodo of ["GET", "POST"]) {
      const sufijo = metodo === "POST" ? `${ruta.includes("?") ? "&" : "?"}_action=aprobar` : "";
      const r = await e.pedir(`${ruta}${sufijo}`, metodo === "POST" ? { method: "POST", headers: FORM, body: "a=1" } : {});
      const cuerpo = await r.text();
      // 301/308: la redirección propia de Astro para `//` final, antes del middleware (preexistente).
      expect([301, 303, 307, 308, 404], `${metodo} ${ruta}`).toContain(r.status);
      sinDatos(cuerpo, `${metodo} ${ruta}`);
      expect(r.headers.getSetCookie(), `${metodo} ${ruta}`).toEqual([]);
      const destino = r.headers.get("location");
      if (destino !== null) expect(destino, `${metodo} ${ruta}`).toMatch(/^\/admin(\/|\?|$)/);
    }
  });

  it("toda respuesta que sale de la función para una ruta del panel lleva la cabecera estricta", async () => {
    for (const ruta of ["/admin/cola/", "/admin//cola", "/admin/%63ola", "/admin/cola;x", "/admin/cola%00", "/admin/..%2fadmin/cola"]) {
      const r = await e.pedir(ruta);
      await r.arrayBuffer();
      expect(r.headers.get("referrer-policy"), ruta).toBe("strict-origin");
      expect(r.headers.get("cache-control"), ruta).toContain("no-store");
    }
  });

  it("combinaciones de ?_action= y métodos raros: la guarda responde antes de cualquier Action", async () => {
    const casos: Array<[string, string, number, string]> = [
      ["POST", "/admin/negocios?_action=salir&_action=aprobar", 303, "/admin"],
      ["POST", "/admin/cola?_action=aprobar&_action=salir", 303, "/admin"],
      ["POST", "/admin/cola?%5Faction=aprobar", 303, "/admin"],
      ["POST", "/admin/cola?_ACTION=aprobar", 307, "/admin"],
      ["POST", "/admin/cola?_action=", 307, "/admin"],
      ["PATCH", "/admin/negocios?_action=aprobar", 307, "/admin"],
      ["OPTIONS", "/admin/cola", 307, "/admin"],
      ["DELETE", "/admin/negocios?_action=salir", 307, "/admin"],
    ];
    for (const [metodo, ruta, estado, destino] of casos) {
      const r = await e.pedir(ruta, { method: metodo, headers: FORM, body: metodo === "OPTIONS" ? undefined : "a=1" });
      sinDatos(await r.text(), `${metodo} ${ruta}`);
      expect(r.status, `${metodo} ${ruta}`).toBe(estado);
      expect(r.headers.get("location"), `${metodo} ${ruta}`).toBe(destino);
      expect(r.headers.getSetCookie(), `${metodo} ${ruta}`).toEqual([]);
    }
  });
});

describe("adversarial 5a · cookies manoseadas", () => {
  it("ninguna variante de una cookie vigente abre la cola si no es exactamente la firmada", async () => {
    const vigente = valorDeSesion("vigente", SECRETO);
    const [caducidad, firma] = vigente.split(".");
    const variantes: Record<string, string> = {
      "mala primero, buena después": `nu_panel=x; nu_panel=${vigente}`,
      "entre comillas": `nu_panel="${vigente}"`,
      "nombre en mayúsculas": `NU_PANEL=${vigente}`,
      "caducidad negativa": `nu_panel=-${caducidad}.${firma}`,
      "caducidad hexadecimal": `nu_panel=0x${Number(caducidad).toString(16)}.${firma}`,
      "tres partes": `nu_panel=${vigente}.x`,
      "prefijo de versión": `nu_panel=v1.${vigente}`,
      "firma con relleno": `nu_panel=${vigente}=`,
      "firma en base64 estándar": `nu_panel=${caducidad}.${firma.replace(/-/g, "+").replace(/_/g, "/")}x`,
      "firma truncada": `nu_panel=${caducidad}.${firma.slice(0, 20)}`,
      vacía: "nu_panel=",
    };
    for (const [etiqueta, cookie] of Object.entries(variantes)) {
      const r = await e.pedir("/admin/cola", { headers: { cookie } });
      sinDatos(await r.text(), etiqueta);
      expect(r.status, etiqueta).toBe(307);
      expect(r.headers.get("location"), etiqueta).toBe("/admin");
    }
    // Control: la vigente sí abre (si no, lo de arriba no prueba nada).
    const control = await e.pedir("/admin/cola", { headers: { cookie: cookieDeSesion("vigente", SECRETO) } });
    expect(control.status).toBe(200);
    await control.arrayBuffer();
  });
});

describe("adversarial 5a · CSRF y destinos de entrar y salir", () => {
  it("salir con Origin ajeno o null: 403, sin borrar la cookie", async () => {
    for (const origen of ["https://evil.example", "null", "http://127.0.0.1.evil.example"]) {
      const r = await e.pedir("/admin/cola?_action=salir", {
        method: "POST",
        headers: { ...FORM, origin: origen, cookie: anotar(cookieDeSesion("vigente", SECRETO)) },
        body: "",
      });
      sinDatos(await r.text(), origen);
      expect(r.status, origen).toBe(403);
      expect(r.headers.getSetCookie(), origen).toEqual([]);
      expect(r.headers.get("referrer-policy"), origen).toBe("strict-origin");
    }
  });

  it("entrar con Origin ajeno o null (login CSRF): 403, sin cookie y sin apartar intento", async () => {
    const desde = ip(201);
    for (const origen of ["https://evil.example", "null"]) {
      const r = await e.pedir("/admin?_action=entrar", {
        method: "POST",
        headers: { ...FORM, origin: origen, "x-forwarded-for": desde },
        body: new URLSearchParams({ contrasena: CONTRASENA }).toString(),
      });
      await r.arrayBuffer();
      expect(r.status, origen).toBe(403);
      expect(r.headers.getSetCookie(), origen).toEqual([]);
    }
    expect(await intentosDe(prisma, desde, SECRETO)).toBe(0);
  });

  it("nada de lo que manda el cliente decide el destino del 303 (sin open redirect)", async () => {
    const desde = ip(202);
    const intentos: Array<[string, string]> = [
      ["/admin?_action=entrar&next=//evil.example", CONTRASENA],
      ["/admin?_action=entrar&destino=https://evil.example", "mala"],
    ];
    for (const [ruta, contrasena] of intentos) {
      const r = await e.pedir(ruta, {
        method: "POST",
        headers: { ...FORM, referer: "https://evil.example/x", "x-forwarded-for": desde },
        body: new URLSearchParams({ contrasena, next: "//evil.example", destino: "https://evil.example", redirect: "/\\evil.example" }).toString(),
      });
      await r.arrayBuffer();
      for (const linea of r.headers.getSetCookie()) anotar(linea.split(";")[0]);
      expect(r.status, ruta).toBe(303);
      expect(["/admin/cola", "/admin?error=incorrecta"], ruta).toContain(r.headers.get("location"));
    }
    const salir = await e.pedir("/admin/cola?_action=salir&next=//evil.example", {
      method: "POST",
      headers: { ...FORM, referer: "https://evil.example/x" },
      body: "next=%2F%2Fevil.example",
    });
    await salir.arrayBuffer();
    expect(salir.headers.get("location")).toBe("/admin?salida=1");
  });

  it("la misma respuesta para contraseña equivocada, vacía, larguísima, repetida o con bytes raros (sin enumeración ni eco)", async () => {
    const desde = ip(203);
    const cuerpos = [
      "contrasena=x",
      "contrasena=",
      `contrasena=${"a".repeat(10_000)}`,
      `contrasena=x&contrasena=${encodeURIComponent(CONTRASENA)}`,
      "contrasena=%00%FF%FE",
    ];
    for (const cuerpo of cuerpos) {
      const r = await e.pedir("/admin?_action=entrar", { method: "POST", headers: { ...FORM, "x-forwarded-for": desde }, body: cuerpo });
      const texto = await r.text();
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe("/admin?error=incorrecta");
      expect(r.headers.getSetCookie()).toEqual([]);
      expect(texto).toBe("");
    }
  });
});

describe("adversarial 5a · lo que pinta el panel con datos hostiles (con sesión)", () => {
  const sesion = () => ({ cookie: anotar(cookieDeSesion("vigente", SECRETO)) });

  it.each(["/admin/cola", "/admin/negocios?estado=en_revision"])("%s escapa nombres y colonias hostiles", async (ruta) => {
    const r = await e.pedir(ruta, { headers: sesion() });
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<svg\b|<img\b[^>]*onerror|\sonmouseover="|\sonload=/i);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain("&lt;script&gt;alert(&quot;c5a&quot;)&lt;/script&gt;");
    // Ningún WhatsApp en la cola ni en el listado (solo el detalle lo muestra).
    for (const i of HOSTILES.keys()) expect(html).not.toContain(WHATSAPP(i));
  });

  it("?estado= y ?pagina= hostiles: nunca un 500 ni su eco", async () => {
    const consultas = [
      "pagina=-1",
      "pagina=99999999999999999999999",
      "pagina=1e3",
      "pagina=0x10",
      "pagina=NaN",
      "pagina%5B%5D=2",
      "pagina=2&pagina=3",
      "estado%5B%5D=publicado",
      "estado=__proto__",
      "estado=constructor",
      "__proto__%5Bx%5D=1",
      "estado=%3Cscript%3Ec5a%3C%2Fscript%3E",
      "pagina=%00",
      `pagina=${"9".repeat(5000)}`,
    ];
    for (const q of consultas) {
      const r = await e.pedir(`/admin/negocios?${q}`, { headers: sesion() });
      const html = await r.text();
      expect(r.status, q).toBe(200);
      expect(html, q).not.toContain("<script>c5a");
      expect(html, q).not.toMatch(/__proto__|constructor/);
      expect(html, q).toMatch(/negocios? en esta lista/);
    }
  });
});

describe("adversarial 5a · el log", () => {
  it("después de todo lo anterior, el proceso no escribió la contraseña, la cookie, el secreto ni una IP", () => {
    const registro = e.registro();
    expect(registro).not.toContain(CONTRASENA);
    expect(registro).not.toContain(SECRETO);
    expect(cookiesUsadas.size).toBeGreaterThanOrEqual(3);
    for (const valor of cookiesUsadas) if (valor) expect(registro).not.toContain(valor.split(".")[1] ?? valor);
    expect(registro).not.toMatch(/203\.0\.113\.\d+/);
  });
});
