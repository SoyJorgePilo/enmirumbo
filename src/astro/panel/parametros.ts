/**
 * Los parámetros de la URL como los entrega `searchParams` de Next (change
 * `migrar-panel-admin-base-astro`, design.md §4): ausente → `undefined`, una
 * vez → el texto, repetido → un arreglo. Las pantallas del panel normalizan
 * con las mismas funciones de siempre (`normalizarFiltroEstado`,
 * `normalizarPagina`, la lista cerrada de errores del acceso), que tratan el
 * arreglo como un valor inválido: así `?error=intentos&error=x` no pinta
 * ningún mensaje y `?pagina=2&pagina=3` es la primera página, igual que en Next.
 */
export function parametroComoNext(url: URL, nombre: string): string | string[] | undefined {
  const valores = url.searchParams.getAll(nombre);
  if (valores.length === 0) return undefined;
  return valores.length === 1 ? valores[0] : valores;
}
