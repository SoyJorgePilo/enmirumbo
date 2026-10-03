/**
 * Diff de HTML: versión Next (rama `main`) vs. versión Astro, ruta por ruta
 * (change `migrar-lectura-publica-astro`, design.md §9; spec
 * `plataforma-astro`, requirement "El HTML servido no difiere del de Next").
 *
 * Uso:
 *   node scripts/diff-html.mjs <baseNext> <baseAstro> --datos <json> [--rutas archivo | --solo-3a | --solo-3b | --solo-3b2] [--verificacion encendida|apagada]
 *   node scripts/diff-html.mjs --capturar-head <baseNext> <directorio>
 *   node scripts/diff-html.mjs --capturar-2b <baseNext> <directorio> --datos <json>
 *   node scripts/diff-html.mjs --capturar-3a <baseNext> <directorio> --datos <json>
 *   npx tsx scripts/diff-html.mjs --capturar-3b <baseNext> <directorio> --datos <json> [--con-envios]
 *   npx tsx scripts/diff-html.mjs --capturar-3b2 <baseNext> <directorio> --datos <json>
 *   node scripts/diff-html.mjs --capturar-3b2-apagada <base> <directorio> <configuracion>
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

import {
  compararRespuestas,
  idsDeCatalogoPorNombre,
  limpiarHtml,
  NORMALIZACIONES_404_DINAMICA,
  NORMALIZACIONES_FORMULARIO,
  NORMALIZACIONES_REGISTRO,
} from "./diff-html/nucleo.mjs";
import {
  enviarFormulario,
  enviosDe3a,
  PANTALLAS_DE_VERIFICAR,
  recorrerSecuencia3b2,
  secuenciasDe3b2,
  enviosDe3b,
  erroresDelFormulario,
  leerSetCookie,
  PANTALLAS_DE_GRACIAS,
  SEMBRADAS_3B,
  resumenDeLaBase,
  resumenDelDesenlace,
  valoresDelFormulario,
  whatsappDelEnvio,
} from "./enviar-formulario.mjs";

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

/**
 * Rutas de 3a (change `migrar-formularios-publicos-astro`, tasks.md #14): el
 * formulario de reporte (con `formulario: true`, las únicas con
 * `NORMALIZACIONES_FORMULARIO`), sus 404 dinámicas y la confirmación.
 * `fichaPublicada`: la ruta de una ficha del sitemap de Next.
 */
export function rutas3a(datos, fichaPublicada) {
  if (!fichaPublicada) return [];
  const id = fichaPublicada.split("-").at(-1);
  const dinamica = true;
  const formulario = `${fichaPublicada}/reportar`;
  return [
    { ruta: formulario, dinamica, formulario: true },
    ...["motivo", "comentario", "cupo", "servidor", "inventado"].map((e) => ({ ruta: `${formulario}?error=${e}`, dinamica, formulario: true })),
    { ruta: `/negocio/nombre-anterior-${id}/reportar`, dinamica, formulario: true },
    ...[
      `/negocio/x-${datos.revision}/reportar`,
      `/negocio/x-${datos.rechazado}/reportar`,
      `/negocio/x-${datos.despublicado}/reportar`,
      "/negocio/x-cnoexiste0000000000000000/reportar",
      "/negocio/sin-identificador/reportar",
    ].map((ruta) => ({ ruta, dinamica, es404Dinamica: true })),
    { ruta: `${formulario}/gracias`, dinamica },
    { ruta: "/negocio/inventado-xyz/reportar/gracias", dinamica },
    { ruta: "/negocio/%22%3E%3Cscript%3Eficticio()%3C%2Fscript%3E/reportar/gracias", dinamica },
  ];
}

/**
 * Rutas de 3b-1 (change `migrar-registro-astro`, tasks.md #14): `/registro`
 * (con `registro: true`, las únicas con `NORMALIZACIONES_REGISTRO`) y las seis
 * pantallas de gracias. Las respuestas re-pintadas se comparan en
 * `compararEnvios3b`.
 */
export function rutas3b() {
  const dinamica = true;
  return [{ ruta: "/registro", dinamica, registro: true }, ...PANTALLAS_DE_GRACIAS.map(([, ruta]) => ({ ruta, dinamica }))];
}

