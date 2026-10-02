# Etapa B · dev — migrar-registro-astro (T-024, Fase 3b-1)

Sin etapa UI (no hay `a-ui.md`). Rama `feature/astro-registro`. Spec aprobada con las tres decisiones del fundador (A2, URL `?_action=registrar` sin JS, `happy-dom` condicionado).

## Resumen

`/registro` (Action `registrar`, foto, cupos, constancia, rama encendida) y `/registro/gracias` ya se sirven con Astro. El formulario es nativo; con JS lo mejora un módulo propio de 2.6 KB gzip (sin isla). `src/lib/verificacion/acciones.ts` ya no importa `next/*`. O1 corregido. **Diff contra Next de `main`: cero diferencias en A (98 rutas), B (98) y C (69), con 2a+2b+3a+3b-1 juntas; los 24 envíos de 3b-1 y los 8 de 3a, iguales salvo la diferencia aceptada (origen ajeno o `null`: Next 500, Astro 403).**

## Línea base (tarea 1)

- HEAD sobre PostgreSQL 16 real: 149 archivos, 4105 pasan, 2 expected fail ([M1] de 2b y [c-seguridad M1]).
- Pruebas que tocaban el registro de `src/app/` o simulaban `next/*` para `acciones.ts` (`expect(` antes→después, sin `skip`/`only`/`todo` nuevos):
  `registro-pagina` 110→116 · `foto-formulario` 31→32 · `layout` 167→178 · `responsivo-guardian` 20→20 · `analitica-privacidad` 22→23 · `analitica-exclusion-admin` 62→64 · `verificacion-acciones` 43→46 · `verificacion-seguridad-adversarial` 95→95 · `verificacion-adversarial` 39→39 · `verificacion-failsafe` 40→40 · `reportar-accion` 43→43 · `plataforma-astro-build` 70→70 · `plataforma-astro-cupos` 18→20 · `directorio-astro-seguridad-adversarial` 96→96 · `arnes-formulario` 34→47 · `diff-html` 59→69. `registro-adversarial` (133) no cambió.
- `grep` de imports de `src/app/(publico)/registro` en `tests/`: solo `verificar/` (3b-2). Queda `layout.test.ts:981`, que es una carpeta en una lista de exclusión, no un import.
- **JS de `/registro` en Next de `main`:** 9 archivos, 586 464 B, **180 203 B con gzip -9** (más la carga de vuelo en línea). **En Astro:** 2 archivos, 5 188 B, **2 616 B con gzip -9** (arranque 912 + módulo 1 704).

## Tareas

1–18 `[x]`. 19 `[~]` (preview, humano). 20 `[ ]` (el PR lo abre el validador). En tasks.md dejé dos notas: la corrección de la 13 (`import()`) y cómo se comprobó el rojo de la 4 a la 6.

## Mapa scenario → prueba

| Scenario (spec `plataforma-astro`, 3b-1) | Prueba |
|---|---|
| Formulario igual; un campo de más sale | `plataforma-astro-registro` (contra `tests/fixtures/next-3b`, con y sin `SITIO_URL`), `diff-html` (normalizaciones del registro) |
| Sin isla y con poco JS | `plataforma-astro-registro` (un solo `<script>`, ≤5 KB gzip contando el `import()`, ninguna otra página gana script) |
| Base caída al abrir; base caída al enviar; `/500` no ejecuta | `plataforma-astro-falla-servidor` |
| Alta sin JS; errores con lo capturado; mismos desenlaces que Next; reenvío tras rechazo con foto; cuerpo desmedido; Action fuera de su ruta | `plataforma-astro-registro`, `registrar-accion` (contexto falso) |
| Cupo por el encabezado declarado; carrera por el mismo número | `plataforma-astro-registro-fotos` (la carrera solo con backends independientes; corrió con PG 16) |
| Errores en el sitio; enviando y éxito; destinos fuera de la lista; sin APIs | `registro-mejora-dom` (happy-dom, HTML real de la build), `registro-mejora-progresiva` (funciones puras) |
| La medición no cuenta los errores | Manual (tarea 19, Umami). Automático: el módulo no toca `history` ni mide (`registro-mejora-progresiva`) |
| Foto real con GPS; fotos que no pasan; muchas fotos a la vez | `plataforma-astro-registro-fotos` |
| Gracias igual (6 casos); recarga sin efectos | `plataforma-astro-registro` |
| Código pedido; el SMS no sale (error, rechazado, tarda); apagada no habla con nadie | `plataforma-astro-registro-bandera` (Twilio falso sobre la build), `registrar-accion` |
| Misma dureza; el diff no toca producto | conteos de arriba, `git diff --stat`, `registro-formulario-nativo` |
| MODIFIED: RPC cerrado / Action desde otra ruta / `Referer` / recargar / error sin 303 / sin excepciones de fase / sitemap | `plataforma-astro-registro`, `layout`, `plataforma-astro-build` |
| `registro-negocio` MODIFIED (JS acotado, URLs sin datos) | `registro-pagina`, `registro-mejora-progresiva` |

