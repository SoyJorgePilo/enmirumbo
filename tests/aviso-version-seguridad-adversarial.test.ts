import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { DetalleRegistro } from "../src/components/admin/detalle-registro";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { RegistroAdminDetalle } from "../src/lib/admin/consultas";
import {
  HAY_PLACEHOLDERS_PENDIENTES,
  TEXTO_MARCA_BORRADOR,
} from "../src/lib/legales/textos";
import {
  PIEZAS_VIGENTES_DEL_AVISO,
  VERSION_AVISO,
  contenidoVersionadoDelAviso,
  versionAvisoEsPosterior,
  type PiezasDelAviso,
} from "../src/lib/legales/version";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import {
  CAMPO_VERSION_AVISO,
  LIMITES_LONGITUD,
  MENSAJES_ERROR_REGISTRO,
} from "../src/lib/registro/textos";
import { CAMPO_TRAMPA } from "../src/lib/registro/validacion";
import { crearClientePrueba } from "./db";

// Etapa C (seguridad) del change `versionar-aviso-privacidad`: tests
// adversariales de la INFRAESTRUCTURA DE EVIDENCIA LEGAL. El bien a proteger
// no es la disponibilidad del formulario, es que la constancia LFPDPPP (PRD
// §8) no pueda mentir: que nadie pueda fabricar, pisar ni falsear el par
// (cuándo consintió, contra qué texto), y que el guardián versión↔texto no se
// pueda evadir.
//
// Cubren lo que el camino feliz no toca: el campo oculto `avisoVersion` como
// entrada hostil (homóglifos, espacios raros, archivo, repetido, 1 MB),
// escrituras sobre fichas en estados donde el reenvío no procede, la
// reaceptación fabricada sin casilla, la resistencia a colisiones de la huella
// y el escape de la versión guardada en el panel.
//
// Datos 100% ficticios (repo público + LFPDPPP): WhatsApp de la serie
// reservada de pruebas `7710009xxx`, nombres inventados e IP del rango
// reservado para documentación (RFC 5737).
//
// Los casos marcados REGRESIÓN nacieron como CARACTERIZACIÓN de un hallazgo de
// `reports/c-seguridad.md` que la iteración 2 corrigió: quedan de guardia, con
// la historia escrita encima, para que el hueco no vuelva a abrirse.

const IP = "203.0.113.44"; // TEST-NET-3, reservado para documentación
const AHORA = new Date("2026-09-10T12:00:00.000Z");
const PREFIJO = "7710009";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

