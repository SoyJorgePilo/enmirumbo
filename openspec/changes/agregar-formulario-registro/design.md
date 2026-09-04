# Diseño técnico: agregar-formulario-registro

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular lo relativo a Server Actions, formularios y `revalidate`/`redirect`.

## 1. Server Action con formulario nativo, no fetch desde el cliente

El envío se hace con un `<form>` que apunta a una Server Action. Así la validación vive en el servidor por construcción (LFPDPPP: nada se guarda sin pasar por ahí), el formulario funciona sin JS de cliente y no hay que exponer un endpoint público extra. El estado de errores se devuelve a la página con el helper de estado de acción de esta versión de Next.js, re-renderizando el formulario con los valores capturados.

JS de cliente permitido, acotado y justificado:

- el campo "¿Qué ofreces?" y el `select` de categoría, dentro de un componente cliente pequeño que solo cambia el `placeholder`;
- el botón de enviar, para mostrar "Enviando..." y evitar el doble envío.

Todo lo demás (página, aviso, listas del catálogo leídas de la base) es Server Component.

Tras un envío exitoso, la acción hace `redirect` a la pantalla de gracias (patrón POST-Redirect-GET): recargar no reenvía el registro, que es lo que exige el scenario de recarga.

## 2. Pin en mapa: se pospone

La opción "más simple" evaluada era pedir "pega el link de Google Maps de tu ubicación" y extraer las coordenadas de la URL. No funciona en la práctica: lo que la gente comparte desde la app del celular son links cortos (`maps.app.goo.gl/...`) que no contienen coordenadas; resolverlos exige una petición saliente desde el servidor hacia una URL que escribió un desconocido (superficie SSRF, latencia y dependencia de un tercero) por un dato que el PRD §8 considera opcional y secundario — la política por defecto es publicar colonia, no domicilio exacto.

Decisión: en este change no se pide ubicación geográfica. `latitud`/`longitud` siguen existiendo en el modelo (T-001) y quedan nulos; la sede del deporte y las referencias del negocio caben en el campo de dirección o referencias en texto libre (PRD §6.5). Si el admin detecta que el pin importa, entra como ticket propio con su propia solución.

## 3. Normalización del WhatsApp: una sola función, antes de la base (hallazgo M1)

`src/lib/whatsapp.ts` (o equivalente) expone `normalizarWhatsapp(entrada): string | null`:

1. quita todo lo que no sea dígito (espacios, guiones, puntos, paréntesis, `+`);
2. si quedan 12 dígitos y empiezan con `52`, o 13 y empiezan con `521`, quita ese prefijo;
3. devuelve el resultado solo si tiene exactamente 10 dígitos; si no, `null`.

Esa función es la **única** puerta de entrada del número al modelo: el valor persistido siempre es la forma de 10 dígitos, que es lo que hace real la unicidad de la base (hallazgo M1 de T-001, donde el `@unique` solo protegía la cadena exacta). El panel (E3), los seeds y la edición (E8) deben reutilizarla; por eso vive en `src/lib/` y no dentro de la acción.

Cotas de longitud del resto de campos (se aplican en el servidor, valores propuestos; solo el 200 de "¿Qué ofreces?" viene del PRD):

| Campo | Máximo |
| --- | --- |
| nombre | 80 |
| colonia "Otra" (texto libre) | 80 |
| ¿Qué ofreces? | 200 (PRD §6.1) |
| teléfono fijo | 20 |
| dirección o referencias | 200 |
| horario | 100 |
| link de Facebook | 300 |

Todos los textos se recortan de espacios al inicio y al final antes de validar y guardar. El link de Facebook se valida parseando la URL y exigiendo protocolo `http:` o `https:` (rechaza `javascript:`, `data:`, `file:` — hallazgo bajo de T-001); no se restringe el dominio, porque los negocios pegan links de `m.facebook.com`, `fb.me` y perfiles con parámetros.

## 4. Límite por IP: memoria del proceso, explícitamente provisional

El límite de 3 envíos por hora por IP se lleva en un mapa en memoria del proceso, con la IP tomada del encabezado de reenvío de la plataforma. Es suficiente para el MVP (una sola instancia, el volumen esperado son decenas de altas) y no agrega dependencias. Limitaciones que se aceptan a sabiendas: se reinicia con el proceso, no se comparte entre instancias y varios vecinos tras el mismo NAT comparten cupo — por eso el límite es 3/hora y no 1. Cuando se decida la base de producción (E0-3) se puede mover a un almacén compartido.

La "alerta al admin" del PRD §8 se implementa como un registro de advertencia en el log del servidor cuando el conteo de altas del día supera el umbral (parámetro configurable); no hay canal de notificación todavía y no se inventa uno: el aviso real llega con el panel (E3).

## 5. Mensaje de número duplicado y enumeración

Decir "este número ya tiene ficha" permite, en teoría, averiguar si un número dado está registrado. Es un requisito explícito del PRD §6.1 (evita el doble registro y encamina al flujo "Perdí mi enlace"), así que se implementa, con dos mitigaciones: el mensaje solo aparece tras un envío completo y válido, y el límite de 3 envíos por hora por IP acota el barrido. Además el número no se publica en el mensaje ni se revela ningún otro dato de la ficha existente.

La comprobación se hace con una consulta previa por el número **normalizado**, pero la verdad la sostiene la constraint de unicidad: si dos envíos simultáneos pasan la consulta, el error de unicidad de la base se traduce al mismo mensaje de usuario en lugar de reventar como error 500.

## 6. Cliente Prisma de aplicación

Hoy solo existe el cliente de pruebas (`tests/db.ts`). Este change necesita uno para la app: módulo en `src/lib/` con instancia única reutilizada entre recargas en desarrollo (patrón de singleton global), usando el mismo adaptador better-sqlite3 y `DATABASE_URL`. Sin él, cada render abriría una conexión nueva.

## 7. Datos del formulario y repo público

Ningún dato capturado se registra en logs (ni el número, ni el nombre del negocio): los logs solo cuentan eventos y conteos. Los tests usan números ficticios con el prefijo ya establecido en T-001 (`771999xxxx`) y nombres inventados, nunca negocios reales de Tizayuca.
