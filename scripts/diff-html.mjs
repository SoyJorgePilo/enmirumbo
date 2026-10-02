/**
 * Diff de HTML: versión Next (rama `main`) vs. versión Astro, ruta por ruta
 * (change `migrar-lectura-publica-astro`, design.md §9; spec
 * `plataforma-astro`, requirement "El HTML servido no difiere del de Next").
 *
 * Uso:
 *   node scripts/diff-html.mjs <baseNext> <baseAstro> [--rutas archivo] [--incluir-2b]
 *   node scripts/diff-html.mjs --capturar-head <baseNext> <directorio>
 *
 * Sale con código 1 y lista cada diferencia por ruta; 0 si no hay ninguna.
 * NO corre en el CI (necesita las dos builds); su núcleo sí tiene pruebas
 * (`tests/diff-html.test.ts`).
 *
 * ── Cómo levantar las dos versiones con la MISMA base y el MISMO entorno ──
 *
 * 1. Base sembrada SOLO con datos ficticios, aparte de la de la suite (la
 *    suite la borra en cada corrida). Con `prisma dev`, un servidor con
 *    nombre propio:
 *      npx prisma dev --name diff -d       # anota el puerto TCP que imprime
 *      export DATABASE_URL="postgresql://postgres:postgres@localhost:<puerto>/template1?sslmode=disable"
 *      npx prisma migrate deploy && npx prisma db seed && npm run db:seed:demo
 *
 * 2. Entorno común (las prerenderizadas lo hornean al construir, así que se
 *    exporta ANTES de construir las dos):
 *      export SITIO_URL=https://enmirumbo.example
 *      # segunda corrida, con medición:
 *      # export NEXT_PUBLIC_UMAMI_SRC=https://cloud.umami.is/script.js
 *      # export NEXT_PUBLIC_UMAMI_WEBSITE_ID=00000000-0000-0000-0000-000000000000
 *
 * 3. Referencia Next de `main`, fuera del árbol de trabajo (sin tocar el repo):
 *      git worktree add ../enmirumbo-next main     # o: git archive main | tar -x -C ../enmirumbo-next
 *      cd ../enmirumbo-next && npm ci && npx next build && npx next start -p 3001
 *
 * 4. Astro, la salida real servida como la serviría Vercel:
 *      npm run build && PORT=4321 node scripts/servir-salida-vercel.mjs
 *
 * 5. node scripts/diff-html.mjs http://localhost:3001 http://localhost:4321
 *
 * ── Rutas ──
 *
 * Las del alcance de la Fase 2a. La 404 global se pide con `/a/b/c`: en Next,
 * `/no-existe` (un solo segmento) NO es la 404 global, la resuelve
 * `[destino]` con `notFound()`, que es Fase 2b. Esa y las demás de 2b entran
 * con `--incluir-2b`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compararRespuestas, limpiarHtml } from "./diff-html/nucleo.mjs";

/** Rutas de 2a. `dinamica`: también se exige el mismo `Cache-Control`. */
export const RUTAS_2A = [
  { ruta: "/", dinamica: true },
  { ruta: "/aviso-de-privacidad" },
  { ruta: "/terminos" },
  { ruta: "/a/b/c" },
  { ruta: "/robots.txt", dinamica: true },
  { ruta: "/sitemap.xml", dinamica: true },
  { ruta: "/opengraph-image" },
];

const RUTAS_2B = [{ ruta: "/no-existe" }, { ruta: "/loquesea" }, { ruta: "/negocio/inexistente" }, { ruta: "/buscar?q=tacos", dinamica: true }];

/** Páginas cuyo `<head>` se captura como fixture (tasks.md #5). */
const PAGINAS_DE_FIXTURE = [
  ["home", "/"],
  ["aviso-de-privacidad", "/aviso-de-privacidad"],
  ["terminos", "/terminos"],
  ["404", "/a/b/c"],
];

async function pedir(base, ruta) {
  const respuesta = await fetch(new URL(ruta, base), { redirect: "manual" });
  const headers = {};
  respuesta.headers.forEach((valor, nombre) => {
    headers[nombre] = valor;
  });
  const tipo = (headers["content-type"] ?? "").toLowerCase();
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  const cuerpo = tipo.startsWith("image/") ? bytes : new TextDecoder().decode(bytes);
  return { status: respuesta.status, headers, cuerpo };
}

async function capturarHead(baseNext, directorio) {
  mkdirSync(directorio, { recursive: true });
  for (const [nombre, ruta] of PAGINAS_DE_FIXTURE) {
    const { cuerpo } = await pedir(baseNext, ruta);
    const head = /<head>([\s\S]*?)<\/head>/.exec(limpiarHtml(String(cuerpo)))?.[1] ?? "";
    const archivo = path.join(directorio, `${nombre}.html`);
    writeFileSync(archivo, `${head.replace(/></g, ">\n<")}\n`);
    console.log(`capturado ${archivo}`);
  }
}

async function principal(argumentos) {
  if (argumentos[0] === "--capturar-head") {
    await capturarHead(argumentos[1], argumentos[2]);
    return 0;
  }
  const [baseNext, baseAstro] = argumentos;
  if (!baseNext || !baseAstro) {
    console.error("Uso: node scripts/diff-html.mjs <baseNext> <baseAstro> [--rutas archivo] [--incluir-2b]");
    return 2;
  }
  let rutas = [...RUTAS_2A, ...(argumentos.includes("--incluir-2b") ? RUTAS_2B : [])];
  const iRutas = argumentos.indexOf("--rutas");
  if (iRutas !== -1) {
    rutas = readFileSync(argumentos[iRutas + 1], "utf8")
      .split("\n")
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map((ruta) => ({ ruta, dinamica: !RUTAS_2A.some((r) => r.ruta === ruta && !r.dinamica) }));
  }

  const diferencias = [];
  for (const { ruta, dinamica } of rutas) {
    const [next, astro] = await Promise.all([pedir(baseNext, ruta), pedir(baseAstro, ruta)]);
    const propias = compararRespuestas(ruta, next, astro, { dinamica: Boolean(dinamica) });
    console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} ${ruta} (${next.status}/${astro.status})`);
    diferencias.push(...propias);
  }
  if (diferencias.length > 0) {
    console.log(`\n${diferencias.length} diferencias:\n`);
    for (const d of diferencias) console.log(`- ${d}`);
    return 1;
  }
  console.log(`\nCero diferencias en ${rutas.length} rutas.`);
  return 0;
}

process.exitCode = await principal(process.argv.slice(2));
