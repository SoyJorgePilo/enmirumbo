# Reporte de validación — `agregar-analitica-cookieless` (T-010)

**Fecha:** 2026-09-04 · **Rama:** `feature/agregar-analitica-cookieless` · **Árbol:** principal

## Veredicto: **APROBADO**

Los 3 deltas de spec están implementados y verificados de forma independiente; los 6
criterios de aceptación del ticket se cumplen; no hay scope creep; los 6 hallazgos de
las tres iteraciones de auditoría están cerrados y los volví a comprobar contra un
servidor real, sin fiarme de los reportes. Gates en verde tras fusionar `main` dos veces.

No lo sustituye nada de esto: **el CI de GitHub Actions tiene que quedar en verde en el
PR**, y el merge lo hace un humano.

## 1. Cobertura de spec (scenario por scenario)

Los 3 deltas suman 6 requirements ADDED y 3 MODIFIED. Muestreo verificado contra el HTML
**servido por un servidor real** (`next start`, puerto 3700), no contra el reporte del dev:

| Scenario | Cómo lo verifiqué | Resultado |
|---|---|---|
| sin variables no se carga nada | servidor sin config: `/`, `/buscar`, `/registro`, `/servicios-del-hogar`, `/terminos` | 0 scripts externos, 0 avisos en el log |
| con las dos variables se carga el script | servidor con config, las 6 pantallas públicas | exactamente 1 `<script defer src>` en cada una |
| configuración a medias | build con `NEXT_PUBLIC_UMAMI_SRC="/relativo.js"` | 0 scripts + 1 aviso, nombrando las dos variables y **sin repetir el valor** |
| el panel no carga el script | `/admin`, `/admin/cola`, `/admin/borrado-hecho` y detalle, con sesión real | 0 coincidencias de `umami`, 0 atributos de evento |
| propiedades de un evento | ficha real servida | `whatsapp-ficha`, `llamar` y `como-llegar`, cada uno con **solo** `categoria` y `colonia`, ambos slugs |
| en la página de resultados manda la categoría del negocio | listado servido con 3 negocios | `categoria` del negocio, `colonia` distinta por tarjeta (`atempa`/`huicalco`) |
| llamar por teléfono con la medición encendida | HTML servido del botón "Llamar" | evento en `<span class="contents">`, el `<a href="tel:">` intacto |
| el admin sale del panel hacia el sitio público | `<meta name="referrer">` en las 6 pantallas + comodín | `strict-origin` en todas |
| cerrar el referente no puede romper el panel sin JS | POST nativo con `$ACTION_ID`, `Origin` de navegador | **303 + `Set-Cookie` + `Location: /admin/cola`** |
| una URL inexistente del panel tampoco filtra | `/admin/registros/abc/loquesea` | 404 **con** `strict-origin` |
| los atributos no ejecutan nada por sí solos | servidor sin config | `data-umami-event` presentes, `href` de WhatsApp sin cambios |
| un solo script y diferido | HTML público con config | 1 solo `<script>` externo, `defer`, dominio de `.env.example` |
| sin componentes de cliente | `grep` sobre los archivos nuevos | ningún `"use client"` |

**Contraprueba del valor `strict-origin`** (que el hallazgo A-2 no vuelva por descuido):
el mismo POST con `Origin: null` —lo que produce `no-referrer`— responde **500**. El valor
no es intercambiable y ahora está verificado en las dos direcciones.

## 2. Criterios del ticket

Los 6 se cumplen; marcados en `docs/tickets/T-010-analitica.md`.

## 3. Alcance

Sin scope creep. Cada archivo del diff se explica por la propuesta o por una enmienda
aprobada. Los cambios en `src/lib/legales/textos.ts`, `src/lib/registro/procesar.ts` y
`src/components/registro/formulario-registro.tsx` son consecuencia mecánica de la mudanza
de rutas (comentarios y un import), no cambios de comportamiento.

**Contaminación del árbol compartido, no incluida en estos commits:** el working tree
traía trabajo de otras sesiones (specs de `agregar-enlace-de-gestion` y
`preparar-deploy-produccion`, y los tickets T-013/T-014 en `en-spec`). Stagé archivo por
archivo y quedó fuera. Además restauré `docs/tickets/T-011`, `T-012` y
`openspec/changes/agregar-boton-reportar/proposal.md`, que aparecían borrados en el disco
sin que ningún change lo pidiera.

