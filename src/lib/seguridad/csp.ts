/**
 * Content-Security-Policy del sitio (change `preparar-deploy-produccion`,
 * encargo del orquestador; deuda declarada por el change
 * `agregar-analitica-cookieless` y por ADR-005).
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN UNA NOTA AL PIE: la analítica carga un script de
 * un tercero en TODAS las páginas públicas, incluida `/registro`, que es donde
 * el vecino teclea su nombre y su WhatsApp. Quien controle ese dominio ejecuta
 * código en esa pantalla. La CSP es lo que acota el daño: el navegador solo
 * ejecuta scripts del propio sitio y del proveedor declarado, y solo deja
 * mandar datos al propio sitio y al recolector del proveedor.
 *
 * SON DOS DOMINIOS, NO UNO (verificado leyendo el tracker y capturando su
 * envío, ver `.env.example`): el script se DESCARGA de `cloud.umami.is` y los
 * eventos se MANDAN por POST a `gateway.umami.is`. Con uno solo, la medición
 * se rompe en silencio: el script carga y ningún evento llega.
 *
 * LO QUE ESTA CSP NO ES: una defensa contra XSS. Lleva `'unsafe-inline'` en
 * `script-src` porque Next y React inyectan scripts en línea (el arranque del
 * cliente y los datos serializados del servidor) y la alternativa —un `nonce`
 * por petición— obliga a que TODA página se renderice por petición, incluidas
 * las legales, que hoy son estáticas y se sirven desde la CDN. Se prefiere una
 * CSP que sí acota los ORÍGENES y no cuesta rendimiento a una CSP perfecta que
 * volvería dinámico el sitio entero. El escape de todo lo que escribe un
 * usuario lo sigue haciendo React, y hay pruebas adversariales dedicadas.
 * Queda anotado como deuda en `docs/despliegue.md`.
 */

/** Dominio del que se descarga el script de medición (ADR-005). */
export const ORIGEN_SCRIPT_ANALITICA = "https://cloud.umami.is";

/** Dominio al que ese script manda los eventos. NO es el mismo. */
export const ORIGEN_ENVIO_ANALITICA = "https://gateway.umami.is";

/**
 * La política, en una línea, tal como viaja en la cabecera.
 *
 * `frame-ancestors 'none'` es lo que impide que alguien meta el directorio en
 * un iframe y le ponga encima sus propios botones; `form-action 'self'`, que
 * un formulario del sitio termine mandando el WhatsApp de un vecino a otro
 * dominio; y `object-src 'none'`, que se cuele un plugin.
 */
export function politicaDeSeguridadDeContenido(): string {
  const directivas = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ORIGEN_SCRIPT_ANALITICA]],
    // Tailwind sale en una hoja propia, pero React inyecta estilos en línea.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Las fotos las sirve el propio sitio (`/api/foto/…`); `data:` es para los
    // marcadores en línea y `blob:`, para la vista previa antes de subir.
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ORIGEN_ENVIO_ANALITICA]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["upgrade-insecure-requests", []],
  ] as const;

  return directivas
    .map(([nombre, valores]) => (valores.length ? `${nombre} ${valores.join(" ")}` : nombre))
    .join("; ");
}

/**
 * Referente que sale del sitio hacia otro dominio.
 *
 * `strict-origin-when-cross-origin` manda la URL completa dentro del propio
 * sitio y solo el origen hacia fuera (y nada al bajar de https: a http:).
 *
 * OJO, Y ESTÁ PROBADO: el panel necesita MÁS que esto y lo consigue por su
 * cuenta. `/admin` emite `<meta name="referrer" content="strict-origin">` en
 * su layout, y la meta **manda sobre esta cabecera** para ese documento. No es
 * un detalle de estilo: con la política global, salir del panel hacia una
 * página pública mandaría `/admin/registros/<id>` —que apunta al registro de
 * una persona concreta— como referente del mismo origen, y el tracker de la
 * analítica reenvía los referentes del mismo origen (PRD §8, LFPDPPP). Si
 * algún día se cambia una de las dos, hay que mirar la otra.
 */
export const POLITICA_DE_REFERENTE = "strict-origin-when-cross-origin";

/**
 * Cabeceras que el sitio manda en TODA respuesta.
 *
 * Se usan desde `next.config.ts`. Viven aquí, y no ahí, para que la suite
 * pueda comprobarlas sin cargar la configuración de Next.
 *
 * Las tres que acompañan a la CSP son baratas y cierran cosas que la CSP no
 * cubre del todo:
 *
 * - `X-Content-Type-Options: nosniff` — el sitio sirve BYTES SUBIDOS POR
 *   USUARIOS en `/api/foto/…`. Sin esto, un navegador que "adivina" el tipo
 *   podría decidir que un archivo que declaramos `image/webp` es en realidad
 *   otra cosa y tratarlo como tal. Se valida el contenido al subir, pero esta
 *   línea quita la categoría entera de problemas.
 * - `X-Frame-Options: DENY` — es redundante con `frame-ancestors 'none'` de la
 *   CSP **a propósito**: se ponen las DOS porque no son para el mismo
 *   navegador. `frame-ancestors` es la moderna y la que manda donde se
 *   entiende; `X-Frame-Options` es la que respetan los navegadores viejos que
 *   ignoran esa directiva. El coste es una línea.
 * - `Referrer-Policy` — ver arriba.
 *
 * Lo que NO se pone aquí es `Strict-Transport-Security`: la manda el hosting
 * junto con su certificado y ponerla desde la aplicación, en un sitio que
 * todavía no tiene dominio, es la forma clásica de dejar un dominio
 * inaccesible por meses. Queda anotada en `docs/despliegue.md` §10.
 */
export function cabecerasDeSeguridad(): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: politicaDeSeguridadDeContenido() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: POLITICA_DE_REFERENTE },
  ];
}