/**
 * Rutas de 3b-2 (change `migrar-verificacion-sms-astro`, design.md §12;
 * tasks.md #12), según cómo corran LAS DOS versiones (`--verificacion`):
 *
 * - `encendida`: las nueve pantallas de `PANTALLAS_DE_VERIFICAR` con la MISMA
 *   cookie de paso firmada (`cookie: true`) y con `NORMALIZACIONES_FORMULARIO`
 *   en sus dos formularios; sin cookie, la 404 dinámica.
 * - `apagada`: `GET`, `POST ?_action=confirmar` y `POST` sin parámetro como
 *   404 dinámica (`NORMALIZACIONES_404_DINAMICA`); `HEAD`, sin cuerpo, solo
 *   estado y cabeceras. En
 *   los `POST` el `Cache-Control` no se exige (`dinamica: false`): Astro
 *   responde el de una Action también con la bandera encendida y sin cookie,
 *   y Next, el del HTML dinámico (diferencia anotada en el reporte de 3b-2).
 *
 * Ninguna normalización nueva.
 */
export function rutas3b2(verificacion) {
  const dinamica = true;
  if (verificacion === "encendida") {
    return [
      ...PANTALLAS_DE_VERIFICAR.map(([, ruta]) => ({ ruta, dinamica, formulario: true, cookie: true })),
      { ruta: "/registro/verificar", dinamica, es404Dinamica: true },
    ];
  }
  if (verificacion === "apagada") {
    return [
      { ruta: "/registro/verificar", dinamica, es404Dinamica: true },
      // Sin cuerpo: se comparan estado y cabeceras (la 404 dinámica reemplazaría el cuerpo vacío de Next).
      { ruta: "/registro/verificar", dinamica, metodo: "HEAD" },
      { ruta: "/registro/verificar?_action=confirmar", es404Dinamica: true, metodo: "POST", mismoOrigen: true },
      { ruta: "/registro/verificar", es404Dinamica: true, metodo: "POST", mismoOrigen: true },
    ];
  }
  return [];
}

/**
 * Las secuencias de 3b-2 contra las dos versiones (tasks.md #14), con la
 * MISMA base y la bandera encendida en las dos, cada una con su Twilio falso
 * (`datos.next` y `datos.astro`: `{ archivoGuion, archivoLlamadas }`, y el
 * mismo `datos.secreto`). Se comparan cadena, `Location`, atributos de
 * `Set-Cookie`, avisos, llamadas al simulador, ficha y cupos. La única
 * diferencia aceptada es el origen ajeno o `null` (Next 500, Astro 403).
 */
async function compararEnvios3b2(baseNext, baseAstro, datos) {
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const consultar = async (sql, params) => (await cliente.query(sql, params)).rows;
  const { contextoDe3b2 } = await import("../tests/verificar-astro.ts");
  const secuencias = secuenciasDe3b2();
  const numeros = secuencias.flatMap((x) => [x.whatsapp, ...(x.previos ?? []).map(([w]) => w)]);
  const correr = async (base, lado) => {
    await consultar(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);
    const ctx = contextoDe3b2({ consultar, secreto: datos.secreto, categoriaId: datos.categoriaId, coloniaId: datos.coloniaId, ...datos[lado] });
    const salida = {};
    for (const secuencia of secuencias) salida[secuencia.nombre] = await recorrerSecuencia3b2(base, secuencia, ctx);
    return salida;
  };
  const deNext = await correr(baseNext, "next");
  const deAstro = await correr(baseAstro, "astro");
  await consultar(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);
  await cliente.end();
  const diferencias = [];
  for (const secuencia of secuencias) {
    const [n, a] = [deNext[secuencia.nombre], deAstro[secuencia.nombre]];
    const iguales = JSON.stringify(n) === JSON.stringify(a);
    const aceptada = !iguales && Boolean(secuencia.aceptada?.(n, a));
    const estados = (r) => r.pasos.map((p) => p.cadena.map((c) => c.status).join("→")).join(" | ");
    console.log(`${iguales ? "igual   " : aceptada ? "ACEPTADA" : "DISTINTA"} envío 3b-2: ${secuencia.nombre} (${estados(n)} / ${estados(a)})`);
    if (!iguales && !aceptada) diferencias.push(`envío 3b-2 ${secuencia.nombre}:\n  Next : ${JSON.stringify(n)}\n  Astro: ${JSON.stringify(a)}`);
  }
  return diferencias;
}

/**
 * Los envíos de 3b-1 contra las dos versiones (tasks.md #16), con la MISMA
 * base: antes de cada versión se borran las fichas de los envíos y se vuelven
 * a sembrar las cuatro de `datos` (sin foto), así las dos parten igual. Se
 * comparan la cadena, los errores por campo, los valores re-pintados, lo que
 * quedó en la base y el HTML re-pintado (con `NORMALIZACIONES_REGISTRO`). La
 * única diferencia aceptada es el origen ajeno (Next 500, Astro 403).
 * Necesita `DATABASE_URL` y `tsx` (las fotos de `tests/fotos-fixtures.ts`).
 */
