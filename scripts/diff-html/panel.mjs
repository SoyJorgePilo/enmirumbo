/**
 * El panel en el diff de HTML (change `migrar-panel-admin-base-astro`, Fase
 * 5a; design.md §7): las rutas y estados de `/admin`, la cola, "Todos los
 * negocios" y el comodín, la captura de los fixtures de Next
 * (`tests/fixtures/next-5a/`) y la comparación contra Astro.
 *
 * SIN NORMALIZACIONES NUEVAS. El formulario de acceso y el botón "Salir" usan
 * las dos `NORMALIZACIONES_FORMULARIO` de 3a; el comodín, las tres
 * `NORMALIZACIONES_404_DINAMICA` de 2b (Next responde ahí su documento de
 * error). Lo demás sale como diferencia. Las diferencias ACEPTADAS (design.md
 * §7) se comparan aparte, con su propia comprobación, y se imprimen como
 * "ACEPTADA":
 *
 * - `Referrer-Policy` bajo `/admin`: Next manda la global
 *   (`strict-origin-when-cross-origin`) y la endurece con el `<meta>`; Astro
 *   manda además la cabecera `strict-origin` (decisión 1 del fundador). Se
 *   exige que Next traiga la global, Astro `strict-origin` y los dos el `<meta>`.
 * - Las redirecciones sin sesión: Next acompaña el 307 con su documento de
 *   error (`text/html`, sin datos); Astro, sin cuerpo. Se comparan estado,
 *   `Location`, `Cache-Control`, `Set-Cookie` y las otras tres cabeceras.
 *
 * Cookies y contraseñas: ficticias, y en los fixtures nunca va el valor de
 * una cookie (solo sus atributos).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Frasco, enviarFormulario, leerSetCookie, resumenDelDesenlace } from "../enviar-formulario.mjs";
import { CABECERAS_DE_SEGURIDAD, compararRespuestas, limpiarHtml } from "./nucleo.mjs";

/** El valor de la cabecera de referente que pone Astro bajo `/admin` (y el del `<meta>`). */
export const REFERENTE_DEL_PANEL = "strict-origin";

/** La política global del sitio (la que manda Next también bajo `/admin`). */
export const REFERENTE_GLOBAL = "strict-origin-when-cross-origin";

/** Las pantallas de acceso con el panel configurado: `[archivo, ruta]`. */
export const PANTALLAS_DE_ACCESO = [
  ["acceso.html", "/admin"],
  ["acceso-error-incorrecta.html", "/admin?error=incorrecta"],
  ["acceso-error-intentos.html", "/admin?error=intentos"],
  ["acceso-error-x.html", "/admin?error=x"],
  ["acceso-error-x-y-intentos.html", "/admin?error=x&error=intentos"],
  ["acceso-salida.html", "/admin?salida=1"],
];

/** Las tres configuraciones incompletas (cada una, su propio servidor): `[archivo, nombre]`. */
export const ACCESO_SIN_CONFIGURAR = [
  ["acceso-sin-configurar.html", "sin-configurar"],
  ["acceso-sin-secreto.html", "sin-secreto"],
  ["acceso-secreto-corto.html", "secreto-corto"],
];

/** "Todos los negocios" con 60 registros: `[archivo, ruta]`. */
export const PANTALLAS_DEL_LISTADO = [
  ["negocios.html", "/admin/negocios"],
  ...["publicado", "rechazado", "en_revision", "xyz", ""].map((e) => [`negocios-estado-${e || "vacio"}.html`, `/admin/negocios?estado=${e}`]),
  ["negocios-estado-repetido.html", "/admin/negocios?estado=rechazado&estado=publicado"],
  ...["2", "99", "0", "-3", "dos"].map((p) => [`negocios-pagina-${p}.html`, `/admin/negocios?pagina=${p}`]),
  ["negocios-pagina-repetida.html", "/admin/negocios?pagina=2&pagina=3"],
];