## 4. tasks.md

32 tareas. Todas `[x]` salvo la **#25**, `[ ]` a propósito: son los pasos humanos de
después del merge. Verificada por muestreo la #12 (proyección), #16 (envoltura), #26/#31
(política del panel) y #32 (comodín).

## 5. Seguridad

`reports/c-seguridad.md` §9 cierra en **0 críticos / 0 altos / 0 medios**. Re-verifiqué
por mi cuenta lo que más pesa (tabla del §1). Revisión del diff: sin secretos, sin datos
personales reales (las series `7719890`/`7719999` son ficticias y se borran al terminar),
sin endpoints que expongan campos de más. `.env.example` solo trae valores comentados.

**O-2 aplicado** (corrección editorial autorizada): el scenario "el admin sale del panel
hacia el sitio público" decía *"la página pública no recibe referente"*, que describe
`no-referrer` —el valor que rompía el panel sin JavaScript—. Ahora dice que recibe como
mucho el origen pelado y nunca la ruta. Queda anotado en el propio delta.

## 6. Gates mecánicos (ejecutados por mí, tras las dos fusiones)

| Gate | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npm test` | **70 archivos / 1 879 pruebas en verde** |
| `npm run build` | exit 0, sin config, con config, con `SITIO_URL` y con config a medias |
| Lista de rutas vs. `main` | **23 rutas idénticas**, ninguna URL cambia; única alta: `/admin/[...resto]` |
| Bundle de cliente | **601 181 bytes en 13 archivos, idéntico con y sin configuración**; 0 archivos con `umami` |

Los hashes de `.next/static` no sirven de comparación: dos builds seguidas con el mismo
entorno ya difieren (Turbopack no es determinista aquí). Por eso la comparación es por
bytes y por contenido.

## 7. Convenciones

UI en español mexicano; sin `any`; sin dependencias nuevas por este change (`sharp` entra
con la fusión de T-008, no con esto).

## 8. Notas de la integración mayor (no bloquean)

1. **`CAMPOS_FICHA` pisaba el slug.** El `select` de la ficha sobreescribe el del listado;
   con solo `nombre` (lo que traía `main`), `categoriaSlug` quedaba `undefined` y los tres
   eventos de la ficha viajaban con `categoria=otra` — sin que TypeScript dijera nada. Lo
   detectó la suite tras la fusión. Corregido, con el aviso escrito al lado.
2. **La 404 sí se mide en algunos casos.** El diseño decía que la 404 queda fuera de la
   medición. Tras T-009 eso solo vale para las URLs que no casan con ninguna ruta
   (`/a/b/c`); las que casan con el segmento dinámico de la raíz y llaman a `notFound()`
   (`/loquesea`, `/negocio/inexistente`) resuelven dentro del grupo y **sí** se miden.
   Medido en servidor real. No cambia ninguna decisión —no hay dato personal, la cadena de
   consulta va excluida y un 404 no es una vista de ficha—, pero la afirmación era
   imprecisa y quedó corregida en `design.md` y en el comentario del layout.
3. **Adversarial de privacidad ajustado a lo que dice la spec.** Sin configuración la
   ficha ya no puede afirmar "cero `<script>`", porque T-009 agregó el Schema.org en
   línea. La prueba ahora exige cero `<script src>` —que es lo que el requirement
   prohíbe— y fija que el JSON-LD sea el único inline permitido.
4. **T-015 llegó a mitad de la validación** (PR #13 se mergeó durante la corrida). Sus
   tres pantallas nuevas cuelgan de `/admin`, así que heredaron la exclusión de medición y
   la política de referente **sin tocar nada**: es justo la propiedad estructural que este
   change compró.

## 9. Pendiente humano

La tarea #25 sigue abierta a propósito y está en el cuerpo del PR: crear la cuenta,
pegar las dos variables, redesplegar, y probar "Llamar" en un celular real y el panel con
el JavaScript deshabilitado. La deuda de CSP ya vive en T-013.
