import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { GET as purgarRechazadosRuta } from "../src/app/api/tareas/purgar-rechazados/route";
import type { PrismaClient } from "../src/generated/prisma/client";
import { avisarPendientes } from "../src/lib/avisos/aviso";
import { CLAVE_AVISO_PREFIJO, claveDelDia, fechaEnTizayuca } from "../src/lib/avisos/dia";
import { contarPendientes, type ClienteAviso } from "../src/lib/avisos/pendientes";
import {
  configuracionDeCorreo,
  esHostAlcanzableDesdeFuera,
  faltantesDeCorreo,
  reiniciarAvisoDeCorreoSinConfigurar,
  VARIABLE_CORREO_API_KEY,
  VARIABLE_CORREO_DESTINO,
  VARIABLE_CORREO_REMITENTE,
} from "../src/lib/correo/configuracion";
import { crearCorreoResend, reiniciarMemoriaDeEnviosDeCorreo } from "../src/lib/correo/resend";
import { obtenerPrisma } from "../src/lib/prisma";
import { crearClientePrueba } from "./db";

/**
 * ETAPA C (seguridad y pruebas adversariales) del change
 * `agregar-aviso-diario-pendientes` (T-020).
 *
 * Lo que la etapa B ya prueba —conteos, literales, fail-safe, doble disparo,
 * los cuatro cruces purga×aviso— NO se repite aquí. Esta suite ataca lo que el
 * camino feliz no toca:
 *
 * 1. **Contenido hostil dentro de la cola** que intenta salir en el correo:
 *    nombres con CRLF y encabezados de correo dentro, comentarios de reporte
 *    con `<script>`, unicode de control. El correo tiene que salir idéntico,
 *    byte por byte, al de una cola con nombres normales.
 * 2. **Caminos de error del proveedor**: un 422 que devuelve el payload
 *    entero de vuelta (destinatario, remitente y texto incluidos) y un fallo
 *    de red cuyo mensaje trae la credencial. Ni el log ni la respuesta pueden
 *    repetirlos.
 * 3. **La clave del día como cabecera HTTP** y la frontera de la medianoche de
 *    Tizayuca a lo largo de un año: ni un día repetido, ni uno saltado.
 * 4. **Valores hostiles en las variables** (`SITIO_URL` con credenciales, con
 *    esquemas que no son http(s), con salto de línea dentro).
 * 5. **La ruta bajo martilleo** con el secreto correcto, y con la base caída.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie 771998 5xxx, y ninguna
 * dirección de correo real — `@ejemplo.invalid` no existe ni puede existir
 * (RFC 2606).
 */

const PREFIJO = "7719985";
const SECRETO = "secreto-adversarial-de-pruebas-que-no-sirve-en-ningun-lado";
const AHORA = new Date("2026-09-04T13:17:00.000Z");

/** La credencial de mentiras: si aparece en un log o en una respuesta, es fuga. */
const LLAVE_DE_MENTIRAS = "re_llave_de_mentiras_que_no_abre_nada";
const REMITENTE = "avisos@ejemplo.invalid";
const DESTINO = "buzon@ejemplo.invalid";

const ENTORNO_COMPLETO = {
  [VARIABLE_CORREO_API_KEY]: LLAVE_DE_MENTIRAS,
  [VARIABLE_CORREO_REMITENTE]: REMITENTE,
  [VARIABLE_CORREO_DESTINO]: DESTINO,
  SITIO_URL: "https://enmirumbo.example",
};

/**
 * Un nombre de negocio que intenta ser tres cosas a la vez: encabezados de
 * correo colados por CRLF, HTML y unicode de control. Nada de esto puede
 * asomar en el correo, que solo lleva números.
 */
const NOMBRE_HOSTIL =
  'Taller\r\nBcc: colado@ejemplo.invalid\r\nSubject: Asunto Colado\r\n' +
  '<script>alert("xss")</script>‮​💥 "; DROP TABLE Negocio; --';

/** Un comentario de reporte igual de hostil: lo escribe un tercero. */
const COMENTARIO_HOSTIL =
  'Content-Type: text/html\r\n\r\n<img src=x onerror=alert(1)>\r\nTo: otro@ejemplo.invalid';

let prisma: PrismaClient;
let categoriaId: number;

const pedir = (encabezados: Record<string, string> = {}) =>
  purgarRechazadosRuta(
    new Request("https://enmirumbo.example/api/tareas/purgar-rechazados", {
      headers: encabezados,
    }),
  );

function configurarCorreo(): void {
  process.env[VARIABLE_CORREO_API_KEY] = LLAVE_DE_MENTIRAS;
  process.env[VARIABLE_CORREO_REMITENTE] = REMITENTE;
  process.env[VARIABLE_CORREO_DESTINO] = DESTINO;
  process.env.SITIO_URL = "https://enmirumbo.example";
}

function desconfigurarCorreo(): void {
  delete process.env[VARIABLE_CORREO_API_KEY];
  delete process.env[VARIABLE_CORREO_REMITENTE];
  delete process.env[VARIABLE_CORREO_DESTINO];
  delete process.env.SITIO_URL;
}

/** Proveedor de mentiras con la memoria de 24 h del de verdad (200 y luego 409). */
function proveedorDeMentiras(responder?: () => Promise<Response>) {
  const peticiones: Array<{ clave: string; cuerpo: Record<string, unknown> }> = [];
  const usadas = new Set<string>();
  const red = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opciones) => {
    const init = opciones as RequestInit;
    const clave = (init.headers as Record<string, string>)["Idempotency-Key"];
    peticiones.push({ clave, cuerpo: JSON.parse(init.body as string) });
    if (responder) return responder();
    if (usadas.has(clave)) {
      return new Response(JSON.stringify({ name: "invalid_idempotent_request" }), {
        status: 409,
      });
    }
    usadas.add(clave);
    return new Response(JSON.stringify({ id: "correo-de-mentiras" }), { status: 200 });
  });
  return { peticiones, red, mandados: () => usadas.size };
}

