import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { enviarEdicion } from "@/app/(gestion)/editar/[token]/accion";
import { AvisoPrivacidadVigente } from "@/components/gestion/aviso-privacidad-vigente";
import { CampoHoneypot } from "@/components/registro/campo-honeypot";
import { FormularioRegistro } from "@/components/registro/formulario-registro";
import { obtenerFormularioDeEdicion } from "@/lib/gestion/consultas";
import {
  AVISO_EDICION_PENDIENTE,
  BOTON_ENVIAR_CAMBIOS,
  FRASE_EDICION,
  TITULO_EDICION,
} from "@/lib/gestion/textos";
import { obtenerPrisma } from "@/lib/prisma";

/**
 * Modo edición del enlace de gestión, `/editar/<token>` (spec
 * `registro-negocio`, requirement "El enlace de gestión abre la ficha en modo
 * edición con el mismo formulario prellenado"; ticket T-014).
 *
 * El token se resuelve por su HUELLA, en tiempo constante
 * (`src/lib/gestion/token.ts`, design.md §3). `notFound()` para cualquier cosa
 * que no resuelva: es EXACTAMENTE el mismo componente `NotFound`
 * (`src/app/not-found.tsx`) que cualquier URL inexistente del sitio — el
 * requirement "Un token que no es exactamente el vigente no abre nada ni
 * delata nada" pide que no haya ninguna diferencia observable, y reusar
 * `notFound()` es lo que lo garantiza por construcción.
 *
 * `noindex, nofollow` (design.md §4: el token viaja en la URL): ningún buscador
 * indexa esta pantalla, y el token tampoco se escribe en el log. La otra mitad
 * —que ningún enlace saliente filtre la URL al destino— la pone el layout del
 * grupo con `referrer: strict-origin`, para TODAS las pantallas de golpe y con
 * el único valor que no rompe el envío sin JavaScript: el porqué, medido, está
 * en `src/app/(gestion)/layout.tsx`.
 *
 * Y vive en el grupo `(gestion)` y no en `(publico)` —misma URL, otro layout—
 * para que la analítica no mida esta ruta: el tracker manda el `pathname` al
 * recolector del proveedor, o sea el token (hallazgo ALTO 1 de la etapa C).
 * El porqué completo está en `src/app/(gestion)/layout.tsx`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TITULO_EDICION,
  robots: { index: false, follow: false },
};

export default async function EditarPage({
  params,
}: PageProps<"/editar/[token]">) {
  const { token } = await params;

  const prisma = obtenerPrisma();
  const edicion = await obtenerFormularioDeEdicion(prisma, token);
  if (!edicion) notFound();

  const [categorias, colonias] = await Promise.all([
    prisma.categoria.findMany({ orderBy: { id: "asc" } }),
    prisma.colonia.findMany({ orderBy: { id: "asc" } }),
  ]);

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {TITULO_EDICION}
        </h1>
        <p className="text-tinta-suave">{FRASE_EDICION}</p>
      </div>

      {edicion.tieneEdicionPendiente && (
        <p
          role="status"
          className="rounded-xl border border-tinta p-4 text-sm font-semibold text-tinta"
        >
          {AVISO_EDICION_PENDIENTE}
        </p>
      )}

      <FormularioRegistro
        categorias={categorias}
        colonias={colonias}
        honeypot={<CampoHoneypot />}
        aviso={<AvisoPrivacidadVigente />}
        estadoInicial={{ errores: {}, valores: edicion.valores }}
        modo="edicion"
        accion={enviarEdicion.bind(null, token)}
        textoBoton={BOTON_ENVIAR_CAMBIOS}
      />
    </section>
  );
}
