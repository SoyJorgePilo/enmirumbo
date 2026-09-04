import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import AvisoDePrivacidadPage from "../src/app/aviso-de-privacidad/page";
import FichaNegocioPage from "../src/app/negocio/[ficha]/page";
import TerminosPage from "../src/app/terminos/page";
import { Footer } from "../src/components/footer";
import { DocumentoLegalView } from "../src/components/legales/documento-legal";
import { AvisoConsentimiento } from "../src/components/registro/aviso-consentimiento";
import type { PrismaClient } from "../src/generated/prisma/client";
import { obtenerNegocioPublicado } from "../src/lib/directorio";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  AVISO_PRIVACIDAD,
  PLACEHOLDERS_LEGALES,
  TERMINOS,
  TEXTO_MARCA_BORRADOR,
  type DocumentoLegal,
} from "../src/lib/legales/textos";
import { crearClientePrueba } from "./db";

/**
 * Etapa C (seguridad y test) del change `agregar-paginas-legales`.
 *
 * La superficie de código es chica (contenido estático + un enlace nuevo), así
 * que lo adversarial aquí no es entrada hostil sino **que el documento legal
 * mienta**: el aviso afirma qué queda público, qué nunca se publica y qué datos
 * faltan por completar. Este archivo ata esas afirmaciones al código real:
 *
 * 1. los placeholders no pueden confundirse con un dato de contacto real, y
 *    tampoco pueden esconder uno dentro de los corchetes (el guardián del dev
 *    los recorta antes de mirar);
 * 2. la marca de borrador se exige desde el HTML servido, no desde la lista
 *    declarada: si queda un corchete a la vista, la marca tiene que estar;
 * 3. las cuatro superficies legales (dos páginas, footer y bloque de
 *    consentimiento) solo enlazan hacia adentro, sin `target` ni esquemas
 *    ejecutables, y ninguna pinta HTML sin escapar;
 * 4. lo que la ficha pública devuelve de verdad coincide con lo que el aviso
 *    enumera como público, y ningún campo interno se cuela.
 *
 * TODOS los datos de prueba son ficticios (repo público + LFPDPPP): la serie de
 * WhatsApp `7719994xxx` es exclusiva de este archivo y se borra al terminar.
 */

const raiz = process.cwd();
const PREFIJO = "7719994";

const htmlAvisoPrivacidad = renderToStaticMarkup(createElement(AvisoDePrivacidadPage));
const htmlTerminos = renderToStaticMarkup(createElement(TerminosPage));
const htmlFooter = renderToStaticMarkup(createElement(Footer));
const htmlConsentimiento = renderToStaticMarkup(createElement(AvisoConsentimiento));

const PAGINAS_LEGALES: ReadonlyArray<[string, string]> = [
  ["/aviso-de-privacidad", htmlAvisoPrivacidad],
  ["/terminos", htmlTerminos],
];

const SUPERFICIES_LEGALES: ReadonlyArray<[string, string]> = [
  ...PAGINAS_LEGALES,
  ["footer", htmlFooter],
  ["bloque de consentimiento del registro", htmlConsentimiento],
];

const soloTexto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");

// ── 1. Placeholders: ni datos reales ni datos inventados escondidos ──────────

describe("adversarial · los placeholders no se pueden confundir con un dato real", () => {
  it("ninguno contiene correo, teléfono, dominio ni URL dentro de los corchetes", () => {
    // El guardián del dev (`tests/legales-textos.test.ts`) borra los corchetes
    // ANTES de buscar datos inventados, así que un
    // "[CORREO ARCO — pendiente, mientras tanto vecino@ejemplo.mx]" pasaría
    // limpio. Aquí se mira justo lo que aquel recorta.
    for (const placeholder of PLACEHOLDERS_LEGALES) {
      expect(placeholder, placeholder).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      expect(placeholder, placeholder).not.toMatch(/\d{4,}/);
      expect(placeholder, placeholder).not.toMatch(/https?:|wa\.me|\bwww\./i);
      expect(placeholder, placeholder).not.toMatch(
        /\.(com|mx|org|net|io)\b/i,
      );
      // Nada que parezca un domicilio dentro del corchete.
      expect(placeholder, placeholder).not.toMatch(
        /\bC\.?P\.?\s*\d|\bcalle\b|\bavenida\b|\bcolonia\b/i,
      );
    }
  });

  it("cada uno se lee como un hueco pendiente, no como un valor", () => {
    for (const placeholder of PLACEHOLDERS_LEGALES) {
      // Corchetes + nombre del dato en mayúsculas: imposible leerlo como el
      // dato mismo aunque el lector se salte la marca de borrador.
      expect(placeholder, placeholder).toMatch(/^\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{3,}/);
      expect(placeholder, placeholder).toMatch(/\]$/);
      expect(placeholder.toUpperCase(), placeholder).toContain(
        placeholder.slice(1, 10).toUpperCase(),
      );
    }
  });

  it("los corchetes llegan enteros al HTML servido, sin partirse en el markup", () => {
    // Si el componente partiera el placeholder en varios nodos (por ejemplo con
    // un `<span>` en medio), el checklist de lanzamiento seguiría verde mientras
    // el lector ve un texto raro. Se exige el literal completo, ya sin etiquetas.
    const textoDeLasPaginas = PAGINAS_LEGALES.map(([, html]) => soloTexto(html)).join(
      "\n",
    );
    for (const placeholder of PLACEHOLDERS_LEGALES) {
      expect(textoDeLasPaginas, placeholder).toContain(placeholder);
    }
  });
});

