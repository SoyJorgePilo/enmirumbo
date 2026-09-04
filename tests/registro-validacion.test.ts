import { describe, expect, it } from "vitest";

import {
  EJEMPLOS_QUE_OFRECES,
  EJEMPLO_QUE_OFRECES_GENERICO,
  ejemploParaCategoriaElegida,
  ejemploQueOfreces,
} from "../src/lib/registro/ejemplos";
import {
  COLONIA_OTRA_VALOR,
  LIMITES_LONGITUD,
  MENSAJES_ERROR_REGISTRO,
  mensajeLimiteLongitud,
} from "../src/lib/registro/textos";
import { VALORES_VACIOS_REGISTRO } from "../src/lib/registro/tipos";
import {
  leerEnvioRegistro,
  recortarParaEco,
  validarRegistro,
} from "../src/lib/registro/validacion";
import { CATEGORIAS, COLONIAS } from "../prisma/seed";
import { slugify } from "../src/lib/slug";

// Datos 100% ficticios (repo público + LFPDPPP): números 771999xxxx inventados.
// Spec: registro-negocio · "El servidor valida todos los campos y devuelve
// errores por campo en español", "Colonia 'Otra' con texto libre pendiente de
// normalizar" y "El ejemplo de '¿Qué ofreces?' se adapta a la categoría".

// Catálogos con la misma forma que los de la base (ids 1..n en el orden del seed).
const categorias = CATEGORIAS.map((nombre, i) => ({
  id: i + 1,
  nombre,
  slug: slugify(nombre),
}));
const colonias = COLONIAS.map((nombre, i) => ({
  id: i + 1,
  nombre,
  slug: slugify(nombre),
}));

const ID_SERVICIOS_HOGAR = categorias.find(
  (c) => c.slug === "servicios-del-hogar",
)!.id;
const ID_HACIENDAS = colonias.find((c) => c.slug === "haciendas-de-tizayuca")!.id;

function validar(
  parciales: Partial<typeof VALORES_VACIOS_REGISTRO>,
  consentimiento = true,
) {
  return validarRegistro({
    campos: { ...VALORES_VACIOS_REGISTRO, ...parciales },
    consentimiento,
    categorias,
    colonias,
  });
}

/** Envío mínimo válido: solo los 5 obligatorios. */
const OBLIGATORIOS = {
  nombre: "Plomería Ficticia El Tubo Feliz",
  categoriaId: String(ID_SERVICIOS_HOGAR),
  whatsapp: "7719991111",
  coloniaId: String(ID_HACIENDAS),
};

describe("validarRegistro · obligatorios", () => {
  // Scenario: obligatorios vacíos
  it("un envío vacío devuelve un mensaje por cada obligatorio faltante", () => {
    const resultado = validar({}, false);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores).toEqual({
      nombre: MENSAJES_ERROR_REGISTRO.nombre,
      categoriaId: MENSAJES_ERROR_REGISTRO.categoriaId,
      whatsapp: MENSAJES_ERROR_REGISTRO.whatsapp,
      coloniaId: MENSAJES_ERROR_REGISTRO.coloniaId,
      consentimiento: MENSAJES_ERROR_REGISTRO.consentimiento,
    });
  });

  // Scenario: alta solo con obligatorios
  it("acepta los 5 obligatorios y deja los opcionales en null", () => {
    const resultado = validar(OBLIGATORIOS);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos).toEqual({
      nombre: "Plomería Ficticia El Tubo Feliz",
      categoriaId: ID_SERVICIOS_HOGAR,
      whatsapp: "7719991111",
      coloniaId: ID_HACIENDAS,
      coloniaOtra: null,
      queOfreces: null,
      entregaADomicilio: false,
      telefonoFijo: null,
      direccion: null,
      horario: null,
      facebookUrl: null,
    });
  });

  // Scenario: sin checkbox no hay envío
  it("sin consentimiento no valida aunque todo lo demás esté bien", () => {
    const resultado = validar(OBLIGATORIOS, false);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores).toEqual({
      consentimiento: MENSAJES_ERROR_REGISTRO.consentimiento,
    });
  });

  it("recorta espacios de los textos antes de validar y guardar", () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      nombre: "   Fonda Ficticia Doña Ejemplo   ",
      queOfreces: "  comida corrida  ",
      horario: "  L-S 9am-7pm ",
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.nombre).toBe("Fonda Ficticia Doña Ejemplo");
    expect(resultado.datos.queOfreces).toBe("comida corrida");
    expect(resultado.datos.horario).toBe("L-S 9am-7pm");
  });

  it("un nombre de solo espacios cuenta como vacío", () => {
    const resultado = validar({ ...OBLIGATORIOS, nombre: "     " });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.nombre).toBe(MENSAJES_ERROR_REGISTRO.nombre);
  });
});

