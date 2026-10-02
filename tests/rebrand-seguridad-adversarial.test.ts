import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import AvisoDePrivacidadPage from "../src/app/(publico)/aviso-de-privacidad/page";
import TerminosPage from "../src/app/(publico)/terminos/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  mensajeAvisoDespublicacion,
  mensajeAvisoPublicacion,
  mensajeAvisoRechazo,
  mensajeVerificacion,
} from "../src/lib/admin/textos";
import { construirEnlaceWhatsappPanel } from "../src/lib/admin/whatsapp";
import { MENSAJE_WHATSAPP_PRELLENADO, construirEnlaceWhatsapp } from "../src/lib/enlaces";
import {
  AVISO_PRIVACIDAD,
  HAY_PLACEHOLDERS_PENDIENTES,
  PLACEHOLDERS_LEGALES,
  TERMINOS,
  TEXTO_MARCA_BORRADOR,
} from "../src/lib/legales/textos";
import {
  VERSION_AVISO,
  contenidoVersionadoDelAviso,
  versionAvisoEsPosterior,
} from "../src/lib/legales/version";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import {
  CAMPO_VERSION_AVISO,
  MENSAJES_ERROR_REGISTRO,
  TEXTO_AVISO_PRIVACIDAD,
} from "../src/lib/registro/textos";
import { NOMBRE_DEL_SITIO } from "../src/lib/seo/metadata";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad y pruebas adversariales) del change
 * `renombrar-sitio-enmirumbo` (T-019).
 *
 * El rebrand parece un cambio de literales y no lo es: mueve texto que vive
 * DENTRO del contenido versionado del aviso de privacidad, que es la prueba
 * LFPDPPP (PRD 8) de contra qué texto consintió cada negocio. Lo que aquí se
 * ataca no es la marca, es la evidencia:
 *
 * 1. que la huella de la versión `1` siga siendo la del texto que de verdad se
 *    publicaba antes del rebrand, y no una re-anclada para "arreglar" la suite;
 * 2. que la `2` corresponda exactamente al texto de hoy, correo del directorio
 *    incluido, y que ese correo esté DENTRO de la huella (si quedara fuera,
 *    cambiar el buzón publicado no estrenaría versión);
 * 3. que la reaceptación solo avance: una constancia de la `1` no se pisa, no
 *    retrocede y no se fabrica;
 * 4. que la marca anterior y la forma compuesta no puedan volver por las
 *    rendijas que el guardián de `tests/marca-guardian.test.ts` no mira
 *    (`prisma/`, `public/` y la interpolación de la constante de marca);
 * 5. que publicar el correo del directorio no haya arrastrado ningún dato
 *    personal del fundador al texto público (repo público + LFPDPPP);
 * 6. que los mensajes de WhatsApp reescritos sigan viajando codificados, con un
 *    nombre de negocio hostil dentro.
 *
 * Datos 100% ficticios: WhatsApp de la serie reservada `7710019xxx`, nombres
 * inventados e IP del rango de documentación (RFC 5737).
 */

const IP = "203.0.113.71"; // TEST-NET-3, reservado para documentación
const AHORA = new Date("2026-09-12T12:00:00.000Z");
const ANTES = new Date("2026-08-15T09:00:00.000Z");
const PREFIJO = "7710019";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/** El correo que la versión 2 publica, escrito aquí a mano a propósito. */
const CORREO_PUBLICADO = "contacto@enmirumbo.com";

/**
 * Huella del contenido publicado, reimplementada aquí de forma independiente
 * (mismo algoritmo que declara la spec: SHA-256 sobre las piezas unidas por un
 * carácter que no puede aparecer en el texto). Si el guardián de
 * `tests/aviso-version.test.ts` cambiara su forma de calcular, estas
 * aserciones lo dirían en vez de seguirle la corriente.
 */
function huella(contenido: readonly string[]): string {
  return createHash("sha256").update(contenido.join(String.fromCharCode(0))).digest("hex");
}

/**
 * Huella anclada de la versión 1, copiada de `main` (antes del rebrand) y
 * verificada recalculándola contra aquel texto.
 */
