/**
 * La mejora progresiva de `/registro`: el ÚNICO JavaScript propio de la página
 * (change `migrar-registro-astro`, design.md §1.3; spec `plataforma-astro`,
 * "Con JavaScript, el registro conserva la experiencia de hoy sin isla de
 * React"; spec `registro-negocio`, "El registro funciona sin JavaScript de
 * cliente").
 *
 * Sin JS, el formulario es HTML nativo y funciona solo. Con JS, esto hace
 * exactamente tres cosas, y nada más:
 *
 * 1. pone en "¿Qué ofreces?" el ejemplo de la categoría elegida (la tabla la
 *    calcula el servidor y viaja en `data-ejemplos`);
 * 2. al enviar, deshabilita el botón con "Enviando..." y manda el formulario
 *    por `fetch` a su MISMA dirección (`form.action`): pasa por la regla de
 *    origen, la tabla de Actions y el tope de 6 MiB, igual que sin JS;
 * 3. con la respuesta: navega a gracias o a verificar (solo esas dos, del
 *    mismo origen); reemplaza el formulario por el de la respuesta y enfoca
 *    el primer campo con error, sin recargar ni tocar la URL; o, ante
 *    cualquier otra cosa, deja todo como estaba y muestra el error general.
 *
 * Si la respuesta no llega en `ESPERA_MAXIMA_DEL_ENVIO_MS`, cancela el `fetch`
 * y termina como una falla de red: error general, botón reactivado y lo
 * capturado intacto, sin reenviar nada (c-seguridad 3b-1, observación 6;
 * hallazgo V1 de la validación): el botón no se queda en "Enviando...".
 *
 * No mide nada, no toca el campo de foto, no usa almacenamiento del
 * navegador, no navega a otro lado ni pide nada a otra dirección. Si faltan
 * `fetch`, `FormData` o `DOMParser`, no hace nada y el envío es el nativo.
 *
 * Las decisiones son funciones puras (probadas sin navegador); la capa del
 * DOM es lo mínimo.
 *
 * DESDE LA FASE 4 (change `migrar-enlace-gestion-astro`, design.md §4.2) el
 * mismo módulo mejora también `/editar/[token]`, con una configuración por
 * página (`ConfigDelFormulario`). La de `/registro` (`CONFIG_DE_REGISTRO`)
 * reproduce exactamente lo de antes; la de la edición la arma
 * `src/astro/gestion-cliente.ts` desde el propio `form.action`, y su texto de
 * error y su configuración viajan en ESE módulo (no en el de `/registro`).
 */
import { MENSAJES_ERROR_REGISTRO } from "@/lib/registro/textos";

/** Lo que cambia de una página con formulario a otra. */
export type ConfigDelFormulario = {
  /** La ruta de la página del formulario (sin consulta). */
  rutaDelFormulario: string;
  /** Los ÚNICOS destinos a los que se navega tras un envío (comparados por igualdad). */
  rutasDeExito: readonly string[];
  /** El error general que se muestra ante cualquier otra respuesta. */
  textoErrorGeneral: string;
  /** ¿Se pone el ejemplo de la categoría elegida al cargar? (en la edición, no: como Next). */
  ejemploAlCargar: boolean;
  /** Ante la 404 de su propia dirección: el error general o volver a cargarla. */
  alNoEncontrado: "error" | "recargar";
};

/** Los únicos destinos a los que se navega tras un envío del registro. */
export const RUTAS_DE_EXITO = ["/registro/gracias", "/registro/verificar"] as const;

/** La configuración de `/registro`: la de siempre. */
export const CONFIG_DE_REGISTRO: ConfigDelFormulario = Object.freeze({
  rutaDelFormulario: "/registro",
  rutasDeExito: RUTAS_DE_EXITO,
  textoErrorGeneral: MENSAJES_ERROR_REGISTRO.servidor,
  ejemploAlCargar: true,
  alNoEncontrado: "error",
});

/** El literal de hoy del botón mientras se envía. */
export const TEXTO_ENVIANDO = "Enviando...";

/**
 * Cuánto se espera la respuesta del envío antes de darla por fallida. Holgado
 * a propósito: una foto de 5 MB en una red móvil lenta tarda; el reloj solo
 * corta una red colgada.
 */
export const ESPERA_MAXIMA_DEL_ENVIO_MS = 60_000;

/** El mismo marcado que `MensajeError` del cuerpo del formulario (`id="general-error"`). */
export const CLASE_MENSAJE_ERROR = "text-sm font-semibold text-tinta";

