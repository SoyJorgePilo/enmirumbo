/**
 * Footer global: identificación del sitio y espacio previsto para las
 * páginas legales (E6). Sin enlaces mientras esas páginas no existan:
 * cero enlaces muertos. Server Component sin JS de cliente.
 */
export function Footer() {
  return (
    <footer className="border-t border-borde bg-superficie">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-6 text-sm text-tinta-suave sm:px-6">
        <p className="font-semibold text-tinta">NecesitoUno Tizayuca</p>
        <p>Hecho para los vecinos de Tizayuca, Hidalgo.</p>
        {/*
          Espacio previsto para las páginas legales (E6): cuando existan,
          aquí van los enlaces a aviso de privacidad y términos, cada uno
          con área táctil ≥44px. No agregar enlaces antes de que existan.
        */}
      </div>
    </footer>
  );
}
