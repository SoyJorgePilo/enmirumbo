import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { avisarSinAlmacenDeFotosUnaVez } from "@/lib/fotos/almacen";
import { avisarSinBaseDeDatosUnaVez } from "@/lib/prisma";
import { metadataDelSitio } from "@/lib/seo/metadata";
import { avisarSinUrlSitioUnaVez } from "@/lib/sitio";
import { avisarSinSecretoDeTareasUnaVez } from "@/lib/tareas/secreto";

/**
 * Metadata base del sitio (spec `layout-base`): título y descripción, la
 * plantilla "%s — NecesitoUno" que heredan las páginas con título propio, la
 * identidad de la vista previa al compartir y la URL pública como base de
 * todas las URLs absolutas. Los valores viven en `src/lib/seo/metadata.ts`,
 * que es el mismo módulo que usan las páginas y los artefactos del sitio.
 *
 * LOS AVISOS DE ARRANQUE viven aquí, en el tronco del módulo: se ejecutan una
 * vez al cargar la aplicación, nunca por petición. Son las cuatro cosas que en
 * un despliegue no pueden faltar en silencio (spec `despliegue`): la URL
 * pública, la dirección de la base —que además tiene que ir cifrada si sale de
 * la máquina—, el secreto de las tareas programadas, sin el cual la purga de
 * los 90 días que promete el aviso de privacidad no se ejecuta nunca, y el
 * almacenamiento de las fotos, sin el cual el disco de la instancia se traga
 * los archivos y el borrado ARCO deja de borrar de verdad.
 */
avisarSinUrlSitioUnaVez();
avisarSinBaseDeDatosUnaVez();
avisarSinSecretoDeTareasUnaVez();
avisarSinAlmacenDeFotosUnaVez();

export const metadata: Metadata = metadataDelSitio();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      {/*
        `min-h-dvh` y no `min-h-full`: en Android la barra del navegador se
        colapsa al hacer scroll y el viewport real crece; con `100%` (que mide
        el viewport con la barra visible) quedaba una franja blanca bajo el pie
        (bug reportado por un vecino en producción, 2026-09-04). `dvh` sigue el
        tamaño dinámico y el pie siempre alcanza el borde.
      */}
      <body className="flex min-h-dvh flex-col bg-fondo font-sans text-tinta">
        <Header />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
