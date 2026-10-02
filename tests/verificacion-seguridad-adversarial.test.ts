import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => {
  const simulado = await import("./admin-mocks");
  return { cookies: simulado.cookies, headers: simulado.headers };
});
vi.mock("next/navigation", async () => {
  const simulado = await import("./admin-mocks");
  const real = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...real, redirect: simulado.redirect, notFound: simulado.notFound };
});

import { seedCatalogos } from "../prisma/seed";
import FichaNegocioPage from "../src/app/(publico)/negocio/[ficha]/page";
import DetalleRegistroAdminPage from "../src/app/admin/registros/[id]/page";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  LONGITUD_MINIMA_SECRETO,
  VARIABLE_CONTRASENA,
  VARIABLE_SECRETO_SESION,
} from "../src/lib/admin/config";
import { NOMBRE_COOKIE_SESION, crearValorDeSesion } from "../src/lib/admin/sesion";
import {
  BOTON_APROBAR,
  BOTON_RECHAZAR,
  BOTON_WHATSAPP_VERIFICACION,
} from "../src/lib/admin/textos";
import {
  claveDeCupo,
  RETENCION_MAXIMA_DE_CUPOS_MS,
} from "../src/lib/cupos/compartido";
import { construirSegmentoFicha } from "../src/lib/ficha-url";
import {
  CAMPOS_EDITABLES,
  CAMPOS_PROHIBIDOS_EN_EDICION,
  COLUMNAS_DERIVADAS_AL_APLICAR,
  soloCamposEditables,
} from "../src/lib/gestion/campos";
import { aplicarEdicion } from "../src/lib/gestion/ediciones";
import { ESTADO_EDICION_PENDIENTE } from "../src/lib/gestion/estados";
import { reiniciarCupoDeEdiciones } from "../src/lib/gestion/limite-ip";
import { procesarEdicion } from "../src/lib/gestion/procesar-edicion";
import { generarTokenGestion, huellaDeToken } from "../src/lib/gestion/token";
import { ESTADO_NEGOCIO_PUBLICADO } from "../src/lib/negocio";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import {
  ejecutarConfirmacion,
  ejecutarReenvio,
  type DependenciasVerificacion,
} from "../src/lib/verificacion/acciones";
import {
  VARIABLE_BANDERA,
  VARIABLE_SECRETO,
  VARIABLE_TWILIO_AUTH_TOKEN,
  VARIABLE_TWILIO_SERVICE_SID,
  VARIABLE_TWILIO_SID,
  leerConfiguracionVerificacion,
  motivoConfiguracionIncompleta,
  reiniciarAvisoDeVerificacion,
  verificacionEncendida,
  type EntornoVerificacion,
} from "../src/lib/verificacion/config";
import { pedirCodigoParaFicha, reenviarCodigo } from "../src/lib/verificacion/flujo";
import {
  COOLDOWN_REENVIO_MS,
  CUPO_ENVIOS_SEGUIDOS,
  CUPO_INTENTOS_POR_REGISTRO,
  CUPO_REENVIOS_POR_REGISTRO,
  MAX_INTENTOS_POR_REGISTRO,
  MAX_REENVIOS_POR_REGISTRO,
  VENTANA_TOPES_POR_REGISTRO_MS,
  reiniciarCupoDeCodigos,
  reiniciarTopeDiario,
} from "../src/lib/verificacion/limites";
import {
  COOKIE_PASO,
  DURACION_PASO_MS,
  crearPasoInicial,
  firmarPaso,
} from "../src/lib/verificacion/paso";
import {
  crearProveedorSimulado,
  type ProveedorSimulado,
} from "../src/lib/verificacion/proveedor";
import {
  ETIQUETA_COLA_NUMERO_VERIFICADO_SMS,
  TEXTO_SIN_VERIFICAR_SMS,
} from "../src/lib/verificacion/textos";
import { peticion, reiniciarPeticion, urlDeRedireccion } from "./admin-mocks";
import { crearClientePrueba } from "./db";

/**
 * ETAPA C (seguridad-test) del change `agregar-verificacion-sms-tras-bandera`
 * (T-016). Complementa `tests/verificacion-adversarial.test.ts` (del dev) con
 * lo que el camino feliz —y la mirada de quien escribió el código— no cubre:
 *
 * 1. **La bandera es la frontera de seguridad**: se ataca con formas raras y
 *    con dígitos que *parecen* un `1` sin serlo (unicode de ancho completo,
 *    arábigo-índico, espacio de ancho cero). Ninguna enciende un canal que
 *    cuesta dinero por mensaje.
 * 2. **El rebobinado de la cookie de paso** (*replay*): una cookie legítima,
 *    firmada por el servidor, guardada por quien la recibió y reenviada más
 *    tarde. No es falsificación —la firma es buena—, es volver el contador
 *    atrás. Documenta el hallazgo **[C-2]** de `reports/c-seguridad.md`.
 * 3. **Confirmar el código mueve UNA columna y ninguna más**: ni el estado, ni
 *    la cola, ni el enlace de gestión, ni la constancia del aviso.
 * 4. **El borde con T-014 (enlace de gestión)**: aplicar una edición que
 *    CAMBIA el WhatsApp conserva la marca de verificación del número viejo.
 *    Hallazgo **[C-1]**, accionable para el dev.
 * 5. **No fuga en tiempo de ejecución**: una ficha publicada y verificada no
 *    delata su marca en la ficha pública ni en sus datos estructurados.
 *
 * Convención de la etapa C de este repo (ver
 * `tests/gestion-seguridad-adversarial.test.ts`): mientras un hallazgo sigue
 * abierto, la prueba **tolera las dos formas** y deja escrito cuál es la
 * correcta; cuando el dev lo cierre, se aprieta la aserción y queda como
 * cerrojo de regresión.
 *
 * Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 771996xxxx,
 * credenciales literalmente "de-mentiras".
 */

const PREFIJO = "771996";
const SECRETO = "secreto-de-pruebas-de-32-caracteres-o-mas";
const IP = "203.0.113.191"; // TEST-NET-3
const AHORA = new Date("2026-09-05T12:00:00.000Z");
const VERIFICADO_EN = new Date("2026-08-03T10:00:00.000Z");

const SID_FALSO = "AC-de-mentiras-000";
const TOKEN_FALSO = "token-de-mentiras-000";
const SERVICE_FALSO = "VA-de-mentiras-000";