/** Direcciones del panel que no existen (el comodín), con y sin sesión. */
export const RUTAS_DEL_COMODIN = ["/admin/x", "/admin/a/b/c", "/admin/registros/c5aficticio000000000000001/loquesea"];

/** Pantallas que exigen sesión. */
export const RUTAS_CON_SESION = ["/admin/cola", "/admin/negocios", "/admin/negocios?estado=publicado&pagina=2"];

/**
 * Formas de pedir una pantalla sin sesión que NO son un envío de Action
 * (Next las responde todas con el 307 de su guarda, medido en la tarea 2).
 */
export const FORMAS_SIN_ACCION = [
  { metodo: "GET" },
  { metodo: "HEAD" },
  { metodo: "POST", cuerpo: "a=1" },
  { metodo: "PUT", cuerpo: "a=1" },
  { metodo: "DELETE" },
];

const UTILES = ["location", "cache-control", "content-type", ...CABECERAS_DE_SEGURIDAD.filter((h) => h !== "content-security-policy")];

/** Lo comparable de una respuesta (sin la CSP, que es la misma de siempre, y sin valores de cookie). */
export function resumenDeRespuesta(status, headers, cookies) {
  const h = headers instanceof Headers ? Object.fromEntries(headers) : headers;
  return {
    status,
    ...Object.fromEntries(UTILES.filter((k) => h[k] !== undefined && h[k] !== null).map((k) => [k, h[k]])),
    csp: h["content-security-policy"] !== undefined && h["content-security-policy"] !== null,
    cookies: (cookies ?? []).map((linea) => {
      const { nombre, atributos } = leerSetCookie(linea);
      const sinFecha = Object.entries(atributos)
        .filter(([clave]) => clave !== "expires")
        .map(([clave, valor]) => [clave, clave === "samesite" ? valor.toLowerCase() : valor]);
      return { nombre, ...Object.fromEntries(sinFecha.sort()) };
    }),
  };
}

/**
 * Una redirección sin sesión de Next contra la de Astro: estado, `Location`,
 * `Cache-Control`, cookies y cabeceras de seguridad (la de referente, con la
 * diferencia aceptada). El cuerpo y el `Content-Type` no: Next manda su
 * documento de error y Astro, nada.
 */
export function compararRedireccion(ruta, next, astro) {
  const d = [];
  if (next.status !== astro.status) d.push(`estado: ${next.status} ≠ ${astro.status}`);
  for (const k of ["location", "cache-control", "x-content-type-options", "x-frame-options"]) {
    if (next[k] !== astro[k]) d.push(`${k}: «${next[k]}» ≠ «${astro[k]}»`);
  }
  if (!astro.csp) d.push("content-security-policy: falta en Astro");
  if (JSON.stringify(next.cookies) !== JSON.stringify(astro.cookies)) d.push(`set-cookie: ${JSON.stringify(next.cookies)} ≠ ${JSON.stringify(astro.cookies)}`);
  d.push(...diferenciaDeReferente(next["referrer-policy"], astro["referrer-policy"]));
  return d.map((x) => `${ruta} · ${x}`);
}

/** La diferencia aceptada de la cabecera de referente: Next la global, Astro la del panel. */
export function diferenciaDeReferente(deNext, deAstro) {
  if (deNext !== REFERENTE_GLOBAL) return [`referrer-policy de Next: «${deNext}» (se esperaba la global)`];
  if (deAstro !== REFERENTE_DEL_PANEL) return [`referrer-policy de Astro: «${deAstro}» (se esperaba ${REFERENTE_DEL_PANEL})`];
  return [];
}

/** ¿El documento declara `<meta name="referrer" content="strict-origin">`? */
export function tieneMetaDeReferente(html) {
  return /<meta name="referrer" content="strict-origin"\s*\/?>/.test(String(html));
}