/** Lo que importa de la respuesta del `fetch`. */
export type RespuestaDelEnvio = {
  status: number;
  /** La URL final, después de seguir las redirecciones. */
  url: string;
  /** ¿El documento de la respuesta trae el formulario de registro? */
  tieneFormulario: boolean;
};

export type DecisionTrasEnvio = { tipo: "navegar"; ruta: string } | { tipo: "reemplazar" } | { tipo: "recargar" } | { tipo: "error" };

/** Qué hacer con la respuesta del envío (design.md §1.3, paso 4; Fase 4, §4.2). */
export function decidirTrasEnvio(respuesta: RespuestaDelEnvio, origen: string, config: ConfigDelFormulario = CONFIG_DE_REGISTRO): DecisionTrasEnvio {
  let url: URL;
  try {
    url = new URL(respuesta.url);
  } catch {
    return { tipo: "error" };
  }
  if (url.origin !== origen) return { tipo: "error" };
  // La 404 de su propia dirección (el enlace dejó de abrir): se carga esa dirección.
  if (respuesta.status === 404 && config.alNoEncontrado === "recargar" && url.pathname === config.rutaDelFormulario) return { tipo: "recargar" };
  if (respuesta.status !== 200) return { tipo: "error" };
  const exito = config.rutasDeExito.find((ruta) => ruta === url.pathname);
  if (exito) return { tipo: "navegar", ruta: exito };
  if (url.pathname === config.rutaDelFormulario && respuesta.tieneFormulario) return { tipo: "reemplazar" };
  return { tipo: "error" };
}

/**
 * El ejemplo de la categoría elegida según la tabla de `data-ejemplos` (la
 * clave vacía es el genérico). `null` si la tabla no viene o no tiene la forma
 * esperada: entonces no se toca nada.
 */
export function ejemploPara(tabla: string | null | undefined, categoriaId: string): string | null {
  let ejemplos: unknown;
  try {
    ejemplos = JSON.parse(tabla ?? "");
  } catch {
    return null;
  }
  if (typeof ejemplos !== "object" || ejemplos === null || Array.isArray(ejemplos)) return null;
  const leer = (clave: string) => (Object.hasOwn(ejemplos, clave) ? (ejemplos as Record<string, unknown>)[clave] : undefined);
  const elegido = leer(categoriaId);
  if (typeof elegido === "string") return elegido;
  const generico = leer("");
  return typeof generico === "string" ? generico : null;
}

/** ¿Tiene el navegador `fetch`, `FormData` y `DOMParser`? */
export function puedeMejorar(ventana: object): boolean {
  return ["fetch", "FormData", "DOMParser"].every((api) => typeof (ventana as Record<string, unknown>)[api] === "function");
}

// ── La capa del DOM ─────────────────────────────────────────────────────────

/** Lo que se usa de `window` (así la prueba del DOM pone el suyo). */
export type VentanaDelRegistro = {
  fetch: typeof fetch;
  FormData: typeof FormData;
  DOMParser: typeof DOMParser;
  location: { origin: string; assign(ruta: string): void };
};

/** El formulario de registro de un documento: el que contiene `#categoriaId`. */
function formularioDe(raiz: Document): HTMLFormElement | null {
  const campo = raiz.getElementById("categoriaId");
  const formulario = campo?.closest("form");
  return formulario ?? null;
}

/** Pone el ejemplo de la categoría elegida, sin tocar lo escrito. */
function ponerEjemplo(formulario: HTMLFormElement): void {
  const categoria = formulario.querySelector<HTMLSelectElement>("#categoriaId");
  const queOfreces = formulario.querySelector<HTMLTextAreaElement>("#queOfreces");
  if (!categoria || !queOfreces) return;
  const ejemplo = ejemploPara(categoria.getAttribute("data-ejemplos"), categoria.value);
  if (ejemplo !== null) queOfreces.placeholder = ejemplo;
}

/** El primer campo con error: el `autofocus` del servidor o, si no, la casilla del aviso. */
function enfocarPrimerError(formulario: HTMLFormElement): void {
  const conFoco =
    formulario.querySelector<HTMLElement>("[autofocus]") ??
    (formulario.querySelector("#consentimiento-error") ? formulario.querySelector<HTMLElement>("#consentimiento") : null);
  conFoco?.focus();
}

