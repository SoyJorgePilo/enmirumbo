import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  cabecerasDeSeguridad,
  ORIGEN_ENVIO_ANALITICA,
  ORIGEN_SCRIPT_ANALITICA,
  POLITICA_DE_REFERENTE,
  politicaDeSeguridadDeContenido,
} from "../src/lib/seguridad/csp";

/**
 * Spec `despliegue` (change `preparar-deploy-produccion`, tasks #9, #12 y #15).
 *
 * La red que sostiene `docs/despliegue.md`: la prosa se pudre, así que aquí se
 * ata a lo que el código hace de verdad. Si alguien agrega una variable de
 * entorno y no la documenta, esta suite lo dice; si alguien agrega una página
 * que lee la base sin rendirse por petición, también.
 */

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const documento = readFileSync(path.join(raiz, "docs/despliegue.md"), "utf8");

// ── 1. Ninguna variable de entorno sin documentar ───────────────────────────

/**
 * Variables que pone la PLATAFORMA y que nadie configura a mano. Es una lista
 * corta y explícita a propósito: cualquier otra cosa que el código lea del
 * entorno es configuración, y la configuración se documenta.
 */
const LAS_PONE_LA_PLATAFORMA = new Set(["NODE_ENV", "VERCEL_ENV"]);

function archivosDeCodigo(): string[] {
  const encontrados: string[] = [];
  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completo = path.join(directorio, entrada.name);
      // El cliente de Prisma es generado: no es código que escribamos.
      if (entrada.isDirectory()) {
        if (entrada.name !== "generated") recorrer(completo);
      } else if (/\.(ts|tsx|mts)$/.test(entrada.name)) {
        encontrados.push(completo);
      }
    }
  };
  recorrer(path.join(raiz, "src"));
  recorrer(path.join(raiz, "prisma"));
  return [
    ...encontrados,
    path.join(raiz, "next.config.ts"),
    path.join(raiz, "prisma7.config.ts"),
  ];
}

/**
 * Los nombres de variables de entorno que el código lee, con el archivo donde
 * aparecen. Se reconocen de cuatro formas, que son las cuatro que el proyecto
 * usa:
 *
 *   process.env.NOMBRE           lectura directa
 *   process.env["NOMBRE"]        lectura directa con corchetes
 *   const VARIABLE_X = "NOMBRE"  la convención del repo para nombrarlas
 *   env.NOMBRE / entorno.NOMBRE  los módulos que reciben el entorno por parámetro
 */
function variablesQueLeeElCodigo(): Map<string, string[]> {
  const patrones = [
    /process\.env\.([A-Z][A-Z0-9_]*[A-Z0-9])/g,
    /process\.env\[\s*"([A-Z][A-Z0-9_]*[A-Z0-9])"\s*\]/g,
    /const\s+VARIABLE_[A-Z0-9_]+\s*(?::[^=]+)?=\s*"([A-Z][A-Z0-9_]*[A-Z0-9])"/g,
    /\b(?:env|entorno)\.([A-Z][A-Z0-9_]*[A-Z0-9])/g,
  ];
  const encontradas = new Map<string, string[]>();
  for (const archivo of archivosDeCodigo()) {
    const contenido = readFileSync(archivo, "utf8");
    for (const patron of patrones) {
      for (const coincidencia of contenido.matchAll(patron)) {
        const nombre = coincidencia[1];
        const donde = path.relative(raiz, archivo);
        const lista = encontradas.get(nombre) ?? [];
        if (!lista.includes(donde)) lista.push(donde);
        encontradas.set(nombre, lista);
      }
    }
  }
  return encontradas;
}