describe("adversarial · la versión del aviso consentido", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;

  /** POST crudo: aquí sí se pueden mandar campos vacíos, repetidos o extra. */
  function envio(campos: Record<string, string> = {}): FormData {
    const formData = new FormData();
    const base: Record<string, string> = {
      nombre: "Vidriería Ficticia La Constancia",
      categoriaId: String(categoriaId),
      whatsapp: `${PREFIJO}001`,
      coloniaId: String(coloniaId),
      consentimiento: "on",
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
      ...campos,
    };
    for (const [clave, valor] of Object.entries(base)) {
      formData.append(clave, valor);
    }
    return formData;
  }

  const procesar = (formData: FormData) =>
    procesarRegistro(formData, { prisma, ip: IP, ahora: AHORA });

  const buscar = (whatsapp: string) =>
    prisma.negocio.findUnique({ where: { whatsapp } });

  const limpiar = () =>
    prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  /** Ficha ya guardada, con la constancia que pida el caso. */
  function fichaPrevia(
    whatsapp: string,
    estado: string,
    constancia: { version?: string | null } = {},
  ) {
    const { version = VERSION_AVISO } = constancia;
    return prisma.negocio.create({
      data: {
        nombre: "Cerrajería Ficticia La de Antes",
        categoriaId,
        whatsapp,
        coloniaId,
        estado,
        origen: "siembra",
        consintioAvisoEn: new Date("2026-08-20T09:00:00.000Z"),
        consintioAvisoVersion: version,
        registradoEn: new Date("2026-08-20T09:00:00.000Z"),
        ...(estado === "rechazado"
          ? {
              rechazadoEn: new Date("2026-08-22T09:00:00.000Z"),
              motivoRechazo: "Motivo ficticio de prueba",
            }
          : {}),
      },
    });
  }

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
    await limpiar();
  });

  beforeEach(async () => {
    reiniciarLimitePorIp();
    vi.restoreAllMocks();
    await limpiar();
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  // ── 1. El campo oculto como entrada hostil ────────────────────────────────
  //
  // Lo peor que puede conseguir quien lo manipule es que se le vuelva a pedir
  // la casilla. Nunca puede sellar una constancia con la versión que él diga.

  it.each([
    ["dígito de ancho completo", "１"],
    ["espacio de ancho cero pegado", "1\u200b"],
    ["exponente tipográfico", "¹"],
    ["byte nulo al final", "1\u0000"],
    ["salto de línea en medio", "1\r\n1"],
    ["porcentaje sin decodificar", "%31"],
    ["hexadecimal", "0x1"],
    ["json", '{"version":"1"}'],
    ["objeto de JavaScript", "[object Object]"],
  ])(
    "una versión que solo se PARECE a la vigente (%s) no cuela",
    async (_caso, version) => {
      const whatsapp = `${PREFIJO}010`;
      const resultado = await procesar(
        envio({ whatsapp, [CAMPO_VERSION_AVISO]: version }),
      );

      expect(resultado.exito, JSON.stringify(version)).toBe(false);
      if (!resultado.exito) {
        expect(resultado.estado.errores.consentimiento).toBe(
          MENSAJES_ERROR_REGISTRO.avisoDesfasado,
        );
      }
      expect(await buscar(whatsapp), JSON.stringify(version)).toBeNull();
    },
  );

  it("los espacios raros que el recorte sí quita no guardan otra cosa que la del servidor", async () => {
    // `leerEnvioRegistro` recorta, y `String.trim` se lleva el espacio duro y
    // la marca de orden de bytes además del espacio normal. Es tolerancia de
    // entrada, no una vía para sellar otra versión: lo que se guarda sale del
    // servidor, así que el valor recortado nunca llega a la base.
    const whatsapp = `${PREFIJO}011`;
    const resultado = await procesar(
      envio({
        whatsapp,
        [CAMPO_VERSION_AVISO]: `\ufeff \t${VERSION_AVISO}\n `,
      }),
    );

    expect(resultado.exito).toBe(true);
    const creado = await buscar(whatsapp);
    expect(creado?.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado?.consintioAvisoVersion).not.toContain(" ");
    expect(creado?.consintioAvisoVersion).not.toContain("\ufeff");
  });

  it("mandar la versión como archivo (multipart) no cuenta como haber leído el aviso", async () => {
    // Un POST armado a mano puede mandar el campo como parte de archivo. El
    // servidor solo acepta cadenas: cualquier otra cosa vale lo mismo que no
    // haberla mandado.
    const formData = envio({ whatsapp: `${PREFIJO}012` });
    formData.delete(CAMPO_VERSION_AVISO);
    formData.append(
      CAMPO_VERSION_AVISO,
      new File([VERSION_AVISO], "version.txt", { type: "text/plain" }),
    );

    const resultado = await procesar(formData);

    expect(resultado.exito).toBe(false);
    if (!resultado.exito) {
      expect(resultado.estado.errores.consentimiento).toBe(
        MENSAJES_ERROR_REGISTRO.avisoDesfasado,
      );
    }
    expect(await buscar(`${PREFIJO}012`)).toBeNull();
  });

  it("con el campo repetido gana la primera copia, y la constancia sigue siendo la del servidor", async () => {
    // El caso simétrico del que ya cubre el dev: la buena primero y la basura
    // después. Se acepta —el envío declaró la vigente— pero lo que se sella no
    // sale del envío, así que la segunda copia no deja rastro.
    const whatsapp = `${PREFIJO}013`;
    const formData = envio({ whatsapp });
    formData.append(CAMPO_VERSION_AVISO, "99");
    formData.append(CAMPO_VERSION_AVISO, "<script>alert(1)</script>");

    const resultado = await procesar(formData);

    expect(resultado.exito).toBe(true);
    const creado = await buscar(whatsapp);
    expect(creado?.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado?.reconsintioAvisoVersion).toBeNull();
  });

  it("un megabyte en el campo de versión no se guarda, no se refleja y no se registra", async () => {
    // El campo no tiene cota de longitud propia (los demás sí, hallazgo MEDIO
    // 3 de T-002). Que no la tenga no da amplificación porque nunca vuelve al
    // formulario ni al log: este caso lo fija.
    const avisos: string[] = [];
    for (const canal of ["warn", "error", "log"] as const) {
      vi.spyOn(console, canal).mockImplementation((...args: unknown[]) =>
        avisos.push(args.map(String).join(" ")),
      );
    }
    const gigante = `9${"0".repeat(1024 * 1024)}`;
    const whatsapp = `${PREFIJO}014`;

    const resultado = await procesar(
      envio({ whatsapp, [CAMPO_VERSION_AVISO]: gigante }),
    );

    expect(resultado.exito).toBe(false);
    expect(JSON.stringify(resultado).length).toBeLessThan(5_000);
    expect(JSON.stringify(resultado)).not.toContain(gigante.slice(0, 200));
    expect(avisos.join("\n")).not.toContain(gigante.slice(0, 200));
    expect(await buscar(whatsapp)).toBeNull();
  });

  it("el desfase se explica sin delatar nada del servidor y conserva lo capturado", async () => {
    const resultado = await procesar(
      envio({
        whatsapp: `${PREFIJO}015`,
        queOfreces: "Cortinas y persianas de mentira",
        horario: "L-V 9-6",
        [CAMPO_VERSION_AVISO]: "0",
      }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    // El mensaje es exactamente el literal de la spec: ni número de versión
    // vigente, ni nombre de columna, ni ruta de módulo, ni excepción.
    expect(resultado.estado.errores.consentimiento).toBe(
      "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla.",
    );
    const serializado = JSON.stringify(resultado);
    for (const interno of [
      "VERSION_AVISO",
      "avisoVersion",
      "consintioAviso",
      "reconsintioAviso",
      "version.ts",
      "src/lib",
      "prisma",
      "Error",
    ]) {
      expect(serializado, `fuga: ${interno}`).not.toContain(interno);
    }
    // Y lo que el dueño ya había escrito sigue ahí, para no perder la captura.
    expect(resultado.estado.valores.queOfreces).toBe(
      "Cortinas y persianas de mentira",
    );
    expect(resultado.estado.valores.horario).toBe("L-V 9-6");
    expect(resultado.estado.valores.whatsapp).toBe(`${PREFIJO}015`);
  });

  // ── 2. La constancia no se fabrica ni se pisa ─────────────────────────────

  it("ningún campo del POST puede fijar la constancia ni la reaceptación en un alta", async () => {
    const whatsapp = `${PREFIJO}020`;

    await procesar(
      envio({
        whatsapp,
        // Mass assignment de las cuatro columnas de la evidencia, más el resto
        // del ciclo de vida por si acaso.
        consintioAvisoEn: "1999-01-01T00:00:00.000Z",
        consintioAvisoVersion: "99",
        reconsintioAvisoEn: "1999-01-01T00:00:00.000Z",
        reconsintioAvisoVersion: "99",
        estado: "publicado",
        origen: "siembra",
        publicadoEn: "1999-01-01T00:00:00.000Z",
        tokenGestion: "token-inventado-por-el-cliente",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(creado.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado.consintioAvisoEn.toISOString()).toBe(AHORA.toISOString());
    expect(creado.reconsintioAvisoEn).toBeNull();
    expect(creado.reconsintioAvisoVersion).toBeNull();
    expect(creado.estado).toBe("en_revision");
    expect(creado.publicadoEn).toBeNull();
    expect(creado.tokenGestion).toBeNull();
  });

  it.each(["publicado", "en_revision"])(
    "un envío contra una ficha en estado %s no anota reaceptación ni toca la constancia",
    async (estado) => {
      // Transición ilegal: el reenvío solo procede sobre `rechazado`. Aquí el
      // atacante conoce el número y manda un envío perfecto: tiene que rebotar
      // como duplicado, sin dejar una sola escritura de evidencia.
      const whatsapp = `${PREFIJO}03${estado === "publicado" ? 1 : 2}`;
      const previa = await fichaPrevia(whatsapp, estado, { version: "0" });

      const resultado = await procesar(
        envio({ whatsapp, nombre: "Cerrajería Ficticia La Intrusa" }),
      );

      expect(resultado.exito).toBe(false);
      if (!resultado.exito) {
        expect(resultado.estado.errores.whatsapp).toBe(
          MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
        );
      }
      const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
      expect(despues.nombre).toBe(previa.nombre);
      expect(despues.estado).toBe(estado);
      expect(despues.consintioAvisoVersion).toBe("0");
      expect(despues.consintioAvisoEn.toISOString()).toBe(
        previa.consintioAvisoEn.toISOString(),
      );
      expect(despues.reconsintioAvisoEn).toBeNull();
      expect(despues.reconsintioAvisoVersion).toBeNull();
    },
  );

  it("sin casilla marcada no se fabrica una reaceptación, aunque la versión declarada sea la vigente", async () => {
    const whatsapp = `${PREFIJO}033`;
    await fichaPrevia(whatsapp, "rechazado", { version: "0" });

    for (const casilla of ["", "false", "0", "off", "no"]) {
      const resultado = await procesar(
        envio({ whatsapp, consentimiento: casilla }),
      );
      expect(resultado.exito, `casilla=${JSON.stringify(casilla)}`).toBe(false);

      const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
      expect(despues.estado, casilla).toBe("rechazado");
      expect(despues.consintioAvisoVersion, casilla).toBe("0");
      expect(despues.reconsintioAvisoEn, casilla).toBeNull();
      expect(despues.reconsintioAvisoVersion, casilla).toBeNull();
      reiniciarLimitePorIp();
    }
  });

  it("un reenvío que cae en el campo trampa no deja rastro de reaceptación", async () => {
    // La trampa finge éxito para no delatarse. "Fingir" tiene que ser
    // exactamente eso: cero escrituras, incluida la evidencia legal.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const whatsapp = `${PREFIJO}034`;
    await fichaPrevia(whatsapp, "rechazado", { version: "0" });

    const resultado = await procesar(
      envio({ whatsapp, [CAMPO_TRAMPA]: "http://spam.ficticio.test" }),
    );

    expect(resultado).toEqual({ exito: true });
    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.estado).toBe("rechazado");
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();
  });

  // REGRESIÓN (hallazgo MEDIO-3, CORREGIDO en la iteración 2). Nació como
  // CARACTERIZACIÓN: el reenvío comparaba con `!==` en vez de "es posterior",
  // así que tras un rollback del despliegue (la ficha consintió la 2, se
  // revierte a la 1) anotaba como reaceptación una versión más VIEJA, y el
  // panel la rotulaba como "más nueva". Ahora no se anota nada: la evidencia
  // no puede afirmar el sentido de un cambio que no ocurrió.
  it("tras un rollback, la vigente más VIEJA que la constancia no deja reaceptación", async () => {
    const whatsapp = `${PREFIJO}035`;
    const previa = await fichaPrevia(whatsapp, "rechazado", { version: "2" });

    const resultado = await procesar(envio({ whatsapp }));
    expect(resultado).toEqual({ exito: true });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    // El reenvío entra (vuelve a la cola) pero la evidencia no se inventa.
    expect(despues.estado).toBe("en_revision");
    expect(despues.consintioAvisoVersion).toBe("2");
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();
  });

  // ITERACIÓN 2 (hallazgo MEDIO-4): una ficha anterior al versionado —hoy,
  // TODAS las que existen— no puede estrenar evidencia de consentimiento por
  // un reenvío del formulario anónimo. "No consta" no es comparable.
  it("un tercero no fabrica evidencia reenviando una ficha sin versión registrada", async () => {
    const whatsapp = `${PREFIJO}036`;
    const previa = await fichaPrevia(whatsapp, "rechazado", { version: null });

    const resultado = await procesar(envio({ whatsapp, nombre: "Cerrajería Ficticia La Intrusa" }));
    expect(resultado).toEqual({ exito: true });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.consintioAvisoVersion).toBeNull();
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();
  });

  // ITERACIÓN 2 · re-verificación de MEDIO-4 por los caminos que quedaban:
  // mass assignment de las columnas de la reaceptación (y de la constancia,
  // para volverla "comparable" y desbloquear la escritura) e insistencia.
  it("una ficha sin versión no estrena reaceptación ni con las columnas en el POST ni a fuerza de reenvíos", async () => {
    const whatsapp = `${PREFIJO}037`;
    await fichaPrevia(whatsapp, "rechazado", { version: null });

    const primero = await procesar(
      envio({
        whatsapp,
        consintioAvisoVersion: "0",
        reconsintioAvisoEn: AHORA.toISOString(),
        reconsintioAvisoVersion: VERSION_AVISO,
      }),
    );
    expect(primero).toEqual({ exito: true });

    let despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.consintioAvisoVersion).toBeNull();
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();

    // Insistir no sirve: la ficha ya volvió a la cola, así que el segundo
    // envío es el duplicado de siempre y tampoco escribe evidencia.
    reiniciarLimitePorIp();
    const segundo = await procesar(envio({ whatsapp }));
    expect(segundo.exito).toBe(false);
    despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();
  });

  it.each([
    ["cadena vacía", ""],
    ["con espacios", " 1"],
    ["negativa", "-1"],
    ["decimal", "1.0"],
    ["con prefijo", "v1"],
    ["dígito árabe-índigo", "٠"],
    ["notación científica", "0e0"],
  ])(
    "una constancia con versión no ordenable (%s) tampoco estrena reaceptación",
    async (_caso, version) => {
      // Si `enteroDeVersion` aceptara cualquiera de estas, una ficha vieja
      // volvería a ser terreno donde un tercero estrena evidencia.
      const whatsapp = `${PREFIJO}038`;
      await fichaPrevia(whatsapp, "rechazado", { version });

      const resultado = await procesar(envio({ whatsapp }));
      expect(resultado, version).toEqual({ exito: true });

      const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
      expect(despues.consintioAvisoVersion, version).toBe(version);
      expect(despues.reconsintioAvisoEn, version).toBeNull();
      expect(despues.reconsintioAvisoVersion, version).toBeNull();
    },
  );

  it("con una constancia anterior de verdad, la reaceptación sí se anota (contraprueba)", async () => {
    // Sin este caso, los de arriba pasarían igual si la reaceptación estuviera
    // sencillamente rota.
    const whatsapp = `${PREFIJO}039`;
    const previa = await fichaPrevia(whatsapp, "rechazado", { version: "0" });

    await procesar(envio({ whatsapp }));

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.consintioAvisoVersion).toBe("0");
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    expect(despues.reconsintioAvisoEn?.toISOString()).toBe(AHORA.toISOString());
    expect(despues.reconsintioAvisoVersion).toBe(VERSION_AVISO);
  });

  it("la cota del campo de versión no abre una puerta: truncar no produce la vigente", async () => {
    // BAJO-1, corregido en la iteración 2: el campo se recorta a
    // `LIMITES_LONGITUD.avisoVersion` al leerlo. El recorte ocurre DESPUÉS del
    // `trim`, así que ninguna cadena hostil que empiece por la versión vigente
    // se convierte en ella al truncarse.
    expect(LIMITES_LONGITUD.avisoVersion).toBeLessThanOrEqual(20);
    const whatsapp = `${PREFIJO}016`;
    for (const hostil of [
      `${VERSION_AVISO}${"x".repeat(40)}`,
      `${VERSION_AVISO}${"\u0000".repeat(40)}`,
      `${VERSION_AVISO};${"9".repeat(40)}`,
      `${VERSION_AVISO}\t${"1".repeat(40)}`,
    ]) {
      const resultado = await procesar(
        envio({ whatsapp, [CAMPO_VERSION_AVISO]: hostil }),
      );
      expect(resultado.exito, JSON.stringify(hostil.slice(0, 12))).toBe(false);
      expect(await buscar(whatsapp)).toBeNull();
      reiniciarLimitePorIp();
    }
  });
});

// ── 3. El guardián versión↔texto ────────────────────────────────────────────

describe("adversarial · el guardián de la huella no se evade", () => {
  const huella = (contenido: readonly string[]) =>
    createHash("sha256").update(contenido.join("\u0000")).digest("hex");

  it("ninguna pieza del aviso contiene el separador de la huella", () => {
    // La huella une el contenido con `\u0000`. Si alguna pieza pudiera
    // contenerlo, dos textos distintos podrían dar la misma huella y el
    // guardián se volvería sordo.
    for (const pieza of contenidoVersionadoDelAviso()) {
      expect(pieza, pieza.slice(0, 40)).not.toContain("\u0000");
    }
  });

  it("mover una frase de una pieza a otra cambia la huella", () => {
    // Sin separador, "AB"+"" y "A"+"B" darían la misma huella: se podría mover
    // una advertencia del aviso simplificado al literal de la casilla sin que
    // el guardián se enterara. Con separador, no.
    const base: PiezasDelAviso = {
      ...PIEZAS_VIGENTES_DEL_AVISO,
      simplificado: "Aviso de mentira: uno dos",
      casilla: "tres",
    };
    const movida: PiezasDelAviso = {
      ...base,
      simplificado: "Aviso de mentira: uno",
      casilla: "dos tres",
    };

    expect(huella(contenidoVersionadoDelAviso(base))).not.toBe(
      huella(contenidoVersionadoDelAviso(movida)),
    );
  });

  it("la fuente única de la versión sigue siendo única el día que se estrene la 2", () => {
    // El caso equivalente del dev busca el literal "versión 1" escrito a mano.
    // Este deriva el patrón de `VERSION_AVISO`, así que sigue protegiendo
    // cuando la vigente ya no sea la 1 (hallazgo MEDIO-2), y además mira
    // `prisma/`, que también importa el módulo.
    const aMano = new RegExp(`versi[oó]n\\s+${VERSION_AVISO}\\b`, "i");
    const archivos: string[] = [];
    const recorrer = (directorio: string) => {
      for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
        const ruta = path.join(directorio, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name !== "generated" && entrada.name !== "migrations") {
            recorrer(ruta);
          }
        } else if (/\.tsx?$/.test(entrada.name)) {
          archivos.push(ruta);
        }
      }
    };
    recorrer(path.join(raiz, "src"));
    recorrer(path.join(raiz, "prisma"));

    expect(archivos.length).toBeGreaterThan(10);
    for (const ruta of archivos) {
      if (ruta.endsWith(path.join("legales", "version.ts"))) continue;
      const fuente = readFileSync(ruta, "utf8");
      expect(fuente, ruta).not.toMatch(aMano);
      expect(fuente, ruta).not.toMatch(/\bVERSION_AVISO\s*=/);
    }
  });

  // REGRESIÓN (hallazgo MEDIO-1, CORREGIDO en la iteración 2). Nació como
  // CARACTERIZACIÓN: la marca de borrador se publicaba dentro del documento
  // legal —es parte de lo que el titular lee al consentir— pero quedaba fuera
  // de la huella, así que vaciar `PLACEHOLDERS_LEGALES` retiraba de la página
  // la advertencia de "esto es un borrador sin revisión legal" sin estrenar
  // versión y con la suite en verde. Ahora entra en la huella y este caso
  // queda de guardia para que no vuelva a salirse.
  it("la marca de borrador publicada entra en la huella del guardián", () => {
    expect(HAY_PLACEHOLDERS_PENDIENTES).toBe(true);
    expect(TEXTO_MARCA_BORRADOR).toBe(
      "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.",
    );
    expect(contenidoVersionadoDelAviso()).toContain(TEXTO_MARCA_BORRADOR);

    // Y quitarla cambia la huella: eso es lo que obliga a estrenar versión.
    const sinMarca = contenidoVersionadoDelAviso({
      ...PIEZAS_VIGENTES_DEL_AVISO,
      marcaBorrador: null,
    });
    expect(huella(sinMarca)).not.toBe(huella(contenidoVersionadoDelAviso()));
  });

  // ITERACIÓN 2 · efecto lateral de la corrección de MEDIO-3/MEDIO-4: la
  // reaceptación ahora depende de poder ORDENAR la versión vigente. Si algún
  // día `VERSION_AVISO` fuera `"2-legal"` —design.md §1 deja esa puerta
  // abierta—, `versionAvisoEsPosterior` devolvería `false` contra cualquier
  // constancia y la reaceptación dejaría de anotarse para siempre, en
  // silencio y con la suite en verde. Este caso lo dice en voz alta.
  it("la versión vigente tiene que ser ordenable, o la reaceptación se apaga en silencio", () => {
    expect(versionAvisoEsPosterior(VERSION_AVISO, "0")).toBe(true);
  });

  it("la migración no le inventa una versión a ninguna ficha vieja", () => {
    // Nulo significa "no consta". Un `UPDATE` de relleno convertiría la
    // migración en la primera fuente de constancias falsas.
    const carpeta = path.join(raiz, "prisma/migrations");
    const migracion = readdirSync(carpeta)
      .filter((nombre) => nombre.includes("version_del_aviso"))
      .at(0);
    expect(migracion, "falta la migración de la versión del aviso").toBeDefined();
    const sql = readFileSync(path.join(carpeta, migracion!, "migration.sql"), "utf8");

    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
    expect(sql).not.toMatch(/\bNOT NULL\b/i);
  });
});

