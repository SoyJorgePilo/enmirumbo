import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import { FormularioRegistro } from "../src/components/registro/formulario-registro";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  EJEMPLO_QUE_OFRECES_GENERICO,
  ejemploQueOfreces,
} from "../src/lib/registro/ejemplos";
import {
  ipBloqueada,
  ipDeEncabezados,
  reiniciarLimitePorIp,
  tamanoLimitePorIp,
} from "../src/lib/registro/limite-ip";
import { VERSION_AVISO } from "../src/lib/legales/version";
import {
  procesarRegistro,
  type ClienteRegistro,
} from "../src/lib/registro/procesar";
import {
  CAMPO_VERSION_AVISO,
  COLONIA_OTRA_VALOR,
  LIMITES_LONGITUD,
  MENSAJES_ERROR_REGISTRO,
} from "../src/lib/registro/textos";
import { ESTADO_INICIAL_REGISTRO } from "../src/lib/registro/tipos";
import { normalizarWhatsapp } from "../src/lib/whatsapp";
import { crearClientePrueba } from "./db";

// Etapa C (seguridad): tests adversariales del formulario público de registro
// — la primera superficie que recibe datos personales de terceros.
// Cubren lo que el camino feliz no toca: payloads que se saltan la validación
// del navegador (POST crudo a la Server Action), unicode raro en el WhatsApp,
// XSS almacenado, inyección por URL, suplantación de IP en el anti-abuso,
// carreras reales contra la unicidad y transiciones ilegales de estado.
//
// Datos 100% ficticios (repo público + LFPDPPP): números del rango inventado
// 771999xxxx, nombres y colonias inventados, IPs de los rangos reservados para
// documentación (RFC 5737). Los tests que documentan un comportamiento que hoy
// es un hallazgo van marcados como CARACTERIZACIÓN: pasan describiendo la
// realidad actual y deben actualizarse cuando el dev corrija el hallazgo.

const IP = "203.0.113.10"; // TEST-NET-3, reservado para documentación

