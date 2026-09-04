import { BOTON_SALIR } from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type BotonSalirProps = {
  /** Server Action que invalida la sesión (`salirDelPanel`). */
  action: () => void | Promise<void>;
};

/**
 * Botón "Salir" (requirement "Acceso al panel..."). Un `<form>` de un botón,
 * sin campos: el POST a la Server Action es lo que borra la cookie de
 * sesión. Server Component, sin JS.
 */
export function BotonSalir({ action }: BotonSalirProps) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={`${CLASE_BOTON_SECUNDARIO} px-4 py-2 text-sm`}
      >
        {BOTON_SALIR}
      </button>
    </form>
  );
}
