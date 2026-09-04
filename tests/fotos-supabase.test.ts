import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { barrerFotosHuerfanas } from "../src/lib/fotos/huerfanas";
import { generarClaveFoto, VARIANTES_FOTO } from "../src/lib/fotos/clave";
import {
  almacenSupabase,
  BUCKET_FOTOS_DEFAULT,
  configuracionSupabase,
  crearAlmacenSupabase,
  reiniciarAvisoDeSupabase,
  VARIABLE_SUPABASE_BUCKET,
  VARIABLE_SUPABASE_LLAVE,
  VARIABLE_SUPABASE_URL,
  type PedirHttp,
} from "../src/lib/fotos/almacen-supabase";
import {
  almacenDeFotos,
  avisarSinAlmacenDeFotosUnaVez,
  crearAlmacenSinConfigurar,
  reiniciarAlmacenDeFotos,
  reiniciarAvisoDeAlmacenDeFotos,
} from "../src/lib/fotos/almacen";

/**
 * Spec `despliegue` · Requirement "Las fotos de los negocios viven en el
 * almacenamiento del proveedor, no en el disco del hosting" (enmienda de la
 * iteración 2 del change `preparar-deploy-produccion`, hallazgo A5 de la etapa
 * C).
 *
 * El almacén de Supabase se ejercita ENTERO —las cuatro llamadas, sus
 * cabeceras y cómo interpreta cada respuesta— contra un `fetch` de mentiras
 * que vive detrás del mismo puerto. Lo que NO se prueba aquí es la red de
 * verdad: eso es la prueba de humo humana de `docs/despliegue.md` §9, y está
 * dicho en el reporte.
 *
 * Ningún dato real: URL de ejemplo, llave inventada, claves de foto generadas.
 */

const URL_PROYECTO = "https://proyecto-ficticio.supabase.co";
const LLAVE = "llave-de-servicio-de-mentiras-no-sirve-para-nada";
const CONFIGURACION = { url: URL_PROYECTO, llave: LLAVE, bucket: "fotos" };

/** Un `fetch` de mentiras que apunta lo que le piden y contesta lo que le digan. */
function espiaHttp(responder: (url: string, opciones: RequestInit) => Response) {
  const llamadas: Array<{ url: string; opciones: RequestInit }> = [];
  const pedir: PedirHttp = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return responder(url, opciones);
  };
  return { llamadas, pedir };
}

const ok = (cuerpo: BodyInit = "", estado = 200) =>
  new Response(cuerpo, { status: estado });

beforeEach(() => {
  reiniciarAvisoDeSupabase();
  reiniciarAlmacenDeFotos();
  for (const variable of [
    VARIABLE_SUPABASE_URL,
    VARIABLE_SUPABASE_LLAVE,
    VARIABLE_SUPABASE_BUCKET,
  ]) {
    delete process.env[variable];
  }
});

afterEach(() => {
  reiniciarAlmacenDeFotos();
  vi.restoreAllMocks();
});

// ── 1. Cuándo se usa Supabase y cuándo no ───────────────────────────────────

