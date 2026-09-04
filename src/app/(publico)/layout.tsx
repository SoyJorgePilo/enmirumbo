import { ScriptAnalitica } from "@/components/analitica/script-analitica";

/**
 * Tronco de las páginas PÚBLICAS (spec `layout-base`, requirement "El panel
 * del admin queda fuera de la medición"; design.md §1 del change
 * `agregar-analitica-cookieless`).
 *
 * `(publico)` es un grupo de rutas: no aparece en ninguna URL, así que mudar
 * aquí las páginas no cambió una sola dirección del sitio. Lo que sí cambia es
 * la estructura: este layout —y solo este— inyecta el script de la medición,
 * de modo que `/admin` queda fuera POR CONSTRUCCIÓN y no por una lista de
 * rutas que alguien tenga que recordar. Una página pública nueva que se cree
 * dentro del grupo queda medida sola; la 404 (`src/app/not-found.tsx`) vive
 * fuera del grupo y por eso no se mide, que es el efecto lateral aceptado en
 * el diseño.
 *
 * No repinta `<html>`, `<body>`, header ni footer: todo eso sigue en
 * `src/app/layout.tsx`. Server Component sin JavaScript propio.
 */
export default function LayoutPublico({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <ScriptAnalitica />
    </>
  );
}
