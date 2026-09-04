import Link from "next/link";

import { SLUG_CATEGORIA_DEPORTE, listarCategorias } from "@/lib/directorio";
import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

/**
 * Home real del directorio (spec layout-base, requirement "Home del sitio
 * dentro del layout, con la entrada al registro" MODIFIED + spec
 * directorio-publico, requirements "La home muestra las 8 categorías..." y
 * "Bloque 'Deporte en Tizayuca'..."). Reemplaza la home provisional.
 *
 * Las categorías salen del catálogo de la base (`listarCategorias`), en su
 * orden de siembra. Se lee por request (`force-dynamic`, igual que
 * `/registro`) para no tener que abrir la base al construir el sitio: en CI
 * no hay base de datos.
 *
 * Los botones de categoría y la entrada de deporte usan el estilo NEUTRO
 * (`CLASE_BOTON_SECUNDARIO`): el verde de acción se reserva para "Registra
 * tu negocio gratis" (mandato literal de la spec) y, en el resto del sitio,
 * para el botón de WhatsApp — dos verdes distintos en la misma pantalla
 * competirían entre sí (PRD §11).
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const categorias = await listarCategorias();

  return (
    <div className="flex flex-col gap-10 py-6">
      <section className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          ¿Qué necesitas en Tizayuca?
        </h1>
        <p className="text-lg text-tinta-suave">
          Encuentra negocios y servicios de aquí cerquita y contáctalos
          directo por WhatsApp.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">Busca por categoría</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {categorias.map((categoria) => (
            <li key={categoria.slug}>
              <Link
                href={`/${categoria.slug}`}
                className="flex min-h-16 items-center justify-center rounded-xl border border-borde bg-superficie px-3 py-4 text-center text-sm font-semibold text-tinta transition-colors hover:bg-borde"
              >
                {categoria.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-5">
        <h2 className="text-xl font-bold tracking-tight">Deporte en Tizayuca</h2>
        <p className="text-tinta-suave">
          Escuelas, clubes y entrenadores para que los niños (y los grandes)
          se muevan.
        </p>
        <Link
          href={`/${SLUG_CATEGORIA_DEPORTE}`}
          className={`${CLASE_BOTON_SECUNDARIO} w-fit bg-fondo`}
        >
          Ver clubes y escuelas deportivas
        </Link>
      </section>

      <section className="flex flex-col items-center gap-3 border-t border-borde pt-8 text-center">
        <h2 className="text-xl font-bold tracking-tight">
          ¿Tienes un negocio en Tizayuca?
        </h2>
        <Link href="/registro" className={CLASE_BOTON_PRIMARIO}>
          Registra tu negocio gratis
        </Link>
      </section>
    </div>
  );
}