describe("fotos · elegir almacén sin sorpresas", () => {
  it("sin ninguna variable, no hay Supabase (y eso es lo normal en desarrollo)", () => {
    expect(configuracionSupabase({})).toBeNull();
    expect(crearAlmacenSupabase({})).toBeNull();
    expect(almacenDeFotos({}).descripcion()).toContain("disco local");
  });

  it("con las dos variables, el almacén de la aplicación es Supabase", () => {
    const almacen = almacenDeFotos({
      [VARIABLE_SUPABASE_URL]: URL_PROYECTO,
      [VARIABLE_SUPABASE_LLAVE]: LLAVE,
    });
    expect(almacen.descripcion()).toContain("Supabase Storage");
    // Y nunca deja escapar la llave en el texto que va a un log.
    expect(almacen.descripcion()).not.toContain(LLAVE);
  });

  it("el bucket por defecto se puede cambiar", () => {
    expect(
      configuracionSupabase({
        [VARIABLE_SUPABASE_URL]: URL_PROYECTO,
        [VARIABLE_SUPABASE_LLAVE]: LLAVE,
      })?.bucket,
    ).toBe(BUCKET_FOTOS_DEFAULT);
    expect(
      configuracionSupabase({
        [VARIABLE_SUPABASE_URL]: URL_PROYECTO,
        [VARIABLE_SUPABASE_LLAVE]: LLAVE,
        [VARIABLE_SUPABASE_BUCKET]: "fotos-de-prueba",
      })?.bucket,
    ).toBe("fotos-de-prueba");
  });

  it.each([
    ["falta la llave", { [VARIABLE_SUPABASE_URL]: URL_PROYECTO }],
    ["falta la URL", { [VARIABLE_SUPABASE_LLAVE]: LLAVE }],
    [
      "la URL no es https:",
      { [VARIABLE_SUPABASE_URL]: "http://inseguro.example", [VARIABLE_SUPABASE_LLAVE]: LLAVE },
    ],
  ])("con la configuración a medias (%s) avisa fuerte y no usa Supabase", (_caso, env) => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(configuracionSupabase(env)).toBeNull();
    expect(errores).toHaveBeenCalledTimes(1);
    const dicho = String(errores.mock.calls[0][0]);
    expect(dicho).toContain("disco local");
    expect(dicho).toContain("borrado ARCO");
    expect(dicho).not.toContain(LLAVE);
  });

  it("el aviso de configuración a medias sale una sola vez por proceso", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 20; i += 1) {
      configuracionSupabase({ [VARIABLE_SUPABASE_URL]: URL_PROYECTO });
    }
    expect(errores).toHaveBeenCalledTimes(1);
  });
});

// ── 2. Las cuatro operaciones del puerto ────────────────────────────────────

