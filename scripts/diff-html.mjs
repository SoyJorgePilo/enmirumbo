/**
 * Diff de HTML: versión Next (rama `main`) vs. versión Astro, ruta por ruta
 * (change `migrar-lectura-publica-astro`, design.md §9; spec
 * `plataforma-astro`, requirement "El HTML servido no difiere del de Next").
 *
 * Uso:
 *   node scripts/diff-html.mjs <baseNext> <baseAstro> --datos <json> [--rutas archivo]
 *   node scripts/diff-html.mjs --capturar-head <baseNext> <directorio>
 *   node scripts/diff-html.mjs --capturar-2b <baseNext> <directorio> --datos <json>
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
 * 5. node scripts/diff-html.mjs http://localhost:3001 http://localhost:4321 --datos datos.json
 *
 * ── Rutas ──
 *
 * Las de 2a y, desde el change `migrar-directorio-publico-astro` (2b,
 * design.md §7), SIEMPRE las de 2b: `--incluir-2b` se sigue aceptando pero ya
 * no cambia nada. Las rutas de 2b necesitan datos de la base (identificadores
 * de fichas no publicadas y claves de foto): se pasan con `--datos <json>`,
 * con esta forma (todo ficticio, del seed demo más los extras del dev):
 *
 *   { "revision": "<id>", "rechazado": "<id>", "despublicado": "<id>",
 *     "idFichaConFoto": "<id>", "fotoPublicada": "<clave>", "fotoRevision": "<clave>",
 *     "fotoRechazada": "<clave>" }
 *
 * Las fichas publicadas, categorías, giros y pares giro+colonia salen del
 * `sitemap.xml` de Next. La 404 global se pide con `/a/b/c`.
 *
 * ── 404 dinámicas (alternativa B) ──
 *
 * En las URLs de `rutas404Dinamicas` el `<body>` de Astro se compara contra el
 * que pinta Next en `/a/b/c`, con las tres normalizaciones de
 * `NORMALIZACIONES_404_DINAMICA` y nada más. La salida dice en qué URL se
 * aplicó cada una.
 *
 * ── Capturar fixtures ──
 *
 *   node scripts/diff-html.mjs --capturar-2b <baseNext> <directorio> --datos <json>
 *
 * Escribe en `<directorio>` lo que piden las pruebas de 2b (tasks.md #2): el
 * documento de la 404 dinámica, el `<body>` de `/a/b/c`, el `<head>` de un
 * giro vacío, de una ficha con foto y de `/buscar?q=plomero`, y las cabeceras
 * de una foto publicada y de una foto 404. Identificadores y claves se
 * sustituyen por `<id>` y `<clave>`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compararRespuestas, limpiarHtml, NORMALIZACIONES_404_DINAMICA } from "./diff-html/nucleo.mjs";

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

/** La consulta hostil del scenario: NUL, U+202E, 300 caracteres y un emoji en el corte. */
export const CONSULTA_HOSTIL = `plomero\u0000\u202e${"a".repeat(70)}😀${"b".repeat(230)}`;

/** Las 404 dinámicas del §7 (más `/no-existe`): las únicas con normalizaciones. */
export function rutas404Dinamicas(datos) {
  return [
    "/no-existe",
    "/loquesea",
    "/plomeria-colonia-inventada",
    "/negocio/inexistente",
    "/negocio/sin-identificador",
    "/negocio/x-cnoexiste0000000000000000",
    `/negocio/x-${datos.revision}`,
    `/negocio/x-${datos.rechazado}`,
    `/negocio/x-${datos.despublicado}`,
  ];
}