/**
 * Una pantalla del panel de Next contra la de Astro, con la diferencia
 * aceptada de la cabecera de referente: se comprueba aparte (y que los dos
 * documentos traigan el `<meta>`) y para el resto de la comparación se toma
 * la de Next.
 */
export function compararPantallaDelPanel(ruta, next, astro, opciones = {}) {
  const deAstro = astro.headers["referrer-policy"];
  const d = diferenciaDeReferente(next.headers["referrer-policy"], deAstro).map((x) => `${ruta} · ${x}`);
  const tipo = String(next.headers["content-type"] ?? "");
  if (tipo.startsWith("text/html")) {
    if (!tieneMetaDeReferente(next.cuerpo)) d.push(`${ruta} · <meta name="referrer"> falta en Next`);
    if (!tieneMetaDeReferente(astro.cuerpo)) d.push(`${ruta} · <meta name="referrer"> falta en Astro`);
  }
  const igualada = { ...astro, headers: { ...astro.headers, "referrer-policy": next.headers["referrer-policy"] } };
  return [...d, ...compararRespuestas(ruta, next, igualada, opciones)];
}

// ── Captura de los fixtures de Next (tasks.md #2) ────────────────────────────

const legible = (html) => `${html.replace(/></g, ">\n<")}\n`;

async function pedir(base, ruta, { metodo = "GET", cookie, cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(cuerpo !== undefined ? { origin: new URL(base).origin, "content-type": "application/x-www-form-urlencoded" } : {}), ...cabeceras },
    body: cuerpo,
  });
  const texto = metodo === "HEAD" ? "" : await r.text();
  return { status: r.status, headers: Object.fromEntries(r.headers), cookies: r.headers.getSetCookie(), cuerpo: texto };
}

/**
 * Los fixtures de 5a contra Next de `main`. `bases`: `{ configurado,
 * "sin-configurar", "sin-secreto", "secreto-corto" }` (cuatro procesos de la
 * MISMA build y la misma base; el configurado con `PANEL_CONTRASENA` y
 * `PANEL_SESION_SECRETO` del entorno de quien captura). Siembra la cola y el
 * listado con `tests/panel-astro.ts` (necesita `tsx` y `DATABASE_URL`, la
 * base que sirve Next) y lo borra al terminar.
 */
