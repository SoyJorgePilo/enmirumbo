/**
 * Los casos de las tareas programadas (change `migrar-tareas-programadas-astro`,
 * design.md §3.4 y §6; tasks.md #1, #4, #5 y #12): qué instancia del servidor
 * se levanta (su entorno), con qué estado inicial (`scripts/sembrar-tareas.mjs`),
 * con qué guion del Resend falso y qué peticiones se le hacen. Los usan el diff
 * (`scripts/diff-html.mjs --capturar-6a|--solo-6a`) y las pruebas sobre la
 * build (`tests/plataforma-astro-tareas*.test.ts`), así que Next y Astro
 * reciben exactamente lo mismo.
 *
 * Cada SESIÓN levanta su propio proceso: el adaptador de correo y el Resend
 * falso recuerdan la clave del día por proceso, y un "409 en frío" solo se
 * puede ver en un proceso que no mandó nada antes.
 *
 * Todo ficticio: el secreto lo genera quien corre (`openssl rand`/`randomBytes`)
 * y NUNCA se escribe en los fixtures; buzones `@ejemplo.invalid`, llave
 * `re_prueba_falsa`, sitio `enmirumbo.example` (RFC 2606).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { limpiarTareas, resumenDeTareas, sembrarTareas } from "../sembrar-tareas.mjs";
import { compararRespuestas } from "./nucleo.mjs";

export const RUTA_PURGA = "/api/tareas/purgar-rechazados";
export const RUTA_BARRIDO = "/api/tareas/barrer-fotos-huerfanas";
export const RUTAS_DE_TAREAS = [RUTA_PURGA, RUTA_BARRIDO];
export const AGENTE_DEL_CRON = "vercel-cron/1.0";
export const FOTO_INVENTADA = `/api/foto/${"0".repeat(32)}/ficha`;
/** Una dirección cerrada: la base "caída". */
export const BASE_CAIDA = "postgresql://nadie:nadie@127.0.0.1:1/ninguna";

/** El correo configurado, todo de mentiras. */
export const CORREO_FICTICIO = {
  RESEND_API_KEY: "re_prueba_falsa",
  AVISOS_CORREO_REMITENTE: "avisos@ejemplo.invalid",
  AVISOS_CORREO_DESTINO: "admin@ejemplo.invalid",
  SITIO_URL: "https://enmirumbo.example",
};

/** Variables del almacenamiento del proveedor: se QUITAN siempre del entorno del servidor. */
export const VARIABLES_DEL_BUCKET = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_BUCKET_FOTOS"];

/**
 * El entorno de cada instancia, encima del de la terminal. `undefined` QUITA
 * la variable. `NODE_ENV=development` (sin `VERCEL_ENV`) para que el almacén
 * sea el disco de `FOTOS_DIR`: en producción no hay caída al disco (2b).
 */
export function entornoDeInstancia(instancia, { secreto, fotosDir, archivoGuion, archivoCorreo }) {
  const sinBucket = Object.fromEntries(VARIABLES_DEL_BUCKET.map((v) => [v, undefined]));
  const comun = {
    ...sinBucket,
    NODE_ENV: "development",
    VERCEL_ENV: undefined,
    FOTOS_DIR: fotosDir,
    RESEND_FALSO_GUION: `@${archivoGuion}`,
    RESEND_FALSO_REGISTRO: archivoCorreo,
    CRON_SECRET: secreto,
    ...CORREO_FICTICIO,
  };
  switch (instancia) {
    case "principal":
      return comun;
    case "sin-correo":
      return { ...comun, RESEND_API_KEY: undefined, AVISOS_CORREO_REMITENTE: undefined, AVISOS_CORREO_DESTINO: undefined };
    case "sin-secreto":
      return { ...comun, CRON_SECRET: undefined };
    case "secreto-espacios":
      return { ...comun, CRON_SECRET: "   " };
    case "base-caida":
      return { ...comun, DATABASE_URL: BASE_CAIDA };
    case "sin-almacen":
      // El sistema se cree desplegado y no hay almacén configurado.
      return { ...comun, VERCEL_ENV: "production" };
    default:
      throw new Error(`instancia desconocida: ${instancia}`);
  }
}

/**
 * Las once formas de un secreto malo (design.md §3.4), salvo las de `CRON_SECRET` sin configurar.
 *
 * @param {string} secreto
 * @returns {[string, Record<string, string>][]}
 */
