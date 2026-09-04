# Propuesta: agregar-paginas-legales

**Ticket:** `docs/tickets/T-007-legales-y-transparencia.md` (E6-1, E6-2, E1-6; P0)
**PRD:** §8 Legal (aviso simplificado en el formulario "que remite al aviso integral en página propia con los elementos mínimos: identidad y domicilio del responsable, datos tratados, finalidades, medios para limitar uso o divulgación, mecanismo de derechos ARCO y procedimiento de cambios"; términos que establezcan "el directorio es un intermediario informativo", el deslinde por la veracidad de lo publicado y por las transacciones vecino-negocio, y las reglas de contenido y el derecho de retirar fichas; ARCO en ≤20 días hábiles), §6.3 (reglas de moderación: "se publican también en los términos"), §6.1 (checkbox de consentimiento "con link al integral")

## Por qué

El sitio ya recibe datos personales de negocios y ya publica fichas con el WhatsApp a la vista, pero las dos páginas que el PRD §8 exige —aviso de privacidad integral y términos y condiciones— no existen: el checkbox del formulario promete un aviso completo que hoy no tiene a dónde apuntar y el footer arrastra desde T-002 un hueco declarado ("espacio previsto, sin enlaces muertos"). Además, la auditoría de T-004 dejó abierto el hallazgo M3: el aviso simplificado nunca le dice al dueño lo más importante para él —que su WhatsApp y su teléfono quedan públicos y que cualquiera va a poder escribirle o marcarle—, que es justo el consentimiento informado que pide la LFPDPPP. Este change publica ambas páginas como **borrador de producto** y cierra el hueco de transparencia; la revisión legal profesional (E6-3) sigue siendo gate humano previo al lanzamiento.

## Qué cambia

- **Página nueva `/aviso-de-privacidad`** con los seis elementos mínimos del PRD §8, redactada completa en español llano (no "lorem ipsum"): quién es el responsable y dónde está, qué datos recogemos, para qué los usamos, **qué queda público y qué no**, con quién los compartimos (con nadie), cómo limitar su uso o divulgación, derechos ARCO con el plazo de ≤20 días hábiles y el procedimiento de cambios del aviso. El texto íntegro está en el delta de `paginas-legales`.
- **Página nueva `/terminos`** con el papel de intermediario informativo, el deslinde de las operaciones entre vecinos y negocios, qué verificamos y qué no (el sello "Negocio verificado" solo dice que el negocio existe y que el número es suyo), las **reglas de moderación del PRD §6.3 publicadas tal cual** y el derecho de retirar fichas. También completo en el delta.
- **Placeholders visibles entre corchetes** donde faltan datos que solo el humano puede dar (`[NOMBRE O RAZÓN SOCIAL DEL RESPONSABLE — completar antes del lanzamiento]`, `[DOMICILIO…]`, `[CORREO ARCO…]`, `[WHATSAPP DEL DIRECTORIO…]`, `[JURISDICCIÓN…]`) y una marca de borrador visible mientras alguno siga sin completar, para que la revisión legal humana no pase nada por alto y para que ningún placeholder llegue callado a producción.
- **Canal ARCO:** se declaran los dos —correo y WhatsApp del directorio—, ambos como placeholder. El PRD §8 dice que las solicitudes "llegan por el WhatsApp del admin"; el correo se suma porque una solicitud ARCO por escrito deja constancia y no todos los titulares querrán usar WhatsApp (duda 2).
- **El footer estrena sus dos enlaces** ("Aviso de privacidad" y "Términos y condiciones"), que es el espacio que T-002 reservó, con área táctil ≥44px. Cae la cláusula de la spec que hoy prohíbe enlaces en el footer.
- **El aviso simplificado del formulario se reescribe** (E1-6 / hallazgo M3): dice de forma llana que el nombre del negocio, el WhatsApp, el teléfono fijo y lo demás que escriba quedan a la vista de cualquiera en el directorio, y suma el enlace "Lee el aviso de privacidad completo" hacia la página nueva. Sale la frase "Cuando publiquemos el aviso completo, aquí va a estar el enlace."
- **Ambas páginas son indexables** (metadata propia, sin `noindex`), Server Components, mobile-first y sin JavaScript de cliente, como el resto del sitio público.

## Capacidades afectadas