const HUELLA_ANCLADA_V1 =
  "08ce983c2ce4f4733e42aca21cf7c01f75b3a6cc78c72fdb8055c8bc61062d5f";

function archivosDe(directorio: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== "node_modules" && entrada.name !== "generated") {
        encontrados.push(...archivosDe(ruta));
      }
    } else if (entrada.isFile()) {
      encontrados.push(ruta);
    }
  }
  return encontrados;
}

const fuenteDelGuardian = readFileSync(
  path.join(raiz, "tests", "aviso-version.test.ts"),
  "utf8",
);

// ── 1. La evidencia de la versión 1 no se tocó ──────────────────────────────

describe("adversarial · la huella de la versión 1 sigue siendo evidencia", () => {
  // Requirement (T-019) "El rebrand estrena la versión 2 del aviso, sin tocar
  // la evidencia de la 1".
  //
  // El guardián solo comprueba la ÚLTIMA fila de la tabla (la vigente), así que
  // nada dentro de él impide re-anclar en silencio la huella de una versión ya
  // publicada. Esta aserción fija el renglón de la `1` carácter por carácter y
  // SIN mirar el largo de la tabla: el día que exista la `3`, quien la agregue
  // no puede "de paso" reescribir el de la `1` sin que esto se ponga en rojo.
  it("el renglón anclado de la versión 1 sigue escrito tal cual, aunque la tabla crezca", () => {
    const renglon = new RegExp(`\\["1",\\s*"${HUELLA_ANCLADA_V1}"\\]`);
    expect(fuenteDelGuardian).toMatch(renglon);
  });

  it("la huella de la 1 NO es la del texto que se publica hoy: por eso hubo que estrenar versión", () => {
    expect(huella(contenidoVersionadoDelAviso())).not.toBe(HUELLA_ANCLADA_V1);
  });

  it("la tabla de huellas sigue viviendo en la verificación, no junto al texto", () => {
    // Si migrara a `src/lib/legales/`, corregir el texto y "arreglar" la huella
    // volverían a ser el mismo gesto distraído.
    for (const archivo of archivosDe(path.join(raiz, "src"))) {
      expect(readFileSync(archivo, "utf8"), archivo).not.toContain(HUELLA_ANCLADA_V1);
    }
  });
});

// ── 2. La huella de la 2 corresponde al texto de hoy, correo incluido ───────

describe("adversarial · la versión 2 corresponde exactamente al texto nuevo", () => {
  const contenido = contenidoVersionadoDelAviso();

  it("la huella anclada para la vigente es la del texto normalizado de hoy, recalculada aparte", () => {
    const renglon = new RegExp(`\\["${VERSION_AVISO}",\\s*"([0-9a-f]{64})"\\]`);
    const encontrado = fuenteDelGuardian.match(renglon);
    expect(encontrado, "la versión vigente tiene que tener su renglón anclado").not.toBeNull();
    expect(encontrado?.[1]).toBe(huella(contenido));
  });

  // Scenario "se estrena versión junto con el texto": la marca viaja DENTRO de
  // la huella. Si no, cambiar el nombre del sitio no estrenaría versión nunca.
  it("la marca vigente está dentro del contenido versionado, en varias de sus piezas", () => {
    const conLaMarca = contenido.filter((pieza) => pieza.includes(NOMBRE_DEL_SITIO));
    expect(conLaMarca.length).toBeGreaterThanOrEqual(3);
    expect(contenido).toContain(TEXTO_AVISO_PRIVACIDAD);
    expect(contenido.join("\n")).not.toMatch(/necesitouno/i);
    expect(contenido.join("\n")).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });

  // El correo dejó de ser placeholder DENTRO del contenido versionado: cambiar
  // el buzón publicado tiene que costar otra versión, no un reemplazo callado.
  it("cambiar el correo del directorio cambia la huella: viaja dentro de la versión", () => {
    expect(contenido.some((pieza) => pieza.includes(CORREO_PUBLICADO))).toBe(true);
    const conOtroCorreo = contenido.map((pieza) =>
      pieza.split(CORREO_PUBLICADO).join("otro@ficticio.example"),
    );
    expect(huella(conOtroCorreo)).not.toBe(huella(contenido));
  });

  it("retirar la marca de borrador también cambiaría la huella", () => {
    expect(HAY_PLACEHOLDERS_PENDIENTES).toBe(true);
    expect(contenido).toContain(TEXTO_MARCA_BORRADOR);
    const sinMarca = contenido.filter((pieza) => pieza !== TEXTO_MARCA_BORRADOR);
    expect(huella(sinMarca)).not.toBe(huella(contenido));
  });
});

