import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AvisoDePrivacidadPage, {
  metadata as metadataAviso,
} from "../src/app/(publico)/aviso-de-privacidad/page";
import { metadata as metadataSitio } from "../src/app/layout";
import TerminosPage, { metadata as metadataTerminos } from "../src/app/(publico)/terminos/page";
import {
  HAY_PLACEHOLDERS_PENDIENTES,
  PLACEHOLDERS_LEGALES,
  TEXTO_MARCA_BORRADOR,
} from "../src/lib/legales/textos";

// Spec: paginas-legales (change `agregar-paginas-legales`).
//
// Los dos textos de abajo están COPIADOS carácter por carácter de los bloques
// aprobados en
// `openspec/changes/agregar-paginas-legales/specs/paginas-legales/spec.md`
// (mismo método que `tests/admin-textos.test.ts`): es contenido legal, no
// copy libre, así que si alguien lo cambia sin cambiar la spec, esta suite lo
// caza. Las líneas que empiezan con "## " son los `h2` de la página; las que
// empiezan con "- " son viñetas.

const TEXTO_APROBADO_AVISO = `
Aviso de privacidad

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Este aviso explica, sin rodeos, qué datos nos das cuando registras tu negocio en NecesitoUno Tizayuca, para qué los usamos, qué queda público y cómo puedes pedirnos que los corrijamos o los borremos.

## Quién es responsable de tus datos

El responsable del directorio NecesitoUno Tizayuca y de los datos personales que nos das es [NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento], con domicilio en [DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento], Tizayuca, Hidalgo, México.

Para cualquier cosa relacionada con tus datos escríbenos al correo [CORREO ARCO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento].

## Qué datos recogemos

Los que tú escribes en el formulario de registro:

- Obligatorios: el nombre de tu negocio, la categoría, tu número de WhatsApp de 10 dígitos y tu colonia.
- Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario y el link de tu Facebook.

No te pedimos CURP, RFC, credencial de elector ni datos bancarios. Si nos los mandas por WhatsApp, no los guardamos.

Guardamos también la fecha y la hora en que aceptaste este aviso: es la constancia de que nos diste tu permiso para usar tus datos.

Cuando envías el formulario, el servidor usa tu dirección IP por menos de una hora, solo en su memoria, para frenar registros automatizados. No la guardamos en la base de datos ni la ligamos a tu ficha.

## Para qué usamos tus datos

- Para revisar que tu negocio existe y que el número que registraste es tuyo: te escribimos o te llamamos por WhatsApp antes de publicar.
- Para publicar tu ficha en el directorio, que es a lo que vino todo esto: que los vecinos te encuentren y te contacten.
- Para avisarte cuando publicamos tu ficha, para mandarte su link y para decirte, si fuera el caso, por qué no la publicamos.
- Para contar cuántos negocios se registran y cuántos se publican, en números generales, y saber si el directorio está sirviendo.

No usamos tus datos para publicidad de terceros ni para nada distinto de tener el directorio funcionando.

## Qué queda público y qué no

Cuando aprobamos tu registro, tu ficha se publica y cualquier persona con internet puede verla: el nombre de tu negocio, la categoría, tu colonia, lo que escribiste en "¿Qué ofreces?", tu horario, si haces entregas, el link de tu Facebook y —esto es lo más importante— tu WhatsApp y tu teléfono fijo, con botones para escribirte o marcarte directo. Trátalos como números de contacto de tu negocio: quien sea puede verlos y usarlos.

Publicamos tu colonia, no tu domicilio exacto. Si tú escribes una dirección o referencias en el formulario, eso también se publica tal cual: piénsalo si atiendes desde tu casa.

Esa dirección también alimenta el botón "Cómo llegar" de tu ficha: quien lo toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu colonia y "Tizayuca, Hidalgo".

Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual que lo demás. Hoy el formulario todavía no pide fotos; el día que las pida, aquí te decimos qué se puede publicar en ellas.

Buscadores como Google pueden encontrar tu ficha y mostrarla en sus resultados. Para eso está hecho el directorio.

Lo que nunca se publica: la fecha en que te registraste, las notas internas de la revisión y el motivo por el que, en su caso, no publicamos tu ficha. Eso solo lo ve quien administra el directorio.

## Con quién compartimos tus datos

Con nadie. No vendemos, no rentamos ni intercambiamos tus datos.

Los únicos terceros que participan son los proveedores que hacen funcionar el sitio (hospedaje y base de datos), que tratan los datos por cuenta nuestra y nada más para eso.

Solo entregaríamos datos a una autoridad que nos los pida por escrito y conforme a la ley.

## Cómo limitar el uso o la divulgación de tus datos

- Dinos qué no quieres publicar: si prefieres que tu teléfono fijo, tu horario o tu dirección no aparezcan en la ficha, escríbenos y los quitamos.
- Pide que despubliquemos tu ficha: en cuanto nos llega tu mensaje la bajamos del directorio, sin trámites ni explicaciones.
- Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos.
- Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días.

Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo. Escríbenos por WhatsApp o por correo y te confirmamos que quedó hecho en un máximo de 20 días hábiles.

## Tus derechos ARCO

Tienes derecho a acceder a tus datos, a rectificarlos si están mal, a cancelarlos (que los borremos) y a oponerte a que los usemos. Eso son los derechos ARCO.

Para ejercerlos escríbenos al correo [CORREO ARCO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento] y dinos:

- qué quieres: ver tus datos, corregirlos, borrarlos u oponerte a que los usemos;
- el nombre de tu negocio y el número de WhatsApp con el que lo registraste;
- si es una corrección, qué debe decir.

Te contestamos en un máximo de 20 días hábiles y, si tu solicitud procede, la aplicamos en cuanto te respondemos. No cobramos nada por esto.

Como el registro no usa cuentas ni contraseñas, antes de cambiar o borrar algo confirmamos que la solicitud viene del mismo número de WhatsApp con el que se registró el negocio. Es para que nadie más pueda tocar tu ficha.

## Cookies y datos de navegación

El directorio público no usa cookies de publicidad ni rastrea a los vecinos que lo visitan. La única cookie del sitio es la de la sesión de quien administra el directorio. Si más adelante agregamos alguna herramienta para medir visitas, lo decimos aquí antes de encenderla.

## Cambios a este aviso

Si cambiamos este aviso, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Si el cambio es importante —por ejemplo, si empezamos a usar tus datos para algo nuevo—, te avisamos por WhatsApp al número que registraste antes de aplicarlo. Darle una repasada a esta página de vez en cuando es la forma de estar al tanto.

## Si crees que no respetamos tus derechos

Puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, que desde 2025 es la autoridad en materia de protección de datos personales en México.

Términos y condiciones
`;

