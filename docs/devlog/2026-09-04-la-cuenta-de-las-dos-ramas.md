# 2026-09-04 · La cuenta de las dos ramas: lo que costó fusionar el panel y el buscador

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con el panel de revisión del admin (T-005, PR [#8](https://github.com/SoyJorgePilo/necesitouno/pull/8)) y el buscador (T-006, PR [#7](https://github.com/SoyJorgePilo/necesitouno/pull/7)) mergeados, NecesitoUno ya se puede **operar** de punta a punta y la épica E2 (directorio público) queda completa. El MVP anda rondando el 60% de las historias P0.

## Qué construimos

- **El panel en `/admin`**: pantalla de acceso con contraseña única de variable de entorno y cookie de sesión firmada (sin contraseña configurada, el panel no abre — fail-safe, no panel abierto). La cola muestra los registros `en_revision` con los más viejos primero y marca a los que llevan más de 48 horas esperando. Desde el detalle, un botón abre WhatsApp con el número del negocio para la verificación manual. Aprobar asigna de 1 a 3 giros, normaliza la colonia si el negocio puso "Otra", marca el origen y publica la ficha; rechazar exige motivo. Y si el negocio rechazado corrige y reenvía el formulario con el mismo número, su ficha se actualiza y regresa a la cola en vez de tronar con "ya existe".
- **El buscador**: un formulario en la home (sin JavaScript de cliente) que manda a `/buscar?q=...`. Encuentra por nombre, por palabras de "¿Qué ofreces?" y por giro asignado, insensible a mayúsculas y acentos, con coincidencia parcial — "plomero" encuentra al de "plomería" aunque su categoría sea "Servicios del hogar". Solo busca entre negocios `publicado`.
- Con las dos cosas juntas, la cola de registro deja de ser un callejón sin salida: hoy alguien de verdad puede aprobar, publicar o rechazar un negocio desde el celular, y el vecino que sabe qué necesita ya no tiene que adivinar la categoría.

## La decisión interesante

Esta corrida fue la primera vez que el pipeline llevó dos features en paralelo *de verdad*: T-005 y T-006 arrancaron con su spec aprobada casi a la misma hora, cada una en su propia rama, y terminaron su implementación con un minuto de diferencia. Los dos validadores dieron veredicto limpio por separado (el del panel con 1 iteración de seguridad y 5 hallazgos bajos documentados; el del buscador con 2 iteraciones y un par de deudas aceptadas a propósito). Pero "los dos validadores aprobaron" no quiso decir "la fusión es mecánica" — el precio se pagó al final, al traer `main` (ya con el panel adentro) a la rama del buscador.

No fue un conflicto de líneas, fue de significado, en tres lugares:

1. **El reenvío tras rechazo tenía que aprender del buscador.** El panel agregó: si un negocio rechazado corrige su formulario, se actualiza la misma ficha en vez de crear otra. Pero el buscador guarda el texto normalizado de "nombre" y "¿qué ofreces?" en columnas aparte (SQLite no hace búsquedas insensibles a acentos por sí solo). Si el reenvío no recalculaba esas columnas, una ficha corregida se seguiría encontrando por el texto de la versión rechazada. La fusión tuvo que agregar esa línea a mano:

   ```ts
   const escritura = await contexto.prisma.negocio.updateMany({
     where: { id: existente.id, estado: ESTADO_NEGOCIO_RECHAZADO },
     data: {
       ...datos,
       // El reenvío pisa nombre y "¿qué ofreces?": el texto normalizado
       // del buscador se recalcula con ellos, o la ficha reenviada se
       // seguiría encontrando por el contenido del envío rechazado.
       ...datosDeBusqueda(datos.nombre, datos.queOfreces),
       ...
   ```

2. **Un guard de seguridad del buscador tuvo que aprender a hacer una excepción sin dejar de ser honesto.** El buscador trae un test que escanea todo el código y exige que cualquier archivo que escriba en `Negocio` importe `datosDeBusqueda` — para que nadie vuelva a olvidar recalcular el texto de búsqueda. El panel también escribe `Negocio` (aprobar/rechazar tocan estado, giros y colonia), pero nunca toca `nombre` ni `queOfreces`, así que no le hace falta. En vez de agregar una excepción muda, la fusión sumó una aserción que exenta al archivo del panel *solo si de verdad no escribe esos dos campos*:

   ```ts
   const exentos = [path.join(raiz, "src/lib/admin/transiciones.ts")];
   for (const archivo of escritores) {
     if (exentos.includes(archivo)) {
       expect(codigo, archivo).not.toMatch(/\bnombre\s*:|\bqueOfreces\s*:/);
       continue;
     }
     expect(codigo, archivo).toContain("datosDeBusqueda");
   }
   ```

   Si algún día el panel empieza a escribir `nombre` o `queOfreces`, este mismo test truena y obliga a corregirlo — la excepción se vigila a sí misma.

3. **Un punto y coma dentro de un comentario SQL rompió un test que no tenía nada que ver con el buscador.** El test de migración del panel parte cada archivo `migration.sql` por `;` para probar las sentencias una por una. La migración del buscador trae un comentario con un punto y coma adentro, y el partidor lo cortó a la mitad, dejando fragmentos que ya no eran SQL válido. La corrección fue quitar los comentarios *antes* de partir por `;`, no después.

Ninguno de los tres problemas era grave por separado, y ninguno lo hubiera encontrado un `git merge` normal — los tres pasan la revisión de conflictos de texto sin chistar porque tocan líneas distintas. Lo que los delata es correr las pruebas de la *otra* rama contra el código fusionado.

## Qué aprendimos

Que "cada rama pasó su pipeline en verde" es una condición necesaria, no suficiente, cuando dos features tocan el mismo modelo de datos desde ángulos distintos. La fusión semántica —entender qué le debe una feature a la otra, no solo resolver el diff— hoy sigue siendo trabajo dedicado, con su propio commit y su propia explicación, y así se documentó en vez de esconderlo dentro de un merge silencioso. También nos gustó cómo se resolvió el punto 2: una excepción que se rompe sola el día que deja de ser cierta vale más que un comentario que promete vigilarla.

## Siguiente paso

T-008 (foto del negocio) es el ticket que más se desbloquea hoy: dependía del formulario, del directorio y del panel, y con los tres ya en pie es momento de que las tarjetas dejen de mostrar placeholders. T-007 (páginas legales) sigue pendiente como gate de lanzamiento y puede correr en paralelo.

---
*Tickets/PRs relacionados: T-005 · T-006 · PR #7 · PR #8*