describe("validarRegistro · WhatsApp normalizado (hallazgo M1)", () => {
  // Scenario: variantes del mismo número se guardan igual
  it.each(["+52 771 999 4567", "771-999-4567", "7719994567"])(
    "guarda %s como 7719994567",
    (whatsapp) => {
      const resultado = validar({ ...OBLIGATORIOS, whatsapp });

      expect(resultado.ok).toBe(true);
      if (!resultado.ok) return;
      expect(resultado.datos.whatsapp).toBe("7719994567");
    },
  );

  // Scenarios: número con menos de 10 dígitos / texto que no es un número
  it.each(["77199945", "771 999 45", "no tengo"])(
    "rechaza %s con el mensaje literal de la spec",
    (whatsapp) => {
      const resultado = validar({ ...OBLIGATORIOS, whatsapp });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.errores.whatsapp).toBe(
        "Revisa tu número de WhatsApp: deben ser 10 dígitos",
      );
    },
  );
});

describe("validarRegistro · listas cerradas del catálogo", () => {
  // Scenario: categoría o colonia fuera del catálogo
  it.each(["999", "0", "-1", "abc", "1.5", " "])(
    "rechaza la categoría %s por no existir en el catálogo",
    (categoriaId) => {
      const resultado = validar({ ...OBLIGATORIOS, categoriaId });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.errores.categoriaId).toBe(
        MENSAJES_ERROR_REGISTRO.categoriaId,
      );
    },
  );

  it.each(["999", "0", "abc"])(
    "rechaza la colonia %s por no existir en el catálogo",
    (coloniaId) => {
      const resultado = validar({ ...OBLIGATORIOS, coloniaId });

      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.errores.coloniaId).toBe(MENSAJES_ERROR_REGISTRO.coloniaId);
    },
  );
});

describe("validarRegistro · colonia Otra", () => {
  // Scenario: registro con colonia "Otra"
  it("guarda el texto libre y deja la colonia de catálogo vacía", () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      coloniaId: COLONIA_OTRA_VALOR,
      coloniaOtra: "Rinconada del Venado",
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.coloniaId).toBeNull();
    expect(resultado.datos.coloniaOtra).toBe("Rinconada del Venado");
  });

  // Scenario: "Otra" sin texto
  it('"Otra" sin texto libre pide el nombre de la colonia', () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      coloniaId: COLONIA_OTRA_VALOR,
      coloniaOtra: "   ",
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.coloniaOtra).toBe("Escribe el nombre de tu colonia");
  });

  // Scenario: colonia del catálogo con texto libre residual
  it("ignora el texto libre cuando se eligió una colonia del catálogo", () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      coloniaOtra: "Rinconada del Venado",
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.coloniaId).toBe(ID_HACIENDAS);
    expect(resultado.datos.coloniaOtra).toBeNull();
  });
});

describe("validarRegistro · cotas de longitud", () => {
  // Scenario: "¿Qué ofreces?" demasiado largo
  it("rechaza 250 caracteres en ¿Qué ofreces? con el mensaje literal", () => {
    const resultado = validar({ ...OBLIGATORIOS, queOfreces: "a".repeat(250) });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.queOfreces).toBe(
      "Deja esto en 200 caracteres o menos",
    );
  });

  it("acepta exactamente 200 caracteres en ¿Qué ofreces?", () => {
    const resultado = validar({ ...OBLIGATORIOS, queOfreces: "a".repeat(200) });
    expect(resultado.ok).toBe(true);
  });

  it.each([
    ["nombre", LIMITES_LONGITUD.nombre],
    ["telefonoFijo", LIMITES_LONGITUD.telefonoFijo],
    ["direccion", LIMITES_LONGITUD.direccion],
    ["horario", LIMITES_LONGITUD.horario],
  ] as const)("acota %s a %i caracteres", (campo, maximo) => {
    const resultado = validar({ ...OBLIGATORIOS, [campo]: "a".repeat(maximo + 1) });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores[campo]).toBe(mensajeLimiteLongitud(maximo));
  });

  it("acota el texto libre de colonia Otra", () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      coloniaId: COLONIA_OTRA_VALOR,
      coloniaOtra: "a".repeat(LIMITES_LONGITUD.coloniaOtra + 1),
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.coloniaOtra).toBe(
      mensajeLimiteLongitud(LIMITES_LONGITUD.coloniaOtra),
    );
  });

  it("el mensaje de 200 caracteres coincide con el literal de la spec", () => {
    expect(mensajeLimiteLongitud(200)).toBe(MENSAJES_ERROR_REGISTRO.queOfreces);
  });
});