const TEXTO_APROBADO_TERMINOS = `
Términos y condiciones

Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.

Última actualización: [FECHA DE PUBLICACIÓN]

Estas son las reglas de NecesitoUno Tizayuca, para los negocios que se registran y para los vecinos que los buscan. Al usar el sitio o registrar tu negocio, aceptas lo que dice aquí.

## Qué es NecesitoUno Tizayuca

Es un directorio de negocios y servicios de Tizayuca, Hidalgo. Sirve para dos cosas: que un negocio publique su ficha gratis y que un vecino lo encuentre y le escriba por WhatsApp. Nada más.

No cobramos por registrarse, no vendemos nada, no cobramos comisiones y no hay cuentas ni contraseñas.

## Somos un intermediario informativo, no el negocio

NecesitoUno Tizayuca solo muestra información. No prestamos los servicios ni vendemos los productos que aparecen en las fichas.

Cuando le escribes a un negocio por WhatsApp, sales de este sitio. Lo que pase después —el precio, el trabajo, la entrega, el pago, la garantía, los tiempos y cualquier problema— es un trato directo entre tú y ese negocio. NecesitoUno Tizayuca no es parte de ese trato, no lo garantiza, no lo supervisa y no responde por él.

Tampoco respondemos por daños, pérdidas o desacuerdos que salgan de un servicio o una compra contratados con alguien que encontraste aquí. Si algo sale mal, resuélvelo con el negocio; y avísanos, porque nos sirve para moderar el directorio.

## Qué verificamos y qué no

Antes de publicar una ficha le escribimos o le llamamos al número registrado para confirmar dos cosas: que el negocio existe y que el número es de quien lo registró. Eso, y nada más que eso, es lo que significa el sello "Negocio verificado".

Lo que no verificamos: la calidad del trabajo, los precios, que el negocio tenga licencias, permisos o seguros, ni que lo que dice su ficha siga siendo cierto con el tiempo. Esa información la escribe cada negocio y es su responsabilidad que sea verdadera y esté al día.

Si un negocio cierra o cambia sus datos y no nos avisa, su ficha puede quedar desactualizada. Avísanos y la corregimos o la bajamos.

## Reglas para registrar un negocio

Revisamos a mano cada registro antes de publicarlo. Rechazamos —o retiramos, si ya estaba publicada— cualquier ficha que caiga en esto:

- Actividades ilegales, o que necesitan una licencia o un permiso que no se pueda demostrar: venta de medicamentos controlados, armas, préstamos informales y parecidos.
- Contenido ofensivo, discriminatorio o sexual.
- Fichas de negocios ajenos registradas por alguien sin autorización del negocio: solo lo registra su dueño o alguien con su permiso.
- Fotos que no cumplan las reglas de publicación del directorio.
- Datos falsos, un número de contacto que no es del negocio, o registrar la misma ficha varias veces.

Rechazar no es para siempre: te avisamos por WhatsApp con el motivo y puedes corregir y volver a enviar tu registro. Los datos de los registros rechazados se borran a los 90 días.

## Podemos retirar una ficha

Nos reservamos el derecho de no publicar o de retirar cualquier ficha que rompa estas reglas o que ya no corresponda a un negocio real de Tizayuca. Y si el propio negocio nos pide que la bajemos, la bajamos de inmediato.

## Si ves algo raro

Si encuentras una ficha falsa, un negocio que ya cerró o algo que rompe estas reglas, escríbenos al correo [CORREO DE CONTACTO — completar antes del lanzamiento] o por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]. Lo revisamos y actuamos.

## Uso de la información del directorio

Los datos del directorio están para que los vecinos contacten a los negocios uno por uno. Copiarlos de forma masiva —a mano o con programas— para armar otra base de datos, revenderlos o mandar publicidad no está permitido.

## Tus datos personales

Qué datos guardamos, para qué los usamos y qué queda público está explicado en el aviso de privacidad.

Aviso de privacidad

## Cambios a estos términos

Si cambiamos estas reglas, publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba. Seguir usando el sitio después de un cambio significa que lo aceptas.

## Ley aplicable

Estos términos se rigen por las leyes mexicanas. [JURISDICCIÓN PARA CONTROVERSIAS — confirmar en la revisión legal].
`;

