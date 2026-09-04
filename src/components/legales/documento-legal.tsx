import Link from "next/link";

import {
  HAY_PLACEHOLDERS_PENDIENTES,
  TEXTO_MARCA_BORRADOR,
  type BloqueLegal,
  type DocumentoLegal,
} from "@/lib/legales/textos";

/**
 * Presentación compartida de las dos páginas legales (`/aviso-de-privacidad`
 * y `/terminos`): pinta el `h1`, la marca de borrador (mientras queden
 * placeholders), la línea "Última actualización: ", la introducción y cada
 * sección como `h2` con sus párrafos/listas/enlaces (spec `paginas-legales`).
 * Server Component puro, sin directiva de cliente.
 *
 * `version` solo la pasa el aviso de privacidad (change
 * `versionar-aviso-privacidad`): antepone "Versión N · " a la línea de última
 * actualización. Los términos no se versionan —hoy no se aceptan con casilla—
 * así que la pintan tal cual. La versión llega como prop y no desde
 * `documento` a propósito (design.md §1): el módulo del texto no sabe de
 * versiones, es la versión la que sabe del texto.
 *
 * Ancho de lectura cómodo (`max-w-2xl`, más angosto que el `max-w-3xl` del
 * layout raíz) para el texto largo (tasks.md #26); se ve completo en 390px
 * sin scroll horizontal porque no hay elementos de ancho fijo.
 */
export function DocumentoLegalView({
  documento,
  version,
}: {
  documento: DocumentoLegal;
  version?: string;
}) {
  const lineaActualizacion = `${
    version ? `Versión ${version} · ` : ""
  }Última actualización: ${documento.ultimaActualizacion}`;

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{documento.h1}</h1>
        {HAY_PLACEHOLDERS_PENDIENTES && (
          <p className="rounded-lg border-2 border-tinta bg-superficie p-3 text-sm font-semibold text-tinta">
            {TEXTO_MARCA_BORRADOR}
          </p>
        )}
        <p className="text-sm text-tinta-suave">{lineaActualizacion}</p>
        <p className="text-tinta-suave">{documento.introduccion}</p>
      </header>
      {documento.secciones.map((seccion) => (
        <section key={seccion.encabezado} className="flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-tight text-tinta">
            {seccion.encabezado}
          </h2>
          {seccion.bloques.map((bloque, indice) => (
            // Los bloques de una sección no tienen identidad propia más allá
            // del orden: el índice es una key estable para contenido estático.
            <BloqueLegal key={indice} bloque={bloque} />
          ))}
        </section>
      ))}
      {documento.enlaceCierre && (
        <Link
          href={documento.enlaceCierre.href}
          className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
        >
          {documento.enlaceCierre.texto}
        </Link>
      )}
    </article>
  );
}

function BloqueLegal({ bloque }: { bloque: BloqueLegal }) {
  if (bloque.tipo === "parrafo") {
    return <p className="text-tinta-suave">{bloque.texto}</p>;
  }
  if (bloque.tipo === "lista") {
    return (
      <ul className="flex list-disc flex-col gap-2 pl-5 text-tinta-suave">
        {bloque.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <Link
      href={bloque.href}
      className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-accion-fuerte underline underline-offset-4"
    >
      {bloque.texto}
    </Link>
  );
}
