/**
 * Spec `plataforma-astro` (change `migrar-tareas-programadas-astro`, Fase 6a;
 * tasks.md #4): requirements "Las tareas programadas responden desde Astro lo
 * mismo que Next" y "El aviso diario servido por Astro no lleva datos de nadie
 * y sus pruebas no tocan servicios reales".
 *
 * Sobre la SALIDA SERVIDA (emulador), con la base de la suite, un `FOTOS_DIR`
 * temporal y el Resend falso, cada sesión de `scripts/diff-html/tareas-6a.mjs`
 * se compara contra lo que respondió Next de `main` en el mismo estado inicial
 * (`tests/fixtures/next-6a/`): estado, cuerpo byte a byte, cabeceras (salvo
 * las de transporte y la `Vary` del enrutador de Next), líneas del log, lo que
 * recibió el proveedor de correo y cómo quedaron la base y el almacén.
 *
 * Todo ficticio: fichas `77199966xx`, fotos `f6a…`, buzones `@ejemplo.invalid`
 * y el secreto aleatorio de esta corrida. Lo sembrado se borra en `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compararPaso6a, correrSesiones6a, sesiones6a } from "../scripts/diff-html/tareas-6a.mjs";
import { claveDeFoto, NOMBRES_EN_REVISION, PREFIJO_WHATSAPP } from "../scripts/sembrar-tareas.mjs";
import { cabecerasDeSeguridad } from "../src/lib/seguridad/csp";
import { construirSiHaceFalta } from "./salida-astro";
import {
  type ContextoDeTareas,
  entornoParaTareas,
  fixtureDe6a,
  levantarParaTareas,
  type Paso6a,
  prepararTareas,
  type Sesion6a,
  soltarTareas,
  textoDe,
} from "./tareas-astro";

const SESIONES = [
  "purga",
  "purga-foto-rota",
  "aviso-fallido",
  "aviso-rechazado",
  "aviso-repetido-en-frio",
  "aviso-sin-pendientes",
  "aviso-privacidad",
  "sin-correo",
  "base-caida",
  "barrido",
  "barrido-detenido",
  "sin-almacen",
];

/** Variables del bucket que la terminal "trae" durante este archivo: el emulador no debe verlas. */
const BUCKET_EN_LA_TERMINAL = {
  SUPABASE_URL: "https://proyecto-ficticio.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "llave-ficticia-del-bucket",
  SUPABASE_BUCKET_FOTOS: "fotos-ficticias",
};

let ctx: ContextoDeTareas | undefined;
let astro: Record<string, Sesion6a> = {};
const antes: Record<string, string | undefined> = {};

beforeAll(async () => {
  construirSiHaceFalta();
  for (const [clave, valor] of Object.entries(BUCKET_EN_LA_TERMINAL)) {
    antes[clave] = process.env[clave];
    process.env[clave] = valor;
  }
  ctx = await prepararTareas("tareas-paridad");
  // Las marcas de cupo YA caducadas de otros archivos (p. ej. con reloj fijo)
  // se las llevaría igual la purga; se recogen antes para que el conteo de
  // `cuposLimpiados` sea el de lo sembrado aquí, como en la base del diff.
  await ctx.consultar(`DELETE FROM "IntentoDeCupo" WHERE "ocurrioEn" <= now() - interval '1 hour'`);
  const contexto = ctx;
  astro = (await correrSesiones6a({
    ...contexto,
    levantar: (instancia: string) => levantarParaTareas(instancia, contexto),
    sesiones: sesiones6a().filter((s) => SESIONES.includes(s.nombre)),
  })) as Record<string, Sesion6a>;
}, 300_000);