describe("fotos · el almacén de Supabase habla su API", () => {
  const clave = generarClaveFoto();

  it("guardar sube el objeto con su tipo, autorizado y con sobrescritura", async () => {
    const { llamadas, pedir } = espiaHttp(() => ok("", 200));
    await almacenSupabase(CONFIGURACION, pedir).guardar(clave, "tarjeta", Buffer.from("bytes"));

    expect(llamadas).toHaveLength(1);
    const [llamada] = llamadas;
    expect(llamada.url).toBe(
      `${URL_PROYECTO}/storage/v1/object/fotos/${clave}.tarjeta.webp`,
    );
    expect(llamada.opciones.method).toBe("POST");
    const cabeceras = llamada.opciones.headers as Record<string, string>;
    expect(cabeceras.Authorization).toBe(`Bearer ${LLAVE}`);
    expect(cabeceras["Content-Type"]).toBe("image/webp");
    expect(cabeceras["x-upsert"]).toBe("true");
  });

  it("si el almacén rechaza la subida, se entera quien llamó", async () => {
    const { pedir } = espiaHttp(() => ok("no", 403));
    await expect(
      almacenSupabase(CONFIGURACION, pedir).guardar(clave, "ficha", Buffer.from("x")),
    ).rejects.toThrow(/403/);
  });

  it("el error que se propaga no lleva la llave de servicio", async () => {
    const { pedir } = espiaHttp(() => ok("no", 500));
    await expect(
      almacenSupabase(CONFIGURACION, pedir).guardar(clave, "ficha", Buffer.from("x")),
    ).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(LLAVE) }) as Error,
    );
  });

  it("leer devuelve los bytes, y `null` cuando el objeto no está", async () => {
    const conBytes = espiaHttp(() => ok("una foto de mentiras"));
    expect(
      (await almacenSupabase(CONFIGURACION, conBytes.pedir).leer(clave, "ficha"))?.toString(),
    ).toBe("una foto de mentiras");

    const sinObjeto = espiaHttp(() => ok("", 404));
    expect(await almacenSupabase(CONFIGURACION, sinObjeto.pedir).leer(clave, "ficha")).toBeNull();
  });

  it("una clave que no tiene la forma del servidor no sale a la red", async () => {
    const { llamadas, pedir } = espiaHttp(() => ok());
    expect(await almacenSupabase(CONFIGURACION, pedir).leer("../../etc/passwd", "ficha")).toBeNull();
    await almacenSupabase(CONFIGURACION, pedir).borrar("no-es-una-clave");
    expect(llamadas).toEqual([]);
  });

  it("borrar se lleva las DOS variantes en una sola llamada", async () => {
    const { llamadas, pedir } = espiaHttp(() => ok("[]"));
    await almacenSupabase(CONFIGURACION, pedir).borrar(clave);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].opciones.method).toBe("DELETE");
    const cuerpo = JSON.parse(String(llamadas[0].opciones.body)) as { prefixes: string[] };
    expect(cuerpo.prefixes.sort()).toEqual(
      VARIANTES_FOTO.map((variante) => `${clave}.${variante}.webp`).sort(),
    );
  });

  it("borrar algo que ya no estaba no truena (borrado ARCO idempotente)", async () => {
    const { pedir } = espiaHttp(() => ok("", 404));
    await expect(almacenSupabase(CONFIGURACION, pedir).borrar(clave)).resolves.toBeUndefined();
  });

  it("listar devuelve nombre y fecha de cada objeto", async () => {
    const { llamadas, pedir } = espiaHttp(() =>
      ok(
        JSON.stringify([
          { name: `${clave}.tarjeta.webp`, updated_at: "2026-09-01T10:00:00.000Z" },
          { name: `${clave}.ficha.webp`, created_at: "2026-09-01T10:00:01.000Z" },
        ]),
      ),
    );
    const objetos = await almacenSupabase(CONFIGURACION, pedir).listar();

    expect(llamadas[0].url).toBe(`${URL_PROYECTO}/storage/v1/object/list/fotos`);
    expect(objetos.map((objeto) => objeto.nombre)).toEqual([
      `${clave}.tarjeta.webp`,
      `${clave}.ficha.webp`,
    ]);
    expect(objetos[0].modificadoEn.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    // Sin fecha se trata como recién escrito, que es lo seguro.
    expect(objetos[1].modificadoEn.toISOString()).toBe("2026-09-01T10:00:01.000Z");
  });

  it("listar pagina hasta el final: un almacén grande no se queda a medias", async () => {
    // Si se leyera una sola página, el barrido creería huérfanas TODAS las
    // fotos que no cupieron y —sin las salvaguardas— las borraría.
    const paginaLlena = Array.from({ length: 500 }, (_, i) => ({
      name: `${"a".repeat(31)}${i % 10}.tarjeta.webp`,
      updated_at: "2026-09-01T10:00:00.000Z",
    }));
    let pagina = 0;
    const { llamadas, pedir } = espiaHttp(() =>
      ok(JSON.stringify(pagina++ === 0 ? paginaLlena : [{ name: "ultima.txt" }])),
    );

    const objetos = await almacenSupabase(CONFIGURACION, pedir).listar();
    expect(llamadas).toHaveLength(2);
    expect(objetos).toHaveLength(501);
    expect(JSON.parse(String(llamadas[1].opciones.body)).offset).toBe(500);
  });

  it("si el listado falla, el barrido NO recibe una lista vacía", async () => {
    // Es la diferencia entre "no hay nada que barrer" y "no pude mirar".
    const { pedir } = espiaHttp(() => ok("", 500));
    await expect(almacenSupabase(CONFIGURACION, pedir).listar()).rejects.toThrow(/500/);
  });
});

// ── 3. El barrido de huérfanas contra el almacén remoto ─────────────────────