/** Junta todo lo que el proceso escribió en el log, sea del nivel que sea. */
function espiarElLog() {
  const espias = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  ];
  return () =>
    espias
      .flatMap((espia) => espia.mock.calls)
      .flat()
      .map((parte) => (typeof parte === "string" ? parte : JSON.stringify(parte)))
      .join(" ");
}

async function alta(whatsapp: string, datos: Record<string, unknown> = {}): Promise<string> {
  const creado = await prisma.negocio.create({
    data: {
      nombre: "Negocio Ficticio Adversarial",
      categoriaId,
      whatsapp,
      consintioAvisoEn: AHORA,
      registradoEn: AHORA,
      ...datos,
    },
  });
  return creado.id;
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.negocio.deleteMany();
  reiniciarAvisoDeCorreoSinConfigurar();
  // Vuelta 2: sin esto, una prueba heredaría el "hoy ya salió" de la anterior y
  // un 409 en frío dejaría de ser frío.
  reiniciarMemoriaDeEnviosDeCorreo();
  process.env.CRON_SECRET = SECRETO;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
  desconfigurarCorreo();
});

// ── 1. Lo hostil que hay en la cola no sale en el correo ───────────────────

describe("adversarial · el correo no cambia ni un byte por lo que traiga la cola", () => {
  /** El correo que DEBE salir con 1 alta y 1 reporte, y ninguno más. */
  const CUERPO_ESPERADO = [
    "Hay pendientes en la cola de EnMiRumbo:",
    "",
    "Altas nuevas: 1",
    "Reportes sin atender: 1",
    "",
    "Entra al panel: https://enmirumbo.example/admin",
    "",
    "Acuérdate: la meta es contestarle a cada negocio en menos de 48 horas.",
    "",
    "Este aviso lo manda solo el sistema, una vez al día y nada más cuando hay algo esperando.",
  ].join("\n");

  it("un nombre con CRLF y encabezados de correo dentro no cuela nada en el envío", async () => {
    const id = await alta(`${PREFIJO}001`, {
      nombre: NOMBRE_HOSTIL,
      coloniaOtra: COMENTARIO_HOSTIL,
      queOfreces: "javascript:alert(document.cookie)",
      direccion: "\r\nReply-To: nadie@ejemplo.invalid",
    });
    await prisma.reporte.create({
      data: { negocioId: id, motivo: "no_real", comentario: COMENTARIO_HOSTIL },
    });
    const proveedor = proveedorDeMentiras();

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "mandado",
    );

    const { cuerpo } = proveedor.peticiones[0];
    // Carácter por carácter: el correo de una cola envenenada es EL MISMO que
    // el de una cola con nombres normales.
    expect(cuerpo.subject).toBe("EnMiRumbo: 2 pendientes por revisar");
    expect(cuerpo.text).toBe(CUERPO_ESPERADO);
    // El destinatario y el remitente los pone la configuración, nunca el dato.
    expect(cuerpo.to).toEqual([DESTINO]);
    expect(cuerpo.from).toBe(`EnMiRumbo <${REMITENTE}>`);
    expect(Object.keys(cuerpo).sort()).toEqual(["from", "subject", "text", "to"]);
  });

  it("ni el envío entero ni sus cabeceras traen un solo trozo de lo hostil", async () => {
    const id = await alta(`${PREFIJO}002`, { nombre: NOMBRE_HOSTIL });
    await prisma.reporte.create({
      data: { negocioId: id, motivo: "inapropiado", comentario: COMENTARIO_HOSTIL },
    });
    const red = proveedorDeMentiras().red;

    await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA });

    const [, opciones] = red.mock.calls[0] as [string, RequestInit];
    const envioCompleto = JSON.stringify({
      cabeceras: opciones.headers,
      cuerpo: opciones.body,
    });
    for (const rastro of [
      "Bcc:",
      "Asunto Colado",
      "<script",
      "DROP TABLE",
      "Reply-To",
      "onerror",
      "colado@ejemplo.invalid",
      "otro@ejemplo.invalid",
      "‮",
      "\r",
      id,
      PREFIJO,
    ]) {
      expect(envioCompleto, `rastro: ${JSON.stringify(rastro)}`).not.toContain(rastro);
    }
  });

  it("el conteo que cruza la frontera son cuatro números y nada más", async () => {
    const id = await alta(`${PREFIJO}003`, { nombre: NOMBRE_HOSTIL });
    await prisma.reporte.create({ data: { negocioId: id, motivo: "cerrado" } });

    const conteo = await contarPendientes(prisma);

    expect(Object.keys(conteo).sort()).toEqual(["altas", "ediciones", "reportes", "total"]);
    for (const valor of Object.values(conteo)) expect(typeof valor).toBe("number");
    // Ni el nombre ni el id sobreviven a la serialización del conteo.
    expect(JSON.stringify(conteo)).not.toContain("Taller");
    expect(JSON.stringify(conteo)).not.toContain(id);
  });

  it("el log de una corrida con datos hostiles tampoco los repite", async () => {
    const id = await alta(`${PREFIJO}004`, { nombre: NOMBRE_HOSTIL });
    await prisma.reporte.create({
      data: { negocioId: id, motivo: "cerrado", comentario: COMENTARIO_HOSTIL },
    });
    proveedorDeMentiras();
    const dicho = espiarElLog();

    await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA });

    const registro = dicho();
    expect(registro).toContain("[aviso]");
    for (const rastro of ["Taller", "<script", "Bcc:", "onerror", id, PREFIJO]) {
      expect(registro, `rastro: ${rastro}`).not.toContain(rastro);
    }
  });
});

