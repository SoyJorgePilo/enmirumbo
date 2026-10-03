import type { ReactNode } from "react";

import { AvisoConsentimiento } from "@/components/registro/aviso-consentimiento";
import { BotonEnviarVista } from "@/components/registro/boton-enviar-vista";
import { CampoHoneypot } from "@/components/registro/campo-honeypot";
import {
  CuerpoFormularioRegistro,
  primerCampoConError,
} from "@/components/registro/cuerpo-formulario-registro";
import { ejemploParaCategoriaElegida, ejemploQueOfreces } from "@/lib/registro/ejemplos";
import {
  ESTADO_INICIAL_REGISTRO,
  type ElementoCatalogo,
  type EstadoAccionRegistro,
} from "@/lib/registro/tipos";

export type FormularioRegistroNativoProps = {
  /** A dónde postea: la Action de quien lo pinta (en `/registro`, `?_action=registrar`). */
  action: string;
  categorias: ElementoCatalogo[];
  colonias: ElementoCatalogo[];
  /** El de la respuesta re-pintada tras un error; el vacío al abrir. */
  estado?: EstadoAccionRegistro;
  modo?: "registro" | "edicion";
  /** Por defecto, `CampoHoneypot`. */
  honeypot?: ReactNode;
  /** Por defecto, `AvisoConsentimiento`. */
  aviso?: ReactNode;
  /** Por defecto, "Registrar mi negocio". */
  textoBoton?: string;
};

/**
 * La tabla id → ejemplo de "¿Qué ofreces?" para la mejora progresiva, en
 * JSON. La clave vacía es el genérico (sin categoría elegida). La calcula el
 * servidor con la misma regla que la variante de cliente
 * (`ejemploParaCategoriaElegida`), así el navegador no carga los ejemplos ni
 * su lógica.
 */
export function ejemplosPorCategoria(categorias: ReadonlyArray<ElementoCatalogo>): string {
  const tabla: Record<string, string> = { "": ejemploQueOfreces(undefined) };
  for (const categoria of categorias) {
    tabla[String(categoria.id)] = ejemploParaCategoriaElegida(categorias, String(categoria.id));
  }
  return JSON.stringify(tabla);
}

/**
 * El formulario de registro como HTML NATIVO, sin hooks y sin isla (change
 * `migrar-registro-astro`, design.md §1 y §2): `POST` multipart a `action`,
 * el cuerpo compartido con `FormularioRegistro` y el botón en reposo.
 *
 * - **Sin JS** funciona solo: la respuesta al envío vuelve a pintar esta misma
 *   página con los errores, los valores y `autofocus` en el primer campo con
 *   error (el consentimiento vive en `AvisoConsentimiento`, que no lo lleva:
 *   ahí el foco lo pone la mejora progresiva).
 * - **Con JS**, el módulo de `src/astro/registro-cliente.ts` pone el ejemplo
 *   de la categoría (leyendo `data-ejemplos`), el "Enviando..." y manda el
 *   formulario por `fetch` a esta misma dirección.
 *
 * El ejemplo que pinta el servidor es SIEMPRE el genérico, como el de Next
 * (su estado de categoría nunca se inicializa desde el servidor).
 */
export function FormularioRegistroNativo({
  action,
  categorias,
  colonias,
  estado = ESTADO_INICIAL_REGISTRO,
  modo = "registro",
  honeypot = <CampoHoneypot />,
  aviso = <AvisoConsentimiento />,
  textoBoton = "Registrar mi negocio",
}: FormularioRegistroNativoProps) {
  return (
    <form method="post" encType="multipart/form-data" action={action} className="flex flex-col gap-6">
      <CuerpoFormularioRegistro
        categorias={categorias}
        colonias={colonias}
        honeypot={honeypot}
        aviso={aviso}
        estado={estado}
        modo={modo}
        ejemplo={ejemploParaCategoriaElegida(categorias, "")}
        ejemplosPorCategoria={ejemplosPorCategoria(categorias)}
        campoConFoco={primerCampoConError(estado.errores)}
        boton={<BotonEnviarVista texto={textoBoton} enviando={false} />}
      />
    </form>
  );
}
