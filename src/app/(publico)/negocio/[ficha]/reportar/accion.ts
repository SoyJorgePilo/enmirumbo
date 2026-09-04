"use server";

/**
 * Server Action del mini-formulario de reporte (spec `directorio-publico`,
 * requirements del formulario, de la validación server-side, de la
 * confirmación y del anti-abuso).
 *
 * Es deliberadamente delgada, igual que la del registro: lee el envío, saca la
 * IP del request, delega TODO en `crearReporte` (probado en
 * `tests/reportes-crear.test.ts`) y decide a dónde va el vecino.
 *
 * Patrón POST → `redirect` → GET, el mismo del panel: al tener éxito manda a
 * la pantalla de confirmación (recargarla no crea otro reporte, porque ahí ya
 * no hay formulario), y al fallar vuelve al formulario con el código del error
 * en la URL, sin necesitar ni una línea de JavaScript de cliente.
 *
 * **En la URL solo viaja el CÓDIGO del error** (`motivo`, `comentario`,
 * `cupo`, `servidor`), que es un valor de una lista cerrada del propio
 * servidor. Lo que el vecino escribió se conserva en la cookie de borrador
 * (`src/lib/reportes/borrador.ts`): las URLs acaban en el log de acceso de
 * cualquier proxy y en el historial del teléfono, y el comentario es
 * exactamente lo que la spec de privacidad dice que no debe acabar ahí
 * (hallazgo M2 de la etapa C).
 *
 * **Lo que llega ligado con `.bind` NO lo fija el servidor: lo manda el
 * cliente.** Next serializa los argumentos ligados como campos ocultos del
 * formulario (`$ACTION_x:1`), en claro y sin firmar, también en un build de
 * producción; el cifrado de los docs de esta versión cubre las variables
 * capturadas por un closure, no los argumentos de `.bind`
 * (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`, que además
 * recuerda que hay que tratar toda Server Action como alcanzable por un POST
 * directo). Una versión anterior de este comentario afirmaba lo contrario, y
 * esa creencia dejó pasar el hallazgo M3 de la etapa C.
 *
 * Por eso el ÚNICO argumento ligado es `negocioId`, y su valor no se usa para
 * construir nada hasta que la base confirma que existe y está publicado. **La
 * ruta de la ficha se reconstruye aquí**, con el mismo constructor que usa
 * todo el directorio (`construirSegmentoFicha`) y con el nombre y el id que
 * devolvió la base — nunca con texto del envío. Antes viajaba ligada como
 * `hrefFicha` y acababa, sin que nadie la validara, en el `Location` del
 * `redirect` (redirect abierto) y en el atributo `Path` de la cookie de
 * borrador (un `;` colaba atributos y desactivaba justo el acotamiento que
 * introdujo la corrección de M2).
 */

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { obtenerNegocioPublicado } from "@/lib/directorio";
import { construirSegmentoFicha } from "@/lib/ficha-url";
import { obtenerPrisma } from "@/lib/prisma";
import { ipDeEncabezados } from "@/lib/registro/limite-ip";
import { CAMPO_TRAMPA } from "@/lib/registro/validacion";
import {
  NOMBRE_COOKIE_BORRADOR,
  codificarBorrador,
  opcionesCookieBorrador,
} from "@/lib/reportes/borrador";
import { crearReporte } from "@/lib/reportes/crear";
import { LIMITE_COMENTARIO_REPORTE } from "@/lib/reportes/textos";

/**
 * Un grupo de radios manda un solo valor. Varios `motivo` en el mismo envío
 * son un POST manipulado: se descarta el envío entero en vez de quedarse con
 * el primero (no se adivina la intención de un envío que no vino del
 * formulario).
 */
function motivoDelEnvio(formData: FormData): unknown {
  const valores = formData.getAll("motivo");
  return valores.length === 1 ? valores[0] : undefined;
}