const raiz = join(__dirname, "..");
const fuente = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

const htmlAviso = renderToStaticMarkup(createElement(AvisoDePrivacidadPage));
const htmlTerminos = renderToStaticMarkup(createElement(TerminosPage));

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

/** Texto visible de un fragmento de HTML: sin etiquetas y sin entidades. */
function textoPlano(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#x27|#39);/g, (entidad) => ENTIDADES[entidad])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El documento renderizado, línea por línea y en el orden en que se lee:
 * cada `h1`, `h2` (con el prefijo "## ", como en la spec), párrafo, viñeta y
 * enlace suelto. Sirve para compararlo contra el texto aprobado.
 */
function lineasDelHtml(html: string): string[] {
  return [...html.matchAll(/<(h1|h2|p|li|a)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((etiqueta) =>
    etiqueta[1] === "h2"
      ? `## ${textoPlano(etiqueta[2])}`
      : textoPlano(etiqueta[2]),
  );
}

/**
 * El texto aprobado de la spec, en la misma forma: sin líneas en blanco y sin
 * el guion de las viñetas. La marca de borrador solo se espera mientras haya
 * placeholders pendientes (requirement "Placeholders visibles y marca de
 * borrador…").
 */
function lineasAprobadas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea !== "")
    .map((linea) => (linea.startsWith("- ") ? linea.slice(2) : linea))
    .filter((linea) => HAY_PLACEHOLDERS_PENDIENTES || linea !== TEXTO_MARCA_BORRADOR);
}

const lineasAviso = lineasDelHtml(htmlAviso);
const lineasTerminos = lineasDelHtml(htmlTerminos);

/** Las líneas de una sección (de su `h2` al siguiente), ya como texto. */
function seccion(lineas: string[], encabezado: string): string {
  const inicio = lineas.indexOf(`## ${encabezado}`);
  expect(inicio, `falta la sección "${encabezado}"`).toBeGreaterThanOrEqual(0);
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((linea) => linea.startsWith("## "));
  return (fin === -1 ? resto : resto.slice(0, fin)).join(" ");
}

/** Los enlaces (`href` + texto) de un documento renderizado. */
function enlaces(html: string): Array<{ href: string; texto: string; etiqueta: string }> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1].match(/href="([^"]*)"/)?.[1] ?? "",
    texto: textoPlano(m[2]),
    etiqueta: m[0],
  }));
}

