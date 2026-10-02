/**
 * EMULADOR LOCAL del Build Output API de Vercel (change
 * `migrar-lectura-publica-astro`, design.md §9). Trasladado del spike
 * (`spikes/astro/scripts/servidor-local.mjs`, T-021).
 *
 * `@astrojs/vercel` no implementa `astro preview`, así que para pedirle
 * respuestas a la salida REAL de `astro build` (`.vercel/output/`) sin un
 * preview se usa esto. NO es Vercel: reproduce lo mínimo que el sitio usa
 *
 * - rutas con `headers` + `continue: true` antes de `handle: filesystem`;
 * - archivos estáticos de `static/` (con `index.html` y `.html` implícitos);
 * - rutas con `dest` después del filesystem: a la función (`_render`) o a un
 *   estático (`/404.html`), con su `status` y sus `headers`.
 *
 * Lo que diga este servidor es evidencia "emulada"; la palabra final sobre lo
 * que sirve la CDN la tiene un preview de Vercel (tasks.md #19).
 *
 * Uso: npm run build && node scripts/servir-salida-vercel.mjs   (PORT=4321)
 * Con REGISTRO=1 escribe en consola método, ruta y estado.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const salida = path.resolve(process.env.SALIDA_VERCEL ?? ".vercel/output");
const { routes } = JSON.parse(readFileSync(path.join(salida, "config.json"), "utf8"));
const estaticos = path.join(salida, "static");
const raizFuncion = path.join(salida, "functions/_render.func");
const { handler } = JSON.parse(readFileSync(path.join(raizFuncion, ".vc-config.json"), "utf8"));

// En Vercel la función corre con cwd en su raíz (/var/task): así resuelve
// `sslrootcert=certs/...`.
process.chdir(raizFuncion);
const { default: funcion } = await import(pathToFileURL(path.join(raizFuncion, handler)).href);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const PUERTO = Number(process.env.PORT ?? 4321);
const indiceFilesystem = routes.findIndex((r) => r.handle === "filesystem");
if (indiceFilesystem === -1) throw new Error("config.json sin `handle: filesystem`");

/** Archivo de `static/` para una ruta, o `null`. Nunca sale de `static/`. */
function archivoEstatico(ruta) {
  let decodificada;
  try {
    decodificada = decodeURIComponent(ruta);
  } catch {
    return null;
  }
  for (const candidato of [decodificada, `${decodificada}.html`, `${decodificada}/index.html`]) {
    const completo = path.join(estaticos, candidato);
    if (!completo.startsWith(estaticos + path.sep) && completo !== estaticos) continue;
    if (existsSync(completo) && statSync(completo).isFile()) return completo;
  }
  return null;
}

function respuestaEstatica(archivo, status, cabeceras) {
  const headers = new Headers({ "content-type": TIPOS[path.extname(archivo)] ?? "application/octet-stream" });
  // Las de la tabla de rutas mandan (p. ej. `Content-Type` de un archivo sin extensión).
  for (const [nombre, valor] of Object.entries(cabeceras)) headers.set(nombre, valor);
  return new Response(readFileSync(archivo), { status, headers });
}

async function resolver(peticion) {
  const ruta = new URL(peticion.url).pathname;
  const cabeceras = {};
  for (const r of routes.slice(0, indiceFilesystem)) {
    if (r.headers && new RegExp(r.src).test(ruta)) Object.assign(cabeceras, r.headers);
  }
  const lectura = ["GET", "HEAD"].includes(peticion.method);
  const archivo = lectura ? archivoEstatico(ruta) : null;
  if (archivo) return respuestaEstatica(archivo, 200, cabeceras);

  const destino = routes.slice(indiceFilesystem + 1).find((r) => r.dest && new RegExp(r.src).test(ruta));
  if (!destino) return new Response("Not Found", { status: 404, headers: cabeceras });
  Object.assign(cabeceras, destino.headers ?? {});

  if (destino.dest.startsWith("/")) {
    const estatico = archivoEstatico(destino.dest);
    if (!estatico) return new Response("Not Found", { status: 404, headers: cabeceras });
    return respuestaEstatica(estatico, destino.status ?? 200, cabeceras);
  }

  const respuesta = await funcion.fetch(peticion);
  const final = new Response(respuesta.body, {
    status: destino.status ?? respuesta.status,
    headers: respuesta.headers,
  });
  for (const [nombre, valor] of Object.entries(cabeceras)) final.headers.set(nombre, valor);
  return final;
}

http
  .createServer(async (req, res) => {
    const conCuerpo = !["GET", "HEAD"].includes(req.method ?? "GET");
    const peticion = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v ?? ""]])),
      ...(conCuerpo ? { body: Readable.toWeb(req), duplex: "half" } : {}),
    });
    try {
      const respuesta = await resolver(peticion);
      const cabeceras = {};
      respuesta.headers.forEach((valor, nombre) => {
        if (nombre !== "set-cookie") cabeceras[nombre] = valor;
      });
      const cookies = respuesta.headers.getSetCookie();
      if (cookies.length) cabeceras["set-cookie"] = cookies;
      if (process.env.REGISTRO) console.log(`[petición] ${req.method} ${req.url} → ${respuesta.status}`);
      res.writeHead(respuesta.status, cabeceras);
      res.end(Buffer.from(await respuesta.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500).end("error del emulador");
    }
  })
  .listen(PUERTO, () => console.log(`[emulador] http://localhost:${PUERTO} sirviendo ${salida}`));
