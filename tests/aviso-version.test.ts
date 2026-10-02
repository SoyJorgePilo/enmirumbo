import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AVISO_PRIVACIDAD,
  HAY_PLACEHOLDERS_PENDIENTES,
  TERMINOS,
  TEXTO_MARCA_BORRADOR,
} from "../src/lib/legales/textos";
import {
  PIEZAS_VIGENTES_DEL_AVISO,
  VERSION_AVISO,
  contenidoVersionadoDelAviso,
  versionAvisoEsPosterior,
  type PiezasDelAviso,
} from "../src/lib/legales/version";
import {
  TEXTO_AVISO_PRIVACIDAD,
  TEXTO_CONSENTIMIENTO,
} from "../src/lib/registro/textos";

/**
 * Spec: paginas-legales · requirements "El aviso de privacidad tiene una
 * versión estable declarada en un solo lugar" y "Cambiar el texto del aviso
 * sin subir la versión rompe la verificación" (tasks.md #2 a #5).
 *
 * ESTE ARCHIVO ES EL GUARDIÁN. La tabla `versión → huella` vive aquí, y no
 * junto al texto, a propósito (design.md §4): si viviera en `version.ts`,
 * corregir una coma y "arreglar" la huella serían el mismo gesto distraído.
 * Viviendo aquí, quien cambie el aviso tiene que venir a otro archivo,
 * escribir una versión nueva y anclar su huella; ahí es donde se toma la
 * decisión consciente que el ticket T-012 quiere forzar.
 *
 * SI ESTA SUITE ESTÁ EN ROJO: no toques la huella anclada de una versión ya
 * publicada. Sube `VERSION_AVISO` en `src/lib/legales/version.ts` y agrega un
 * renglón nuevo a `HUELLAS_POR_VERSION` con la huella que imprime el fallo.
 */

/**
 * Huella de cada versión publicada del aviso, en orden. Las de versiones ya
 * publicadas NO se modifican nunca: son la prueba de contra qué texto se
 * firmó cada constancia guardada.
 *
 * ÚNICA excepción, y solo mientras el change que la estrena no se mergea: una
 * versión que todavía no salió a producción no ampara ninguna constancia (la
 * columna `consintioAvisoVersion` ni siquiera existe todavía en la base), así
 * que su huella se puede volver a anclar. Fue el caso de la `1`: T-012 la
 * estrena y, dentro del mismo change, se volvió a anclar tres veces: por la
 * enmienda aprobada del elemento (2) de la LFPDPPP —la foto en la lista de
 * datos opcionales—, por la corrección del hallazgo MEDIO-1 de la etapa C (la
 * marca de borrador entró a la huella) y, al fusionar `main` antes del PR,
 * por la enmienda del PR #12 (la política de fotos en "Qué queda público").
 * Esa tercera vez fue el primer caso REAL del guardián fuera de su propio
 * change: la fusión puso la suite en rojo y obligó a decidir versión, que es
 * exactamente para lo que se construyó. Después del merge a `main`, cambiar
 * el texto es estrenar versión: ya no hay excepción.
 */
const HUELLAS_POR_VERSION: ReadonlyArray<readonly [string, string]> = [
  ["1", "08ce983c2ce4f4733e42aca21cf7c01f75b3a6cc78c72fdb8055c8bc61062d5f"],
  // La `2` la estrena el rebrand a "EnMiRumbo" (T-019): el nombre del sitio
  // dentro del texto publicado y el correo del directorio, que dejó de ser
  // placeholder. Los dos cambios se despliegan juntos, así que una sola
  // versión. El renglón de la `1` NO se tocó, y este es el PRIMER caso en que
  // esa regla se aplica de verdad: su texto ya no se publica, pero sigue
  // amparando las constancias que la citan.
  ["2", "1f3349078d0a1e938d2e46794c67f1fc1a976a85e9e2b5d0eb55ad6e79657ee0"],
];

/**
 * Huella del contenido publicado. El separador es un carácter que no puede
 * aparecer en el texto, para que mover una frase de un bloque a otro no dé la
 * misma huella.
 */
function huellaDeContenido(contenido: readonly string[]): string {
  return createHash("sha256").update(contenido.join("\u0000")).digest("hex");
}

/**
 * El guardián: `null` si versión y texto cuadran, o el mensaje de qué hacer.
 * Es la misma función que corre contra el aviso vigente y contra los dobles
 * de la prueba por mutación: si se probara con una copia, no probaría nada.
 */
