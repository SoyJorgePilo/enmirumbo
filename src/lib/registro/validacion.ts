/**
 * Validación del registro de negocios (spec `registro-negocio`, requirement
 * "El servidor valida todos los campos y devuelve errores por campo").
 *
 * Módulo puro: no toca la base ni el request. Recibe lo capturado y los
 * catálogos, devuelve o los datos listos para el modelo o un mensaje por
 * campo. Así la validación es la misma con o sin JavaScript de cliente, y el
 * panel (E3) y la edición (E8) la pueden reutilizar.
 */

import { normalizarWhatsapp } from "@/lib/whatsapp";

import {
  COLONIA_OTRA_VALOR,
  LIMITES_LONGITUD,
  MENSAJES_ERROR_REGISTRO,
  mensajeLimiteLongitud,
} from "./textos";
import {
  VALORES_VACIOS_REGISTRO,
  type CamposFormularioRegistro,
  type DatosNegocioValidados,
  type ErroresFormularioRegistro,
} from "./tipos";

/** Lo que llega en un envío del formulario, ya separado en sus tres partes. */
export type EnvioRegistro = {
  campos: CamposFormularioRegistro;
  /** El checkbox del aviso de privacidad venía marcado. */
  consentimiento: boolean;
  /** Contenido del campo trampa (honeypot): vacío en un envío humano. */
  trampa: string;
};

export type ResultadoValidacion =
  | { ok: true; datos: DatosNegocioValidados }
  | { ok: false; errores: ErroresFormularioRegistro };

export type EntradaValidacion = {
  campos: CamposFormularioRegistro;
  consentimiento: boolean;
  categorias: ReadonlyArray<{ id: number }>;
  colonias: ReadonlyArray<{ id: number }>;
};

/** Nombre del campo trampa; debe coincidir con `CampoHoneypot`. */
export const CAMPO_TRAMPA = "sitio_web";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Valores que cuentan como "casilla marcada". El navegador manda `on` para un
 * checkbox sin `value` propio; los demás son cortesía para clientes que no
 * son un navegador.
 */
const VALORES_AFIRMATIVOS = new Set(["on", "true", "1", "si", "sí"]);

/**
 * Un checkbox solo aparece en el FormData cuando viene marcado, pero un POST
 * crudo puede mandar la clave con cualquier valor. Se exige un valor
 * afirmativo (hallazgo MEDIO 2 de la etapa C): de otro modo
 * `consentimiento=` o `consentimiento=false` dejaban una constancia LFPDPPP
 * (`consintioAvisoEn`) de un envío que nunca afirmó consentir.
 */
function casilla(formData: FormData, campo: string): boolean {
  const valor = formData.get(campo);
  return (
    typeof valor === "string" &&
    VALORES_AFIRMATIVOS.has(valor.trim().toLowerCase())
  );
}

/**
 * Lee el envío sin interpretarlo: solo recorta espacios. Ningún campo del
 * ciclo de vida (`estado`, `origen`, `publicadoEn`, `tokenGestion`,
 * `consintioAvisoEn`) se lee aquí — si el cliente los manda, se ignoran por
 * construcción.
 */
export function leerEnvioRegistro(formData: FormData): EnvioRegistro {
  return {
    campos: {
      nombre: texto(formData, "nombre"),
      categoriaId: texto(formData, "categoriaId"),
      whatsapp: texto(formData, "whatsapp"),
      coloniaId: texto(formData, "coloniaId"),
      coloniaOtra: texto(formData, "coloniaOtra"),
      queOfreces: texto(formData, "queOfreces"),
      entregaADomicilio: casilla(formData, "entregaADomicilio"),
      telefonoFijo: texto(formData, "telefonoFijo"),
      direccion: texto(formData, "direccion"),
      horario: texto(formData, "horario"),
      facebookUrl: texto(formData, "facebookUrl"),
    },
    consentimiento: casilla(formData, "consentimiento"),
    trampa: texto(formData, CAMPO_TRAMPA),
  };
}