// ── 3. La versión solo avanza ───────────────────────────────────────────────

/**
 * Cadenas que solo se PARECEN a la versión vigente de hoy (`2`). Los casos que
 * la suite de T-012 dejó escritos se construyeron alrededor de la `1`, así que
 * desde el rebrand ya no se parecen a nada: estos vuelven a apuntar donde deben.
 * Se escriben con secuencias de escape para que se puedan leer en el diff.
 */
const CASI_LA_VIGENTE: ReadonlyArray<[string, string]> = [
  ["digito de ancho completo", "\uff12"],
  ["espacio de ancho cero pegado", "2\u200b"],
  ["exponente tipografico", "\u00b2"],
  ["byte nulo al final", "2\u0000"],
  ["marca de orden de bytes delante", "\ufeff2"],
  ["cero a la izquierda", "02"],
  ["decimal", "2.0"],
  ["con prefijo", "v2"],
  ["porcentaje sin decodificar", "%32"],
  ["hexadecimal", "0x2"],
  ["digito arabe-indigo", "\u0662"],
  ["notacion cientifica", "2e0"],
];

describe("adversarial · la versión consentida nunca retrocede", () => {
  it("contra la vigente real, solo una constancia ANTERIOR estrena reaceptación", () => {
    expect(VERSION_AVISO).toBe("2");
    expect(versionAvisoEsPosterior(VERSION_AVISO, "1")).toBe(true);
    expect(versionAvisoEsPosterior(VERSION_AVISO, "0")).toBe(true);
    // Igual que la vigente: ya consintió este texto, no hay nada que reaceptar.
    expect(versionAvisoEsPosterior(VERSION_AVISO, VERSION_AVISO)).toBe(false);
    // Posterior a la vigente (rollback del despliegue): no se inventa evidencia
    // de un cambio que fue hacia atrás.
    expect(versionAvisoEsPosterior(VERSION_AVISO, "3")).toBe(false);
    expect(versionAvisoEsPosterior(VERSION_AVISO, "99")).toBe(false);
    // "No consta" no es comparable.
    expect(versionAvisoEsPosterior(VERSION_AVISO, null)).toBe(false);
  });

  it.each(CASI_LA_VIGENTE)(
    "una versión que solo se PARECE a la vigente de hoy (%s) no se hace pasar por ella",
    (_caso, version) => {
      // No es la vigente: el formulario la rechaza por desfase.
      expect(version, _caso).not.toBe(VERSION_AVISO);
      // Y tampoco estrena reaceptación: ninguna se cuela como "una constancia
      // igual de nueva" ni como una anterior comparable.
      expect(versionAvisoEsPosterior(VERSION_AVISO, version), _caso).toBe(false);
    },
  );
});

// ── 4. El camino real: formulario abierto con la 1, enviado con la 2 vigente ─