describe("validarRegistro · link de Facebook solo http(s)", () => {
  // Scenario: link de Facebook con esquema no permitido
  it.each([
    "javascript:alert(1)",
    "facebook.com/minegocio",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "JavaScript:alert(1)",
    "//facebook.com/minegocio",
  ])("rechaza %s", (facebookUrl) => {
    const resultado = validar({ ...OBLIGATORIOS, facebookUrl });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.facebookUrl).toBe(
      "El link de Facebook debe empezar con http:// o https://",
    );
  });

  it.each([
    "https://facebook.com/negocio-ficticio",
    "http://m.facebook.com/negocio-ficticio",
    "https://fb.me/negocio?ref=page_internal",
  ])("acepta %s", (facebookUrl) => {
    const resultado = validar({ ...OBLIGATORIOS, facebookUrl });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.facebookUrl).toBe(facebookUrl);
  });

  // Etapa C, MEDIO 4: credenciales incrustadas y URL normalizada al guardar.
  it.each([
    "https://facebook.com@evil.example/perfil",
    "https://usuario:clave@evil.example/perfil",
  ])("rechaza %s (credenciales incrustadas disfrazan el host real)", (facebookUrl) => {
    const resultado = validar({ ...OBLIGATORIOS, facebookUrl });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.facebookUrl).toBe(
      MENSAJES_ERROR_REGISTRO.facebookUrl,
    );
  });

  it("guarda la URL canónica, no la cadena cruda (el homógrafo queda en punycode)", () => {
    const resultado = validar({
      ...OBLIGATORIOS,
      facebookUrl: "https://facebоok.com/minegocio", // la "о" es cirílica
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.datos.facebookUrl).toBe("https://xn--facebok-ejg.com/minegocio");
  });
});

// Etapa C, MEDIO 3: cotas de los tres campos que faltaban y eco truncado.
describe("validarRegistro · cotas de whatsapp, categoría y colonia", () => {
  it.each([
    ["whatsapp", "whatsapp", MENSAJES_ERROR_REGISTRO.whatsapp],
    ["categoriaId", "categoriaId", MENSAJES_ERROR_REGISTRO.categoriaId],
    ["coloniaId", "coloniaId", MENSAJES_ERROR_REGISTRO.coloniaId],
  ] as const)("rechaza un %s más largo que su cota", (campo, clave, mensaje) => {
    const largo = "1".repeat(LIMITES_LONGITUD[clave] + 1);
    const resultado = validar({ ...OBLIGATORIOS, [campo]: largo });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // El mensaje es el literal de ese campo, no el de "texto muy largo"
    expect(resultado.errores[clave]).toBe(mensaje);
  });

  it("recortarParaEco trunca cada campo a su cota antes de devolverlo", () => {
    const eco = recortarParaEco({
      ...VALORES_VACIOS_REGISTRO,
      nombre: "  Ficticia  ",
      whatsapp: "9".repeat(100_000),
      categoriaId: "1".repeat(500),
      coloniaId: "2".repeat(500),
      queOfreces: "a".repeat(1_000),
    });

    expect(eco.nombre).toBe("Ficticia");
    expect(eco.whatsapp).toHaveLength(LIMITES_LONGITUD.whatsapp);
    expect(eco.categoriaId).toHaveLength(LIMITES_LONGITUD.categoriaId);
    expect(eco.coloniaId).toHaveLength(LIMITES_LONGITUD.coloniaId);
    expect(eco.queOfreces).toHaveLength(LIMITES_LONGITUD.queOfreces);
  });

  it("un envío legítimo no pierde nada al pasar por el eco", () => {
    const capturado = {
      ...VALORES_VACIOS_REGISTRO,
      nombre: "Fonda Ficticia Doña Ejemplo",
      whatsapp: "+52 771 999 4567",
      queOfreces: "comida corrida, guisados caseros",
      entregaADomicilio: true,
    };
    expect(recortarParaEco(capturado)).toEqual(capturado);
  });
});

