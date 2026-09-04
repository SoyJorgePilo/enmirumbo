# Tareas: agregar-seo-local

Orden por dependencia: primero la resolución de rutas y sus invariantes (sin ellas, cualquier página nueva puede secuestrar una URL publicada), después las consultas, después las páginas, después la metadata y los artefactos del sitio, y al final las verificaciones adversariales y la revisión humana.

- [ ] 1. Crear `src/lib/seo/frases-giro.ts` con la tabla curada `slug de giro → frase` (deportivos de E4-3: `futbol` → "Clases de futbol", `box` → "Clases de box", `natacion` → "Clases de natación", `basquetbol` → "Clases de basquetbol", `taekwondo-artes-marciales` → "Clases de taekwondo y artes marciales", `danza-zumba` → "Clases de danza y zumba", `atletismo-corredores` → "Atletismo y clubes de corredores", `gimnasio` → "Gimnasios", `ciclismo` → "Ciclismo"; y los de nombre con diagonal, `fonda-comida-corrida` → "Fondas y comida corrida") con respaldo al nombre del catálogo. Verificable: test unitario que para cada uno de los 49 giros sembrados devuelve una frase no vacía y sin diagonales, y que un giro inventado devuelve su propio nombre.

- [ ] 2. Crear `src/lib/seo/titulos.ts` con el armado de encabezados y títulos: `«Frase» en Tizayuca`, `«Frase» en «Colonia», Tizayuca` con la excepción de las colonias cuyo nombre ya contiene "Tizayuca", y el de la ficha (`«Nombre» en «Colonia», Tizayuca` / `«Nombre» en Tizayuca`). Módulo puro. Verificable: tests con "Plomería"+"Huicalco", "Plomería"+"Haciendas de Tizayuca" (sin el segundo Tizayuca), "Futbol"+"Nuevo Tizayuca", y una ficha sin colonia.

- [ ] 3. Crear `src/lib/seo/rutas.ts`: dado un slug de la raíz y los tres catálogos, devuelve qué es (categoría, giro, giro+colonia o nada), resolviendo en ese orden y exigiendo que el compuesto se lea de exactamente una manera (`design.md` §1 y §2). Módulo puro, sin base. Verificable: tests de slug de categoría, de giro, de compuesto válido, de compuesto con una parte inventada, de slug vacío, con guiones de más, con mayúsculas y con caracteres raros; ninguno lanza excepción.

- [ ] 4. Extender la verificación de catálogos (hoy en `tests/directorio-consultas.test.ts` / `src/lib/rutas-reservadas.ts`) a las cuatro condiciones del delta de `modelo-datos`: cruce giro/colonia/categoría, segmentos reservados y compuestos sin doble lectura. Verificable: pasa con los catálogos sembrados y falla —con el slug nombrado— al inyectar un giro llamado como una categoría, uno llamado `buscar` y un par que produce un compuesto ambiguo.

- [ ] 5. Agregar a `src/lib/directorio.ts` las consultas de giro, con `estado: publicado` por construcción y la misma proyección de campos públicos: giro por slug, negocios publicados por giro (y opcionalmente por colonia), colonias con negocios publicados de un giro, y los giros de un negocio publicado. Verificable: tests contra la base sembrada — `plomeria` trae la plomería y no la electricidad; el club de `futbol` aparece aunque su categoría sea deporte; un negocio `en_revision` con giros nunca vuelve; un giro sin negocios devuelve lista vacía sin error.

- [ ] 6. Agregar a `src/lib/directorio.ts` las consultas que alimentan el sitemap: giros con negocios publicados, pares giro+colonia con negocios publicados y fichas publicadas con su fecha de publicación. Verificable: test que comprueba que un negocio `rechazado` no aporta ningún par, y que el número de consultas a la base es fijo (no una por combinación).

- [ ] 7. Renombrar `src/app/[categoria]/` a `src/app/[destino]/` sin cambiar el comportamiento del listado por categoría. Verificable: `tests/directorio-paginas.test.ts` sigue en verde sin tocar sus casos y `/servicios-del-hogar` responde exactamente el mismo HTML que antes.

- [ ] 8. Conectar la página de la raíz al resolvedor: categoría → listado actual; giro → página de giro; giro+colonia → página de giro y colonia; nada → `notFound()`. Verificable: `/servicios-del-hogar` 200 con su listado, `/plomeria` 200, `/plomeria-huicalco` 200, `/plomeros-baratos` 404, `/plomeria-colonia-inventada` 404.

- [ ] 9. Implementar la página de giro (Server Component): `h1` con la frase + "en Tizayuca", tarjetas con el mismo componente y el mismo orden del listado, y navegación por colonia con "Todas las colonias" + una opción por colonia con negocios publicados de ese giro, enlazando a `/giro-colonia`. Verificable: test del HTML de `/plomeria` (un solo `h1`, el literal del encabezado, las tarjetas esperadas en orden, y la opción "Huicalco" apuntando a `/plomeria-huicalco`).

- [ ] 10. Implementar la página de giro y colonia: `h1` con la fórmula (incluida la excepción de "Tizayuca" repetido), listado acotado a esa colonia, navegación con la colonia activa y "Todas las colonias" hacia `/giro`. Verificable: test de `/plomeria-huicalco` y del caso `haciendas-de-tizayuca`, más que un negocio del mismo giro en otra colonia no aparece.

