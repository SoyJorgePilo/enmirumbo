import { AvisoConsentimiento } from "@/components/registro/aviso-consentimiento";
import { CampoHoneypot } from "@/components/registro/campo-honeypot";
import { FormularioRegistro } from "@/components/registro/formulario-registro";
import { obtenerPrisma } from "@/lib/prisma";

/**
 * Página pública de registro (spec `registro-negocio`, PRD §6.1/§6.5).
 * Server Component: lee los catálogos de la base y arma la página alrededor
 * del formulario.
 *
 * Se renderiza por request (`force-dynamic`) para que las listas de
 * categorías y colonias sean siempre las de la base y para no tener que
 * abrirla al construir el sitio (en CI no hay base de datos).
 */
export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  const prisma = obtenerPrisma();
  const [categorias, colonias] = await Promise.all([
    prisma.categoria.findMany({ orderBy: { id: "asc" } }),
    prisma.colonia.findMany({ orderBy: { id: "asc" } }),
  ]);

  return (
    <section className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Registra tu negocio gratis
        </h1>
        <p className="text-tinta-suave">
          Llena este formulario en un par de minutos, sin cuenta ni
          contraseña. En cuanto lo revisemos, te contactamos por WhatsApp.
        </p>
      </div>
      <FormularioRegistro
        categorias={categorias}
        colonias={colonias}
        honeypot={<CampoHoneypot />}
        aviso={<AvisoConsentimiento />}
      />
    </section>
  );
}