function revisarVersionYTexto(
  version: string,
  contenido: readonly string[],
  tabla: ReadonlyArray<readonly [string, string]> = HUELLAS_POR_VERSION,
): string | null {
  const huella = huellaDeContenido(contenido);
  const comoAnclarla = `Ancla en tests/aviso-version.test.ts el renglón ["${version}", "${huella}"].`;

  if (tabla.length === 0) return `La tabla de huellas está vacía. ${comoAnclarla}`;

  const ultima = tabla[tabla.length - 1];
  if (ultima[0] !== version) {
    return `La versión vigente del aviso es "${version}" y la última anclada es "${ultima[0]}": la vigente siempre tiene que ser la última de la tabla. ${comoAnclarla}`;
  }

  if (ultima[1] !== huella) {
    return `El texto del aviso de privacidad cambió sin estrenar versión: la huella de la versión "${version}" ya no es la anclada. Sube VERSION_AVISO en src/lib/legales/version.ts y agrega un renglón nuevo a la tabla (nunca edites el de una versión ya publicada). Huella del texto de hoy: ${huella}`;
  }

  return null;
}

describe("paginas-legales · la versión del aviso vive en un solo lugar", () => {
  // Scenario: la versión de arranque
  it("la versión vigente es una cadena no vacía y hoy vale 2", () => {
    expect(typeof VERSION_AVISO).toBe("string");
    expect(VERSION_AVISO.trim()).not.toBe("");
    // Estrenada por el rebrand a "EnMiRumbo" (T-019), que cambió el nombre del
    // sitio dentro del texto publicado y publicó el correo del directorio.
    expect(VERSION_AVISO).toBe("2");
  });

  // Scenario: una sola fuente de la versión
  //
  // ITERACIÓN 2 (hallazgo MEDIO-2 de `reports/c-seguridad.md`): el patrón se
  // DERIVA de `VERSION_AVISO` en vez de llevar el `1` escrito a mano. Antes,
  // el día que se estrenara la `2` este caso habría seguido buscando
  // "versión 1" —que ya no existiría— y habría pasado siempre, justo en el
  // evento para el que se construyó. Y ahora recorre también `prisma/`, que
  // importa el módulo desde el seed de demostración.
  it("el identificador solo se escribe una vez: nadie lo copia a mano", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const archivos: string[] = [];
    const recorrer = (directorio: string) => {
      for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
        const ruta = join(directorio, entrada.name);
        if (entrada.isDirectory()) {
          // `generated` es el cliente de Prisma; `migrations`, SQL ya aplicado.
          if (entrada.name !== "generated" && entrada.name !== "migrations") {
            recorrer(ruta);
          }
        } else if (/\.tsx?$/.test(entrada.name)) {
          archivos.push(ruta);
        }
      }
    };
    recorrer(join(process.cwd(), "src"));
    recorrer(join(process.cwd(), "prisma"));
    expect(archivos.length).toBeGreaterThan(10);

    // Escapado por si algún día la versión deja de ser un entero desnudo
    // (design.md §1 contempla un "2-legal").
    const escapada = VERSION_AVISO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const versionAMano = new RegExp(`versi[oó]n\\s+${escapada}\\b`, "i");

    for (const ruta of archivos) {
      if (ruta.endsWith(join("legales", "version.ts"))) continue;
      const fuente = readFileSync(ruta, "utf8");
      // Ni la versión escrita a mano en una frase de la interfaz…
      expect(fuente, ruta).not.toMatch(versionAMano);
      // …ni una segunda declaración del literal (`CAMPO_VERSION_AVISO`, que
      // es el nombre del campo oculto del formulario, no cuenta: el `\b` pide
      // que no haya nada de palabra antes de VERSION_AVISO).
      expect(fuente, ruta).not.toMatch(/\bVERSION_AVISO\s*=/);
    }
  });
});

// ITERACIÓN 2 (hallazgos MEDIO-3 y MEDIO-4 de `reports/c-seguridad.md`): la
// reaceptación del reenvío se decide comparando el ORDEN de las versiones, no
// con una desigualdad. Esta es la única pieza del código que sabe ordenarlas.
describe("paginas-legales · comparar dos versiones del aviso", () => {
  it("una versión mayor es posterior a una menor, y nunca al revés", () => {
    expect(versionAvisoEsPosterior("2", "1")).toBe(true);
    expect(versionAvisoEsPosterior("10", "9")).toBe(true); // ordena por número
    expect(versionAvisoEsPosterior("1", "2")).toBe(false); // rollback
    expect(versionAvisoEsPosterior("9", "10")).toBe(false);
  });

  it("la misma versión no es posterior a sí misma", () => {
    expect(versionAvisoEsPosterior(VERSION_AVISO, VERSION_AVISO)).toBe(false);
    expect(versionAvisoEsPosterior("7", "7")).toBe(false);
  });

  it('"no consta" no es comparable: una constancia sin versión nunca queda atrás', () => {
    expect(versionAvisoEsPosterior(VERSION_AVISO, null)).toBe(false);
    expect(versionAvisoEsPosterior(VERSION_AVISO, "")).toBe(false);
  });

  it("lo que no es un entero tampoco se ordena a la fuerza", () => {
    for (const rara of ["2-legal", "1.0", "v2", " 2 ", "٢", "2e0", "-1"]) {
      expect(versionAvisoEsPosterior(rara, "1"), rara).toBe(false);
      expect(versionAvisoEsPosterior("3", rara), rara).toBe(false);
    }
  });
});

