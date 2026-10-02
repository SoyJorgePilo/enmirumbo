// Lo que el middleware deja en `Astro.locals` (change
// `migrar-formularios-publicos-astro`, design.md §1).

declare namespace App {
  interface Locals {
    /**
     * El envío venía de otro origen (`src/astro/origen.ts`): la página
     * `/envio-rechazado` pinta el 403. Solo la pone el middleware; el cliente
     * no puede fijar `locals` (el adaptador exige su secreto).
     */
    envioRechazado?: boolean;
  }
}