describe("despliegue · el documento no se desactualiza en silencio", () => {
  // Scenario: una variable nueva sin documentar
  it("toda variable de entorno que el código lee está en docs/despliegue.md", () => {
    const sinDocumentar: string[] = [];
    for (const [nombre, archivos] of variablesQueLeeElCodigo()) {
      if (LAS_PONE_LA_PLATAFORMA.has(nombre)) continue;
      if (!documento.includes(nombre)) {
        sinDocumentar.push(`${nombre} (en ${archivos.join(", ")})`);
      }
    }
    expect(
      sinDocumentar,
      `estas variables se leen en el código y no están en docs/despliegue.md:\n  ${sinDocumentar.join("\n  ")}`,
    ).toEqual([]);
  });

  it("el barrido encuentra de verdad las variables que ya conocemos", () => {
    // Sin esta comprobación, un error en las expresiones de arriba dejaría el
    // barrido buscando en el vacío y la suite en verde sin cubrir nada.
    const nombres = [...variablesQueLeeElCodigo().keys()];
    for (const conocida of [
      "DATABASE_URL",
      "SITIO_URL",
      "PANEL_CONTRASENA",
      "PANEL_SESION_SECRETO",
      "REGISTRO_ENCABEZADO_IP",
      "CRON_SECRET",
      "FOTOS_DIR",
      "NEXT_PUBLIC_UMAMI_SRC",
    ]) {
      expect(nombres, conocida).toContain(conocida);
    }
  });

  it("las que pone la plataforma también se explican, aunque no se configuren", () => {
    for (const nombre of LAS_PONE_LA_PLATAFORMA) {
      expect(documento, nombre).toContain(nombre);
    }
  });

  // Scenario: el encabezado de IP tiene un valor exacto, no un "depende"
  it("el encabezado de IP trae su valor literal para Vercel y su advertencia", () => {
    expect(documento).toContain("`x-forwarded-for`");
    const parrafo = documento
      .split("\n")
      .find((linea) => linea.includes("REGISTRO_ENCABEZADO_IP") && linea.includes("x-forwarded-for"));
    expect(parrafo, "la fila de REGISTRO_ENCABEZADO_IP").toBeDefined();
    expect(parrafo!.toLowerCase()).toContain("no operan");
  });

  // Scenario: el humano despliega siguiendo el documento
  it("el documento trae las cinco partes que la spec exige", () => {
    for (const seccion of [
      "## 3. Variables de entorno",
      "## 4. Orden de operaciones",
      "## 1. Antes de tocar nada",
      "## 5. Lo que NUNCA se corre contra producción",
      "## 9. Prueba de humo",
    ]) {
      expect(documento, seccion).toContain(seccion);
    }
    // El orden de operaciones, con sus cuatro pasos nombrados.
    const orden = documento.slice(documento.indexOf("## 4. Orden de operaciones"));
    for (const paso of ["migrate deploy", "db:seed", "Despliega", "Verifica"]) {
      expect(orden, paso).toContain(paso);
    }
  });

  // Scenario: variables de tickets pendientes (y, desde la iteración 2, de lo
  // que este change acabó implementando: ver la enmienda de la spec).
  it("la decisión sobre las fotos está escrita, con sus variables y sus pasos", () => {
    expect(documento).toContain("Supabase Storage");
    expect(documento).toContain("ADR-006");
    // Las tres variables que hay que configurar, no una nota de "ya se verá".
    for (const variable of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_BUCKET_FOTOS",
    ]) {
      expect(documento, variable).toContain(variable);
    }
    // Y el paso humano que ninguna variable resuelve: el bucket va PRIVADO.
    expect(documento).toMatch(/bucket \*\*privado\*\*|\*\*privado\*\* \(la casilla/);
  });

  it("el documento no trae ningún secreto de verdad", () => {
    // Repo público: lo que aparezca aquí lo lee cualquiera.
    for (const sospechoso of [
      /postgresql:\/\/postgres:(?!CLAVE|postgres@localhost|postgres@127)/,
      /eyJ[A-Za-z0-9_-]{20,}/, // un JWT de Supabase
      /sk_live_/,
    ]) {
      expect(documento, String(sospechoso)).not.toMatch(sospechoso);
    }
  });
});

