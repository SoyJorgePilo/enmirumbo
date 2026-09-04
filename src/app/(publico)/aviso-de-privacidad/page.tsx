import type { Metadata } from "next";

import { DocumentoLegalView } from "@/components/legales/documento-legal";
import {
  AVISO_PRIVACIDAD,
  DESCRIPCION_AVISO_PRIVACIDAD,
  TITULO_AVISO_PRIVACIDAD,
} from "@/lib/legales/textos";
import { VERSION_AVISO } from "@/lib/legales/version";

/**
 * Aviso de privacidad integral (spec `paginas-legales`, requirement "Página
 * del aviso de privacidad integral en /aviso-de-privacidad"; tasks.md #6).
 * Server Component dentro del layout global, sin directiva de cliente ni
 * bundle de cliente propio (requirement "Server Components mobile-first sin
 * JavaScript de cliente"). Indexable: metadata propia y ninguna directiva
 * que pida a los buscadores no indexarla (requirement "Las dos páginas
 * legales son indexables y tienen metadata propia"). El literal de esa
 * directiva no se escribe ni en los comentarios: la verificación automática
 * (`tests/buscador-pagina.test.ts`) hace un regex crudo sobre el archivo.
 */
export const metadata: Metadata = {
  title: TITULO_AVISO_PRIVACIDAD,
  description: DESCRIPCION_AVISO_PRIVACIDAD,
};

export default function AvisoDePrivacidadPage() {
  // La versión se lee del módulo que la declara (`src/lib/legales/version.ts`),
  // nunca se escribe a mano aquí: al estrenar versión, esta página se entera
  // sola (requirement "El aviso de privacidad tiene una versión estable
  // declarada en un solo lugar").
  return <DocumentoLegalView documento={AVISO_PRIVACIDAD} version={VERSION_AVISO} />;
}