- [ ] 11. Implementar los estados vacíos y el `noindex` de las páginas sin negocios publicados: literales "Todavía no hay negocios publicados de esto en Tizayuca." (giro) y "Todavía no hay negocios publicados de esto en esta colonia." (giro+colonia) + "Registra tu negocio gratis" y "Ver todas las colonias". Verificable: test de una página de giro vacía y una de giro+colonia vacía → responden 200, traen los literales y declaran `noindex, follow`; las páginas con contenido no lo declaran.

- [ ] 12. Mostrar en la ficha los giros asignados como enlaces a su página, con área táctil ≥44px, y nada cuando el negocio no tiene giros. Verificable: test de la ficha del negocio sembrado con giro (enlace a `/plomeria`) y de uno sin giros (ninguna sección de giros en el HTML).

- [ ] 13. Extraer a un módulo compartido la lectura de la URL pública del sitio (`SITIO_URL`, hoy en `src/lib/admin/config.ts`) sin cambiar su comportamiento, y declarar `metadataBase`, la plantilla de título `%s — NecesitoUno` y la identidad de Open Graph del sitio en `src/app/layout.tsx`. Verificable: `tests/admin-config.test.ts` sigue en verde; la home conserva su título completo; un listado de categoría muestra "… — NecesitoUno"; en producción sin variable no se emite ninguna URL absoluta a `localhost`.

- [ ] 14. Agregar `generateMetadata` al listado por categoría (título, descripción y canónica; con `?colonia=` la canónica es el listado sin filtro). Verificable: tests de los tres valores para dos categorías y del caso con filtro.

- [ ] 15. Agregar `generateMetadata` a las páginas de giro y de giro+colonia (título, descripción, canónica y el `noindex` de las vacías). Verificable: tests de `/plomeria`, `/plomeria-huicalco` y una combinación vacía.

- [ ] 16. Agregar `generateMetadata` a la ficha: título, descripción (el "¿Qué ofreces?" recortado o la frase de respaldo), canónica y Open Graph con la foto del negocio o la imagen del sitio. Verificable: tests de una ficha con "¿Qué ofreces?", una sin él, una con `fotoUrl` y una sin foto; en ninguna aparece el WhatsApp ni el teléfono.

- [ ] 17. Crear `src/app/opengraph-image.tsx` con la imagen de marca del sitio usando `ImageResponse` de `next/og` (sin dependencias nuevas), con su texto alternativo. Verificable: la ruta responde una imagen con el tamaño declarado y `npm run build` no falla; las fichas sin foto la heredan.

- [ ] 18. Emitir el JSON-LD `LocalBusiness` en la ficha publicada según `design.md` §6 (nombre, URL canónica, colonia dentro de una dirección de Tizayuca/Hidalgo/MX, categoría y giros, descripción y foto si hay; sin teléfono, sin horario, sin dirección exacta), con el escapado del carácter `<`. Verificable: test que extrae el bloque, lo interpreta como JSON y comprueba campo por campo lo que está y lo que no; y un caso con un nombre que trae `</script>` dentro.

- [ ] 19. Crear `src/app/robots.ts` con la convención de App Router: permite lo público, excluye `/admin`, `/buscar` y `/registro/gracias`, y anuncia el sitemap con URL absoluta (o sin esa línea si no hay URL declarada). Verificable: test del texto generado, incluido el caso sin URL pública.

- [ ] 20. Crear `src/app/sitemap.ts` con la convención de App Router: home, las 8 categorías, giros y pares giro+colonia con contenido, y fichas publicadas con su fecha de publicación. Verificable: test contra la base sembrada que comprueba las URLs presentes y las ausentes (`/admin`, `/buscar`, `/registro/gracias`, combinaciones vacías, negocios no publicados) y el caso de producción sin URL pública (documento vacío, nunca `localhost`).

- [ ] 21. Actualizar la lista blanca de rutas de `tests/layout.test.ts` para que reconozca las URLs de giro y giro+colonia como rutas dinámicas resueltas del catálogo, y agregue el caso negativo (un enlace a un giro inventado sigue fallando). Verificable: la suite pasa con las páginas nuevas y falla al inyectar un enlace a `/giro-que-no-existe`.

- [ ] 22. Escribir la suite adversarial de las rutas nuevas (`tests/seo-adversarial.test.ts`): slugs con `%`, `_`, `..`, `//`, unicode de otro alfabeto, guiones de más, cadenas larguísimas, mayúsculas, y una combinación que corresponde solo a un negocio en revisión. Verificable: ninguna produce error del servidor, ninguna filtra datos de negocios no publicados y ninguna devuelve un listado que no le toca.

- [ ] 23. Documentar `SITIO_URL` en `.env.example` y en el README como requisito para el sitemap, las canónicas y la vista previa, con la advertencia de qué pasa si falta en producción. Verificable: el archivo lo incluye con un valor de ejemplo y sin ningún secreto.

- [ ] 24. Revisar a 390px, 768px y 1280px una página de giro con varios negocios, una de giro+colonia, una vacía y una ficha con sus giros: sin scroll horizontal, áreas táctiles ≥44px y el botón de WhatsApp sigue siendo lo más prominente de cada tarjeta. Verificable: inspección en los tres anchos sobre el sitio servido; lo que necesite ojos humanos queda anotado para el PR.

- [ ] 25. Repasar carácter por carácter los literales nuevos (encabezados, estados vacíos, títulos y descripciones) contra el delta de spec y contra el español mexicano coloquial del proyecto, y confirmar que ningún dato ficticio nuevo se parece a un negocio real de Tizayuca. Verificable: diff de literales contra la spec y revisión de los fixtures usados en los tests.