describe("leerEnvioRegistro · lectura del FormData", () => {
  function formDataDe(pares: Record<string, string>): FormData {
    const formData = new FormData();
    for (const [clave, valor] of Object.entries(pares)) {
      formData.append(clave, valor);
    }
    return formData;
  }

  it("conserva lo capturado tal cual para volver a pintarlo", () => {
    const envio = leerEnvioRegistro(
      formDataDe({
        nombre: "  Fonda Ficticia  ",
        categoriaId: "2",
        whatsapp: "771 999 1111",
        coloniaId: COLONIA_OTRA_VALOR,
        coloniaOtra: "Rinconada del Venado",
        queOfreces: "comida corrida",
        entregaADomicilio: "on",
        telefonoFijo: "7799990000",
        direccion: "Frente al parque",
        horario: "L-S 9am-7pm",
        facebookUrl: "https://facebook.com/ficticio",
        consentimiento: "on",
      }),
    );

    expect(envio.campos.nombre).toBe("Fonda Ficticia");
    expect(envio.campos.entregaADomicilio).toBe(true);
    expect(envio.campos.coloniaId).toBe(COLONIA_OTRA_VALOR);
    expect(envio.consentimiento).toBe(true);
    expect(envio.trampa).toBe("");
  });

  it("un formulario vacío da campos vacíos y consentimiento falso", () => {
    const envio = leerEnvioRegistro(new FormData());

    expect(envio.campos).toEqual(VALORES_VACIOS_REGISTRO);
    expect(envio.consentimiento).toBe(false);
  });

  it("detecta el campo trampa del honeypot", () => {
    const envio = leerEnvioRegistro(formDataDe({ sitio_web: "http://spam.test" }));
    expect(envio.trampa).toBe("http://spam.test");
  });

  // Etapa C, MEDIO 2: la constancia LFPDPPP no puede depender de que el campo
  // exista; un POST crudo puede mandarlo con cualquier valor.
  it.each(["on", "true", "1", "si", "sí", "ON"])(
    "%j cuenta como casilla marcada",
    (valor) => {
      expect(leerEnvioRegistro(formDataDe({ consentimiento: valor })).consentimiento).toBe(
        true,
      );
    },
  );

  it.each(["", " ", "false", "no", "off", "0", "cualquier cosa"])(
    "%j NO cuenta como casilla marcada",
    (valor) => {
      expect(leerEnvioRegistro(formDataDe({ consentimiento: valor })).consentimiento).toBe(
        false,
      );
    },
  );

  it("la misma regla aplica al checkbox de entregas a domicilio", () => {
    expect(
      leerEnvioRegistro(formDataDe({ entregaADomicilio: "on" })).campos.entregaADomicilio,
    ).toBe(true);
    expect(
      leerEnvioRegistro(formDataDe({ entregaADomicilio: "" })).campos.entregaADomicilio,
    ).toBe(false);
  });
});

describe("ejemplos de ¿Qué ofreces? por categoría", () => {
  // Scenario: ejemplo de servicios del hogar
  it("servicios del hogar usa el ejemplo literal del PRD", () => {
    expect(ejemploQueOfreces("servicios-del-hogar")).toBe(
      "ej. plomería, destape de drenajes, bombas de agua",
    );
  });

  // Scenario: ejemplo de deporte
  it("clubes y escuelas deportivas usa el ejemplo literal del PRD", () => {
    expect(ejemploQueOfreces("clubes-y-escuelas-deportivas")).toBe(
      "ej. futbol infantil 6-12 años, entrenamientos martes y jueves",
    );
  });

  it("hay un ejemplo para cada una de las 8 categorías del catálogo", () => {
    for (const nombre of CATEGORIAS) {
      const ejemplo = EJEMPLOS_QUE_OFRECES[slugify(nombre)];
      expect(ejemplo, `falta ejemplo para ${nombre}`).toBeTruthy();
    }
    expect(Object.keys(EJEMPLOS_QUE_OFRECES)).toHaveLength(CATEGORIAS.length);
  });

  it("sin categoría (o con una desconocida) cae en el ejemplo genérico", () => {
    expect(ejemploQueOfreces(undefined)).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
    expect(ejemploQueOfreces("categoria-inexistente")).toBe(
      EJEMPLO_QUE_OFRECES_GENERICO,
    );
    // Claves heredadas de Object.prototype tampoco devuelven cualquier cosa
    expect(ejemploQueOfreces("constructor")).toBe(EJEMPLO_QUE_OFRECES_GENERICO);
  });

  // Scenario "el ejemplo cambia al cambiar de categoría": esta es la regla
  // completa que ejecuta el componente de cliente al cambiar el `select`.
  it("el ejemplo sigue al id elegido en el select, y cambiar de id cambia el ejemplo", () => {
    const idHogar = String(ID_SERVICIOS_HOGAR);
    const idDeporte = String(
      categorias.find((c) => c.slug === "clubes-y-escuelas-deportivas")!.id,
    );

    expect(ejemploParaCategoriaElegida(categorias, idHogar)).toBe(
      "ej. plomería, destape de drenajes, bombas de agua",
    );
    expect(ejemploParaCategoriaElegida(categorias, idDeporte)).toBe(
      "ej. futbol infantil 6-12 años, entrenamientos martes y jueves",
    );
    // Sin elegir nada (estado inicial, y lo que se ve sin JavaScript)
    expect(ejemploParaCategoriaElegida(categorias, "")).toBe(
      EJEMPLO_QUE_OFRECES_GENERICO,
    );
    // Id que no está en la lista recibida
    expect(ejemploParaCategoriaElegida(categorias, "9999")).toBe(
      EJEMPLO_QUE_OFRECES_GENERICO,
    );
  });
});
