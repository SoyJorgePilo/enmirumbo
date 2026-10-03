# Etapa B · dev — migrar-enlace-gestion-astro (T-025, Fase 4)

Sin etapa UI. Worktree `enmirumbo-f4`, rama `feature/astro-gestion` (sobre `a4d560e`). Se aplicaron las tres decisiones del fundador: `strict-origin` en todo `/editar/`, la 404 con JS recarga la página y el log del marco se midió (no escribe la URL).

## Resumen

`/editar/[token]`, su confirmación y la Action `editar` ya se sirven con Astro. **Cero líneas en `src/lib/`, `src/app/` y `src/components/`.** En `src/middleware.ts` cambió solo la línea de `prepararRespuesta`. El diff contra Next de `origin/main` (`8d514f5`), con la misma base, da **cero diferencias en A, B y C**: 16 rutas y 19 envíos más la base caída. Se imprimen las aceptadas (`cabecera-referrer-policy` ×34, `meta-referrer-en-la-404` ×11, origen ajeno/`null`). Suite: PG 16 real 174 archivos, 4462 pasan, 2 xfail; PGlite 4454 pasan, 2 xfail, 8 saltadas.

## Línea base (tarea 1)

- HEAD sobre PG 16 (`f4gestion`): 168 archivos, 4351 pasan, 2 xfail. `grep 'from "next/' src/lib/gestion`: vacío.
- `expect(` antes→ahora, sin `skip`/`only`/`todo` nuevos. Re-apuntados: `analitica-exclusion-admin` 64→74, `gestion-edicion` 68→69, `gestion-seguridad-adversarial` 151→156, `responsivo-guardian` 20→20, `buscador-pagina` 60→60. Tocados: `astro-seguridad-adversarial` 40→43, `astro-middleware` 15→29, `astro-metadatos` 19→24, `diff-html` 75→84, `plataforma-astro-cupos` 20→22, `arnes-formulario` +1 prueba; `layout` y las tres `*-accion` sin cambio de conteo.
- `grep` de imports de `src/app/(gestion)` en `tests/`: vacío. Siguen dos rutas en listas, no imports: `buscador-pagina:294` (la página de Next pide `noindex` hasta T-027) y `analitica-adversarial:434`.

## Medido en Next (tarea 2, `tests/fixtures/next-4/`)

- **Sí trae** la `<meta name="referrer" content="strict-origin">` la 404 de un token inválido (GET y POST). Next la pinta dentro del grupo. HEAD no tiene cuerpo.
- `Referrer-Policy` es la global (`strict-origin-when-cross-origin`) en todas: 200, 303, 404 y 500.
- La confirmación manda `private, no-cache, no-store, max-age=0, must-revalidate`. No hay caché compartida, así que no hay diferencia.
- `/editar/` responde 308 a `/editar` y después la 404. En Astro termina en la misma 404 que `/loquesea`, sin 500.
- **Next lleva el token EN CLARO en el HTML.** Está en el oculto `$ACTION_1:1` (`["<token>",{…}]`, `.bind` sin cifrar) y en su página 500. Astro no lo pone en ninguno de los dos.
- JS de `/editar/T`: Next, 9 archivos, 586 502 B, **180 214 B gzip -9**. Astro: entrada 355 + precarga 838 + `gestion-cliente` 412 + `registro-cliente` 2066 = **3671 B gzip**.

## Tareas

1–18 `[x]`, 19 `[~]` (humano), 20 `[ ]` (validador). Notas en `tasks.md`: 1, 2, 3, 5 (ráfaga) y 13 (peso).

## Rojo antes del código (TDD)

Pruebas escritas antes del código y corridas en rojo: 10 archivos, 51 fallas, 89 pasaban. Las de build fallaban por la ruta inexistente; las unitarias, por módulos inexistentes o `prepararRespuesta` sin la rama. Ya pasaban en rojo: `/editar` y `/editar/` (caían en `[destino]`), "la 404 no carga script", "sitemap sin `/editar`" y la búsqueda pura de ecos.