async function compararEnvios3b(baseNext, baseAstro, datos, aplicadasRegistro) {
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const consultar = async (sql, params) => (await cliente.query(sql, params)).rows;
  const { fotosDelArnes } = await import("../tests/fotos-fixtures.ts");
  const envios = enviosDe3b(datos, await fotosDelArnes());
  const numeros = [...new Set([...envios.map(whatsappDelEnvio).filter(Boolean), datos.publicado, datos.revision, datos.rechazado, datos.verificado])];
  const reiniciar = async () => {
    await cliente.query(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);
    const alta = (id, nombre, whatsapp, estado, extra) =>
      cliente.query(
        `INSERT INTO "Negocio" (id, nombre, "categoriaId", whatsapp, "consintioAvisoEn", estado, "publicadoEn", "rechazadoEn", "consintioAvisoVersion", "numeroVerificadoEn")
         VALUES ($1, $2, $3, $4, '2026-08-01T10:00:00Z', $5, $6, $7, $8, $9)`,
        [id, nombre, datos.categoriaId, whatsapp, estado, extra.publicadoEn ?? null, extra.rechazadoEn ?? null, extra.version ?? null, extra.verificadoEn ?? null],
      );
    const ahora = new Date();
    await alta("c3b1diffpublicado0000000001", "Taller Ficticio Publicado 3b", datos.publicado, "publicado", { publicadoEn: ahora });
    await alta("c3b1diffrevision00000000001", "Taller Ficticio En Revisión 3b", datos.revision, "en_revision", {});
    await alta("c3b1diffrechazado0000000001", "Taller Ficticio Rechazado 3b", datos.rechazado, "rechazado", { rechazadoEn: ahora, version: "1" });
    await alta("c3b1diffverificado000000001", "Taller Ficticio Verificado 3b", datos.verificado, "rechazado", { rechazadoEn: ahora, version: "2", verificadoEn: ahora });
  };
  const correr = async (base) => {
    await reiniciar();
    const urlPagina = new URL("/registro", base).toString();
    const salida = [];
    for (const envio of envios) {
      const r = await enviarFormulario({ urlPagina, elecciones: envio.elecciones, archivos: envio.archivos, extras: envio.extras, cabecerasExtra: envio.cabeceras });
      const post = r.cadena[1];
      const repinta = post.status === 200;
      salida.push({
        resumen: {
          cadena: resumenDelDesenlace(r),
          errores: repinta ? erroresDelFormulario(r.final.html) : null,
          valores: repinta ? valoresDelFormulario(idsDeCatalogoPorNombre(r.final.html), urlPagina) : null,
          base: await resumenDeLaBase(consultar, whatsappDelEnvio(envio)),
        },
        respuesta: repinta ? { status: 200, headers: Object.fromEntries(post.cabeceras), cuerpo: r.final.html } : null,
      });
    }
    return salida;
  };
  const deNext = await correr(baseNext);
  const deAstro = await correr(baseAstro);
  await reiniciar();
  await cliente.query(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);
  await cliente.end();
  const diferencias = [];
  envios.forEach((envio, i) => {
    const [n, a] = [deNext[i], deAstro[i]];
    const iguales = JSON.stringify(n.resumen) === JSON.stringify(a.resumen);
    const aceptada = !iguales && Boolean(envio.aceptada?.(n.resumen.cadena, a.resumen.cadena));
    let html = [];
    if (n.respuesta && a.respuesta) {
      html = compararRespuestas(`POST /registro (${envio.nombre})`, n.respuesta, a.respuesta, {
        dinamica: true,
        registro: { urlPagina: new URL("/registro", baseNext).toString(), aplicadas: aplicadasRegistro[envio.nombre] = [], repintada: true },
      });
    }
    const estado = iguales && html.length === 0 ? "igual   " : aceptada && html.length === 0 ? "ACEPTADA" : "DISTINTA";
    console.log(`${estado} envío 3b: ${envio.nombre} (${n.resumen.cadena.map((p) => p.status).join("→")} / ${a.resumen.cadena.map((p) => p.status).join("→")})`);
    if (!iguales && !aceptada) diferencias.push(`envío 3b ${envio.nombre}:\n  Next : ${JSON.stringify(n.resumen)}\n  Astro: ${JSON.stringify(a.resumen)}`);
    diferencias.push(...html);
  });
  return diferencias;
}

/**
 * Los envíos del arnés contra las dos versiones (tasks.md #14 y #17): cadena
 * de estados, ruta del `Location` y atributos de las cookies. La ÚNICA
 * diferencia aceptada es el origen ajeno (Next 500, Astro 403).
 */
