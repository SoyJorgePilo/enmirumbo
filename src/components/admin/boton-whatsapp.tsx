import { construirEnlaceWhatsappPanel } from "@/lib/admin/whatsapp";
import { CLASE_BOTON_PRIMARIO } from "@/lib/estilos-boton";

export type BotonWhatsappProps = {
  whatsapp: string;
  mensaje: string;
  etiqueta: string;
};

/**
 * Botón verde de WhatsApp del panel (verificación, aviso de publicación o
 * aviso de rechazo — mismo componente, distinto mensaje/etiqueta). El envío
 * siempre lo hace la persona: el enlace solo ABRE la conversación con el
 * texto ya escrito (PRD §6.6).
 *
 * Requirement "Botón de verificación...", scenario "número que no se puede
 * interpretar": sin número mexicano de 10 dígitos válido no se pinta un
 * enlace roto — se muestra el número tal como está guardado. Server
 * Component, sin JS.
 */
export function BotonWhatsapp({ whatsapp, mensaje, etiqueta }: BotonWhatsappProps) {
  const href = construirEnlaceWhatsappPanel(whatsapp, mensaje);

  if (!href) {
    return (
      <p className="text-tinta-suave">
        WhatsApp registrado:{" "}
        <span className="font-semibold text-tinta">{whatsapp}</span> (no se
        pudo generar el enlace)
      </p>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={CLASE_BOTON_PRIMARIO}
    >
      {etiqueta}
    </a>
  );
}