export function encabezadosMalos(secreto) {
  const otro = secreto.replace(/./g, (c) => (c === "a" ? "b" : "a"));
  return [
    ["sin Authorization", {}],
    ["equivocado de la misma longitud", { authorization: `Bearer ${otro}` }],
    ["truncado en un carácter", { authorization: `Bearer ${secreto.slice(0, -1)}` }],
    ["con un carácter de más", { authorization: `Bearer ${secreto}x` }],
    ["sin Bearer", { authorization: secreto }],
    ["bearer en minúsculas", { authorization: `bearer ${secreto}` }],
    ["Bearer con dos espacios", { authorization: `Bearer  ${secreto}` }],
    ["Basic", { authorization: `Basic ${secreto}` }],
    ["Authorization vacío", { authorization: "" }],
  ];
}

const delCron = (secreto) => ({ authorization: `Bearer ${secreto}`, "user-agent": AGENTE_DEL_CRON });

/**
 * Un paso: `encabezados(secreto, base)`. `comparar`: `exacto` (estado,
 * cuerpo byte a byte, cabeceras salvo transporte), `otro-metodo` (la
 * diferencia aceptada: Next 405/204, Astro el 404 de la puerta o la respuesta
 * del middleware), `pagina-404` (la 404 HTML de una dirección inexistente,
 * con el núcleo del diff) o `registrar` (solo se anota: la barra final, 6b).
 */
const paso = (nombre, metodo, ruta, encabezados, comparar = "exacto") => ({ nombre, metodo, ruta, encabezados, comparar });

export function sesiones6a() {
  const malos = [];
  for (const ruta of RUTAS_DE_TAREAS) {
    for (const metodo of ["GET", "HEAD"]) {
      for (let i = 0; i < 9; i++) {
        malos.push(paso(`${metodo} ${ruta} · malo ${i}`, metodo, ruta, (s) => encabezadosMalos(s)[i][1]));
      }
    }
  }
  const otrosMetodos = RUTAS_DE_TAREAS.flatMap((ruta) =>
    ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((metodo) =>
      paso(`${metodo} ${ruta} · secreto correcto y Origin propio`, metodo, ruta, (s, base) => ({ ...delCron(s), origin: base }), "otro-metodo"),
    ),
  );
  const conSecretoViejo = (prefijo) =>
    RUTAS_DE_TAREAS.flatMap((ruta) => [
      paso(`${prefijo} GET ${ruta} · el secreto de antes`, "GET", ruta, delCron),
      paso(`${prefijo} HEAD ${ruta} · el secreto de antes`, "HEAD", ruta, delCron),
      paso(`${prefijo} GET ${ruta} · sin Authorization`, "GET", ruta, () => ({})),
    ]);
  return [
    {
      nombre: "puerta",
      instancia: "principal",
      estado: "puerta",
      pasos: [
        ...malos,
        ...otrosMetodos,
        paso("POST de otro origen con el secreto", "POST", RUTA_PURGA, (s) => ({ ...delCron(s), origin: "https://evil.example" }), "otro-metodo"),
        paso("POST ?_action=reportar con Origin propio y el secreto", "POST", `${RUTA_PURGA}?_action=reportar`, (s, base) => ({ ...delCron(s), origin: base }), "otro-metodo"),
        paso("GET ?_action=reportar sin el secreto", "GET", `${RUTA_PURGA}?_action=reportar`, () => ({})),
        paso("foto con clave inventada", "GET", FOTO_INVENTADA, () => ({})),
        paso("dirección inexistente bajo /api/tareas", "GET", "/api/tareas/inventada", () => ({}), "pagina-404"),
        ...RUTAS_DE_TAREAS.map((ruta) => paso(`barra final ${ruta}`, "GET", `${ruta}/`, () => ({}), "registrar")),
      ],
    },
    { nombre: "sin-secreto", instancia: "sin-secreto", estado: "puerta", pasos: conSecretoViejo("sin CRON_SECRET") },
    { nombre: "secreto-espacios", instancia: "secreto-espacios", estado: "puerta", pasos: conSecretoViejo("CRON_SECRET de espacios") },
    {
      nombre: "purga",
      instancia: "principal",
      estado: "purga",
      guion: "aceptado",
      pasos: [
        paso("la purga del día (el cron)", "GET", RUTA_PURGA, delCron),
        paso("segunda corrida del mismo día", "GET", RUTA_PURGA, delCron),
        paso("GET ?_action=reportar con el secreto", "GET", `${RUTA_PURGA}?_action=reportar`, delCron),
        paso("HEAD con el secreto", "HEAD", RUTA_PURGA, delCron),
      ],
    },
    { nombre: "purga-foto-rota", instancia: "principal", estado: "purga-foto-rota", pasos: [paso("una foto que no se puede borrar", "GET", RUTA_PURGA, delCron)] },
    { nombre: "aviso-fallido", instancia: "principal", estado: "aviso", guion: "error", pasos: [paso("el proveedor falla", "GET", RUTA_PURGA, delCron)] },
    { nombre: "aviso-rechazado", instancia: "principal", estado: "aviso", guion: "rechazado", pasos: [paso("el proveedor rechaza", "GET", RUTA_PURGA, delCron)] },
    { nombre: "aviso-repetido-en-frio", instancia: "principal", estado: "aviso", guion: "repetido", pasos: [paso("409 en frío", "GET", RUTA_PURGA, delCron)] },
    { nombre: "aviso-sin-pendientes", instancia: "principal", estado: "sin-pendientes", pasos: [paso("nada en la cola", "GET", RUTA_PURGA, delCron)] },
    { nombre: "aviso-privacidad", instancia: "principal", estado: "tres-pendientes", pasos: [paso("tres en revisión", "GET", RUTA_PURGA, delCron)] },
    {
      nombre: "sin-correo",
      instancia: "sin-correo",
      estado: "aviso",
      pasos: [paso("primera, sin correo", "GET", RUTA_PURGA, delCron), paso("segunda, sin correo", "GET", RUTA_PURGA, delCron)],
    },
    {
      nombre: "base-caida",
      instancia: "base-caida",
      estado: "vacio",
      pasos: [
        ...encabezadosMalos("x".repeat(64)).slice(0, 4).map((_, i) => paso(`secreto malo ${i}`, "GET", RUTA_PURGA, (s) => encabezadosMalos(s)[i][1])),
        paso("la purga con la base caída", "GET", RUTA_PURGA, delCron),
        paso("el barrido con la base caída", "GET", RUTA_BARRIDO, delCron),
      ],
    },
    {
      nombre: "barrido",
      instancia: "principal",
      estado: "barrido",
      pasos: [
        paso("el barrido normal (el cron)", "GET", RUTA_BARRIDO, delCron),
        paso("segunda corrida", "GET", RUTA_BARRIDO, delCron),
        paso("HEAD con el secreto", "HEAD", RUTA_BARRIDO, delCron),
      ],
    },
    { nombre: "barrido-detenido", instancia: "principal", estado: "barrido-detenido", pasos: [paso("base vacía y huérfana", "GET", RUTA_BARRIDO, delCron)] },
    {
      nombre: "sin-almacen",
      instancia: "sin-almacen",
      estado: "con-foto",
      pasos: [paso("barrido sin almacén", "GET", RUTA_BARRIDO, delCron), paso("purga sin almacén", "GET", RUTA_PURGA, delCron)],
    },
  ];
}