async function compararEnvios(baseNext, baseAstro, datos, fichaPublicada) {
  const id = fichaPublicada?.split("-").at(-1);
  if (!id) return [];
  const envios = enviosDe3a({ ...datos, publicado: id });
  const diferencias = [];
  const anonimo = (texto) => [id, datos.tope].filter(Boolean).reduce((t, x) => t.replaceAll(x, "<id>"), texto);
  for (const envio of envios) {
    const resultados = [];
    for (const base of [baseNext, baseAstro]) {
      const r = await enviarFormulario({ urlPagina: new URL(envio.ruta, base).toString(), elecciones: envio.elecciones, cabecerasExtra: envio.cabeceras ?? {} });
      resultados.push(JSON.parse(anonimo(JSON.stringify(resumenDelDesenlace(r)))));
    }
    const [rn, ra] = resultados;
    const aceptada = envio.aceptada?.(rn, ra);
    const igual = JSON.stringify(rn) === JSON.stringify(ra);
    console.log(`${igual ? "igual   " : aceptada ? "ACEPTADA" : "DISTINTA"} envío: ${envio.nombre} (${rn.map((p) => p.status).join("→")} / ${ra.map((p) => p.status).join("→")})`);
    if (!igual && !aceptada) diferencias.push(`envío ${envio.nombre}:\n  Next : ${JSON.stringify(rn)}\n  Astro: ${JSON.stringify(ra)}`);
  }
  return diferencias;
}

/** Páginas cuyo `<head>` se captura como fixture (tasks.md #5 de 2a). */
const PAGINAS_DE_FIXTURE = [
  ["home", "/"],
  ["aviso-de-privacidad", "/aviso-de-privacidad"],
  ["terminos", "/terminos"],
  ["404", "/a/b/c"],
];