describe("adversarial · reaceptación hacia adelante contra la base", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;

  function envio(campos: Record<string, string> = {}): FormData {
    const formData = new FormData();
    const base: Record<string, string> = {
      nombre: "Herrería Ficticia El Rumbo",
      categoriaId: String(categoriaId),
      whatsapp: `${PREFIJO}001`,
      coloniaId: String(coloniaId),
      consentimiento: "on",
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
      ...campos,
    };
    for (const [clave, valor] of Object.entries(base)) formData.append(clave, valor);
    return formData;
  }

  const procesar = (formData: FormData) =>
    procesarRegistro(formData, { prisma, ip: IP, ahora: AHORA });

  const limpiar = () =>
    prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });

  function fichaRechazada(whatsapp: string, version: string | null) {
    return prisma.negocio.create({
      data: {
        nombre: "Herrería Ficticia La de Antes",
        categoriaId,
        whatsapp,
        coloniaId,
        estado: "rechazado",
        origen: "siembra",
        consintioAvisoEn: ANTES,
        consintioAvisoVersion: version,
        registradoEn: ANTES,
        rechazadoEn: new Date("2026-08-18T09:00:00.000Z"),
        motivoRechazo: "Motivo ficticio de prueba",
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
    await limpiar();
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  // Requirement (T-019) · Scenario "el formulario abierto antes del despliegue
  // no se guarda a ciegas". El caso REAL: el dueño tenía la `1` a la vista.
  it("un formulario abierto con la versión 1 que llega tras el despliegue no guarda nada", async () => {
    const whatsapp = `${PREFIJO}002`;
    const resultado = await procesar(
      envio({
        whatsapp,
        [CAMPO_VERSION_AVISO]: "1",
        queOfreces: "Portones y barandales de mentira",
      }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.consentimiento).toBe(
      "El aviso de privacidad cambió mientras llenabas esto. Léelo otra vez y vuelve a marcar la casilla.",
    );
    expect(resultado.estado.errores.consentimiento).toBe(
      MENSAJES_ERROR_REGISTRO.avisoDesfasado,
    );
    // Sus datos siguen en el formulario y no se creó ninguna ficha.
    expect(resultado.estado.valores.queOfreces).toBe("Portones y barandales de mentira");
    expect(await prisma.negocio.findUnique({ where: { whatsapp } })).toBeNull();
  });

  // Se excluyen las que el recorte del borde convierte en la vigente (la marca
  // de orden de bytes es espacio para `String.trim`): esa tolerancia de entrada
  // ya está fijada por la suite de T-012 y es deliberada.
  it.each(CASI_LA_VIGENTE.filter(([, version]) => version.trim() !== VERSION_AVISO))(
    "una versión declarada que solo se parece a la vigente (%s) tampoco guarda",
    async (_caso, version) => {
      const whatsapp = `${PREFIJO}007`;
      reiniciarLimitePorIp();
      const resultado = await procesar(
        envio({ whatsapp, [CAMPO_VERSION_AVISO]: version }),
      );

      expect(resultado.exito, _caso).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.consentimiento, _caso).toBe(
        MENSAJES_ERROR_REGISTRO.avisoDesfasado,
      );
      expect(await prisma.negocio.findUnique({ where: { whatsapp } }), _caso).toBeNull();
    },
  );

  // Scenario "una constancia vieja no se reescribe" + la reaceptación que el
  // rebrand activa por primera vez de verdad.
  it("el reenvío de una ficha que consintió la 1 conserva su constancia y anota la 2 aparte", async () => {
    const whatsapp = `${PREFIJO}003`;
    const previa = await fichaRechazada(whatsapp, "1");

    const resultado = await procesar(envio({ whatsapp }));
    expect(resultado).toMatchObject({ exito: true });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.estado).toBe("en_revision");
    // La constancia original NO se pisa: ni la versión ni la fecha.
    expect(despues.consintioAvisoVersion).toBe("1");
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    // Y la reaceptación se anota HACIA ADELANTE, en su propio par de campos.
    expect(despues.reconsintioAvisoVersion).toBe("2");
    expect(despues.reconsintioAvisoEn?.toISOString()).toBe(AHORA.toISOString());
  });

  // El caso simétrico, que la suite de T-012 dejó de cubrir al estrenarse la
  // `2` (su ficha "más nueva que la vigente" se sembraba justo con la `2`).
  it("tras un rollback, una constancia POSTERIOR a la vigente no estrena reaceptación", async () => {
    const whatsapp = `${PREFIJO}004`;
    const previa = await fichaRechazada(whatsapp, "3");

    const resultado = await procesar(envio({ whatsapp }));
    expect(resultado).toMatchObject({ exito: true });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.estado).toBe("en_revision");
    expect(despues.consintioAvisoVersion).toBe("3");
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    expect(despues.reconsintioAvisoEn).toBeNull();
    expect(despues.reconsintioAvisoVersion).toBeNull();
  });

  // Transición ilegal: la ficha ya está publicada y alguien que conoce el
  // número manda un envío perfecto con la versión vigente para "actualizarle"
  // la constancia al rebrand. Tiene que rebotar como duplicado, sin escribir.
  it("un envío contra una ficha publicada no le actualiza la constancia al rebrand", async () => {
    const whatsapp = `${PREFIJO}005`;
    await prisma.negocio.create({
      data: {
        nombre: "Herrería Ficticia La Publicada",
        categoriaId,
        whatsapp,
        coloniaId,
        estado: "publicado",
        origen: "siembra",
        consintioAvisoEn: ANTES,
        consintioAvisoVersion: "1",
        registradoEn: ANTES,
        publicadoEn: ANTES,
      },
    });

    const resultado = await procesar(envio({ whatsapp }));
    expect(resultado.exito).toBe(false);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(despues.estado).toBe("publicado");
    expect(despues.consintioAvisoVersion).toBe("1");
    expect(despues.reconsintioAvisoVersion).toBeNull();
    expect(despues.reconsintioAvisoEn).toBeNull();
  });

  // Un alta nueva sella SIEMPRE la vigente del servidor, nunca la del envío.
  it("un alta nueva sella la versión 2 aunque el envío intente fijar otra", async () => {
    const whatsapp = `${PREFIJO}006`;
    const formData = envio({ whatsapp });
    formData.append("consintioAvisoVersion", "1");
    formData.append("reconsintioAvisoVersion", "99");

    expect(await procesar(formData)).toMatchObject({ exito: true });

    const creado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
    expect(creado.consintioAvisoVersion).toBe(VERSION_AVISO);
    expect(creado.reconsintioAvisoVersion).toBeNull();
  });
});

