import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  ESTADO_NEGOCIO_DEFAULT,
  ORIGEN_NEGOCIO_DEFAULT,
} from "../src/lib/negocio";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import {
  procesarRegistro,
  type ClienteRegistro,
} from "../src/lib/registro/procesar";
import { VERSION_AVISO } from "../src/lib/legales/version";
import {
  CAMPO_VERSION_AVISO,
  COLONIA_OTRA_VALOR,
  MENSAJES_ERROR_REGISTRO,
} from "../src/lib/registro/textos";
import { crearClientePrueba } from "./db";

// Datos 100% ficticios (repo público + LFPDPPP): números 771999xxxx y nombres
// inventados. Spec: registro-negocio · requirements de validación de servidor,
// unicidad por número, consentimiento, envío exitoso y anti-abuso.

const IP = "203.0.113.10"; // rango TEST-NET-3, reservado para documentación

describe("procesarRegistro (Server Action de registro)", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;

  /** FormData equivalente al que manda el navegador (con o sin JS). */
  function envio(campos: Record<string, string> = {}): FormData {
    const formData = new FormData();
    const base: Record<string, string> = {
      nombre: "Plomería Ficticia El Tubo Feliz",
      categoriaId: String(categoriaId),
      whatsapp: "7719990101",
      coloniaId: String(coloniaId),
      consentimiento: "on",
      // El campo oculto que el formulario devuelve con la versión del aviso
      // que se pintó (change `versionar-aviso-privacidad`).
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
      ...campos,
    };
    for (const [clave, valor] of Object.entries(base)) {
      if (valor !== "") formData.append(clave, valor);
    }
    return formData;
  }

  const procesar = (formData: FormData, extra: Partial<{ ip: string | null }> = {}) =>
    procesarRegistro(formData, { prisma, ip: IP, ...extra });

  const buscar = (whatsapp: string) =>
    prisma.negocio.findUnique({ where: { whatsapp } });

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await seedCatalogos(prisma);
    categoriaId = (
      await prisma.categoria.findUniqueOrThrow({
        where: { slug: "servicios-del-hogar" },
      })
    ).id;
    coloniaId = (
      await prisma.colonia.findUniqueOrThrow({
        where: { slug: "haciendas-de-tizayuca" },
      })
    ).id;
  });

  beforeEach(async () => {
    reiniciarLimitePorIp();
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "771999" } } });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "771999" } } });
    await prisma.$disconnect();
  });

  // ── Alta exitosa ──────────────────────────────────────────────────────────

  // Scenarios: alta solo con obligatorios / registro exitoso / constancia del
  // consentimiento
  it("crea el negocio en_revision/organico con solo los obligatorios", async () => {
    const antes = new Date();
    const resultado = await procesar(envio());

    expect(resultado.exito).toBe(true);
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990101" },
      include: { giros: true },
    });
    expect(creado.nombre).toBe("Plomería Ficticia El Tubo Feliz");
    expect(creado.estado).toBe(ESTADO_NEGOCIO_DEFAULT);
    expect(creado.origen).toBe(ORIGEN_NEGOCIO_DEFAULT);
    expect(creado.publicadoEn).toBeNull();
    expect(creado.tokenGestion).toBeNull();
    expect(creado.giros).toHaveLength(0);
    // Constancia del consentimiento: la pone el servidor al procesar
    expect(creado.consintioAvisoEn.getTime()).toBeGreaterThanOrEqual(
      antes.getTime() - 1000,
    );
    expect(creado.consintioAvisoEn.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // Opcionales vacíos
    expect(creado.queOfreces).toBeNull();
    expect(creado.entregaADomicilio).toBe(false);
    expect(creado.telefonoFijo).toBeNull();
    expect(creado.direccion).toBeNull();
    expect(creado.horario).toBeNull();
    expect(creado.facebookUrl).toBeNull();
    // El pin de mapa se pospuso (design.md §2): queda nulo
    expect(creado.latitud).toBeNull();
    expect(creado.longitud).toBeNull();
  });

  it("guarda los opcionales cuando vienen llenos", async () => {
    await procesar(
      envio({
        whatsapp: "+52 771 999 0102",
        queOfreces: "plomería, destape de drenajes",
        entregaADomicilio: "on",
        telefonoFijo: "7797990000",
        direccion: "Frente al parque ficticio, portón azul",
        horario: "L-S 9am-7pm",
        facebookUrl: "https://facebook.com/negocio-ficticio",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990102" },
    });
    expect(creado.queOfreces).toBe("plomería, destape de drenajes");
    expect(creado.entregaADomicilio).toBe(true);
    expect(creado.telefonoFijo).toBe("7797990000");
    expect(creado.direccion).toBe("Frente al parque ficticio, portón azul");
    expect(creado.horario).toBe("L-S 9am-7pm");
    expect(creado.facebookUrl).toBe("https://facebook.com/negocio-ficticio");
  });

  // Scenario: registro con colonia "Otra"
  it('colonia "Otra": guarda el texto libre sin colonia de catálogo', async () => {
    await procesar(
      envio({
        whatsapp: "7719990103",
        coloniaId: COLONIA_OTRA_VALOR,
        coloniaOtra: "Rinconada del Venado",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990103" },
    });
    expect(creado.coloniaId).toBeNull();
    expect(creado.coloniaOtra).toBe("Rinconada del Venado");
  });

  // Scenario: la normalización ocurre aunque el navegador no valide
  it("normaliza el WhatsApp antes de tocar la base (hallazgo M1)", async () => {
    await procesar(envio({ whatsapp: "+52 771 999 0104" }));

    expect(await buscar("7719990104")).not.toBeNull();
    expect(await buscar("+52 771 999 0104")).toBeNull();
  });

  // ── Blindaje contra campos no confiables ──────────────────────────────────

  // Scenario: el cliente no puede autopublicarse
  it("ignora estado, origen, publicadoEn, tokenGestion y la fecha de consentimiento del cliente", async () => {
    await procesar(
      envio({
        whatsapp: "7719990105",
        estado: "publicado",
        origen: "siembra",
        publicadoEn: "2020-01-01T00:00:00.000Z",
        tokenGestion: "token-falsificado",
        consintioAvisoEn: "1999-01-01T00:00:00.000Z",
        id: "id-falsificado",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990105" },
    });
    expect(creado.estado).toBe("en_revision");
    expect(creado.origen).toBe("organico");
    expect(creado.publicadoEn).toBeNull();
    expect(creado.tokenGestion).toBeNull();
    expect(creado.id).not.toBe("id-falsificado");
    expect(creado.consintioAvisoEn.getFullYear()).toBeGreaterThan(2020);
  });

  // ── La versión del aviso consentido (change versionar-aviso-privacidad) ───

  // Scenario (modelo-datos): alta con su versión
  // Scenario (registro-negocio): constancia del consentimiento
  it("sella la versión vigente del aviso junto a la fecha, sin reaceptación", async () => {
    await procesar(envio({ whatsapp: "7719990120" }));

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990120" },
    });
    expect(creado.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado.consintioAvisoEn).toBeInstanceOf(Date);
    expect(creado.reconsintioAvisoEn).toBeNull();
    expect(creado.reconsintioAvisoVersion).toBeNull();
  });

  // Scenario: la versión guardada la pone el servidor
  it("la versión que se guarda es la del servidor, no la que traiga el envío", async () => {
    // El envío declara la vigente (si no, ni siquiera se guardaría) y de paso
    // intenta fijar la columna a mano.
    await procesar(
      envio({
        whatsapp: "7719990121",
        consintioAvisoVersion: "99",
        reconsintioAvisoVersion: "99",
        reconsintioAvisoEn: "1999-01-01T00:00:00.000Z",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990121" },
    });
    expect(creado.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado.reconsintioAvisoEn).toBeNull();
    expect(creado.reconsintioAvisoVersion).toBeNull();
  });

  // Scenario: el aviso cambió a media captura
  // Scenario: versión inventada en el envío
  it.each([
    ["una versión vieja", "0"],
    ["una versión que no existe", "99"],
    ["basura", "<script>1</script>"],
    ["vacía", ""],
  ])(
    "con %s en el campo de versión no guarda nada y pide releer el aviso",
    async (_caso, version) => {
      const resultado = await procesar(
        envio({
          whatsapp: "7719990122",
          queOfreces: "Lo que ya había escrito",
          [CAMPO_VERSION_AVISO]: version,
        }),
      );

      expect(resultado.exito).toBe(false);
      if (resultado.exito) return;
      // El mensaje va junto a la casilla, con el literal de la spec.
      expect(resultado.estado.errores.consentimiento).toBe(
        "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla.",
      );
      expect(resultado.estado.errores.consentimiento).toBe(
        MENSAJES_ERROR_REGISTRO.avisoDesfasado,
      );
      // Y no se pierde lo capturado.
      expect(resultado.estado.valores.queOfreces).toBe("Lo que ya había escrito");
      expect(await buscar("7719990122")).toBeNull();
    },
  );

  // Scenario: el aviso cambió a media captura (no modifica nada existente)
  it("un envío con versión desfasada tampoco toca una ficha que ya existe", async () => {
    await procesar(envio({ whatsapp: "7719990123", nombre: "Ficticia La Primera" }));

    const resultado = await procesar(
      envio({
        whatsapp: "7719990123",
        nombre: "Ficticia La Intrusa",
        [CAMPO_VERSION_AVISO]: "99",
      }),
    );

    expect(resultado.exito).toBe(false);
    const ficha = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990123" },
    });
    expect(ficha.nombre).toBe("Ficticia La Primera");
    expect(ficha.consintioAvisoVersion).toBe(VERSION_AVISO);
  });

  // Scenario: reintento después del cambio
  it("cuando el dueño relee y vuelve a mandar con la versión vigente, se guarda", async () => {
    const primero = await procesar(
      envio({ whatsapp: "7719990124", [CAMPO_VERSION_AVISO]: "99" }),
    );
    expect(primero.exito).toBe(false);

    const segundo = await procesar(envio({ whatsapp: "7719990124" }));
    expect(segundo.exito).toBe(true);

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719990124" },
    });
    expect(creado.consintioAvisoVersion).toBe(VERSION_AVISO);
  });

  // ── Rechazos de validación: nada se guarda y no se pierde lo capturado ────

  // Scenario: obligatorios vacíos
  it("un envío vacío no guarda nada y devuelve los 5 mensajes", async () => {
    const formData = new FormData();
    const resultado = await procesarRegistro(formData, { prisma, ip: IP });

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(Object.keys(resultado.estado.errores).sort()).toEqual([
      "categoriaId",
      "coloniaId",
      "consentimiento",
      "nombre",
      "whatsapp",
    ]);
    expect(await prisma.negocio.count({ where: { whatsapp: { startsWith: "771999" } } })).toBe(0);
  });

  // Scenario: no se pierde lo capturado
  it("devuelve todo lo capturado (menos el checkbox) al rechazar", async () => {
    const resultado = await procesar(
      envio({
        whatsapp: "no tengo",
        queOfreces: "plomería y destapes",
        entregaADomicilio: "on",
        horario: "L-S 9am-7pm",
        consentimiento: "",
      }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.valores).toMatchObject({
      nombre: "Plomería Ficticia El Tubo Feliz",
      categoriaId: String(categoriaId),
      whatsapp: "no tengo",
      coloniaId: String(coloniaId),
      queOfreces: "plomería y destapes",
      entregaADomicilio: true,
      horario: "L-S 9am-7pm",
    });
    expect(resultado.estado.errores.consentimiento).toBe(
      MENSAJES_ERROR_REGISTRO.consentimiento,
    );
  });

  // Scenario: categoría o colonia fuera del catálogo
  it.each([
    ["categoría", { categoriaId: "9999" }],
    ["colonia", { coloniaId: "9999" }],
  ])("rechaza una %s fuera del catálogo sin crear nada", async (_caso, campos) => {
    const resultado = await procesar(envio({ whatsapp: "7719990106", ...campos }));

    expect(resultado.exito).toBe(false);
    expect(await buscar("7719990106")).toBeNull();
  });

  // Scenario: "¿Qué ofreces?" demasiado largo
  it("rechaza 250 caracteres en ¿Qué ofreces? sin crear nada", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719990107", queOfreces: "a".repeat(250) }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.queOfreces).toBe(
      MENSAJES_ERROR_REGISTRO.queOfreces,
    );
    expect(await buscar("7719990107")).toBeNull();
  });

  // Scenario: link de Facebook con esquema no permitido
  it("rechaza un link de Facebook que no es http(s) sin crear nada", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719990108", facebookUrl: "javascript:alert(1)" }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.facebookUrl).toBe(
      MENSAJES_ERROR_REGISTRO.facebookUrl,
    );
    expect(await buscar("7719990108")).toBeNull();
  });

  // Scenario: sin checkbox no hay envío
  it("sin consentimiento no crea nada", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719990109", consentimiento: "" }),
    );

    expect(resultado.exito).toBe(false);
    expect(await buscar("7719990109")).toBeNull();
  });

  // ── Una sola ficha por número ─────────────────────────────────────────────

  // Scenario: número ya registrado
  it("rechaza un número que ya tiene ficha con el mensaje literal", async () => {
    await procesar(envio({ whatsapp: "7719990110" }));

    const resultado = await procesar(
      envio({ nombre: "Otro Negocio Ficticio", whatsapp: "7719990110" }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(
      await prisma.negocio.count({ where: { whatsapp: "7719990110" } }),
    ).toBe(1);
  });

  // Scenario: duplicado escrito con otro formato
  it("detecta el duplicado aunque venga con otro formato", async () => {
    await procesar(envio({ whatsapp: "7719990111" }));

    const resultado = await procesar(
      envio({ nombre: "Otro Negocio Ficticio", whatsapp: "+52 771 999 0111" }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(
      await prisma.negocio.count({ where: { whatsapp: { startsWith: "771999011" } } }),
    ).toBe(1);
  });

  // Scenario: estado enviando ("tocarlo dos veces no crea dos registros").
  // El botón deshabilitado es la primera línea, pero necesita JavaScript; la
  // garantía que de verdad sostiene el scenario es del servidor, y esa sí se
  // automatiza (etapa C, MEDIO 6).
  it("dos envíos idénticos seguidos dejan un solo registro", async () => {
    const formData = () => envio({ whatsapp: "7719990126" });

    const primero = await procesar(formData());
    const segundo = await procesar(formData());

    expect(primero.exito).toBe(true);
    expect(segundo.exito).toBe(false);
    if (segundo.exito) return;
    expect(segundo.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(
      await prisma.negocio.count({ where: { whatsapp: "7719990126" } }),
    ).toBe(1);
  });

  // Scenario: carrera entre dos envíos simultáneos
  it("la unicidad de la base también se traduce al mensaje de duplicado", async () => {
    await procesar(envio({ whatsapp: "7719990112" }));

    // Simula la carrera: la consulta previa no ve la ficha (como si el otro
    // envío aún no hubiera hecho commit) y el choque lo detecta la constraint.
    const conCarrera: ClienteRegistro = {
      categoria: prisma.categoria,
      colonia: prisma.colonia,
      negocio: new Proxy(prisma.negocio, {
        get(objetivo, propiedad, receptor) {
          if (propiedad === "findUnique") return async () => null;
          return Reflect.get(objetivo, propiedad, receptor);
        },
      }),
    };

    const resultado = await procesarRegistro(
      envio({ nombre: "Negocio Ficticio Simultáneo", whatsapp: "7719990112" }),
      { prisma: conCarrera, ip: IP },
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(resultado.estado.errores.general).toBeUndefined();
    expect(
      await prisma.negocio.count({ where: { whatsapp: "7719990112" } }),
    ).toBe(1);
  });

  // Scenario: falla al guardar
  it("una falla de la base da el mensaje genérico sin detalles técnicos", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const conFalla: ClienteRegistro = {
      categoria: prisma.categoria,
      colonia: prisma.colonia,
      negocio: new Proxy(prisma.negocio, {
        get(objetivo, propiedad, receptor) {
          if (propiedad === "create") {
            return async () => {
              throw new Error("57014: canceling statement due to lock timeout");
            };
          }
          return Reflect.get(objetivo, propiedad, receptor);
        },
      }),
    };

    const resultado = await procesarRegistro(envio({ whatsapp: "7719990113" }), {
      prisma: conFalla,
      ip: IP,
    });

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.servidor);
    expect(resultado.estado.valores.nombre).toBe("Plomería Ficticia El Tubo Feliz");
    // Nada del negocio (ni el número) llega al log
    const logueado = error.mock.calls.flat().join(" ");
    expect(logueado).not.toMatch(/7719990113|Tubo Feliz/);
    expect(await buscar("7719990113")).toBeNull();
  });

  // ── Anti-abuso ────────────────────────────────────────────────────────────

  // Scenario: bot que llena el honeypot
  it("el honeypot lleno finge éxito y no guarda nada", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resultado = await procesar(
      envio({ whatsapp: "7719990114", sitio_web: "http://spam.test" }),
    );

    expect(resultado.exito).toBe(true); // misma pantalla de gracias
    expect(await buscar("7719990114")).toBeNull();
    expect(aviso).toHaveBeenCalled();
  });

  // Scenario: el honeypot no molesta a las personas
  it("un envío con el campo trampa vacío se procesa normal", async () => {
    const resultado = await procesar(envio({ whatsapp: "7719990115", sitio_web: "" }));

    expect(resultado.exito).toBe(true);
    expect(await buscar("7719990115")).not.toBeNull();
  });

  // Scenario: límite por IP
  it("el cuarto alta de la misma IP en una hora se rechaza sin guardar", async () => {
    for (const sufijo of ["0116", "0117", "0118"]) {
      const resultado = await procesar(envio({ whatsapp: `771999${sufijo}` }));
      expect(resultado.exito).toBe(true);
    }

    const cuarto = await procesar(envio({ whatsapp: "7719990119" }));

    expect(cuarto.exito).toBe(false);
    if (cuarto.exito) return;
    expect(cuarto.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.limiteIp);
    expect(await buscar("7719990119")).toBeNull();
  });

  it("el cupo es por IP: otra IP sigue pudiendo registrarse", async () => {
    for (const sufijo of ["0120", "0121", "0122"]) {
      await procesar(envio({ whatsapp: `771999${sufijo}` }));
    }

    const otra = await procesar(envio({ whatsapp: "7719990123" }), {
      ip: "198.51.100.7",
    });

    expect(otra.exito).toBe(true);
  });

  // Scenario: alerta por volumen diario
  it("deja una alerta en el log cuando las altas del día superan el umbral", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const altasDeHoy = await prisma.negocio.count({
      where: { registradoEn: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });

    await procesarRegistro(envio({ whatsapp: "7719990124" }), {
      prisma,
      ip: IP,
      umbralAltasDiarias: altasDeHoy, // el alta siguiente ya lo supera
    });

    expect(aviso).toHaveBeenCalled();
    const logueado = aviso.mock.calls.flat().join(" ");
    expect(logueado).toMatch(/altas/i);
    // El log solo cuenta eventos: ningún dato del negocio (design.md §7)
    expect(logueado).not.toMatch(/7719990124|Tubo Feliz/);
  });

  // Requisito de repo público + LFPDPPP (design.md §7, tasks.md #15)
  it("ningún log de la ruta interpola datos capturados", () => {
    const fuente = readFileSync(
      join(__dirname, "../src/lib/registro/procesar.ts"),
      "utf8",
    );
    const llamadas = fuente.match(/console\.(warn|error|log|info)\([^;]*\)/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);
    for (const llamada of llamadas) {
      expect(llamada, llamada).not.toMatch(/campos\.|datos\.|formData/);
    }
    // El mensaje al usuario tampoco lleva detalle técnico
    expect(MENSAJES_ERROR_REGISTRO.servidor).not.toMatch(
      /error|SQL|Prisma|código/i,
    );
  });

  it("no alerta mientras las altas del día no superan el umbral", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    await procesarRegistro(envio({ whatsapp: "7719990125" }), {
      prisma,
      ip: IP,
      umbralAltasDiarias: 10_000,
    });

    expect(aviso).not.toHaveBeenCalled();
  });
});