/** Id de catálogo: solo dígitos y solo si existe en la lista cerrada. */
function idDeCatalogo(
  valor: string,
  catalogo: ReadonlyArray<{ id: number }>,
): number | null {
  if (!/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return catalogo.some((fila) => fila.id === id) ? id : null;
}

/**
 * URL de Facebook aceptable, ya normalizada, o `null` si no lo es.
 *
 * - Solo `http(s)`: cierra `javascript:`, `data:`, `vbscript:`, `file:` y
 *   `//host` (T-001, hallazgo bajo).
 * - Sin credenciales incrustadas: `https://facebook.com@evil.example` es un
 *   enlace a `evil.example` disfrazado de Facebook (hallazgo MEDIO 4).
 * - Devuelve `url.href`, no la cadena cruda: el host queda en su forma
 *   canónica (un homógrafo como `facebоok.com` se guarda en punycode, visible
 *   para quien luego lo pinte) y desaparecen los espacios y caracteres de
 *   control del borde.
 *
 * El dominio NO se restringe (design.md §3: los negocios pegan links de
 * `m.facebook.com`, `fb.me` y perfiles con parámetros), así que quien pinte
 * este valor debe hacerlo con `rel="noopener noreferrer"` y sin prometer que
 * lleva a Facebook.
 */
function urlHttpNormalizada(valor: string): string | null {
  try {
    const url = new URL(valor);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username !== "" || url.password !== "") return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Recorta espacios de todo texto libre. Se hace también aquí (no solo al
 * leer el FormData) para que la validación no dependa de quién la llame:
 * " " no es un nombre de negocio.
 */
function recortar(campos: CamposFormularioRegistro): CamposFormularioRegistro {
  const recortados = { ...campos };
  for (const [clave, valor] of Object.entries(recortados)) {
    if (typeof valor === "string") {
      (recortados as Record<string, unknown>)[clave] = valor.trim();
    }
  }
  return recortados;
}

export function validarRegistro({
  campos: capturados,
  consentimiento,
  categorias,
  colonias,
}: EntradaValidacion): ResultadoValidacion {
  const campos = recortar(capturados);
  const errores: ErroresFormularioRegistro = {};

  // Cotas de longitud de los campos de texto libre, todas con el mismo molde
  // de mensaje.
  const limitados = [
    "nombre",
    "coloniaOtra",
    "queOfreces",
    "telefonoFijo",
    "direccion",
    "horario",
    "facebookUrl",
  ] as const;
  for (const campo of limitados) {
    const maximo = LIMITES_LONGITUD[campo];
    if (campos[campo].length > maximo) {
      errores[campo] = mensajeLimiteLongitud(maximo);
    }
  }

  // Los otros tres campos también llevan cota (MEDIO 3), pero su mensaje es el
  // literal que la spec exige para ese campo: un WhatsApp de 100 KB es, para
  // el dueño, "un número que no tiene 10 dígitos", no "un texto muy largo".
  const excedeCota = (campo: "whatsapp" | "categoriaId" | "coloniaId") =>
    campos[campo].length > LIMITES_LONGITUD[campo];

  // ── Obligatorios ──
  if (!campos.nombre) errores.nombre = MENSAJES_ERROR_REGISTRO.nombre;

  const categoriaId = excedeCota("categoriaId")
    ? null
    : idDeCatalogo(campos.categoriaId, categorias);
  if (categoriaId === null) errores.categoriaId = MENSAJES_ERROR_REGISTRO.categoriaId;

  const whatsapp = excedeCota("whatsapp")
    ? null
    : normalizarWhatsapp(campos.whatsapp);
  if (whatsapp === null) errores.whatsapp = MENSAJES_ERROR_REGISTRO.whatsapp;

  // Colonia: del catálogo, u "Otra" con texto libre obligatorio pendiente de
  // normalizar (PRD §6.3). Si se eligió una del catálogo, el texto se ignora.
  const eligioOtra = campos.coloniaId === COLONIA_OTRA_VALOR;
  const coloniaId =
    eligioOtra || excedeCota("coloniaId")
      ? null
      : idDeCatalogo(campos.coloniaId, colonias);
  let coloniaOtra: string | null = null;
  if (eligioOtra) {
    if (!campos.coloniaOtra) {
      errores.coloniaOtra = MENSAJES_ERROR_REGISTRO.coloniaOtra;
    } else {
      coloniaOtra = campos.coloniaOtra;
    }
  } else if (coloniaId === null) {
    errores.coloniaId = MENSAJES_ERROR_REGISTRO.coloniaId;
  }

  if (!consentimiento) {
    errores.consentimiento = MENSAJES_ERROR_REGISTRO.consentimiento;
  }

  // ── Opcionales con regla propia ──
  let facebookUrl: string | null = null;
  if (campos.facebookUrl && !errores.facebookUrl) {
    facebookUrl = urlHttpNormalizada(campos.facebookUrl);
    if (facebookUrl === null) {
      errores.facebookUrl = MENSAJES_ERROR_REGISTRO.facebookUrl;
    }
  }

  if (Object.keys(errores).length > 0) return { ok: false, errores };

  return {
    ok: true,
    datos: {
      nombre: campos.nombre,
      // Los `!` son seguros: si fueran nulos habría error y ya habríamos vuelto.
      categoriaId: categoriaId!,
      whatsapp: whatsapp!,
      coloniaId,
      coloniaOtra,
      queOfreces: campos.queOfreces || null,
      entregaADomicilio: campos.entregaADomicilio,
      telefonoFijo: campos.telefonoFijo || null,
      direccion: campos.direccion || null,
      horario: campos.horario || null,
      // Ya normalizada (`url.href`), no la cadena cruda del usuario.
      facebookUrl,
    },
  };
}

/**
 * Versión de lo capturado apta para devolver al formulario: recortada y
 * truncada a la cota de cada campo.
 *
 * El formulario vuelve a pintar estos valores (`defaultValue`), así que sin
 * truncar, un POST con 100 KB en un campo se reflejaba íntegro en la
 * respuesta: amplificación gratis (hallazgo MEDIO 3). Solo se recorta lo que
 * ya excedía el máximo, es decir lo que de todos modos viene con su mensaje
 * de error al lado; un envío legítimo no pierde nada.
 */
export function recortarParaEco(
  campos: CamposFormularioRegistro,
): CamposFormularioRegistro {
  const eco = { ...campos };
  for (const [clave, valor] of Object.entries(eco)) {
    if (typeof valor !== "string") continue;
    const maximo = LIMITES_LONGITUD[clave as keyof typeof LIMITES_LONGITUD];
    const recortado = valor.trim();
    (eco as Record<string, unknown>)[clave] =
      typeof maximo === "number" ? recortado.slice(0, maximo) : recortado;
  }
  return eco;
}

/** Estado de error listo para devolver al formulario sin perder lo capturado. */
export function estadoConErrores(
  errores: ErroresFormularioRegistro,
  campos: CamposFormularioRegistro = VALORES_VACIOS_REGISTRO,
) {
  return { errores, valores: recortarParaEco(campos) };
}