// ── 2. Los caminos de error del proveedor no filtran nada ──────────────────

describe("adversarial · lo que el proveedor conteste no se repite en ningún lado", () => {
  const puerto = () =>
    crearCorreoResend({
      apiKey: LLAVE_DE_MENTIRAS,
      remitente: REMITENTE,
      destino: DESTINO,
      urlPanel: "https://enmirumbo.example/admin",
    });

  const mensaje = {
    asunto: "EnMiRumbo: 1 pendiente por revisar",
    texto: "Hay pendientes en la cola de EnMiRumbo:",
    claveDelDia: `${CLAVE_AVISO_PREFIJO}2026-09-04`,
    remitenteVisible: "EnMiRumbo",
  };

  /**
   * Un 422 de Resend devuelve el campo que no le gustó — y hay proveedores que
   * devuelven el payload entero. Si el adaptador leyera ese cuerpo para
   * "dar más contexto", el buzón del admin, el remitente y hasta la credencial
   * acabarían en los logs de Vercel, que no son el sitio para eso.
   */
  it("un 422 con el payload de vuelta se registra como '422' y nada más", async () => {
    const eco = {
      statusCode: 422,
      name: "validation_error",
      message:
        `The 'to' field ${DESTINO} is invalid; from=${REMITENTE}; ` +
        `authorization=Bearer ${LLAVE_DE_MENTIRAS}; text=${mensaje.texto}`,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(eco), { status: 422 }),
    );
    const dicho = espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("fallido");

    const registro = dicho();
    expect(registro).toContain("[aviso]");
    expect(registro).toContain("422");
    for (const secreto of [
      LLAVE_DE_MENTIRAS,
      DESTINO,
      REMITENTE,
      "validation_error",
      "The 'to' field",
    ]) {
      expect(registro, `no debería salir: ${secreto}`).not.toContain(secreto);
    }
  });

  it("un error de red cuyo mensaje trae la credencial solo deja la clase del error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError(
        `Invalid header value: Authorization: Bearer ${LLAVE_DE_MENTIRAS}\nX-Colado: 1`,
      ),
    );
    const dicho = espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("fallido");

    const registro = dicho();
    expect(registro).toContain("TypeError");
    expect(registro).not.toContain(LLAVE_DE_MENTIRAS);
    expect(registro).not.toContain("X-Colado");
  });

  it("un fallo que ni siquiera es un Error tampoco se imprime tal cual", async () => {
    // `fetch` puede rechazar con cualquier cosa si algo del entorno lo envuelve.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      `explotó con la llave ${LLAVE_DE_MENTIRAS} dentro`,
    );
    const dicho = espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("fallido");
    expect(dicho()).not.toContain(LLAVE_DE_MENTIRAS);
  });

  it("un 401 (credencial revocada) es fallido y no repite la credencial", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: `API key ${LLAVE_DE_MENTIRAS} is invalid` }), {
        status: 401,
      }),
    );
    const dicho = espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("fallido");
    expect(dicho()).toContain("401");
    expect(dicho()).not.toContain(LLAVE_DE_MENTIRAS);
  });

  it("la respuesta HTTP de la tarea tampoco repite lo que dijo el proveedor", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}010`, { nombre: NOMBRE_HOSTIL });
    proveedorDeMentiras(
      async () =>
        new Response(
          JSON.stringify({
            name: "validation_error",
            message: `to=${DESTINO} key=${LLAVE_DE_MENTIRAS}`,
          }),
          { status: 422 },
        ),
    );
    espiarElLog();

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });
    const crudo = await respuesta.text();

    expect(respuesta.status).toBe(500);
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual([
      "aviso",
      "cuposLimpiados",
      "eliminados",
      "fallidos",
    ]);
    for (const secreto of [LLAVE_DE_MENTIRAS, DESTINO, REMITENTE, "validation_error", "Taller"]) {
      expect(crudo, `no debería salir: ${secreto}`).not.toContain(secreto);
    }
  });
});

// ── 3. La clave del día: cabecera segura y frontera de la medianoche ───────

describe("adversarial · la marca del día aguanta como cabecera y como calendario", () => {
  it("es ASCII imprimible, corta y válida como cabecera HTTP, 400 días seguidos", () => {
    const patron = new RegExp(`^${CLAVE_AVISO_PREFIJO}\\d{4}-\\d{2}-\\d{2}$`);
    for (let dia = 0; dia < 400; dia += 1) {
      const clave = claveDelDia(new Date(Date.UTC(2026, 0, 1, 13, 17) + dia * 86_400_000));
      expect(clave).toMatch(patron);
      // Nada de espacios finos, marcas de dirección ni dígitos no latinos: una
      // cabecera con un carácter fuera de ASCII hace que `fetch` truene y el
      // aviso fallaría TODOS los días sin que nadie entienda por qué.
      expect(clave).toMatch(/^[\x21-\x7e]+$/);
      expect(clave.length).toBeLessThanOrEqual(256);
      expect(() => new Headers({ "Idempotency-Key": clave })).not.toThrow();
    }
  });

  it("en la medianoche de Tizayuca no se repite ni se salta un solo día del año", () => {
    const vistos: string[] = [];
    for (let dia = 0; dia < 365; dia += 1) {
      // 06:00 UTC = 00:00:00 en Tizayuca (UTC−6 todo el año desde 2022).
      const medianoche = new Date(Date.UTC(2026, 0, 1, 6, 0, 0) + dia * 86_400_000);
      const unMsAntes = new Date(medianoche.getTime() - 1);
      const hoy = fechaEnTizayuca(medianoche);
      const ayer = fechaEnTizayuca(unMsAntes);

      expect(hoy, `día ${dia}`).not.toBe(ayer);
      // El día de antes es exactamente el anterior: ni dos saltos ni ninguno.
      expect(
        (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${ayer}T00:00:00Z`)) / 86_400_000,
      ).toBe(1);
      vistos.push(hoy);
    }
    expect(new Set(vistos).size).toBe(365);
  });

  it("todos los disparos de un mismo día local comparten clave, de 00:00 a 23:59", () => {
    const dia = "2026-09-04";
    const arranque = Date.UTC(2026, 8, 4, 6, 0, 0); // 00:00 local
    const claves = new Set<string>();
    for (let minuto = 0; minuto < 24 * 60; minuto += 1) {
      claves.add(claveDelDia(new Date(arranque + minuto * 60_000)));
    }
    expect([...claves]).toEqual([`${CLAVE_AVISO_PREFIJO}${dia}`]);
  });

  it("cruzar la medianoche local sí abre un día nuevo (y por eso un correo nuevo)", () => {
    const antes = new Date("2026-09-05T05:59:59.999Z"); // 23:59:59 del 4
    const despues = new Date("2026-09-05T06:00:00.000Z"); // 00:00:00 del 5
    expect(claveDelDia(antes)).toBe(`${CLAVE_AVISO_PREFIJO}2026-09-04`);
    expect(claveDelDia(despues)).toBe(`${CLAVE_AVISO_PREFIJO}2026-09-05`);
  });
});