/** Cabeceras de transporte (y las del emulador), que no son de la respuesta. */
const DE_TRANSPORTE = new Set(["date", "connection", "keep-alive", "transfer-encoding", "content-length"]);
/** La `Vary` que Next pone a todo Route Handler: nombra su enrutador. No se replica (b-dev). */
export const VARY_DE_NEXT = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

export function cabecerasUtiles(headers) {
  const salida = {};
  for (const [nombre, valor] of Object.entries(headers)) {
    const n = nombre.toLowerCase();
    if (DE_TRANSPORTE.has(n) || n.startsWith("x-vercel-")) continue;
    salida[n] = valor;
  }
  return Object.fromEntries(Object.entries(salida).sort(([a], [b]) => a.localeCompare(b)));
}

/** Líneas del log que son de la aplicación (no del emulador, de Next al arrancar ni del simulador). */
function lineasDelLog(texto, fotosDir) {
  return texto
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "" && !/^\[(emulador|petición|resend-falso)\]/.test(l))
    .map((l) => l.split(fotosDir).join("<FOTOS_DIR>"));
}

function llamadasAlCorreo(archivoCorreo, desde) {
  const texto = readFileSync(archivoCorreo, "utf8").slice(desde);
  return texto
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((l) => ({ ...l, idempotencyKey: l.idempotencyKey?.replace(/\d{4}-\d{2}-\d{2}/, "<fecha>") ?? null }));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Corre las sesiones contra un lado. `levantar(instancia)` devuelve
 * `{ base, registro(), detener() }`. Siembra antes de cada sesión y limpia al
 * final. Devuelve, por sesión, cada paso (estado, cabeceras útiles, cuerpo en
 * base64, log y llamadas al correo) y cómo quedó lo sembrado.
 */
export async function correrSesiones6a({ levantar, consultar, fotosDir, secreto, archivoGuion, archivoCorreo, vaciarBase = false, sesiones = sesiones6a() }) {
  const salida = {};
  try {
    for (const sesion of sesiones) {
      writeFileSync(archivoGuion, sesion.guion ?? "aceptado");
      writeFileSync(archivoCorreo, "");
      await sembrarTareas(consultar, fotosDir, sesion.estado, { vaciarBase });
      const servidor = await levantar(sesion.instancia);
      const pasos = [];
      try {
        for (const p of sesion.pasos) {
          const desdeLog = servidor.registro().length;
          const desdeCorreo = readFileSync(archivoCorreo, "utf8").length;
          const r = await fetch(new URL(p.ruta, servidor.base), { method: p.metodo, redirect: "manual", headers: p.encabezados(secreto, servidor.base) });
          const cuerpo = Buffer.from(await r.arrayBuffer());
          await esperar(150);
          pasos.push({
            nombre: p.nombre,
            metodo: p.metodo,
            ruta: p.ruta,
            comparar: p.comparar,
            status: r.status,
            headers: cabecerasUtiles(Object.fromEntries(r.headers)),
            cuerpo: cuerpo.toString("base64"),
            log: lineasDelLog(servidor.registro().slice(desdeLog), fotosDir),
            correo: llamadasAlCorreo(archivoCorreo, desdeCorreo),
          });
        }
      } finally {
        servidor.detener();
      }
      salida[sesion.nombre] = { instancia: sesion.instancia, estado: sesion.estado, guion: sesion.guion ?? "aceptado", pasos, despues: await resumenDeTareas(consultar, fotosDir) };
    }
  } finally {
    await limpiarTareas(consultar, fotosDir);
  }
  return salida;
}

/** ¿Es el 404 vacío de la puerta? Estado 404, 0 bytes, sin `Content-Type` ni `Cache-Control`. */
export function esElCuatrocientosCuatroVacio(p) {
  return p.status === 404 && p.cuerpo === "" && p.headers["content-type"] === undefined && p.headers["cache-control"] === undefined;
}

/**
 * Compara un paso de Next con el de Astro. Devuelve `{ diferencias, aceptada,
 * vary }`: `aceptada` cuando aplica la ÚNICA excepción (otro método: Next
 * 405/204); `vary` cuando se descontó la `Vary` del enrutador de Next.
 */
export function compararPaso6a(n, a) {
  const diferencias = [];
  if (n.comparar === "registrar") return { diferencias, aceptada: false, vary: false };
  if (n.comparar === "otro-metodo") {
    const aceptada = n.status !== a.status && [405, 204].includes(n.status);
    if (!aceptada && JSON.stringify(n) !== JSON.stringify(a)) diferencias.push(`${n.nombre}: Next ${n.status} / Astro ${a.status}`);
    return { diferencias, aceptada, vary: false };
  }
  const hn = { ...n.headers };
  const vary = hn.vary === VARY_DE_NEXT && a.headers.vary === undefined;
  if (vary) delete hn.vary;
  if (n.comparar === "pagina-404") {
    // Como `/a/b/c` en 2a: el documento 404 con el núcleo del diff, sin exigir `Cache-Control` (la de Astro la sirve la CDN).
    const texto = (p) => ({ status: p.status, headers: p.headers, cuerpo: Buffer.from(p.cuerpo, "base64").toString("utf8") });
    diferencias.push(...compararRespuestas(n.nombre, texto(n), texto(a), { dinamica: false }));
    return { diferencias, aceptada: false, vary };
  }
  if (n.status !== a.status) diferencias.push(`${n.nombre}: estado ${n.status} ≠ ${a.status}`);
  if (n.cuerpo !== a.cuerpo) {
    diferencias.push(`${n.nombre}: cuerpo «${Buffer.from(n.cuerpo, "base64")}» ≠ «${Buffer.from(a.cuerpo, "base64")}»`);
  }
  if (JSON.stringify(hn) !== JSON.stringify(a.headers)) diferencias.push(`${n.nombre}: cabeceras ${JSON.stringify(hn)} ≠ ${JSON.stringify(a.headers)}`);
  if (JSON.stringify(n.log) !== JSON.stringify(a.log)) diferencias.push(`${n.nombre}: log ${JSON.stringify(n.log)} ≠ ${JSON.stringify(a.log)}`);
  if (JSON.stringify(n.correo) !== JSON.stringify(a.correo)) diferencias.push(`${n.nombre}: correo ${JSON.stringify(n.correo)} ≠ ${JSON.stringify(a.correo)}`);
  return { diferencias, aceptada: false, vary };
}