afterAll(async () => {
  for (const [clave, valor] of Object.entries(antes)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  await soltarTareas(ctx);
});

const paso = (sesion: string, i: number): Paso6a => astro[sesion].pasos[i];
const cuerpo = (sesion: string, i: number): string => textoDe(paso(sesion, i));
const logDe = (sesion: string): string => astro[sesion].pasos.flatMap((p) => p.log).join("\n");

describe("las tareas responden desde Astro lo mismo que Next (contra tests/fixtures/next-6a/)", () => {
  for (const nombre of SESIONES) {
    it(`${nombre}: cada paso igual que Next, y la base y el almacén quedan igual`, () => {
      const next = fixtureDe6a(nombre);
      const deAstro = astro[nombre];
      expect(deAstro.pasos).toHaveLength(next.pasos.length);
      next.pasos.forEach((pn, i) => {
        const r = compararPaso6a(pn, deAstro.pasos[i]);
        expect(r.diferencias, pn.nombre).toEqual([]);
        expect(r.aceptada, pn.nombre).toBe(false);
      });
      expect(deAstro.despues).toEqual(next.despues);
    });
  }
});

describe("la purga del día", () => {
  it("200 con los conteos de hoy; quedan el de 89 días y el sin fecha; la foto se fue; el log lo dice", () => {
    const p = paso("purga", 0);
    expect(p.status).toBe(200);
    expect(cuerpo("purga", 0)).toBe('{"eliminados":2,"fallidos":0,"cuposLimpiados":1,"aviso":"mandado"}');
    expect(p.log).toContain("[purga] eliminados 2 registros rechazados con 90 días o más");
    expect(astro.purga.despues).toEqual({
      fichas: [`${PREFIJO_WHATSAPP}03:rechazado`, `${PREFIJO_WHATSAPP}04:rechazado`, `${PREFIJO_WHATSAPP}05:en_revision`],
      archivos: [],
      cupos: 0,
    });
  });

  it("cabeceras: el JSON, noindex, las cuatro de seguridad y NINGÚN Cache-Control (Next no manda ninguno)", () => {
    const { headers } = paso("purga", 0);
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    for (const { key, value } of cabecerasDeSeguridad()) expect(headers[key.toLowerCase()], key).toBe(value);
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("segunda corrida: ceros y ningún segundo envío aceptado por el proveedor", () => {
    expect(cuerpo("purga", 1)).toBe('{"eliminados":0,"fallidos":0,"cuposLimpiados":0,"aviso":"mandado"}');
    const aceptados = astro.purga.pasos.flatMap((p) => p.correo).filter((c) => c.respuesta === 200);
    expect(aceptados).toHaveLength(1);
  });

  it("GET con ?_action=reportar corre la purga y responde lo mismo que sin la consulta", () => {
    expect(paso("purga", 2).status).toBe(200);
    expect(cuerpo("purga", 2)).toBe(cuerpo("purga", 1));
  });

  it("HEAD con el secreto: el estado y las cabeceras del GET, sin cuerpo", () => {
    const head = paso("purga", 3);
    expect(head.status).toBe(200);
    expect(head.cuerpo).toBe("");
    expect(head.headers).toEqual(paso("purga", 1).headers);
  });
});

describe("la purga borra los archivos antes que la fila", () => {
  it("una foto que no se deja borrar: 500, eliminados 1 y fallidos 1; la ficha sigue y el log no nombra a nadie", () => {
    const p = paso("purga-foto-rota", 0);
    expect(p.status).toBe(500);
    expect(cuerpo("purga-foto-rota", 0)).toBe('{"eliminados":1,"fallidos":1,"cuposLimpiados":0,"aviso":"sin-pendientes"}');
    expect(astro["purga-foto-rota"].despues.fichas).toEqual([`${PREFIJO_WHATSAPP}01:rechazado`]);
    // La variante que sí se pudo borrar ya no está: los archivos van primero.
    expect(astro["purga-foto-rota"].despues.archivos).toEqual([`${claveDeFoto(2)}.ficha.webp`]);
    const log = logDe("purga-foto-rota");
    expect(log).toMatch(/\[purga\] .*NO se pudieron eliminar/);
    for (const dato of ["f6a", PREFIJO_WHATSAPP, "cf6atareas", "Negocio Ficticio", "Motivo ficticio"]) expect(log).not.toContain(dato);
  });
});

describe("el aviso y la purga no se arrastran", () => {
  it("la purga no se completa (base caída): 500 con error y el estado del aviso, que se intentó", () => {
    const purga = astro["base-caida"].pasos.find((p) => p.nombre === "la purga con la base caída")!;
    expect(purga.status).toBe(500);
    expect(textoDe(purga)).toBe('{"error":"No se pudo completar la purga.","aviso":"fallido"}');
    expect(purga.log.join("\n")).toContain("[aviso] no se pudo preparar el aviso del día");
  });

  it("el aviso falla: lo purgado queda purgado, 500 con aviso fallido y el log sin buzón ni credencial", () => {
    for (const sesion of ["aviso-fallido", "aviso-rechazado", "aviso-repetido-en-frio"]) {
      expect(paso(sesion, 0).status, sesion).toBe(500);
      expect(cuerpo(sesion, 0), sesion).toBe('{"eliminados":1,"fallidos":0,"cuposLimpiados":0,"aviso":"fallido"}');
      expect(astro[sesion].despues.fichas, sesion).toEqual([`${PREFIJO_WHATSAPP}05:en_revision`]);
      const log = logDe(sesion);
      expect(log, sesion).toMatch(/\[aviso\] .*(NO salió|no mandó nada)/);
      for (const secreto of ["admin@ejemplo.invalid", "avisos@ejemplo.invalid", "re_prueba_falsa"]) expect(log, sesion).not.toContain(secreto);
    }
  });

  it("sin configuración de correo: 200 sin-configurar las dos veces, nada al proveedor, y el log lo dice UNA vez", () => {
    for (const i of [0, 1]) {
      expect(paso("sin-correo", i).status).toBe(200);
      expect(cuerpo("sin-correo", i)).toMatch(/"aviso":"sin-configurar"\}$/);
      expect(paso("sin-correo", i).correo).toEqual([]);
    }
    expect(logDe("sin-correo").match(/falta RESEND_API_KEY/g)).toHaveLength(1);
  });

  it("sin pendientes: 200 sin-pendientes y nada al proveedor", () => {
    expect(cuerpo("aviso-sin-pendientes", 0)).toBe('{"eliminados":1,"fallidos":0,"cuposLimpiados":0,"aviso":"sin-pendientes"}');
    expect(paso("aviso-sin-pendientes", 0).correo).toEqual([]);
  });
});

describe("el correo no lleva datos de ningún negocio", () => {
  it("un solo envío al buzón ficticio, con el conteo y el enlace al panel, sin nombres, números ni identificadores", () => {
    const envios = astro["aviso-privacidad"].pasos.flatMap((p) => p.correo);
    expect(envios).toHaveLength(1);
    const [envio] = envios;
    expect(envio.respuesta).toBe(200);
    expect(envio.cuerpo.to).toEqual(["admin@ejemplo.invalid"]);
    expect(envio.idempotencyKey).toMatch(/<fecha>/);
    expect(envio.userAgent).toBe("EnMiRumbo");
    const texto = `${envio.cuerpo.subject}\n${envio.cuerpo.text}`;
    expect(texto).toContain("3");
    expect(texto).toContain("https://enmirumbo.example/admin");
    expect(texto.match(/https?:\/\/\S+/g)).toEqual(["https://enmirumbo.example/admin"]);
    for (const dato of [...NOMBRES_EN_REVISION, PREFIJO_WHATSAPP, "cf6atareas", "Motivo ficticio"]) expect(texto).not.toContain(dato);
  });

  it("nada sale a la red: el emulador arranca sin las variables del bucket y el registro no trae la credencial", () => {
    const entorno = entornoParaTareas("principal", ctx!);
    for (const clave of Object.keys(BUCKET_EN_LA_TERMINAL)) {
      expect(process.env[clave], "la terminal sí la tiene").toBeDefined();
      expect(clave in entorno && entorno[clave] === undefined, clave).toBe(true);
    }
    for (const sesion of Object.values(astro)) {
      for (const p of sesion.pasos) {
        expect(JSON.stringify(p.correo)).not.toContain("re_prueba_falsa");
        expect(p.log.join("\n")).not.toMatch(/host externo bloqueada|supabase\.co/i);
        for (const c of p.correo) expect(c.url).toBe("https://api.resend.com/emails");
      }
    }
  });
});

describe("el barrido", () => {
  it("normal: 200 con las siete claves en orden; solo se va la huérfana vieja; las de los negocios y la recién escrita se quedan", () => {
    expect(paso("barrido", 0).status).toBe(200);
    expect(cuerpo("barrido", 0)).toBe('{"barrido":true,"revisadas":4,"huerfanas":1,"borradas":1,"enPeriodoDeGracia":1,"ignoradas":0,"noBorrables":0}');
    const variantes = (n: number) => [`${claveDeFoto(n)}.ficha.webp`, `${claveDeFoto(n)}.tarjeta.webp`];
    expect(astro.barrido.despues.archivos).toEqual([...variantes(3), ...variantes(4), ...variantes(5), ...variantes(7)]);
    expect(astro.barrido.despues.fichas).toHaveLength(3);
  });

  it("el cron de Vercel: el JSON y el noindex del endpoint, las cuatro, sin el Cache-Control del HTML dinámico", () => {
    const { headers } = paso("barrido", 0);
    expect(headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    for (const { key, value } of cabecerasDeSeguridad()) expect(headers[key.toLowerCase()], key).toBe(value);
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("detenido por la base vacía: 500, barrido false, DETENIDO en el log y la huérfana sigue", () => {
    expect(paso("barrido-detenido", 0).status).toBe(500);
    expect(cuerpo("barrido-detenido", 0)).toMatch(/^\{"barrido":false,/);
    expect(logDe("barrido-detenido")).toContain("DETENIDO");
    expect(astro["barrido-detenido"].despues.archivos).toEqual([`${claveDeFoto(6)}.ficha.webp`, `${claveDeFoto(6)}.tarjeta.webp`]);
  });

  it("sin almacén alcanzable: 500 en las dos tareas y la ficha con foto no se borra", () => {
    expect(astro["sin-almacen"].pasos.map((p) => p.status)).toEqual([500, 500]);
    expect(cuerpo("sin-almacen", 0)).toBe('{"barrido":false}');
    expect(astro["sin-almacen"].despues.fichas).toEqual([`${PREFIJO_WHATSAPP}01:rechazado`]);
  });
});
