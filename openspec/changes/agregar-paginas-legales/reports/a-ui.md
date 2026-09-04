# Reporte UI — agregar-paginas-legales

## Archivos creados

- `src/lib/legales/textos.ts` — contenido literal aprobado de las dos páginas legales, estructurado como datos (`DocumentoLegal`, `SeccionLegal`, `BloqueLegal`), `PLACEHOLDERS_LEGALES`, `HAY_PLACEHOLDERS_PENDIENTES`, `TEXTO_MARCA_BORRADOR` y la metadata (título/descripción) de cada página. Mismo patrón que `src/lib/registro/textos.ts` y `src/lib/admin/textos.ts` (design.md §2).
- `src/components/legales/documento-legal.tsx` — `DocumentoLegalView`, Server Component compartido que pinta cualquier `DocumentoLegal` (h1, marca de borrador condicional, "Última actualización: ", intro, secciones `h2` con párrafos/listas/enlaces, enlace de cierre opcional). Sin directiva de cliente.
- `src/app/aviso-de-privacidad/page.tsx` — Server Component, `metadata` propia sin `noindex`, pinta `AVISO_PRIVACIDAD`.
- `src/app/terminos/page.tsx` — Server Component, `metadata` propia sin `noindex`, pinta `TERMINOS`.

## Archivos modificados

- `src/components/footer.tsx` — reemplacé el comentario que reservaba el espacio de E6 por un `<nav aria-label="Legal">` con los dos enlaces ("Aviso de privacidad" → `/aviso-de-privacidad`, "Términos y condiciones" → `/terminos`), cada uno `min-h-11`.
- `src/lib/registro/textos.ts` — reescribí `TEXTO_AVISO_PRIVACIDAD` con el literal aprobado del delta de `registro-negocio` (advierte que WhatsApp/teléfono/nombre quedan públicos) y agregué `TEXTO_ENLACE_AVISO_INTEGRAL = "Lee el aviso de privacidad completo"`.
- `src/components/registro/aviso-consentimiento.tsx` — agregué el `<Link href="/aviso-de-privacidad">` con el texto de `TEXTO_ENLACE_AVISO_INTEGRAL`, `min-h-11`, misma pestaña; quité el `TODO(E6)` y el comentario que decía "sin enlaces mientras la página no exista".
- `openspec/changes/agregar-paginas-legales/tasks.md` — marqué `[x]` las tareas de implementación que completé (1, 2, 3, 6, 9, 10, 12, 15, 16, 18, 21, 23, 24, 25). Las tareas que son tests (4, 5, 7, 8, 11, 13, 14, 17, 19, 20, 22), la revisión visual humana con navegador (26) y el cierre con `npm test` (27) quedan para el dev/validador — no toqué `tests/`.

## Verificación hecha