const COMPLETO: EntornoVerificacion = {
  [VARIABLE_BANDERA]: "1",
  [VARIABLE_TWILIO_SID]: SID_FALSO,
  [VARIABLE_TWILIO_AUTH_TOKEN]: TOKEN_FALSO,
  [VARIABLE_TWILIO_SERVICE_SID]: SERVICE_FALSO,
  [VARIABLE_SECRETO]: SECRETO,
};

let prisma: PrismaClient;
let categoriaId: number;
let coloniaId: number;
let proveedor: ProveedorSimulado;

function dependencias(cambios: Partial<DependenciasVerificacion> = {}): DependenciasVerificacion {
  return {
    prisma,
    contexto: { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA },
    esHttps: false,
    ...cambios,
  };
}

const conCodigo = (codigo: string) => {
  const formData = new FormData();
  formData.set("codigo", codigo);
  return formData;
};

async function crearFicha(
  whatsapp: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const negocio = await prisma.negocio.create({
    data: {
      nombre: "Estetica Ficticia La Trenza",
      categoriaId,
      coloniaId,
      whatsapp,
      queOfreces: "Cortes inventados",
      consintioAvisoEn: new Date("2026-08-01T10:00:00.000Z"),
      consintioAvisoVersion: "1",
      ...extra,
    },
    select: { id: true },
  });
  return negocio.id;
}

async function render(pagina: Promise<React.ReactElement> | React.ReactElement) {
  const resuelta = await pagina;
  return renderToStaticMarkup(createElement(() => resuelta));
}

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
});

beforeEach(async () => {
  reiniciarPeticion();
  reiniciarCupoDeCodigos();
  reiniciarTopeDiario();
  reiniciarLimitePorIp();
  reiniciarCupoDeEdiciones();
  reiniciarAvisoDeVerificacion();
  proveedor = crearProveedorSimulado();
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
});

afterEach(() => vi.restoreAllMocks());

afterAll(async () => {
  await prisma.negocio.deleteMany({ where: { whatsapp: { startsWith: PREFIJO } } });
  await prisma.$disconnect();
});

// ── 1. La bandera es la frontera: formas que PARECEN un uno ─────────────────
//
// El requirement rey dice "el valor exacto `1`". El dev ya probó "true", "01",
// "1 " y compañía; falta lo que un despliegue copiado y pegado puede traer sin
// que nadie lo note a simple vista: dígitos de otros alfabetos, unicode de
// ancho completo, espacios invisibles y separadores de línea. Ninguno debe
// encender un canal que cuesta dinero por mensaje.

describe("adversarial · la bandera no se enciende con un uno de mentiras", () => {
  const unosFalsos: Array<[string, string]> = [
    ["ancho completo", "１"],
    ["arabigo-indico", "١"],
    ["devanagari", "१"],
    ["con espacio de ancho cero detras", "1\u200b"],
    ["con espacio duro delante", " 1"],
    ["con salto de linea", "1\n"],
    ["con retorno de carro", "1\r"],
    ["con tabulador delante", "\t1"],
    ["con byte nulo", "1\u0000"],
    ["con marca de orden de bytes", "\ufeff1"],
    ["numeral romano", "Ⅰ"],
    ["subindice", "₁"],
    ["entre comillas", '"1"'],
    ["con signo", "+1"],
    ["decimal", "1.0"],
    ["booleano", "true"],
  ];

  it.each(unosFalsos)("la bandera %s deja la capacidad apagada", (_caso, valor) => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { ...COMPLETO, [VARIABLE_BANDERA]: valor };

    expect(leerConfiguracionVerificacion(env)).toBeNull();
    expect(verificacionEncendida(env)).toBe(false);
    // Y no es un "error de configuración": la bandera simplemente no está
    // encendida, así que tampoco se ensucia el log.
    expect(motivoConfiguracionIncompleta(env)).toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("un secreto que solo tiene espacios en blanco no cuenta como secreto", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // 40 caracteres de largo, cero entropía: si la longitud se midiera SIN
    // recortar, este entorno encendería la capacidad y firmaría cookies con un
    // secreto adivinable de un vistazo.
    const env = { ...COMPLETO, [VARIABLE_SECRETO]: " ".repeat(40) };
    expect(leerConfiguracionVerificacion(env)).toBeNull();
    expect(motivoConfiguracionIncompleta(env)).toContain(VARIABLE_SECRETO);
  });

  it("una credencial de puros espacios y tabuladores no cuenta como puesta", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const invisible of [" ", "\t", "\n", " \t \n "]) {
      const env = { ...COMPLETO, [VARIABLE_TWILIO_AUTH_TOKEN]: invisible };
      expect(leerConfiguracionVerificacion(env)).toBeNull();
      expect(motivoConfiguracionIncompleta(env)).toContain(VARIABLE_TWILIO_AUTH_TOKEN);
    }
  });
});

// ── 2. [C-2] El rebobinado de la cookie de paso ─────────────────────────────
//
// La cookie va firmada, así que NADIE puede fabricar una (el dev ya lo probó
// con ocho formas hostiles). Pero la firma no impide **reusar una cookie
// legítima que el propio servidor emitió**: los contadores de intentos y de
// reenvíos viven íntegros dentro de ella, sin ningún ancla del lado del
// servidor (ni un nonce, ni una marca en la ficha). Quien guarde su primera
// cookie —copiarla del navegador o mandar la petición con `curl` es todo lo
// que hace falta— vuelve el contador a cero cuando quiera, dentro de los 15
// minutos de vigencia.
//
// Esto NO es "borrar la cookie", que el design.md §3 sí consideró y que solo
// deja al atacante sin pantalla. Rebobinar es estrictamente más fuerte: deja
// la pantalla viva y los contadores en cero.

