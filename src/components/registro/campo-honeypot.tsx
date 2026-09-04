/**
 * Campo trampa (honeypot) contra envíos automatizados (PRD §8, tasks.md #14).
 * Invisible para personas: fuera de pantalla, no enfocable por teclado
 * (`tabIndex={-1}`) y no anunciado por lectores de pantalla (`aria-hidden`).
 * Los bots que autocompletan cualquier campo de un formulario sí lo llenan;
 * la Server Action rechaza en silencio (misma pantalla de gracias) cualquier
 * envío que traiga este campo con valor. Server Component, sin JS.
 */
export function CampoHoneypot() {
  return (
    <div
      aria-hidden="true"
      className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
    >
      <label htmlFor="sitio_web">No llenes este campo</label>
      <input
        type="text"
        id="sitio_web"
        name="sitio_web"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  );
}