// ── 2. El build no toca la base de datos ────────────────────────────────────

/**
 * Rutas de `src/app` que consultan la base, directa o indirectamente, y que por
 * lo tanto tienen que rendirse por petición.
 *
 * El rastro se sigue por importaciones: una página que importa (aunque sea a
 * través de dos módulos) algo que llama a `obtenerPrisma()` lee la base.
 */
const IMPORTA = /from\s+"([^"]+)"/g;

function resolverImportacion(desde: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(raiz, "src", especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(desde), especificador);
  else return null;

  for (const candidato of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    try {
      readFileSync(candidato, "utf8");
      return candidato;
    } catch {
      // Sigue con el siguiente candidato.
    }
  }
  return null;
}

/** ¿Este archivo, o algo de lo que importa, contiene algo así? */
function usaAlgoComo(
  archivo: string,
  patron: RegExp,
  vistos = new Set<string>(),
): boolean {
  if (vistos.has(archivo)) return false;
  vistos.add(archivo);
  let contenido: string;
  try {
    contenido = readFileSync(archivo, "utf8");
  } catch {
    return false;
  }
  if (patron.test(contenido)) return true;
  for (const coincidencia of contenido.matchAll(IMPORTA)) {
    const destino = resolverImportacion(archivo, coincidencia[1]);
    if (
      destino &&
      destino.includes(`${path.sep}src${path.sep}`) &&
      usaAlgoComo(destino, patron, vistos)
    ) {
      return true;
    }
  }
  return false;
}

/** ¿Esta ruta, o algo de lo que importa, abre la base? */
const leeLaBase = (archivo: string) => usaAlgoComo(archivo, /\bobtenerPrisma\s*\(/);

/**
 * ¿Esta ruta usa alguna API que obliga a renderizarla por petición?
 *
 * Es la regla de Next: leer la cookie de sesión, los encabezados o la cadena
 * de consulta hace que la página no se pueda prerenderizar. Vale tanto como un
 * `force-dynamic` explícito, y así es como el panel y `/buscar` se rinden por
 * petición sin declararlo.
 */
const usaApiDinamica = (archivo: string) =>
  usaAlgoComo(archivo, /\b(?:cookies|headers|connection|draftMode)\s*\(\s*\)/) ||
  /\bsearchParams\b/.test(readFileSync(archivo, "utf8"));

function rutasDeLaApp(): string[] {
  const encontradas: string[] = [];
  const recorrer = (directorio: string) => {
    for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
      const completo = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) recorrer(completo);
      else if (/^(page|route|sitemap|robots|opengraph-image)\.(ts|tsx)$/.test(entrada.name)) {
        encontradas.push(completo);
      }
    }
  };
  recorrer(path.join(raiz, "src/app"));
  return encontradas;
}

describe("despliegue · el build de producción no necesita la base", () => {
  // Scenario: una ruta nueva que lee la base al construir
  it("toda ruta que consulta la base se rinde por petición", () => {
    const culpables: string[] = [];
    for (const ruta of rutasDeLaApp()) {
      if (!leeLaBase(ruta)) continue;
      const contenido = readFileSync(ruta, "utf8");
      const dinamica =
        /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(contenido) ||
        // Una ruta con parámetros y sin `generateStaticParams` se rinde por
        // petición por construcción: no hay nada que prerenderizar.
        (/\[[^\]]+\]/.test(ruta) && !/generateStaticParams/.test(contenido)) ||
        usaApiDinamica(ruta);
      if (!dinamica) culpables.push(path.relative(raiz, ruta));
    }
    expect(
      culpables,
      `estas rutas leen la base y podrían intentar prerenderizarse:\n  ${culpables.join("\n  ")}`,
    ).toEqual([]);
  });

  it("el barrido reconoce de verdad las rutas que leen la base", () => {
    // Guardián del guardián: si el rastreo de importaciones se rompiera, el
    // test de arriba pasaría en verde sin mirar nada.
    const queLeen = rutasDeLaApp().filter((ruta) => leeLaBase(ruta));
    expect(queLeen.length).toBeGreaterThan(5);
    expect(queLeen.map((ruta) => path.relative(raiz, ruta))).toContain(
      path.join("src", "app", "sitemap.ts"),
    );
  });
});

