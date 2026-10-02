import type { ReactElement } from "react";

import { COLORES_MARCA } from "../../lib/colores-marca";

/**
 * Imagen de marca para la vista previa al compartir (spec `layout-base`; en
 * Astro, spec `plataforma-astro`, requirement "La imagen de marca se sirve en
 * la misma dirección y no se renderiza por petición"; design.md §6 del change
 * `migrar-lectura-publica-astro`).
 *
 * Es el MISMO árbol que `src/app/opengraph-image.tsx` le pasaba a `next/og`:
 * mismos textos, tamaños y colores de `COLORES_MARCA`. Aquí solo vive la
 * descripción; el generador está en `generar.ts` y solo corre al construir.
 * El texto alternativo y las medidas viven en `datos.ts`, que es lo único de
 * la imagen que llega a la función del servidor (lo usan los metadatos).
 */
export function arbolDeLaImagenDeMarca(): ReactElement {
  return (
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
       * chica y separada, como línea de contexto.
       */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 84, fontWeight: 700 }}>EnMiRumbo</span>
        <span style={{ fontSize: 44, color: COLORES_MARCA["tinta-suave"] }}>Tizayuca</span>
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
  );
}