describe("adversarial · registro de negocios", () => {
  let prisma: PrismaClient;
  let categoriaId: number;
  let coloniaId: number;

  /** FormData crudo: aquí sí se pueden mandar campos vacíos y campos extra. */
  function envio(campos: Record<string, string> = {}): FormData {
    const formData = new FormData();
    const base: Record<string, string> = {
      nombre: "Taquería Ficticia La Adversaria",
      categoriaId: String(categoriaId),
      whatsapp: "7719992001",
      coloniaId: String(coloniaId),
      consentimiento: "on",
      // Campo oculto con la versión del aviso que pintó el formulario
      // (change `versionar-aviso-privacidad`): sin él, el envío se rechaza.
      [CAMPO_VERSION_AVISO]: VERSION_AVISO,
      ...campos,
    };
    for (const [clave, valor] of Object.entries(base)) {
      formData.append(clave, valor);
    }
    return formData;
  }

  const procesar = (formData: FormData, extra: Partial<{ ip: string | null }> = {}) =>
    procesarRegistro(formData, { prisma, ip: IP, ...extra });

  const buscar = (whatsapp: string) =>
    prisma.negocio.findUnique({ where: { whatsapp } });

  const limpiar = () =>
    prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: "771999" } } });

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
    vi.restoreAllMocks();
    await limpiar();
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  // ── 1. XSS almacenado y texto libre hostil ────────────────────────────────

  const HOSTIL = {
    nombre: '<script>alert("xss")</script>Ficticia',
    queOfreces: '"><img src=x onerror=alert(1)> plomería',
    direccion: "Calle Ficticia'; DROP TABLE Negocio;--",
    horario: "L-S <svg/onload=alert(1)>",
    coloniaOtra: "</option><script>alert(1)</script>",
  };

  it("guarda el texto libre hostil sin mutarlo y sin ejecutar SQL (Prisma parametriza)", async () => {
    await procesar(
      envio({
        whatsapp: "7719992010",
        coloniaId: COLONIA_OTRA_VALOR,
        ...HOSTIL,
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992010" },
    });
    expect(creado.nombre).toBe(HOSTIL.nombre);
    expect(creado.queOfreces).toBe(HOSTIL.queOfreces);
    expect(creado.direccion).toBe(HOSTIL.direccion);
    expect(creado.horario).toBe(HOSTIL.horario);
    expect(creado.coloniaOtra).toBe(HOSTIL.coloniaOtra);
    // La tabla sigue viva: el "DROP TABLE" viajó como dato, no como SQL.
    expect(await prisma.negocio.count()).toBeGreaterThan(0);
  });

  it("el eco del formulario escapa el HTML hostil (sin XSS reflejado)", () => {
    const html = renderToStaticMarkup(
      createElement(FormularioRegistro, {
        categorias: [{ id: categoriaId, nombre: "Servicios del hogar", slug: "servicios-del-hogar" }],
        colonias: [{ id: coloniaId, nombre: "Haciendas de Tizayuca", slug: "haciendas-de-tizayuca" }],
        honeypot: null,
        aviso: null,
        estadoInicial: {
          errores: { nombre: MENSAJES_ERROR_REGISTRO.nombre },
          valores: {
            ...ESTADO_INICIAL_REGISTRO.valores,
            ...HOSTIL,
            whatsapp: '"><script>alert(1)</script>',
          },
        },
      }),
    );

    // Nada de lo que escribió el usuario vuelve como marcado ejecutable
    // (el único <script> del HTML es el del reproductor de formularios de
    // React, que no depende de la entrada).
    expect(html).not.toContain('<script>alert("xss")');
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg/onload");
    expect(html).not.toContain("</option><script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  // ── 2. Unicode y normalización del WhatsApp ───────────────────────────────

  it.each([
    ["dígitos árabe-índicos", "٧٧١٩٩٩٢٠٢٠"],
    ["dígitos de ancho completo", "７７１９９９２０２０"],
    ["dígitos devanagari", "७७१९९९२०२०"],
  ])("rechaza un WhatsApp escrito con %s (no son dígitos ASCII)", (_caso, entrada) => {
    expect(normalizarWhatsapp(entrada)).toBeNull();
  });

  it("los caracteres invisibles (zero-width, RTL) no crean un número distinto", async () => {
    expect(normalizarWhatsapp("‎771​999‏2021‮")).toBe("7719992021");

    await procesar(envio({ whatsapp: "7719992021" }));
    const segundo = await procesar(
      envio({ nombre: "Otra Ficticia", whatsapp: "77​1 999‎2021" }),
    );

    expect(segundo.exito).toBe(false);
    if (segundo.exito) return;
    expect(segundo.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(
      await prisma.negocio.count({ where: { whatsapp: { startsWith: "7719992021" } } }),
    ).toBe(1);
  });

  it("CARACTERIZACIÓN: acepta un WhatsApp con letras o etiquetas alrededor de los 10 dígitos", async () => {
    // La spec solo manda descartar espacios, guiones, puntos y paréntesis;
    // `replace(/\D/g, "")` descarta CUALQUIER cosa que no sea dígito. No hay
    // riesgo de inyección (lo guardado son los 10 dígitos), pero una errata
    // como "77199920 22 casa" se acepta en silencio en vez de pedir revisión.
    await procesar(envio({ whatsapp: '<script>7719992022</script>' }));

    const creado = await buscar("7719992022");
    expect(creado).not.toBeNull();
    expect(creado?.whatsapp).toBe("7719992022");
  });

  it("no acepta longitudes que no sean 10 dígitos (ni con prefijos ajenos)", () => {
    expect(normalizarWhatsapp("+1 555 019 9920")).toBeNull(); // 11 dígitos
    expect(normalizarWhatsapp("+34 771 999 2023")).toBeNull(); // 12 sin 52
    expect(normalizarWhatsapp("5252771999202")).toBeNull(); // 13 sin 521
    expect(normalizarWhatsapp("52521771999202")).toBeNull(); // 14
    // 10 dígitos cualesquiera pasan: el formulario no verifica que la lada
    // sea mexicana ni que el número exista (lo confirma el admin por WhatsApp).
    expect(normalizarWhatsapp("0000000000")).toBe("0000000000");
  });

  // ── 3. Cotas de longitud y payloads gigantes ──────────────────────────────

  // CORREGIDO (MEDIO 3, iteración 2): los tres campos que faltaban ya tienen
  // cota y el eco vuelve truncado, así que el POST gigante no se amplifica.
  it("el WhatsApp tiene cota de longitud y el rechazo no devuelve el payload entero", async () => {
    const gigante = "9".repeat(100_000);
    const resultado = await procesar(
      envio({ whatsapp: gigante, categoriaId: gigante, coloniaId: gigante }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.whatsapp).toBe(MENSAJES_ERROR_REGISTRO.whatsapp);
    expect(resultado.estado.errores.categoriaId).toBe(
      MENSAJES_ERROR_REGISTRO.categoriaId,
    );
    expect(resultado.estado.errores.coloniaId).toBe(MENSAJES_ERROR_REGISTRO.coloniaId);
    expect(resultado.estado.valores.whatsapp).toHaveLength(
      LIMITES_LONGITUD.whatsapp,
    );
    expect(resultado.estado.valores.categoriaId).toHaveLength(
      LIMITES_LONGITUD.categoriaId,
    );
    expect(resultado.estado.valores.coloniaId).toHaveLength(
      LIMITES_LONGITUD.coloniaId,
    );
  });

  it("CARACTERIZACIÓN: las cotas cuentan unidades UTF-16, no caracteres visibles", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719992030", queOfreces: "🌮".repeat(120) }),
    );

    // 120 emojis se ven como 120 caracteres pero pesan 240 unidades: el
    // mensaje dice "200 caracteres o menos" y el usuario no entiende por qué.
    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.queOfreces).toBe(MENSAJES_ERROR_REGISTRO.queOfreces);
    expect(await buscar("7719992030")).toBeNull();
  });

  it("los textos al límite exacto se aceptan y no se truncan en silencio", async () => {
    const nombre = "Ñ".repeat(80);
    await procesar(envio({ whatsapp: "7719992031", nombre }));

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992031" },
    });
    expect(creado.nombre).toHaveLength(80);
    expect(creado.nombre).toBe(nombre);
  });

  // ── 4. Inyección por URL (facebookUrl) ────────────────────────────────────

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(document.domain)",
    "\n\tjavascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/perfil",
    "facebook.com/minegocio",
  ])("rechaza %s como link de Facebook sin crear nada", async (facebookUrl) => {
    const resultado = await procesar(envio({ whatsapp: "7719992040", facebookUrl }));

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.facebookUrl).toBe(
      MENSAJES_ERROR_REGISTRO.facebookUrl,
    );
    expect(await buscar("7719992040")).toBeNull();
  });

  // CORREGIDO (MEDIO 4, iteración 2): las credenciales incrustadas se rechazan
  // y lo que se guarda es `url.href`, no la cadena cruda.
  it("rechaza un link con credenciales incrustadas (facebook.com@otro-host)", async () => {
    const resultado = await procesar(
      envio({
        whatsapp: "7719992041",
        facebookUrl: "https://facebook.com@evil.example/perfil",
      }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.facebookUrl).toBe(
      MENSAJES_ERROR_REGISTRO.facebookUrl,
    );
    expect(await buscar("7719992041")).toBeNull();
  });

  it.each([
    ["homógrafo cirílico", "https://facebоok.com/minegocio", "https://xn--facebok-ejg.com/minegocio"],
    ["host interno", "http://127.0.0.1:8080/admin", "http://127.0.0.1:8080/admin"],
    [
      "subdominio engañoso",
      "https://facebook.com.evil.example/minegocio",
      "https://facebook.com.evil.example/minegocio",
    ],
  ])(
    "acepta un link http(s) que no es de Facebook (%s) pero lo guarda normalizado",
    async (_caso, facebookUrl, guardado) => {
      // La spec solo exige el esquema http(s) (design.md §3 decide no restringir
      // el dominio). Lo que se persiste es la URL canónica: el homógrafo queda
      // en punycode, visible para quien la pinte. Aun así, la ficha pública y
      // el panel deben renderizarla con rel="noopener noreferrer" y sin
      // prometer que lleva a Facebook.
      await procesar(envio({ whatsapp: "7719992042", facebookUrl }));

      const creado = await prisma.negocio.findUniqueOrThrow({
        where: { whatsapp: "7719992042" },
      });
      expect(creado.facebookUrl).toBe(guardado);
      await limpiar();
    },
  );

  // ── 5. Anti-abuso: honeypot y límite por IP ───────────────────────────────

  it("CARACTERIZACIÓN: el campo trampa lleno de espacios no dispara la trampa", async () => {
    // `texto()` recorta espacios: un bot que rellena todo con " " pasa. Es el
    // precio de no castigar autocompletados con espacio; queda documentado.
    const resultado = await procesar(envio({ whatsapp: "7719992050", sitio_web: "   " }));

    expect(resultado.exito).toBe(true);
    expect(await buscar("7719992050")).not.toBeNull();
  });

  it("el envío con la trampa llena no gasta cupo de IP ni escribe datos en el log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 5; i += 1) {
      const bloqueado = await procesar(
        envio({ whatsapp: "7719992051", sitio_web: "https://spam.example" }),
      );
      expect(bloqueado.exito).toBe(true);
    }

    expect(await buscar("7719992051")).toBeNull();
    const logueado = aviso.mock.calls.flat().join(" ");
    expect(logueado).not.toMatch(/7719992051|Adversaria|spam\.example/);
    // El cupo sigue intacto para quien sí manda un envío legítimo.
    const legitimo = await procesar(envio({ whatsapp: "7719992052" }));
    expect(legitimo.exito).toBe(true);
  });

  // CORREGIDO (ALTO 1, iteración 2): la IP ya no sale de cualquier encabezado.
  it("la IP solo sale del encabezado declarado por configuración, y del último salto", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const suplantada = new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" });

    // Sin `REGISTRO_ENCABEZADO_IP` no se confía en ningún encabezado.
    expect(ipDeEncabezados(suplantada)).toBeNull();

    // Declarado el encabezado, se toma el último salto (el que agrega el
    // proxy), no el que eligió quien envía, y debe tener forma de IP.
    expect(ipDeEncabezados(suplantada, "x-forwarded-for")).toBe("203.0.113.9");
    expect(
      ipDeEncabezados(
        new Headers({ "x-forwarded-for": "no-es-una-ip" }),
        "x-forwarded-for",
      ),
    ).toBeNull();
  });

  it("rotar la IP de origen sigue abriendo el oráculo: el cupo depende de que la clave sea confiable", async () => {
    await procesar(envio({ whatsapp: "7719992060" }));
    reiniciarLimitePorIp();

    // Cada intento desde una IP distinta consulta si un número ya tiene ficha
    // (mensaje de duplicado = sí) sin agotar el cupo de ninguna, y sin
    // escribir una fila. Con el ALTO 1 corregido esto ya NO se consigue desde
    // una sola máquina falsificando un encabezado (ver el test de
    // `ipDeEncabezados`), pero sigue siendo el límite real de la mitigación de
    // design.md §5: quien tenga muchas IPs de verdad puede barrer.
    for (let i = 0; i < 12; i += 1) {
      const resultado = await procesar(
        envio({ nombre: "Sonda Ficticia", whatsapp: "7719992060" }),
        { ip: `10.0.0.${i}` },
      );
      expect(resultado.exito).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.whatsapp).toBe(
        MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
      );
      expect(resultado.estado.errores.general).toBeUndefined();
    }

    expect(await prisma.negocio.count({ where: { whatsapp: "7719992060" } })).toBe(1);
  });

  // CORREGIDO (MEDIO 1, iteración 2): el mapa se poda al insertar y tiene
  // techo, así que las entradas de IPs que no vuelven no se acumulan.
  it("el cupo de cada IP se respeta y las entradas caducadas se purgan solas", async () => {
    await procesar(envio({ whatsapp: "7719992061" }));
    reiniciarLimitePorIp();
    const ahora = new Date();

    // 10 IPs x 3 envíos: cada una gasta su cupo dentro de la ventana.
    for (let i = 0; i < 10; i += 1) {
      for (let intento = 0; intento < 3; intento += 1) {
        await procesarRegistro(envio({ whatsapp: "7719992061" }), {
          prisma,
          ip: `198.51.100.${i}`,
          ahora,
        });
      }
    }
    for (let i = 0; i < 10; i += 1) {
      expect(ipBloqueada(`198.51.100.${i}`, ahora)).toBe(true);
    }
    expect(tamanoLimitePorIp()).toBe(10);

    // Una hora después, un alta de cualquier otra IP barre las 10 caducadas
    // aunque ninguna vuelva a aparecer: la memoria no crece indefinidamente.
    const despues = new Date(ahora.getTime() + 61 * 60_000);
    await procesarRegistro(envio({ whatsapp: "7719992062" }), {
      prisma,
      ip: "203.0.113.77",
      ahora: despues,
    });
    expect(tamanoLimitePorIp()).toBe(1);
  });

  // ── 6. Consentimiento y campos del ciclo de vida ──────────────────────────

  // CORREGIDO (MEDIO 2, iteración 2): la constancia LFPDPPP solo se graba si
  // el envío afirma consentir, no por la mera presencia del campo.
  it("un consentimiento vacío o negativo no crea ficha ni constancia", async () => {
    for (const [valor, whatsapp] of [
      ["", "7719992070"],
      ["false", "7719992071"],
      ["no", "7719992072"],
      ["off", "7719992073"],
      ["0", "7719992074"],
    ] as const) {
      const resultado = await procesar(envio({ whatsapp, consentimiento: valor }));

      expect(resultado.exito, `consentimiento=${JSON.stringify(valor)}`).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.consentimiento).toBe(
        MENSAJES_ERROR_REGISTRO.consentimiento,
      );
      expect(await buscar(whatsapp)).toBeNull();
      reiniciarLimitePorIp();
    }
  });

  // ── 6b. La versión del aviso consentido (T-012) ───────────────────────────
  //
  // El campo oculto de la versión es entrada del cliente como cualquier otra:
  // lo peor que puede conseguir quien lo manipule es que se le vuelva a pedir
  // la casilla. Nunca puede sellar una constancia con la versión que él diga,
  // ni saltarse el checkbox, ni pisar la constancia de una ficha ajena.
  it("ninguna versión hostil consigue guardar una constancia con esa versión", async () => {
    const hostiles = [
      "0",
      "99",
      "1.0",
      "1; DROP TABLE Negocio",
      '<script>alert("v")</script>',
      "1,1",
      "1".repeat(500),
      "١", // dígito uno en árabe-índigo: no es la cadena "1"
    ];
    let sufijo = 80;
    for (const version of hostiles) {
      const whatsapp = `77199920${sufijo}`;
      sufijo += 1;
      const resultado = await procesar(
        envio({ whatsapp, [CAMPO_VERSION_AVISO]: version }),
      );

      expect(resultado.exito, `versión=${JSON.stringify(version)}`).toBe(false);
      if (!resultado.exito) {
        expect(resultado.estado.errores.consentimiento).toBe(
          MENSAJES_ERROR_REGISTRO.avisoDesfasado,
        );
      }
      expect(await buscar(whatsapp), `versión=${JSON.stringify(version)}`).toBeNull();
      reiniciarLimitePorIp();
    }
    // Los espacios alrededor sí se toleran, como en cualquier otro campo del
    // formulario (`leerEnvioRegistro` recorta): eso no permite sellar otra
    // versión, solo evita que un espacio de más rechace un envío legítimo.
    const conEspacios = await procesar(
      envio({ whatsapp: "7719992099", [CAMPO_VERSION_AVISO]: `  ${VERSION_AVISO}  ` }),
    );
    expect(conEspacios.exito).toBe(true);
    expect((await buscar("7719992099"))?.consintioAvisoVersion).toBe(VERSION_AVISO);

    // Y ninguna de esas cadenas quedó guardada en ninguna ficha.
    const versiones = await prisma.negocio.findMany({
      where: { whatsapp: { startsWith: "771999" } },
      select: { consintioAvisoVersion: true, reconsintioAvisoVersion: true },
    });
    for (const fila of versiones) {
      expect([VERSION_AVISO, null]).toContain(fila.consintioAvisoVersion);
      expect([VERSION_AVISO, null]).toContain(fila.reconsintioAvisoVersion);
    }
  });

  it("mandar el campo de versión repetido no cuela la segunda copia", async () => {
    // `FormData` admite claves repetidas; el servidor lee la primera. Aquí la
    // primera es basura, así que el envío tiene que rebotar: no vale mandar
    // una buena al final para que "gane".
    const formData = envio({ whatsapp: "7719992090" });
    formData.delete(CAMPO_VERSION_AVISO);
    formData.append(CAMPO_VERSION_AVISO, "99");
    formData.append(CAMPO_VERSION_AVISO, VERSION_AVISO);

    const resultado = await procesar(formData);

    expect(resultado.exito).toBe(false);
    expect(await buscar("7719992090")).toBeNull();
  });

  it("una versión válida no exime de marcar la casilla", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719992091", consentimiento: "" }),
    );

    expect(resultado.exito).toBe(false);
    if (!resultado.exito) {
      expect(resultado.estado.errores.consentimiento).toBe(
        MENSAJES_ERROR_REGISTRO.consentimiento,
      );
    }
    expect(await buscar("7719992091")).toBeNull();
  });

  it("el campo de versión no viaja de vuelta al formulario ni al log", async () => {
    const avisos: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) =>
      avisos.push(args.join(" ")),
    );

    const resultado = await procesar(
      envio({ whatsapp: "7719992092", [CAMPO_VERSION_AVISO]: "version-inventada-99" }),
    );

    expect(JSON.stringify(resultado)).not.toContain("version-inventada-99");
    expect(avisos.join("\n")).not.toContain("version-inventada-99");
  });

  it("el checkbox marcado por el navegador (valor 'on') sí consiente", async () => {
    const resultado = await procesar(envio({ whatsapp: "7719992075" }));

    expect(resultado.exito).toBe(true);
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992075" },
    });
    expect(creado.consintioAvisoEn).toBeInstanceOf(Date);
  });

  it("ignora también fotoClave, latitud, longitud, registradoEn y giros mandados por el cliente", async () => {
    await procesar(
      envio({
        whatsapp: "7719992073",
        fotoClave: "clave-inventada-por-el-cliente",
        fotoUrl: "javascript:alert(1)",
        latitud: "19.83",
        longitud: "-98.97",
        registradoEn: "1999-01-01T00:00:00.000Z",
        giros: "1",
        estado: "publicado",
      }),
    );

    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992073" },
      include: { giros: true },
    });
    expect(creado.fotoClave).toBeNull();
    expect(creado.latitud).toBeNull();
    expect(creado.longitud).toBeNull();
    expect(creado.giros).toHaveLength(0);
    expect(creado.estado).toBe("en_revision");
    expect(creado.registradoEn.getFullYear()).toBeGreaterThan(2020);
  });

  // ── 7. Transiciones ilegales de estado desde el formulario público ────────

  it.each(["en_revision", "publicado"])(
    "un número con ficha en estado %s no se puede volver a registrar ni se altera",
    async (estado) => {
      const whatsapp = estado === "en_revision" ? "7719992080" : "7719992081";
      await prisma.negocio.create({
        data: {
          nombre: "Ficha Ficticia Previa",
          categoriaId,
          whatsapp,
          consintioAvisoEn: new Date(),
          estado,
          ...(estado === "publicado" ? { publicadoEn: new Date("2026-01-01") } : {}),
        },
      });

      const resultado = await procesar(
        envio({ nombre: "Intento Ficticio de Relanzamiento", whatsapp }),
      );

      expect(resultado.exito).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.whatsapp).toBe(
        MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
      );
      const intacto = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
      expect(intacto.estado).toBe(estado);
      expect(intacto.nombre).toBe("Ficha Ficticia Previa");
      expect(await prisma.negocio.count({ where: { whatsapp } })).toBe(1);
    },
  );

  // MODIFICADO por el change agregar-panel-admin: una ficha `rechazado` SÍ se
  // puede corregir y volver a enviar (PRD §6.3, spec registro-negocio). Lo que
  // sigue prohibido es que ese reenvío ascienda la ficha: nada de publicarse
  // solo, ni de cambiarse el origen, los giros o el token de gestión.
  it("un reenvío sobre una ficha rechazada la regresa a revisión, nunca la publica", async () => {
    const whatsapp = "7719992082";
    const giro = await prisma.giro.findFirstOrThrow({ orderBy: { id: "asc" } });
    const previa = await prisma.negocio.create({
      data: {
        nombre: "Ficha Ficticia Previa",
        categoriaId,
        whatsapp,
        consintioAvisoEn: new Date(),
        estado: "rechazado",
        origen: "siembra",
        tokenGestionHash: "token-ficticio-adversarial",
        rechazadoEn: new Date("2026-01-02"),
        motivoRechazo: "Motivo ficticio del rechazo",
        giros: { connect: [{ id: giro.id }] },
      },
    });

    const resultado = await procesar(
      envio({
        nombre: "Intento Ficticio de Relanzamiento",
        whatsapp,
        estado: "publicado",
        origen: "organico",
        publicadoEn: "2026-01-01T00:00:00.000Z",
        tokenGestionHash: "token-inventado-por-el-cliente",
        giros: String(giro.id),
      }),
    );

    expect(resultado.exito).toBe(true);
    const despues = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp },
      include: { giros: true },
    });
    expect(despues.id).toBe(previa.id);
    expect(despues.estado).toBe("en_revision");
    expect(despues.publicadoEn).toBeNull();
    expect(despues.origen).toBe("siembra");
    expect(despues.tokenGestionHash).toBe("token-ficticio-adversarial");
    expect(despues.giros.map((g) => g.id)).toEqual([giro.id]);
    expect(despues.rechazadoEn).toBeNull();
    expect(despues.motivoRechazo).toBeNull();
    expect(await prisma.negocio.count({ where: { whatsapp } })).toBe(1);
  });

  // ── 8. Carrera real contra la constraint de unicidad ──────────────────────

  it("dos envíos simultáneos del mismo número dejan una sola ficha y ningún error técnico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultados = await Promise.all([
      procesar(envio({ whatsapp: "7719992090" })),
      procesar(envio({ nombre: "Gemelo Ficticio", whatsapp: "+52 771 999 2090" })),
    ]);

    expect(resultados.filter((r) => r.exito)).toHaveLength(1);
    const fallido = resultados.find((r) => !r.exito);
    expect(fallido && !fallido.exito && fallido.estado.errores.whatsapp).toBe(
      MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
    );
    expect(await prisma.negocio.count({ where: { whatsapp: "7719992090" } })).toBe(1);
  });

  // ── 9. Mensajes de error sin detalle interno ──────────────────────────────

  it("si falla la lectura de los catálogos, el usuario ve el mensaje genérico y el log no lleva datos", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const conFalla: ClienteRegistro = {
      categoria: {
        findMany: async () => {
          throw new Error(
            'connect ECONNREFUSED 10.0.0.7:5432 (database "necesitouno_interna")',
          );
        },
      },
      colonia: prisma.colonia,
      negocio: prisma.negocio,
    };

    const resultado = await procesarRegistro(envio({ whatsapp: "7719992100" }), {
      prisma: conFalla,
      ip: IP,
    });

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.servidor);
    const logueado = error.mock.calls.flat().join(" ");
    expect(logueado).not.toMatch(/ECONNREFUSED|10\.0\.0\.7|necesitouno_interna|7719992100|Adversaria/);
    expect(await buscar("7719992100")).toBeNull();
  });

  // ── 10. Colonia: casos borde de la lista cerrada ──────────────────────────

  it.each(["OTRA", "Otra", " otra ", "otra​"])(
    "el centinela de colonia %j no se acepta con otra forma (solo el literal 'otra')",
    async (coloniaId) => {
      const resultado = await procesar(
        envio({ whatsapp: "7719992110", coloniaId, coloniaOtra: "Colonia Ficticia" }),
      );

      // " otra " sí pasa (se recorta); las demás formas deben caer en la lista
      // cerrada y rechazarse sin crear nada.
      if (coloniaId.trim() === "otra") {
        expect(resultado.exito).toBe(true);
        await limpiar();
        return;
      }
      expect(resultado.exito).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.coloniaId).toBe(MENSAJES_ERROR_REGISTRO.coloniaId);
      expect(await buscar("7719992110")).toBeNull();
    },
  );

  // CORREGIDO (nota menor, iteración 2): la consulta usa `Object.hasOwn`.
  it("el mapa de ejemplos no responde a claves heredadas de Object", () => {
    expect(ejemploQueOfreces("constructor")).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
    expect(ejemploQueOfreces("toString")).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
    expect(ejemploQueOfreces("no-existe")).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
  });

  it("CARACTERIZACIÓN: un id de catálogo con ceros a la izquierda se acepta como el mismo id", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719992111", coloniaId: `000${coloniaId}` }),
    );

    expect(resultado.exito).toBe(true);
    const creado = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992111" },
    });
    expect(creado.coloniaId).toBe(coloniaId);
  });

  // ── 11. Verificación independiente de las correcciones de la iteración 2 ──
  //
  // Los tests de arriba que el dev actualizó comprueban que su corrección hace
  // lo que dice. Estos atacan la corrección nueva buscando el siguiente hueco.

  it("el encabezado configurado es el único que se lee: los demás no se miran", () => {
    const mixtos = new Headers({
      "x-forwarded-for": "10.0.0.1",
      "x-real-ip": "10.0.0.2",
      "cf-connecting-ip": "203.0.113.55",
    });

    expect(ipDeEncabezados(mixtos, "cf-connecting-ip")).toBe("203.0.113.55");
    expect(ipDeEncabezados(new Headers({ "x-forwarded-for": "10.0.0.1" }), "cf-connecting-ip")).toBeNull();
    // El nombre se compara sin distinguir mayúsculas ni espacios sobrantes.
    expect(ipDeEncabezados(mixtos, " X-Forwarded-For ")).toBe("10.0.0.1");
  });

  it.each([
    ["texto arbitrario", "unknown"],
    ["clave gigante", "a".repeat(5000)],
    ["octeto fuera de rango", "999.999.999.999"],
    ["intento de inyección", "203.0.113.9); DROP TABLE"],
    ["cadena vacía tras la coma", "203.0.113.9,"],
  ])(
    "un %s en el encabezado de confianza no se convierte en clave del cupo",
    (_caso, valor) => {
      expect(
        ipDeEncabezados(new Headers({ "x-forwarded-for": valor }), "x-forwarded-for"),
      ).toBeNull();
    },
  );

  it("con el encabezado configurado, quien antepone IPs falsas no escapa del cupo", async () => {
    // El atacante controla todo menos el último salto (que pone el proxy):
    // los cuatro envíos caen en la misma clave y el cuarto se rechaza.
    const comoProxy = (falsa: string) =>
      ipDeEncabezados(
        new Headers({ "x-forwarded-for": `${falsa}, 203.0.113.200` }),
        "x-forwarded-for",
      );

    const resultados = [];
    for (const falsa of ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"]) {
      resultados.push(
        await procesar(envio({ whatsapp: `77199921${resultados.length}0` }), {
          ip: comoProxy(falsa),
        }),
      );
    }

    expect(resultados.slice(0, 3).every((r) => r.exito)).toBe(true);
    const cuarto = resultados[3];
    expect(cuarto.exito).toBe(false);
    if (cuarto.exito) return;
    expect(cuarto.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.limiteIp);
    expect(tamanoLimitePorIp()).toBe(1);
  });

  it("RIESGO RESIDUAL: con dos saltos de confianza todos los visitantes comparten una sola clave", () => {
    // Si el hosting encadena CDN → balanceador → app, el último valor es el del
    // salto interno, igual para todo el mundo: el cupo de 3/hora dejaría de ser
    // por visitante y podría cerrar el registro a todos. Verificar el encabezado
    // correcto (y que dé IPs distintas por cliente) es parte de E0-3.
    const conDosSaltos = (cliente: string) =>
      ipDeEncabezados(
        new Headers({ "x-forwarded-for": `${cliente}, 198.51.100.8, 10.0.0.7` }),
        "x-forwarded-for",
      );

    expect(conDosSaltos("203.0.113.1")).toBe("10.0.0.7");
    expect(conDosSaltos("203.0.113.2")).toBe("10.0.0.7");
  });

  it("el eco truncado no revienta con pares subrogados ni pierde el mensaje de error", async () => {
    const resultado = await procesar(
      envio({ whatsapp: "7719992120", queOfreces: "🌮".repeat(50_000) }),
    );

    expect(resultado.exito).toBe(false);
    if (resultado.exito) return;
    expect(resultado.estado.errores.queOfreces).toBe(MENSAJES_ERROR_REGISTRO.queOfreces);
    expect(resultado.estado.valores.queOfreces).toHaveLength(
      LIMITES_LONGITUD.queOfreces,
    );
    // El eco se vuelve a pintar: debe seguir siendo serializable y escapable.
    expect(() => JSON.stringify(resultado.estado.valores)).not.toThrow();
  });

  it("el checkbox de entregas también exige un valor afirmativo", async () => {
    await procesar(envio({ whatsapp: "7719992121", entregaADomicilio: "false" }));
    const sinEntrega = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992121" },
    });
    expect(sinEntrega.entregaADomicilio).toBe(false);

    reiniciarLimitePorIp();
    await procesar(envio({ whatsapp: "7719992122", entregaADomicilio: "on" }));
    const conEntrega = await prisma.negocio.findUniqueOrThrow({
      where: { whatsapp: "7719992122" },
    });
    expect(conEntrega.entregaADomicilio).toBe(true);
  });

  it("la normalización de la URL no reintroduce esquemas ni credenciales", async () => {
    // `url.href` de una URL http(s) sin userinfo no puede volver a ser
    // `javascript:` ni llevar contraseña: se comprueba sobre lo persistido.
    for (const [whatsapp, entrada] of [
      ["7719992130", "https://facebook.com/mi negocio"],
      ["7719992131", "HTTPS://FACEBOOK.COM/MiNegocio"],
      ["7719992132", "https://m.facebook.com/perfil?ref=1#top"],
    ] as const) {
      await procesar(envio({ whatsapp, facebookUrl: entrada }));
      const creado = await prisma.negocio.findUniqueOrThrow({ where: { whatsapp } });
      expect(creado.facebookUrl).toMatch(/^https?:\/\//);
      expect(creado.facebookUrl).not.toMatch(/@|javascript:|\s/);
      reiniciarLimitePorIp();
    }
  });
});
