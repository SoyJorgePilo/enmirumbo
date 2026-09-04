import Link from "next/link";

import { Buscador } from "@/components/directorio/buscador";
import { CategoriasGrid } from "@/components/directorio/categorias-grid";
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
 *
 * El buscador (change `agregar-buscador`, requirement "Buscador en la home
 * que funciona sin JavaScript de cliente") va arriba de "Busca por
 * categoría" y no agrega ningún encabezado: la home conserva su único `h1`
 * y sus tres `h2` (categorías, deporte, registro).
 *
 * La grilla de categorías vive en `CategoriasGrid` porque `/buscar` DEBE
 * ofrecer los mismos ocho botones "iguales a los de la home" en sus estados
 * sin resultados: con un solo marcado, "iguales" es una propiedad del código
 * y no algo que haya que recordar.
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

      <Buscador />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">Busca por categoría</h2>
        <CategoriasGrid categorias={categorias} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-5">
        {/* Icono decorativo HERMANO del h2, no dentro: el encabezado sigue
            siendo literalmente "Deporte en Tizayuca" (spec `directorio-publico`,
            enmienda del fundador vía validador). El contenedor flex los
            alinea visualmente sin tocar el texto del encabezado. */}
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-xl leading-none">
            ⚽
          </span>
          <h2 className="text-xl font-bold tracking-tight">Deporte en Tizayuca</h2>
        </div>
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
