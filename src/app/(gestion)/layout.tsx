import type { Metadata } from "next";

/**
 * Tronco del modo edición del enlace de gestión (hallazgo ALTO 1 de la etapa C
 * del change `agregar-enlace-de-gestion`; spec `registro-negocio`, requirement
 * "Un token que no es exactamente el vigente no abre nada ni delata nada").
 *
 * **Para qué existe: para que el token no salga del sitio por la analítica.**
 *
 * `design.md` §4 enumera tres fugas de un secreto que viaja en la URL
 * —`Referer`, buscadores y log del servidor— y las cierra una por una. Falta
 * una cuarta, que la auditoría encontró: el tracker de la medición **manda la
 * ruta de cada vista al recolector del proveedor**, y `/editar/<token>` había
 * nacido dentro del grupo `(publico)`, que es exactamente —y solo— el layout
 * que inyecta ese script. `data-exclude-search="true"` quita la cadena de
 * consulta, no el `pathname`: el token va en el path. Cada vez que un dueño
 * abría su enlace, la credencial completa de su ficha quedaba guardada en la
 * base de un tercero, con su retención y su control de acceso.
 *
 * La exclusión es **estructural, no una lista de rutas**: es el mismo
 * mecanismo con el que el panel quedó fuera de la medición (design.md §1 de
 * `agregar-analitica-cookieless`). `(gestion)` es un grupo de rutas, así que
 * **no cambia ni una URL** —`/editar/<token>` sigue siendo `/editar/<token>`—
 * y tampoco cambia lo que se ve: el marco del sitio (`<html>`, `<body>`,
 * encabezado, pie y el `<main>` con su ancho máximo) sigue viviendo en
 * `src/app/layout.tsx`, que es de quien esta rama hereda. Lo único que este
 * grupo NO hereda es `<ScriptAnalitica />`.
 *
 * Si algún día cuelga otra pantalla del enlace de gestión, ponerla aquí basta
 * para que nazca fuera de la medición. Y si alguien intenta meter el script en
 * este archivo, hay dos tests que lo dicen:
 * `tests/analitica-exclusion-admin.test.ts` ("el script se renderiza desde un
 * único archivo") y `tests/gestion-seguridad-adversarial.test.ts` (§7, el
 * guardián de la cadena de layouts de la ruta de edición).
 *
 * ── Y para cortar el referente, con el valor que NO rompe el envío sin JS ──
 *
 * El token también se escaparía por el `Referer` de cualquier enlace saliente
 * (design.md §4, fuga 1): desde aquí se puede tocar "Lee el aviso de
 * privacidad completo", y en la página pública de destino el tracker reenvía
 * los referentes del mismo origen COMO RUTA. La política va en el layout —no
 * en cada pantalla— para que cubra también las que se agreguen mañana, igual
 * que en `src/app/admin/layout.tsx`.
 *
 * **Por qué `strict-origin` y no `no-referrer`**, que era lo que la
 * implementación traía y lo que la letra de design.md §4 sugiere. Es la misma
 * lección que el panel ya había pagado (hallazgo A-2 de la etapa C de
 * `agregar-analitica-cookieless`), verificada aquí otra vez con `curl` contra
 * el sitio servido:
 *
 * - Lo único que hay que ocultar es la RUTA, porque la ruta ES el secreto. Con
 *   `strict-origin` el referente que sale es el origen pelado
 *   (`https://sitio/`), sin `/editar/<token>`: la fuga queda cerrada igual de
 *   bien, y encima no manda nada al bajar de `https:` a `http:`.
 * - `no-referrer` hacía que el navegador mandara `Origin: null` en los POST de
 *   NAVEGACIÓN, y Next aborta toda Server Action cuyo `Origin` no case con el
 *   host: **el envío de cambios respondía 500 sin JavaScript** (medido:
 *   `Origin: null` → 500; `Origin` correcto → 303 a la confirmación). Con el
 *   runtime hidratado el envío va por `fetch` y sobrevive, así que el defecto
 *   solo aparecía en el camino que la spec tiene prometido: "la edición
 *   funciona sin JavaScript" (requirement aprobado de `registro-negocio`), que
 *   es justo el del dueño que abre el enlace desde un celular con mala red.
 * - `same-origin` NO sirve: la fuga es del mismo origen, así que dejaría pasar
 *   la ruta completa —con el token— a las páginas del propio sitio.
 *
 * Server Component sin JavaScript propio, y no pinta nada alrededor.
 *
 * El tipo es `LayoutProps<"/">` —el mismo que usa el layout de `(publico)`—
 * porque los grupos de rutas no son segmentos de URL: para Next este layout
 * cuelga de la raíz, y `LayoutRoutes` solo conoce `"/"` y `"/admin"`.
 */
export const metadata: Metadata = {
  referrer: "strict-origin",
};

export default function LayoutGestion({ children }: LayoutProps<"/">) {
  return <>{children}</>;
}
