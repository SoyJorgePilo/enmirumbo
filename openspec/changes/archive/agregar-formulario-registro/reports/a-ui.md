# Reporte UI — agregar-formulario-registro

## Archivos creados

- `src/lib/mock/agregar-formulario-registro.ts` — datos mock (catálogos) **y**
  contenido real (textos literales de la spec, tipos compartidos). Ver
  sección "Formas de datos" abajo — es el archivo más importante para el
  dev, léelo primero.
- `src/lib/estilos-boton.ts` — clase Tailwind del botón/enlace de acción
  principal (verde WhatsApp), compartida entre la home y el submit del
  registro.
- `src/components/registro/aviso-consentimiento.tsx` — Server Component,
  aviso simplificado + checkbox de consentimiento. Sin `<a>`/`<Link>`
  (verificado con `grep`).
- `src/components/registro/campo-honeypot.tsx` — Server Component, campo
  trampa anti-abuso.
- `src/components/registro/boton-enviar.tsx` — Client Component
  (`useFormStatus`), botón de envío con estado "Enviando...".
- `src/components/registro/formulario-registro.tsx` — Client Component
  (`useActionState`), el formulario completo: los 10 campos + checkbox,
  ejemplo dinámico de "¿Qué ofreces?", errores por campo, foco en el primer
  error.
- `src/app/registro/accion-mock.ts` — **Server Action MOCK**, marcada con un
  bloque de comentario grande al inicio. El dev la reemplaza (ver abajo).
- `src/app/registro/page.tsx` — página `/registro`.
- `src/app/registro/gracias/page.tsx` — pantalla de gracias.

## Archivos modificados

- `src/app/page.tsx` — agrega el enlace "Registra tu negocio gratis" a
  `/registro` con la clase de `estilos-boton.ts`.
- `openspec/changes/agregar-formulario-registro/tasks.md` — marcadas `[x]`
  las tareas 5, 6, 11, 12, 13 y 16 (con nota de archivo/deuda en cada una).

`npm run lint` y `npm run build` pasan limpios. **No toqué**
`tests/layout.test.ts` (ni la lista blanca de hrefs ni nada más).

## La Server Action es un MOCK — qué hace y qué no

