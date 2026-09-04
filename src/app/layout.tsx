import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { metadataDelSitio } from "@/lib/seo/metadata";
import { avisarSinUrlSitioUnaVez } from "@/lib/sitio";

/**
 * Metadata base del sitio (spec `layout-base`): título y descripción, la
 * plantilla "%s — NecesitoUno" que heredan las páginas con título propio, la
 * identidad de la vista previa al compartir y la URL pública como base de
 * todas las URLs absolutas. Los valores viven en `src/lib/seo/metadata.ts`,
 * que es el mismo módulo que usan las páginas y los artefactos del sitio.
 *
 * Si el sitio corre en producción sin `SITIO_URL`, el aviso queda en el log
 * del servidor una sola vez por proceso, nunca por petición.
 */
avisarSinUrlSitioUnaVez();

export const metadata: Metadata = metadataDelSitio();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-fondo font-sans text-tinta">
        <Header />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