describe("paginas-legales · el texto publicado es el aprobado", () => {
  // Requirement "Texto completo del aviso de privacidad integral" ·
  // Scenario: el texto publicado es el aprobado
  it("/aviso-de-privacidad dice exactamente lo que aprobó la spec", () => {
    expect(lineasAviso).toEqual(lineasAprobadas(TEXTO_APROBADO_AVISO));
  });

  // Requirement "Texto completo de los términos y condiciones" ·
  // Scenario: el texto publicado es el aprobado
  it("/terminos dice exactamente lo que aprobó la spec", () => {
    expect(lineasTerminos).toEqual(lineasAprobadas(TEXTO_APROBADO_TERMINOS));
  });

  it("ninguna de las dos trae relleno ni secciones vacías", () => {
    for (const [nombre, lineas] of [
      ["aviso", lineasAviso],
      ["términos", lineasTerminos],
    ] as const) {
      expect(lineas.join(" "), nombre).not.toMatch(/lorem ipsum|pendiente de redactar/i);
      expect(lineas.join(" "), nombre).not.toMatch(/\bTODO\b|\bTBD\b|\bFIXME\b/);
      // Cada `h2` tiene al menos una línea de contenido debajo.
      for (const linea of lineas.filter((l) => l.startsWith("## "))) {
        expect(seccion(lineas, linea.slice(3)).length, `${nombre} · ${linea}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("paginas-legales · el dueño abre el aviso de privacidad", () => {
  // Scenario: el dueño abre el aviso de privacidad
  it("encabeza con el h1 y la línea de última actualización con su fecha", () => {
    expect(lineasAviso[0]).toBe("Aviso de privacidad");
    const actualizacion = lineasAviso.find((linea) =>
      linea.startsWith("Última actualización: "),
    );
    expect(actualizacion).toBeDefined();
    expect(actualizacion?.slice("Última actualización: ".length)).not.toBe("");
  });

  // Scenario: el dueño abre el aviso de privacidad (dentro del layout global:
  // el header y el footer del sitio los pone `src/app/layout.tsx`, la página
  // no los repinta. El `<header>` que sí tiene es el del propio documento,
  // dentro del `<article>`, que no es un landmark del sitio.)
  it("vive dentro del layout global, sin repintar el chrome del sitio", () => {
    for (const html of [htmlAviso, htmlTerminos]) {
      expect(html).not.toMatch(/<footer[\s>]/);
      expect(html).not.toContain("Hecho para los vecinos de Tizayuca");
      expect(html.match(/<header[\s>]/g)).toHaveLength(1); // el del documento
      expect(html).toMatch(/^<article[\s>]/);
    }
    const layout = fuente("src/app/layout.tsx");
    expect(layout).toMatch(/<Header \/>/);
    expect(layout).toMatch(/<Footer \/>/);
  });

  // Scenario: jerarquía de encabezados del aviso
  it("tiene un solo h1, sus secciones son h2 y no hay saltos de jerarquía", () => {
    expect(htmlAviso.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlAviso).not.toMatch(/<h[3-6][\s>]/);
    expect(lineasAviso.filter((linea) => linea.startsWith("## "))).toEqual([
      "## Quién es responsable de tus datos",
      "## Qué datos recogemos",
      "## Para qué usamos tus datos",
      "## Qué queda público y qué no",
      "## Con quién compartimos tus datos",
      "## Cómo limitar el uso o la divulgación de tus datos",
      "## Tus derechos ARCO",
      "## Cookies y datos de navegación",
      "## Cambios a este aviso",
      "## Si crees que no respetamos tus derechos",
    ]);
  });

  // Scenario: el aviso enlaza a los términos
  it("cierra con el enlace \"Términos y condiciones\" hacia /terminos", () => {
    const delAviso = enlaces(htmlAviso);
    expect(delAviso).toHaveLength(1);
    expect(delAviso[0].texto).toBe("Términos y condiciones");
    expect(delAviso[0].href).toBe("/terminos");
    expect(lineasAviso[lineasAviso.length - 1]).toBe("Términos y condiciones");
    // Y no apunta a ninguna página inexistente: el único destino es una ruta
    // que existe (`src/app/(publico)/terminos/page.tsx`).
    expect(fuente("src/app/(publico)/terminos/page.tsx")).toContain("export default");
  });
});

describe("paginas-legales · los seis elementos mínimos de la LFPDPPP (PRD §8)", () => {
  // Scenario: identidad y domicilio del responsable
  it("(1) responsable, con domicilio y canales de contacto", () => {
    const texto = seccion(lineasAviso, "Quién es responsable de tus datos");
    expect(texto).toContain("El responsable del directorio NecesitoUno Tizayuca");
    expect(texto).toContain("[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento]");
    expect(texto).toContain("con domicilio en [DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento], Tizayuca, Hidalgo, México.");
    expect(texto).toContain("escríbenos al correo [CORREO ARCO — completar antes del lanzamiento]");
    expect(texto).toContain("por WhatsApp al [WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]");
  });

  // Scenario: datos tratados y finalidades
  it("(2) qué datos recogemos: obligatorios y opcionales del formulario", () => {
    const texto = seccion(lineasAviso, "Qué datos recogemos");
    expect(texto).toContain(
      "Obligatorios: el nombre de tu negocio, la categoría, tu número de WhatsApp de 10 dígitos y tu colonia.",
    );
    expect(texto).toContain(
      "Opcionales: qué ofreces, si haces entregas o vas a domicilio, teléfono fijo, dirección o referencias, horario y el link de tu Facebook.",
    );
    expect(texto).toContain("No te pedimos CURP, RFC, credencial de elector ni datos bancarios.");
  });

  // Scenario: datos tratados y finalidades
  it("(3) para qué usamos tus datos: las cuatro finalidades", () => {
    const texto = seccion(lineasAviso, "Para qué usamos tus datos");
    expect(texto).toContain("Para revisar que tu negocio existe y que el número que registraste es tuyo");
    expect(texto).toContain("Para publicar tu ficha en el directorio");
    expect(texto).toContain("Para avisarte cuando publicamos tu ficha");
    expect(texto).toContain("Para contar cuántos negocios se registran y cuántos se publican, en números generales");
    expect(texto).toContain("No usamos tus datos para publicidad de terceros");
  });

  // Scenario: medios para limitar el uso o la divulgación (ENMENDADO por la
  // auditoría de seguridad, hallazgo MEDIO-1: se atiende a mano y a petición,
  // sin prometer automatismos que no existen)
  it("(4) cómo limitar el uso o la divulgación, a petición y sin automatismos", () => {
    const texto = seccion(lineasAviso, "Cómo limitar el uso o la divulgación de tus datos");
    expect(texto).toContain("Dinos qué no quieres publicar");
    expect(texto).toContain(
      "Pide que despubliquemos tu ficha: en cuanto nos llega tu mensaje la bajamos del directorio, sin trámites ni explicaciones.",
    );
    expect(texto).toContain(
      "Pide que borremos todo: eliminamos tu registro de forma definitiva, no solo lo escondemos.",
    );
    expect(texto).toContain(
      "Todo esto lo atendemos a mano, cuando tú lo pides: no hay un botón que lo haga solo. Escríbenos por WhatsApp o por correo y te confirmamos que quedó hecho en un máximo de 20 días hábiles.",
    );
  });

  // Scenario: el plazo de 90 días es el de los registros rechazados (ALTO-1)
  it("(4) el plazo de 90 días es el de los RECHAZADOS, igual que en /terminos", () => {
    const texto = seccion(lineasAviso, "Cómo limitar el uso o la divulgación de tus datos");
    expect(texto).toContain(
      "Si rechazamos tu registro, sus datos se eliminan definitivamente a los 90 días.",
    );
    // Y no promete borrar lo que sigue en revisión: el modelo solo puede fechar
    // el rechazo (`rechazadoEn`), así que una ficha en revisión no tiene reloj.
    expect(lineasAviso.join(" ")).not.toContain("Si tu registro no se publicó");
    expect(lineasAviso.join(" ")).not.toMatch(/no se publicó, sus datos se borran/);
    // Las dos páginas cuentan lo mismo (el PRD §6.3 y §8: solo los rechazados).
    expect(seccion(lineasTerminos, "Reglas para registrar un negocio")).toContain(
      "Los datos de los registros rechazados se borran a los 90 días.",
    );
    for (const lineas of [lineasAviso, lineasTerminos]) {
      const plazos = [...lineas.join(" ").matchAll(/(\d+)\s+días\b/g)]
        .map((m) => m[1])
        .filter((dias) => dias !== "20"); // el plazo ARCO, en días hábiles
      expect(new Set(plazos)).toEqual(new Set(["90"])); // el único plazo de retención
    }
  });

  // Scenario: derechos ARCO con plazo de 20 días hábiles
  it("(5) los cuatro derechos ARCO, qué mandar, por dónde y el plazo de 20 días hábiles", () => {
    const texto = seccion(lineasAviso, "Tus derechos ARCO");
    expect(texto).toContain(
      "Tienes derecho a acceder a tus datos, a rectificarlos si están mal, a cancelarlos (que los borremos) y a oponerte a que los usemos.",
    );
    expect(texto).toContain("qué quieres: ver tus datos, corregirlos, borrarlos u oponerte a que los usemos;");
    expect(texto).toContain("el nombre de tu negocio y el número de WhatsApp con el que lo registraste;");
    expect(texto).toContain("si es una corrección, qué debe decir.");
    expect(texto).toContain("[CORREO ARCO — completar antes del lanzamiento]");
    expect(texto).toContain("[WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]");
    expect(texto).toContain("en un máximo de 20 días hábiles");
    expect(texto).toContain("No cobramos nada por esto.");
  });

  // Scenario: procedimiento de cambios al aviso
  it("(6) procedimiento de cambios: misma página, fecha nueva y aviso por WhatsApp", () => {
    const texto = seccion(lineasAviso, "Cambios a este aviso");
    expect(texto).toContain("publicamos la versión nueva en esta misma página y actualizamos la fecha de arriba");
    expect(texto).toContain("te avisamos por WhatsApp al número que registraste antes de aplicarlo");
  });

  it("cada elemento mínimo vive en su propia sección, no repartido en líneas sueltas", () => {
    for (const encabezado of [
      "Quién es responsable de tus datos",
      "Qué datos recogemos",
      "Para qué usamos tus datos",
      "Cómo limitar el uso o la divulgación de tus datos",
      "Tus derechos ARCO",
      "Cambios a este aviso",
    ]) {
      expect(lineasAviso).toContain(`## ${encabezado}`);
    }
  });
});

describe("paginas-legales · qué queda público y qué no (E1-6 / hallazgo M3)", () => {
  const texto = () => seccion(lineasAviso, "Qué queda público y qué no");

  // Scenario: el aviso dice que el WhatsApp queda a la vista
  it("el WhatsApp y el teléfono fijo quedan visibles, con botones para escribir o marcar", () => {
    expect(texto()).toContain("cualquier persona con internet puede verla");
    expect(texto()).toContain(
      "tu WhatsApp y tu teléfono fijo, con botones para escribirte o marcarte directo",
    );
    expect(texto()).toContain("quien sea puede verlos y usarlos");
  });

  // Scenario: el aviso distingue colonia de domicilio
  it("publica la colonia y no el domicilio exacto, salvo que el dueño lo escriba", () => {
    expect(texto()).toContain("Publicamos tu colonia, no tu domicilio exacto.");
    expect(texto()).toContain(
      "Si tú escribes una dirección o referencias en el formulario, eso también se publica tal cual: piénsalo si atiendes desde tu casa.",
    );
  });

  // Scenario: la dirección alimenta el botón "Cómo llegar" (enmienda MEDIO-2)
  it('avisa que la dirección alimenta el botón "Cómo llegar" hacia Google Maps', () => {
    expect(texto()).toContain(
      'Esa dirección también alimenta el botón "Cómo llegar" de tu ficha: quien lo toca abre Google Maps en su teléfono, buscando lo que escribiste junto con tu colonia y "Tizayuca, Hidalgo".',
    );
  });

  // Scenario: la foto del negocio también es pública (enmienda MEDIO-2)
  it("declara que la foto del negocio, si la ficha llega a llevarla, es pública", () => {
    expect(texto()).toContain(
      "Si tu ficha llega a llevar una foto de tu negocio, esa foto es pública igual que lo demás.",
    );
    // Y no promete que hoy se capturen: el formulario todavía no las pide.
    expect(texto()).toContain("Hoy el formulario todavía no pide fotos");
  });

  it("avisa que los buscadores pueden indexar la ficha", () => {
    expect(texto()).toContain("Buscadores como Google pueden encontrar tu ficha y mostrarla en sus resultados.");
  });

  // Scenario: lo que nunca se publica
  it("lo que nunca se publica: fecha de registro, notas internas y motivo del rechazo", () => {
    expect(texto()).toContain(
      "Lo que nunca se publica: la fecha en que te registraste, las notas internas de la revisión y el motivo por el que, en su caso, no publicamos tu ficha. Eso solo lo ve quien administra el directorio.",
    );
  });
});

describe("paginas-legales · el vecino abre los términos", () => {
  // Scenario: el vecino abre los términos
  it("encabeza con el h1, la línea de última actualización y el contenido completo", () => {
    expect(lineasTerminos[0]).toBe("Términos y condiciones");
    expect(lineasTerminos.some((l) => l.startsWith("Última actualización: "))).toBe(true);
    expect(htmlTerminos.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(htmlTerminos).not.toMatch(/<h[3-6][\s>]/);
    expect(lineasTerminos.filter((linea) => linea.startsWith("## "))).toEqual([
      "## Qué es NecesitoUno Tizayuca",
      "## Somos un intermediario informativo, no el negocio",
      "## Qué verificamos y qué no",
      "## Reglas para registrar un negocio",
      "## Podemos retirar una ficha",
      "## Si ves algo raro",
      "## Uso de la información del directorio",
      "## Tus datos personales",
      "## Cambios a estos términos",
      "## Ley aplicable",
    ]);
  });

  // Scenario: los términos enlazan al aviso de privacidad
  it("enlazan al aviso de privacidad desde la sección de datos personales", () => {
    const delDocumento = enlaces(htmlTerminos);
    expect(delDocumento).toHaveLength(1);
    expect(delDocumento[0].texto).toBe("Aviso de privacidad");
    expect(delDocumento[0].href).toBe("/aviso-de-privacidad");
    expect(seccion(lineasTerminos, "Tus datos personales")).toContain("Aviso de privacidad");
  });
});

describe("paginas-legales · intermediario informativo y deslinde", () => {
  // Scenario: deslinde de la operación entre vecino y negocio
  it("el trato es directo entre vecino y negocio; el directorio no es parte", () => {
    const texto = seccion(lineasTerminos, "Somos un intermediario informativo, no el negocio");
    expect(texto).toContain("NecesitoUno Tizayuca solo muestra información.");
    expect(texto).toContain("No prestamos los servicios ni vendemos los productos que aparecen en las fichas.");
    expect(texto).toContain("es un trato directo entre tú y ese negocio");
    expect(texto).toContain("no es parte de ese trato, no lo garantiza, no lo supervisa y no responde por él");
    expect(texto).toContain("Tampoco respondemos por daños, pérdidas o desacuerdos");
  });

  it("no cobra por publicar ni cobra comisiones", () => {
    expect(seccion(lineasTerminos, "Qué es NecesitoUno Tizayuca")).toContain(
      "No cobramos por registrarse, no vendemos nada, no cobramos comisiones y no hay cuentas ni contraseñas.",
    );
  });

  // Scenario: alcance real del sello "Negocio verificado"
  it('el sello "Negocio verificado" solo dice que el negocio existe y que el número es suyo', () => {
    const texto = seccion(lineasTerminos, "Qué verificamos y qué no");
    expect(texto).toContain("que el negocio existe y que el número es de quien lo registró");
    expect(texto).toContain('Eso, y nada más que eso, es lo que significa el sello "Negocio verificado".');
    expect(texto).toContain(
      "Lo que no verificamos: la calidad del trabajo, los precios, que el negocio tenga licencias, permisos o seguros, ni que lo que dice su ficha siga siendo cierto con el tiempo.",
    );
  });
});

describe("paginas-legales · reglas de moderación del PRD §6.3 publicadas", () => {
  // Scenario: las reglas de moderación están publicadas (las cinco viñetas)
  it("publica las cinco reglas completas, con los ejemplos del PRD", () => {
    const texto = seccion(lineasTerminos, "Reglas para registrar un negocio");
    expect(texto).toContain("Revisamos a mano cada registro antes de publicarlo.");
    expect(texto).toContain(
      "Actividades ilegales, o que necesitan una licencia o un permiso que no se pueda demostrar: venta de medicamentos controlados, armas, préstamos informales y parecidos.",
    );
    expect(texto).toContain("Contenido ofensivo, discriminatorio o sexual.");
    expect(texto).toContain(
      "Fichas de negocios ajenos registradas por alguien sin autorización del negocio: solo lo registra su dueño o alguien con su permiso.",
    );
    expect(texto).toContain("Fotos que no cumplan las reglas de publicación del directorio.");
    expect(texto).toContain(
      "Datos falsos, un número de contacto que no es del negocio, o registrar la misma ficha varias veces.",
    );
  });

  // Scenario: rechazar no es para siempre
  it("rechazar no es definitivo: motivo por WhatsApp, reenvío y borrado a los 90 días", () => {
    expect(seccion(lineasTerminos, "Reglas para registrar un negocio")).toContain(
      "Rechazar no es para siempre: te avisamos por WhatsApp con el motivo y puedes corregir y volver a enviar tu registro. Los datos de los registros rechazados se borran a los 90 días.",
    );
  });

  // Scenario: retiro de fichas
  it("el directorio puede no publicar o retirar una ficha, y la baja a petición es inmediata", () => {
    expect(seccion(lineasTerminos, "Podemos retirar una ficha")).toContain(
      "Nos reservamos el derecho de no publicar o de retirar cualquier ficha que rompa estas reglas o que ya no corresponda a un negocio real de Tizayuca. Y si el propio negocio nos pide que la bajemos, la bajamos de inmediato.",
    );
  });
});

describe("paginas-legales · placeholders visibles y marca de borrador", () => {
  // Scenario: el domicilio del responsable todavía no existe
  it("los datos que faltan se leen entre corchetes, no inventados ni en blanco", () => {
    for (const placeholder of [
      "[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento]",
      "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]",
      "[CORREO ARCO — completar antes del lanzamiento]",
      "[WHATSAPP DEL DIRECTORIO — completar antes del lanzamiento]",
    ]) {
      expect(lineasAviso.join(" ")).toContain(placeholder);
    }
    expect(lineasTerminos.join(" ")).toContain(
      "[CORREO DE CONTACTO — completar antes del lanzamiento]",
    );
    expect(lineasTerminos.join(" ")).toContain(
      "[JURISDICCIÓN PARA CONTROVERSIAS — confirmar en la revisión legal]",
    );
  });

  // Scenario: marca de borrador visible. Es la regla, no el estado de hoy:
  // cuando E6-3 complete los datos y vacíe la lista, la marca desaparece sola
  // y este caso lo comprueba por el otro lado (ver también
  // `tests/legales-borrador.test.ts`, que simula la lista ya vacía).
  it("la marca de borrador se ve arriba si y solo si quedan pendientes", () => {
    for (const lineas of [lineasAviso, lineasTerminos]) {
      if (HAY_PLACEHOLDERS_PENDIENTES) {
        expect(lineas[1]).toBe(TEXTO_MARCA_BORRADOR); // justo debajo del h1
      } else {
        expect(lineas).not.toContain(TEXTO_MARCA_BORRADOR);
      }
    }
    expect(TEXTO_MARCA_BORRADOR).toBe(
      "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance.",
    );
  });

  // Scenario: los pendientes son verificables
  it("todo corchete que aparece en las páginas está declarado en PLACEHOLDERS_LEGALES", () => {
    const enLasPaginas = new Set(
      [...[...lineasAviso, ...lineasTerminos].join("\n").matchAll(/\[[^\]]+\]/g)].map(
        (m) => m[0],
      ),
    );
    for (const encontrado of enLasPaginas) {
      expect(PLACEHOLDERS_LEGALES, `placeholder sin declarar: ${encontrado}`).toContain(
        encontrado,
      );
    }
    // Y al revés: ningún placeholder declarado se quedó fuera del texto.
    for (const declarado of PLACEHOLDERS_LEGALES) {
      expect(enLasPaginas, `placeholder declarado que nadie usa: ${declarado}`).toContain(
        declarado,
      );
    }
  });

  // Scenario: los pendientes son verificables (nada inventado)
  it("ninguna página legal trae correo, teléfono o domicilio inventado", () => {
    const sinPlaceholders = [...lineasAviso, ...lineasTerminos]
      .join("\n")
      .replace(/\[[^\]]+\]/g, "");
    expect(sinPlaceholders).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/); // correos
    expect(sinPlaceholders).not.toMatch(/\b\d{7,}\b/); // teléfonos
    expect(sinPlaceholders).not.toMatch(/wa\.me|whatsapp\.com|https?:\/\//);
    expect(sinPlaceholders).not.toMatch(/\bC\.?P\.?\s*\d|\bcalle\b|\bavenida\b|\bnúm(?:ero)?\.\s*\d/i);
  });
});

describe("paginas-legales · indexables y con metadata propia", () => {
  // Scenario: sin noindex
  it("ninguna de las dos pide a los buscadores que no la indexe", () => {
    expect(metadataAviso.robots).toBeUndefined();
    expect(metadataTerminos.robots).toBeUndefined();
    for (const ruta of ["src/app/(publico)/aviso-de-privacidad/page.tsx", "src/app/(publico)/terminos/page.tsx"]) {
      expect(fuente(ruta), ruta).not.toMatch(/noindex|index:\s*false/);
    }
  });

  // Scenario: título y descripción propios
  it("cada una tiene título y descripción del documento, distintos de los del sitio", () => {
    expect(metadataAviso.title).toBe("Aviso de privacidad — NecesitoUno Tizayuca");
    expect(metadataTerminos.title).toBe("Términos y condiciones — NecesitoUno Tizayuca");
    expect(metadataAviso.description).toBe(
      "Qué datos pide NecesitoUno Tizayuca al registrar un negocio, para qué los usa, qué queda público en el directorio y cómo ejercer tus derechos ARCO.",
    );
    expect(metadataTerminos.description).toBe(
      'Las reglas de NecesitoUno Tizayuca: qué es el directorio, el deslinde entre vecinos y negocios, qué significa "Negocio verificado" y las reglas de moderación.',
    );
    for (const propia of [metadataAviso, metadataTerminos]) {
      expect(propia.title).not.toBe(metadataSitio.title);
      expect(propia.description).not.toBe(metadataSitio.description);
    }
    expect(metadataAviso.title).not.toBe(metadataTerminos.title);
  });
});

describe("paginas-legales · Server Components mobile-first sin JS de cliente", () => {
  const archivosNuevos = [
    "src/app/(publico)/aviso-de-privacidad/page.tsx",
    "src/app/(publico)/terminos/page.tsx",
    "src/components/legales/documento-legal.tsx",
    "src/lib/legales/textos.ts",
  ];

  // Scenario: sin JavaScript de cliente
  it('ninguno de los archivos de las páginas legales declara "use client"', () => {
    for (const ruta of archivosNuevos) {
      expect(fuente(ruta), ruta).not.toMatch(/["']use client["']/);
    }
  });

  // Scenario: sin JavaScript de cliente (el contenido se ve sin JS: todo el
  // texto viaja ya renderizado en el HTML del servidor)
  it("el HTML del servidor ya trae el documento completo", () => {
    expect(lineasAviso.length).toBeGreaterThanOrEqual(40);
    expect(lineasTerminos.length).toBeGreaterThanOrEqual(30);
    expect(htmlAviso).toContain("Tus derechos ARCO");
    expect(htmlTerminos).toContain("Reglas para registrar un negocio");
  });

  // Scenario: se leen en el celular (la parte automatizable: área táctil de
  // los enlaces y ningún ancho fijo que fuerce scroll horizontal a 390px; la
  // revisión visual a 390/768/1280 es humana, tasks.md #26)
  it("los enlaces entre documentos reservan 44px y no hay anchos fijos", () => {
    for (const { etiqueta } of [...enlaces(htmlAviso), ...enlaces(htmlTerminos)]) {
      expect(etiqueta).toContain("min-h-11");
    }
    const vista = fuente("src/components/legales/documento-legal.tsx");
    expect(vista).toMatch(/\bmax-w-\w+\b/); // ancho de lectura cómodo
    expect(vista).not.toMatch(/\bw-\[\d|\bmin-w-\[\d/); // nada de anchos fijos
  });
});

describe("paginas-legales · lenguaje llano, sin jerga de contrato", () => {
  // Scenario: nada de esto necesita conocimiento legal para entenderse
  // Scenario: lenguaje llano también en los términos
  // (La lectura de fondo es humana; esto caza las señales objetivas de jerga.)
  it.each([
    ["aviso", lineasAviso],
    ["términos", lineasTerminos],
  ])("%s: segunda persona, sin latinismos ni párrafos en mayúsculas", (nombre, lineas) => {
    const texto = lineas.join("\n");
    expect(texto, nombre).toMatch(/\btus?\b/i); // habla de tú
    expect(texto, nombre).not.toMatch(
      /en lo sucesivo|el titular de los datos|por medio del presente|de conformidad con lo dispuesto|mutatis mutandis|ipso facto|el usuario se obliga|las partes convienen/i,
    );
    for (const linea of lineas) {
      const letras = linea.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
      // Los placeholders van a propósito en mayúsculas: se ignoran.
      const sinPlaceholders = linea.replace(/\[[^\]]+\]/g, "").replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
      if (letras.length > 40 && sinPlaceholders.length > 20) {
        expect(sinPlaceholders, `${nombre}: párrafo en mayúsculas · ${linea}`).not.toBe(
          sinPlaceholders.toUpperCase(),
        );
      }
    }
  });
});