`src/app/registro/accion-mock.ts` tiene un bloque de comentario al inicio
que lista exactamente qué debe reemplazar el dev (tasks.md #7, #8, #9, #14):
honeypot real, límite por IP, `normalizarWhatsapp` real (`src/lib/whatsapp.ts`,
tarea 2 — aquí hay una copia simplificada solo para la demo, **no** es la
función real del hallazgo M1), el módulo de validación real (tarea 3),
consulta de duplicado contra Prisma + captura de la unicidad, creación del
negocio con `ESTADO_NEGOCIO_DEFAULT`/`ORIGEN_NEGOCIO_DEFAULT` de
`src/lib/negocio.ts` y `consintioAvisoEn` puesto por el servidor.

Lo que el mock sí demuestra funcionando end-to-end: los 4 estados del
formulario (vacío, error por campo, enviando, éxito), el mensaje de
duplicado (con el número ficticio `7719990000` de
`WHATSAPP_MOCK_DUPLICADO`), el honeypot (finge éxito sin guardar), y el
`redirect` a `/registro/gracias` (patrón POST-Redirect-GET).

**Import directo, no prop:** `formulario-registro.tsx` importa
`registrarNegocioMock` directamente de `@/app/registro/accion-mock`
(patrón estándar de Server Actions — se pueden importar en un Client
Component). Cuando el dev tenga la acción real, probablemente la mueva a
`src/lib/registro/accion.ts` o similar; solo hay que actualizar ese import
en `formulario-registro.tsx`, la firma (`(prevState, formData) =>
Promise<EstadoAccionRegistro>`) debe conservarse para que `useActionState`
siga funcionando.

## Formas de datos que esperan los componentes (contrato para el dev)

Todo vive en `src/lib/mock/agregar-formulario-registro.ts`:

```ts
type CategoriaCatalogo = { id: number; nombre: string; slug: string };
type ColoniaCatalogo   = { id: number; nombre: string; slug: string };
// → reemplazar CATEGORIAS_MOCK/COLONIAS_MOCK por
//   prisma.categoria.findMany() / prisma.colonia.findMany() (mismo shape).

type CamposFormularioRegistro = {
  nombre: string;
  categoriaId: string;          // FormData siempre trae strings
  whatsapp: string;
  coloniaId: string;            // id de catálogo en texto, o COLONIA_OTRA_VALOR ("otra")
  coloniaOtra: string;
  queOfreces: string;
  entregaADomicilio: boolean;
  telefonoFijo: string;
  direccion: string;
  horario: string;
  facebookUrl: string;
};

type ErroresFormularioRegistro = Partial<Record<
  keyof CamposFormularioRegistro | "consentimiento" | "general", string
>>;

type EstadoAccionRegistro = {
  errores: ErroresFormularioRegistro;
  valores: CamposFormularioRegistro;
};
```

- `EstadoAccionRegistro` es el contrato exacto que `useActionState` espera
  de vuelta. La Server Action real DEBE devolver este shape en el camino de
  error (no lanzar, no `throw`) y hacer `redirect("/registro/gracias")` en
  el camino de éxito.
- `errores.general` está reservado para "No pudimos guardar tu registro..."
  (falla de servidor/DB) — el formulario ya lo pinta arriba de todo si
  llega con texto; nadie más lo usa todavía.
- `COLONIA_OTRA_VALOR = "otra"` es el valor centinela del `<option>` "Otra"
  del select de colonia — nunca choca con los ids 1–21 del catálogo.
- `MENSAJES_ERROR_REGISTRO`, `MENSAJE_GRACIAS`, `TEXTO_AVISO_PRIVACIDAD`,
  `TEXTO_CONSENTIMIENTO` y `LIMITES_LONGITUD` **no son mock**: son texto
  literal aprobado en la spec / la tabla de design.md §3. Reutilízalos tal
  cual en el módulo real de validación (tarea 3) en vez de copiarlos a mano.
- `EJEMPLOS_QUE_OFRECES` (`Record<slugCategoria, string>`) y
  `EJEMPLO_QUE_OFRECES_GENERICO`: los de `servicios-del-hogar` y
  `clubes-y-escuelas-deportivas` son literales; los otros 6 son propuesta
  mía (ver "Copy propuesto" abajo). Están en el archivo mock por
  conveniencia, pero es contenido real — la tarea 4 de `tasks.md` (módulo
  propio en `src/lib/`) sigue pendiente; puedes mover este `Record` tal
  cual a ese módulo.

`FormularioRegistro` (`src/components/registro/formulario-registro.tsx`)
recibe:

```ts
{
  categorias: CategoriaCatalogo[];
  colonias: ColoniaCatalogo[];
  honeypot: ReactNode; // <CampoHoneypot /> ya renderizado
  aviso: ReactNode;    // <AvisoConsentimiento /> ya renderizado
}
```

`honeypot` y `aviso` se pasan ya renderizados desde `page.tsx` (Server
Component) para que ese contenido (sobre todo el texto largo del aviso) no
viaje en el bundle de JS del cliente.

## Decisión de arquitectura que el dev debe conocer: todo el formulario es Client Component

`design.md §1` dice que el JS de cliente debe acotarse al campo "¿Qué
ofreces?"+categoría y al botón de envío. Pero también dice que los errores
se devuelven "con el helper de estado de acción de esta versión de
Next.js" — eso es `useActionState`, y `useActionState` **requiere que el
componente que define el `<form>` sea Client Component**. No until existe
una forma de usar ese helper solo en un sub-árbol sin que el padre también
sea cliente. Terminé con `formulario-registro.tsx` completo como Client
Component en vez de dos piezas mínimas.

Sigue funcionando sin JavaScript (verificado contra la documentación de
Next en `node_modules/next/dist/docs/01-app/02-guides/forms.md`: los
`<form action={serverAction}>` de React/Next hacen un POST real y
progresivamente se mejoran con JS; sin JS, el navegador hace la petición
normal y la respuesta re-renderiza la página con el nuevo `state`). Lo que
sí depende de JS, tal como pide la spec, es *solo*:
- el cambio instantáneo del ejemplo de "¿Qué ofreces?" sin recargar (sin JS
  cae al ejemplo genérico, que es el comportamiento que la spec pide);
- el texto "Enviando..." del botón.

Si el dev/validador prefiere una arquitectura más estricta (página
Server Component + `redirect` a `/registro?error=...` con los valores en
`searchParams`, sin ningún Client Component para el formulario en sí,
dejando el ejemplo dinámico y el botón como los únicos dos componentes de
cliente), es una alternativa válida que respeta más literalmente la lista
de design.md — lo dejo señalado para que se decida conscientemente en vez
de que la única implementación posible que vi.

## Decisión de UI sin respaldo explícito en la spec: colonia "Otra" siempre visible

La spec no dice si el campo de texto libre de "Otra" debe estar oculto
hasta elegir esa opción. Decidí **no ocultarlo con JS**: si se oculta por
defecto y solo un `onChange` lo revela, alguien sin JavaScript nunca podría
llegar a ese campo — rompería el requirement "El registro funciona sin
JavaScript de cliente" justo para colonia "Otra". Lo dejé siempre visible,
con el rótulo "Si elegiste 'Otra', escribe tu colonia" y sin `required`
(la Server Action valida la regla condicional). Es la solución más simple
que no viola ni el requirement de accesibilidad sin JS ni la lista acotada
de JS de design.md. Si el equipo prefiere ocultarlo/mostrarlo con JS de
todos modos (aceptando que sin JS ese campo quede permanentemente visible
como fallback), es un cambio pequeño en `formulario-registro.tsx`.

## Decisión de UI: errores sin color rojo

`globals.css` dice explícitamente "paleta de una sola vía: neutrales para
todo, verde solo para la acción". No agregué un token de color de error
(evité tentación de usar `text-red-*` de Tailwind) para no contradecir esa
decisión ya tomada en T-002 sin que alguien la revise. Los errores se
marcan con: `aria-invalid` + `aria-describedby` (para lectores de
pantalla), un ícono de texto "⚠" antes del mensaje, `font-semibold`, y un
borde más grueso (`border-2 border-tinta`) en el campo. **Pendiente de
confirmación**: si el equipo de producto/diseño prefiere un rojo de error
real (patrón muy estándar en formularios), hay que decidirlo explícitamente
y agregar un token `--color-error` a `globals.css` con su ratio de
contraste anotado (calculé que `#b91c1c`, rojo Tailwind 700, da 6.5:1 sobre
`fondo` y 5.9:1 sobre `superficie`, ambos AA).

## Copy propuesto que necesita visto bueno

- Botón de envío: **"Registrar mi negocio"** (y "Enviando..." mientras
  procesa). No hay texto literal en la spec para este botón (el literal
  "Registra tu negocio gratis" ya se usa para el enlace de la home, y
  repetirlo en el botón de submit dentro de la misma página sonaba
  redundante/confuso).
- Intro bajo el `h1` de `/registro`: "Llena este formulario en un par de
  minutos, sin cuenta ni contraseña. En cuanto lo revisemos, te contactamos
  por WhatsApp."
- Ayuda bajo el campo de WhatsApp: "Sin espacios ni guiones — nosotros lo
  acomodamos."
- Rótulo del campo de texto libre de colonia "Otra": "Si elegiste 'Otra',
  escribe tu colonia" (la spec no da un literal para este campo).
- Placeholders no normativos: horario "ej. L-S 9am-7pm" (tomado del
  ejemplo del PRD §6.1), dirección "ej. a un lado de la primaria, calle y
  número", Facebook "https://facebook.com/tunegocio".
- 6 de los 8 ejemplos de "¿Qué ofreces?" (`EJEMPLOS_QUE_OFRECES` en el
  mock): restaurantes y fondas, belleza, salud, abarrotes y comercio,
  talleres, otro. Los otros 2 (servicios del hogar, deporte) son literales
  del PRD/spec.
- Enlace de vuelta en la pantalla de gracias: "Volver al inicio".

## Pendientes para el dev (más allá de lo ya marcado en tasks.md)

1. Reemplazar `accion-mock.ts` por la Server Action real (tareas 1, 2, 3,
   7, 8, 9, 14 de `tasks.md`) y actualizar el import en
   `formulario-registro.tsx`.
2. Conectar `page.tsx` a Prisma para los catálogos reales en vez de
   `CATEGORIAS_MOCK`/`COLONIAS_MOCK` (mismo shape, tarea 1).
3. Mover `EJEMPLOS_QUE_OFRECES` a su propio módulo en `src/lib/` si se
   quiere cumplir la tarea 4 literalmente (hoy vive en el archivo mock).
4. **Actualizar `tests/layout.test.ts`** (explícitamente fuera de mi
   alcance, tarea 17): hoy fallan dos tests con mis cambios —
   - la lista blanca de hrefs (solo aceptaba `"/"`, ahora hay `/registro` y
     `/` desde la pantalla de gracias);
   - el test "ningún archivo de `src/` declara 'use client'" (scenario 11
     de `layout-base`), que ya no aplica a `src/app/registro/**` ni a
     `src/components/registro/**` — probablemente haya que acotar ese test
     a los archivos de la capacidad `layout-base` (header, footer, layout,
     home) en vez de todo `src/`.
   Confirmé con `npm test` que son exactamente estas 2 fallas, nada más
   (44 de 46 tests pasan).
5. Revisión manual a 390px/768px/1280px (tarea 19) — diseñé mobile-first a
   390px con una sola columna, controles ≥44px (inputs `py-3`, checkboxes
   `h-5 w-5` dentro de `min-h-11`, botones `min-h-11`) y layout de ancho
   máximo `max-w-3xl` heredado del `<main>` del layout global, pero no
   verifiqué visualmente en navegador (no tengo pipeline de screenshots en
   este entorno).