## Decisiones técnicas

- **El `<script>` hace `import()`** (`src/pages/registro.astro:53`). Con un import estático el módulo pesa <4096 B y Astro lo mete en línea (`plugin-scripts.js`, `assetsInlineLimit`), y la spec pide "un módulo de `/_astro/`". Además, sin las tres APIs no se baja nada. El costo es el ayudante de precarga de Vite (~1.7 KB sin comprimir, sin `modulepreload` en el HTML).
- **La mejora escucha en el documento** y devuelve cómo quitarla (`src/astro/registro-cliente.ts:151`). Así sobrevive al reemplazo del `<form>` y las pruebas no acumulan escuchas.
- **Foco:** el servidor pone `autofocus` (`cuerpo-formulario-registro.tsx:133` y siguientes). La casilla del aviso vive en `aviso-consentimiento.tsx`, que no se puede tocar. Sin JS, si el único error es el consentimiento, no hay foco, igual que hoy en Next. Con JS lo pone el módulo (`registro-cliente.ts:120`).
- **El placeholder del servidor es siempre el genérico,** como en Next (el estado de categoría nunca viene del servidor). La tabla de ejemplos viaja en `data-ejemplos`, con el genérico en la clave `""`.
- **Error sin PRG:** la tabla fija `repintar` como resultado de la Action y la página lo lee con `getActionResult` (`src/astro/acciones.ts:171`, `src/astro/registro.ts:134`). El 200 lleva `no-cache, no-store, max-age=0, must-revalidate`, medido igual en Next.
- **`esResultado` valida `repintar`** (errores de texto; valores de texto o booleanos; `src/astro/registro.ts:122`). Un `ActionError` se traduce sin leer la base (`registro.ts:104`, `acciones.ts:126`).
- **O1** (`acciones.ts:152`, `:189`). Se comprobó por mutación: sin la guarda, el reporte con la base caída vuelve a la 404.
- **`sharp` viaja solo** en `_render.func/node_modules` (`sharp`, `@img/sharp-*`). `astro.config.mjs` no cambió.
- **Twilio falso** (`tests/fixtures/twilio-falso.mjs`): acepta `TWILIO_FALSO_GUION=@archivo` para cambiar el guion sin otro emulador. Con PGlite, siete emuladores a la vez agotaban las conexiones.
- **`levantarEmulador`** ahora usa un puerto que asigna el sistema y admite `precargas` (`tests/salida-astro.ts`). El puerto al azar llegó a repetirse.
- **Fixtures:** los ids de catálogo se guardan como `cat:<nombre>` (`idsDeCatalogoPorNombre`, en `nucleo.mjs`), y se aplica igual en los dos lados. Los WhatsApp son de la serie `77199981xx` (`SEMBRADAS_3B`).
- **`happy-dom` 20.14.5** (`devDependency` exacta, solo en `registro-mejora-dom.test.ts`). `npm audit`: antes y después, 1 moderada y 5 altas, sin avisos nuevos. Ningún paquete nuevo (`happy-dom`, `ws`, `entities`, `whatwg-mimetype`, `buffer-image-size` y dos `@types`) tiene scripts de instalación (0 `hasInstallScript` en el diff del lock).

## Guardianes ajustados (antes → después)