describe("fotos · el barrido funciona igual con el almacén de producción", () => {
  const baseConFotos = (conFoto: number, claves: string[]) => ({
    negocio: {
      count: async () => conFoto,
      findMany: async () =>
        claves.map((fotoClave) => ({ fotoClave })) as Array<{ fotoClave: string | null }>,
    },
  });

  it("borra del storage la foto que ya no es de nadie", async () => {
    const conDuenio = generarClaveFoto();
    const huerfana = generarClaveFoto();
    const vieja = "2026-06-01T10:00:00.000Z";
    const borradas: string[] = [];

    const almacen = almacenSupabase(CONFIGURACION, async (url, opciones) => {
      if (url.includes("/object/list/")) {
        return ok(
          JSON.stringify(
            [conDuenio, huerfana].flatMap((clave) =>
              VARIANTES_FOTO.map((variante) => ({
                name: `${clave}.${variante}.webp`,
                updated_at: vieja,
              })),
            ),
          ),
        );
      }
      if (opciones.method === "DELETE") {
        borradas.push(...(JSON.parse(String(opciones.body)) as { prefixes: string[] }).prefixes);
        return ok("[]");
      }
      return ok();
    });

    const resultado = await barrerFotosHuerfanas({
      prisma: baseConFotos(2, [conDuenio]),
      almacen,
    });

    expect(resultado.barrido).toBe(true);
    expect(resultado.huerfanas).toBe(1);
    expect(resultado.borradas).toBe(1);
    expect(borradas.every((nombre) => nombre.startsWith(huerfana))).toBe(true);
    expect(borradas).toHaveLength(VARIANTES_FOTO.length);
  });

  /**
   * EL FALLO SILENCIOSO QUE MOTIVÓ EL HALLAZGO A5.
   *
   * Con el adaptador de disco en serverless, cada instancia nueva veía el
   * directorio vacío y el barrido contestaba "el almacén está vacío: nada que
   * barrer" con un 200, todos los días, sin haber revisado nada. Un almacén
   * vacío sólo es creíble si la base tampoco tiene fichas con foto.
   */
  it("un almacén vacío con fichas que dicen tener foto NO es 'nada que barrer'", async () => {
    const almacen = almacenSupabase(CONFIGURACION, async () => ok("[]"));

    const resultado = await barrerFotosHuerfanas({
      prisma: baseConFotos(7, []),
      almacen,
    });

    expect(resultado.barrido).toBe(false);
    expect(resultado.mensaje).toContain("almacén equivocado");
    expect(resultado.mensaje).toContain("Supabase Storage");
    expect(resultado.borradas).toBe(0);
  });

  it("un almacén vacío con la base sin fotos sí es 'nada que barrer'", async () => {
    const almacen = almacenSupabase(CONFIGURACION, async () => ok("[]"));
    const resultado = await barrerFotosHuerfanas({
      prisma: baseConFotos(0, []),
      almacen,
    });
    expect(resultado.barrido).toBe(true);
    expect(resultado.revisadas).toBe(0);
  });
});

// ── 4. Sin configurar, en un despliegue de verdad: falla a la vista ─────────