// ── 4. Valores hostiles en las variables ───────────────────────────────────

describe("adversarial · variables con valores raros no producen un correo raro", () => {
  const conSitio = (valor: string) => ({ ...ENTORNO_COMPLETO, SITIO_URL: valor });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["file:///etc/passwd"],
    ["ftp://enmirumbo.example"],
    ["//enmirumbo.example"],
    ["no-es-una-url"],
    ["http://localhost:3000"],
    ["HTTP://LOCALHOST:3000"],
    ["http://localhost:3000/admin"],
    ["   "],
  ])("un SITIO_URL de %s deja el aviso apagado, no manda un enlace roto", (valor) => {
    expect(faltantesDeCorreo(conSitio(valor))).toEqual(["SITIO_URL"]);
    expect(configuracionDeCorreo(conSitio(valor))).toBeNull();
  });

  it("un SITIO_URL con usuario y contraseña dentro no los mete en el correo", () => {
    const configuracion = configuracionDeCorreo(
      conSitio("https://admin:contrasena-secreta@enmirumbo.example"),
    );
    expect(configuracion?.urlPanel).toBe("https://enmirumbo.example/admin");
    expect(configuracion?.urlPanel).not.toContain("contrasena-secreta");
    expect(configuracion?.urlPanel).not.toContain("admin:");
  });

  it("un SITIO_URL con ruta, query o ancla se queda solo en el origen", () => {
    for (const valor of [
      "https://enmirumbo.example/lo-que-sea?x=1#y",
      "https://enmirumbo.example/",
      "https://enmirumbo.example/admin/../../etc",
    ]) {
      expect(configuracionDeCorreo(conSitio(valor))?.urlPanel).toBe(
        "https://enmirumbo.example/admin",
      );
    }
  });

  /**
   * Un `SITIO_URL` con un salto de línea dentro es el intento clásico de meter
   * una segunda línea en el cuerpo del correo ("Entra al panel: …" apuntando a
   * otro sitio). Dos defensas encadenadas lo paran: `new URL` tira los saltos y
   * `.origin` se queda solo con esquema+host, así que lo que se cuela detrás
   * del salto no llega a ser un enlace propio. Y si el resultado no es una URL
   * legible, el aviso se apaga entero.
   */
  it.each([
    ["https://enmirumbo.example\r\nEntra al panel: https://phishing.example"],
    ["https://enmirumbo.example\nhttps://phishing.example"],
    ["https://enmirumbo.example\r\n\r\nBcc: colado@ejemplo.invalid"],
    ["https://enmirumbo.example\thttps://phishing.example"],
  ])("un SITIO_URL con salto de línea (%j) no cuela una segunda línea", (valor) => {
    const configuracion = configuracionDeCorreo(conSitio(valor));
    if (configuracion === null) return; // Fail-safe: sin enlace no hay correo.
    expect(configuracion.urlPanel).not.toMatch(/[\r\n\t]/);
    expect(configuracion.urlPanel).not.toContain("phishing.example");
    expect(configuracion.urlPanel).not.toContain("Bcc");
    // Sigue siendo UN enlace: esquema, host y `/admin`. Nada más.
    expect(configuracion.urlPanel).toMatch(/^https?:\/\/[^/\s]+\/admin$/);
  });

  it("las variables se leen recortadas: espacios y saltos alrededor no cuentan", () => {
    const sucio = {
      ...ENTORNO_COMPLETO,
      [VARIABLE_CORREO_API_KEY]: `  ${LLAVE_DE_MENTIRAS}\n`,
      [VARIABLE_CORREO_REMITENTE]: `\t${REMITENTE} `,
      [VARIABLE_CORREO_DESTINO]: `${DESTINO}\r\n`,
    };
    const configuracion = configuracionDeCorreo(sucio);
    expect(configuracion?.apiKey).toBe(LLAVE_DE_MENTIRAS);
    expect(configuracion?.remitente).toBe(REMITENTE);
    expect(configuracion?.destino).toBe(DESTINO);
    // Una cabecera `Authorization` con un salto dentro haría fallar el envío
    // todos los días: que no quede ninguno.
    for (const valor of Object.values(configuracion!)) {
      expect(valor).not.toMatch(/[\r\n]/);
    }
  });

  it("lo que se dice del hueco son NOMBRES de variables, nunca sus valores", () => {
    const aMedias = {
      [VARIABLE_CORREO_API_KEY]: LLAVE_DE_MENTIRAS,
      [VARIABLE_CORREO_REMITENTE]: REMITENTE,
      SITIO_URL: "https://enmirumbo.example",
    };
    const faltan = faltantesDeCorreo(aMedias).join(" ");
    expect(faltan).toBe(VARIABLE_CORREO_DESTINO);
    expect(faltan).not.toContain(LLAVE_DE_MENTIRAS);
    expect(faltan).not.toContain(REMITENTE);
  });
});