// ── 4. La versión guardada, pintada en el panel ─────────────────────────────

describe("adversarial · el panel pinta la versión guardada sin ejecutarla", () => {
  const REGISTRO: RegistroAdminDetalle = {
    id: "ficticio-panel-version",
    nombre: "Cerrajería Ficticia del Panel",
    categoriaNombre: "Servicios del hogar",
    whatsapp: "7710009900",
    coloniaNombre: "Haciendas de Tizayuca",
    coloniaOtra: null,
    coloniaPendiente: false,
    queOfreces: null,
    entregaADomicilio: false,
    telefonoFijo: null,
    direccion: null,
    horario: null,
    facebookUrl: null,
    fotoClave: null,
    estado: "en_revision",
    origen: "organico",
    registradoEn: new Date("2026-09-01T10:00:00.000Z"),
    publicadoEn: null,
    consintioAvisoEn: new Date("2026-09-01T10:00:00.000Z"),
    consintioAvisoVersion: '1"><img src=x onerror=alert(1)>',
    reconsintioAvisoEn: new Date("2026-09-05T10:00:00.000Z"),
    reconsintioAvisoVersion: "</dd><script>alert(2)</script>",
    rechazadoEn: null,
    motivoRechazo: null,
    // Rastro de la despublicación (T-015, ya en `main`): esta ficha nunca se
    // despublicó. Va aquí porque `RegistroAdminDetalle` los exige, no porque
    // este caso los ejercite.
    despublicadoEn: null,
    motivoDespublicacion: null,
    girosIds: [],
  };

  it("una versión hostil guardada en la base sale escapada, no como marcado", () => {
    // Defensa en profundidad: hoy la versión solo la escribe el servidor, pero
    // el panel no puede depender de eso para no ejecutar lo que pinta.
    const html = renderToStaticMarkup(
      createElement(DetalleRegistro, { registro: REGISTRO }),
    );

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).toContain("&lt;/dd&gt;&lt;script&gt;");
    // La etiqueta interpola la versión guardada (iteración 2, MEDIO-4): eso
    // también sale escapado, y no como marcado.
    expect(html).toContain("El reenvío aceptó la versión");
  });

  it("sin reaceptación, el panel no pinta la línea vacía", () => {
    const html = renderToStaticMarkup(
      createElement(DetalleRegistro, {
        registro: {
          ...REGISTRO,
          consintioAvisoVersion: null,
          reconsintioAvisoEn: null,
          reconsintioAvisoVersion: null,
        },
      }),
    );

    expect(html).toContain("versión no registrada");
    expect(html).not.toContain("El reenvío aceptó");
  });
});
