import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedCatalogos } from "../prisma/seed";
import type { PrismaClient } from "../src/generated/prisma/client";
import { obtenerColaDeRevision } from "../src/lib/admin/consultas";
import { reiniciarLimitePorIp } from "../src/lib/registro/limite-ip";
import { procesarRegistro } from "../src/lib/registro/procesar";
import { MENSAJES_ERROR_REGISTRO } from "../src/lib/registro/textos";
import { CAMPO_TRAMPA } from "../src/lib/registro/validacion";
import { crearClientePrueba } from "./db";

// Spec: registro-negocio (MODIFIED por agregar-panel-admin) · Requirement "Una
// sola ficha por número de WhatsApp": el reenvío tras un rechazo (tasks.md
// #22, design.md §6).
//
// Datos 100% ficticios (repo público + LFPDPPP): serie de pruebas 7719994xxx.

const IP = "203.0.113.10"; // TEST-NET-3, reservado para documentación
const NUMERO = "7719994001";
const AHORA = new Date("2026-09-03T12:00:00.000Z");
const MOTIVO_DEL_RECHAZO = "El número no contesta (motivo ficticio)";

let prisma: PrismaClient;
let categoriaId: number;
let otraCategoriaId: number;
let coloniaId: number;
let giroId: number;

beforeAll(async () => {
  prisma = crearClientePrueba();
  await seedCatalogos(prisma);
  categoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "servicios-del-hogar" } })
  ).id;
  otraCategoriaId = (
    await prisma.categoria.findUniqueOrThrow({ where: { slug: "talleres" } })
  ).id;
  coloniaId = (
    await prisma.colonia.findUniqueOrThrow({ where: { slug: "haciendas-de-tizayuca" } })
  ).id;
  giroId = (await prisma.giro.findFirstOrThrow({ orderBy: { id: "asc" } })).id;
});

afterAll(async () => {
  await prisma.negocio.deleteMany();
  await prisma.$disconnect();
});

beforeEach(async () => {
  reiniciarLimitePorIp();
  await prisma.negocio.deleteMany();
});

/** Ficha vieja del mismo número, en el estado que pida el test. */
async function fichaPrevia(estado: string) {
  return prisma.negocio.create({
    data: {
      nombre: "Plomería Ficticia La de Antes",
      categoriaId,
      coloniaId,
      whatsapp: NUMERO,
      queOfreces: "Lo que ofrecía antes de corregir.",
      telefonoFijo: "7717774001",
      estado,
      origen: "siembra",
      tokenGestion: "token-ficticio-de-prueba",
      consintioAvisoEn: new Date("2026-08-20T09:00:00.000Z"),
      registradoEn: new Date("2026-08-20T09:00:00.000Z"),
      ...(estado === "rechazado"
        ? {
            rechazadoEn: new Date("2026-08-21T10:00:00.000Z"),
            motivoRechazo: MOTIVO_DEL_RECHAZO,
          }
        : {}),
      ...(estado === "publicado"
        ? { publicadoEn: new Date("2026-08-21T10:00:00.000Z") }
        : {}),
      giros: { connect: [{ id: giroId }] },
    },
    include: { giros: true },
  });
}

/** Envío corregido: mismo número, datos nuevos. */
function envioCorregido(extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const campos: Record<string, string> = {
    nombre: "Plomería Ficticia Ya Corregida",
    categoriaId: String(otraCategoriaId),
    whatsapp: NUMERO,
    coloniaId: String(coloniaId),
    queOfreces: "Ahora sí describimos bien lo que hacemos.",
    horario: "L-S 9am-7pm",
    consentimiento: "on",
    ...extra,
  };
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== "") formData.append(clave, valor);
  }
  return formData;
}

const procesar = (formData: FormData, ip: string | null = IP) =>
  procesarRegistro(formData, { prisma, ip, ahora: AHORA });

const leer = () =>
  prisma.negocio.findUniqueOrThrow({ where: { whatsapp: NUMERO }, include: { giros: true } });

describe("registro-negocio · el duplicado sigue siendo duplicado", () => {
  // Scenario: número con ficha publicada
  // Scenario: número con ficha en revisión
  it.each(["publicado", "en_revision"])(
    "con una ficha %s se rechaza el envío y no se toca nada",
    async (estado) => {
      const previa = await fichaPrevia(estado);

      const resultado = await procesar(envioCorregido());

      expect(resultado.exito).toBe(false);
      if (resultado.exito) return;
      expect(resultado.estado.errores.whatsapp).toBe(
        MENSAJES_ERROR_REGISTRO.whatsappDuplicado,
      );

      const despues = await leer();
      expect(despues.nombre).toBe(previa.nombre);
      expect(despues.estado).toBe(estado);
      expect(despues.categoriaId).toBe(categoriaId);
      expect(await prisma.negocio.count()).toBe(1);
    },
  );
});