/** Rutas de 2b (design.md §7). `urlsDelSitemap`: las rutas del sitemap de Next. */
export function rutas2b(datos, urlsDelSitemap) {
  const delSitemap = urlsDelSitemap.filter((r) => r !== "/" && r !== "/registro");
  const fichaPublicada = delSitemap.find((r) => r.startsWith("/negocio/"));
  const idPublicado = fichaPublicada?.split("-").at(-1);
  const foto = (clave, variante) => `/api/foto/${clave}/${variante}`;
  const dinamica = true;
  return [
    ...delSitemap.map((ruta) => ({ ruta, dinamica })),
    { ruta: "/servicios-del-hogar?colonia=huicalco", dinamica },
    { ruta: "/servicios-del-hogar?colonia=inventada", dinamica },
    { ruta: "/servicios-del-hogar?colonia=huicalco&colonia=atempa", dinamica },
    { ruta: "/carpinteria", dinamica },
    { ruta: "/box-huicalco", dinamica },
    ...(idPublicado ? [{ ruta: `/negocio/nombre-anterior-${idPublicado}`, dinamica }] : []),
    { ruta: "/buscar", dinamica },
    { ruta: "/buscar?q=plomero", dinamica },
    { ruta: "/buscar?q=futbol", dinamica },
    { ruta: "/buscar?q=zzzzqqqq", dinamica },
    { ruta: "/buscar?q=plomero&q=tacos", dinamica },
    { ruta: `/buscar?q=${encodeURIComponent(CONSULTA_HOSTIL)}`, dinamica },
    ...rutas404Dinamicas(datos).map((ruta) => ({ ruta, dinamica, es404Dinamica: true })),
    { ruta: foto(datos.fotoPublicada, "tarjeta"), dinamica },
    { ruta: foto(datos.fotoPublicada, "ficha"), dinamica },
    { ruta: foto(datos.fotoPublicada, "ficha"), dinamica, metodo: "HEAD" },
    // Con `Origin` del propio sitio: sin él, Astro responde el 403 de
    // `checkOrigin` antes del middleware (brecha conocida, T-024).
    { ruta: foto(datos.fotoPublicada, "ficha"), dinamica, metodo: "POST", mismoOrigen: true },
    { ruta: foto(datos.fotoPublicada, "ficha"), dinamica, metodo: "OPTIONS" },
    { ruta: foto(datos.fotoPublicada, "original"), dinamica },
    { ruta: foto(datos.fotoRevision, "ficha"), dinamica },
    { ruta: foto(datos.fotoRechazada, "ficha"), dinamica },
    { ruta: foto("0123456789abcdef0123456789abcdef", "ficha"), dinamica },
    { ruta: foto(datos.fotoPublicada.toUpperCase(), "ficha"), dinamica },
    { ruta: foto(datos.fotoPublicada, "FICHA"), dinamica },
    { ruta: `/api/foto/..%2F..%2Fpackage.json/ficha`, dinamica },
    { ruta: `/api/foto/${datos.fotoPublicada}%2Fficha/ficha`, dinamica },
    { ruta: `/api/foto/${datos.fotoPublicada}%00/ficha`, dinamica },
    { ruta: `/api/foto/${datos.fotoPublicada}/..%2F..%2Fpackage.json`, dinamica },
    // Estas caen en la 404 GLOBAL en las dos versiones (`fetch` normaliza
    // `%2e%2e`): como `/a/b/c` en 2a, sin exigir `Cache-Control` (la de Astro
    // la sirve la CDN).
    { ruta: `/api/foto/%2e%2e/ficha` },
    { ruta: `/api/foto/${datos.fotoPublicada}/ficha/extra` },
    { ruta: "/api/foto" },
    // Su estado se MIDE (design.md §7): si Next responde su documento de error
    // (`notFound()` de `[destino]`), se tratan como 404 dinámica y la salida
    // lo dice.
    { ruta: "/negocio", dinamica, medir404: true },
    { ruta: "/api", dinamica, medir404: true },
  ];
}

/** Páginas cuyo `<head>` se captura como fixture (tasks.md #5 de 2a). */
const PAGINAS_DE_FIXTURE = [
  ["home", "/"],
  ["aviso-de-privacidad", "/aviso-de-privacidad"],
  ["terminos", "/terminos"],
  ["404", "/a/b/c"],
];