// ── 2. La marca de borrador, exigida desde el HTML y no desde la lista ───────

describe("adversarial · la marca de borrador no se puede quitar por accidente", () => {
  it("si queda un corchete a la vista, la marca está en las DOS páginas", () => {
    for (const [ruta, html] of PAGINAS_LEGALES) {
      const texto = soloTexto(html);
      const corchetes = texto.match(/\[[^\]]+\]/g) ?? [];
      if (corchetes.length > 0) {
        expect(texto, `${ruta} enseña ${corchetes.length} pendientes sin marca`).toContain(
          TEXTO_MARCA_BORRADOR,
        );
      }
    }
  });

  it("la marca va ANTES del contenido, no enterrada al final", () => {
    for (const [ruta, html] of PAGINAS_LEGALES) {
      const texto = soloTexto(html);
      const posicionMarca = texto.indexOf(TEXTO_MARCA_BORRADOR);
      expect(posicionMarca, ruta).toBeGreaterThanOrEqual(0);
      // Antes de la primera sección `h2` del documento.
      const primerH2 = html.indexOf("<h2");
      expect(html.indexOf(TEXTO_MARCA_BORRADOR.slice(0, 20)), ruta).toBeLessThan(
        primerH2,
      );
    }
  });

  it("la marca no depende de una prop que quien pinte pueda apagar", () => {
    // `DocumentoLegalView` recibe solo el documento: no hay forma de pedirle
    // "píntalo sin la advertencia" desde una página nueva.
    const componente = readFileSync(
      join(raiz, "src/components/legales/documento-legal.tsx"),
      "utf8",
    );
    expect(componente).toMatch(/\{\s*documento\s*\}\s*:\s*\{\s*documento:\s*DocumentoLegal/);
    expect(componente).not.toMatch(/borrador\s*\?\?|mostrarBorrador|ocultarBorrador/);
  });
});

// ── 3. Enlaces y markup de las cuatro superficies legales ───────────────────