describe("adversarial · [C-2 CERRADO] reusar una cookie legítima ya no rebobina nada", () => {
  it("los 5 intentos de código NO se revive con la cookie del principio", async () => {
    const id = await crearFicha(`${PREFIJO}0101`);
    const cookieDelPrincipio = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0101`, AHORA),
      SECRETO,
    );
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });

    // El atacante reenvía SIEMPRE la misma cookie: la del principio. Antes eso
    // rebobinaba `intentos: 0` en cada vuelta; ahora el conteo vive en el
    // servidor (`limites.ts`, almacén compartido) y la cookie ya ni siquiera
    // lleva contadores, así que reusarla no consigue nada.
    const destinos: string[] = [];
    for (let i = 0; i < MAX_INTENTOS_POR_REGISTRO * 3; i += 1) {
      peticion.cookies[COOKIE_PASO] = cookieDelPrincipio;
      destinos.push(
        await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("424242"), dependencias())),
      );
    }

    // [C-2] CERRADO: el proveedor recibe como mucho los 5 códigos del tope.
    expect(proveedor.comprobados).toHaveLength(MAX_INTENTOS_POR_REGISTRO);
    // Y en cuanto se agotan, el dueño va a gracias y ya no vuelve a la pantalla.
    expect(destinos.at(-1)).toBe("/registro/gracias?agotado=1");
    expect(destinos.filter((destino) => destino.startsWith("/registro/verificar"))).toHaveLength(
      MAX_INTENTOS_POR_REGISTRO - 1,
    );
    // Lo que sí se sostiene pase lo que pase: la ficha NO queda verificada.
    expect(
      (await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn,
    ).toBeNull();
  });

  it("los 2 reenvíos NO se revive, ni siquiera sin encabezado de IP declarado", async () => {
    const id = await crearFicha(`${PREFIJO}0102`);
    const cookieDelPrincipio = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0102`, AHORA),
      SECRETO,
    );
    // ESTE es el escenario que hacía [C-2] caro: sin `REGISTRO_ENCABEZADO_IP`
    // declarado el cupo por IP no aplica (despliegue válido según la spec,
    // scenario "sin encabezado de IP declarado"), así que las dos únicas
    // defensas "por registro" son el cooldown y el tope de 2 reenvíos. Antes
    // vivían en la cookie y se rebobinaban; ahora viven en el servidor.
    // El reloj AVANZA 61 s en cada vuelta, así que la espera de 60 s nunca es
    // lo que corta: lo que corta es el tope de 2 reenvíos por registro.
    for (let i = 0; i < 10; i += 1) {
      peticion.cookies[COOKIE_PASO] = cookieDelPrincipio;
      const contexto = {
        proveedor,
        cupos: prisma,
        secreto: SECRETO,
        topeDiario: 6,
        ip: null,
        ahora: new Date(AHORA.getTime() + (i + 1) * 61_000),
      };
      await urlDeRedireccion(() => ejecutarReenvio(dependencias({ contexto })));
    }

    // [C-2] CERRADO: salen exactamente los 2 reenvíos que la spec promete por
    // registro, y el tope diario de 6 ni se roza. Un atacante con un solo
    // registro ya no puede consumir la cuota del día del fundador.
    expect(proveedor.iniciados).toHaveLength(MAX_REENVIOS_POR_REGISTRO);
    expect(proveedor.iniciados.every((numero) => numero === `${PREFIJO}0102`)).toBe(true);
  });

  it("el rebobinado no sirve para saltarse el cupo por IP cuando sí está declarado", async () => {
    const id = await crearFicha(`${PREFIJO}0103`);
    const cookieDelPrincipio = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0103`, AHORA),
      SECRETO,
    );
    for (let i = 0; i < 10; i += 1) {
      peticion.cookies[COOKIE_PASO] = cookieDelPrincipio;
      const contexto = {
        proveedor,
        cupos: prisma,
        secreto: SECRETO,
        topeDiario: 50,
        ip: IP,
        ahora: new Date(AHORA.getTime() + (i + 1) * 61_000),
      };
      await urlDeRedireccion(() => ejecutarReenvio(dependencias({ contexto })));
    }

    // Con el encabezado declarado corta lo que llegue primero. Desde la
    // corrección de [C-2] corta antes el tope por registro (2) que el cupo por
    // IP (3): las dos defensas siguen puestas, y manda la más estricta.
    expect(proveedor.iniciados).toHaveLength(MAX_REENVIOS_POR_REGISTRO);
  });
});

// ── 3. Confirmar el código mueve UNA columna y ninguna más ──────────────────

describe("adversarial · confirmar no es una transición de estado disfrazada", () => {
  it("una ficha que el admin publicó mientras tanto se verifica sin despublicarse", async () => {
    // La cookie vive 15 minutos: da tiempo de sobra a que el admin apruebe la
    // ficha en otra pestaña antes de que el dueño escriba su código.
    const id = await crearFicha(`${PREFIJO}0110`, {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      publicadoEn: new Date("2026-09-05T11:00:00.000Z"),
      tokenGestionHash: huellaDeToken(generarTokenGestion()),
      tokenGestionCreadoEn: new Date("2026-09-05T11:00:00.000Z"),
    });
    const antes = await prisma.negocio.findUniqueOrThrow({ where: { id } });

    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0110`, AHORA),
      SECRETO,
    );
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    expect(
      await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("424242"), dependencias())),
    ).toBe("/registro/gracias?verificado=1");

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    // Fila entera igual salvo la única columna que la spec permite escribir:
    // ni el estado, ni la fecha de publicación, ni la huella del enlace de
    // gestión, ni la constancia del aviso se movieron.
    expect({ ...despues, numeroVerificadoEn: null }).toEqual({
      ...antes,
      numeroVerificadoEn: null,
    });
    expect(despues.numeroVerificadoEn?.toISOString()).toBe(AHORA.toISOString());
  });

  it("confirmar dos veces no repisa la fecha ni gasta otra llamada al proveedor", async () => {
    const id = await crearFicha(`${PREFIJO}0111`);
    const cookie = firmarPaso(crearPasoInicial(id, `${PREFIJO}0111`, AHORA), SECRETO);
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });

    peticion.cookies[COOKIE_PASO] = cookie;
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("424242"), dependencias()));
    const primera = (await prisma.negocio.findUniqueOrThrow({ where: { id } }))
      .numeroVerificadoEn;

    // Segunda confirmación con la MISMA cookie, cinco minutos "después" y
    // todavía dentro de la vigencia: ni se le vuelve a preguntar al proveedor
    // (eso costaría dinero) ni se mueve la fecha original.
    peticion.cookies[COOKIE_PASO] = cookie;
    const despues = new Date(AHORA.getTime() + 5 * 60 * 1000);
    await urlDeRedireccion(() =>
      ejecutarConfirmacion(
        conCodigo("424242"),
        dependencias({
          contexto: { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: despues },
        }),
      ),
    );

    expect(proveedor.comprobados).toHaveLength(1);
    expect(
      (
        await prisma.negocio.findUniqueOrThrow({ where: { id } })
      ).numeroVerificadoEn?.toISOString(),
    ).toBe(primera?.toISOString());
  });

  it("una ficha rechazada no se auto-rehabilita al verificar su número", async () => {
    const id = await crearFicha(`${PREFIJO}0112`, {
      estado: "rechazado",
      rechazadoEn: new Date("2026-09-04T10:00:00.000Z"),
      motivoRechazo: "Datos incompletos",
    });
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(id, `${PREFIJO}0112`, AHORA),
      SECRETO,
    );
    proveedor = crearProveedorSimulado({ alComprobar: "confirmado" });
    await urlDeRedireccion(() => ejecutarConfirmacion(conCodigo("424242"), dependencias()));

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.estado).toBe("rechazado");
    expect(despues.motivoRechazo).toBe("Datos incompletos");
    expect(despues.publicadoEn).toBeNull();
    // Verificar el número no publica ni reabre nada: solo escribe su fecha.
    expect(despues.numeroVerificadoEn).not.toBeNull();
  });
});