async function pedir(base, ruta, metodo = "GET", mismoOrigen = false, cookie = undefined) {
  const headers0 = { ...(mismoOrigen ? { origin: new URL(base).origin } : {}), ...(cookie ? { cookie } : {}) };
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

/**
 * Fixtures de 3a (change `migrar-formularios-publicos-astro`, tasks.md #2):
 * las pantallas de reportar y lo que responde Next a cada envío, con el arnés
 * de `enviar-formulario.mjs`. `datos`: `{ publicado, revision, rechazado,
 * despublicado, tope }` (identificadores ficticios; salen como `<id>`).
 */
async function capturar3a(baseNext, directorio, datos) {
  mkdirSync(directorio, { recursive: true });
  const ids = [datos.publicado, datos.revision, datos.rechazado, datos.despublicado, datos.tope].filter(Boolean);
  const anonimizar = (texto) => ids.reduce((t, id) => t.replaceAll(id, "<id>"), texto);
  const escribir = (nombre, contenido) => {
    const archivo = path.join(directorio, nombre);
    writeFileSync(archivo, anonimizar(contenido));
    console.log(`capturado ${archivo}`);
  };
  const legible = (html) => `${html.replace(/></g, ">\n<")}\n`;
  const pedirConCookie = async (ruta, cookie) => {
    const r = await fetch(new URL(ruta, baseNext), { redirect: "manual", headers: cookie ? { cookie } : {} });
    return { status: r.status, headers: Object.fromEntries(r.headers), cuerpo: await r.text() };
  };
  const formulario = (id, nombre = "x") => `/negocio/${nombre}-${id}/reportar`;
  // El segmento actual sale del propio formulario ("Volver a la ficha").
  const inicial = await pedirConCookie(formulario(datos.publicado));
  const segmento = /href="\/negocio\/([^"/]+)"/.exec(inicial.cuerpo)?.[1];
  if (!segmento) throw new Error("no encontré el segmento de la ficha publicada");
  const borrador = Buffer.from("texto ficticio del borrador", "utf8").toString("base64url");
  const pantallas = [
    ["formulario.html", `/negocio/${segmento}/reportar`],
    ...["motivo", "comentario", "cupo", "servidor", "inventado"].map((e) => [`formulario-error-${e}.html`, `/negocio/${segmento}/reportar?error=${e}`]),
    ["formulario-borrador.html", `/negocio/${segmento}/reportar?error=motivo`, `nu_reporte_borrador=${borrador}`],
    ["formulario-segmento-viejo.html", formulario(datos.publicado, "nombre-anterior")],
    ["404-revision.html", formulario(datos.revision)],
    ["404-inexistente.html", formulario("cnoexiste0000000000000000")],
    ["gracias.html", `/negocio/${segmento}/reportar/gracias`],
    ["gracias-hostil.html", "/negocio/%22%3E%3Cscript%3Eficticio()%3C%2Fscript%3E/reportar/gracias"],
  ];
  const cabecerasDe = {};
  for (const [nombre, ruta, cookie] of pantallas) {
    const r = await pedirConCookie(ruta, cookie);
    escribir(nombre, legible(limpiarHtml(r.cuerpo)));
    cabecerasDe[nombre] = { status: r.status, "cache-control": r.headers["cache-control"], "content-type": r.headers["content-type"] };
  }
  const desenlaces = {};
  const enviar = async (nombre, opciones) => {
    const resultado = await enviarFormulario({ urlPagina: new URL(opciones.ruta ?? formulario(datos.publicado), baseNext).toString(), ...opciones });
    const post = resultado.cadena[1];
    desenlaces[nombre] = {
      cadena: resumenDelDesenlace(resultado),
      post: {
        status: post.status,
        "cache-control": post.cabeceras.get("cache-control"),
        "content-type": post.cabeceras.get("content-type"),
        "referrer-policy": post.cabeceras.get("referrer-policy"),
        seguridad: ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy"].every((h) => post.cabeceras.has(h)),
        // Sin `Expires`: es la hora del envío (el `Max-Age` dice lo mismo).
        cookies: post.setCookie.map((linea) =>
          Object.fromEntries(Object.entries(leerSetCookie(linea).atributos).filter(([clave]) => clave !== "expires")),
        ),
      },
    };
  };
  await enviar("exito", { elecciones: { motivo: "cerrado" } });
  await enviar("sin-motivo-con-comentario", { elecciones: { comentario: "hablé con la dueña" } });
  await enviar("comentario-301", { elecciones: { motivo: "cerrado", comentario: "a".repeat(301) } });
  await enviar("honeypot", { elecciones: { motivo: "cerrado", sitio_web: "http://spam.example" } });
  for (let i = 1; i <= 4; i++) {
    await enviar(`cupo-${i}`, { elecciones: { motivo: "cerrado" }, cabecerasExtra: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.99` } });
  }
  await enviar("tope", { ruta: formulario(datos.tope), elecciones: { motivo: "cerrado" } });
  // Identificador inexistente: el formulario de la ficha publicada con el
  // argumento ligado cambiado (lo único que en Next fija el negocio).
  await enviar("identificador-inexistente", { elecciones: { motivo: "cerrado", "$ACTION_1:1": '["cnoexiste0000000000000000"]' } });
  await enviar("origen-null", { elecciones: { motivo: "cerrado" }, cabecerasExtra: { origin: "null" } });
  await enviar("origen-ajeno", { elecciones: { motivo: "cerrado" }, cabecerasExtra: { origin: "https://ajeno.example" } });
  await enviar("sin-origen", { elecciones: { motivo: "cerrado" }, cabecerasExtra: { origin: null } });
  escribir("respuestas.json", `${JSON.stringify({ pantallas: cabecerasDe, desenlaces }, null, 2)}\n`);
}

/**
 * Fixtures de 3b-1 (change `migrar-registro-astro`, tasks.md #2): `/registro`,
 * las seis pantallas de gracias y, con `--con-envios`, lo que responde Next a
 * cada envío de `enviosDe3b` (cadena, cabeceras del POST, errores, valores
 * re-pintados, el HTML re-pintado y lo que quedó en la base). Necesita
 * `DATABASE_URL` (la misma base que sirve Next) y `tsx` (genera las fotos con
 * `tests/fotos-fixtures.ts`). `datos`: `{ categoriaId, coloniaId }`; los
 * WhatsApp de las cuatro fichas sembradas son `SEMBRADAS_3B`.
 * Los ids de catálogo salen como `cat:<nombre>`.
 */
async function capturar3b(baseNext, directorio, datos, conEnvios) {
  mkdirSync(directorio, { recursive: true });
  const escribir = (nombre, contenido) => {
    const archivo = path.join(directorio, nombre);
    writeFileSync(archivo, contenido);
    console.log(`capturado ${archivo}`);
  };
  const legible = (html) => `${idsDeCatalogoPorNombre(html).replace(/></g, ">\n<")}\n`;
  const pantallas = {};
  for (const [nombre, ruta] of [["registro.html", "/registro"], ...PANTALLAS_DE_GRACIAS]) {
    const r = await fetch(new URL(ruta, baseNext), { redirect: "manual" });
    const cuerpo = await r.text();
    escribir(nombre, legible(limpiarHtml(cuerpo)));
    pantallas[nombre] = { status: r.status, "cache-control": r.headers.get("cache-control"), "content-type": r.headers.get("content-type") };
  }
  const desenlaces = {};
  if (conEnvios) {
    const { default: pg } = await import("pg");
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await cliente.connect();
    const consultar = async (sql, params) => (await cliente.query(sql, params)).rows;
    const { fotosDelArnes } = await import("../tests/fotos-fixtures.ts");
    const fotos = await fotosDelArnes();
    for (const envio of enviosDe3b({ ...SEMBRADAS_3B, ...datos }, fotos)) {
      const urlPagina = new URL("/registro", baseNext).toString();
      const r = await enviarFormulario({ urlPagina, elecciones: envio.elecciones, archivos: envio.archivos, extras: envio.extras, cabecerasExtra: envio.cabeceras });
      const post = r.cadena[1];
      const repinta = post.status === 200;
      if (repinta) escribir(`repintado-${envio.nombre}.html`, legible(limpiarHtml(r.final.html)));
      desenlaces[envio.nombre] = {
        cadena: resumenDelDesenlace(r),
        post: {
          status: post.status,
          "cache-control": post.cabeceras.get("cache-control"),
          "content-type": post.cabeceras.get("content-type"),
          seguridad: ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy"].every((h) => post.cabeceras.has(h)),
          cookies: post.setCookie.map((linea) => Object.fromEntries(Object.entries(leerSetCookie(linea).atributos).filter(([clave]) => clave !== "expires"))),
        },
        errores: repinta ? erroresDelFormulario(r.final.html) : null,
        valores: repinta ? valoresDelFormulario(idsDeCatalogoPorNombre(r.final.html), urlPagina) : null,
        base: await resumenDeLaBase(consultar, whatsappDelEnvio(envio)),
      };
      console.log(`envío ${envio.nombre}: ${resumenDelDesenlace(r).map((p) => p.status).join("→")}`);
    }
    await cliente.end();
  }
  escribir("respuestas.json", `${JSON.stringify({ pantallas, desenlaces }, null, 2)}\n`);
}

/**
 * Fixtures de 3b-2 (change `migrar-verificacion-sms-astro`, tasks.md #2), con
 * la bandera ENCENDIDA y el Twilio falso precargado en Next
 * (`NODE_OPTIONS="--import …/tests/fixtures/twilio-falso.mjs"`): las nueve
 * pantallas de `/registro/verificar` con una cookie firmada para una ficha
 * sembrada, y lo que responde Next a cada secuencia de `secuenciasDe3b2`.
 * Necesita `DATABASE_URL` (la que sirve Next) y `tsx`. `datos`: `{ secreto,
 * archivoGuion, archivoLlamadas, categoriaId, coloniaId }` (el secreto y los
 * dos archivos son los del proceso de Next). Sin identificadores ni valores
 * de cookie en lo que se escribe.
 */
async function capturar3b2(baseNext, directorio, datos) {
  mkdirSync(directorio, { recursive: true });
  const escribir = (nombre, contenido) => {
    const archivo = path.join(directorio, nombre);
    writeFileSync(archivo, contenido);
    console.log(`capturado ${archivo}`);
  };
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const consultar = async (sql, params) => (await cliente.query(sql, params)).rows;
  const { contextoDe3b2, cookieDePaso } = await import("../tests/verificar-astro.ts");
  const ctx = contextoDe3b2({ consultar, ...datos });
  const secuencias = secuenciasDe3b2();
  const numeros = secuencias.flatMap((s) => [s.whatsapp, ...(s.previos ?? []).map(([w]) => w)]);
  await consultar(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);

  const cookie = `nu_paso=${cookieDePaso("vigente", "cficticia0000000000000000", datos.secreto, "8299")}`;
  const pantallas = {};
  for (const [nombre, ruta] of PANTALLAS_DE_VERIFICAR) {
    const r = await fetch(new URL(ruta, baseNext), { redirect: "manual", headers: { cookie } });
    escribir(nombre, `${limpiarHtml(await r.text()).replace(/></g, ">\n<")}\n`);
    pantallas[nombre] = { status: r.status, "cache-control": r.headers.get("cache-control"), "content-type": r.headers.get("content-type"), cookies: r.headers.getSetCookie().length };
  }
  const envios = {};
  for (const secuencia of secuencias) {
    envios[secuencia.nombre] = await recorrerSecuencia3b2(baseNext, secuencia, ctx);
    console.log(`secuencia ${secuencia.nombre}: ${envios[secuencia.nombre].pasos.map((p) => p.cadena.map((c) => c.status).join("→")).join(" | ")}`);
  }
  await consultar(`DELETE FROM "Negocio" WHERE whatsapp = ANY($1)`, [numeros]);
  await cliente.end();
  escribir("respuestas.json", `${JSON.stringify({ pantallas, envios }, null, 2)}\n`);
}

/**
 * La ruta apagada de 3b-2 (tasks.md #2): lo que responde `/registro/verificar`
 * con cada forma de petición y, para comparar, `/loquesea`,
 * `/registro/loquesea` y `/a/b/c`. Estado, cabeceras útiles y si el cuerpo es
 * igual al de `/loquesea`. `configuracion`: el nombre del archivo.
 */
async function capturar3b2Apagada(base, directorio, configuracion) {
  mkdirSync(directorio, { recursive: true });
  const origin = new URL(base).origin;
  const formas = [
    ["GET", "/registro/verificar"],
    ["HEAD", "/registro/verificar"],
    ["POST", "/registro/verificar?_action=confirmar"],
    ["POST", "/registro/verificar"],
    ["GET", "/loquesea"],
    ["GET", "/registro/loquesea"],
    ["GET", "/a/b/c"],
  ];
  const referencia = await (await fetch(new URL("/loquesea", base))).text();
  const salida = {};
  for (const [metodo, ruta] of formas) {
    const r = await fetch(new URL(ruta, base), {
      method: metodo,
      redirect: "manual",
      headers: metodo === "POST" ? { origin, "content-type": "application/x-www-form-urlencoded" } : {},
      body: metodo === "POST" ? "codigo=123456" : undefined,
    });
    const cuerpo = await r.text();
    const utiles = ["content-type", "cache-control", "x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy"];
    salida[`${metodo} ${ruta}`] = {
      status: r.status,
      ...Object.fromEntries(utiles.filter((h) => r.headers.has(h)).map((h) => [h, r.headers.get(h)])),
      cookies: r.headers.getSetCookie().length,
      igualALoquesea: cuerpo === referencia,
      documentoDeError: /<html id="__next_error__"/.test(cuerpo),
    };
  }
  const archivo = path.join(directorio, `apagada-${configuracion}.json`);
  writeFileSync(archivo, `${JSON.stringify(salida, null, 2)}\n`);
  console.log(`capturado ${archivo}`);
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
  if (argumentos[0] === "--capturar-3a") {
    if (!datos) throw new Error("--capturar-3a necesita --datos <json>");
    await capturar3a(argumentos[1], argumentos[2], datos);
    return 0;
  }
  if (argumentos[0] === "--capturar-3b") {
    if (!datos) throw new Error("--capturar-3b necesita --datos <json>");
    await capturar3b(argumentos[1], argumentos[2], datos, argumentos.includes("--con-envios"));
    return 0;
  }
  if (argumentos[0] === "--capturar-3b2") {
    if (!datos) throw new Error("--capturar-3b2 necesita --datos <json>");
    await capturar3b2(argumentos[1], argumentos[2], datos);
    return 0;
  }
  if (argumentos[0] === "--capturar-3b2-apagada") {
    await capturar3b2Apagada(argumentos[1], argumentos[2], argumentos[3]);
    return 0;
  }
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
  const sitemap = await urlsDelSitemap(baseNext);
  // La del `datos.publicado` si viene (así "éxito" no cae en una ficha con el tope lleno).
  const fichaPublicada =
    sitemap.find((r) => r.startsWith("/negocio/") && datos.publicado && r.endsWith(`-${datos.publicado}`)) ??
    sitemap.find((r) => r.startsWith("/negocio/")) ??
    // Sin URL pública el sitemap sale vacío: por identificador.
    (datos.publicado ? `/negocio/x-${datos.publicado}` : undefined);
  // `--solo-3a` / `--solo-3b`: solo las rutas y los envíos de esa mitad (no necesitan las fotos de 2b).
  const solo3a = argumentos.includes("--solo-3a");
  const solo3b = argumentos.includes("--solo-3b");
  // 3b-2: `--verificacion encendida|apagada` dice cómo corren LAS DOS versiones; `--solo-3b2`, solo esas rutas.
  const verificacion = argumento(argumentos, "--verificacion");
  const solo3b2 = argumentos.includes("--solo-3b2");
  let rutas = solo3a
    ? rutas3a(datos, fichaPublicada)
    : solo3b
      ? rutas3b()
      : solo3b2
        ? rutas3b2(verificacion)
        : [...RUTAS_2A, ...rutas2b(datos, sitemap), ...rutas3a(datos, fichaPublicada), ...rutas3b(), ...rutas3b2(verificacion)];
  // La cookie de paso de las pantallas encendidas: firmada con el secreto que comparten las dos versiones.
  let cookieDePaso;
  if (verificacion === "encendida") {
    const ayudantes = await import("../tests/verificar-astro.ts");
    cookieDePaso = `nu_paso=${ayudantes.cookieDePaso("vigente", "cficticia0000000000000000", datos.secreto, "8299")}`;
  }
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
  const dondeSeAplicoFormulario = Object.fromEntries(NORMALIZACIONES_FORMULARIO.map((n) => [n.id, []]));
  const dondeSeAplicoRegistro = Object.fromEntries(NORMALIZACIONES_REGISTRO.map((n) => [n.id, []]));
  const diferencias = [];
  const medidas404 = [];
  for (const { ruta, dinamica, es404Dinamica, metodo, mismoOrigen, medir404, formulario, registro, cookie } of rutas) {
    const galleta = cookie ? cookieDePaso : undefined;
    const [next, astro] = await Promise.all([
      pedir(baseNext, ruta, metodo, mismoOrigen, galleta),
      pedir(baseAstro, ruta, metodo, mismoOrigen, galleta),
    ]);
    const medidaDinamica = Boolean(medir404) && next.status === 404 && /<html id="__next_error__"/.test(String(next.cuerpo));
    if (medidaDinamica) medidas404.push(ruta);
    const aplicadas = [];
    const aplicadasFormulario = [];
    const aplicadasRegistro = [];
    const propias = compararRespuestas(`${metodo ? `${metodo} ` : ""}${ruta}`, next, astro, {
      dinamica: Boolean(dinamica),
      ...(es404Dinamica || medidaDinamica ? { referencia404, aplicadas } : {}),
      ...(formulario ? { formulario: { urlPagina: new URL(ruta, baseNext).toString(), aplicadas: aplicadasFormulario } } : {}),
      ...(registro ? { registro: { urlPagina: new URL(ruta, baseNext).toString(), aplicadas: aplicadasRegistro, repintada: false } } : {}),
    });
    for (const id of aplicadas) dondeSeAplico[id].push(ruta);
    for (const id of aplicadasFormulario) dondeSeAplicoFormulario[id].push(ruta);
    for (const id of aplicadasRegistro) dondeSeAplicoRegistro[id].push(ruta);
    const marca =
      (aplicadas.length ? ` [normalizaciones 404: ${aplicadas.length}]` : "") +
      (aplicadasFormulario.length ? ` [normalizaciones del formulario: ${aplicadasFormulario.length}]` : "") +
      (aplicadasRegistro.length ? ` [normalizaciones del registro: ${aplicadasRegistro.length}]` : "");
    console.log(`${propias.length === 0 ? "igual   " : "DISTINTA"} ${metodo ? `${metodo} ` : ""}${ruta} (${next.status}/${astro.status})${marca}`);
    diferencias.push(...propias);
  }
  console.log(`\nMedidas como 404 dinámica de Next (documento de error de \`[destino]\`): ${medidas404.join(", ") || "ninguna"}`);
  console.log("Normalizaciones de la 404 dinámica aplicadas (NORMALIZACIONES_404_DINAMICA):");
  for (const { id, descripcion } of NORMALIZACIONES_404_DINAMICA) {
    console.log(`- ${id} (${descripcion}): ${dondeSeAplico[id].length} → ${dondeSeAplico[id].join(", ") || "ninguna"}`);
  }
  console.log("Normalizaciones del formulario aplicadas (NORMALIZACIONES_FORMULARIO):");
  for (const { id, descripcion } of NORMALIZACIONES_FORMULARIO) {
    console.log(`- ${id} (${descripcion}): ${dondeSeAplicoFormulario[id].length} → ${dondeSeAplicoFormulario[id].join(", ") || "ninguna"}`);
  }
  if (!archivoRutas) {
    console.log("\nEnvíos del arnés (sin JS):");
    if (!solo3b && !solo3b2) diferencias.push(...(await compararEnvios(baseNext, baseAstro, datos, fichaPublicada)));
    if (verificacion === "encendida" && !solo3a && !solo3b) diferencias.push(...(await compararEnvios3b2(baseNext, baseAstro, datos)));
    if (!solo3a && !solo3b2 && datos.categoriaId) {
      const enEnvios = {};
      const datos3b = { categoriaId: datos.categoriaId, coloniaId: datos.coloniaId, ...SEMBRADAS_3B };
      diferencias.push(...(await compararEnvios3b(baseNext, baseAstro, datos3b, enEnvios)));
      for (const [envio, ids] of Object.entries(enEnvios)) for (const id of ids) dondeSeAplicoRegistro[id].push(`POST ${envio}`);
    }
  }
  console.log("Normalizaciones del registro aplicadas (NORMALIZACIONES_REGISTRO):");
  for (const { id, descripcion } of NORMALIZACIONES_REGISTRO) {
    console.log(`- ${id} (${descripcion}): ${dondeSeAplicoRegistro[id].length} → ${dondeSeAplicoRegistro[id].join(", ") || "ninguna"}`);
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
