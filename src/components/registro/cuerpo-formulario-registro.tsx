import type { ReactNode } from "react";

import {
  ACCEPT_FOTO,
  COLONIA_OTRA_VALOR,
  EJEMPLO_HORARIO,
  LIMITES_LONGITUD,
  TEXTO_AYUDA_HORARIO,
  TEXTO_CASILLA_SIN_FOTO,
  TEXTO_POLITICA_FOTO,
} from "@/lib/registro/textos";
import type {
  ElementoCatalogo,
  ErroresFormularioRegistro,
  EstadoAccionRegistro,
} from "@/lib/registro/tipos";

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
  "foto",
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
  return tieneError ? `${base} border-2 border-tinta` : `${base} border border-borde-control`;
}

function MensajeError({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-tinta">
      ⚠ {texto}
    </p>
  );
}

export type CuerpoFormularioRegistroProps = {
  categorias: ElementoCatalogo[];
  colonias: ElementoCatalogo[];
  /** El campo trampa ya pintado (`CampoHoneypot`). */
  honeypot: ReactNode;
  /** El bloque del aviso ya pintado (`AvisoConsentimiento`), o nada en edición. */
  aviso: ReactNode;
  /** Errores por campo y valores capturados (el vacío al abrir). */
  estado: EstadoAccionRegistro;
  /** `"registro"` (alta pública) o `"edicion"` (sin el campo de foto). */
  modo: "registro" | "edicion";
  /** El `placeholder` de "¿Qué ofreces?". */
  ejemplo: string;
  /** Solo la variante de cliente: avisa el `value` elegido en categoría. */
  alCambiarCategoria?: (categoriaId: string) => void;
  /**
   * Solo la variante nativa: la tabla id → ejemplo, en JSON, para la mejora
   * progresiva (`data-ejemplos` del `<select>` de categoría; change
   * `migrar-registro-astro`, design.md §1.3).
   */
  ejemplosPorCategoria?: string;
  /** Solo la variante nativa: el campo que lleva `autofocus` (el primero con error). */
  campoConFoco?: (typeof ORDEN_CAMPOS_PARA_FOCO)[number];
  /** El botón de envío ya pintado. */
  boton: ReactNode;
};

/**
 * QUÉ SE PINTA dentro del `<form>` del registro, sin decidir CÓMO se envía
 * (change `migrar-registro-astro`, design.md §2): sin directiva de cliente y
 * sin hooks. Lo comparten `FormularioRegistro` (cliente, con `useActionState`; el
 * de Next y el del modo edición) y `FormularioRegistroNativo` (formulario
 * HTML nativo que pinta Astro). El marcado es el que vivía en
 * `formulario-registro.tsx`, sin cambios: lo único nuevo son tres props que la
 * variante de cliente no usa (`data-ejemplos`, `autoFocus`) y que React no
 * pinta cuando no vienen.
 */