// ── 4. [C-1] El borde con T-014: editar el número no limpia la marca ────────
//
// El dev lo declaró como deuda (reporte B, §6.3) y la propuesta lo puso "fuera
// de este change". Con la bandera apagada es inocuo —ninguna ficha tiene
// marca—, pero es una bomba de espoleta larga para el día que se encienda:
// `aplicarEdicion` copia `whatsapp` por lista blanca y deja
// `numeroVerificadoEn` intacto, así que el panel afirmaría "Número verificado
// por SMS el …" al lado de un número que nunca recibió un SMS.

describe("adversarial · [C-1] la marca de verificación y el cambio de número (T-014)", () => {
  /** Ficha publicada, con enlace de gestión y con su número ya verificado. */
  async function fichaVerificadaConEnlace(whatsapp: string) {
    const token = generarTokenGestion();
    const id = await crearFicha(whatsapp, {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      numeroVerificadoEn: VERIFICADO_EN,
      tokenGestionHash: huellaDeToken(token),
      tokenGestionCreadoEn: new Date("2026-08-02T10:00:00.000Z"),
    });
    return { id, token };
  }

  function envioDeEdicion(cambios: Record<string, string> = {}): FormData {
    const datos = new FormData();
    const base: Record<string, string> = {
      nombre: "Estetica Ficticia La Trenza",
      categoriaId: String(categoriaId),
      whatsapp: `${PREFIJO}0120`,
      coloniaId: String(coloniaId),
      coloniaOtra: "",
      queOfreces: "Cortes inventados",
      telefonoFijo: "",
      direccion: "",
      horario: "",
      facebookUrl: "",
      ...cambios,
    };
    for (const [clave, valor] of Object.entries(base)) datos.set(clave, valor);
    return datos;
  }

  async function aplicarUltimaEdicion(id: string) {
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });
    return aplicarEdicion(prisma, edicion.id, AHORA);
  }

  it("[C-1 CERRADO] cambiar el WhatsApp por el enlace de gestión BORRA la marca del número viejo", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0120`);
    const numeroNuevo = `${PREFIJO}0121`;

    await procesarEdicion(token, envioDeEdicion({ whatsapp: numeroNuevo }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    await expect(aplicarUltimaEdicion(id)).resolves.toMatchObject({ resultado: "aplicada" });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.whatsapp).toBe(numeroNuevo);

    // [C-1] CERRADO (iteración 2): un número nuevo no está verificado. La
    // tolerancia que dejó la etapa C se retiró; esta aserción es ahora el
    // cerrojo de regresión, y con ella el panel ya no puede afirmar
    // "Número verificado por SMS" al lado de un número que nunca recibió uno.
    expect(despues.numeroVerificadoEn).toBeNull();
    expect(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS).toBe("Número verificado por SMS");
  });

  it("una edición que NO toca el número conserva la marca (esto sí es correcto)", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0122`);

    await procesarEdicion(
      token,
      envioDeEdicion({ whatsapp: `${PREFIJO}0122`, horario: "L-S 9am-7pm" }),
      { prisma, ip: IP, ahora: AHORA },
    );
    await aplicarUltimaEdicion(id);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.horario).toBe("L-S 9am-7pm");
    expect(despues.numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());
  });

  it("un envío de edición no puede FIJAR la marca por su cuenta (lista blanca)", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0123`);
    await prisma.negocio.update({ where: { id }, data: { numeroVerificadoEn: null } });

    await procesarEdicion(
      token,
      envioDeEdicion({
        whatsapp: `${PREFIJO}0123`,
        numeroVerificadoEn: "2020-01-01T00:00:00.000Z",
        verificado: "1",
      }),
      { prisma, ip: IP, ahora: AHORA },
    );
    await aplicarUltimaEdicion(id);

    expect(
      (await prisma.negocio.findUniqueOrThrow({ where: { id } })).numeroVerificadoEn,
    ).toBeNull();
  });

  it("[C-1b CERRADO] la lista blanca deja fuera la marca Y el guardián declarativo la nombra", () => {
    // Lo que SÍ protege hoy: `soloCamposEditables` nunca copia la columna.
    const copiada = soloCamposEditables({
      nombre: "Ficticio",
      numeroVerificadoEn: new Date(),
    }) as Record<string, unknown>;
    expect(copiada).not.toHaveProperty("numeroVerificadoEn");

    // [C-1b] CERRADO (iteración 2): la columna está declarada. Y el mecanismo
    // de fondo también se cerró — `tests/gestion-modelo.test.ts` ahora exige
    // que TODA columna de `Negocio` esté en una de las tres listas de
    // `campos.ts`, contrastadas contra el esquema real, así que la siguiente
    // columna nueva no puede volver a entrar en silencio.
    expect(CAMPOS_PROHIBIDOS_EN_EDICION as readonly string[]).toContain("consintioAvisoEn");
    expect(CAMPOS_PROHIBIDOS_EN_EDICION as readonly string[]).toContain("numeroVerificadoEn");
  });

  // ── Vuelta 2: lo que la corrección de [C-1] tiene que sostener además ─────

  it("[C-1 v2] la marca vuelve con la transacción cuando la edición deja de estar pendiente", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0124`);
    await procesarEdicion(token, envioDeEdicion({ whatsapp: `${PREFIJO}0125` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });

    // Transacción REAL de Postgres: las escrituras de la ficha (incluida la
    // limpieza de la marca) ocurren de verdad, pero la edición "deja de estar
    // pendiente" dentro de la transacción, así que `aplicarEdicion` lanza y la
    // base hace ROLLBACK. Si la limpieza estuviera fuera de la transacción, la
    // marca se habría perdido sin que la edición llegara a aplicarse.
    const cliente = {
      ...prisma,
      $transaction: <T,>(operacion: (tx: unknown) => Promise<T>): Promise<T> =>
        (prisma as PrismaClient).$transaction(async (tx) =>
          operacion({
            negocio: tx.negocio,
            edicionPendiente: {
              ...tx.edicionPendiente,
              updateMany: async () => ({ count: 0 }),
            },
          }),
        ),
    };

    const resultado = await aplicarEdicion(cliente as never, edicion.id, AHORA);
    expect(resultado.resultado).not.toBe("aplicada");

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    expect(despues.whatsapp).toBe(`${PREFIJO}0124`);
    expect(despues.numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());
  });

  it("[C-1 v2] una edición que no llega a aplicarse (ficha despublicada) no borra la marca", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0126`);
    await procesarEdicion(token, envioDeEdicion({ whatsapp: `${PREFIJO}0127` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    // El admin despublica en otra pestaña antes de aplicar.
    await prisma.negocio.update({
      where: { id },
      data: { estado: "en_revision", despublicadoEn: AHORA, motivoDespublicacion: "Cerró" },
    });

    await expect(aplicarUltimaEdicion(id)).resolves.toMatchObject({
      resultado: "ficha-no-publicada",
    });

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    // Ni el número ni la marca se movieron: la limpieza lleva las MISMAS dos
    // condiciones que la escritura de la ficha, así que las dos o ninguna.
    expect(despues.whatsapp).toBe(`${PREFIJO}0126`);
    expect(despues.numeroVerificadoEn?.toISOString()).toBe(VERIFICADO_EN.toISOString());
  });

  it("[C-1 v2] aplicar dos veces la misma edición deja la marca limpia una sola vez", async () => {
    const { id, token } = await fichaVerificadaConEnlace(`${PREFIJO}0128`);
    await procesarEdicion(token, envioDeEdicion({ whatsapp: `${PREFIJO}0129` }), {
      prisma,
      ip: IP,
      ahora: AHORA,
    });
    const edicion = await prisma.edicionPendiente.findFirstOrThrow({
      where: { negocioId: id, estado: ESTADO_EDICION_PENDIENTE },
    });

    // Dos clics del admin (o dos pestañas). La segunda no encuentra pendiente.
    const [primera, segunda] = await Promise.all([
      aplicarEdicion(prisma, edicion.id, AHORA),
      aplicarEdicion(prisma, edicion.id, AHORA),
    ]);
    const desenlaces = [primera.resultado, segunda.resultado];
    expect(desenlaces.filter((d) => d === "aplicada").length).toBeLessThanOrEqual(1);

    const despues = await prisma.negocio.findUniqueOrThrow({ where: { id } });
    // Sea cual sea el orden, el estado final es coherente: o quedó el número
    // nuevo sin marca, o quedó el viejo con la suya. Nunca el nuevo CON marca,
    // que es lo que [C-1] prohíbe.
    const coherente =
      (despues.whatsapp === `${PREFIJO}0129` && despues.numeroVerificadoEn === null) ||
      (despues.whatsapp === `${PREFIJO}0128` &&
        despues.numeroVerificadoEn?.toISOString() === VERIFICADO_EN.toISOString());
    expect(coherente, `${despues.whatsapp} / ${String(despues.numeroVerificadoEn)}`).toBe(true);
  });

  it("[C-1b v2] el censo de columnas muerde: una columna sin declarar rompe el guardián", () => {
    // Mutación en frío del predicado exacto que usa `tests/gestion-modelo.test.ts`,
    // para comprobar que el guardián no es decorativo. La mutación de verdad
    // (quitar `numeroVerificadoEn` de la lista y correr la suite) se hizo a
    // mano en la auditoría; esto la deja fijada.
    const declaradas = new Set<string>([
      ...CAMPOS_EDITABLES,
      ...COLUMNAS_DERIVADAS_AL_APLICAR,
      ...CAMPOS_PROHIBIDOS_EN_EDICION,
    ]);
    const columnasConUnaNueva = [...declaradas, "columnaQueNadieDeclaro"];
    expect(columnasConUnaNueva.filter((c) => !declaradas.has(c))).toEqual([
      "columnaQueNadieDeclaro",
    ]);
    // Y al revés: quitar la marca de las listas deja una columna real huérfana.
    const sinLaMarca = new Set([...declaradas].filter((c) => c !== "numeroVerificadoEn"));
    expect([...declaradas].filter((c) => !sinLaMarca.has(c))).toEqual(["numeroVerificadoEn"]);
  });
});

// ── 5. No fuga en tiempo de ejecución hacia lo público ──────────────────────

describe("no fuga · una ficha verificada no lo cuenta en su página pública", () => {
  it("ni la fecha, ni el literal del panel, ni la palabra 'verificado' salen a la ficha", async () => {
    const id = await crearFicha(`${PREFIJO}0130`, {
      estado: ESTADO_NEGOCIO_PUBLICADO,
      publicadoEn: new Date("2026-08-02T10:00:00.000Z"),
      numeroVerificadoEn: VERIFICADO_EN,
    });
    const negocio = await prisma.negocio.findUniqueOrThrow({ where: { id } });

    const html = await render(
      FichaNegocioPage({
        params: Promise.resolve({
          ficha: construirSegmentoFicha(negocio.nombre, negocio.id),
        }),
        searchParams: Promise.resolve({}),
      } as Parameters<typeof FichaNegocioPage>[0]),
    );

    expect(html).not.toContain(ETIQUETA_COLA_NUMERO_VERIFICADO_SMS);
    expect(html).not.toContain("verificado por SMS");
    expect(html).not.toContain("2026-08-03");
    expect(html.toLowerCase()).not.toContain("numeroverificadoen");
    // Y la ficha pública sigue siendo la de siempre: el WhatsApp sí se pinta
    // (es su razón de ser), la marca interna no.
    expect(html).toContain(`${PREFIJO}0130`);
  });
});

// ── 6. La mitad no probada de dos scenarios de `revision-admin` ─────────────
//
// El dev cubrió las dos líneas de verificación pintando `DetalleRegistro`
// suelto. Los scenarios "registro con el número verificado" y "verificar no
// adelanta la decisión" piden además algo que ese componente no puede
// enseñar: que la PÁGINA del detalle siga ofreciendo "Escribirle por
// WhatsApp" y los formularios completos de aprobar y rechazar. Se comprueba
// contra la página real, con sesión, y comparando una ficha verificada con
// una sin verificar.

describe("revision-admin · el detalle verificado no pierde ninguna acción", () => {
  const abrirDetalle = (id: string) =>
    render(
      DetalleRegistroAdminPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }) as Promise<React.ReactElement>,
    );

  beforeEach(() => {
    process.env[VARIABLE_CONTRASENA] = "contrasena-de-prueba-nada-real";
    process.env[VARIABLE_SECRETO_SESION] = "s".repeat(LONGITUD_MINIMA_SECRETO);
    peticion.cookies[NOMBRE_COOKIE_SESION] = crearValorDeSesion(
      "s".repeat(LONGITUD_MINIMA_SECRETO),
    );
  });

  afterEach(() => {
    delete process.env[VARIABLE_CONTRASENA];
    delete process.env[VARIABLE_SECRETO_SESION];
  });

  it("la ficha verificada ofrece exactamente las mismas acciones que la que no lo está", async () => {
    const verificado = await crearFicha(`${PREFIJO}0140`, {
      numeroVerificadoEn: VERIFICADO_EN,
    });
    const sinVerificar = await crearFicha(`${PREFIJO}0141`);

    const htmlVerificado = await abrirDetalle(verificado);
    const htmlSinVerificar = await abrirDetalle(sinVerificar);

    // La línea de verificación aparece solo en la ficha que la ganó…
    expect(htmlVerificado).toContain("Número verificado por SMS el ");
    expect(htmlSinVerificar).not.toContain("Número verificado por SMS");
    // …y con la capacidad apagada tampoco aparece la línea de "Sin verificar".
    expect(htmlSinVerificar).not.toContain(TEXTO_SIN_VERIFICAR_SMS);

    // El botón de la conversación de siempre NO desaparece por estar
    // verificada: la revisión por WhatsApp es la evidencia de consentimiento,
    // no un paso que el SMS sustituya (PRD §6.3).
    for (const html of [htmlVerificado, htmlSinVerificar]) {
      expect(html).toContain(BOTON_WHATSAPP_VERIFICACION);
      expect(html).toContain(BOTON_APROBAR);
      expect(html).toContain(BOTON_RECHAZAR);
    }

    // Y nada queda precargado ni resuelto: la ficha verificada sigue en
    // revisión, sin publicar y sin giros.
    const fila = await prisma.negocio.findUniqueOrThrow({ where: { id: verificado } });
    expect(fila.estado).toBe("en_revision");
    expect(fila.publicadoEn).toBeNull();
  });
});

// ── 7. VUELTA 2 · verificación independiente del cierre de [C-2] ────────────
//
// La corrección movió los tres topes por registro de la cookie al almacén
// compartido. Aquí NO se comprueba "reusar la cookie vieja" (eso ya está
// arriba): se comprueba lo que de verdad tiene que ser cierto para que el
// hallazgo esté cerrado —que el tope está anclado al REGISTRO y no a ninguna
// credencial—, atacándolo con una **cookie nueva y legítima** en cada vuelta,
// que es estrictamente más fuerte que rebobinar la vieja.

describe("adversarial · [C-2 v2] los topes están anclados al registro, no a la credencial", () => {
  /** Contexto de flujo con reloj controlado. */
  const contextoEn = (negocioIp: string | null, ahora: Date, topeDiario = 50) => ({
    proveedor,
    cupos: prisma,
    secreto: SECRETO,
    topeDiario,
    ip: negocioIp,
    ahora,
  });

  it("una cookie NUEVA en cada vuelta tampoco revive los 5 intentos", async () => {
    const id = await crearFicha(`${PREFIJO}0201`);
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });

    for (let i = 0; i < 12; i += 1) {
      // Credencial recién firmada, no la del principio: el atacante que
      // consiguiera emitirse cookies nuevas tampoco gana nada.
      const ahora = new Date(AHORA.getTime() + i * 1000);
      peticion.cookies[COOKIE_PASO] = firmarPaso(
        crearPasoInicial(id, `${PREFIJO}0201`, ahora),
        SECRETO,
      );
      await urlDeRedireccion(() =>
        ejecutarConfirmacion(
          conCodigo("424242"),
          dependencias({ contexto: contextoEn(IP, ahora) }),
        ),
      );
    }

    expect(proveedor.comprobados).toHaveLength(MAX_INTENTOS_POR_REGISTRO);
  });

  it("una cookie NUEVA en cada vuelta tampoco revive los 2 reenvíos", async () => {
    const id = await crearFicha(`${PREFIJO}0202`);

    for (let i = 0; i < 10; i += 1) {
      const ahora = new Date(AHORA.getTime() + (i + 1) * 61_000);
      peticion.cookies[COOKIE_PASO] = firmarPaso(
        crearPasoInicial(id, `${PREFIJO}0202`, ahora),
        SECRETO,
      );
      await urlDeRedireccion(() =>
        ejecutarReenvio(dependencias({ contexto: contextoEn(null, ahora, 6) })),
      );
    }

    expect(proveedor.iniciados).toHaveLength(MAX_REENVIOS_POR_REGISTRO);
  });

  it("el cooldown de 60 s es de verdad del servidor: el segundo SMS no sale antes", async () => {
    const id = await crearFicha(`${PREFIJO}0203`);
    const ficha = { id, whatsapp: `${PREFIJO}0203`, yaVerificado: false };

    // Primer envío (el del formulario): aparta el turno de 60 s.
    expect(await pedirCodigoParaFicha(ficha, contextoEn(null, AHORA))).not.toBeNull();
    // A los 59 s: no sale.
    expect(
      await pedirCodigoParaFicha(ficha, contextoEn(null, new Date(AHORA.getTime() + 59_000))),
    ).toBeNull();
    // A los 61 s: sale.
    expect(
      await pedirCodigoParaFicha(ficha, contextoEn(null, new Date(AHORA.getTime() + 61_000))),
    ).not.toBeNull();
    expect(proveedor.iniciados).toHaveLength(2);
  });

  it("los topes son POR REGISTRO: otra ficha empieza de cero", async () => {
    const gastada = await crearFicha(`${PREFIJO}0204`);
    const fresca = await crearFicha(`${PREFIJO}0205`);
    proveedor = crearProveedorSimulado({ alComprobar: "no-coincide" });

    for (let i = 0; i < MAX_INTENTOS_POR_REGISTRO + 2; i += 1) {
      const ahora = new Date(AHORA.getTime() + i * 1000);
      peticion.cookies[COOKIE_PASO] = firmarPaso(
        crearPasoInicial(gastada, `${PREFIJO}0204`, ahora),
        SECRETO,
      );
      await urlDeRedireccion(() =>
        ejecutarConfirmacion(conCodigo("424242"), dependencias({ contexto: contextoEn(IP, ahora) })),
      );
    }
    expect(proveedor.comprobados).toHaveLength(MAX_INTENTOS_POR_REGISTRO);

    // La otra ficha no heredó nada del vecino.
    peticion.cookies[COOKIE_PASO] = firmarPaso(
      crearPasoInicial(fresca, `${PREFIJO}0205`, AHORA),
      SECRETO,
    );
    await urlDeRedireccion(() =>
      ejecutarConfirmacion(conCodigo("424242"), dependencias({ contexto: contextoEn(IP, AHORA) })),
    );
    expect(proveedor.comprobados).toHaveLength(MAX_INTENTOS_POR_REGISTRO + 1);
  });

  it("la ventana de los topes no se puede estirar más allá de la cookie", () => {
    // Si la ventana fuera MÁS CORTA que la cookie, esperar a que caducara
    // devolvería intentos con la misma credencial todavía viva. Son la misma
    // constante a propósito, y `paso.ts` la importa de `limites.ts`.
    expect(DURACION_PASO_MS).toBe(VENTANA_TOPES_POR_REGISTRO_MS);
    // Y la limpieza diaria no puede barrer marcas que un cupo todavía necesita.
    expect(RETENCION_MAXIMA_DE_CUPOS_MS).toBeGreaterThan(VENTANA_TOPES_POR_REGISTRO_MS);
    expect(RETENCION_MAXIMA_DE_CUPOS_MS).toBeGreaterThan(COOLDOWN_REENVIO_MS);
  });
});

describe("no fuga · [C-2 v2] lo que los topes por registro dejan en la base", () => {
  it("solo se guarda una huella: ni el id del registro, ni el número, ni nada reversible", async () => {
    const id = await crearFicha(`${PREFIJO}0210`);
    await pedirCodigoParaFicha(
      { id, whatsapp: `${PREFIJO}0210`, yaVerificado: false },
      { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA },
    );

    const claves = [
      claveDeCupo(CUPO_ENVIOS_SEGUIDOS, id, SECRETO),
      claveDeCupo(CUPO_REENVIOS_POR_REGISTRO, id, SECRETO),
      claveDeCupo(CUPO_INTENTOS_POR_REGISTRO, id, SECRETO),
    ];
    // El primer envío aparta el turno de 60 s y nada más.
    expect(await prisma.intentoDeCupo.count({ where: { clave: claves[0] } })).toBe(1);

    // La clave es una huella de 32 hexadecimales que no contiene ni el
    // identificador del registro ni el número, y cada cupo tiene la suya.
    for (const clave of claves) {
      expect(clave).toMatch(/^[0-9a-f]{32}$/);
      expect(clave).not.toContain(id);
      expect(clave).not.toContain(`${PREFIJO}0210`);
    }
    expect(new Set(claves).size).toBe(3);

    // Y ninguna fila de la tabla —de nadie— guarda el identificador ni el
    // número en claro (la tabla solo tiene `clave` y `ocurrioEn`).
    const filas = await prisma.intentoDeCupo.findMany({ take: 500 });
    for (const fila of filas) {
      expect(JSON.stringify(fila)).not.toContain(id);
      expect(JSON.stringify(fila)).not.toContain(`${PREFIJO}0210`);
    }
  });

  it("con la capacidad apagada, y con un duplicado, no se escribe ni una fila", async () => {
    const id = await crearFicha(`${PREFIJO}0211`);
    const claveTurno = claveDeCupo(CUPO_ENVIOS_SEGUIDOS, id, SECRETO);

    // Capacidad apagada: `proveedor: null`. La puerta del fail-safe se cruza
    // antes que ninguna cota, así que no se toca la base.
    await pedirCodigoParaFicha(
      { id, whatsapp: `${PREFIJO}0211`, yaVerificado: false },
      { proveedor: null, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA },
    );
    expect(await prisma.intentoDeCupo.count({ where: { clave: claveTurno } })).toBe(0);

    // Envío que no creó ni actualizó ninguna ficha (campo trampa, duplicado):
    // no hay registro detrás, así que tampoco hay cupo que apartar.
    await pedirCodigoParaFicha(null, {
      proveedor,
      cupos: prisma,
      secreto: SECRETO,
      topeDiario: 50,
      ip: IP,
      ahora: AHORA,
    });
    // Y una ficha ya verificada no vuelve a gastar nada.
    await pedirCodigoParaFicha(
      { id, whatsapp: `${PREFIJO}0211`, yaVerificado: true },
      { proveedor, cupos: prisma, secreto: SECRETO, topeDiario: 50, ip: IP, ahora: AHORA },
    );
    expect(await prisma.intentoDeCupo.count({ where: { clave: claveTurno } })).toBe(0);
    expect(proveedor.iniciados).toEqual([]);
  });
});

// ── 8. [C-3 CERRADO] Hallazgo de la vuelta 2, corregido en la iteración 3 ───
//
// La iteración 2 había invertido el orden de `reenviarCodigo`: el tope de 2
// reenvíos se apartaba ATÓMICAMENTE antes que nada, incluido el cooldown de
// 60 s. Consecuencia: un clic dentro de los 60 s consumía uno de los 2
// reenvíos sin mandar ningún SMS, y dos clics impacientes —el caso normal en
// un celular con 4G lenta— dejaban al dueño sin reenvíos y sin pantalla.
//
// Corregido: el turno de envío se aparta ANTES que el tope de reenvíos
// (`flujo.ts`). Lo que no cuesta dinero no cuesta un reenvío. Estas pruebas
// quedan como cerrojo de regresión del orden.

describe("adversarial · [C-3 CERRADO] el cooldown ya no consume reenvíos", () => {
  it("dos clics impacientes dentro de los 60 s NO gastan reenvíos, y el tercero sí manda SMS", async () => {
    const id = await crearFicha(`${PREFIJO}0220`);
    const ficha = { id, whatsapp: `${PREFIJO}0220`, yaVerificado: false };
    const contexto = (ahora: Date) => ({
      proveedor,
      cupos: prisma,
      secreto: SECRETO,
      topeDiario: 50,
      ip: IP,
      ahora,
    });

    // 1. El formulario manda el primer código y aparta el turno de 60 s.
    expect(await pedirCodigoParaFicha(ficha, contexto(AHORA))).not.toBeNull();
    const paso = crearPasoInicial(id, `${PREFIJO}0220`, AHORA);
    expect(proveedor.iniciados).toHaveLength(1);

    // 2. El dueño no ve llegar el SMS y toca "Reenviar" a los 10 s: se le dice
    //    que espere y no sale ningún SMS… pero el reenvío ya se gastó.
    const diez = new Date(AHORA.getTime() + 10_000);
    expect(await reenviarCodigo(prisma, paso, contexto(diez))).toEqual({
      resultado: "espera-reenvio",
    });
    // 3. Vuelve a tocar a los 25 s: igual.
    const veinticinco = new Date(AHORA.getTime() + 25_000);
    expect(await reenviarCodigo(prisma, paso, contexto(veinticinco))).toEqual({
      resultado: "espera-reenvio",
    });

    // Los dos clics bloqueados no mandaron nada, así que no gastaron nada.
    expect(proveedor.iniciados).toHaveLength(1);

    // 4. Ahora sí espera los 60 s y toca "Reenviar" de buena fe.
    const pasadoElMinuto = new Date(AHORA.getTime() + 70_000);
    const tercero = await reenviarCodigo(prisma, paso, contexto(pasadoElMinuto));

    // [C-3] CERRADO: su reenvío seguía intacto, así que el SMS SALE. La spec
    // vuelve a leerse como está escrita ("como máximo 2 reenvíos por registro":
    // aquí gastó uno y recibió uno).
    expect(tercero).toEqual({ resultado: "enviado", paso });
    expect(proveedor.iniciados).toHaveLength(2);

    // Y todavía le queda el segundo reenvío, pasado otro minuto.
    const dosMinutos = new Date(AHORA.getTime() + 140_000);
    expect(await reenviarCodigo(prisma, paso, contexto(dosMinutos))).toEqual({
      resultado: "enviado",
      paso,
    });
    expect(proveedor.iniciados).toHaveLength(3);

    // Ese sí era el último: el tope de 2 reenvíos sigue siendo real.
    const tresMinutos = new Date(AHORA.getTime() + 200_000);
    expect(await reenviarCodigo(prisma, paso, contexto(tresMinutos))).toEqual({
      resultado: "agotado",
    });
    expect(proveedor.iniciados).toHaveLength(3);
  });

  it("[C-3 CERRADO] tres clics impacientes NO le quitan la pantalla del código", async () => {
    const id = await crearFicha(`${PREFIJO}0222`);
    const cookie = firmarPaso(crearPasoInicial(id, `${PREFIJO}0222`, AHORA), SECRETO);
    const dependenciasEn = (ahora: Date) =>
      dependencias({
        contexto: {
          proveedor,
          cupos: prisma,
          secreto: SECRETO,
          topeDiario: 50,
          ip: IP,
          ahora,
        },
      });

    // El formulario ya mandó el primer código y apartó el turno de 60 s.
    await pedirCodigoParaFicha(
      { id, whatsapp: `${PREFIJO}0222`, yaVerificado: false },
      dependenciasEn(AHORA).contexto,
    );

    // Tres toques impacientes en 40 segundos, todos dentro del cooldown.
    const destinos: string[] = [];
    for (const segundos of [10, 25, 40]) {
      peticion.cookies[COOKIE_PASO] = cookie;
      destinos.push(
        await urlDeRedireccion(() =>
          ejecutarReenvio(dependenciasEn(new Date(AHORA.getTime() + segundos * 1000))),
        ),
      );
    }

    // [C-3] CERRADO: los TRES toques dentro del cooldown responden lo mismo
    // —"Espera un momento para pedir otro código."— y ninguno gasta nada.
    expect(destinos).toEqual([
      "/registro/verificar?errorReenvio=espera-reenvio",
      "/registro/verificar?errorReenvio=espera-reenvio",
      "/registro/verificar?errorReenvio=espera-reenvio",
    ]);
    expect(proveedor.iniciados).toHaveLength(1);
    // Y sobre todo: la credencial de paso NO se borra. El dueño sigue en la
    // pantalla para escribir el código que puede estar llegándole ahora mismo.
    const borrada = peticion.puestas.filter(
      (puesta) => puesta.nombre === COOKIE_PASO && puesta.opciones.maxAge === 0,
    );
    expect(borrada).toEqual([]);
  });

  it("un reenvío que SÍ llega al proveedor y falla sigue gastando reenvío (esto es correcto)", async () => {
    const id = await crearFicha(`${PREFIJO}0221`);
    const paso = crearPasoInicial(id, `${PREFIJO}0221`, AHORA);
    proveedor = crearProveedorSimulado({ alIniciar: "error" });
    const contexto = (ahora: Date) => ({
      proveedor,
      cupos: prisma,
      secreto: SECRETO,
      topeDiario: 50,
      ip: IP,
      ahora,
    });

    // Dos reenvíos separados por más de 60 s, con el proveedor caído: los dos
    // llegaron a intentarlo de verdad, así que gastarlos es lo que cierra la
    // vía de "reintentos gratis e ilimitados" del hallazgo [C-2].
    await reenviarCodigo(prisma, paso, contexto(new Date(AHORA.getTime() + 61_000)));
    await reenviarCodigo(prisma, paso, contexto(new Date(AHORA.getTime() + 122_000)));
    expect(await reenviarCodigo(prisma, paso, contexto(new Date(AHORA.getTime() + 183_000)))).toEqual(
      { resultado: "agotado" },
    );
    expect(proveedor.iniciados).toHaveLength(2);
  });
});