export async function capturar5a(bases, directorio) {
  mkdirSync(directorio, { recursive: true });
  const escribir = (nombre, contenido) => {
    const archivo = path.join(directorio, nombre);
    writeFileSync(archivo, contenido);
    console.log(`capturado ${archivo}`);
  };
  const panel = await import("../../tests/panel-astro.ts");
  const { crearClientePrueba } = await import("../../tests/db.ts");
  const prisma = crearClientePrueba();
  const secreto = process.env.PANEL_SESION_SECRETO;
  const contrasena = process.env.PANEL_CONTRASENA;
  if (!secreto || !contrasena) throw new Error("--capturar-5a necesita PANEL_SESION_SECRETO y PANEL_CONTRASENA (los del Next configurado)");
  const sesion = panel.cookieDeSesion("vigente", secreto);
  const base = bases.configurado;
  const respuestas = { pantallas: {}, sinSesion: {}, envios: {} };
  const guardarPantalla = async (archivo, b, ruta, cookie) => {
    const r = await pedir(b, ruta, { cookie });
    escribir(archivo, legible(limpiarHtml(r.cuerpo)));
    respuestas.pantallas[archivo] = { ruta, ...resumenDeRespuesta(r.status, r.headers, r.cookies), metaDeReferente: tieneMetaDeReferente(r.cuerpo) };
  };

  await panel.borrarLoDe5a(prisma);
  try {
    for (const [archivo, ruta] of PANTALLAS_DE_ACCESO) await guardarPantalla(archivo, base, ruta);
    for (const [archivo, nombre] of ACCESO_SIN_CONFIGURAR) if (bases[nombre]) await guardarPantalla(archivo, bases[nombre], "/admin");
    await guardarPantalla("a-b-c.html", base, "/a/b/c");
    await guardarPantalla("cola-vacia.html", base, "/admin/cola", sesion);
    await guardarPantalla("negocios-vacio.html", base, "/admin/negocios", sesion);
    await panel.sembrarCola(prisma);
    await guardarPantalla("cola.html", base, "/admin/cola", sesion);
    // La referencia del 303 de una Action guardada sin sesión (design.md §1.1):
    // "Aprobar" de una ficha en revisión, leído con sesión y mandado sin ella.
    // En Astro esa pantalla llega en 5b; aquí solo se mide Next.
    const frasco = new Frasco();
    frasco.guardar([`${sesion}; Path=/admin`]);
    const aprobar = await enviarFormulario({ urlPagina: new URL(`/admin/registros/${panel.COLA_5A.atrasada}`, base).toString(), frasco, cookieDelEnvio: null });
    respuestas.sinSesion["Action guardada (aprobar) sin sesión"] = desenlace(aprobar, 0).post;
    await panel.borrarLoDe5a(prisma);
    await panel.sembrarListado(prisma, 60);
    for (const [archivo, ruta] of PANTALLAS_DEL_LISTADO) await guardarPantalla(archivo, base, ruta, sesion);
    await panel.borrarLoDe5a(prisma);
    for (const [i, ruta] of RUTAS_DEL_COMODIN.entries()) {
      await guardarPantalla(`comodin-${i + 1}.html`, base, ruta);
      await guardarPantalla(`comodin-${i + 1}-con-sesion.html`, base, ruta, sesion);
    }

    // Sin sesión: cada pantalla con cada forma, y la cola con cada cookie inválida.
    for (const ruta of RUTAS_CON_SESION) {
      for (const forma of FORMAS_SIN_ACCION) {
        const r = await pedir(base, ruta, { metodo: forma.metodo, cuerpo: forma.cuerpo });
        respuestas.sinSesion[`${forma.metodo} ${ruta}`] = resumenDeRespuesta(r.status, r.headers, r.cookies);
      }
    }
    for (const tipo of panel.SESIONES_INVALIDAS) {
      const r = await pedir(base, "/admin/cola", { cookie: panel.cookieDeSesion(tipo, secreto) });
      respuestas.sinSesion[`GET /admin/cola (${tipo})`] = resumenDeRespuesta(r.status, r.headers, r.cookies);
    }
    for (const [, nombre] of ACCESO_SIN_CONFIGURAR) {
      if (!bases[nombre]) continue;
      const r = await pedir(bases[nombre], "/admin/cola", { cookie: sesion });
      respuestas.sinSesion[`GET /admin/cola (vigente, ${nombre})`] = resumenDeRespuesta(r.status, r.headers, r.cookies);
    }
    const r = await pedir(base, "/admin", { cookie: sesion });
    respuestas.sinSesion["GET /admin (con sesión)"] = resumenDeRespuesta(r.status, r.headers, r.cookies);

    respuestas.envios = await enviosDe5a(base, bases["sin-configurar"], { prisma, panel, secreto, contrasena });
  } finally {
    await panel.borrarLoDe5a(prisma);
    await prisma.$disconnect();
  }
  escribir("respuestas.json", `${JSON.stringify(respuestas, null, 2)}\n`);
}

/** El desenlace de un envío: la cadena (estados, `Location`, atributos de cookies) y la cabecera del POST. */
function desenlace(r, intentos) {
  const post = r.cadena[1];
  return {
    cadena: resumenDelDesenlace(r),
    post: resumenDeRespuesta(post.status, post.cabeceras, post.setCookie),
    intentos,
  };
}

