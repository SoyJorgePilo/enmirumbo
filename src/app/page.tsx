/**
 * Home provisional: contenido mínimo para ver el layout funcionando.
 * La home real (buscador, categorías, deporte) llega con E2-1.
 */
export default function Home() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Bienvenido, vecino de Tizayuca
      </h1>
      <p className="max-w-md text-lg text-tinta-suave">
        Muy pronto vas a poder encontrar aquí los negocios y servicios de
        Tizayuca.
      </p>
    </section>
  );
}
