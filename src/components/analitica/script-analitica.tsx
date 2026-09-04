import { configuracionAnalitica } from "@/lib/analitica/config";

/**
 * El único script externo del sitio (spec `layout-base`, requirements "La
 * medición cookieless se carga solo si está configurada…" y "Un solo script
 * diferido y cero JavaScript propio de cliente").
 *
 * Server Component: no declara la directiva de cliente y no usa `next/script`
 * (que sí es un componente de cliente y sumaría bundle propio). Es una
 * etiqueta `<script>` a secas, diferida, sin código en línea y sin gestor de
 * etiquetas.
 * Sin configuración devuelve `null`: cero etiquetas, cero peticiones, cero
 * bytes.
 *
 * Se renderiza desde `src/app/(publico)/layout.tsx`, el tronco de las páginas
 * públicas, para que `/admin` quede fuera de la medición por construcción
 * (design.md §1).
 *
 * Atributos del tracker, confirmados el 2026-09-03 contra la documentación
 * vigente de Umami Cloud (https://umami.is/docs/tracker-configuration):
 *
 * - `data-website-id`: identificador del sitio en el proveedor (obligatorio).
 * - `data-exclude-search="true"`: la vista que se manda NO lleva la cadena de
 *   consulta. Es el requisito de privacidad que no se negocia: `/buscar?q=…`
 *   trae texto que escribió el vecino y no tiene por qué salir del sitio
 *   (design.md §3). El atributo sigue existiendo, así que no hizo falta el
 *   plan de respaldo.
 *
 * Los eventos NO se declaran aquí: viven como atributos de marcado en los
 * botones, y su contrato —el único lugar que escribe el prefijo del
 * proveedor— es `src/lib/analitica/eventos.ts`.
 */
export function ScriptAnalitica() {
  const configuracion = configuracionAnalitica();
  if (!configuracion) return null;

  return (
    <script
      defer
      src={configuracion.src}
      data-website-id={configuracion.websiteId}
      data-exclude-search="true"
    />
  );
}
