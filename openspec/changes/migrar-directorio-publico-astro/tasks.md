# Tareas: migrar-directorio-publico-astro (Fase 2b)

Rama: `feature/astro-directorio-publico`. Va apilada sobre `feature/astro-lectura-publica` (PR #32), y esa sobre #31. El PR apunta a la rama de debajo y GitHub lo retargetea hasta `migracion-astro`.

Reglas:

- Las tareas van en orden por dependencia y cada una se comprueba sola.
- Primero se hacen las pruebas y las referencias de Next; después, las rutas.
- `src/components/` y `src/app/` no se tocan. En `src/lib/` solo se toca `rutas-reservadas.ts` (tarea 5).
- Todos los datos son ficticios del seed.

## Línea base y referencias (antes de escribir rutas)

- [x] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Listar los ~29 archivos de `tests/` que importan `src/app/` para `[destino]`, `negocio/[ficha]/page`, `buscar` y `api/foto`, con su conteo de `expect(`.
   - Comprobar: la tabla está en el reporte y el `grep` coincide.
- [x] 2. **Fixtures de Next.** Levantar Next de `main` como en 2a, con la base semilla más un negocio en revisión, uno rechazado y uno despublicado, todos con foto ficticia. Capturar en `tests/fixtures/next-2b/`, con y sin `SITIO_URL`:
   - el documento completo de `/loquesea` y de `/negocio/x-<id en revisión>`, sin el runtime, y el `<body>` de `/a/b/c` (la referencia del `<body>` de la 404 dinámica, design.md §1, punto 6);
   - el `<head>` de un giro vacío, de una ficha con foto y de `/buscar?q=plomero`;
   - las cabeceras de una foto publicada y de una foto 404.

   Anotar `lang`, `Cache-Control` y el título real de `/buscar`.
   Comprobar: los fixtures traen el `noindex` de la 404 y el `og:image` de la ficha, y no traen datos reales.
- [x] 3. **Pruebas de la 404 dinámica (en rojo).** Escribir `tests/plataforma-astro-404-dinamica.test.ts` (design.md §1) contra la salida servida, para `/loquesea`, `/no-existe`, `/plomeria-colonia-inventada` y los cinco casos de ficha (inexistente, en revisión, rechazada, despublicada y sin identificador):
   - **contenido visible:** "No encontramos esta página", "A lo mejor el negocio ya no está publicado o la dirección quedó mal escrita." y un único enlace "Ir al inicio" hacia `/`, dentro del header y el footer. El `<body>` coincide con el de `/a/b/c` del fixture;
   - **estado:** 404;
   - **`noindex`:** la instrucción de no indexar en el `<head>`, y `<title>`, `<meta>` y canónica iguales al fixture de Next, con y sin `SITIO_URL`;
   - **sin medición:** con las dos variables de la medición configuradas no aparece el script del proveedor ni ningún `<script>`, y el componente lleva su `// fuera de la medición: <motivo>`;
   - **sin datos del negocio ni de la petición:** con fichas ficticias cuyos nombres, colonias y WhatsApp son marcadores únicos, ninguno aparece en el cuerpo, como tampoco el identificador ni el slug pedido;
   - **igualdad:** la ficha no publicada y la inexistente (y los ocho casos entre sí) responden con cuerpos idénticos byte a byte y las mismas cabeceras salvo `Date`, incluidas las cuatro de seguridad y el `Cache-Control` del fixture;
   - **sin rastros:** no aparecen `__next_error__`, "Next" ni "Astro".

   Comprobar: la prueba falla porque las rutas aún no existen.
- [x] 4. **Pruebas adversariales de fotos contra la build (en rojo).** Ampliar las pruebas de la ruta de fotos con estos casos:
   - el hash de los bytes contra Next;
   - los cuatro 404 idénticos;
   - la lista adversarial de design.md §3, incluidos `HEAD` y `POST`;
   - la base y el almacén caídos;
   - sin `Location` ni dominio del bucket.

   Comprobar: fallan solo por ausencia de la ruta.

## Guardianes

- [x] 5. **Rutas reservadas.**
   - Agregar `"404"` y `"500"` a `SEGMENTOS_RESERVADOS`.
   - Ajustar `tests/directorio-consultas.test.ts` para exigir que estén reservadas, conservando la aserción de 2a sobre el catálogo.
   - Comprobar: un catálogo de prueba con slug `404` reprueba (revertir).
- [x] 6. **Medir la precarga.** Pintar con la Container API `MarcadorFoto` prioritaria dentro de un `.astro` de prueba y anotar dónde deja React el `<link rel="preload">`. Decidir según design.md §2 y escribir la prueba que fija su posición.
   - Si no se puede igualar sin tocar `src/components/`, no tocarlo. Documentar la diferencia de posición en `reports/b-dev.md`, con las rutas afectadas, y hacer que la prueba fije la URL, la variante y el `loading`. Esto es una diferencia aceptada, no un bloqueo.

   Comprobar: la prueba compara contra el `<head>` de la ficha de la tarea 2, y `git diff src/components/` sale vacío.

   _Medido (b-dev): React pintado desde Astro NO emite la precarga (ni en línea ni en el `<head>`). Se iguala en la capa de Astro: `DocumentoBase` la pone después del `viewport` con la URL de `urlDeFoto`. Sin diferencia de posición que documentar._

## Rutas

- [x] 7. **Endpoint de fotos.** `src/pages/api/foto/[clave]/[variante].ts`, dinámico, que llama a `servirFoto` con `obtenerPrisma()` y `almacenDeFotos()`.
   Comprobar: las pruebas de la tarea 4 pasan sobre la salida real servida por `scripts/servir-salida-vercel.mjs`.

   _Ajuste (b-dev): además exporta `HEAD` (= `GET`) y `ALL` (`OPTIONS` → 204 con `Allow`, el resto → 405), que es lo que respondía Next medido; sin `ALL`, Astro respondía un 404 sin cuerpo que reencamina fuera del middleware._
- [x] 8. **Componente de la 404 dinámica y normalizaciones del diff.**
   - Crear `src/astro/componentes/NoEncontradoDinamico.astro`: sin props, con `DocumentoBase noEncontrado`, `NoEncontrado` y metadatos constantes ajustados al fixture de la tarea 2. Lleva su comentario `// fuera de la medición: <motivo>`.
   - Extender la prueba de exclusión para que lo reconozca.
   - Agregar a `scripts/diff-html.mjs` la lista `NORMALIZACIONES_404_DINAMICA` con las tres entradas de design.md §1, punto 6, y nada más. Debe aplicarse solo a las URLs de 404 dinámicas del §7 cuando las dos versiones responden 404, y debe imprimir dónde se aplicó.

   Comprobar:
   - una variante del componente sin motivo hace fallar la prueba de exclusión (revertir);
   - un `<meta>` extra inyectado a mano en una 404 dinámica sale como diferencia en el diff (revertir).
- [x] 9. **`/[destino]`.** `src/pages/[destino].astro` en `TroncoPublico`, con `resolverDestinoDeLaRaiz`, `?colonia=` por `searchParams.get` y los metadatos de `generateMetadata` llevados a `metadatos.ts`. Si el destino es desconocido, pone `Astro.response.status = 404` y pinta `<NoEncontradoDinamico />` en lugar del tronco, sin `return new Response(…)` (design.md §1, punto 3).
   Comprobar:
   - sobre la build, `/loquesea` responde 404 con el `<body>` de la página de no encontrado y con `Cache-Control` dinámico, sin que Astro lo reencamine a `404.astro`;
   - el diff da cero en categoría (sin filtro, con filtro, colonia inventada y repetida), giro, giro+colonia y giro vacío;
   - en `/loquesea` y `/no-existe` el diff solo aplica las normalizaciones de la tarea 8.

   _Corrección (b-dev): los metadatos de `generateMetadata` no van a `src/astro/metadatos.ts` sino a `src/astro/metadatos-directorio.ts`: `metadatos.ts` lo importa `DocumentoBase`, por el que pasan las prerenderizadas, y el guardián de `despliegue` (con razón) reprueba que una prerenderizada alcance `@/lib/directorio`, aunque sea por un tipo. La lectura de la base de las tres páginas vive en `src/astro/directorio.ts`._

   _Corrección (b-dev): `?colonia=` NO se lee con `searchParams.get`. Medido en Next de `main`: con la colonia repetida (`?colonia=a&colonia=b`) Next recibe un arreglo y NO filtra; `get` filtraría por la primera y el diff de "colonia repetida" (§7) saldría distinto (además `tests/directorio-adversarial.test.ts` ya fijaba "repetido → listado completo"). Se usa `getAll` y solo se filtra con un único valor. Ver desviación de letra en `reports/b-dev.md`._
- [x] 10. **`/negocio/[ficha]`.** `src/pages/negocio/[ficha].astro` con JSON-LD (`serializarJsonLd`), Open Graph propio y la precarga según la tarea 6. Para todo lo que no esté publicado, antes de cualquier otra consulta, pone el 404 y pinta `<NoEncontradoDinamico />`, igual que la tarea 9.
   Comprobar:
   - la tarea 3 en verde;
   - el diff en cero en ficha completa, ficha mínima y enlace viejo;
   - en la inexistente y en la de revisión, solo las normalizaciones de la tarea 8.
- [x] 11. **`/buscar`.** `src/pages/buscar.astro` con los tres estados. `recortarConsulta` y la limpieza de invisibles se mueven sin cambios a `src/astro/` (design.md §4). Usa el título estático medido en la tarea 2 y `noindex, follow`.
   Comprobar: el diff da cero sin `q`, con resultados, sin resultados, con `q` repetido y con `q` hostil.

## Verificación

- [x] 12. **Despublicación de punta a punta.** Prueba contra la build: despublicar un negocio con foto y volver a pedir las ocho superficies del requirement.
   Comprobar: ningún dato suyo en ninguna superficie, la ficha da la 404 dinámica y la foto el 404 vacío.
- [x] 13. **Sitemap y enlaces.** Prueba que pide a la build de Astro todas las URLs del `sitemap.xml` semilla. Extender el guardián de enlaces y destinos de formulario para que reconozca `[destino].astro`, `negocio/[ficha].astro` y `buscar.astro`.
   - `/registro` y `/negocio/<…>/reportar` entran a una lista explícita de excepciones de la Fase 3 (design.md §8). No se crean páginas provisionales.

   Comprobar: todo 200 salvo `/registro`, y un `href` a una ruta inventada hace fallar el guardián (revertir).
- [x] 14. **Cabeceras y cero JS sobre la build.** Ampliar `tests/plataforma-astro-build.test.ts` con las ocho respuestas del scenario "las cuatro en todas partes" y con el HTML sin `<script>` propio de un listado, una ficha y `/buscar`.
   Comprobar: en verde.
- [x] 15. **Re-apuntar pruebas.** Pasar a Astro las aserciones de los archivos de la tarea 1.
   Comprobar:
   - el conteo de `expect(` por archivo es igual o mayor;
   - no hay `skip` nuevos;
   - un `grep` de imports de esas rutas de `src/app/` en `tests/` sale vacío;
   - todo en verde.
- [x] 16. **Diff completo.** Correr `scripts/diff-html.mjs` con las rutas de design.md §7 como parte del alcance, sin medición y con medición. Pegar la salida en `reports/b-dev.md`.
   Comprobar: cero diferencias, salvo las normalizaciones de la 404 dinámica, que se aplican solo en sus URLs y se listan en la salida, y la posición de la precarga si la tarea 6 la documentó.
- [x] 17. **Rendimiento.** Lighthouse móvil sobre `/servicios-del-hogar` y una ficha con foto, servidas por el emulador.
   Comprobar: 100 en las dos, anotado como indicativo hasta el preview.

## Cierre

- [x] 18. **Compuertas.**
   - `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test`, todo en verde.
   - `git diff --stat`: en `src/lib/` solo cambia `rutas-reservadas.ts`, y no hay cambios en `src/components/`, `src/app/`, `vercel.json`, `prisma/`, `openspec/specs/` ni `spikes/`.
- [~] 19. **Preview de Vercel (paso humano).** Con `curl -sD - -o /dev/null` revisar las cuatro cabeceras y el `Cache-Control` en un listado, una ficha, `/loquesea` (que además debe mostrar "No encontramos esta página" con JS desactivado), una ficha no publicada, una foto publicada y una foto 404. Repetir Lighthouse en el listado y en la ficha. Anotarlo en el ticket.
- [ ] 20. **PR** hacia la rama de debajo, nunca `main`, con el diff de la tarea 16, el preview de la tarea 19 y las diferencias aceptadas en la descripción: el `<body>` de las 404 dinámicas (alternativa B) y, si aplica, la posición de la precarga, enlazado en T-023.