// ── 5. Sin configuración no se lee ni un dato personal ─────────────────────

describe("adversarial · el aviso apagado no toca la base ni a nadie", () => {
  /** Un cliente de mentiras que grita si alguien intenta leer datos. */
  function prismaQueNoDebeUsarse(): { cliente: ClienteAviso; lecturas: string[] } {
    const lecturas: string[] = [];
    const leer = (nombre: string) => async () => {
      lecturas.push(nombre);
      return [];
    };
    const cliente = {
      negocio: {
        findMany: leer("negocio.findMany"),
        findUnique: leer("negocio.findUnique"),
        count: async () => {
          lecturas.push("negocio.count");
          return 0;
        },
      },
      edicionPendiente: { findMany: leer("edicionPendiente.findMany") },
      reporte: { findMany: leer("reporte.findMany") },
    } as unknown as ClienteAviso;
    return { cliente, lecturas };
  }

  it("sin configuración de correo no se lee ni una fila de la cola", async () => {
    const { cliente, lecturas } = prismaQueNoDebeUsarse();
    espiarElLog();

    expect(await avisarPendientes({ prisma: cliente, env: {}, ahora: AHORA })).toBe(
      "sin-configurar",
    );

    expect(lecturas).toEqual([]);
  });

  /**
   * Decisión 4 de la etapa B ("contar los pendientes puede fallar y eso es
   * `fallido`") no tenía prueba. Si la base se cae al contar no se sabe si
   * había algo que avisar, así que tiene que fallar A LA VISTA — y sin repetir
   * el mensaje del driver, que trae la cadena de conexión con contraseña.
   */
  it("si contar los pendientes revienta, el aviso es fallido y no repite el mensaje del driver", async () => {
    const cadena = "postgres://postgres:contrasena-secreta@localhost:51246/template1";
    const cliente = {
      negocio: {
        findMany: async () => {
          throw new Error(`connect ECONNREFUSED ${cadena}`);
        },
        findUnique: async () => null,
        count: async () => 0,
      },
      edicionPendiente: { findMany: async () => [] },
      reporte: { findMany: async () => [] },
    } as unknown as ClienteAviso;
    const red = vi.spyOn(globalThis, "fetch");
    const dicho = espiarElLog();

    expect(await avisarPendientes({ prisma: cliente, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "fallido",
    );

    expect(red).not.toHaveBeenCalled();
    const registro = dicho();
    expect(registro).toContain("[aviso]");
    expect(registro).not.toContain("contrasena-secreta");
    expect(registro).not.toContain(cadena);
  });
});

// ── 6. La ruta bajo martilleo y con la base caída ──────────────────────────

describe("adversarial · la ruta no se convierte en una máquina de mandar correos", () => {
  /**
   * Idempotencia como defensa anti-inundación: quien tenga el secreto (o el
   * cron reintentando tras un 500) puede disparar la tarea todas las veces que
   * quiera, y al buzón del admin llega UN correo.
   */
  it("veinte disparos seguidos el mismo día dejan un solo correo en el buzón", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}020`);
    const proveedor = proveedorDeMentiras();
    espiarElLog();

    const respuestas: number[] = [];
    for (let intento = 0; intento < 20; intento += 1) {
      respuestas.push((await pedir({ authorization: `Bearer ${SECRETO}` })).status);
    }

    // Ni un 500: el 409 del proveedor significa "el de hoy ya salió".
    expect(respuestas.every((estado) => estado === 200)).toBe(true);
    expect(proveedor.peticiones).toHaveLength(20);
    expect(new Set(proveedor.peticiones.map((p) => p.clave)).size).toBe(1);
    expect(proveedor.mandados()).toBe(1);
  });

  it("un pendiente nuevo a media tarde no abre la puerta a un segundo correo", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}030`);
    const proveedor = proveedorDeMentiras();
    espiarElLog();

    await pedir({ authorization: `Bearer ${SECRETO}` });
    // Cambia el CUERPO del correo (2 altas en vez de 1): la clave no cambia.
    await alta(`${PREFIJO}031`);
    await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(proveedor.peticiones[0].cuerpo.subject).not.toBe(
      proveedor.peticiones[1].cuerpo.subject,
    );
    expect(proveedor.peticiones[0].clave).toBe(proveedor.peticiones[1].clave);
    expect(proveedor.mandados()).toBe(1);
  });

  it("sin el secreto, ni siquiera se cuenta lo que hay en la cola", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}040`);
    const proveedor = proveedorDeMentiras();
    const dicho = espiarElLog();

    // (Un `Bearer <secreto> ` con espacio al final NO va en esta lista: el
    // propio HTTP recorta los espacios del valor, así que ese encabezado ES el
    // secreto correcto. Quien no lo sepa sigue sin poder fabricarlo.)
    const encabezados: Record<string, string>[] = [
      {},
      { authorization: `Bearer ${SECRETO}x` },
      { authorization: `Bearer ${SECRETO.slice(0, -1)}` },
      { authorization: `bearer ${SECRETO}` },
      { authorization: `Bearer  ${SECRETO}` },
      { authorization: `Basic ${SECRETO}` },
      { authorization: `Bearer ${SECRETO.toUpperCase()}` },
      { authorization: "Bearer " },
      { authorization: SECRETO },
    ];
    for (const encabezado of encabezados) {
      await expect(pedir(encabezado)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    }

    expect(proveedor.red).not.toHaveBeenCalled();
    // Y el 404 no deja rastro en el log de que ahí dentro hay un correo.
    expect(dicho()).not.toContain("[aviso]");
  });

  it("con la base caída la tarea responde 500 sin filtrar la cadena de conexión", async () => {
    configurarCorreo();
    const cadena = "postgres://postgres:contrasena-secreta@localhost:51246/template1";
    const cliente = obtenerPrisma();
    vi.spyOn(cliente.negocio, "findMany").mockRejectedValue(
      new Error(`connect ECONNREFUSED ${cadena} (Negocio Ficticio Adversarial)`),
    );
    const proveedor = proveedorDeMentiras();
    const dicho = espiarElLog();

    const respuesta = await pedir({ authorization: `Bearer ${SECRETO}` });
    const crudo = await respuesta.text();

    expect(respuesta.status).toBe(500);
    expect(Object.keys(JSON.parse(crudo)).sort()).toEqual(["aviso", "error"]);
    expect(JSON.parse(crudo).aviso).toBe("fallido");
    // Ni la respuesta ni el log repiten el mensaje del driver.
    for (const rastro of ["contrasena-secreta", "ECONNREFUSED", "Negocio Ficticio"]) {
      expect(crudo, `respuesta: ${rastro}`).not.toContain(rastro);
      expect(dicho(), `log: ${rastro}`).not.toContain(rastro);
    }
    // Y no se manda un correo "por si acaso" cuando no se sabe qué hay.
    expect(proveedor.red).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VUELTA 2 — re-verificación independiente de lo que el dev cerró
// ════════════════════════════════════════════════════════════════════════════

// ── 7. MEDIO-2: la guarda nueva del host, atacada por los dos lados ────────

describe("adversarial · vuelta 2 · ningún host de red interna se cuela en el enlace", () => {
  const conSitio = (valor: string) => ({ ...ENTORNO_COMPLETO, SITIO_URL: valor });

  /**
   * Las seis variantes del hallazgo MEDIO-2 original, más las que el
   * normalizador de URL puede fabricar: IPv4 en decimal, en octal y abreviada,
   * IPv6 expandida, mayúsculas, y los sufijos que solo existen dentro de una
   * red. Ninguna puede terminar en la bandeja del admin: un enlace que no abre
   * desde datos móviles es un aviso muerto.
   */
  it.each([
    // Las del hallazgo, una por una.
    ["http://localhost:3000"],
    ["http://localhost:3001"],
    ["http://localhost"],
    ["http://127.0.0.1:3000"],
    ["http://[::1]:3000"],
    ["http://0.0.0.0:3000"],
    ["http://192.168.1.50:3000"],
    // Mayúsculas: las apaga el normalizador, pero la guarda no puede confiarse.
    ["http://LOCALHOST:3000"],
    ["HTTP://LocalHost/"],
    // La misma dirección escrita de otras cuatro formas.
    ["http://127.1"],
    ["http://2130706433"],
    ["http://0x7f.0.0.1"],
    ["http://[0:0:0:0:0:0:0:1]"],
    // El resto de bloques que no salen de la red.
    ["http://10.1.2.3"],
    ["http://172.16.0.1"],
    ["http://172.31.255.1"],
    ["http://169.254.169.254"],
    ["http://[fc00::1]"],
    ["http://[fd12:3456::1]"],
    ["http://[fe80::1]"],
    // Nombres que solo resuelven dentro de una red.
    ["http://mi-laptop:3000"],
    ["http://panel.local"],
    ["http://panel.internal"],
    ["http://panel.home"],
    ["http://panel.lan"],
    ["http://panel.localhost"],
  ])("%s deja el aviso apagado", (valor) => {
    expect(faltantesDeCorreo(conSitio(valor))).toEqual(["SITIO_URL"]);
    expect(configuracionDeCorreo(conSitio(valor))).toBeNull();
  });

  /**
   * La otra mitad del arreglo, y la que más caro sale si falla: un falso
   * positivo apaga el aviso EN PRODUCCIÓN y en silencio. Se incluyen a
   * propósito los vecinos peligrosos de la lista de sufijos (`.homes`,
   * `.international`, `.localhosting.mx`) y los bloques IPv4 pegados a los
   * privados (`172.15`, `172.32`).
   */
  it.each([
    ["https://enmirumbo.com", "https://enmirumbo.com/admin"],
    ["https://www.enmirumbo.com", "https://www.enmirumbo.com/admin"],
    ["https://enmirumbo.com:8443", "https://enmirumbo.com:8443/admin"],
    ["https://enmirumbo-git-t020.vercel.app", "https://enmirumbo-git-t020.vercel.app/admin"],
    ["https://xn--80ak6aa92e.com", "https://xn--80ak6aa92e.com/admin"],
    ["https://ejemplo.co.uk", "https://ejemplo.co.uk/admin"],
    ["https://casas.homes", "https://casas.homes/admin"],
    ["https://algo.international", "https://algo.international/admin"],
    ["https://algo.localhosting.mx", "https://algo.localhosting.mx/admin"],
    ["http://172.32.0.1", "http://172.32.0.1/admin"],
    ["http://172.15.0.1", "http://172.15.0.1/admin"],
    ["http://9.9.9.9", "http://9.9.9.9/admin"],
    ["https://[2606:4700::1111]", "https://[2606:4700::1111]/admin"],
    ["https://sub.dominio.mx", "https://sub.dominio.mx/admin"],
  ])("%s SÍ vale: el aviso no se apaga en producción por pasarse de listo", (valor, panel) => {
    expect(faltantesDeCorreo(conSitio(valor))).toEqual([]);
    expect(configuracionDeCorreo(conSitio(valor))?.urlPanel).toBe(panel);
  });

  it("un host vacío no cuenta como público: la guarda cierra por defecto", () => {
    expect(esHostAlcanzableDesdeFuera("")).toBe(false);
    expect(esHostAlcanzableDesdeFuera("   ")).toBe(false);
  });

  it("la guarda decide por el host, no por el esquema: https a localhost tampoco vale", () => {
    expect(faltantesDeCorreo(conSitio("https://localhost:3000"))).toEqual(["SITIO_URL"]);
  });
});

// ── 8. MEDIO-1: el 409 partido en dos, por sus dos caminos ────────────────

describe("adversarial · vuelta 2 · el 409 ya no puede responder verde sin haber mandado", () => {
  const puerto = () =>
    crearCorreoResend({
      apiKey: LLAVE_DE_MENTIRAS,
      remitente: REMITENTE,
      destino: DESTINO,
      urlPanel: "https://enmirumbo.example/admin",
    });

  const mensajeDe = (clave: string) => ({
    asunto: "EnMiRumbo: 1 pendiente por revisar",
    texto: "Hay pendientes en la cola de EnMiRumbo:",
    claveDelDia: clave,
    remitenteVisible: "EnMiRumbo",
  });

  const HOY = `${CLAVE_AVISO_PREFIJO}2026-09-04`;
  const AYER = `${CLAVE_AVISO_PREFIJO}2026-09-03`;

  const respuesta409 = () =>
    new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 });
  const respuesta200 = () => new Response(JSON.stringify({ id: "correo-de-mentiras" }), {
    status: 200,
  });

  it("409 EN FRÍO es fallido, y el log dice que este intento no mandó nada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respuesta409());
    const dicho = espiarElLog();

    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");

    const registro = dicho();
    expect(registro).toContain("409");
    expect(registro).not.toContain("ya salió");
    // Y sigue sin filtrar nada de lo de siempre.
    expect(registro).not.toContain(LLAVE_DE_MENTIRAS);
    expect(registro).not.toContain(DESTINO);
  });

  it("409 EN CALIENTE (vimos salir el de hoy) sí es 'mandado'", async () => {
    let primera = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        return respuesta200();
      }
      return respuesta409();
    });
    espiarElLog();

    expect(await puerto().mandar(mensajeDe(HOY))).toBe("mandado");
    expect(await puerto().mandar(mensajeDe(HOY))).toBe("mandado");
  });

  it("la memoria no se hereda entre días: el 200 de AYER no tapa el 409 de HOY", async () => {
    let primera = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        return respuesta200();
      }
      return respuesta409();
    });
    espiarElLog();

    expect(await puerto().mandar(mensajeDe(AYER))).toBe("mandado");
    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");
  });

  it("un intento RECHAZADO no calienta la memoria: dos 409 seguidos siguen siendo fallidos", async () => {
    // Lo peligroso sería que un camino que NO es 200 marcara la clave como
    // "aceptada": a partir de ahí, cualquier 409 posterior saldría en verde.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respuesta409());
    espiarElLog();

    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");
    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");
  });

  it("un 403 tampoco calienta la memoria: el 409 que venga después sigue siendo fallido", async () => {
    let primera = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (primera) {
        primera = false;
        return new Response(JSON.stringify({ name: "validation_error" }), { status: 403 });
      }
      return respuesta409();
    });
    espiarElLog();

    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");
    expect(await puerto().mandar(mensajeDe(HOY))).toBe("fallido");
  });

  /**
   * EL ESCENARIO QUE ABRIÓ EL HALLAZGO, de punta a punta por la ruta: el cron
   * de las 07:17 mandó el correo del día; a mediodía alguien redispara la tarea
   * y le contesta OTRA INSTANCIA, sin memoria de aquel envío, con conteos ya
   * distintos. Las dos cosas tienen que cumplirse a la vez: ni un segundo
   * correo, ni un 200 diciendo que todo salió bien.
   */
  it("cron 07:17 con éxito + redisparo a mediodía desde otra instancia: ni doble correo ni falso verde", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}100`);
    const proveedor = proveedorDeMentiras();
    espiarElLog();

    const cron = await pedir({ authorization: `Bearer ${SECRETO}` });
    expect(cron.status).toBe(200);
    expect(await cron.json()).toMatchObject({ aviso: "mandado" });
    expect(proveedor.mandados()).toBe(1);

    // La instancia que atiende el redisparo es otra: no vio salir nada.
    reiniciarMemoriaDeEnviosDeCorreo();
    // Y a mediodía ya hay un pendiente más, así que el cuerpo cambia y el
    // proveedor contesta 409 en vez de descartar en silencio.
    await alta(`${PREFIJO}101`);

    const redisparo = await pedir({ authorization: `Bearer ${SECRETO}` });
    const cuerpo = await redisparo.json();

    // 1. Al buzón NO llegó un segundo correo.
    expect(proveedor.mandados()).toBe(1);
    expect(proveedor.peticiones).toHaveLength(2);
    expect(proveedor.peticiones[0].clave).toBe(proveedor.peticiones[1].clave);
    // 2. Y la respuesta NO es un verde falso.
    expect(redisparo.status).toBe(500);
    expect(cuerpo).toMatchObject({ aviso: "fallido" });
  });

  it("el redisparo del MISMO proceso sigue en verde: el falso rojo no se cobra de más", async () => {
    configurarCorreo();
    await alta(`${PREFIJO}110`);
    const proveedor = proveedorDeMentiras();
    espiarElLog();

    const primera = await pedir({ authorization: `Bearer ${SECRETO}` });
    await alta(`${PREFIJO}111`);
    const segunda = await pedir({ authorization: `Bearer ${SECRETO}` });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ aviso: "mandado" });
    expect(proveedor.mandados()).toBe(1);
  });
});