- `paginas-legales` (**capacidad nueva**, ADDED): las dos páginas, su contenido literal aprobado, los placeholders y la marca de borrador, la indexabilidad y la forma (layout, jerarquía de encabezados, mobile-first, sin JS).
- `layout-base` (MODIFIED): el footer pasa de "espacio previsto sin enlaces" a "dos enlaces legales, cada uno a una página que existe"; la regla de enlaces internos deja de tener la excepción "los legales de E6 todavía no existen" y la lista blanca de rutas reconoce `/aviso-de-privacidad` y `/terminos`.
- `registro-negocio` (MODIFIED): el aviso simplificado cambia de texto (advertencia de publicidad de los datos, E1-6) y de forma (enlaza al aviso integral). La constancia del consentimiento, el checkbox y su literal no cambian.

## Impacto en código (alto nivel)

- Rutas nuevas `src/app/aviso-de-privacidad/page.tsx` y `src/app/terminos/page.tsx` (Server Components, con su `metadata` propia). Los segmentos ya estaban reservados en `src/lib/rutas-reservadas.ts` desde T-004, así que ninguna categoría puede taparlos.
- Módulo nuevo `src/lib/legales/textos.ts` con el contenido aprobado como datos (mismo patrón que `src/lib/registro/textos.ts` y `src/lib/admin/textos.ts`) y la lista de placeholders pendientes; ver `design.md`.
- `src/components/footer.tsx`: dos enlaces con área táctil ≥44px, en lugar del comentario que reservaba el espacio.
- `src/lib/registro/textos.ts` (`TEXTO_AVISO_PRIVACIDAD`) y `src/components/registro/aviso-consentimiento.tsx`: texto nuevo + enlace al integral.
- Tests: suite nueva de las páginas legales; `tests/layout.test.ts` cambia el caso "el footer no tiene ningún enlace" por "el footer enlaza las dos páginas legales que existen" y deja de usar `/aviso-de-privacidad` como ejemplo de ruta inventada (ahora existe); `tests/registro-pagina.test.ts` cambia "el bloque de consentimiento no tiene ningún enlace" por "enlaza al aviso integral".
- Sin dependencias nuevas, sin migraciones, sin tocar la base de datos.

## Fuera de este change

- **Revisión legal profesional (E6-3):** es humana y sigue siendo gate previo al lanzamiento. Este change entrega borrador de producto, no asesoría legal.
- **Completar los datos del responsable** (nombre/razón social, domicilio, correo ARCO, WhatsApp del directorio, jurisdicción): los pone una persona; aquí van como placeholders visibles.
- **Flujo operativo ARCO en el panel (E3-6):** hoy el borrado definitivo se atiende a mano contra la base. El aviso promete el plazo del PRD, no una pantalla.
- **Foto del negocio y su política de publicación detallada (T-008):** los términos mencionan las fotos dentro de las reglas de moderación en una sola línea genérica ("fotos que no cumplan las reglas de publicación del directorio") justo para no chocar con la spec que se está escribiendo en paralelo; el detalle de la política (del local, productos o trabajo, sin personas reconocibles) lo agrega T-008 a esta misma página.
- **Botón "Reportar" en la ficha (E3-4):** los términos piden avisar por el canal de contacto, no prometen un botón que no existe.
- **Fricción técnica contra la cosecha masiva del directorio (E5-5, hallazgo M5):** los términos prohíben el copiado masivo por escrito; la defensa técnica es otro ticket.
- **Aceptación explícita de los términos en el formulario:** el checkbox sigue diciendo lo que ya dice (solo aviso de privacidad + titularidad del negocio). Sumar "y los términos" cambiaría el literal del consentimiento y la constancia ya guardada; si se quiere, es su propio ticket con criterio legal.
- **`robots.txt`, sitemap y metadata Open Graph de las páginas nuevas (E5-3, E5-5):** aquí solo se garantiza que no llevan `noindex`.
- **Analítica y cookies de medición (E7):** el aviso declara hoy que no hay rastreo y que se avisará antes de encender cualquier herramienta; cuando E7 llegue tendrá que actualizar esta página.
- **Versionado del aviso con constancia por versión** (guardar qué versión aceptó cada negocio): mejora real de cumplimiento, sin ticket; hoy la constancia es solo el timestamp.

## Dudas resueltas en la aprobación

1. **Responsable (persona física o razón social)**: queda como placeholder que admite ambas formas — es decisión del humano con la revisión legal (E6-3), no del código. Nota para esa revisión: publicar un domicilio particular en un sitio abierto y repo público es mala idea; considerar domicilio de contacto alternativo válido ante la LFPDPPP.
2. **Canal ARCO**: se declaran ambos (correo y WhatsApp) como placeholders, con la recomendación explícita de que sean del proyecto y no personales. La revisión legal decide el definitivo.
3. **Marca de borrador visible**: aprobada — el proyecto construye en público y las páginas dicen la verdad; la marca se retira cuando E6-3 se complete.
