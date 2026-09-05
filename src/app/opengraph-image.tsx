import { ImageResponse } from "next/og";

import { COLORES_MARCA } from "@/lib/colores-marca";

/**
 * Imagen de marca para la vista previa al compartir (spec `layout-base`,
 * requirement "Server Component con documento en es-MX y metadata base": "una
 * imagen de marca del propio sitio"; design.md §7).
 *
 * Las fichas se comparten por WhatsApp y Facebook y sin `og:image` la vista
 * previa sale como un renglón gris. Cuando el negocio tiene foto se usa su
 * foto; cuando no, esta imagen, que **heredan todas las páginas** por la
 * convención de archivo de App Router (`opengraph-image.tsx`, ver
 * `node_modules/next/dist/docs/.../opengraph-image.md`).
 *
 * Se genera con `ImageResponse` de `next/og`, que viene dentro de Next: sin
 * dependencia nueva y sin un PNG binario que nadie pueda revisar en un diff.
 * Tipografía del sistema (la que trae `next/og`), sin fuentes descargadas.
 */
export const alt =
  "EnMiRumbo: encuentra negocios y servicios de Tizayuca y contáctalos por WhatsApp";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

export default function ImagenDeMarca() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
          padding: 80,
          background: COLORES_MARCA.fondo,
          color: COLORES_MARCA.tinta,
        }}
      >
        {/*
         * Rebrand T-019: el wordmark va solo y "Tizayuca" queda DEBAJO, más
         * chica y separada, como línea de contexto. En la forma anterior iban
         * en la misma línea y se leían como un nombre compuesto, que es justo
         * lo que el fundador descartó.
         */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 84, fontWeight: 700 }}>EnMiRumbo</span>
          <span style={{ fontSize: 44, color: COLORES_MARCA["tinta-suave"] }}>
            Tizayuca
          </span>
        </div>
        <span style={{ fontSize: 40, color: COLORES_MARCA["tinta-suave"] }}>
          Negocios y servicios de aquí, verificados uno por uno.
        </span>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            borderRadius: 999,
            padding: "16px 32px",
            fontSize: 34,
            fontWeight: 600,
            background: COLORES_MARCA.accion,
            color: COLORES_MARCA.tinta,
          }}
        >
          Contáctalos por WhatsApp
        </div>
      </div>
    ),
    size,
  );
}
