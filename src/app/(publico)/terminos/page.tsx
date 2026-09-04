import type { Metadata } from "next";

import { DocumentoLegalView } from "@/components/legales/documento-legal";
import { DESCRIPCION_TERMINOS, TERMINOS, TITULO_TERMINOS } from "@/lib/legales/textos";

/**
 * Términos y condiciones (spec `paginas-legales`, requirement "Página de
 * términos y condiciones en /terminos"; tasks.md #12). Server Component
 * dentro del layout global, sin directiva de cliente ni bundle propio.
 * Indexable: metadata propia y ninguna directiva que pida a los buscadores
 * no indexarla (ver la nota de `src/app/(publico)/aviso-de-privacidad/page.tsx`).
 */
export const metadata: Metadata = {
  title: TITULO_TERMINOS,
  description: DESCRIPCION_TERMINOS,
};

export default function TerminosPage() {
  return <DocumentoLegalView documento={TERMINOS} />;
}