/**
 * Los envíos sin JS del scenario "mismos desenlaces y misma cookie que Next"
 * (design.md §7): entrar bien, mal, vacía, de 10 000 caracteres, con el margen
 * agotado y sin configurar; salir con y sin sesión; y una Action guardada sin
 * sesión. Lo usan la captura (Next) y la prueba (Astro), con la misma forma.
 * `ctx`: `{ prisma, panel, secreto, contrasena }`; `baseSinConfigurar`, un
 * servidor de la misma build sin `PANEL_CONTRASENA` (si no hay, se omite).
 */
export async function enviosDe5a(base, baseSinConfigurar, ctx) {
  const { prisma, panel, secreto, contrasena } = ctx;
  const usadas = new Set();
  let n = 0;
  const otraIp = () => {
    const ip = `203.0.113.${100 + (n++ % 100)}`;
    usadas.add(ip);
    return ip;
  };
  /** @type {Record<string, { cadena: unknown, intentos: number, post: Record<string, unknown>, atras?: unknown }>} */
  const salida = {};
  const entrar = async (nombre, clave, ip = otraIp(), destino = base) => {
    // El POST va a `destino` (la página se abre en `base`): así se manda el
    // mismo formulario a un servidor sin configurar.
    const pedirA = destino === base ? fetch : (url, init) => fetch(init?.method === "POST" ? String(url).replace(base, destino) : url, init);
    const r = await enviarFormulario({
      urlPagina: new URL("/admin", base).toString(),
      elecciones: { contrasena: clave },
      cabecerasExtra: { "x-forwarded-for": ip, ...(destino === base ? {} : { origin: new URL(destino).origin }) },
      pedir: pedirA,
    });
    salida[nombre] = desenlace(r, await panel.intentosDe(prisma, ip, secreto));
  };
  try {
    await entrar("entrar-correcta", contrasena);
    await entrar("entrar-equivocada", "no-es-la-clave-ficticia");
    await entrar("entrar-vacia", "");
    await entrar("entrar-10000", "x".repeat(10_000));
    const misma = otraIp();
    for (let i = 1; i <= 6; i++) await entrar(`margen-${i}`, i === 6 ? contrasena : "no-es-la-clave-ficticia", misma);
    if (baseSinConfigurar) await entrar("sin-configurar", contrasena, otraIp(), baseSinConfigurar);

    const conSesion = () => {
      const f = new Frasco();
      f.guardar([`${panel.cookieDeSesion("vigente", secreto)}; Path=/admin`]);
      return f;
    };
    const cola = new URL("/admin/cola", base).toString();
    const f1 = conSesion();
    const salir = await enviarFormulario({ urlPagina: cola, frasco: f1 });
    const atras = await fetch(cola, { redirect: "manual", headers: f1.cabecera(cola) ? { cookie: f1.cabecera(cola) } : {} });
    salida["salir-con-sesion"] = { ...desenlace(salir, 0), atras: { status: atras.status, location: atras.headers.get("location") } };
    const sinSesion = await enviarFormulario({ urlPagina: cola, frasco: conSesion(), cookieDelEnvio: null });
    salida["salir-sin-sesion"] = desenlace(sinSesion, 0);
  } finally {
    await panel.borrarIntentos(prisma, usadas, secreto);
  }
  return salida;
}

// ── Comparación en vivo, Next contra Astro (tasks.md #15) ────────────────────

const comoRespuesta = async (r, metodo = "GET") => ({
  status: r.status,
  headers: Object.fromEntries(r.headers),
  cookies: r.headers.getSetCookie(),
  cuerpo: metodo === "HEAD" ? "" : await r.text(),
});

/**
 * Las rutas, estados y envíos de 5a contra las dos versiones, que corren con
 * la MISMA base, `PANEL_CONTRASENA`, `PANEL_SESION_SECRETO` y
 * `REGISTRO_ENCABEZADO_IP` (los del entorno de quien compara). `incompletos`:
 * `{ "sin-configurar": [bNext, bAstro], … }` (opcional). Siembra la cola y el
 * listado con `tests/panel-astro.ts` (necesita `tsx` y `DATABASE_URL`) y lo
 * borra al terminar. Devuelve las diferencias; imprime cada ruta y dónde se
 * aplicó cada normalización.
 */
