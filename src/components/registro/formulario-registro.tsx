"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";

import { registrarNegocio } from "@/app/registro/accion";
import { BotonEnviar } from "@/components/registro/boton-enviar";
import { ejemploParaCategoriaElegida } from "@/lib/registro/ejemplos";
import { COLONIA_OTRA_VALOR, LIMITES_LONGITUD } from "@/lib/registro/textos";
import {
  ESTADO_INICIAL_REGISTRO,
  type ElementoCatalogo,
  type ErroresFormularioRegistro,
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
   * un envío.
   */
  estadoInicial?: EstadoAccionRegistro;
};

/**
 * Campos en el mismo orden en que aparecen en la pantalla, para poner el foco
 * en el PRIMER campo con error (scenarios "obligatorios vacíos" y "errores
 * anunciados"). Los `id` de los inputs son iguales a estas claves; el test
 * `registro-pagina` comprueba que este orden siga siendo el del DOM.
 */
export const ORDEN_CAMPOS_PARA_FOCO = [
  "nombre",
  "categoriaId",
  "whatsapp",
  "coloniaId",
  "coloniaOtra",
  "queOfreces",
  "telefonoFijo",
  "direccion",
  "horario",
  "facebookUrl",
  "consentimiento",
] as const satisfies ReadonlyArray<keyof ErroresFormularioRegistro>;

/**
 * Campo que debe recibir el foco tras un envío rechazado: el primero con
 * error según el orden de la pantalla. Función pura para poder probarla sin
 * navegador (el `useEffect` que la usa sí necesita DOM).
 */
export function primerCampoConError(
  errores: ErroresFormularioRegistro,
): (typeof ORDEN_CAMPOS_PARA_FOCO)[number] | undefined {
  return ORDEN_CAMPOS_PARA_FOCO.find((campo) => errores[campo]);
}

function claseCampo(tieneError: boolean): string {
  const base =
    "w-full rounded-lg bg-fondo px-4 py-3 text-base text-tinta placeholder:text-tinta-suave focus:outline-none focus:ring-2 focus:ring-accion-fuerte";
  // Los errores NO se marcan solo con color (paleta de una sola vía,
  // globals.css): borde neutro más grueso + texto en negritas + "⚠" en el
  // mensaje asociado por aria-describedby son la señal, no un rojo nuevo.
  return tieneError ? `${base} border-2 border-tinta` : `${base} border border-borde`;
}

function MensajeError({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-tinta">
      ⚠ {texto}
    </p>
  );
}