/** Texto de un campo; un `File` colado en el envío cuenta como vacío. */
function textoDelEnvio(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

/** Misma regla que la cookie del panel: en producción, solo por HTTPS. */
async function sirviendoPorHttps(): Promise<boolean> {
  const encabezados = await headers();
  const protocolo = encabezados.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (
    protocolo === "https" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

export async function reportarNegocio(
  negocioId: string,
  formData: FormData,
): Promise<void> {
  // Un POST manipulado puede cambiar los argumentos ligados: el campo oculto
  // `$ACTION_x:1` es un arreglo en claro, así que puede traer más elementos de
  // los que la acción declara —y entonces lo que llega como `formData` es lo
  // que el cliente puso, no el formulario— o un `negocioId` que no es texto
  // (`[null]`, `[12345]`, `[{…}]`). Las dos formas se responden con el mismo
  // 404 de siempre, sin escribir nada y sin cookie, en vez de reventar más
  // abajo con un 500 —que no filtraba nada, pero dejaba a un anónimo llenar el
  // log de trazas a voluntad (observación O11 de la etapa C).
  if (typeof negocioId !== "string") notFound();
  if (!(formData instanceof FormData)) notFound();

  const comentario = textoDelEnvio(formData, "comentario");

  // La ruta se arma con lo que devuelve la BASE (`negocio.nombre` y
  // `negocio.id`), no con el `negocioId` que llegó en el envío: si ese
  // identificador no corresponde a una ficha publicada, aquí se acaba el
  // camino con el mismo 404 que una ficha inexistente. `construirSegmentoFicha`
  // slugifica el nombre, así que la ruta solo puede ser
  // `/negocio/<[a-z0-9-]>-<id>/reportar`: ni esquema, ni `//`, ni `;`.
  const negocio = await obtenerNegocioPublicado(negocioId);
  if (!negocio) notFound();
  const rutaFormulario = `/negocio/${construirSegmentoFicha(negocio.nombre, negocio.id)}/reportar`;

  const resultado = await crearReporte(obtenerPrisma(), {
    negocioId,
    motivo: motivoDelEnvio(formData),
    comentario,
    trampa: textoDelEnvio(formData, CAMPO_TRAMPA),
    ip: ipDeEncabezados(await headers()),
  });

  // El negocio dejó de estar publicado entre la lectura de arriba y el alta:
  // el mismo 404 que la ficha inexistente, sin decir cuál de los dos casos es.
  // `crearReporte` conserva su propia comprobación a propósito: es un módulo
  // que se puede llamar desde otro sitio y no delega su invariante en quien lo
  // llame.
  if (resultado.resultado === "no-encontrado") notFound();

  const hayError = resultado.resultado !== "creado" &&
    resultado.resultado !== "descartado-silencioso";

  // El borrador se escribe (o se borra) SIEMPRE, no solo al fallar: si el
  // envío salió bien, dejar el texto anterior en el navegador haría que el
  // siguiente reporte de esa misma persona apareciera con el comentario del
  // anterior ya puesto.
  const borrador = hayError ? codificarBorrador(comentario, LIMITE_COMENTARIO_REPORTE) : "";
  const opciones = opcionesCookieBorrador(rutaFormulario, await sirviendoPorHttps());
  const cookieStore = await cookies();
  if (borrador === "") {
    cookieStore.set(NOMBRE_COOKIE_BORRADOR, "", { ...opciones, maxAge: 0 });
  } else {
    cookieStore.set(NOMBRE_COOKIE_BORRADOR, borrador, opciones);
  }

  // Guardado, honeypot lleno o tope de pendientes alcanzado: la MISMA
  // confirmación. Los dos descartes silenciosos no delatan nada (design.md §3).
  if (!hayError) redirect(`${rutaFormulario}/gracias`);

  const error = resultado.resultado === "cupo-agotado" ? "cupo" : resultado.error;
  redirect(`${rutaFormulario}?error=${error}`);
}