export async function compararPanel(baseNext, baseAstro, { incompletos = {}, normalizacionesFormulario, normalizaciones404 }) {
  const panel = await import("../../tests/panel-astro.ts");
  const { crearClientePrueba } = await import("../../tests/db.ts");
  const prisma = crearClientePrueba();
  const secreto = process.env.PANEL_SESION_SECRETO;
  const contrasena = process.env.PANEL_CONTRASENA;
  if (!secreto || !contrasena) throw new Error("--solo-5a necesita PANEL_SESION_SECRETO y PANEL_CONTRASENA (los de las dos versiones)");
  const sesion = panel.cookieDeSesion("vigente", secreto);
  const diferencias = [];
  const aplicadasFormulario = Object.fromEntries(normalizacionesFormulario.map((n) => [n.id, []]));
  const aplicadas404 = Object.fromEntries(normalizaciones404.map((n) => [n.id, []]));
  const referencia404 = await (await fetch(new URL("/a/b/c", baseNext))).text();
  let aceptadasReferente = 0;
  let aceptadasRedireccion = 0;

  const pantalla = async (etiqueta, ruta, { cookie, formulario = false, es404 = false, bases = [baseNext, baseAstro] } = {}) => {
    const [n, a] = await Promise.all(bases.map(async (b) => comoRespuesta(await fetch(new URL(ruta, b), { redirect: "manual", headers: cookie ? { cookie } : {} }))));
    const deFormulario = [];
    const de404 = [];
    const propias = compararPantallaDelPanel(etiqueta, n, a, {
      dinamica: true,
      ...(formulario ? { formulario: { urlPagina: new URL(ruta, bases[0]).toString(), aplicadas: deFormulario } } : {}),
      ...(es404 ? { referencia404, aplicadas: de404 } : {}),
    });
    for (const id of deFormulario) aplicadasFormulario[id].push(etiqueta);
    for (const id of de404) aplicadas404[id].push(etiqueta);
    if (n.headers["referrer-policy"] !== a.headers["referrer-policy"]) aceptadasReferente++;
    const marca = (deFormulario.length ? ` [formulario: ${deFormulario.length}]` : "") + (de404.length ? ` [404 dinámica: ${de404.length}]` : "");
    console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} ${etiqueta} (${n.status}/${a.status})${marca}`);
    diferencias.push(...propias);
  };

  const redireccion = async (etiqueta, ruta, init = {}) => {
    const [n, a] = await Promise.all(
      [baseNext, baseAstro].map(async (b) => {
        const r = await fetch(new URL(ruta, b), { redirect: "manual", ...init, headers: { ...(init.cuerpo ? { origin: new URL(b).origin } : {}), ...(init.headers ?? {}) } });
        return resumenDeRespuesta(r.status, r.headers, r.headers.getSetCookie());
      }),
    );
    const propias = compararRedireccion(etiqueta, n, a);
    if (n["content-type"] !== a["content-type"]) aceptadasRedireccion++;
    console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} ${etiqueta} (${n.status}/${a.status})`);
    diferencias.push(...propias);
  };

  await panel.borrarLoDe5a(prisma);
  try {
    for (const [, ruta] of PANTALLAS_DE_ACCESO) await pantalla(ruta, ruta, { formulario: true });
    for (const [, nombre] of ACCESO_SIN_CONFIGURAR) {
      if (incompletos[nombre]) await pantalla(`/admin (${nombre})`, "/admin", { bases: incompletos[nombre] });
    }
    await redireccion("GET /admin (con sesión)", "/admin", { headers: { cookie: sesion } });
    await pantalla("/admin/cola (vacía)", "/admin/cola", { cookie: sesion, formulario: true });
    await pantalla("/admin/negocios (vacío)", "/admin/negocios", { cookie: sesion });
    await panel.sembrarCola(prisma);
    await pantalla("/admin/cola (sembrada)", "/admin/cola", { cookie: sesion, formulario: true });
    await panel.borrarLoDe5a(prisma);
    await panel.sembrarListado(prisma, 60);
    for (const [, ruta] of PANTALLAS_DEL_LISTADO) await pantalla(`${ruta} (60)`, ruta, { cookie: sesion });
    await panel.borrarLoDe5a(prisma);
    for (const ruta of RUTAS_DEL_COMODIN) {
      await pantalla(ruta, ruta, { es404: true });
      await pantalla(`${ruta} (con sesión)`, ruta, { cookie: sesion, es404: true });
    }
    for (const ruta of RUTAS_CON_SESION) {
      for (const forma of FORMAS_SIN_ACCION) {
        await redireccion(`${forma.metodo} ${ruta} (sin sesión)`, ruta, {
          method: forma.metodo,
          body: forma.cuerpo,
          cuerpo: forma.cuerpo,
          headers: forma.cuerpo ? { "content-type": "application/x-www-form-urlencoded" } : {},
        });
      }
    }
    for (const tipo of panel.SESIONES_INVALIDAS) await redireccion(`GET /admin/cola (${tipo})`, "/admin/cola", { headers: { cookie: panel.cookieDeSesion(tipo, secreto) } });

    // Envíos sin JS: la misma secuencia en las dos, con los intentos borrados entre una y otra.
    console.log("\nEnvíos del acceso (sin JS):");
    const ctx = { prisma, panel, secreto, contrasena };
    const deNext = await enviosDe5a(baseNext, incompletos["sin-configurar"]?.[0], ctx);
    const deAstro = await enviosDe5a(baseAstro, incompletos["sin-configurar"]?.[1], ctx);
    for (const [nombre, n] of Object.entries(deNext)) {
      const a = deAstro[nombre];
      const propias = [];
      if (JSON.stringify(n.cadena) !== JSON.stringify(a.cadena)) propias.push(`cadena: ${JSON.stringify(n.cadena)} ≠ ${JSON.stringify(a.cadena)}`);
      if (n.intentos !== a.intentos) propias.push(`intentos: ${n.intentos} ≠ ${a.intentos}`);
      if (JSON.stringify(n.atras) !== JSON.stringify(a.atras)) propias.push(`atrás: ${JSON.stringify(n.atras)} ≠ ${JSON.stringify(a.atras)}`);
      propias.push(...compararRedireccion(`POST ${nombre}`, n.post, a.post));
      console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} envío ${nombre} (${n.cadena.map((p) => p.status).join("→")} / ${a.cadena.map((p) => p.status).join("→")}; intentos ${n.intentos}/${a.intentos})`);
      diferencias.push(...propias.map((d) => `envío ${nombre} · ${d}`));
    }
  } finally {
    await panel.borrarLoDe5a(prisma);
    await prisma.$disconnect();
  }

  console.log(`\nACEPTADA Referrer-Policy bajo /admin (Next la global + <meta>; Astro strict-origin): ${aceptadasReferente} respuestas`);
  console.log(`ACEPTADA cuerpo de la redirección sin sesión (Next su documento de error text/html; Astro sin cuerpo): ${aceptadasRedireccion} respuestas`);
  console.log("Normalizaciones del formulario aplicadas (NORMALIZACIONES_FORMULARIO):");
  for (const { id, descripcion } of normalizacionesFormulario) console.log(`- ${id} (${descripcion}): ${aplicadasFormulario[id].length} → ${aplicadasFormulario[id].join(", ") || "ninguna"}`);
  console.log("Normalizaciones de la 404 dinámica aplicadas (NORMALIZACIONES_404_DINAMICA):");
  for (const { id, descripcion } of normalizaciones404) console.log(`- ${id} (${descripcion}): ${aplicadas404[id].length} → ${aplicadas404[id].join(", ") || "ninguna"}`);
  return diferencias;
}
