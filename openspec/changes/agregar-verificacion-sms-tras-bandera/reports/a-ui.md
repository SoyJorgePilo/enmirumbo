# Reporte UI — agregar-verificacion-sms-tras-bandera (T-016)

Etapa UI: construí SOLO la superficie del flujo con la bandera **ENCENDIDA**
(pantalla "Confirma tu número" y sus estados, más los indicios del panel) con
mocks explícitamente separados. El flujo con la bandera apagada (el de hoy)
no lo toqué: no existe ningún `if` de configuración en mi código porque
**nada de lo que agregué se alcanza sin la cookie de paso**, y sin ella la
página responde 404 — el mismo efecto que el fail-safe real, por construcción.
No toqué `prisma/schema.prisma`, `src/lib/verificacion/config.ts`,
`src/lib/verificacion/proveedor.ts`, `src/lib/verificacion/limites.ts`, la
Server Action real de `/registro`, ni ningún archivo de `tests/` — todo eso
es del dev (tasks.md #1–5, #7, #9) y de seguridad-test.

## Archivos creados

Contenido REAL (literales de la spec, no mock — tasks.md #6):

- `src/lib/verificacion/textos.ts` — **todos** los literales de la
  verificación por SMS, incluidos los dos textos del panel (tal como pide la
  tarea 6, no en `admin/textos.ts`; ver "Decisión de arquitectura" abajo).

Componentes REALES (Server Components, sin `"use client"`):

- `src/components/registro/formulario-verificar-codigo.tsx` — el cuerpo de
  la pantalla del código: campo + "Confirmar mi número" en un `<form>`,
  "Reenviar el código" en otro, y la salida "Mejor luego, mi registro ya
  quedó" como `<Link>`. Recibe las dos Server Actions ya ligadas y los
  errores por `props`, no le importa si son mock o reales.
- `src/app/(publico)/registro/verificar/page.tsx` — la página. Lee la
  cookie de paso, `notFound()` si no es válida, arma la explicación con los
  últimos 4 dígitos y pasa los errores de `searchParams` al formulario.

⚠️ MOCK (cada uno con un bloque de comentario grande al inicio que dice
exactamente qué reemplaza el dev):

- `src/lib/verificacion/paso-mock.ts` — la cookie de paso, **sin firmar**
  (el diseño real es HMAC-SHA256 con `VERIFICACION_SMS_SECRETO`,
  `src/lib/verificacion/paso.ts`, tasks.md #8). Sirve para recorrer la
  pantalla de punta a punta en esta etapa.
- `src/app/(publico)/registro/verificar/accion-confirmar-mock.ts` — tres
  códigos mágicos (`123456` confirmado, `000000` vencido, `555555` el
  proveedor falla, cualquier otro no coincide) en vez de
  `puerto.comprobar(...)`.
- `src/app/(publico)/registro/verificar/accion-reenviar-mock.ts` — cooldown
  y tope de 2 reenvíos SÍ son de verdad (viven en la cookie); el cupo por IP
  y el tope diario global NO están simulados.

## Archivos modificados

- `src/app/(publico)/registro/gracias/page.tsx` — ahora es `async` y lee
  `searchParams` (`?verificado=1`, `?agotado=1`) para pintar una línea EXTRA
  arriba del `<h1>` de siempre, que **no cambié ni una palabra**. Sin esos
  parámetros (el caso de hoy y el de la bandera apagada) el HTML es
  idéntico al de antes — lo comparé a mano con `curl`.
- `src/lib/admin/consultas.ts` — **solo tipos**, sin tocar ninguna consulta
  (mismo patrón que `agregar-despublicar-y-borrado-arco`): agregué
  `numeroVerificadoEn?: Date | null` como campo **opcional** a
  `RegistroColaItem` y a `RegistroAdminDetalle`. Opcional a propósito: así
  `obtenerColaDeRevision`/`obtenerRegistroParaPanel` (que hoy no seleccionan
  esa columna, porque no existe) siguen compilando sin cambios, y mientras
  tanto todo degrada al comportamiento de hoy sin etiqueta ni línea nueva.
- `src/components/admin/tarjeta-cola.tsx` — pinta "Número verificado por
  SMS" (mismo estilo de píldora que "Ya estaba publicada, la
  despublicaste") solo si `numeroVerificadoEn` viene presente. Hoy siempre
  `undefined` → el renglón no cambia.
- `src/components/admin/detalle-registro.tsx` — `Dato` ganó un slot `extra`
  opcional (para no romper ningún otro llamado); el de "WhatsApp" lo usa
  para las dos líneas de verificación, con la regla de aparición completa
  (ver "Formas de datos" abajo). `DetalleRegistro` ganó la prop
  `capacidadVerificacionSmsEncendida?: boolean` (default `false`).
  **No toqué `src/app/admin/registros/[id]/page.tsx`**: sin pasar esa prop
  ni ese campo, el detalle de hoy es exactamente el de hoy.
- `openspec/changes/agregar-verificacion-sms-tras-bandera/tasks.md` —
  marcadas `[x]` las tareas 6, 10, 13, 15 y 16, cada una con una nota de qué
  es real y qué falta (mock, prueba automatizada, o conexión del dev). La
  14 queda sin marcar a propósito (ver más abajo). No toqué `tests/` ni
  ninguna otra sección.

`npm run lint` y `npx tsc --noEmit` (con `npx next typegen` corrido antes,
necesario para que exista `PageProps<"/registro/verificar">` y
`PageProps<"/registro/gracias">`) pasan limpios. No corrí `npm test` ni
`npm run build` (instrucción explícita de este turno).

## Cómo lo probé (sin tests, con `curl`)

```
npm run dev -- -p 3711
# cookie mock (sin firmar, base64url de JSON):
node -e 'const p={negocioId:"demo",ultimosCuatroDigitos:"4567",intentos:0,reenvios:0,ultimoEnvioMs:Date.now()};console.log(Buffer.from(JSON.stringify(p)).toString("base64url"))'
```

Verificado por HTTP:

- `/registro/verificar` sin cookie → **404**.
- `/registro/verificar` con cookie válida → 200, con "Confirma tu número",
  "...termina en 4567", la frase de tranquilidad y los 3 controles.
- `POST` con `codigo=123456` → `303` a `/registro/gracias?verificado=1`,
  que pinta "¡Listo! Ya confirmamos tu número." arriba del mensaje de
  siempre.
- `POST` con `codigo=000000` (vencido), `222222` (no coincide) y `555555`
  (proveedor falla) → cada uno vuelve a `/registro/verificar?error=...` con
  su literal exacto junto al campo (confirmado leyendo el HTML/RSC).
- `codigo=1234` (incompleto) → `?error=incompleto`, sin sumar intento.
- 5º intento fallido → `303` a `/registro/gracias?agotado=1` ("Ya lo
  intentaste varias veces...") y `Set-Cookie` que borra la cookie de paso.
- Reenviar antes de 60 s → `?errorReenvio=espera-reenvio`; reenviar con
  `reenvios=2` ya usados → agota igual que los intentos, mismo destino y
  mensaje.
- `POST` a las dos acciones **sin cookie** → 404 en ambas (no delatan si
  el registro existe).
- `?error=cupo` / `?errorReenvio=cupo` visitados directo → pintan "Ya
  pedimos varios códigos desde aquí..." (estado no simulado en el mock, ver
  arriba, pero la pantalla ya sabe pintarlo).
- `/registro/gracias`, `/registro/gracias?verificado=1` y
  `/registro/gracias?agotado=1` → confirmé que el `<h1>` con el mensaje del
  PRD §6.1 es **byte por byte el mismo** en los tres casos; solo cambia si
  hay una línea extra arriba.

## Formas de datos que esperan los componentes (contrato para el dev)

### `FormularioVerificarCodigo`

```ts
type ErrorFormularioVerificar = "incompleto" | "no-coincide" | "vencido" | "proveedor";
type ErrorReenvioVerificar = "espera-reenvio" | "cupo";

type FormularioVerificarCodigoProps = {
  accionConfirmar: (formData: FormData) => void | Promise<void>;
  accionReenviar: (formData: FormData) => void | Promise<void>;
  errorCodigo?: ErrorFormularioVerificar;
  errorReenvio?: ErrorReenvioVerificar;
};
```

`accionConfirmar`/`accionReenviar` son Server Actions ya listas para usarse
como `action` de un `<form>` — el componente no las liga con `.bind` a
nada, así que la real puede tener la firma que necesite (no lee ningún
argumento ligado hoy; si el dev necesita ligar algo, hay que ajustar
`page.tsx`, no el componente). El código de verificación viaja en el campo
`codigo` del `FormData`.

### `RegistroVerificarPage` (contrato de la cookie de paso)

`leerPasoMock` (a reemplazar por la lectura de `paso.ts`) devuelve:

```ts
type PasoVerificacionMock = {
  negocioId: string;
  ultimosCuatroDigitos: string; // los 4 últimos del WhatsApp, NUNCA el número completo
  intentos: number;   // códigos escritos que no coincidieron/vencieron (máx. 5)
  reenvios: number;   // reenvíos ya pedidos (máx. 2)
  ultimoEnvioMs: number;
};
```

El dev reemplaza `paso-mock.ts` por `paso.ts` (cookie firmada,
`VERIFICACION_SMS_SECRETO`) conservando esta misma forma — `page.tsx` y las
dos acciones ya están escritas contra ella, así que en teoría solo cambia
el import y el archivo entero de `paso-mock.ts` desaparece.

### Panel — `TarjetaCola` / `DetalleRegistro`

```ts
// src/lib/admin/consultas.ts (tipos ya extendidos; consulta real pendiente,
// tasks.md #1 y #16/#15)
type RegistroColaItem = {
  // ...campos existentes...
  numeroVerificadoEn?: Date | null; // NUEVO — hoy siempre undefined
};
type RegistroAdminDetalle = {
  // ...campos existentes...
  numeroVerificadoEn?: Date | null; // NUEVO — hoy siempre undefined
};
```

- `TarjetaCola` sigue recibiendo `RegistroColaItem` completo por spread
  (`<TarjetaCola {...registro} />`, **sin tocar** `cola/page.tsx`): en
  cuanto `obtenerColaDeRevision` seleccione `numeroVerificadoEn`, la
  etiqueta aparece sola.
- `DetalleRegistro` ahora es:
  ```ts
  { registro: RegistroAdminDetalle; capacidadVerificacionSmsEncendida?: boolean }
  ```
  El dev pasa `capacidadVerificacionSmsEncendida={leerConfigVerificacionSms().encendida}`
  (o como se llame `config.ts`, tasks.md #3) desde
  `src/app/admin/registros/[id]/page.tsx` cuando esa pieza exista. Mientras
  tanto, **no toqué esa página**: sin la prop, el detalle de hoy no cambia.
  La regla de aparición (los tres casos de la spec) ya vive dentro del
  componente, no hay que replicarla en el dev.

## Decisión de arquitectura: los textos del panel viven en `verificacion/textos.ts`, no en `admin/textos.ts`

`tasks.md` #6 pide explícitamente "todos los literales de la spec... y los
dos textos del panel" en `src/lib/verificacion/textos.ts` — una sola fuente
para las dos superficies (pública y panel), en vez de repartir la
verificación por SMS entre dos módulos de texto. Seguí la tarea al pie de
la letra. La tarea 14 ("Agregar a `src/lib/admin/textos.ts` los dos
literales del detalle y el de la cola") queda **sin marcar** a propósito:
los tres literales (`ETIQUETA_COLA_NUMERO_VERIFICADO_SMS`,
`TEXTO_SIN_VERIFICAR_SMS`, `textoNumeroVerificadoSms`) ya existen, pero en
el otro archivo. Si `tests/admin-textos.test.ts` (todavía no escrito) los
espera importables desde `admin/textos.ts`, la solución más simple es un
`export { ... } from "@/lib/verificacion/textos"` ahí — no duplicar el
contenido. Lo dejo anotado para que el dev o seguridad-test lo decida con
la prueba delante, en vez de que yo adivine la ubicación que la prueba va a
exigir.

## Decisión de UI sin respaldo explícito en la spec

1. **"Vencido" y "no-coincide" SÍ suman un intento de los 5; "el proveedor
   falla" y "código incompleto" NO.** La spec dice "máximo 5 códigos
   escritos" sin aclarar si un código vencido o una falla del proveedor
   cuentan como "escrito". Mi lectura: un código que sí se probó contra el
   proveedor (coincida o no, esté vencido o no) gastó un intento; una falla
   del proveedor o un campo que ni se le mandó (incompleto) no es culpa del
   dueño y no debería consumir sus 5 intentos. **Necesita confirmación del
   dev al escribir `accion-confirmar.ts` real (tasks.md #11)** — es una
   decisión de negocio, no solo de UI, y el mock la implementa así por
   defecto.
2. **"Mejor luego, mi registro ya quedó" es un `<Link>` (GET), no un
   `<form>`/botón.** La spec la llama "una salida", distinta de los dos
   "botones" que sí lista antes; y no marca ningún estado ni manda ningún
   dato, así que no necesita ser una Server Action. Mismo criterio que
   "Volver al inicio" en la pantalla de gracias existente.
3. **Estilo del campo de código**: centrado, texto grande (`text-2xl`) con
   `tracking-[0.5em]` para que los 6 dígitos se lean como un código, no como
   texto libre — no hay literal de spec sobre el estilo visual, solo sobre
   el rótulo y el teclado numérico (`inputMode="numeric"`,
   `autoComplete="one-time-code"` para el autocompletado de SMS del
   celular, que no requiere JavaScript).
4. **Orden de los estados en `/registro/gracias`**: si algún día llegaran
   `?verificado=1` y `?agotado=1` juntos (no debería pasar con el flujo
   real: son mutuamente excluyentes), el componente pinta las dos líneas,
   verificado primero. No hay guarda contra esa combinación imposible —
   dejo la nota por si el dev prefiere una.
5. **Nombre de la cookie mock**: `nu_verificacion_paso_mock`, con el mismo
   prefijo neutro `nu_` que `nu_reporte_borrador` (no delata de qué se
   trata a quien mire las cookies del navegador). El dev puede llamar a la
   real como prefiera; no hay literal de spec para el nombre.

## Copy — todo es literal de la spec

No propuse copy nuevo: los 16 literales de `verificacion/textos.ts` son
citas textuales de los deltas de `registro-negocio` y `revision-admin`, que
revisé carácter por carácter al escribirlos (incluidos los guiones largos
"—" de "Sin verificar — confirma..." y los signos de apertura "¿"/"¡"). El
único texto que no es literal de spec es el `aria-label`/`id` interno de
accesibilidad (`codigo-error`, `id="codigo"`), que no es copy visible.

## Pendientes para el dev (más allá de lo ya anotado en tasks.md)

1. Tareas 1–5, 7, 9 (modelo, config, puerto/adaptador real, límites reales,
   enganche en la Server Action de `/registro`): sin ellas nada de esto
   persiste ni se alcanza desde el flujo real todavía — exactamente el
   estado esperado en esta etapa (la ruta solo se llega hoy con la cookie
   mock puesta a mano).
2. Reemplazar `paso-mock.ts` → `paso.ts` y las dos Server Actions `-mock` →
   reales (ver bloques de comentario en cada archivo mock).
3. Decidir la ubicación de los 3 literales del panel para
   `tests/admin-textos.test.ts` (ver "Decisión de arquitectura" arriba).
4. Conectar `RegistroColaItem.numeroVerificadoEn` y
   `RegistroAdminDetalle.numeroVerificadoEn` en las consultas reales
   (tasks.md #1, #15, #16), y pasar `capacidadVerificacionSmsEncendida` a
   `<DetalleRegistro>` desde `src/app/admin/registros/[id]/page.tsx`.
5. **Tests**: no toqué nada en `tests/` (fuera de mi alcance). Faltan, como
   mínimo: comparación carácter por carácter de `verificacion/textos.ts`
   (tarea 6), el fail-safe completo (tarea 17), la suite adversarial
   (tarea 18, incluida la de "código como arreglo, con espacios, con letras
   o larguísimo" — mis Server Actions mock ya validan con
   `/^\d{6}$/.test(codigo)` y descartan `File`s colados con
   `typeof enviado === "string"`, pero no hay prueba automatizada), la de
   no fuga (tarea 19) y sumar la ruta a `tests/layout.test.ts` y al listado
   de `noindex` (tarea 20) — confirmé a mano que **no** agregué la ruta al
   sitemap (`src/app/sitemap.ts` no la lista, igual que `/registro/gracias`).
6. Revisión visual a 390/768/1280px (tasks.md #24): diseñé mobile-first a
   390px reutilizando los patrones ya verificados del resto del sitio
   (`CLASE_BOTON_PRIMARIO`/`SECUNDARIO`, `min-h-11`, `border-borde-control`),
   pero no lo verifiqué en un dispositivo real ni con capturas de pantalla
   — no tengo ese pipeline en este entorno.
7. Ninguno de los textos que agregué menciona el nombre de marca
   ("NecesitoUno"/"EnMiRumbo"): los literales de la spec no lo necesitan.
   Si el dev agrega algún texto nuevo alrededor de esto (p. ej. un mensaje
   de WhatsApp), recordar que debe decir "EnMiRumbo" (rebrand T-019, ya
   aprobado) aunque el resto del código existente (`mensajeVerificacion`
   en `admin/textos.ts`) todavía diga "NecesitoUno" — no lo toqué, es
   territorio de T-019.