// ── 3. Las tareas programadas están declaradas ──────────────────────────────

describe("despliegue · las tareas programadas están declaradas", () => {
  const vercel = JSON.parse(readFileSync(path.join(raiz, "vercel.json"), "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };

  // Scenario: programación declarada
  it("la purga y el barrido de fotos corren al menos una vez al día", () => {
    const rutas = ["/api/tareas/purgar-rechazados", "/api/tareas/barrer-fotos-huerfanas"];
    for (const ruta of rutas) {
      const tarea = vercel.crons?.find((cron) => cron.path === ruta);
      expect(tarea, `falta el cron de ${ruta}`).toBeDefined();
      // `m h * * *` = todos los días. Lo que se exige es la frecuencia diaria.
      expect(tarea!.schedule, ruta).toMatch(/^\S+\s+\S+\s+\*\s+\*\s+\*$/);
    }
  });

  it("cada ruta declarada en vercel.json existe de verdad", () => {
    for (const cron of vercel.crons ?? []) {
      const archivo = path.join(raiz, "src/app", cron.path, "route.ts");
      expect(() => readFileSync(archivo, "utf8"), cron.path).not.toThrow();
    }
  });

  it("el documento explica cómo dispararlas desde otro programador de tareas", () => {
    const seccion = documento.slice(documento.indexOf("## 6. Tareas programadas"));
    expect(seccion).toContain("curl");
    expect(seccion).toContain("Authorization: Bearer");
    expect(seccion).toContain("CRON_SECRET");
  });

  /**
   * Change `agregar-aviso-diario-pendientes` · spec `despliegue`, scenario "la
   * hora a la que llega el correo". La purga se movió de 09:17 a 13:17 UTC
   * porque encima viaja el aviso diario: un correo que llega a las tres de la
   * mañana se lee cuando ya se perdió media jornada.
   */
  it("la tarea que lleva el aviso corre a las 13:17 UTC, ~07:17 en Tizayuca", () => {
    const purga = vercel.crons?.find((cron) => cron.path === "/api/tareas/purgar-rechazados");
    expect(purga!.schedule).toBe("17 13 * * *");
    // Y el barrido de fotos se quedó donde estaba: no se tocó lo que no había
    // por qué tocar.
    const barrido = vercel.crons?.find(
      (cron) => cron.path === "/api/tareas/barrer-fotos-huerfanas",
    );
    expect(barrido!.schedule).toBe("47 9 * * *");
    // El plan Hobby admite dos tareas diarias, y siguen siendo dos.
    expect(vercel.crons).toHaveLength(2);
  });

  it("el documento dice a qué hora sale el correo y por qué a esa", () => {
    const seccion = documento.slice(documento.indexOf("## 6. Tareas programadas"));
    expect(seccion).toContain("13:17 UTC");
    expect(seccion).toContain("07:17");
    expect(seccion.toLowerCase()).toContain("aviso");
  });
});

// ── 3-bis. El aviso diario de pendientes (T-020) ───────────────────────────

describe("despliegue · el aviso diario de pendientes está documentado", () => {
  // Scenario: las variables nuevas están documentadas
  it("las tres variables del correo salen en el documento con su descripción", () => {
    const opcionales = documento.slice(
      documento.indexOf("### 3.2 Opcionales"),
      documento.indexOf("### 3.3"),
    );
    for (const variable of [
      "RESEND_API_KEY",
      "AVISOS_CORREO_REMITENTE",
      "AVISOS_CORREO_DESTINO",
    ]) {
      expect(opcionales, variable).toContain(variable);
    }
    // Y qué pasa sin ellas, que es lo que un operador necesita saber.
    expect(opcionales.toLowerCase()).toContain("no se manda");
  });

  // Scenario: el buzón del directorio no vive en el repositorio
  it("ninguna dirección de correo de verdad quedó en el repo", () => {
    const sospechosas =
      /[a-z0-9._%+-]+@(?!ejemplo\.invalid|enmirumbo\.com|TU-DOMINIO|dominio)[a-z0-9.-]+\.[a-z]{2,}/gi;
    const revisar = [
      ...archivosDeCodigo(),
      path.join(raiz, ".env.example"),
      path.join(raiz, "tests/aviso-pendientes.test.ts"),
      path.join(raiz, "tests/aviso-pendientes-tarea.test.ts"),
    ];
    const encontradas: string[] = [];
    for (const archivo of revisar) {
      const contenido = readFileSync(archivo, "utf8");
      for (const coincidencia of contenido.matchAll(sospechosas)) {
        // `.invalid` y `.example` están reservados por el RFC 2606: no son de
        // nadie y no pueden serlo. Las de ejemplo del proveedor, tampoco.
        // Cualquier otra sí lo parece y hay que mirarla.
        if (/\.(invalid|example)\b|resend\.dev|acme/i.test(coincidencia[0])) continue;
        encontradas.push(`${coincidencia[0]} (${path.relative(raiz, archivo)})`);
      }
    }
    expect(
      encontradas,
      `esto parece una dirección de correo real en un repo público:\n  ${encontradas.join("\n  ")}`,
    ).toEqual([]);
  });

  it("el aviso viaja encima de una tarea que ya existía, sin cron nuevo", () => {
    const ruta = readFileSync(
      path.join(raiz, "src/app/api/tareas/purgar-rechazados/route.ts"),
      "utf8",
    );
    expect(ruta).toContain("avisarPendientes");
    // Sin ruta propia: el plan del hosting no da para una tercera tarea.
    expect(() =>
      readFileSync(path.join(raiz, "src/app/api/tareas/avisar-pendientes/route.ts"), "utf8"),
    ).toThrow();
  });
});

// ── 4. Content-Security-Policy ──────────────────────────────────────────────

describe("despliegue · la CSP acota de dónde sale el JavaScript y a dónde va", () => {
  const politica = politicaDeSeguridadDeContenido();
  const directiva = (nombre: string) =>
    politica
      .split(";")
      .map((parte) => parte.trim())
      .find((parte) => parte === nombre || parte.startsWith(`${nombre} `)) ?? "";

  it("permite el script del proveedor de analítica y los envíos a su gateway", () => {
    // Son DOS dominios distintos: con uno solo la medición se rompe en
    // silencio (el script carga y ningún evento llega).
    expect(ORIGEN_SCRIPT_ANALITICA).toBe("https://cloud.umami.is");
    expect(ORIGEN_ENVIO_ANALITICA).toBe("https://gateway.umami.is");
    expect(directiva("script-src")).toContain(ORIGEN_SCRIPT_ANALITICA);
    expect(directiva("connect-src")).toContain(ORIGEN_ENVIO_ANALITICA);
  });

  it("no deja hueco para ningún otro origen de scripts", () => {
    const origenes = directiva("script-src")
      .split(/\s+/)
      .slice(1)
      .filter((valor) => valor.startsWith("http"));
    expect(origenes).toEqual([ORIGEN_SCRIPT_ANALITICA]);
    expect(directiva("script-src")).not.toContain("*");
    expect(directiva("default-src")).toBe("default-src 'self'");
  });

  it("cierra el clickjacking, los plugins y el secuestro de formularios", () => {
    expect(directiva("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directiva("object-src")).toBe("object-src 'none'");
    expect(directiva("form-action")).toBe("form-action 'self'");
    expect(directiva("base-uri")).toBe("base-uri 'self'");
    expect(politica).toContain("upgrade-insecure-requests");
  });

  it("el documento trae la política escrita y cómo verificarla contra el sitio", () => {
    const seccion = documento.slice(documento.indexOf("## 8. Analítica"));
    expect(seccion).toContain("cloud.umami.is");
    expect(seccion).toContain("gateway.umami.is");
    expect(seccion).toContain("content-security-policy");
  });
});

// ── 5. Las cabeceras de seguridad globales ─────────────────────────────────

describe("despliegue · toda respuesta lleva las cabeceras de seguridad", () => {
  /**
   * Se comprueba el MECANISMO REAL —lo que `next.config.ts` le entrega a Next,
   * no una copia— y se completa con la medición contra el sitio servido, que
   * está en `reports/b-dev.md`. Una suite no puede levantar `next start`, pero
   * sí puede impedir que alguien borre una cabecera sin enterarse.
   */
  it("la configuración de Next aplica las cuatro a todas las rutas", async () => {
    const { default: configuracion } = (await import("../next.config")) as {
      default: {
        poweredByHeader?: boolean;
        headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
      };
    };

    const reglas = await configuracion.headers!();
    expect(reglas).toHaveLength(1);
    // `/:ruta*` cubre TODA ruta, incluida la raíz y las estáticas.
    expect(reglas[0].source).toBe("/:ruta*");

    const puestas = new Map(reglas[0].headers.map((c) => [c.key, c.value]));
    expect(puestas.get("Content-Security-Policy")).toBe(politicaDeSeguridadDeContenido());
    expect(puestas.get("X-Content-Type-Options")).toBe("nosniff");
    expect(puestas.get("X-Frame-Options")).toBe("DENY");
    expect(puestas.get("Referrer-Policy")).toBe(POLITICA_DE_REFERENTE);
  });

  it("no se anuncia el marco de trabajo en cada respuesta", async () => {
    const { default: configuracion } = (await import("../next.config")) as {
      default: { poweredByHeader?: boolean };
    };
    expect(configuracion.poweredByHeader).toBe(false);
  });

  it("el clickjacking se cierra por partida doble, a propósito", () => {
    // `frame-ancestors` es la moderna; `X-Frame-Options`, la que respetan los
    // navegadores viejos que la ignoran. Si alguien quita una, que sepa que la
    // otra no cubre a todo el mundo.
    const cabeceras = new Map(cabecerasDeSeguridad().map((c) => [c.key, c.value]));
    expect(cabeceras.get("X-Frame-Options")).toBe("DENY");
    expect(politicaDeSeguridadDeContenido()).toContain("frame-ancestors 'none'");
  });

  /**
   * El panel necesita una política de referente MÁS estricta que la global, y
   * la consigue con `<meta name="referrer">`, que manda sobre la cabecera para
   * ese documento. Sin esto, salir del panel hacia una página pública mandaría
   * `/admin/registros/<id>` como referente del mismo origen, y el tracker de
   * la analítica reenvía los referentes del mismo origen (PRD §8, LFPDPPP).
   */
  it("la política del panel sobrevive a la cabecera global", () => {
    const layoutPanel = readFileSync(
      new URL("../src/app/admin/layout.tsx", import.meta.url),
      "utf8",
    );
    expect(layoutPanel).toMatch(/referrer:\s*"strict-origin"/);
    // Y la global es la laxa a propósito: dentro del sitio manda la ruta
    // completa, que es justo lo que el panel no puede permitirse.
    expect(POLITICA_DE_REFERENTE).toBe("strict-origin-when-cross-origin");
    expect(POLITICA_DE_REFERENTE).not.toBe("strict-origin");
  });

  it("el documento explica las cabeceras y qué las manda", () => {
    for (const texto of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "X-Powered-By",
    ]) {
      expect(documento, texto).toContain(texto);
    }
  });
});
