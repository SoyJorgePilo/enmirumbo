# Reporte UI — `agregar-enlace-de-gestion` (T-014)

Capa de interfaz completa con datos mock, lista para que el dev conecte el token real (`src/lib/gestion/token.ts`), la tabla `EdicionPendiente` (modelo-datos) y las transiciones del panel (`revision-admin`). `npm run lint` y `npm run build` en verde. `npm test` en verde salvo **una** falla esperada y documentada abajo (§7).

## 1. Archivos creados

**Público — modo edición**
- `src/app/(publico)/editar/[token]/page.tsx` — página de edición, resuelve el token contra el mock, `notFound()` para lo que no reconoce, `noindex,nofollow` + `referrer: no-referrer`.
- `src/app/(publico)/editar/[token]/accion.ts` — Server Action **MOCK**: reutiliza `validarRegistro`/`leerEnvioRegistro`-equivalente y el honeypot; no persiste nada.
- `src/app/(publico)/editar/[token]/gracias/page.tsx` — confirmación (POST-Redirect-GET), `noindex,nofollow`.
- `src/components/gestion/aviso-privacidad-vigente.tsx` — nota "Tus datos siguen protegidos..." + enlace al aviso íntegro (sustituye al checkbox de consentimiento en modo edición).

**Público — "Perdí mi enlace"**
- `src/components/directorio/control-perdi-mi-enlace.tsx` — bloque "¿Es tu negocio?" + control, `null` si no hay `href` (fail-safe).
- `src/lib/gestion/config.ts` — `leerWhatsappAdmin(env)`, lee `WHATSAPP_ADMIN`, normaliza o `null`.
- `src/lib/gestion/enlaces.ts` — `construirEnlacePerdiMiEnlace(nombre, whatsappAdmin)`.
- `src/lib/gestion/textos.ts` — todos los literales del modo edición + "Perdí mi enlace".

**Panel — cola y ediciones**
- `src/components/admin/etiqueta-tipo-cola.tsx` — píldora "Alta nueva"/"Edición".
- `src/components/admin/comparacion-edicion.tsx` — fila "Lo que está publicado" vs "Lo que quiere cambiar" + marca "Cambió", apilada (no en columnas fijas) para leerse a 390px.
- `src/components/admin/formulario-aplicar-edicion.tsx`, `formulario-descartar-edicion.tsx`.
- `src/app/admin/ediciones/[id]/page.tsx` — detalle comparativo, **MOCK** vía `obtenerEdicionParaPanelMock`.
- `src/app/admin/ediciones/[id]/accion-aplicar.ts`, `accion-descartar.ts` — Server Actions **MOCK**, sin persistencia.
- `src/app/admin/ediciones/[id]/aplicada/page.tsx`, `descartada/page.tsx` — confirmaciones con `BotonWhatsapp`.

**Panel — regenerar enlace**
- `src/components/admin/control-regenerar-enlace.tsx` — botón "Generar un enlace nuevo" (listo, **no enchufado todavía**, ver §4).
- `src/app/admin/registros/[id]/regenerar-enlace/page.tsx` — confirmación paso 1, **negocio real** vía `obtenerRegistroParaPanel` (solo lectura), enlace mock.
- `src/app/admin/registros/[id]/regenerar-enlace/accion.ts` — Server Action **MOCK**.
- `src/app/admin/registros/[id]/regenerar-enlace/listo/page.tsx` — confirmación con el enlace (mock) y `BotonWhatsapp`.

**Mock central**
- `src/lib/mock/agregar-enlace-de-gestion.ts` — **el archivo clave para el dev**: tokens/ediciones/negocios ficticios de Tizayuca, con exactamente la forma que tendrán los datos reales. Contrato documentado en el propio archivo.

## 2. Archivos modificados (aditivos, retrocompatibles)

- `.env.example` — sección `WHATSAPP_ADMIN` (fail-safe, comentada, sin valor).
- `src/components/registro/boton-enviar.tsx` — prop opcional `texto` (default `"Registrar mi negocio"`); el ternario `pending ? "Enviando..." : texto` se dejó **literal** a propósito (ancla de `tests/registro-pagina.test.ts`).
- `src/components/registro/formulario-registro.tsx` — props opcionales `modo` (`"registro"|"edicion"`), `accion`, `textoBoton`; en `modo="edicion"` NO se pinta el bloque de foto (ver §5, decisión sin respaldo literal de design.md). Comportamiento por defecto sin cambios.
- `src/components/admin/tarjeta-cola.tsx` — props opcionales `tipo`/`hrefDetalle` en `TarjetaColaProps` (extiende `RegistroColaItem`); sin pasarlas, el render es idéntico al de hoy. **No se usa todavía en `/admin/cola`** (ver §4).
- `src/lib/admin/textos.ts` — extendido con todos los literales de cola mezclada, comparación, aplicar/descartar, concurrencia y regenerar enlace, más `mensajeAvisoPublicacionConEnlace` (función **nueva**, `mensajeAvisoPublicacion` original intacta, ver §4).
- `src/app/(publico)/negocio/[ficha]/page.tsx` — agrega `<ControlPerdiMiEnlace>` junto a `<BotonReportar>`, mismo bloque, un solo borde compartido.

