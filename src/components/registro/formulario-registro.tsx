"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";

import { registrarNegocio } from "@/app/(publico)/registro/accion";
import { BotonEnviar } from "@/components/registro/boton-enviar";
import {
  CuerpoFormularioRegistro,
  ORDEN_CAMPOS_PARA_FOCO,
  primerCampoConError,
} from "@/components/registro/cuerpo-formulario-registro";
import { ejemploParaCategoriaElegida } from "@/lib/registro/ejemplos";
import {
  ESTADO_INICIAL_REGISTRO,
  type ElementoCatalogo,
  type EstadoAccionRegistro,
} from "@/lib/registro/tipos";

type FormularioRegistroProps = {
  categorias: ElementoCatalogo[];
  colonias: ElementoCatalogo[];
  /** Server Component ya renderizado (fuera del bundle de cliente). */
  honeypot: ReactNode;
  /** Server Component ya renderizado (fuera del bundle de cliente). */
  aviso: ReactNode;
  /**
   * Estado de partida del formulario. En la página siempre es el vacío; las
   * pruebas lo usan para renderizar el estado "error por campo" sin simular
   * un envío. El modo edición lo usa para prellenar con la ficha publicada
   * (o con la edición pendiente más reciente, spec `agregar-enlace-de-
   * gestion`, requirement "Mandar cambios cuando ya hay otros esperando...").
   */
  estadoInicial?: EstadoAccionRegistro;
  /**
   * `"registro"` (por defecto) es el alta pública; `"edicion"` es el modo
   * edición del enlace de gestión (`/editar/<token>`, change
   * `agregar-enlace-de-gestion`, design.md §5: mismo componente, sin lógica
   * paralela). La única diferencia de ESTRUCTURA entre los dos —además de lo
   * que ya cubren `accion`, `textoBoton` y `aviso`— es que la edición NO
   * ofrece cambiar la foto: la spec `revision-admin` de ese change enumera
   * los campos que "Aplicar los cambios" copia y la foto no está en la
   * lista (fuera de alcance explícito del ticket T-014, coordinar con
   * T-008 cuando ese change decida sumarla).
   */
  modo?: "registro" | "edicion";
  /**
   * Server Action a la que postea el formulario. Por defecto la de alta
   * (`registrarNegocio`); el modo edición pasa la suya, ya ligada al token
   * con `.bind(null, token)` (mismo patrón que las Server Actions del panel).
   */
  accion?: (
    estadoPrevio: EstadoAccionRegistro,
    formData: FormData,
  ) => Promise<EstadoAccionRegistro>;
  /** Texto del botón de envío. Por defecto "Registrar mi negocio". */
  textoBoton?: string;
};

/**
 * El orden del foco y su función pura viven con el cuerpo compartido (change
 * `migrar-registro-astro`, design.md §2); se reexportan aquí para no romper a
 * quien ya los importaba de este archivo.
 */
export { ORDEN_CAMPOS_PARA_FOCO, primerCampoConError };

/**
 * Formulario de registro (registro-negocio spec): una sola pantalla, los 11
 * campos (incluida la foto) + el checkbox de consentimiento + la casilla
 * "Dejar mi ficha sin foto", con los cuatro estados (vacío, error por campo,
 * enviando, éxito).
 *
 * El archivo de la foto viaja en este mismo envío, y el `multipart/form-data`
 * lo pone **React**, no nosotros: en un `<form>` cuya `action` es una función,
 * react-dom fija `method` y `encType` él mismo y sobrescribe (con aviso en
 * consola) cualquiera que se declare a mano — ver
 * `node_modules/react-dom/cjs/react-dom-server.node.development.js`, "Cannot
 * specify a encType or method for a form that specifies a function as the
 * action". Por eso aquí no hay atributo `encType`: ponerlo era un no-op que
 * además ensuciaba el log de una página pública (hallazgo M-2 de la auditoría
 * de seguridad). Lo que SÍ hay que conservar es el `name="foto"` del input,
 * que es lo que hace que el archivo llegue al `FormData` de la Server Action.
 *
 * Es Client Component porque el estado de errores usa `useActionState`
 * (design.md §1, "el helper de estado de acción de esta versión de
 * Next.js"), que es también lo que hace que el formulario funcione sin
 * JavaScript: sin JS, el `<form>` sigue siendo un POST real hacia la Server
 * Action, y la respuesta re-renderiza esta misma página con los errores y
 * los valores capturados. Lo único que de verdad depende de que el JS haya
 * cargado es el ejemplo dinámico de "¿Qué ofreces?" (design.md §1) y el
 * indicador "Enviando..." del botón (`boton-enviar.tsx`); sin JS ambos caen
 * a su comportamiento base (ejemplo genérico, botón normal) sin romper el
 * envío.
 */
export function FormularioRegistro({
  categorias,
  colonias,
  honeypot,
  aviso,
  estadoInicial = ESTADO_INICIAL_REGISTRO,
  modo = "registro",
  accion = registrarNegocio,
  textoBoton,
}: FormularioRegistroProps) {
  const [estado, accionFormulario] = useActionState(accion, estadoInicial);
  const { errores } = estado;

  // Ejemplo dinámico de "¿Qué ofreces?" (único además del botón que
  // necesita JS, design.md §1). Sin categoría elegida — incluido sin JS,
  // porque este estado nunca se inicializa desde el servidor — se ve el
  // ejemplo genérico, tal como pide la spec.
  const [categoriaId, setCategoriaId] = useState("");
  const ejemplo = ejemploParaCategoriaElegida(categorias, categoriaId);

  // Foco en el primer campo con error tras un envío rechazado. La decisión de
  // "cuál es el primero" vive en `primerCampoConError` (probada aparte); aquí
  // solo queda el efecto de DOM, que necesita navegador.
  useEffect(() => {
    const campo = primerCampoConError(errores);
    if (campo) document.getElementById(campo)?.focus();
    // Solo cuando cambia el resultado de un envío, no en cada tecleo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={accionFormulario} className="flex flex-col gap-6">
      <CuerpoFormularioRegistro
        categorias={categorias}
        colonias={colonias}
        honeypot={honeypot}
        aviso={aviso}
        estado={estado}
        modo={modo}
        ejemplo={ejemplo}
        alCambiarCategoria={setCategoriaId}
        boton={<BotonEnviar texto={textoBoton} />}
      />
    </form>
  );
}