/**
 * Formulario de registro (registro-negocio spec): una sola pantalla, los 10
 * campos + el checkbox de consentimiento, con los cuatro estados (vacío,
 * error por campo, enviando, éxito).
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
}: FormularioRegistroProps) {
  const [estado, accionFormulario] = useActionState(
    registrarNegocio,
    estadoInicial,
  );
  const { errores, valores } = estado;

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
      {honeypot}

      <MensajeError id="general-error" texto={errores.general} />

      {/* ── Obligatorios ── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className="text-sm font-semibold text-tinta">
          ¿Cómo se llama tu negocio?
        </label>
        <input
          type="text"
          id="nombre"
          name="nombre"
          required
          maxLength={LIMITES_LONGITUD.nombre}
          defaultValue={valores.nombre}
          aria-invalid={Boolean(errores.nombre)}
          aria-describedby={errores.nombre ? "nombre-error" : undefined}
          className={claseCampo(Boolean(errores.nombre))}
        />
        <MensajeError id="nombre-error" texto={errores.nombre} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="categoriaId" className="text-sm font-semibold text-tinta">
          ¿A qué se dedica?
        </label>
        <select
          id="categoriaId"
          name="categoriaId"
          required
          defaultValue={valores.categoriaId}
          onChange={(evento) => setCategoriaId(evento.target.value)}
          aria-invalid={Boolean(errores.categoriaId)}
          aria-describedby={errores.categoriaId ? "categoriaId-error" : undefined}
          className={claseCampo(Boolean(errores.categoriaId))}
        >
          <option value="">Elige una categoría</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </select>
        <MensajeError id="categoriaId-error" texto={errores.categoriaId} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="whatsapp" className="text-sm font-semibold text-tinta">
          Tu WhatsApp (10 dígitos)
        </label>
        <input
          type="tel"
          id="whatsapp"
          name="whatsapp"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={LIMITES_LONGITUD.whatsapp}
          defaultValue={valores.whatsapp}
          aria-invalid={Boolean(errores.whatsapp)}
          aria-describedby={errores.whatsapp ? "whatsapp-error" : undefined}
          className={claseCampo(Boolean(errores.whatsapp))}
        />
        <p className="text-sm text-tinta-suave">
          Sin espacios ni guiones — nosotros lo acomodamos.
        </p>
        <MensajeError id="whatsapp-error" texto={errores.whatsapp} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="coloniaId" className="text-sm font-semibold text-tinta">
          ¿En qué colonia estás?
        </label>
        <select
          id="coloniaId"
          name="coloniaId"
          required
          defaultValue={valores.coloniaId}
          aria-invalid={Boolean(errores.coloniaId)}
          aria-describedby={errores.coloniaId ? "coloniaId-error" : undefined}
          className={claseCampo(Boolean(errores.coloniaId))}
        >
          <option value="">Elige tu colonia</option>
          {colonias.map((colonia) => (
            <option key={colonia.id} value={colonia.id}>
              {colonia.nombre}
            </option>
          ))}
          <option value={COLONIA_OTRA_VALOR}>Otra</option>
        </select>
        <MensajeError id="coloniaId-error" texto={errores.coloniaId} />

        {/*
          Siempre visible (no se oculta con JS): si se ocultara mientras no
          se elige "Otra", quien no tiene JavaScript nunca podría llegar a
          este campo (design.md §1 solo justifica JS para el ejemplo
          dinámico y el botón de envío, no para mostrar/ocultar este campo).
        */}
        <label htmlFor="coloniaOtra" className="mt-2 text-sm font-semibold text-tinta">
          Si elegiste &quot;Otra&quot;, escribe tu colonia
        </label>
        <input
          type="text"
          id="coloniaOtra"
          name="coloniaOtra"
          maxLength={LIMITES_LONGITUD.coloniaOtra}
          defaultValue={valores.coloniaOtra}
          aria-invalid={Boolean(errores.coloniaOtra)}
          aria-describedby={errores.coloniaOtra ? "coloniaOtra-error" : undefined}
          className={claseCampo(Boolean(errores.coloniaOtra))}
        />
        <MensajeError id="coloniaOtra-error" texto={errores.coloniaOtra} />
      </div>

      {/* ── Opcionales ── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="queOfreces" className="text-sm font-semibold text-tinta">
          ¿Qué ofreces? (opcional)
        </label>
        <textarea
          id="queOfreces"
          name="queOfreces"
          rows={2}
          maxLength={LIMITES_LONGITUD.queOfreces}
          placeholder={ejemplo}
          defaultValue={valores.queOfreces}
          aria-invalid={Boolean(errores.queOfreces)}
          aria-describedby={errores.queOfreces ? "queOfreces-error" : undefined}
          className={claseCampo(Boolean(errores.queOfreces))}
        />
        <MensajeError id="queOfreces-error" texto={errores.queOfreces} />
      </div>

      <label
        htmlFor="entregaADomicilio"
        className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-tinta"
      >
        <input
          type="checkbox"
          id="entregaADomicilio"
          name="entregaADomicilio"
          defaultChecked={valores.entregaADomicilio}
          className="h-5 w-5 shrink-0 rounded border-borde"
        />
        ¿Haces entregas o vas a domicilio? (opcional)
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="telefonoFijo" className="text-sm font-semibold text-tinta">
          Teléfono fijo (opcional)
        </label>
        <input
          type="tel"
          id="telefonoFijo"
          name="telefonoFijo"
          inputMode="numeric"
          maxLength={LIMITES_LONGITUD.telefonoFijo}
          defaultValue={valores.telefonoFijo}
          aria-invalid={Boolean(errores.telefonoFijo)}
          aria-describedby={errores.telefonoFijo ? "telefonoFijo-error" : undefined}
          className={claseCampo(Boolean(errores.telefonoFijo))}
        />
        <MensajeError id="telefonoFijo-error" texto={errores.telefonoFijo} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="direccion" className="text-sm font-semibold text-tinta">
          Dirección o referencias (opcional)
        </label>
        <textarea
          id="direccion"
          name="direccion"
          rows={2}
          maxLength={LIMITES_LONGITUD.direccion}
          placeholder="ej. a un lado de la primaria, calle y número"
          defaultValue={valores.direccion}
          aria-invalid={Boolean(errores.direccion)}
          aria-describedby={errores.direccion ? "direccion-error" : undefined}
          className={claseCampo(Boolean(errores.direccion))}
        />
        <MensajeError id="direccion-error" texto={errores.direccion} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horario" className="text-sm font-semibold text-tinta">
          Horario (opcional)
        </label>
        <input
          type="text"
          id="horario"
          name="horario"
          maxLength={LIMITES_LONGITUD.horario}
          placeholder="ej. L-S 9am-7pm"
          defaultValue={valores.horario}
          aria-invalid={Boolean(errores.horario)}
          aria-describedby={errores.horario ? "horario-error" : undefined}
          className={claseCampo(Boolean(errores.horario))}
        />
        <MensajeError id="horario-error" texto={errores.horario} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="facebookUrl" className="text-sm font-semibold text-tinta">
          Link de tu Facebook (opcional)
        </label>
        <input
          type="url"
          id="facebookUrl"
          name="facebookUrl"
          maxLength={LIMITES_LONGITUD.facebookUrl}
          placeholder="https://facebook.com/tunegocio"
          defaultValue={valores.facebookUrl}
          aria-invalid={Boolean(errores.facebookUrl)}
          aria-describedby={errores.facebookUrl ? "facebookUrl-error" : undefined}
          className={claseCampo(Boolean(errores.facebookUrl))}
        />
        <MensajeError id="facebookUrl-error" texto={errores.facebookUrl} />
      </div>

      {aviso}
      <MensajeError id="consentimiento-error" texto={errores.consentimiento} />

      <BotonEnviar />
    </form>
  );
}