- `npm run lint` y `npm run build` en verde. El build muestra `/aviso-de-privacidad` y `/terminos` como rutas estáticas (`○`).
- Con el `next dev` del puerto 3000: ambas rutas responden 200, cada una con exactamente un `h1` y diez `h2`; el footer trae los dos enlaces; `/registro` trae el enlace "Lee el aviso de privacidad completo"; ambas páginas muestran la marca de borrador (`PLACEHOLDERS_LEGALES` no está vacía todavía); el aviso enlaza a `/terminos` al final y `/terminos` enlaza a `/aviso-de-privacidad` dentro de la sección "Tus datos personales".
- No hay `"use client"` en ningún archivo nuevo (confirmé con grep de la directiva real, no de menciones en comentarios — tuve cuidado de no dejar el literal `"use client"` ni siquiera en prosa de comentario, porque el test existente de `layout-base` hace un regex crudo sobre el contenido completo del archivo y un test análogo para `paginas-legales` probablemente hará lo mismo).
- No ejecuté `npm test`: la suite de tests todavía no se actualizó (tasks.md #4, #5, #7, #8, #11, #13, #14, #17, #19, #20, #22 son tests nuevos o casos existentes que hay que reescribir) y no toqué `tests/` por instrucción explícita.
- No hice revisión visual con navegador real a 390/768/1280px (tarea 26, marcada como pendiente humana); sí verifiqué con curl que el HTML servido trae el contenido completo (SSR, sin depender de JS) y reutilicé clases mobile-first ya probadas en el resto del sitio (`max-w-2xl`/`max-w-3xl`, `min-h-11`, sin anchos fijos).

## Decisiones de UI sin respaldo explícito de la spec

- **Modelo de datos del contenido legal**: la spec da el texto literal en Markdown plano; yo lo estructuré como `secciones: { encabezado, bloques: (parrafo|lista|enlace)[] }[]`. Es una decisión de forma (design.md dice "el módulo aporta el texto, no el markup" pero no prescribe la forma exacta de los datos). El dev puede reutilizar este tipo si necesita generar, por ejemplo, un sitemap o una vista de texto plano.
- **Ancho de lectura**: usé `max-w-2xl` para el `<article>` de las páginas legales (más angosto que el `max-w-3xl` del `<main>` del layout raíz), por legibilidad del texto largo. No está en la spec ni en design.md; es una decisión de diseño tipográfico estándar.
- **Estilo visual de la marca de borrador**: usé `border-2 border-tinta bg-superficie` con texto en negritas, sin introducir un color de alerta/amarillo nuevo — la paleta del proyecto es deliberadamente "una sola vía: neutrales para todo, verde solo para la acción" (`globals.css`), así que evité inventar un token de color nuevo para esto. Si el equipo quiere un tratamiento más "advertencia", habría que decidir un token nuevo fuera de este change.
- **Enlaces internos con `text-accion-fuerte underline`**: reutilicé el molde ya establecido en `not-found.tsx`, `registro/gracias`, y las pantallas de admin (`inline-flex min-h-11 items-center text-base font-semibold text-accion-fuerte underline underline-offset-4`) para el enlace de cierre del aviso, el enlace embebido en términos y el enlace del aviso simplificado. Para los dos enlaces del **footer** usé `text-tinta underline` (no `accion-fuerte`) porque van sobre `bg-superficie` junto a texto secundario del footer y no quería que compitieran visualmente con el verde de la acción principal (WhatsApp) en ninguna pantalla — es una lectura de "nada compite con el botón de WhatsApp en la jerarquía visual" aplicada al footer, no un literal de la spec.

## Copy propuesto que necesita visto bueno

- **Títulos y descripciones de metadata** (`src/lib/legales/textos.ts`): la spec exige que existan y sean distintos de los del sitio, pero no da el literal. Propuse:
  - `TITULO_AVISO_PRIVACIDAD`: "Aviso de privacidad — NecesitoUno Tizayuca"
  - `DESCRIPCION_AVISO_PRIVACIDAD`: "Qué datos pide NecesitoUno Tizayuca al registrar un negocio, para qué los usa, qué queda público en el directorio y cómo ejercer tus derechos ARCO."
  - `TITULO_TERMINOS`: "Términos y condiciones — NecesitoUno Tizayuca"
  - `DESCRIPCION_TERMINOS`: "Las reglas de NecesitoUno Tizayuca: qué es el directorio, el deslinde entre vecinos y negocios, qué significa \"Negocio verificado\" y las reglas de moderación."

Todo el resto del texto visible (encabezados, párrafos, viñetas, marca de borrador, placeholders, textos de enlace) es literal de la spec, transcrito carácter por carácter desde `openspec/changes/agregar-paginas-legales/specs/paginas-legales/spec.md` y `specs/registro-negocio/spec.md`.

## Formas de datos para el dev

### `src/lib/legales/textos.ts`

```ts
export type BloqueLegal =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; items: string[] }
  | { tipo: "enlace"; texto: string; href: "/aviso-de-privacidad" | "/terminos" };

export type SeccionLegal = { encabezado: string; bloques: BloqueLegal[] };

export type DocumentoLegal = {
  h1: string;
  ultimaActualizacion: string; // hoy es el placeholder [FECHA DE PUBLICACIÓN]
  introduccion: string;
  secciones: SeccionLegal[];
  enlaceCierre?: { texto: string; href: "/aviso-de-privacidad" | "/terminos" };
};

export const PLACEHOLDERS_LEGALES: readonly string[]; // 7 literales entre corchetes, ver el módulo
export const HAY_PLACEHOLDERS_PENDIENTES: boolean; // PLACEHOLDERS_LEGALES.length > 0
export const TEXTO_MARCA_BORRADOR: string;
export const TITULO_AVISO_PRIVACIDAD: string;
export const DESCRIPCION_AVISO_PRIVACIDAD: string;
export const TITULO_TERMINOS: string;
export const DESCRIPCION_TERMINOS: string;
export const AVISO_PRIVACIDAD: DocumentoLegal; // 10 secciones + enlaceCierre a /terminos
export const TERMINOS: DocumentoLegal; // 10 secciones, sin enlaceCierre (su enlace al aviso vive dentro de la sección "Tus datos personales" como bloque tipo "enlace")
```

**Nota importante para la verificación automática de placeholders (tasks.md #4)**: hay dos literales de correo distintos y con textos diferentes que el humano deberá completar — `[CORREO ARCO — completar antes del lanzamiento]` (usado en el aviso de privacidad, dos veces) y `[CORREO DE CONTACTO — completar antes del lanzamiento]` (usado en términos, sección "Si ves algo raro"). Los tasks.md los agrupa conceptualmente como "correo ARCO / de contacto" pero en el texto son dos strings entre corchetes distintos; `PLACEHOLDERS_LEGALES` los declara como dos entradas separadas para que la comparación "todo placeholder que aparece está declarado, y viceversa" sea exacta.

### `src/components/legales/documento-legal.tsx`

```ts
export function DocumentoLegalView({ documento }: { documento: DocumentoLegal }): JSX.Element
```

Sin más props: la marca de borrador la decide internamente con `HAY_PLACEHOLDERS_PENDIENTES` importado del módulo de textos (no hace falta pasarla).

### `src/lib/registro/textos.ts` (constantes nuevas/cambiadas)

```ts
export const TEXTO_AVISO_PRIVACIDAD: string; // reescrito, sin la frase "Cuando publiquemos el aviso completo..."
export const TEXTO_ENLACE_AVISO_INTEGRAL: string; // "Lee el aviso de privacidad completo"
```

`AvisoConsentimiento` (`src/components/registro/aviso-consentimiento.tsx`) no cambió su firma (sigue sin props) ni la lógica del checkbox/formulario — solo el JSX que pinta el aviso y el enlace nuevo.

## Pendiente para el dev/validador

- Tests nuevos y reescritos de `tests/layout.test.ts`, `tests/registro-pagina.test.ts` y la suite nueva de páginas legales (tasks.md #4, #5, #7, #8, #11, #13, #14, #17, #19, #20, #22).
- `npm test` completo y revisión visual humana con navegador a 390/768/1280px (tasks.md #26-27).
