import Image from "next/image";

import type { VarianteFoto } from "@/lib/fotos/clave";
import { urlDeFoto, type AmbitoFoto } from "@/lib/fotos/url";

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
 * del servidor), un marcador de posición neutro: ni promete una imagen ni
 * transmite información — por eso `alt=""` en ese caso (decorativo, el nombre
 * del negocio ya está en el texto de al lado). Server Component.
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
      <svg
        viewBox="0 0 24 24"
        className="h-1/3 w-1/3 text-tinta-suave"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2 0L4 19" />
      </svg>
    </div>
  );
}