## Mapa scenario → prueba

| Scenario (delta `plataforma-astro`, Fase 4) | Prueba |
|---|---|
| Pantalla igual a la de hoy (A/B/C, pendiente, colonia "Otra", confirmación) | `plataforma-astro-gestion` (15 contra fixtures) + `diff-html --solo-4` |
| Un campo de más sale como diferencia | `plataforma-astro-gestion`, `diff-html` (Fase 4) |
| Los motivos no se distinguen (11 × GET/HEAD/POST `?_action`/POST) | `plataforma-astro-gestion` (byte a byte contra `/loquesea`, cabeceras iguales salvo `Date`) |
| El token regenerado deja de abrir | `plataforma-astro-gestion`, `editar-accion` |
| Recorrido sin JS; mismos desenlaces que Next; campos que no le tocan | `plataforma-astro-gestion-envio` (19 envíos contra el fixture, HTML re-pintado incluido) |
| Dos simultáneos | `plataforma-astro-gestion-envio` (PG; ver desviación 1) |
| Cupo propio por el encabezado declarado; el guardado falla; la base caída | `plataforma-astro-gestion-envio`, `editar-accion` |
| Errores en el sitio; destinos fuera de la lista; 404 que recarga | `gestion-mejora-dom` (happy-dom, HTML real), `gestion-mejora-progresiva` |
| El registro no cambia | `registro-mejora-*` sin tocar y en verde; `diff-html --solo-3b` A: cero diferencias en 7 rutas + envíos |
| Nada lleva el token; un eco inyectado se detecta | `plataforma-astro-gestion-fugas` (cuerpos, cabeceras y log de dos emuladores) |
| La cabecera en cada forma; tronco medido reprueba | `plataforma-astro-gestion-fugas`, `astro-middleware`, `analitica-exclusion-admin`, `astro-seguridad-adversarial` |
| El aviso de privacidad no recibe la ruta (Umami, DevTools) | Manual (tarea 19) |
| Editar el WhatsApp no toca la verificación | `plataforma-astro-gestion-fugas` (Twilio falso, `aplicarEdicion`) |
| MODIFIED: RPC cerrado, Action desde ruta ajena, `Referer` no decide, error sin 303 | `plataforma-astro-gestion-envio`, `editar-accion` |
| Misma dureza; el diff no toca producto | conteos de arriba, `git diff --stat` |

## Decisiones técnicas

- `src/astro/cabeceras.ts:38,63`: `PREFIJO_DE_GESTION` y `set` de la cabecera (pisa lo que traiga). Decide la ruta **pedida**, así que la reescritura a `/envio-rechazado` y la pasada por `/500` quedan cubiertas.
- `src/astro/acciones.ts:92,174`: el nuevo `destinoValido` por entrada (`editar` → `destinoValidoDeEditar`) devuelve "no encontrado". `trasFallar` repinta con `ERROR_GUARDAR_EDICION` sin leer la base (`editar.ts:98`).
- `src/astro/editar.ts:62,126`: `destinoDeEditar` solo arma `/editar/<token>/gracias` con `pareceToken`. `cargarEdicion` resuelve el token antes de mirar la Action. El módulo no tiene `console.*`.
- `src/pages/editar/[token].astro:42`: `AvisoPrivacidadVigente` se pasa como `createElement`. Con `<AvisoPrivacidadVigente />` en la plantilla de Astro, React tronaba ("Objects are not valid as a React child") y el emulador se caía.
- `src/astro/registro-cliente.ts:60,93,212`: motor configurable; `CONFIG_DE_REGISTRO` reproduce lo de hoy; `recargar` solo si la página lo pide; tras un error el ejemplo se re-aplica si hubo `change` (siempre en `/registro`).
- `src/astro/gestion-cliente.ts`: la configuración de la edición (`configDeEdicion`) y su texto viven aquí, para no pesar en `/registro`.
- `src/astro/metadatos.ts:152`: la `referrer`, entre la descripción y `robots`, como Next. `DocumentoBase` no cambió: el guardián "lo público no hereda la política" sigue igual.
- Diferencias aceptadas sin normalizaciones nuevas: `scripts/diff-html/nucleo.mjs:425`. Se reconocen por su texto exacto y una variante sigue reprobando (`diff-html.test.ts`).
- Arnés: `capturar4`/`compararFase4` (`scripts/diff-html.mjs:780,887`), `antesDelEnvio`, `tests/gestion-astro.ts` (siembra con tokens en memoria; disparador que solo muerde un horario marcado) y `tests/editar-astro.ts` (Container API). Series: `77199966xx` (fixtures/pantallas/envíos), `77199967xx` (Action, DOM), `77199965xx` (fugas).