1. **`reportar-accion`:** la tabla pasa de `["reportar"]` a `["reportar","registrar"]`, como dice el MODIFIED. `registrar-accion` prueba la ruta de `registrar`.
2. **`plataforma-astro-build`:** "200 salvo `/registro` (404)" pasa a "200, `/registro` incluida". Es más estricto.
3. **`directorio-astro-seguridad-adversarial`:** `/registro` dejó de ser 404. Su lugar en la lista de 404 sin medición lo toma `/registro/verificar?Marcadoreco=1`, con las mismas aserciones.
4. **`layout`:**
   - `EXCEPCIONES_FASE_3` queda vacía. "acepta `/registro` por excepción" pasa a "sin excepciones", con `/registro`, su destino y gracias resueltos.
   - En "falla con destino inexistente", `/registro/gracias` (que ya existe) se cambió por `/registro/gracias/otra` y `/registro/verificar`. Un `href` inventado sigue reprobando.
5. **`registro-pagina` y `analitica-privacidad`:**
   - "cero `<script src>`" pasa a "cero, salvo el único módulo propio de `/registro`". Lo pide el MODIFIED de `registro-negocio`. Que el módulo no mida lo vigila `registro-mejora-progresiva`.
   - Las anclas de fuente (`py-3`, `min-h-11`, `placeholder={ejemplo}`, `disabled={pending}`) se re-apuntan a `cuerpo-formulario-registro.tsx` y `boton-enviar-vista.tsx`, sin quitar ninguna.
6. **`verificacion-*`:** las acciones se envuelven con `obedecerDestino` (`tests/admin-mocks.ts`), que lanza lo que antes lanzaban `redirect`/`notFound`. El `next/*` simulado queda solo donde se pinta una página de Next (panel y `verificar/`).
7. **`registro-formulario-nativo`:** antes de cambiar `FormularioRegistro`, comprobé con una prueba temporal (ya borrada) que su HTML es idéntico byte a byte al de HEAD en 8 combinaciones.

## Diff y envíos contra Next (tarea 16)

Next de `main` (`8d514f5`, los builds A/B/C de 3a) y la salida de Astro, servidos con la misma base (`diff3b`: seed, seed demo, extras de 2b y 3a) y con un Storage falso en HTTPS local.

```
npx tsx scripts/diff-html.mjs <next> <astro> --datos datos.json   (2a + 2b + 3a + 3b-1)
A: Cero diferencias en 98 rutas.  B: Cero diferencias en 98 rutas.  C: Cero diferencias en 69 rutas.
Envíos 3a: 6 iguales + 2 ACEPTADA · Envíos 3b-1: 22 iguales + 2 ACEPTADA (origen ajeno/null: 500 / 403)
NORMALIZACIONES_REGISTRO: atributos-del-form 13, campos-action-de-next 13, script-de-la-mejora 13,
  data-ejemplos 13 (/registro + 12 re-pintados), autofocus-del-primer-error 10 (cupo-4 y aviso-desfasado no tienen campo con error)
NORMALIZACIONES_FORMULARIO: 7 · NORMALIZACIONES_404_DINAMICA: 16
```

## Compuertas (tarea 17)

- `npm run lint`: 0 errores. `npm run typecheck`: 423 archivos, 0 errores.
- `npm run build` sin base: completa, con `checkOrigin:false` y `actionBodySizeLimit:6291456`.
- `npm test` en el orden del CI (sin caché de resultados):
  - **PostgreSQL 16 real:** 158 archivos, 4237 pasan y 2 expected fail, 0 saltadas (corren las dos concurrencias);
  - **PGlite** (`prisma dev t024b1pruebas`): 158 archivos, 4233 pasan, 2 expected fail y 4 saltadas (2 preexistentes y las dos concurrencias).
- Al final de las dos corridas: 0 negocios, 0 reportes y 0 fotos en la base.
  - En `.fotos-test` quedan los 2 `.webp` del negocio demo. Es preexistente (lo vio d-validacion de 3a).
  - Cada archivo nuevo, corrido solo, deja 0. En la base PG queda 1 fila de `IntentoDeCupo` fechada el 2026-09-03, de una prueba vieja que usa reloj fijo.
- `git diff --stat`: solo rutas permitidas.
  - `src/lib/`: solo `verificacion/acciones.ts`.
  - `src/app/`: los 3 envoltorios.
  - `src/components/registro/`: 2 cambiados y 3 nuevos.
  - Sin cambios en `astro.config.mjs`, `vercel.json`, `prisma/`, `next.config.ts`, `openspec/specs/` ni `spikes/`.
  - `package*.json`: solo `happy-dom`.
  - Doc: `docs/despliegue.md` §11, una nota. T-024 ya traía la línea de la bandera.
