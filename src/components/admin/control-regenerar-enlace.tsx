import Link from "next/link";

import { BOTON_GENERAR_ENLACE_NUEVO } from "@/lib/admin/textos";
import { CLASE_BOTON_SECUNDARIO } from "@/lib/estilos-boton";

export type ControlRegenerarEnlaceProps = {
  id: string;
};

/**
 * Control "Generar un enlace nuevo" del detalle de un negocio PUBLICADO
 * (spec `revision-admin`, requirement "El admin puede generar un enlace
 * nuevo, y el anterior deja de servir"; ticket T-014). Mismo patrón que
 * `ControlBorrar`: un enlace de NAVEGACIÓN (GET) hacia la pantalla de
 * confirmación propia, nunca un botón que regenere directo. Server
 * Component, sin JS.
 *
 * TODAVÍA NO está enchufado en `src/app/admin/registros/[id]/page.tsx`
 * (reports/a-ui.md): esa pantalla la cubren varias suites existentes
 * (`tests/admin-paginas.test.ts`, `tests/layout.test.ts` §
 * "las pantallas del panel solo enlazan a rutas del panel que existen") que
 * no reconocen todavía el segmento `regenerar-enlace`. El dev la agrega
 * junto con la actualización de esas suites (tasks.md #31), condicionada a
 * `registro.estado === ESTADO_NEGOCIO_PUBLICADO`, con este mismo componente:
 *
 * ```tsx
 * {publicado && <ControlRegenerarEnlace id={id} />}
 * ```
 */
export function ControlRegenerarEnlace({ id }: ControlRegenerarEnlaceProps) {
  return (
    <Link
      href={`/admin/registros/${id}/regenerar-enlace`}
      className={`${CLASE_BOTON_SECUNDARIO} w-full`}
    >
      {BOTON_GENERAR_ENLACE_NUEVO}
    </Link>
  );
}
