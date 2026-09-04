import Image from "next/image";

type MarcadorFotoProps = {
  /** `null`/`undefined` mientras el negocio no tenga foto real (E1-3, fuera de este change). */
  fotoUrl?: string | null;
  className?: string;
};

/**
 * Foto del negocio o, mientras no exista (E1-3 fuera de alcance), un
 * marcador de posición neutro (tasks.md #7): ni promete una imagen ni
 * transmite información — por eso `alt=""` (decorativo, el nombre del
 * negocio ya está en el texto de al lado). Server Component.
 *
 * El contenedor que use este componente debe ser `relative` con una altura
 * definida (aspect ratio o alto fijo): `<Image fill>` lo necesita.
 */
export function MarcadorFoto({ fotoUrl, className = "" }: MarcadorFotoProps) {
  if (fotoUrl) {
    return (
      <Image
        src={fotoUrl}
        alt=""
        fill
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
