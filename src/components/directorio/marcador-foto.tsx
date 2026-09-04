import Image from "next/image";

import type { VarianteFoto } from "@/lib/fotos/clave";
import { urlDeFoto, type AmbitoFoto } from "@/lib/fotos/url";
import { iconoDeCategoria } from "@/lib/ui/iconos-categorias";

type MarcadorFotoProps = {
  /**
   * Lo que está guardado en `Negocio.fotoClave`, TAL CUAL: este componente no
   * confía en ello, lo pasa por el validador de render (`urlDeFoto`). Si no
   * es una de las claves que genera el servidor —una URL externa, un `data:`,
   * una ruta con `..`, una cadena cualquiera— se pinta el marcador de
   * posición y no se intenta cargar nada (spec `directorio-publico`, "Solo se
   * pinta la foto que generó el servidor"; hallazgo M1 de T-004).
   */
  fotoClave?: string | null;
  /**
   * Qué tamaño se pide. El listado y los resultados de búsqueda piden
   * `tarjeta`; la ficha y el panel, `ficha`. Ninguna página pide la variante
   * grande para pintar una tarjeta (presupuesto de 4G del PRD §8).
   */
  variante: VarianteFoto;
  /**
   * Slug de la categoría DEL NEGOCIO, para elegir el emoji del marcador cuando
   * no hay foto (enmienda aprobada por el fundador, revisión visual lote 2).
   * Opcional: quien solo pinta fotos reales —el panel— no tiene que pasarlo, y
   * un slug que el mapa no conozca cae en el emoji genérico.
   */
  categoriaSlug?: string;
  /** `panel` solo dentro de `/admin` (ver `src/lib/fotos/url.ts`). */
  ambito?: AmbitoFoto;
  /**
   * Texto alternativo cuando SÍ hay foto (spec `directorio-publico`: "Foto
   * de <nombre del negocio>"). Si falta, se usa una cadena vacía como
   * resguardo — pero todo llamador con foto real DEBE pasarlo, o la foto
   * queda sin anunciarse a un lector de pantalla.
   */
  alt?: string;
  /**
   * `true` solo para la primera tarjeta visible de un listado (spec
   * "El peso de las fotos no rompe el presupuesto de 4G": las demás cargan
   * diferido). Sin efecto en el marcador de posición.
   */
  prioridad?: boolean;
  className?: string;
};

/**
 * Foto del negocio o, cuando no tiene (o cuando lo guardado no es una clave
 * del servidor), un marcador de posición con el EMOJI DE SU CATEGORÍA sobre el
 * fondo de superficie (enmienda aprobada por el fundador, revisión visual lote
 * 2: el cuadro gris con el icono de "imagen rota" parecía una foto que no
 * cargó). Sigue sin prometer una imagen y sigue sin transmitir información al
 * lector de pantalla: el bloque entero va `aria-hidden`, porque el nombre del
 * negocio y su categoría ya están en el texto de al lado. Es el mismo emoji de
 * los botones de categoría de la home (`src/lib/ui/iconos-categorias.ts`):
 * cero bytes descargados, cero dependencias. Server Component.
 *
 * `unoptimized`: las variantes ya salen del servidor en su tamaño final y en
 * WebP (`src/lib/fotos/procesar.ts`), así que el optimizador de Next no tiene
 * nada que mejorar; y sobre todo, el optimizador pide la imagen con una
 * petición interna que NO lleva la cookie del panel, así que las fotos de
 * registros sin publicar se romperían al pasar por él (la propia
 * documentación de `next/image` recomienda `unoptimized` cuando el `src`
 * exige autenticación). De paso, ninguna copia queda cacheada en el
 * optimizador después de despublicar una ficha.
 *
 * El contenedor que use este componente debe ser `relative` con una altura
 * definida (aspect ratio o alto fijo): `<Image fill>` lo necesita, y es lo
 * que evita el salto de maquetación con o sin foto (spec "La maquetación no
 * salta").
 */
export function MarcadorFoto({
  fotoClave,
  variante,
  categoriaSlug = "",
  ambito = "publico",
  alt = "",
  prioridad = false,
  className = "",
}: MarcadorFotoProps) {
  const src = urlDeFoto(fotoClave, variante, ambito);

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={prioridad}
        unoptimized
        sizes="(min-width: 640px) 33vw, 100vw"
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center bg-superficie ${className}`}
    >
      <span className="text-3xl leading-none">
        {iconoDeCategoria(categoriaSlug)}
      </span>
    </div>
  );
}