## Guardianes ajustados (antes → después)

1. **`registrar`/`reportar`/`verificar-accion`:** la tabla pasa de 4 a 5 entradas, como pide el MODIFIED.
2. **`gestion-seguridad-adversarial` [A1]:**
   - antes, "cero `<script src>`" en la edición; ahora, exactamente 1, del mismo origen, que es el módulo propio (lo pide el requirement "Con JavaScript…");
   - "cadena de layouts" pasa a "cadena de troncos importados". Se agrega la página misma (más estricto).
3. **`analitica-exclusion-admin`:**
   - `paginasAstroSinMotivo` acepta `TroncoGestion` **solo** bajo `src/pages/editar/`;
   - se agregan dos guardianes: las páginas del enlace usan `TroncoGestion` o la 404 dinámica, y nadie fuera las usa; el tronco no mide;
   - las aserciones del layout `(gestion)` pasan a `TroncoGestion.astro`.
4. **`astro-seguridad-adversarial`:** `paginasPrivadasMedidas` sigue los troncos importados. Se suma un fixture (`editar/[token]/gracias.astro` con un tronco medido).
5. **`layout`:** la lista de rutas dinámicas suma `/editar/[token]` y `/editar/[token]/gracias`. **`buscador-pagina`:** `src/astro/editar.ts` entra en `noIndexables`.
6. **`happy-dom`:** `select.value` de un `<select>` montado con `innerHTML` devuelve la primera opción. La prueba lee `option[selected]` y fija `value` antes del `change`.

## Diff y envíos contra Next (tarea 16)

Next de `origin/main` (builds A/B/C) y la salida de Astro, con la misma base PG 16 (`f4fixturas`) y `REGISTRO_ENCABEZADO_IP=x-forwarded-for` en los dos. La base caída usa los mismos builds con la base inalcanzable.

```
npx tsx scripts/diff-html.mjs <next> <astro> --datos d.json --solo-4
A/B/C: Cero diferencias en la Fase 4 (16 rutas: 5 pantallas + 11 motivos de 404; 19 envíos; base caída)
NORMALIZACIONES_REGISTRO: atributos-del-form 8, campos-action-de-next 8, script-de-la-mejora 8, data-ejemplos 8, autofocus 3
NORMALIZACIONES_404_DINAMICA: 11 c/u · ACEPTADAS: cabecera-referrer-policy 34, meta-referrer-en-la-404 11,
origen ajeno/null (500/403), base caída (500/500; token en el cuerpo: Next sí, Astro no)
--solo-3b (A): Cero diferencias en 7 rutas + envíos 3b-1 (el registro no cambió)
```

## Duda 3: el log del marco ante un 500 (medido)

Con la base caída, el emulador escribe `[ERROR] PrismaClientKnownRequestError … Can't reach database server` con la pila (`negocioDelToken` → `cargarEdicion`) y `[gestion] no se pudo resolver el enlace: código P1001`. No escribe la URL, el token ni su prefijo: 0 apariciones, y la prueba de fugas lo exige. **No hay salida nueva con la ruta: no hizo falta redactar nada.** Queda el riesgo ya asumido (log de acceso de la plataforma, `despliegue.md` §8.1).

## Mutaciones (tareas 8–12, 14 y 18; todas revertidas)