async function pedir(base, ruta, metodo = "GET", mismoOrigen = false) {
  const headers0 = mismoOrigen ? { origin: new URL(base).origin } : {};
  const respuesta = await fetch(new URL(ruta, base), { method: metodo, redirect: "manual", headers: headers0 });
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

/** Las rutas (sin origen) que publica el `sitemap.xml` de `base`. */
async function urlsDelSitemap(base) {
  const { cuerpo } = await pedir(base, "/sitemap.xml");
  return [...String(cuerpo).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

async function capturar2b(baseNext, directorio, datos) {
  mkdirSync(directorio, { recursive: true });
  // Por identificador: sin URL pública el sitemap sale vacío.
  const fichaConFoto = `/negocio/x-${datos.idFichaConFoto}`;
  const anonimizar = (texto) =>
    [datos.revision, datos.rechazado, datos.despublicado, datos.idFichaConFoto, datos.fotoPublicada, datos.fotoRevision]
      .filter(Boolean)
      .reduce((t, valor) => t.replaceAll(valor, /^[0-9a-f]{32}$/.test(valor) ? "<clave>" : "<id>"), texto);
  const escribir = (nombre, contenido) => {
    const archivo = path.join(directorio, nombre);
    writeFileSync(archivo, anonimizar(contenido));
    console.log(`capturado ${archivo}`);
  };
  const legible = (html) => `${html.replace(/></g, ">\n<")}\n`;
  const documento = async (ruta) => limpiarHtml(String((await pedir(baseNext, ruta)).cuerpo));
  const cabeza = (html) => /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";

  escribir("404-dinamica-slug.html", legible(await documento("/loquesea")));
  escribir("404-dinamica-ficha-en-revision.html", legible(await documento(`/negocio/x-${datos.revision}`)));
  escribir("cuerpo-404-global.html", legible(/<body[\s\S]*<\/body>/.exec(await documento("/a/b/c"))?.[0] ?? ""));
  escribir("head-giro-vacio.html", legible(cabeza(await documento("/carpinteria"))));
  escribir("head-ficha-con-foto.html", legible(cabeza(await documento(fichaConFoto))));
  escribir("head-buscar.html", legible(cabeza(await documento("/buscar?q=plomero"))));
  const cabeceras = {};
  for (const [nombre, ruta] of [
    ["fotoPublicada", `/api/foto/${datos.fotoPublicada}/ficha`],
    ["foto404", `/api/foto/${datos.fotoRevision}/ficha`],
    ["404DinamicaSlug", "/loquesea"],
  ]) {
    const { status, headers } = await pedir(baseNext, ruta);
    const utiles = ["content-type", "content-length", "cache-control", "location", "x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy"];
    cabeceras[nombre] = { status, ...Object.fromEntries(utiles.filter((h) => headers[h] !== undefined).map((h) => [h, headers[h]])) };
  }
  escribir("cabeceras.json", `${JSON.stringify(cabeceras, null, 2)}\n`);
}

function argumento(argumentos, nombre) {
  const i = argumentos.indexOf(nombre);
  return i === -1 ? undefined : argumentos[i + 1];
}

async function principal(argumentos) {
  if (argumentos[0] === "--capturar-head") {
    await capturarHead(argumentos[1], argumentos[2]);
    return 0;
  }
  const archivoDatos = argumento(argumentos, "--datos");
  const datos = archivoDatos ? JSON.parse(readFileSync(archivoDatos, "utf8")) : null;
  if (argumentos[0] === "--capturar-2b") {
    if (!datos) throw new Error("--capturar-2b necesita --datos <json>");
    await capturar2b(argumentos[1], argumentos[2], datos);
    return 0;
  }
  const [baseNext, baseAstro] = argumentos;
  if (!baseNext || !baseAstro || !datos) {
    console.error("Uso: node scripts/diff-html.mjs <baseNext> <baseAstro> --datos <json> [--rutas archivo]");
    return 2;
  }
  let rutas = [...RUTAS_2A, ...rutas2b(datos, await urlsDelSitemap(baseNext))];
  const archivoRutas = argumento(argumentos, "--rutas");
  if (archivoRutas) {
    rutas = readFileSync(archivoRutas, "utf8")
      .split("\n")
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map((ruta) => ({ ruta, dinamica: !RUTAS_2A.some((r) => r.ruta === ruta && !r.dinamica) }));
  }

  const referencia404 = String((await pedir(baseNext, "/a/b/c")).cuerpo);
  const dondeSeAplico = Object.fromEntries(NORMALIZACIONES_404_DINAMICA.map((n) => [n.id, []]));
  const diferencias = [];
  const medidas404 = [];
  for (const { ruta, dinamica, es404Dinamica, metodo, mismoOrigen, medir404 } of rutas) {
    const [next, astro] = await Promise.all([
      pedir(baseNext, ruta, metodo, mismoOrigen),
      pedir(baseAstro, ruta, metodo, mismoOrigen),
    ]);
    const medidaDinamica = Boolean(medir404) && next.status === 404 && /<html id="__next_error__"/.test(String(next.cuerpo));
    if (medidaDinamica) medidas404.push(ruta);
    const aplicadas = [];
    const propias = compararRespuestas(`${metodo ? `${metodo} ` : ""}${ruta}`, next, astro, {
      dinamica: Boolean(dinamica),
      ...(es404Dinamica || medidaDinamica ? { referencia404, aplicadas } : {}),
    });
    for (const id of aplicadas) dondeSeAplico[id].push(ruta);
    const marca = aplicadas.length ? ` [normalizaciones 404: ${aplicadas.length}]` : "";
    console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} ${metodo ? `${metodo} ` : ""}${ruta} (${next.status}/${astro.status})${marca}`);
    diferencias.push(...propias);
  }
  console.log(`\nMedidas como 404 dinámica de Next (documento de error de \`[destino]\`): ${medidas404.join(", ") || "ninguna"}`);
  console.log("Normalizaciones de la 404 dinámica aplicadas (NORMALIZACIONES_404_DINAMICA):");
  for (const { id, descripcion } of NORMALIZACIONES_404_DINAMICA) {
    console.log(`- ${id} (${descripcion}): ${dondeSeAplico[id].length} → ${dondeSeAplico[id].join(", ") || "ninguna"}`);
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