describe("registro-negocio · reenvío tras un rechazo", () => {
  // Scenario: reenvío tras un rechazo
  it("actualiza la misma ficha, la regresa a revisión y borra el rastro del rechazo", async () => {
    const previa = await fichaPrevia("rechazado");

    const resultado = await procesar(envioCorregido());
    expect(resultado).toEqual({ exito: true });

    // Una sola ficha por número: se actualizó, no se creó otra.
    expect(await prisma.negocio.count()).toBe(1);

    const despues = await leer();
    expect(despues.id).toBe(previa.id);
    expect(despues.nombre).toBe("Plomería Ficticia Ya Corregida");
    expect(despues.categoriaId).toBe(otraCategoriaId);
    expect(despues.queOfreces).toBe("Ahora sí describimos bien lo que hacemos.");
    expect(despues.horario).toBe("L-S 9am-7pm");
    // Lo que ya no mandó se limpia: no quedan restos del envío anterior.
    expect(despues.telefonoFijo).toBeNull();

    expect(despues.estado).toBe("en_revision");
    expect(despues.rechazadoEn).toBeNull();
    expect(despues.motivoRechazo).toBeNull();
    // Reloj de espera reiniciado (es el que mide las 48 horas del panel).
    expect(despues.registradoEn.toISOString()).toBe(AHORA.toISOString());
  });

  /**
   * Hallazgo MEDIO 4 de la etapa C. `consintioAvisoEn` es la constancia
   * LFPDPPP de que el titular consintió el aviso (PRD §8) y este formulario es
   * anónimo: quien reenvía puede no ser el dueño. Pisarla cambiaría la
   * evidencia del titular por una atribuible a un tercero.
   */
  it("conserva la constancia de consentimiento original, no la del reenvío", async () => {
    const previa = await fichaPrevia("rechazado");

    await procesar(envioCorregido());

    const despues = await leer();
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
    expect(despues.consintioAvisoEn.toISOString()).not.toBe(AHORA.toISOString());
    // Y la ficha nunca queda sin consentimiento: el envío nuevo tuvo que
    // marcar el checkbox para llegar hasta aquí (lo exige `validarRegistro`).
    expect(despues.consintioAvisoEn).toBeInstanceOf(Date);
  });

  it("vuelve a la cola del panel como recién llegada, sin marca de atraso", async () => {
    await fichaPrevia("rechazado");
    await procesar(envioCorregido());

    const cola = await obtenerColaDeRevision(prisma, AHORA);
    expect(cola).toHaveLength(1);
    expect(cola[0].nombre).toBe("Plomería Ficticia Ya Corregida");
    expect(cola[0].atrasado).toBe(false);
    expect(cola[0].esperaTexto).toBe("Hace menos de una hora");
  });

  // Scenario: el formulario no delata el rechazo
  it("el dueño ve la misma pantalla de gracias, sin motivo ni datos anteriores", async () => {
    await fichaPrevia("rechazado");
    const resultado = await procesar(envioCorregido());

    const devuelto = JSON.stringify(resultado);
    expect(devuelto).not.toContain(MOTIVO_DEL_RECHAZO);
    expect(devuelto).not.toContain("rechaz");
    expect(devuelto).not.toContain("Plomería Ficticia La de Antes");
  });

  // Scenario: el reenvío no se autopublica
  it("ignora estado, origen, giros y fecha de publicación mandados en el envío", async () => {
    const previa = await fichaPrevia("rechazado");

    await procesar(
      envioCorregido({
        estado: "publicado",
        origen: "organico",
        publicadoEn: "2026-09-03T00:00:00.000Z",
        giros: String(giroId),
        tokenGestion: "token-inventado-por-el-cliente",
      }),
    );

    const despues = await leer();
    expect(despues.estado).toBe("en_revision");
    expect(despues.publicadoEn).toBeNull();
    // El origen y el token los fija el servidor: quedan como estaban.
    expect(despues.origen).toBe("siembra");
    expect(despues.tokenGestion).toBe(previa.tokenGestion);
    expect(despues.giros.map((giro) => giro.id)).toEqual([giroId]);
  });

  // Scenario: el reenvío pasa por las mismas defensas
  it("con el campo trampa lleno no cambia nada y finge el mismo éxito", async () => {
    const previa = await fichaPrevia("rechazado");

    const resultado = await procesar(envioCorregido({ [CAMPO_TRAMPA]: "soy un bot" }));

    expect(resultado).toEqual({ exito: true });
    const despues = await leer();
    expect(despues.nombre).toBe(previa.nombre);
    expect(despues.estado).toBe("rechazado");
    expect(despues.motivoRechazo).toBe(MOTIVO_DEL_RECHAZO);
  });

  it("con el cupo de la IP agotado no cambia nada", async () => {
    const previa = await fichaPrevia("rechazado");

    // Tres envíos válidos desde la misma IP agotan el cupo de la hora.
    for (let i = 0; i < 3; i += 1) {
      const otro = envioCorregido({ whatsapp: `771999410${i}` });
      await procesar(otro);
    }

    const resultado = await procesar(envioCorregido());
    expect(resultado.exito).toBe(false);
    if (!resultado.exito) {
      expect(resultado.estado.errores.general).toBe(MENSAJES_ERROR_REGISTRO.limiteIp);
    }

    const despues = await leer();
    expect(despues.nombre).toBe(previa.nombre);
    expect(despues.estado).toBe("rechazado");
  });

  it("con un campo inválido no cambia nada", async () => {
    const previa = await fichaPrevia("rechazado");

    const resultado = await procesar(envioCorregido({ nombre: "" }));
    expect(resultado.exito).toBe(false);

    const despues = await leer();
    expect(despues.nombre).toBe(previa.nombre);
    expect(despues.estado).toBe("rechazado");
  });

  it("sin consentimiento del aviso no se actualiza nada", async () => {
    const previa = await fichaPrevia("rechazado");

    const formData = envioCorregido();
    formData.delete("consentimiento");
    const resultado = await procesar(formData);

    expect(resultado.exito).toBe(false);
    const despues = await leer();
    expect(despues.nombre).toBe(previa.nombre);
    expect(despues.consintioAvisoEn.toISOString()).toBe(
      previa.consintioAvisoEn.toISOString(),
    );
  });
});