- Bases `t024b1pruebas`, `fixturas3b` y `diff3b` (en un clúster PG 16 desechable del scratchpad), emuladores, Next y el Storage falso: todo detenido.

## Hallazgos y propuestas (fuera de alcance)

1. **Con JS, una respuesta que no es el formulario** (413 de Vercel, 500, falla de red) muestra "No pudimos guardar tu registro…" y conserva la foto elegida. Sin JS, el 413 de la plataforma sigue saliendo en inglés (candidato a ticket desde 3a).
2. **Sin JS, el error solo de consentimiento no recibe foco,** porque `aviso-consentimiento.tsx` está fuera del alcance. Para cerrarlo hace falta un cambio de una línea en ese componente, en otro change.
3. **El cupo por IP del registro no es atómico** frente a una ráfaga. Es preexistente, como dice proposal.md.
4. **3b-2** puede reutilizar `twilio-falso.mjs` (guion por archivo), `levantarEmulador({ precargas })` y `DestinoVerificacion`. Para la 404 de `/registro/verificar` hay que usar `NoEncontradoDinamico` (design.md §8).

## Pendientes humanos

- **Tarea 19 (preview de Vercel):**
  - con el JS apagado, en Chrome y en Firefox: foco, foto real de 3–4 MB, gracias y recarga;
  - con JS: dos errores y un éxito (la URL no cambia, foco, "Enviando...", una vista de `/registro` y una de gracias en Umami);
  - Lighthouse móvil de `/registro`;
  - confirmar que `sharp` de Linux procesa la foto;
  - `curl` de las cuatro cabeceras;
  - una foto de 4.6 MB, para anotar el 413 de Vercel.
- **La bandera de SMS no se enciende en `migracion-astro` hasta 3b-2.**
- **El CI tiene que quedar en verde en el PR.**

## Correcciones de c-seguridad (M1, M2 y observaciones 2, 3 y 6)

- **M1/M2:** `src/astro/acciones.ts:162` `pintarSinReleerElCuerpo` quita el `Content-Type` de la petición antes de `siguiente()` en los tres repintados (`repintar`, `no-encontrado` y la pasada por `/500`). Así `getFormState` de `@astrojs/react` sale sin leer, y el cuerpo solo lo lee la Action, con el tope de 6 MiB aplicado en streaming (también con *chunked*). Se descartó la reescritura a GET con `siguiente(Request)` porque en la pasada por `/500` reenruta a la URL original y pone el estado en 200.
- **Medido** en el emulador con `tests/fixtures/contar-lecturas.mjs`, con el mismo envío *chunked* de 200 MB:
  - **antes:** RSS pico de 147 a **2492 MB**, y 9 lecturas del multipart con un cuerpo válido (8 con el de 200 MB);
  - **después:** de 148 a **164 MB**, con **1** lectura (0 con el de 200 MB, porque se corta en el tope). Responde 200 "Esa foto pesa más de 5 MB…", como pide la spec (no `servidor`).
- **Pruebas:** `tests/registro-astro-cuerpo-una-vez.test.ts` (6, en rojo antes del arreglo): lecturas con y sin `Content-Length`, 200 MB, el multipart sin `name`, el truncado y `/500`. El `it.fails` `[c-seguridad M1 3b-1]` pasa a `it`.
- **Obs. 2:** `tests/registro-pagina.test.ts:60-70` y `:556`. En `/registro` hay exactamente 1 `<script src>` y es `src/pages/registro.astro?…index=0&lang.ts`; gracias tiene 0. No se perdió ninguna aserción.
- **Obs. 6:** `src/astro/registro-cliente.ts` usa `ESPERA_MAXIMA_DEL_ENVIO_MS = 60_000`. Al vencer, aborta el `fetch` y hace `formulario.submit()` (nativo) una sola vez. El módulo pesa 1912 B gzip (antes 1704). Tiene 3 pruebas en `registro-mejora-dom`.
- **Obs. 3:** los dos archivos de happy-dom llevan `@vitest-environment-options` sin CSS ni JS externos y con la URL `enmirumbo.example`. Una prueba con un servidor espía comprueba 0 peticiones (antes, 3).
- **Compuertas:** lint 0, typecheck 0 y build sin base completo. Suite con PG 16 real (`t024b1fixm`, ya detenida): 161 archivos, 4266 pasan y 2 expected fail.
