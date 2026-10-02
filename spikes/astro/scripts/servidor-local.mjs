/**
 * EMULADOR LOCAL del Build Output API de Vercel, solo para juntar evidencia
 * sin preview (T-021). NO es Vercel: reproduce lo mínimo —rutas con
 * `headers`+`continue`, `handle: filesystem` y despacho a la función— para
 * pedirle a la salida REAL de `astro build` (`.vercel/output/`) las mismas
 * respuestas que se le pedirán al preview. Lo que diga este servidor se marca
 * en el reporte como "emulado"; la palabra final la tiene el preview.
 *
 * Uso: npm run build && node scripts/servidor-local.mjs   (puerto 4321)
 * Con REGISTRO=1 escribe en consola método, ruta, Origin, Referer y estado.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const salida = path.resolve(".vercel/output");
const { routes } = JSON.parse(readFileSync(path.join(salida, "config.json"), "utf8"));
const estaticos = path.join(salida, "static");
const raizFuncion = path.join(salida, "functions/_render.func");
const { handler } = JSON.parse(readFileSync(path.join(raizFuncion, ".vc-config.json"), "utf8"));

// En Vercel el proceso de la función corre con cwd en la raíz de la función
// (/var/task): así se resuelve `sslrootcert=certs/...`.
process.chdir(raizFuncion);
const { default: funcion } = await import(pathToFileURL(path.join(raizFuncion, handler)).href);

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const PUERTO = Number(process.env.PORT ?? 4321);
const indiceFilesystem = routes.findIndex((r) => r.handle === "filesystem");

function archivoEstatico(ruta) {
  for (const candidato of [ruta, `${ruta}/index.html`, `${ruta}index.html`]) {
    const completo = path.join(estaticos, decodeURIComponent(candidato));
    if (completo.startsWith(estaticos) && existsSync(completo) && statSync(completo).isFile()) return completo;
  }
  return null;
}

async function resolver(peticion) {
  const ruta = new URL(peticion.url).pathname;
  const cabeceras = {};
  for (const r of routes.slice(0, indiceFilesystem)) {
    if (r.headers && new RegExp(r.src).test(ruta)) Object.assign(cabeceras, r.headers);
  }
  const archivo = ["GET", "HEAD"].includes(peticion.method) ? archivoEstatico(ruta) : null;
  if (archivo) {
    return new Response(readFileSync(archivo), {
      headers: { "content-type": TIPOS[path.extname(archivo)] ?? "application/octet-stream", ...cabeceras },
    });
  }
  const destino = routes.slice(indiceFilesystem + 1).find((r) => r.dest && new RegExp(r.src).test(ruta));
  if (!destino) return new Response("Not Found", { status: 404 });
  const respuesta = await funcion.fetch(peticion);
  for (const [nombre, valor] of Object.entries(cabeceras)) respuesta.headers.set(nombre, valor);
  return destino.status ? new Response(respuesta.body, { status: destino.status, headers: respuesta.headers }) : respuesta;
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
      if (process.env.REGISTRO) {
        console.log(
          `[petición] ${req.method} ${req.url} origin=${req.headers.origin ?? "(ninguno)"} ` +
            `referer=${req.headers.referer ?? "(ninguno)"} → ${respuesta.status} ${respuesta.headers.get("location") ?? ""}`,
        );
      }
      res.writeHead(respuesta.status, cabeceras);
      res.end(Buffer.from(await respuesta.arrayBuffer()));
    } catch (error) {
      console.error(error);
      res.writeHead(500).end("error del emulador");
    }
  })
  .listen(PUERTO, () => console.log(`[emulador] http://localhost:${PUERTO} sirviendo .vercel/output`));