/** Arriba del formulario, con el marcado de `MensajeError`, el error general de la página. */
function mostrarErrorGeneral(formulario: HTMLFormElement, textoErrorGeneral: string): void {
  const texto = `⚠ ${textoErrorGeneral}`;
  const existente = formulario.querySelector<HTMLElement>("#general-error");
  if (existente) {
    existente.textContent = texto;
    return;
  }
  const mensaje = formulario.ownerDocument.createElement("p");
  mensaje.id = "general-error";
  mensaje.setAttribute("role", "alert");
  mensaje.className = CLASE_MENSAJE_ERROR;
  mensaje.textContent = texto;
  // Va donde lo pinta el servidor: justo después del campo trampa.
  const primero = formulario.firstElementChild;
  if (primero) primero.after(mensaje);
  else formulario.prepend(mensaje);
}

/** La mejora de `/registro`: la de siempre, con su configuración. */
export function mejorarFormularioDeRegistro(documento: Document, ventana: VentanaDelRegistro): () => void {
  return mejorarFormulario(documento, ventana, CONFIG_DE_REGISTRO);
}

/**
 * Instala la mejora en el documento. Escucha en el documento (no en el
 * formulario) para seguir funcionando después de reemplazarlo. Devuelve cómo
 * quitarla (lo usan las pruebas).
 */
export function mejorarFormulario(documento: Document, ventana: VentanaDelRegistro, config: ConfigDelFormulario): () => void {
  const nada = () => {};
  if (!puedeMejorar(ventana)) return nada;
  const inicial = formularioDe(documento);
  if (!inicial) return nada;
  if (config.ejemploAlCargar) ponerEjemplo(inicial);
  let enviando = false;
  // En la edición el ejemplo de la categoría aparece solo tras un `change` (como Next).
  let huboCambio = false;

  const alCambiar = (evento: Event) => {
    const objetivo = evento.target as Element | null;
    const formulario = objetivo?.id === "categoriaId" ? objetivo.closest("form") : null;
    if (formulario) {
      huboCambio = true;
      ponerEjemplo(formulario);
    }
  };

  const alEnviar = (evento: Event) => {
    const formulario = formularioDe(documento);
    if (!formulario || evento.target !== formulario) return;
    evento.preventDefault();
    if (enviando) return;
    enviando = true;
    void enviar(formulario).finally(() => {
      enviando = false;
    });
  };

  documento.addEventListener("change", alCambiar);
  documento.addEventListener("submit", alEnviar);

  async function enviar(formulario: HTMLFormElement): Promise<void> {
    const boton = formulario.querySelector<HTMLButtonElement>('button[type="submit"]');
    const textoDelBoton = boton?.textContent ?? "";
    if (boton) {
      boton.disabled = true;
      boton.textContent = TEXTO_ENVIANDO;
    }
    // Sin `AbortController` (navegadores muy viejos) igual se deja de esperar.
    const control = typeof AbortController === "function" ? new AbortController() : null;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const vencido = new Promise<null>((listo) => {
      reloj = setTimeout(() => listo(null), ESPERA_MAXIMA_DEL_ENVIO_MS);
    });
    try {
      const recibida = await Promise.race([
        ventana
          .fetch(formulario.action, { method: "POST", body: new ventana.FormData(formulario), signal: control?.signal })
          .then(async (respuesta) => ({ respuesta, html: await respuesta.text() })),
        vencido,
      ]);
      if (recibida) {
        const { respuesta, html } = recibida;
        const recibido = formularioDe(new ventana.DOMParser().parseFromString(html, "text/html"));
        const decision = decidirTrasEnvio(
          { status: respuesta.status, url: respuesta.url, tieneFormulario: recibido !== null },
          ventana.location.origin,
          config,
        );
        if (decision.tipo === "navegar") {
          ventana.location.assign(decision.ruta);
          return;
        }
        if (decision.tipo === "recargar") {
          ventana.location.assign(config.rutaDelFormulario);
          return;
        }
        if (decision.tipo === "reemplazar" && recibido) {
          const nuevo = documento.importNode(recibido, true);
          formulario.replaceWith(nuevo);
          if (config.ejemploAlCargar || huboCambio) ponerEjemplo(nuevo);
          enfocarPrimerError(nuevo);
          return;
        }
      } else {
        // La red se colgó: se cancela y cae en el error general, sin reenviar.
        control?.abort();
      }
    } catch {
      // Una falla de red cae en el error general, sin reintentar.
    } finally {
      clearTimeout(reloj);
    }
    mostrarErrorGeneral(formulario, config.textoErrorGeneral);
    if (boton) {
      boton.disabled = false;
      boton.textContent = textoDelBoton;
    }
  }
  return () => {
    documento.removeEventListener("change", alCambiar);
    documento.removeEventListener("submit", alEnviar);
  };
}
