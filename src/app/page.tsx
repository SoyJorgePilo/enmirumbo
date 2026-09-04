import Link from "next/link";

import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

/**
 * Home provisional: contenido mínimo para ver el layout funcionando, más la
 * entrada al registro de negocios (Flujo A, PRD §7 — agregar-formulario-registro).
 * La home real (buscador, categorías, deporte) llega con E2-1.
 */
export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Bienvenido, vecino de Tizayuca
      </h1>
      <p className="max-w-md text-lg text-tinta-suave">
        Muy pronto vas a poder encontrar aquí los negocios y servicios de
        Tizayuca.
      </p>
      <Link href="/registro" className={CLASE_BOTON_PRIMARIO}>
        Registra tu negocio gratis
      </Link>
    </section>
  );
}