// ── 9. El User-Agent nuevo y el cuerpo que se descarta sin leerse ──────────

describe("adversarial · vuelta 2 · la petición se presenta y no lee lo que le contestan", () => {
  const puerto = () =>
    crearCorreoResend({
      apiKey: LLAVE_DE_MENTIRAS,
      remitente: REMITENTE,
      destino: DESTINO,
      urlPanel: "https://enmirumbo.example/admin",
    });

  const mensaje = {
    asunto: "EnMiRumbo: 1 pendiente por revisar",
    texto: "Hay pendientes en la cola de EnMiRumbo:",
    claveDelDia: `${CLAVE_AVISO_PREFIJO}2026-09-04`,
    remitenteVisible: "EnMiRumbo",
  };

  it("manda un User-Agent válido que no lleva la credencial ni el buzón dentro", async () => {
    const red = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));

    await puerto().mandar(mensaje);

    const cabeceras = (red.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const agente = cabeceras["User-Agent"];
    expect(agente).toBeTruthy();
    // Cabecera válida: ASCII imprimible, sin saltos que partan la petición.
    expect(agente).toMatch(/^[\x21-\x7e][\x20-\x7e]*$/);
    expect(agente).not.toContain(LLAVE_DE_MENTIRAS);
    expect(agente).not.toContain(DESTINO);
    expect(() => new Headers({ "User-Agent": agente })).not.toThrow();
  });

  /**
   * El guardián de comportamiento del BAJO-1, complementario al de fuente que
   * escribió el dev: el cuerpo del 422 de Resend trae de vuelta destinatario,
   * remitente y texto del correo, así que se cancela SIN leerlo. Si alguien
   * mete un `await respuesta.json()` "para mejorar el mensaje", esto se pone
   * rojo aunque el guardián de fuente cambie de forma.
   */
  it("el cuerpo se cancela y NINGÚN lector se llama, ni en el camino de error", async () => {
    for (const estado of [200, 422, 409, 500]) {
      reiniciarMemoriaDeEnviosDeCorreo();
      const respuesta = new Response(
        JSON.stringify({ to: DESTINO, key: LLAVE_DE_MENTIRAS, text: "el correo entero" }),
        { status: estado },
      );
      const cancelar = vi.spyOn(respuesta.body!, "cancel");
      const leerElFlujo = vi.spyOn(respuesta.body!, "getReader");
      const lectores = (["json", "text", "arrayBuffer", "blob", "formData"] as const).map(
        (nombre) => [nombre, vi.spyOn(respuesta, nombre)] as const,
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValue(respuesta);
      espiarElLog();

      await puerto().mandar(mensaje);

      expect(cancelar, `estado ${estado}`).toHaveBeenCalled();
      for (const [nombre, espia] of lectores) {
        expect(espia, `estado ${estado}: se llamó a ${nombre}()`).not.toHaveBeenCalled();
      }
      // Nadie abrió el flujo para leer sus bytes; solo se descartó.
      // (`bodyUsed` sí pasa a `true`: cancelar "perturba" el flujo según la
      // especificación de Fetch. Perturbado no es leído.)
      expect(leerElFlujo, `estado ${estado}: alguien abrió el flujo`).not.toHaveBeenCalled();
      expect(respuesta.body!.locked, `estado ${estado}`).toBe(false);
      vi.restoreAllMocks();
    }
  });

  it("una respuesta sin cuerpo no rompe el envío", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("mandado");
  });

  it("si cancelar el cuerpo falla, el envío no se cae ni deja una promesa suelta", async () => {
    const respuesta = new Response(JSON.stringify({ id: "x" }), { status: 200 });
    vi.spyOn(respuesta.body!, "cancel").mockRejectedValue(new Error("stream bloqueado"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respuesta);
    const sueltas: unknown[] = [];
    const alSoltar = (razon: unknown) => sueltas.push(razon);
    process.on("unhandledRejection", alSoltar);
    espiarElLog();

    expect(await puerto().mandar(mensaje)).toBe("mandado");
    await new Promise((seguir) => setTimeout(seguir, 10));
    process.off("unhandledRejection", alSoltar);

    expect(sueltas).toEqual([]);
  });
});