| Mutación | Qué reprobó |
|---|---|
| `TroncoPublico` en la edición (estática) | 3 guardianes de `analitica-exclusion-admin` y `astro-seguridad-adversarial` |
| `TroncoPublico` en la edición (build) | `fugas`: la medición configurada y la `<meta>` |
| `data-token={token}` en la pantalla | `fugas`: recorrido completo y "dirección tras error" |
| Sin la rama de gestión en `cabeceras.ts` | `fugas` y 3 de `astro-middleware` |
| `destinoValido: () => true` (obedecer otro token) | `editar-accion` |
| `clientAddress` en `editar.ts` | 5 (`editar-accion`, `cupos`, `formularios-seguridad-adversarial`) |
| Repintar sin resolver el token | `editar-accion` ("el token va PRIMERO") |
| Oculto o `data-` inyectado | `plataforma-astro-gestion` y `diff-html` |

## Compuertas (tarea 17)

- `npm run lint` 0. `npm run typecheck` 446 archivos, 0 errores. `npm run build` sin base: completa.
- `npm test`, sin caché y en el orden del CI:
  - **PG 16 real** (`f4gestion`): 174 archivos, 4462 pasan, 2 xfail, 0 saltadas;
  - **PGlite** (`prisma dev f4gestionpglite`): 4454 pasan, 2 xfail y 8 saltadas (6 preexistentes y las 2 ráfagas nuevas, con aviso).
- Al final en las dos bases: 0 negocios, 0 ediciones, 0 reportes, 0 cupos y 0 disparadores o funciones de prueba. En `.fotos-test` quedan los 2 `.webp` preexistentes del demo.
- `git diff --stat`: solo `src/{actions,astro,layouts,pages}`, la línea de `src/middleware.ts`, `scripts/` y `tests/`.
- `f4gestionpglite`, el clúster PG 16 (`scratchpad/f4/pg`), Next y los emuladores: detenidos.

## Desviaciones y hallazgos

1. **"Cinco simultáneos → cinco 303" no se cumple ni en Next.** `guardarEdicion` reintenta una sola vez: en 10 rondas de 5, Next y Astro responden 2–3 "No pudimos guardar tus cambios…"; con 2, siempre 303. La prueba exige 2 → 2 303 y, con 5: una pendiente, ningún 500 y cada respuesta 303 o ese mensaje. **Candidato a ticket:** reintentar hasta N veces en `src/lib`.
2. **`Cache-Control` de la 500 de un POST:** Astro manda `private, no-cache…`, como en 3b-1; Next manda `no-cache, no-store…`. Ninguno permite caché compartida. No se tocó, por coherencia con 3b-1.
3. **El módulo de `/registro` creció 166 B gzip** por la configuración. La página pasa de 2870 a 3178 B gzip, porque la precarga ahora es un trozo compartido. Ninguna de sus pruebas cambió. Si se quiere "cero crecimiento", el motor tendría que duplicarse (§4.4 completo).
4. **El token en el HTML de Next** (oculto `$ACTION_1:1` y página 500): Astro lo cierra. Conviene anotarlo en el archivo del change.
5. **Incidente operativo:** en una depuración corrí `pkill -f servir-salida-vercel.mjs` sin filtrar por puerto. Si en ese momento corría un emulador de otro worktree (f5 o f6a), pudo caerse esa prueba. Después solo maté por PID.

## Pendientes humanos

- **Tarea 19 (preview):** sin JS en Chrome y Firefox (error → corrección → confirmación → recargar); con JS (error en el sitio, "Enviando...", la 404 que recarga tras regenerar); DevTools (`Referer` del aviso = origen; cabeceras de la 404); Umami sin `/editar`; Lighthouse móvil; regenerar el enlace usado.
- **Tarea 20:** PR borrador apilado sobre #38 (validador) y T-025 a `en-review`.
- **Al archivar:** nota en `registro-negocio` ("mismo estado y mismo documento"; difieren la cabecera y el `Cache-Control`) y las dos diferencias aceptadas.