describe("fotos · el disco efímero no vuelve en silencio (hallazgo R2)", () => {
  const REMOTA = "postgresql://u:c@db.abc.supabase.co:5432/postgres?sslmode=require";

  beforeEach(() => reiniciarAvisoDeAlmacenDeFotos());

  it.each([
    ["producción por NODE_ENV", { NODE_ENV: "production" }],
    ["producción por VERCEL_ENV", { VERCEL_ENV: "production" }],
    ["staging: la base no está en esta máquina", { DATABASE_URL: REMOTA }],
  ])("en %s sin configurar, el almacén NO es el disco", (_caso, env) => {
    reiniciarAlmacenDeFotos();
    const almacen = almacenDeFotos(env);
    expect(almacen.descripcion()).not.toContain("disco local");
    expect(almacen.descripcion()).toContain("SIN CONFIGURAR");
  });

  it("en la máquina de alguien, con base local, sigue siendo el disco", () => {
    reiniciarAlmacenDeFotos();
    expect(
      almacenDeFotos({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:51214/template1",
      }).descripcion(),
    ).toContain("disco local");
    // Y sin DATABASE_URL tampoco se asusta: un clon recién hecho arranca solo.
    reiniciarAlmacenDeFotos();
    expect(almacenDeFotos({}).descripcion()).toContain("disco local");
  });

  it("guardar, borrar y listar fallan a la vista; leer no revienta la página", async () => {
    const almacen = crearAlmacenSinConfigurar();
    const clave = generarClaveFoto();

    // Guardar: el camino por el que se perderían datos en silencio.
    await expect(almacen.guardar(clave, "ficha", Buffer.from("x"))).rejects.toThrow(
      /SUPABASE_URL/,
    );
    // Listar: el barrido tiene que distinguir "no hay nada" de "no pude mirar".
    await expect(almacen.listar()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    // Leer: no revienta una página pública; la ficha muestra su marcador.
    expect(await almacen.leer(clave, "ficha")).toBeNull();

    // BORRAR TAMBIÉN LANZA (iteración 4, hallazgo R4; decisión del fundador).
    // Durante una iteración se completaba en silencio, razonando "aquí nunca se
    // escribió nada, así que no hay archivo que borrar". Ese razonamiento sólo
    // vale si el almacén NUNCA estuvo configurado, y desde aquí eso no se puede
    // saber: el caso que este almacén existe para atrapar es justo el otro
    // —estuvo configurado y la configuración se perdió—, donde la foto SÍ está
    // en el bucket. Callarse borraba la fila, contestaba "borrado" y dejaba un
    // dato personal vivo sin ninguna fila que lo nombrara.
    await expect(almacen.borrar(clave)).rejects.toThrow(/SUPABASE_URL/);
  });

  it("el barrido de huérfanas se detiene en vez de informar éxito", async () => {
    const resultado = await barrerFotosHuerfanas({
      prisma: { negocio: { count: async () => 3, findMany: async () => [] } },
      almacen: crearAlmacenSinConfigurar(),
    }).catch((error: Error) => error);

    // O lanza (y el cron responde 500) o dice que no barrió: lo que NO puede
    // es contestar "nada que barrer" con un 200.
    if (resultado instanceof Error) {
      expect(resultado.message).toContain("SUPABASE_URL");
    } else {
      expect(resultado.barrido).toBe(false);
    }
  });

  it("avisa al arrancar, una sola vez, y solo donde importa", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < 20; i += 1) {
      avisarSinAlmacenDeFotosUnaVez({ NODE_ENV: "production" });
    }
    expect(errores).toHaveBeenCalledTimes(1);
    const dicho = String(errores.mock.calls[0][0]);
    expect(dicho).toContain(VARIABLE_SUPABASE_URL);
    expect(dicho).toContain(VARIABLE_SUPABASE_LLAVE);
    expect(dicho).toContain("efímero");

    // En desarrollo, o con Supabase configurado, no dice nada.
    errores.mockClear();
    reiniciarAvisoDeAlmacenDeFotos();
    avisarSinAlmacenDeFotosUnaVez({ NODE_ENV: "development" });
    avisarSinAlmacenDeFotosUnaVez({
      NODE_ENV: "production",
      [VARIABLE_SUPABASE_URL]: URL_PROYECTO,
      [VARIABLE_SUPABASE_LLAVE]: LLAVE,
    });
    expect(errores).not.toHaveBeenCalled();
  });

  it("el aviso se dispara al ARRANCAR, con los otros tres", () => {
    const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
    const cuerpo = layout.slice(0, layout.search(/export\s+default\s+function/));
    expect(cuerpo).toContain("avisarSinAlmacenDeFotosUnaVez()");
  });
});