describe("adversarial · enlaces y markup de las superficies legales", () => {
  const RUTAS_LEGALES = ["/aviso-de-privacidad", "/terminos"];

  it("todo enlace es interno a las dos rutas legales, sin target ni esquemas raros", () => {
    for (const [nombre, html] of SUPERFICIES_LEGALES) {
      const etiquetas = [...html.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
      expect(etiquetas.length, nombre).toBeGreaterThan(0);
      for (const atributos of etiquetas) {
        const href = atributos.match(/href="([^"]*)"/)?.[1];
        expect(RUTAS_LEGALES, `${nombre}: href ${href}`).toContain(href);
        // Misma pestaña: sin `target` no hace falta `rel`, y no hay superficie
        // para un `noopener` olvidado.
        expect(atributos, nombre).not.toContain("target=");
        expect(atributos, nombre).not.toMatch(/\brel=/);
        expect(atributos, nombre).not.toMatch(/download|ping=/);
      }
    }
  });

  it("ningún esquema ejecutable ni destino externo en el HTML legal", () => {
    for (const [nombre, html] of SUPERFICIES_LEGALES) {
      expect(html, nombre).not.toMatch(/href="\s*(javascript|data|vbscript|file):/i);
      expect(html, nombre).not.toMatch(/href="\s*(mailto|tel):/i);
      expect(html, nombre).not.toMatch(/href="\s*https?:/i);
      expect(html, nombre).not.toMatch(/href="\s*\/\//);
      expect(html, nombre).not.toMatch(/<script|<iframe|<img\s|on[a-z]+=/i);
    }
  });

  it("los enlaces declarados en el módulo de textos son de la lista cerrada", () => {
    // El tipo obliga en compilación; esto lo comprueba en ejecución, que es lo
    // que se sirve si alguien afloja el tipo o genera el documento de otro modo.
    const destinos: string[] = [];
    for (const documento of [AVISO_PRIVACIDAD, TERMINOS]) {
      for (const seccion of documento.secciones) {
        for (const bloque of seccion.bloques) {
          if (bloque.tipo === "enlace") destinos.push(bloque.href);
        }
      }
      if (documento.enlaceCierre) destinos.push(documento.enlaceCierre.href);
    }
    expect(destinos.length).toBeGreaterThan(0);
    for (const destino of destinos) expect(RUTAS_LEGALES).toContain(destino);
  });

  it("ninguna superficie legal pinta HTML sin escapar", () => {
    for (const archivo of [
      "src/components/legales/documento-legal.tsx",
      "src/app/aviso-de-privacidad/page.tsx",
      "src/app/terminos/page.tsx",
      "src/components/footer.tsx",
      "src/components/registro/aviso-consentimiento.tsx",
      "src/lib/legales/textos.ts",
    ]) {
      const fuente = readFileSync(join(raiz, archivo), "utf8");
      expect(fuente, archivo).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("DocumentoLegalView escapa cualquier contenido, no lo interpreta", () => {
    // Hoy el contenido es estático y aprobado; el día que alguien pinte con
    // este componente algo que venga de fuera (una versión guardada del aviso,
    // por ejemplo), tiene que seguir siendo texto.
    const hostil: DocumentoLegal = {
      h1: '<script>alert("h1")</script>',
      ultimaActualizacion: '"><img src=x onerror=alert(1)>',
      introduccion: "</p><iframe src=javascript:alert(1)></iframe>",
      secciones: [
        {
          encabezado: "<b onmouseover=alert(1)>Encabezado</b>",
          bloques: [
            { tipo: "parrafo", texto: '<svg onload=alert("parrafo")>' },
            { tipo: "lista", items: ['<script>alert("item")</script>'] },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(DocumentoLegalView, { documento: hostil }),
    );
    // Ninguna etiqueta del payload sobrevive abierta: lo que se ve son
    // entidades (`&lt;script&gt;`), no markup, así que los `onerror=` que
    // aparecen en el HTML son texto plano dentro de una entidad.
    expect(html).not.toMatch(/<(script|iframe|svg|img|b)\b/i);
    for (const payload of [
      '<script>alert("h1")</script>',
      "<iframe src=javascript:alert(1)></iframe>",
      '<svg onload=alert("parrafo")>',
      "<b onmouseover=alert(1)>Encabezado</b>",
    ]) {
      expect(html, payload).not.toContain(payload);
    }
    expect(html).toContain("&lt;script&gt;");
  });
});

// ── 4. El aviso no puede mentir sobre lo que la ficha pública enseña ─────────

/**
 * Cada campo que `obtenerNegocioPublicado` devuelve, con la frase del aviso que
 * lo declara público. Si alguien agrega un campo a la proyección pública sin
 * declararlo aquí, este mapa deja de cuadrar y la suite lo señala: es la única
 * forma de que "lo que dice el aviso" y "lo que sale en la ficha" no se
 * separen con el tiempo.
 */
const CAMPO_PUBLICO_DECLARADO: Record<string, string> = {
  nombre: "el nombre de tu negocio",
  coloniaNombre: "tu colonia",
  queOfreces: '"¿Qué ofreces?"',
  horario: "tu horario",
  entregaADomicilio: "si haces entregas",
  facebookUrl: "el link de tu Facebook",
  whatsapp: "tu WhatsApp y tu teléfono fijo",
  telefonoFijo: "tu WhatsApp y tu teléfono fijo",
  direccion:
    "Si tú escribes una dirección o referencias en el formulario, eso también se publica tal cual",
  // Enmienda de la auditoría (MEDIO-2): la foto dejó de ser un campo público
  // sin declarar. El aviso ya dice que, si la ficha llega a llevarla, es
  // pública; T-008 volverá aquí a escribir con qué reglas se publica.
  fotoUrl: "una foto de tu negocio",
};

/**
 * Campos de la proyección pública que el aviso NO enumera, cada uno con su
 * motivo. No es una excusa: es la lista que hay que vaciar o justificar cuando
 * cambie el producto.
 *
 * - `id`: identificador de la ficha, va en la URL; no es un dato del titular.
 * - `coloniaSlug`: la misma colonia ya declarada, en forma de filtro.
 *
 * `fotoUrl` salió de esta lista con la enmienda de la auditoría (MEDIO-2): ya
 * está declarada en "Qué queda público y qué no", así que el aviso no queda
 * desactualizado el día que T-008 empiece a capturar fotos.
 */
const CAMPOS_PUBLICOS_SIN_DECLARAR = ["id", "coloniaSlug"];

const NEGOCIO_PRUEBA = {
  nombre: "Reparadora Adversarial Legales (ficticia)",
  whatsapp: `${PREFIJO}301`,
  telefonoFijo: "7717779301",
  direccion: "Domicilio ficticio 301, entre dos calles inventadas",
  horario: "Lunes a sábado de 9 a 7",
  queOfreces: "Servicio ficticio para la auditoría de las páginas legales.",
  facebookUrl: "https://ejemplo.invalid/pagina-ficticia",
  motivoRechazo: "Motivo interno ficticio que el público jamás debe leer.",
  token: "token-de-gestion-ficticio-legales-4d2e",
  registradoEn: new Date("2026-07-31T10:00:00.000Z"),
  consintioAvisoEn: new Date("2026-07-31T10:05:00.000Z"),
};

describe("adversarial · lo que el aviso promete vs. lo que la ficha publica", () => {
  let prisma: PrismaClient;
  let id = "";
  let htmlFicha = "";

  beforeAll(async () => {
    prisma = crearClientePrueba();
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await seedCatalogos(prisma);
    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "otro" },
    });
    const colonia = await prisma.colonia.findUniqueOrThrow({ where: { slug: "huicalco" } });

    const creado = await prisma.negocio.create({
      data: {
        nombre: NEGOCIO_PRUEBA.nombre,
        whatsapp: NEGOCIO_PRUEBA.whatsapp,
        categoriaId: categoria.id,
        coloniaId: colonia.id,
        queOfreces: NEGOCIO_PRUEBA.queOfreces,
        telefonoFijo: NEGOCIO_PRUEBA.telefonoFijo,
        direccion: NEGOCIO_PRUEBA.direccion,
        horario: NEGOCIO_PRUEBA.horario,
        facebookUrl: NEGOCIO_PRUEBA.facebookUrl,
        entregaADomicilio: true,
        estado: "publicado",
        origen: "siembra",
        publicadoEn: new Date("2026-08-15T10:00:00.000Z"),
        registradoEn: NEGOCIO_PRUEBA.registradoEn,
        consintioAvisoEn: NEGOCIO_PRUEBA.consintioAvisoEn,
        // Fila deliberadamente sucia: rastro de un rechazo anterior y token de
        // gestión sobre una ficha ya publicada. El aviso promete que nada de
        // esto se ve; se comprueba en el peor caso, no en el limpio.
        rechazadoEn: new Date("2026-08-01T10:00:00.000Z"),
        motivoRechazo: NEGOCIO_PRUEBA.motivoRechazo,
        tokenGestion: NEGOCIO_PRUEBA.token,
      },
      select: { id: true },
    });
    id = creado.id;

    const elemento = await FichaNegocioPage({
      params: Promise.resolve({ ficha: construirSegmentoFicha(NEGOCIO_PRUEBA.nombre, id) }),
      searchParams: Promise.resolve({}),
    });
    htmlFicha = renderToStaticMarkup(createElement(() => elemento));
  });

  afterAll(async () => {
    await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
    await prisma.$disconnect();
  });

  it("todo campo que la ficha pública devuelve está declarado en el aviso", async () => {
    const publicado = await obtenerNegocioPublicado(id);
    expect(publicado, "la ficha de prueba tiene que existir").not.toBeNull();
    const textoDelAviso = soloTexto(htmlAvisoPrivacidad);
    for (const campo of Object.keys(publicado!)) {
      if (CAMPOS_PUBLICOS_SIN_DECLARAR.includes(campo)) continue;
      const frase = CAMPO_PUBLICO_DECLARADO[campo];
      expect(
        frase,
        `campo público sin declarar en el aviso de privacidad: ${campo}`,
      ).toBeDefined();
      expect(textoDelAviso, `${campo} → "${frase}"`).toContain(frase);
    }
  });

  it("la proyección pública no crece a espaldas del aviso", async () => {
    const publicado = await obtenerNegocioPublicado(id);
    expect(Object.keys(publicado!).sort()).toEqual(
      [...Object.keys(CAMPO_PUBLICO_DECLARADO), ...CAMPOS_PUBLICOS_SIN_DECLARAR].sort(),
    );
  });

  it('lo que el aviso llama "lo que nunca se publica" no aparece en la ficha servida', () => {
    const texto = soloTexto(htmlFicha);
    // Los tres que el aviso nombra: fecha de registro, notas internas de la
    // revisión y motivo del rechazo. Más la constancia y el token de gestión.
    for (const secreto of [
      NEGOCIO_PRUEBA.motivoRechazo,
      NEGOCIO_PRUEBA.token,
      "2026-07-31",
      "2026-08-01",
      "2026-08-15",
      "consintioAvisoEn",
      "tokenGestion",
      "motivoRechazo",
      "registradoEn",
      "en_revision",
      "siembra",
    ]) {
      expect(texto, `fuga en la ficha: ${secreto}`).not.toContain(secreto);
      expect(htmlFicha, `fuga en la ficha: ${secreto}`).not.toContain(secreto);
    }
  });

  it("lo que la ficha sí enseña es exactamente lo que el aviso anunció", () => {
    const texto = soloTexto(htmlFicha);
    for (const visible of [
      NEGOCIO_PRUEBA.nombre,
      NEGOCIO_PRUEBA.queOfreces,
      NEGOCIO_PRUEBA.direccion,
      NEGOCIO_PRUEBA.horario,
      "Huicalco",
    ]) {
      expect(texto, `debería verse: ${visible}`).toContain(visible);
    }
    // El WhatsApp y el fijo, con sus botones: es la advertencia central del
    // aviso y del hallazgo M3.
    expect(htmlFicha).toContain(`https://wa.me/52${NEGOCIO_PRUEBA.whatsapp}`);
    expect(htmlFicha).toContain(`tel:+52${NEGOCIO_PRUEBA.telefonoFijo}`);
  });
});

// ── 5. Coherencia entre los dos documentos y con el flujo real ──────────────

describe("adversarial · los dos documentos no se contradicen entre sí", () => {
  const textoAviso = soloTexto(htmlAvisoPrivacidad);
  const textoTerminos = soloTexto(htmlTerminos);
  const textoConsentimiento = soloTexto(htmlConsentimiento);

  it("el plazo ARCO es el mismo en el aviso integral y en el simplificado", () => {
    expect(textoAviso).toContain("máximo de 20 días hábiles");
    expect(textoConsentimiento).toContain("máximo 20 días hábiles");
    // Y ningún otro plazo compitiendo en las páginas legales.
    for (const [nombre, texto] of [
      ["aviso", textoAviso],
      ["términos", textoTerminos],
      ["consentimiento", textoConsentimiento],
    ] as const) {
      const otrosPlazos = [...texto.matchAll(/(\d+)\s+días\s+hábiles/g)]
        .map((m) => m[1])
        .filter((dias) => dias !== "20");
      expect(otrosPlazos, nombre).toEqual([]);
    }
  });

  it("el simplificado y el integral cuentan la misma historia de publicidad", () => {
    for (const promesa of [
      "no vendemos",
      "tu colonia",
      "no tu domicilio exacto",
    ]) {
      expect(textoAviso.toLowerCase(), promesa).toContain(promesa);
      expect(textoConsentimiento.toLowerCase(), promesa).toContain(promesa);
    }
  });

  it("REGRESIÓN (hallazgo ALTO-1, corregido): la retención de 90 días es la de los RECHAZADOS en los dos documentos", () => {
    // Este caso nació como CARACTERIZACIÓN del hallazgo ALTO-1: el aviso
    // prometía borrar a los 90 días todo registro "que no se publicó" —lo que
    // incluye a los que se quedan en revisión, que ningún código borra y que el
    // modelo ni siquiera puede fechar— mientras los términos, en la misma
    // publicación, lo limitaban a los RECHAZADOS. La enmienda aprobada alineó
    // el aviso con los términos y con el PRD §6.3/§8; aquí queda de guardia
    // para que la contradicción no vuelva.
    expect(textoTerminos).toContain(
      "Los datos de los registros rechazados se borran a los 90 días",
    );
    expect(textoAviso).toContain(
      "Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días",
    );
    expect(textoAviso).not.toContain("Si tu registro no se publicó");
    // El único reloj que el modelo tiene es `rechazadoEn`: ninguna de las dos
    // páginas puede prometer una purga para las fichas en revisión.
    for (const [nombre, texto] of [
      ["aviso", textoAviso],
      ["términos", textoTerminos],
    ] as const) {
      const plazos = [...texto.matchAll(/(\d+)\s+días\b/g)]
        .map((m) => m[1])
        .filter((dias) => dias !== "20"); // el plazo ARCO, en días hábiles
      expect(new Set(plazos), nombre).toEqual(new Set(["90"]));
    }
    // Y el aviso no promete que nada de esto ocurra solo (MEDIO-1).
    expect(textoAviso).toContain("no hay un botón que lo haga solo");
  });
});
