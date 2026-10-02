/**
 * La regla de origen de los envíos (change `migrar-formularios-publicos-astro`,
 * design.md §1; spec `plataforma-astro`, requirement "Los envíos de otro
 * origen se rechazan en español, con las cuatro cabeceras y sin 500").
 *
 * Es la que aplica hoy Next a las Server Actions
 * (`next/dist/server/app-render/action-handler.js`, `parseHostHeader`):
 *
 * - el host de `new URL(origin).host` (solo el host, con su puerto; el
 *   esquema no se compara);
 * - contra el PRIMER valor de `X-Forwarded-Host` o, si no viene, contra
 *   `Host`;
 * - sin lista de orígenes permitidos;
 * - un POST SIN `Origin` procede: un navegador actual siempre lo manda en un
 *   envío de formulario, así que su falta es un cliente hecho a mano, que no
 *   lleva las cookies de nadie (decisión 2 del fundador, proposal.md).
 *
 * Donde Next lanzaba un 500 (`Origin: null`, malformado o ajeno) aquí se
 * rechaza, y el middleware responde la página 403. El alcance es el de
 * Astro, más ancho que el de Next: todo método que no sea GET, HEAD ni
 * OPTIONS, sea Action o no.
 */

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/** ¿Este envío viene de otro origen y hay que rechazarlo sin ejecutar nada? */
export function envioDeOtroOrigen(metodo: string, cabeceras: Headers): boolean {
  if (METODOS_SEGUROS.has(metodo.toUpperCase())) return false;

  const origen = cabeceras.get("origin");
  if (origen === null) return false;

  let hostDelOrigen: string;
  try {
    hostDelOrigen = new URL(origen).host;
  } catch {
    // Malformado o `null` (`new URL("null")` no se puede interpretar).
    return true;
  }
  if (hostDelOrigen === "") return true;

  const reenviado = cabeceras.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = reenviado || cabeceras.get("host");
  return !host || hostDelOrigen !== host;
}