describe("paginas-legales · el contenido versionado son las tres piezas del aviso", () => {
  const contenido = contenidoVersionadoDelAviso();
  const texto = contenido.join("\n");

  // ITERACIÓN 2 (hallazgo MEDIO-1 de `reports/c-seguridad.md`): la marca de
  // borrador se pinta DENTRO del documento legal, justo debajo del `h1`, así
  // que es parte de lo que el titular lee al consentir. Antes quedaba fuera de
  // la huella: vaciar `PLACEHOLDERS_LEGALES` quitaba de la página la
  // advertencia de "esto es un borrador sin revisión legal" sin mover la
  // versión y con la suite en verde.
  it("incluye la marca de borrador mientras esté publicada, en su lugar de lectura", () => {
    expect(HAY_PLACEHOLDERS_PENDIENTES).toBe(true);
    expect(contenido).toContain(TEXTO_MARCA_BORRADOR);
    // Va donde se lee: después del `h1` y antes de la línea de actualización.
    expect(contenido.indexOf(AVISO_PRIVACIDAD.h1)).toBeLessThan(
      contenido.indexOf(TEXTO_MARCA_BORRADOR),
    );
    expect(contenido.indexOf(TEXTO_MARCA_BORRADOR)).toBeLessThan(
      contenido.indexOf(AVISO_PRIVACIDAD.ultimaActualizacion),
    );
  });

  it("incluye el aviso simplificado, el literal de la casilla y el integral completo", () => {
    expect(texto).toContain(TEXTO_AVISO_PRIVACIDAD);
    expect(texto).toContain(TEXTO_CONSENTIMIENTO);
    // Una frase de cada parte del documento integral: encabezado, línea de
    // última actualización, introducción, un `h2`, un párrafo, una viñeta y el
    // enlace de cierre.
    expect(texto).toContain(AVISO_PRIVACIDAD.h1);
    expect(texto).toContain(AVISO_PRIVACIDAD.ultimaActualizacion);
    expect(texto).toContain(AVISO_PRIVACIDAD.introduccion);
    expect(texto).toContain("Tus derechos ARCO");
    expect(texto).toContain("Con nadie. No vendemos, no rentamos ni intercambiamos tus datos.");
    expect(texto).toContain(
      "Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos.",
    );
    expect(texto).toContain(AVISO_PRIVACIDAD.enlaceCierre!.texto);
  });

  it("no incluye el texto de los términos ni el literal de la versión", () => {
    expect(texto).not.toContain(TERMINOS.introduccion);
    expect(texto).not.toContain("Estas son las reglas de EnMiRumbo");
    expect(texto).not.toMatch(/Versión\s+\d/i);
  });

  it("cada pieza entra entera, sin cadenas vacías de relleno", () => {
    expect(contenido.length).toBeGreaterThan(30);
    for (const pieza of contenido) {
      expect(typeof pieza).toBe("string");
      expect(pieza.trim()).not.toBe("");
    }
  });
});

