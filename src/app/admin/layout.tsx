import type { Metadata } from "next";

/**
 * Tronco del panel de revisión (hallazgo A-1 de la etapa C del change
 * `agregar-analitica-cookieless`; spec `layout-base`, requirement "El panel
 * del admin queda fuera de la medición").
 *
 * **Para qué existe: para cortar el referente.** Que `/admin` no cargue el
 * script de medición no basta. Cuando el admin sale del panel hacia una
 * página pública —el logo del encabezado, un enlace legal del pie, o un
 * "abrir en pestaña nueva" sobre cualquiera de ellos—, el navegador manda
 * `document.referrer` con la URL de la que venía, y en la página pública el
 * tracker del proveedor **reenvía los referentes del mismo origen como ruta**.
 * Verificado leyendo el tracker vigente y capturando su envío: el campo
 * `referrer` viaja en cada evento. Sin esto, `/admin/registros/<id>` —que
 * apunta al registro de una persona concreta— acabaría almacenado en un
 * tercero (PRD §8, LFPDPPP).
 *
 * `referrer: "strict-origin"` emite `<meta name="referrer" content="strict-origin">`
 * en el `<head>` de TODA pantalla del panel (los campos de metadata que una
 * página no redefine se heredan del layout). Es una propiedad del panel, no
 * de una lista de enlaces: cubre también los enlaces que se agreguen mañana,
 * sin que nadie tenga que acordarse de ponerles `rel="noreferrer"`.
 *
 * **Por qué `strict-origin` y no `no-referrer`** (hallazgo A-2 de la
 * re-auditoría; el valor no es intercambiable):
 *
 * - Lo único que había que ocultar es la RUTA. Con `strict-origin`, el
 *   referente que sale del panel es el origen pelado (`https://sitio/`), sin
 *   `/admin/registros/<id>`: la fuga queda cerrada igual de bien. De pilón,
 *   no manda nada al bajar de `https:` a `http:`.
 * - `no-referrer` hacía además que el navegador mandara `Origin: null` en los
 *   POST de navegación, y Next aborta toda Server Action cuyo `Origin` no
 *   case con el host: los formularios del panel respondían **500 sin
 *   JavaScript** (con el runtime hidratado el envío va por `fetch` y sí
 *   sobrevive, así que el defecto solo aparecía en el camino que el panel
 *   tiene prometido: "el panel funciona sin JavaScript", requirement aprobado
 *   de `revision-admin`). Aprobar un negocio desde un celular con la red mala
 *   es el flujo central del MVP.
 * - `same-origin` NO sirve aquí: la fuga es del mismo origen, así que dejaría
 *   pasar la ruta completa.
 *
 * Si algún día esto se mueve a la cabecera `Referrer-Policy` del hosting
 * (T-013), tiene que ir el MISMO valor, por la misma razón.
 *
 * Este layout NO renderiza el script de analítica —ni ningún otro— y no pinta
 * nada alrededor: el marco visual del sitio sigue viviendo en
 * `src/app/layout.tsx`. Si algún día se le agrega interfaz, sigue prohibido
 * que meta medición aquí; hay tests que lo vigilan.
 */
export const metadata: Metadata = {
  referrer: "strict-origin",
};

export default function LayoutPanel({ children }: LayoutProps<"/admin">) {
  return <>{children}</>;
}