// ── 5. La marca no vuelve por las rendijas que el guardián no mira ──────────

describe("adversarial · las rendijas del guardián de marca", () => {
  const PROHIBIDOS: ReadonlyArray<[string, RegExp]> = [
    ["la marca anterior", /necesitouno/i],
    ['la forma compuesta "EnMiRumbo Tizayuca"', /EnMiRumbo\s+Tizayuca/i],
  ];

  // El guardián de `tests/marca-guardian.test.ts` vigila solo `src/`. Estas dos
  // raíces también llegan al público —los seeds pintan fichas del directorio y
  // `public/` se sirve tal cual— y hoy nadie más las mira.
  it.each(["prisma", "public"])(
    "%s tampoco nombra la marca anterior ni la forma compuesta",
    (raizRelativa) => {
      const hallazgos: string[] = [];
      for (const archivo of archivosDe(path.join(raiz, raizRelativa))) {
        const lineas = readFileSync(archivo, "utf8").split("\n");
        lineas.forEach((linea, indice) => {
          for (const [que, patron] of PROHIBIDOS) {
            if (patron.test(linea)) hallazgos.push(`${archivo}:${indice + 1} — ${que}`);
          }
        });
      }
      expect(hallazgos.join("\n")).toBe("");
    },
  );

  // El guardián lee literales, no lo que se renderiza. Una interpolación
  // (la constante de marca seguida de "Tizayuca") produciría la forma compuesta
  // en pantalla sin que ninguna línea del código la contenga.
  it("nadie reconstruye la forma compuesta interpolando la constante de marca", () => {
    const porInterpolacion = [
      /\$\{\s*NOMBRE_DEL_SITIO\s*\}[\s"'`+]*Tizayuca/,
      /NOMBRE_DEL_SITIO\s*\+\s*["'`][\s,]*Tizayuca/,
      /Tizayuca[\s"'`+]*\$\{\s*NOMBRE_DEL_SITIO\s*\}/,
    ];
    const hallazgos: string[] = [];
    for (const archivo of archivosDe(path.join(raiz, "src"))) {
      const fuente = readFileSync(archivo, "utf8");
      for (const patron of porInterpolacion) {
        if (patron.test(fuente)) hallazgos.push(`${archivo} — ${patron}`);
      }
    }
    expect(hallazgos.join("\n")).toBe("");
  });

  // Lo servido, no el código fuente: el HTML que de verdad recibe el visitante.
  it.each([
    ["/aviso-de-privacidad", renderToStaticMarkup(createElement(AvisoDePrivacidadPage))],
    ["/terminos", renderToStaticMarkup(createElement(TerminosPage))],
  ])("el HTML servido de %s no trae la marca anterior ni la compuesta", (_ruta, html) => {
    expect(html).toContain(NOMBRE_DEL_SITIO);
    expect(html).not.toMatch(/necesitouno/i);
    expect(html).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
    // Ni siquiera partida por el markup ("EnMiRumbo</span> Tizayuca").
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
  });
});

// ── 6. Publicar el correo no arrastró datos del fundador ────────────────────

describe("adversarial · el texto público no filtra datos personales del responsable", () => {
  const htmlAviso = renderToStaticMarkup(createElement(AvisoDePrivacidadPage));
  const htmlTerminos = renderToStaticMarkup(createElement(TerminosPage));
  const publicado = `${htmlAviso}\n${htmlTerminos}`;

  it("el único correo publicado es el del directorio, en sus tres apariciones", () => {
    const correos = publicado.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    expect(correos).toHaveLength(3);
    expect([...new Set(correos)]).toEqual([CORREO_PUBLICADO]);
  });

  it("el nombre, el domicilio y el WhatsApp del responsable siguen siendo placeholders", () => {
    for (const placeholder of [
      "[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento]",
      "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]",
      "[WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]",
    ]) {
      expect(PLACEHOLDERS_LEGALES as readonly string[]).toContain(placeholder);
      expect(publicado).toContain(placeholder.replace(/&/g, "&amp;"));
    }
    // Cinco, ya sin los dos de correo, y ninguno de ellos habla de correo.
    expect(PLACEHOLDERS_LEGALES).toHaveLength(5);
    for (const placeholder of PLACEHOLDERS_LEGALES) {
      expect(placeholder.toUpperCase()).not.toContain("CORREO");
    }
  });

  it("ningún número que pueda leerse como un teléfono se coló al publicar el correo", () => {
    // El WhatsApp del directorio sigue siendo placeholder: una secuencia de 10
    // dígitos en el texto servido sería un dato de contacto real publicado sin
    // pasar por la revisión legal.
    const soloTexto = publicado.replace(/<[^>]*>/g, " ");
    expect(soloTexto).not.toMatch(/(?<!\d)\d{10}(?!\d)/);
  });

  it("la marca de borrador sigue publicada en las dos páginas, con el correo ya dentro", () => {
    for (const html of [htmlAviso, htmlTerminos]) {
      expect(html).toContain(TEXTO_MARCA_BORRADOR);
    }
    expect(htmlAviso).toContain(CORREO_PUBLICADO);
    expect(htmlTerminos).toContain(CORREO_PUBLICADO);
  });

  it("el correo publicado aparece exactamente en los tres lugares que pide la spec", () => {
    const documentos = [AVISO_PRIVACIDAD, TERMINOS];
    const apariciones = documentos
      .flatMap((documento) =>
        documento.secciones.flatMap((seccion) =>
          seccion.bloques.flatMap((bloque) => {
            if (bloque.tipo === "lista") return bloque.items;
            if (bloque.tipo === "parrafo") return [bloque.texto];
            return [];
          }),
        ),
      )
      .filter((texto) => texto.includes(CORREO_PUBLICADO));
    expect(apariciones).toHaveLength(3);
  });
});

// ── 7. Los mensajes de WhatsApp reescritos siguen viajando codificados ──────

describe("adversarial · los mensajes de WhatsApp del rebrand", () => {
  const NUMERO = "7710019777";

  /** Nombres de negocio hostiles: texto libre que el admin no controla. */
  const NOMBRES_HOSTILES: ReadonlyArray<[string, string]> = [
    ["etiqueta", "<script>alert(1)</script>"],
    ["ampersand", "Tacos & Salsa Ficticia"],
    ["parametro inyectado", "a&text=Hola%20soy%20tu%20banco&x=1"],
    ["salto de linea", "Ficticia\r\nS.A."],
    ["marca de direccion", "\u202egnitekraM aicitciF"],
    ["comillas", '"><img src=x onerror=alert(1)>'],
    ["muy largo", "Ñ".repeat(300)],
  ];

  function mensajesCon(nombre: string): string[] {
    return [
      mensajeVerificacion(nombre),
      mensajeAvisoPublicacion(nombre, "https://enmirumbo.example/ficha-ficticia"),
      mensajeAvisoRechazo(nombre, "Motivo ficticio de prueba"),
      mensajeAvisoDespublicacion(nombre, "Motivo ficticio de prueba"),
    ];
  }

  it.each(NOMBRES_HOSTILES)(
    "un nombre de negocio hostil (%s) no rompe el enlace ni inyecta parámetros",
    (_caso, nombre) => {
      for (const mensaje of mensajesCon(nombre)) {
        const enlace = construirEnlaceWhatsappPanel(NUMERO, mensaje);
        expect(enlace, _caso).not.toBeNull();
        const url = new URL(enlace ?? "");
        expect(url.protocol).toBe("https:");
        expect(url.host).toBe("wa.me");
        expect(url.pathname).toBe(`/52${NUMERO}`);
        // Un solo parámetro, y su valor es exactamente el mensaje: ni el
        // ampersand ni el `&text=` del nombre abren uno nuevo.
        expect([...url.searchParams.keys()]).toEqual(["text"]);
        expect(url.searchParams.get("text")).toBe(mensaje);
        // Y nada viaja crudo en el href.
        for (const crudo of ["<", ">", '"', " ", "\n", "\r"]) {
          expect((enlace ?? "").includes(crudo), `${_caso}: ${JSON.stringify(crudo)}`).toBe(
            false,
          );
        }
      }
    },
  );

  it("los cuatro mensajes del panel llevan la marca vigente y solo el primero, el descriptor", () => {
    const [verificacion, ...posteriores] = mensajesCon("Herrería Ficticia El Rumbo");
    expect(verificacion).toContain("EnMiRumbo, el directorio de negocios de Tizayuca");
    for (const mensaje of [verificacion, ...posteriores]) {
      expect(mensaje).toContain(NOMBRE_DEL_SITIO);
      expect(mensaje).not.toMatch(/necesitouno/i);
      expect(mensaje).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
    }
    for (const mensaje of posteriores) {
      expect(mensaje).not.toContain("el directorio de negocios de Tizayuca");
    }
  });

  it("el mensaje del vecino viaja codificado y no lleva ningún dato suyo", () => {
    const enlace = construirEnlaceWhatsapp("771 001 9888");
    expect(enlace).not.toBeNull();
    const url = new URL(enlace ?? "");
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/527710019888");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(MENSAJE_WHATSAPP_PRELLENADO);
    expect(MENSAJE_WHATSAPP_PRELLENADO).toBe(
      "Hola, te vi en EnMiRumbo. ¿Me das informes?",
    );
    // El signo de apertura y los espacios no pueden ir crudos en el href.
    expect(enlace).toContain("%C2%BF");
    expect(enlace).not.toContain(" ");
  });

  it.each([
    ["vacio", ""],
    ["letras", "no tengo whatsapp"],
    ["nueve digitos", "771001988"],
    ["once digitos", "77100198881"],
    ["digitos de ancho completo", "７７１００１９８８８"],
  ])("un WhatsApp malformado (%s) no genera enlace inventado", (_caso, numero) => {
    expect(construirEnlaceWhatsapp(numero), _caso).toBeNull();
  });

  it("un número envuelto en markup se normaliza a dígitos: el markup no viaja en el enlace", () => {
    // `normalizarWhatsapp` se queda solo con los dígitos, así que una fila
    // sembrada a mano con basura alrededor sí produce enlace — pero el enlace
    // lleva únicamente los diez dígitos, nunca la etiqueta.
    const enlace = construirEnlaceWhatsapp("<script>7710019888</script>");
    expect(enlace).toBe(
      `https://wa.me/527710019888?text=${encodeURIComponent(MENSAJE_WHATSAPP_PRELLENADO)}`,
    );
    expect(enlace).not.toContain("script");
    expect(new URL(enlace ?? "").pathname).toBe("/527710019888");
  });
});