## 3. Contrato de datos para el dev (props/tipos)

- `FormularioRegistro`: `accion?: (prev: EstadoAccionRegistro, fd: FormData) => Promise<EstadoAccionRegistro>` (default `registrarNegocio`), `textoBoton?: string`, `modo?: "registro"|"edicion"`. El prellenado sigue siendo `estadoInicial.valores: CamposFormularioRegistro` — para editar, pasa ahí lo publicado o la edición pendiente más reciente.
- `TarjetaCola`: nuevo `tipo?: "alta"|"edicion"` y `hrefDetalle?: string` (default `/admin/registros/<id>`, como hoy). Al mezclar la cola (tasks.md #18), arma cada renglón así:
  ```tsx
  <TarjetaCola {...alta} tipo="alta" />
  <TarjetaCola {...edicion} tipo="edicion" hrefDetalle={`/admin/ediciones/${edicion.id}`} />
  ```
  `src/lib/mock/agregar-enlace-de-gestion.ts` expone `obtenerEdicionesParaColaMock(ahora)` con la forma exacta (`ItemColaMock`) para ver cómo debería quedar `RegistroColaItem` extendido.
- `obtenerEdicionParaPanelMock(id): EdicionParaPanelMock | null` — reemplázalo por la consulta real de `EdicionPendiente` + `Negocio`. Forma: `{ id, negocioId, negocioNombre, linkFicha, creadaEn, cambiaWhatsapp, campos: Record<clave, { etiqueta, publicado, propuesto, cambio }> }`. `ComparacionEdicion` solo necesita `campos`.
- `obtenerFormularioEdicionMock(token): FormularioEdicionMock | null` — `{ negocioNombre, valores: CamposFormularioRegistro, tieneEdicionPendiente }`.
- `construirEnlaceGestionMock(id): string` — reemplázalo por la URL absoluta real armada con `SITIO_URL` + el token de `crypto.randomBytes`.

## 4. Piezas construidas pero **NO enchufadas** a pantallas reales (a propósito)

Decisión deliberada para no romper suites existentes que aún no conocen T-014 (ver §7). Cada pieza está lista; falta el último paso de wiring + actualizar la suite correspondiente:

1. **Cola mezclada real** (`/admin/cola`): no toqué `src/app/admin/cola/page.tsx` ni `obtenerColaDeRevision`. `TarjetaCola` ya soporta `tipo`/`hrefDetalle` (ver snippet arriba); falta mezclar altas + ediciones en `src/lib/admin/consultas.ts` (tasks.md #18) y usar el snippet en `cola/page.tsx`.
2. **"Generar un enlace nuevo" en el detalle de un publicado**: `ControlRegenerarEnlace` existe y funciona (probado a mano contra un negocio publicado real del seed de demostración — `curl` en `/admin/registros/<id>/regenerar-enlace` y `.../listo` responden 200 con los literales correctos). Falta agregar `{publicado && <ControlRegenerarEnlace id={id} />}` en `src/app/admin/registros/[id]/page.tsx`. No lo agregué porque `RegistroAdminDetalle`/`DetalleRegistro` (`src/lib/admin/consultas.ts`) están cubiertos por **muchas** suites (`admin-paginas`, `admin-adversarial`, `admin-despublicar-borrado`, `foto-render`, `reportes-seguridad-adversarial`, `admin-reportes-paginas`, `despublicar-borrado-seguridad-adversarial`, `analitica-exclusion-admin`) y **`tests/admin-adversarial.test.ts`** tiene el guardián `"ninguna pantalla ni acción del panel toca el token de gestión"` que falla si `src/app/admin`, `src/components/admin` o `src/lib/admin` contienen la cadena `tokenGestion` — así que el campo `tokenGestionCreadoEn` (o como se llame) en `RegistroAdminDetalle` solo puede llegar junto con la actualización real de ese test, no antes.
3. **Aviso de publicación con el enlace de gestión** (`src/app/admin/registros/[id]/aprobado/page.tsx`): dejé `mensajeAvisoPublicacion` intacta y agregué `mensajeAvisoPublicacionConEnlace(nombre, linkFicha, enlaceGestion)` en `src/lib/admin/textos.ts`, con el literal completo de la spec. `tests/admin-textos.test.ts` y `tests/admin-paginas.test.ts` anclan HOY que el aviso de aprobación **no** menciona "gestión"/"editar" — son los marcadores explícitos de "esto falta". Cuando conectes el token real: usa la función nueva en `aprobado/page.tsx` y actualiza esas dos suites (ya tienen el comentario "sin enlace de gestión todavía" señalando exactamente dónde).

## 5. Decisiones de UI sin respaldo literal explícito (para tu visto bueno)

- **La edición NO ofrece cambiar la foto.** `design.md §5` solo menciona 3 diferencias (valores iniciales, texto del botón, bloque de consentimiento) y dice "mismo formulario, sin lógica aparte" — pero el requirement **normativo** de `revision-admin` ("Aplicar la edición actualiza la ficha publicada y solo eso") enumera explícitamente los campos editables y la foto NO está en la lista. Prioricé el requirement enumerado sobre el resumen de design.md. `FormularioRegistro` oculta el bloque de foto cuando `modo="edicion"`. Bandera para confirmar con producto/dev si esto es lo que se quería.
- **Copy propio** (sin literal exacto en la spec, solo "DEBE indicar que tiene enlace y desde cuándo"): `textoTieneEnlaceGestion(fecha)` → `"Tiene enlace de gestión, generado el <fecha>."` en `src/lib/admin/textos.ts`. No está en uso todavía (§4.2).
- **Concurrencia del panel de ediciones vía `searchParams`**: los avisos "Estos cambios ya los habías resuelto." / "...ya no son los últimos..." se disparan en el mock con `?aviso=ya-resuelta|reemplazada` en `/admin/ediciones/<id>`, solo para poder REVISAR los dos textos sin fabricar una carrera real. El mecanismo real es una escritura condicionada (`updateMany` con `id` + `estado: 'pendiente'`), documentado en los comentarios de `accion-aplicar.ts`/`accion-descartar.ts`.
- **Motivo del descarte por la URL**: `accion-descartar.ts` (mock) pasa el motivo como query string hacia la confirmación porque no hay dónde persistirlo. El comentario del archivo señala explícitamente que esto **no** es aceptable en el código real (mismo criterio que `rechazado/page.tsx`, que lee `motivoRechazo` de la base).
- **"Perdí mi enlace" y "Reportar este negocio" comparten un solo separador** (`border-t`) en vez de cada uno el suyo, para que no se vean dos líneas seguidas al pie de la ficha (tasks.md #34, coordinación de jerarquía visual).

## 6. Datos mock (Tizayuca ficticio)

Todo vive en `src/lib/mock/agregar-enlace-de-gestion.ts`:
- Tokens de demo: `TOKEN_DEMO_SIN_PENDIENTE` (Tortillería La Espiga) y `TOKEN_DEMO_CON_PENDIENTE` (Refaccionaria El Tornillo Feliz, con aviso de "ya tienes cambios esperando").
- Ediciones de demo: `edicion-demo-horario` (cambia horario/dirección/qué ofreces) y `edicion-demo-whatsapp` (cambia WhatsApp → dispara la advertencia y está marcada atrasada a propósito, 51h).
- Ningún nombre ni número se parece a un negocio real; los WhatsApp mock (`771123000x`) no colisionan con los del seed de demostración (`771999xxxx`).

## 7. Estado de las pruebas

`npm run lint` y `npm run build`: **verde**. `npm test`: **2304/2305 en verde**. La única falla es esperada y documentada:

- `tests/buscador-pagina.test.ts` → `"ninguna otra página del sitio quedó marcada como no indexable"`: su lista blanca (`noIndexables`) no conoce todavía `/editar/[token]` ni `/editar/[token]/gracias`, que la spec `registro-negocio` exige declarar `noindex,nofollow` (el token viaja en la URL). Es el mismo patrón que ya usó `agregar-boton-reportar` para sus propias páginas. **Acción para el dev**: agregar a `noIndexables` (línea ~283 de ese archivo):
  ```ts
  join(raiz, "src/app/(publico)/editar/[token]/page.tsx"),
  join(raiz, "src/app/(publico)/editar/[token]/gracias/page.tsx"),
  ```
  No toqué el archivo porque está en `tests/`.

También verificado a mano (servidor local, puerto 3900): `/editar/<token-válido>` → 200 con los literales correctos; `/editar/<token-inventado>` → 404 idéntico al del sitio; ficha sin `WHATSAPP_ADMIN` → sin bloque "¿Es tu negocio?"; con la variable puesta → aparece con el `wa.me` correcto; `/admin/ediciones/<id>` con sesión → comparación + advertencia de WhatsApp; sin sesión → redirección; `/admin/ediciones/no-existe` → 404; `/admin/registros/<id-publicado>/regenerar-enlace` y su `/listo` → 200 con los literales de la spec.

## 8. Sin librerías nuevas

Todo con lo que ya tenía el repo (Tailwind, componentes existentes). Cero `"use client"` nuevos: todas las pantallas nuevas son Server Components; el único cliente sigue siendo `FormularioRegistro`/`BotonEnviar`, ya existentes.