// ── 10. Regresión del diff de la vuelta 2 ─────────────────────────────────

describe("adversarial · vuelta 2 · las lecturas en serie cuentan lo mismo que antes", () => {
  it("el conteo sigue coincidiendo con la cola con los tres tipos y datos hostiles", async () => {
    const enRevision = await alta(`${PREFIJO}200`, { nombre: NOMBRE_HOSTIL });
    await alta(`${PREFIJO}201`);
    const publicado = await alta(`${PREFIJO}202`, { estado: "publicado", publicadoEn: AHORA });
    await prisma.edicionPendiente.create({
      data: {
        negocioId: publicado,
        nombre: NOMBRE_HOSTIL,
        categoriaId,
        whatsapp: `${PREFIJO}203`,
        estado: "pendiente",
      },
    });
    await prisma.reporte.create({
      data: { negocioId: enRevision, motivo: "cerrado", comentario: COMENTARIO_HOSTIL },
    });
    await prisma.reporte.create({ data: { negocioId: publicado, motivo: "no_real" } });

    const conteo = await contarPendientes(prisma);

    expect(conteo).toEqual({ altas: 2, ediciones: 1, reportes: 2, total: 5 });
    // Y sigue sin sacar nada más que números de su frontera.
    expect(Object.keys(conteo).sort()).toEqual(["altas", "ediciones", "reportes", "total"]);
    expect(JSON.stringify(conteo)).not.toContain("Taller");
  });

  it("con la cola vacía sigue sin contar nada y sin tocar la red", async () => {
    await alta(`${PREFIJO}210`, { estado: "publicado", publicadoEn: AHORA });
    const proveedor = proveedorDeMentiras();
    espiarElLog();

    expect(await avisarPendientes({ prisma, env: ENTORNO_COMPLETO, ahora: AHORA })).toBe(
      "sin-pendientes",
    );
    expect(proveedor.red).not.toHaveBeenCalled();
  });
});