describe("paginas-legales · el guardián ata la versión al texto", () => {
  // Scenario: versión sin huella (por el lado verde: la vigente la tiene)
  it("la versión vigente está anclada y es la última de la tabla", () => {
    expect(HUELLAS_POR_VERSION.length).toBeGreaterThan(0);
    const versiones = HUELLAS_POR_VERSION.map(([version]) => version);
    expect(new Set(versiones).size).toBe(versiones.length);
    expect(versiones[versiones.length - 1]).toBe(VERSION_AVISO);
    for (const [version, huella] of HUELLAS_POR_VERSION) {
      expect(huella, `huella de la versión ${version}`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  // EL GUARDIÁN. Si esto falla, lee el comentario de arriba del archivo.
  it("el texto publicado hoy coincide con la huella de la versión vigente", () => {
    expect(
      revisarVersionYTexto(VERSION_AVISO, contenidoVersionadoDelAviso()),
    ).toBeNull();
  });

  // Requirement (ADDED por T-019) "El rebrand estrena la versión 2 del aviso,
  // sin tocar la evidencia de la 1" · Scenario: la huella de la versión 1
  // sobrevive al rebrand.
  it("la tabla tiene dos renglones y el de la versión 1 es el de siempre", () => {
    expect(HUELLAS_POR_VERSION).toHaveLength(2);
    expect(HUELLAS_POR_VERSION[0]).toEqual([
      "1",
      "08ce983c2ce4f4733e42aca21cf7c01f75b3a6cc78c72fdb8055c8bc61062d5f",
    ]);
    expect(HUELLAS_POR_VERSION[1][0]).toBe("2");
    // Y la `2` corresponde al texto que hoy se publica, no a otro cualquiera.
    expect(HUELLAS_POR_VERSION[1][1]).toBe(
      huellaDeContenido(contenidoVersionadoDelAviso()),
    );
    // El texto de hoy YA NO es el de la `1`: por eso hubo que estrenar versión.
    expect(HUELLAS_POR_VERSION[1][1]).not.toBe(HUELLAS_POR_VERSION[0][1]);
  });

  // Scenario: el rebrand no le pide nada al negocio ya publicado.
  //
  // El tramo automatizable de aquí es "no hay migración": estrenar la `2` NO
  // toca la base. Si alguien colara un backfill que reescribiera las
  // constancias, las fichas que consintieron la `1` pasarían a decir `2` y la
  // evidencia legal mentiría — con la firma del titular encima. El otro tramo
  // (que un reenvío no le actualiza la constancia a una ficha publicada) lo
  // cubre `tests/rebrand-seguridad-adversarial.test.ts`, contra la base.
  it("ninguna migración reescribe las constancias ya guardadas", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const directorio = join(process.cwd(), "prisma", "migrations");

    const sqls = readdirSync(directorio, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => ({
        nombre: entrada.name,
        sql: readFileSync(join(directorio, entrada.name, "migration.sql"), "utf8"),
      }));
    expect(sqls.length).toBeGreaterThan(0);

    // Anclados a principio de sentencia: `ON UPDATE CASCADE` y `ON DELETE
    // CASCADE` son cláusulas de llave foránea (definición del esquema), no
    // escrituras de datos, y las migraciones están llenas de ellas.
    const ESCRITURAS_DE_DATOS = [
      /^\s*UPDATE\s/im,
      /^\s*INSERT\s+INTO\s/im,
      /^\s*DELETE\s+FROM\s/im,
      /^\s*COPY\s/im,
    ];
    for (const { nombre, sql } of sqls) {
      // Las columnas de la constancia se pueden CREAR, nunca REESCRIBIR.
      for (const escritura of ESCRITURAS_DE_DATOS) {
        expect(
          sql,
          `${nombre}: una migración no escribe datos (${escritura})`,
        ).not.toMatch(escritura);
      }
    }

    // Y este change no agregó ninguna migración: estrenar versión es cambiar
    // un literal, no tocar el esquema (proposal, "modelo-datos no cambia").
    // La tercera llegó al fusionar `main` (T-014, el enlace de gestión): no es
    // de este change y por eso se lista aquí, en vez de aflojar la aserción a
    // un `toContain` que dejaría entrar cualquier migración futura sin que
    // nadie la mire.
    expect(sqls.map(({ nombre }) => nombre)).toEqual([
      "20260906000000_inicial",
      "20260907000000_agrega_cupos_compartidos",
      "20260908000000_agrega_enlace_de_gestion",
      // Y la cuarta, con T-016: agrega la columna `numeroVerificadoEn` y NADA
      // más — ningún `UPDATE`, así que las constancias ya guardadas siguen
      // intactas, que es lo que este guardián vigila.
      "20260909000000_agrega_verificacion_sms",
    ]);
  });

  // Scenario: se estrena versión junto con el texto (por el lado de la marca).
  it("el contenido versionado ya nombra al sitio con la marca vigente", () => {
    const texto = contenidoVersionadoDelAviso().join("\n");
    expect(texto).toContain("EnMiRumbo, el directorio de negocios de Tizayuca");
    expect(texto).not.toMatch(/necesitouno/i);
    expect(texto).not.toMatch(/EnMiRumbo\s+Tizayuca/i);
    // Y el correo del directorio, que viajó en la MISMA versión.
    expect(texto).toContain("contacto@enmirumbo.com");
  });
});

describe("paginas-legales · el guardián de verdad salta (prueba por mutación)", () => {
  /** Doble del módulo de textos con una frase cambiada. */
  function piezasAlteradas(cambio: Partial<PiezasDelAviso>): PiezasDelAviso {
    return { ...PIEZAS_VIGENTES_DEL_AVISO, ...cambio };
  }

  const conParrafoCambiado = piezasAlteradas({
    integral: {
      ...AVISO_PRIVACIDAD,
      secciones: AVISO_PRIVACIDAD.secciones.map((seccion, indice) =>
        indice === 0
          ? {
              ...seccion,
              bloques: seccion.bloques.map((bloque, i) =>
                i === 0 && bloque.tipo === "parrafo"
                  ? { ...bloque, texto: `${bloque.texto} Una coma más.` }
                  : bloque,
              ),
            }
          : seccion,
      ),
    },
  });

  // Scenario: alguien edita el aviso y no sube la versión
  it.each([
    ["el aviso simplificado", piezasAlteradas({ simplificado: `${TEXTO_AVISO_PRIVACIDAD} Y algo más.` })],
    ["el literal de la casilla", piezasAlteradas({ casilla: `${TEXTO_CONSENTIMIENTO} Y algo más.` })],
    ["un párrafo del aviso integral", conParrafoCambiado],
    [
      "la fecha de última actualización",
      piezasAlteradas({
        integral: { ...AVISO_PRIVACIDAD, ultimaActualizacion: "4 de septiembre de 2026" },
      }),
    ],
    // ITERACIÓN 2 (MEDIO-1): quitar la marca de borrador —vaciando la lista de
    // placeholders— cambia lo que la página publica, así que tiene que
    // estrenar versión como cualquier otra frase del aviso.
    ["quitar la marca de borrador", piezasAlteradas({ marcaBorrador: null })],
    [
      "reescribir la marca de borrador",
      piezasAlteradas({ marcaBorrador: `${TEXTO_MARCA_BORRADOR} Ya casi.` }),
    ],
    // Scenario: el guardián no se pisa con los placeholders
    [
      "un placeholder completado por el humano",
      piezasAlteradas({
        integral: {
          ...AVISO_PRIVACIDAD,
          secciones: AVISO_PRIVACIDAD.secciones.map((seccion) => ({
            ...seccion,
            bloques: seccion.bloques.map((bloque) =>
              bloque.tipo === "parrafo"
                ? {
                    ...bloque,
                    texto: bloque.texto.replace(
                      "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]",
                      "un domicilio de ejemplo",
                    ),
                  }
                : bloque,
            ),
          })),
        },
      }),
    ],
  ])("cambiar %s sin subir la versión deja la verificación en rojo", (_que, piezas) => {
    const fallo = revisarVersionYTexto(
      VERSION_AVISO,
      contenidoVersionadoDelAviso(piezas),
    );
    expect(fallo).not.toBeNull();
    expect(fallo).toContain("cambió sin estrenar versión");
    // El mensaje dice qué hacer y trae la huella nueva lista para anclarla.
    expect(fallo).toContain("Sube VERSION_AVISO");
    expect(fallo).toMatch(/[0-9a-f]{64}/);
  });

  // Scenario: se estrena versión junto con el texto
  it("subiendo la versión y anclando la huella nueva vuelve a pasar", () => {
    const contenidoNuevo = contenidoVersionadoDelAviso(conParrafoCambiado);
    const huellaNueva = huellaDeContenido(contenidoNuevo);
    const tablaConUnaMas = [...HUELLAS_POR_VERSION, ["3", huellaNueva] as const];

    expect(revisarVersionYTexto("3", contenidoNuevo, tablaConUnaMas)).toBeNull();
    // Y las huellas ya publicadas siguen registradas tal cual.
    expect(tablaConUnaMas.slice(0, HUELLAS_POR_VERSION.length)).toEqual([
      ...HUELLAS_POR_VERSION,
    ]);
    expect(tablaConUnaMas).toHaveLength(HUELLAS_POR_VERSION.length + 1);
  });

  // Scenario: versión sin huella
  it("subir la versión sin anclar su huella también falla", () => {
    const fallo = revisarVersionYTexto("3", contenidoVersionadoDelAviso());
    expect(fallo).not.toBeNull();
    expect(fallo).toContain("la vigente siempre tiene que ser la última de la tabla");
  });

  it("una versión vieja tampoco pasa aunque su huella esté anclada", () => {
    const tabla = [
      ["1", huellaDeContenido(contenidoVersionadoDelAviso())],
      ["2", "0".repeat(64)],
    ] as const;
    expect(revisarVersionYTexto("1", contenidoVersionadoDelAviso(), tabla)).not.toBeNull();
  });
});
