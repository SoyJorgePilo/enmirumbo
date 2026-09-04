# Diseño: agregar-analitica-cookieless

Tres decisiones no obvias. El resto (nombres de evento, propiedades, textos) sale directo del ticket y del PRD §9.

## 1. Cómo se excluye `/admin` de la medición: grupo de rutas `(publico)`

**Problema.** Hoy `src/app/layout.tsx` es el único layout del sitio y envuelve todo, incluido `/admin`. Un layout de servidor no conoce la ruta que está renderizando, así que "inyecta el script salvo en /admin" no se puede escribir ahí sin más.

**Opciones evaluadas:**

- **A. Grupo de rutas `(publico)` con layout propio (recomendada).** Las rutas públicas (`page.tsx`, `[categoria]/`, `negocio/`, `buscar/`, `registro/`, `aviso-de-privacidad/`, `terminos/`) se mudan a `src/app/(publico)/` y ese layout anidado —el único que renderiza el script— las envuelve a todas. `src/app/layout.tsx` (con `<html>`, `<body>`, header y footer), `not-found.tsx` y `admin/` se quedan fuera. Los grupos entre paréntesis no aparecen en la URL: **ninguna URL cambia**. React 19 sube la etiqueta `<script src>` al `<head>` aunque se declare en un layout anidado, así que no hace falta tocar el layout raíz.
  - Costo real: mudar siete carpetas (mecánico, sin cambios de contenido) y enseñarles a dos helpers de tests que hoy recorren `src/app` a ignorar las carpetas entre paréntesis: `rutasExistentes` en `tests/layout.test.ts` (si no, leería la ruta `/(publico)/terminos`) y la comprobación de `tests/directorio-consultas.test.ts` que exige que toda carpeta de `src/app` esté en `SEGMENTOS_RESERVADOS`.
  - Efecto lateral aceptado: la página 404 queda fuera del grupo y por lo tanto sin medir. No es una métrica del §10.
  - **Precisión anotada al fusionar main (T-009)**: eso vale para las URLs que no casan con ninguna ruta (`/a/b/c`), que renderizan `src/app/not-found.tsx` bajo el layout raíz. Las que sí casan con el segmento dinámico de la raíz y llaman a `notFound()` desde dentro —`/loquesea`, `/negocio/inexistente`— resuelven su 404 **dentro** del grupo y sí quedan medidas. Verificado en servidor real. No cambia ninguna decisión: no hay dato personal en juego (la cadena de consulta va excluida y la ruta es pública), y un conteo de 404 no ensucia ninguna métrica del §10.
  - Gana porque la exclusión pasa a ser estructural: no hay lista de rutas que mantener, y una página pública nueva queda medida sola.
- **B. Middleware que publica la ruta en un encabezado y layout raíz que lo lee con `headers()`.** Leer encabezados en el layout raíz vuelve **dinámica toda** página del sitio y mata el renderizado estático — justo lo contrario del presupuesto de <2s en 4G del PRD §8. Descartada.
- **C. Renderizar el componente del script en cada `page.tsx` público, con un test que vigile que ninguna página pública se lo salte.** Cero mudanza de archivos, pero convierte en disciplina (vigilada) lo que la opción A hace por construcción, y el sitio va a sumar páginas públicas en E5 (giro y giro+colonia). Queda como plan B si la mudanza resulta más ruidosa de lo esperado en revisión.

## 2. Fail-safe con variables `NEXT_PUBLIC_*`

Las dos variables tienen que ser `NEXT_PUBLIC_` porque su valor termina en el HTML que ve el navegador. Dos consecuencias que hay que respetar al implementar:

- **Se reemplazan en tiempo de build**, por texto: hay que leerlas con la expresión literal `process.env.NEXT_PUBLIC_UMAMI_SRC` (nunca con acceso dinámico tipo `process.env[nombre]`, que no se sustituye). Y cambiar el valor exige volver a desplegar; eso se documenta en `.env.example`.
- **No son secretos**: el identificador del sitio es público por diseño (viaja en cada página). Aun así van en `.env`, no en el código, para que cambiar de proveedor o de cuenta no sea un commit.

La validación sigue el patrón ya establecido en `src/lib/admin/config.ts`: un módulo que devuelve la configuración o `null`, con una advertencia en el log **una sola vez por proceso** cuando la configuración está a medias. Se exige que `src` sea una URL absoluta `https:` por dos razones: una relativa no cargaría nada útil y avisar temprano ahorra un despliegue mudo; y deja escrito que el sitio no carga scripts por `http:`.

## 3. Contrato de eventos: nombres propios del proveedor y exclusión de la cadena de consulta

- **Nombres de variable y atributos explícitamente Umami** (`NEXT_PUBLIC_UMAMI_SRC`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `data-umami-event`). Un nombre neutro tipo `ANALITICA_*` sería una neutralidad falsa: los atributos de evento son del tracker de Umami, así que una migración a Plausible (ADR-005) toca el marcado de todos modos. Mejor que la dependencia se vea. Para que ese día sea barato, los nombres de evento y el armado de propiedades viven en **un solo módulo** (`src/lib/analitica/eventos.ts`), no repartidos en los componentes.
- **`whatsapp-tarjeta` y `whatsapp-ficha` como eventos distintos** en vez de un solo evento con una propiedad `origen`: la métrica del PRD §10 ("clics a WhatsApp / vistas de ficha") necesita el numerador de la ficha limpio, y en la UI del proveedor un nombre distinto se lee sin filtrar nada.
- **`colonia` = `otra` cuando no hay slug del catálogo.** Una regla única y sin excepciones (slug si existe; si no, `otra`) es más fácil de probar que omitir la propiedad, y garantiza que el texto libre que escribió el negocio —que puede traer referencias de domicilio— nunca salga del sitio.
- **Excluir la cadena de consulta** de las URLs medidas (en el tracker de Umami, el atributo `data-exclude-search`) apaga de raíz el riesgo de que `/buscar?q=…` mande al proveedor lo que escribió el vecino. El precio es que tampoco se mide el filtro por colonia (`?colonia=…`), que no es una métrica del §10. **Al implementar hay que confirmar el nombre exacto del atributo contra la documentación de la versión del tracker de Umami Cloud**; si esa versión no ofreciera la opción, el change no se cierra hasta resolverlo (por ejemplo, mandando la vista sin parámetros por otra vía), porque el requisito de privacidad no es negociable.