export function CuerpoFormularioRegistro({
  categorias,
  colonias,
  honeypot,
  aviso,
  estado,
  modo,
  ejemplo,
  alCambiarCategoria,
  ejemplosPorCategoria,
  campoConFoco,
  boton,
}: CuerpoFormularioRegistroProps) {
  const { errores, valores } = estado;
  return (
    <>
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
          autoFocus={campoConFoco === "nombre"}
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
          autoFocus={campoConFoco === "categoriaId"}
          name="categoriaId"
          required
          defaultValue={valores.categoriaId}
          onChange={alCambiarCategoria ? (evento) => alCambiarCategoria(evento.target.value) : undefined}
          data-ejemplos={ejemplosPorCategoria}
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
          autoFocus={campoConFoco === "whatsapp"}
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
          autoFocus={campoConFoco === "coloniaId"}
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
          autoFocus={campoConFoco === "coloniaOtra"}
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
          autoFocus={campoConFoco === "queOfreces"}
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
          className="h-5 w-5 shrink-0 rounded border-borde-control"
        />
        ¿Haces entregas o vas a domicilio? (opcional)
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="telefonoFijo" className="text-sm font-semibold text-tinta">
          Teléfono fijo (opcional)
        </label>
        {/* `inputMode="tel"`, no `numeric` (enmienda aprobada por el fundador,
            revisión visual lote 2): el fijo se escribe con separadores —"(775)
            123-45-67", "+52 775…"— y el teclado numérico puro no ofrece
            paréntesis, guion ni "+". El WhatsApp, que son 10 dígitos pelones,
            sí conserva el numérico. */}
        <input
          type="tel"
          id="telefonoFijo"
          autoFocus={campoConFoco === "telefonoFijo"}
          name="telefonoFijo"
          inputMode="tel"
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
          autoFocus={campoConFoco === "direccion"}
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
          autoFocus={campoConFoco === "horario"}
          name="horario"
          maxLength={LIMITES_LONGITUD.horario}
          placeholder={EJEMPLO_HORARIO}
          defaultValue={valores.horario}
          aria-invalid={Boolean(errores.horario)}
          aria-describedby={errores.horario ? "horario-error" : undefined}
          className={claseCampo(Boolean(errores.horario))}
        />
        {/* Ayuda siempre visible, con el mismo trato que la del WhatsApp: el
            campo es texto libre y esta línea lo dice con ejemplos, para que
            nadie sienta que tiene que rellenar un formato (enmienda aprobada
            por el fundador, revisión visual lote 2). */}
        <p className="text-sm text-tinta-suave">{TEXTO_AYUDA_HORARIO}</p>
        <MensajeError id="horario-error" texto={errores.horario} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="facebookUrl" className="text-sm font-semibold text-tinta">
          Link de tu Facebook (opcional)
        </label>
        <input
          type="url"
          id="facebookUrl"
          autoFocus={campoConFoco === "facebookUrl"}
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

      {/* ── Foto (requirement "El campo de foto explica la política del PRD
          §6.1 y abre la galería del celular"): la política se ve ANTES de
          elegir el archivo, el `accept` abre la galería de fotos en el
          celular y NO hay `defaultValue` posible en un campo de archivo —
          por eso, a diferencia del resto de los opcionales, este siempre
          vuelve vacío (scenario "hay que volver a elegir la foto"). Sin JS
          nuevo: nada de vista previa ni recorte en el cliente (requirement
          "El registro funciona sin JavaScript de cliente").

          Modo edición (change `agregar-enlace-de-gestion`): NO se ofrece,
          porque la lista de campos editables que "Aplicar los cambios"
          copia (spec `revision-admin` de ese change) no incluye la foto —
          fuera de alcance explícito del ticket T-014, ver reports/a-ui.md. */}
      {modo === "registro" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="foto" className="text-sm font-semibold text-tinta">
            Foto de tu negocio (opcional)
          </label>
          <p className="text-sm text-tinta-suave">{TEXTO_POLITICA_FOTO}</p>
          <input
            type="file"
            id="foto"
          autoFocus={campoConFoco === "foto"}
            name="foto"
            accept={ACCEPT_FOTO}
            className="block min-h-11 w-full cursor-pointer rounded-lg border border-borde-control bg-fondo px-3 py-2.5 text-sm text-tinta file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-superficie file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-tinta"
            aria-invalid={Boolean(errores.foto)}
            aria-describedby={errores.foto ? "foto-error" : undefined}
          />
          <MensajeError id="foto-error" texto={errores.foto} />

          {/*
            Siempre visible para cualquiera, con el mismo texto (requirement
            "El campo de foto..."): ni un registro nuevo ni un reenvío tras
            rechazo delatan si el número ya tenía ficha. No se repuebla al
            rebotar un error (igual que el checkbox de consentimiento): no hay
            literal de la spec que pida lo contrario.
          */}
          <label
            htmlFor="quitarFoto"
            className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-tinta"
          >
            <input
              type="checkbox"
              id="quitarFoto"
              name="quitarFoto"
              className="h-5 w-5 shrink-0 rounded border-borde-control"
            />
            {TEXTO_CASILLA_SIN_FOTO}
          </label>
        </div>
      )}

      {aviso}
      <MensajeError id="consentimiento-error" texto={errores.consentimiento} />

      {boton}
    </>
  );
}
