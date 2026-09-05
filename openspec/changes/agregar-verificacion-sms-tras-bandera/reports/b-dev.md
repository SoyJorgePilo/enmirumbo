# Reporte DEV — agregar-verificacion-sms-tras-bandera (T-016)

Etapa B (dev). Las 24 tareas de `tasks.md` quedan en `[x]` (la 14 **corregida**
y la 24 **parcial**, las dos explicadas abajo). Ticket
`docs/tickets/T-016-verificacion-sms.md` movido a **`en-desarrollo`**.

## 0. Lo primero: el merge de `origin/main`

La rama nació de un `main` viejo. Se hizo `git stash -u` del trabajo de la
etapa UI, `git merge origin/main` (fast-forward hasta `2afb540`, con T-014,
T-018 y el rebrand a EnMiRumbo) y `git stash pop`. **Dos conflictos**, los dos
puramente aditivos, resueltos conservando lo de `main` y sumando lo de la
etapa A encima:

- `src/components/admin/tarjeta-cola.tsx` — `TarjetaColaProps` con `tipo` y
  `hrefDetalle` (de `main`, T-014) **más** `numeroVerificadoEn` (etapa A).
- `src/lib/admin/consultas.ts` — `RegistroColaItem` con los dos campos de
  T-014 **más** el de T-016.

Nada de lo de `main` se perdió y ningún literal de marca se tocó: los textos
de la etapa A ya decían "EnMiRumbo". El índice se dejó limpio (`git reset`
tras marcar la resolución): el árbol sigue con todo sin commitear, como espera
el validador.

Entorno: `npm ci`, `npx prisma generate`, `npx next typegen`, base propia con
`npx prisma dev --name t016` → **puerto 51250** (sombra 51251), escrito en el
`.env` del worktree. No se tocó 51214 ni ninguna base ajena.

## 1. Qué se construyó

### Modelo
- `prisma/schema.prisma`: `numeroVerificadoEn DateTime?` en `Negocio`.
- `prisma/migrations/20260909000000_agrega_verificacion_sms/migration.sql`:
  un solo `ADD COLUMN` nulable y sin default. Ningún `UPDATE`, ningún
  `DROP CONSTRAINT`.

### Módulos nuevos en `src/lib/verificacion/`
| Archivo | Qué es |
|---|---|
| `config.ts` | El fail-safe. Única puerta a las cinco variables + el tope diario. |
| `proveedor.ts` | El puerto (`iniciar`/`comprobar`), `aE164` y el adaptador **simulado**. |
| `proveedor-twilio.ts` | El adaptador real (API REST de Verify por `fetch`). |
| `limites.ts` | Cupo de códigos por IP (contador propio) y tope diario global que **corta**. |
| `paso.ts` | La cookie de paso firmada con HMAC-SHA256. |
| `flujo.ts` | Toda la regla: pedir código, confirmar, reenviar. Sin nada de Next dentro. |
| `acciones.ts` | Lo que hacen las dos Server Actions (cookies + redirect), con deps inyectadas. |
| `textos.ts` | (de la etapa A) los 16 literales, incluidos los tres del panel. |

### Rutas y superficies
- `src/app/(publico)/registro/accion.ts`: pide el código **después** de que la
  ficha quedó escrita, y redirige a `/registro/verificar` o a
  `/registro/gracias`.
- `src/app/(publico)/registro/verificar/{page.tsx,accion-confirmar.ts,accion-reenviar.ts}`.
  Los tres archivos `-mock` de la etapa A **borrados**.
- `src/lib/admin/consultas.ts`: la columna entra en la cola (solo renglones de
  alta) y en el detalle.
- `src/app/admin/registros/[id]/page.tsx`: pasa
  `capacidadVerificacionSmsEncendida={verificacionEncendida()}`.
- `.env.example` (bloque nuevo) y `docs/despliegue.md` §11.

## 2. Mapa scenario → prueba

### `registro-negocio` · "La verificación por SMS solo existe si está encendida y completamente configurada" (el requirement rey)

| Scenario | Dónde se prueba |
|---|---|
| sin configuración, el sitio de hoy | `verificacion-failsafe.test.ts` › "un envío válido guarda la ficha y no pide ningún código" |
| la ruta del código no existe con la capacidad apagada | `verificacion-failsafe.test.ts` › "sin ninguna variable responde no encontrado" + "responde igual aunque alguien traiga una cookie de paso puesta" |
| configuración a medias | `verificacion-config.test.ts` › "sin %s la capacidad queda apagada y avisa qué falta"; `verificacion-failsafe.test.ts` › "con la configuración a medias (falta %s) sigue sin existir" |
| apagar la bandera devuelve el flujo de siempre | `verificacion-failsafe.test.ts` › "con las credenciales puestas pero sin bandera, no hay capacidad ni advertencia" |
| nada nuevo en el HTML con la capacidad apagada | `verificacion-failsafe.test.ts` › "la pantalla de gracias es la de siempre…", "el formulario de registro no gana ni un campo…", "la cola y el detalle del panel no mencionan la verificación"; `verificacion-panel.test.ts` › "sin fecha y con la capacidad apagada…" (compara HTML **idéntico**) |
| la suite no llama a la red ni pide credenciales | `verificacion-proveedor.test.ts` (todo el archivo, `fetch` inyectado) + `verificacion-failsafe.test.ts` › "no se construye el adaptador del proveedor ni se pide nada a la red" |

### `registro-negocio` · "Con la bandera encendida, el registro se guarda antes de pedir el código"

| Scenario | Dónde se prueba |
|---|---|
| el registro existe aunque el SMS no salga | `verificacion-flujo.test.ts` › "si el proveedor responde %s, el registro queda igual y no hay paso" |
| el dueño abandona la pantalla del código | `verificacion-flujo.test.ts` › "con todo en orden…" (la ficha queda en `en_revision` sin marca) + `verificacion-paso.test.ts` › caducidad de 15 min |
| el alta no cambia por la bandera | `verificacion-failsafe.test.ts` › "un envío válido guarda la ficha…" vs. `verificacion-flujo.test.ts` › "con todo en orden…" |
| el proveedor tarda demasiado | `verificacion-proveedor.test.ts` › "la espera está acotada: la petición lleva su señal de aborto" + "toda excepción del SDK/red se convierte en 'error'" |

### `registro-negocio` · "La pantalla 'Confirma tu número'…"

| Scenario | Dónde se prueba |
|---|---|
| código correcto | `verificacion-acciones.test.ts` › "el código correcto lleva a gracias…"; `verificacion-flujo.test.ts` › "el código correcto escribe la fecha y NO publica la ficha" |
| código equivocado | `verificacion-flujo.test.ts` › "un código que no coincide deja la ficha sin verificar" |
| código incompleto | `verificacion-flujo.test.ts` › "el campo %j ni siquiera llega al proveedor"; `verificacion-acciones.test.ts` › "un campo incompleto no llega al proveedor ni gasta intento" |
| se acaban los intentos | `verificacion-acciones.test.ts` › "al quinto fallo va a gracias con el aviso…" |
| reenviar demasiado pronto | `verificacion-acciones.test.ts` › "antes de los 60 segundos responde con el aviso de espera…" |
| salir por su propio pie | `layout.test.ts` › revisión de enlaces de `htmlVerificar` (la salida lleva a `/registro/gracias`, que no marca nada) |
| la pantalla no se abre de a gratis | `verificacion-adversarial.test.ts` › las dos tablas de 8 cookies hostiles (pantalla y acciones) |
| sin JavaScript de cliente | `verificacion-failsafe.test.ts` › "la pantalla del código y su formulario no son Client Components" |
| verificar no publica | `verificacion-flujo.test.ts` › "el código correcto escribe la fecha y NO publica la ficha"; `verificacion-panel.test.ts` › "una ficha verificada sigue en revisión y sin publicar" |
| **literales de la pantalla** | `verificacion-textos.test.ts` (19 casos, carácter por carácter) |

### `registro-negocio` · "El canal de SMS cuesta dinero…"

| Scenario | Dónde se prueba |
|---|---|
| cupo por IP agotado | `verificacion-limites.test.ts` › "deja pasar tres códigos en una hora y corta el cuarto"; `verificacion-flujo.test.ts` › "con el cupo por IP agotado el registro se guarda igual y no hay paso"; `verificacion-acciones.test.ts` › "con el cupo por IP agotado responde 'cupo'…" |
| los cupos no se comparten | `verificacion-limites.test.ts` › los tres casos del describe "los tres cupos por IP son independientes" (en las dos direcciones) |
| tope diario alcanzado | `verificacion-limites.test.ts` › "deja iniciar hasta el tope y a partir de ahí corta" + "deja UNA alerta en el log"; `verificacion-flujo.test.ts` › "con el tope diario alcanzado…" |
| no se puede pedir un SMS sin registro | `verificacion-adversarial.test.ts` › describe "no hay forma de mandar un SMS a un número suelto" |
| sin encabezado de IP declarado | `verificacion-limites.test.ts` › "sin IP … el cupo simplemente no aplica"; `verificacion-adversarial.test.ts` › "no se confía en ningún encabezado y las demás cotas siguen operando" |

### `registro-negocio` · "Ni el código ni las credenciales aparecen en URLs, logs ni pantallas"

| Scenario | Dónde se prueba |
|---|---|
| nada sensible en la URL | `verificacion-acciones.test.ts` › "con %s vuelve a la pantalla con su código de error, y nada más"; `verificacion-adversarial.test.ts` › "el código nunca vuelve en la URL, pase lo que pase" |
| nada sensible en el log | `verificacion-adversarial.test.ts` › "una verificación completa no escribe nada sensible en el log"; `verificacion-proveedor.test.ts` › "ni el código ni las credenciales se escriben en el log"; `verificacion-config.test.ts` › "la advertencia nombra la variable, nunca el valor…" |
| el error del proveedor no se filtra | `verificacion-flujo.test.ts` › "un error del proveedor se traduce a un desenlace propio, sin detalles" |
| el código no se guarda en casa | `verificacion-modelo.test.ts` › "no existe ninguna columna donde se guarde un código"; `verificacion-adversarial.test.ts` › "no hay ninguna columna, archivo ni memoria donde viva un código" |

### `registro-negocio` MODIFIED · "Una sola ficha por número de WhatsApp"

| Scenario | Dónde se prueba |
|---|---|
| número con ficha publicada / en revisión — sin SMS | `verificacion-adversarial.test.ts` › "un envío rechazado por duplicado no provoca ningún SMS" |
| el formulario no sirve para mandarle mensajes a un tercero | idem + `verificacion-flujo.test.ts` › "sin ficha detrás … no se manda ningún SMS" |
| el reenvío conserva la verificación del número | `verificacion-modelo.test.ts` › "aprobar, despublicar, rechazar y reenviar no tocan la fecha"; `verificacion-flujo.test.ts` › "una ficha ya verificada no vuelve a pedir código" |
| el cliente no puede fijar la verificación | `verificacion-adversarial.test.ts` › describe "el cliente no puede marcar su ficha como verificada" (alta y reenvío) |
| los demás scenarios (constancia, reaceptación, carreras…) | siguen cubiertos por `registro-reenvio.test.ts` y `aviso-version-seguridad-adversarial.test.ts`, en verde |

### `registro-negocio` MODIFIED · "El envío exitoso encola…" y "El embudo…"

| Scenario | Dónde se prueba |
|---|---|
| registro exitoso (con y sin la capacidad) | `verificacion-failsafe.test.ts` + `verificacion-flujo.test.ts` › "con todo en orden…" |
| el cliente no puede autopublicarse | `registro-accion.test.ts` (ya existía) + `verificacion-adversarial.test.ts` |
| recarga tras el éxito | `registro-pagina.test.ts` › "no tiene ningún formulario que se pueda reenviar al recargar" |
| falla al guardar | `registro-accion.test.ts` (ya existía; sin ficha, no se pide código) |
| la pantalla del código no agrega eventos / abandonar no cuenta | `verificacion-failsafe.test.ts` › "la pantalla del código y su formulario no son Client Components"; consecuencia documentada en `docs/despliegue.md` §11.4 y probada en `verificacion-despliegue.test.ts` |

### `revision-admin` MODIFIED

| Scenario | Dónde se prueba |
|---|---|
| renglón con el número verificado | `verificacion-panel.test.ts` › "la etiqueta aparece SOLO en la ficha verificada, sin cambiar el orden" |
| la cola del lanzamiento no cambia | `verificacion-panel.test.ts` › "sin fichas verificadas ningún renglón menciona la verificación" |
| registro con el número verificado | `verificacion-panel.test.ts` › "con fecha, la línea aparece SIEMPRE…" |
| registro sin verificar con la capacidad encendida | `verificacion-panel.test.ts` › "sin fecha y con la capacidad encendida…" |
| el detalle del lanzamiento no cambia | `verificacion-panel.test.ts` › "sin fecha y con la capacidad apagada…" (HTML byte a byte igual al de hoy) |
| la verificación no se borra al apagar la bandera | mismo test, bucle `[true, false]` |
| verificar no adelanta la decisión | `verificacion-panel.test.ts` › "una ficha verificada sigue en revisión y sin publicar" |

### `modelo-datos` ADDED

Los siete scenarios están en `tests/verificacion-modelo.test.ts`; el de
"migración sobre una base con datos" se refuerza en
`tests/modelo-migraciones.test.ts` (la fila vieja nace con
`numeroVerificadoEn` nulo) y en `tests/aviso-version.test.ts` (ninguna
migración escribe datos).

### `despliegue` ADDED

Los cinco scenarios están en `tests/verificacion-despliegue.test.ts`.

### Verificado a mano (no automatizable)

- **Contraste AA real y áreas táctiles medidas en dispositivo** (tarea 24). El
  guardián `responsivo-guardian.test.ts` revisa el HTML servido de las seis
  pantallas nuevas (`gracias` ×3, `verificar` ×3) contra las clases que
  impiden colapsar, pero no puede medir contraste ni tamaño físico. Lo que sí
  se puede afirmar: los controles reutilizan `CLASE_BOTON_PRIMARIO/SECUNDARIO`
  y `min-h-11`, ya verificados en el lote visual anterior. **Queda para el PR.**
- **Twilio de verdad.** Ninguna prueba habla con Twilio: el adaptador real se
  ejercita contra un `fetch` inyectado. La comprobación contra la cuenta real
  es el paso 5 de `docs/despliegue.md` §11.2, y es humana por definición
  (requiere el trámite A2P).

## 3. Decisiones técnicas

1. **Sin dependencia nueva: la API REST de Verify, no el SDK `twilio`.** Son
   dos POST con autenticación básica. El SDK son decenas de megas que habría
   que instalar en producción aunque la bandera esté apagada. `fetch` con
   `AbortController` cubre exactamente lo que la spec pide (espera acotada,
   sin reintento, toda excepción traducida a `"error"`) y deja menos
   superficie que auditar. `verificacion-proveedor.test.ts` falla si alguien
   agrega `twilio` al `package.json`.
2. **`proveedorDeVerificacion` es `async` y usa `import()` dinámico.** El
   requirement pide que el adaptador real "no se importe ni se instancie" con
   la capacidad apagada; con un import estático el módulo se evalúa igual. Con
   el dinámico, apagada, ni se toca.
3. **`procesarRegistro` devuelve ahora la ficha afectada** (`FichaRegistrada |
   null`). Es lo que permite decidir si se pide código sin duplicar la lógica
   de "esto fue un alta / un reenvío / un duplicado", y `ficha: null` en el
   campo trampa es *la* garantía de que el formulario no sirve para mandarle
   SMS a un número ajeno. **Costo:** 32 aserciones existentes que comparaban
   la forma exacta (`toEqual({ exito: true })`) pasaron a
   `toMatchObject({ exito: true })` en 9 archivos. Las dos del campo trampa se
   **endurecieron** a `toEqual({ exito: true, ficha: null })`, que es el
   invariante que de verdad importa.
4. **La lógica de las acciones vive en `src/lib/verificacion/acciones.ts`, no
   en los archivos `"use server"`.** En un módulo con esa directiva **todo lo
   exportado es un endpoint** al que el navegador puede llamar con los
   argumentos que quiera; una función que recibe `{ prisma, proveedor }` no
   puede serlo. Los dos `accion-*.ts` son envolturas de tres líneas.
5. **Qué gasta uno de los 5 intentos** (la decisión que la etapa A dejó abierta
   en su reporte, punto 1): **confirmada tal cual**. `no-coincide` y `vencido`
   gastan intento (fue un código que sí se probó contra el proveedor);
   `incompleto` y la falla del proveedor **no** (ni llegó al proveedor, o no es
   culpa del dueño). Vive en `gastaIntento()`, con prueba propia.
6. **Un reenvío que no sale no gasta reenvío.** Si el proveedor falla o el tope
   diario está alcanzado, el dueño vuelve con el aviso de espera y conserva sus
   dos reenvíos. No está escrito en la spec; es la lectura coherente con "el
   dueño no paga las fallas que no son suyas".
7. **El cooldown se comprueba ANTES del cupo por IP.** Así machacar "Reenviar"
   dentro de los 60 s no consume los 3 códigos/hora de esa IP. Hay prueba.
8. **La fecha del panel usa el `FORMATO_FECHA` que ya existe** (`04 sep 2026,
   12:00 p.m.`), no una segunda forma. El requirement lo fija entre paréntesis
   ("la fecha con la misma forma que la constancia del consentimiento"); el
   ejemplo en prosa de la spec ("4 de septiembre de 2026") describe la fecha,
   no un formateador distinto. **Discrepancia menor spec/código heredada de
   T-012**, anotada abajo.
9. **Tarea 14 corregida en `tasks.md`.** Los tres literales del panel se quedan
   en `src/lib/verificacion/textos.ts` (donde los puso la tarea 6) y **no** se
   copian ni se reexportan desde `admin/textos.ts`: dos fuentes para el mismo
   literal es exactamente lo que una comparación carácter por carácter existe
   para evitar. El guardián es `tests/verificacion-textos.test.ts`.
10. **La cookie se llama `nu_paso`**, con el prefijo neutro del resto
    (`nu_panel`, `nu_sobre`, `nu_reporte_borrador`). No dice "sms" ni "codigo":
    quien mire las cookies del navegador no se entera de qué se trata.

## 4. Tests existentes que hubo que tocar (y por qué)

- `registro-pagina.test.ts` y `analitica-privacidad.test.ts`: la pantalla de
  gracias es **`async`** desde la etapa A (lee `searchParams`, que en Next 16
  es una `Promise`). Se resuelven antes de pintar. **Las dos suites estaban en
  rojo al empezar mi etapa por esto**; ahora están en verde.
- `buscador-pagina.test.ts`: `/registro/verificar` sumada a la lista blanca
  exhaustiva de `noindex`.
- `layout.test.ts`: la pantalla del código entra a la revisión de enlaces y a
  la lista de rutas públicas.
- `modelo-migraciones.test.ts`, `aviso-version.test.ts`,
  `buscador-seguridad-adversarial.test.ts`: los tres son guardianes con listas
  exhaustivas (columnas nulas, migraciones del árbol, escritores de `Negocio`);
  se sumó lo de T-016 con su justificación en comentario, sin aflojar ninguna
  aserción.
- `responsivo-guardian.test.ts`: las seis pantallas nuevas.
- `aviso-version-seguridad-adversarial.test.ts`: una fixture de
  `RegistroAdminDetalle` necesitaba el campo nuevo.

## 5. Gates

- `npm run lint` → **limpio**.
- `npx tsc --noEmit` → **limpio**.
- `npm run build` → **verde** (`/registro/verificar` aparece como `ƒ`, dinámica).
- `npm test` → **3498 pasan, 2 skipped, 2 fallan**: únicamente
  `tests/reportes-seguridad-adversarial.test.ts` **[A1]** y **[A2]**, las
  carreras conocidas. Confirmadas intermitentes y ajenas a este change: en tres
  corridas seguidas del archivo aislado dieron 90/90, 90/90 y 88/90. Son de
  T-013 (el servidor local de `prisma dev` multiplexa todas las conexiones
  sobre una sola sesión, así que las carreras de verdad no se pueden montar).

## 6. Deuda y propuestas fuera de alcance

1. **El tope diario se cuenta por proceso**, como los otros cupos en memoria.
   Con varias instancias el gasto real puede ser un múltiplo. Documentado en
   `docs/despliegue.md` §11.4 con la mitigación operativa (poner también un
   límite de gasto en la consola de Twilio). Se paga con E0-3, junto con los
   demás cupos (§10 punto 1 del mismo documento).
2. **Discrepancia menor spec/código en el formato de fecha del panel** (ver
   decisión 8). Si el fundador quiere de verdad "4 de septiembre de 2026",
   hay que cambiarlo **también** en la constancia del consentimiento y en la
   despublicación, o el detalle tendría dos formas de fecha distintas. Es un
   chore de una línea + su prueba, y no es de este change.
3. **Re-verificación al cambiar el número desde el enlace de gestión (T-014).**
   Ahora que las dos capacidades están en el mismo árbol, el punto de
   integración es real y está **abierto**: `src/lib/gestion/ediciones.ts`
   aplica una edición que puede cambiar `whatsapp` y **no limpia**
   `numeroVerificadoEn`. La propuesta lo declara fuera de alcance ("se
   especifica en el change de T-014 o en uno de coordinación"), así que **no lo
   toqué**, pero conviene abrir el ticket antes de encender la bandera: hoy
   una ficha podría quedar marcada como verificada con un número distinto del
   que se verificó. **Con la bandera apagada no hay ninguna ficha verificada,
   así que no es un problema de producción hoy.**
4. **El adaptador real no tiene prueba contra Twilio de verdad**, solo contra
   un `fetch` simulado — misma situación (y misma justificación) que el
   adaptador de Supabase Storage. La red real se comprueba en el paso 5 de
   §11.2.
5. **Propuesta fuera de spec, no implementada:** un contador de SMS enviados
   por día expuesto en el panel, para que el admin vea el gasto sin leer logs.
   Hoy el único canal de la alerta del tope es el log, con el mismo criterio
   que la alerta de altas diarias del PRD §8.
6. **Fixtures y datos:** todos los números son de las series `77199x` /
   `771000x`, los nombres son inventados y las credenciales son literalmente
   "de-mentiras". `verificacion-despliegue.test.ts` falla si alguna vez aparece
   en el repo un SID con la forma real de Twilio (`AC`/`VA` + 32 hex).

## 7. Para la etapa de seguridad y pruebas

Superficie nueva que merece mirada adversarial fresca:

- La **cookie de paso** (`paso.ts`): firma, caducidad, `Path` acotado. Ya hay
  8 formas hostiles probadas; faltaría pensar en el celular compartido.
- El **orden de las cotas** en `flujo.ts` (`pedirCodigo`): cupo por IP → tope
  diario → proveedor. ¿Se puede gastar el tope diario de alguien sin gastar
  cupo propio?
- El **`redirect` a `?verificado=1` / `?agotado=1`**: son banderas de
  presentación sin identificador, pero cualquiera puede visitarlas a mano. No
  marcan ni crean nada (probado), aunque conviene confirmarlo desde fuera.
- La **regla de aparición del detalle**: una ficha verificada muestra su línea
  aunque la capacidad esté apagada. Es lo que la spec pide; vale la pena
  confirmar que no es una vía de fuga hacia superficies públicas
  (`verificacion-modelo.test.ts` ya vigila las proyecciones por código).

---

# Iteración 2 — respuesta al dictamen de la etapa C

Dictamen recibido: **NO PASA** (1 ALTO + 1 MEDIO). **Los dos se corrigieron.**
Mismo worktree, misma base (51250, relevantada), sin tocar git.

## [C-1] ALTO — cambiar el WhatsApp conservaba la marca de verificación · CERRADO

**Corrección** (`src/lib/gestion/ediciones.ts`, dentro de `aplicarEdicion`):
antes de escribir las columnas de la edición, y **dentro de la misma
transacción**, se limpia la marca:

```ts
await tx.negocio.updateMany({
  where: { id: edicion.negocioId, estado: ESTADO_NEGOCIO_PUBLICADO,
           whatsapp: { not: edicion.whatsapp } },
  data: { numeroVerificadoEn: null },
});
```

Se hace con un `where` en lugar de leer-y-comparar, a propósito:

- **solo limpia cuando el número DE VERDAD cambia** — editar el horario no le
  cuesta la verificación a nadie (el auditor dejó esa prueba y sigue verde);
- **no hay ventana** entre la lectura y la escritura;
- lleva las **mismas dos condiciones** que la escritura de la ficha, así que
  una edición que no llega a aplicarse (ficha despublicada entre medias)
  tampoco borra la marca;
- va **antes** de `columnas` porque esa escritura pisa `whatsapp`, y **dentro
  de la transacción**, así que si la edición se revierte
  (`EdicionYaNoPendiente`) la marca vuelve con ella.

Volver a **pedir** código tras el cambio de número sigue fuera de alcance: es
un ticket propio, como decía el reporte C.

**Aserción apretada:** `tests/verificacion-seguridad-adversarial.test.ts`, caso
renombrado a `[C-1 CERRADO] … BORRA la marca del número viejo`. Se retiró la
tolerancia; queda `expect(despues.numeroVerificadoEn).toBeNull()`.

### [C-1b] — el mecanismo de fondo · CERRADO (las dos cosas)

Se hicieron **las dos** que el coordinador ofrecía como alternativa, porque una
sola dejaba el borde cruzable:

1. **Documentada en la lista, con su regla de limpieza**:
   `CAMPOS_PROHIBIDOS_EN_EDICION` ahora nombra `numeroVerificadoEn`, con un
   comentario que distingue "no la puede FIJAR" (lo que la lista vigila) de "sí
   la LIMPIA al cambiar el número" (lo que hace `aplicarEdicion`).
2. **Guardián exhaustivo contra el esquema real** (lo que hace imposible el
   próximo borde): `tests/gestion-modelo.test.ts` estrena
   *"toda columna de Negocio está declarada como editable, derivada o
   prohibida"*, que lee las columnas de `Negocio` **de la base** y exige que
   cada una esté en una de las tres listas de `campos.ts`. Y al revés: ninguna
   lista puede nombrar una columna que ya no existe.

Para que el censo cerrara hubo que declarar lo que nunca se había declarado:
`id`, `latitud` y `longitud` entran a prohibidos, y nace
`COLUMNAS_DERIVADAS_AL_APLICAR` (`nombreNormalizado`, `queOfrecesNormalizado`)
para las que la edición sí escribe pero no vienen del formulario. **A partir de
ahora, agregar una columna a `Negocio` rompe la suite hasta que alguien decida
qué pasa con ella al editar.**

## [C-2] MEDIO — rebobinar la cookie reiniciaba los topes por registro · CERRADO

**Se valoró el mecanismo que sugirió el coordinador y se adoptó tal cual**: el
almacén compartido de cupos (`src/lib/cupos/compartido.ts`, tabla
`IntentoDeCupo`, ventana deslizante, cerrojo consultivo por clave, respaldo en
memoria si la base no responde). Es proporcionado: **sin migración, sin tabla
nueva, sin dependencia nueva**, sobre un mecanismo que la etapa C de T-013 ya
auditó. Lo único distinto es la procedencia: la clave no se deriva de una IP,
sino del **identificador del registro** — que es literalmente "un tope por
registro".

**Lo que cambió, en concreto:**

1. **La cookie dejó de llevar contadores.** `PasoVerificacion` pasó de seis
   campos a tres: `negocioId`, `ultimosCuatroDigitos`, `creadaEnMs`.
   Desaparecieron `intentos`, `reenvios`, `ultimoEnvioMs` y con ellos
   `intentosAgotados`, `reenviosAgotados` y `dentroDelCooldown`. **Rebobinar la
   credencial ya no consigue nada porque no hay nada que rebobinar**: es solo
   una credencial de paso que dice de qué ficha se trata.
2. **Tres cupos nuevos en `src/lib/verificacion/limites.ts`**, todos con clave
   por registro y secreto `VERIFICACION_SMS_SECRETO`:
   `verificacion-intentos` (5 / 15 min), `verificacion-reenvios` (2 / 15 min) y
   `verificacion-cooldown` (1 / 60 s — el cooldown escrito como cupo).
3. **La ventana es la vida de la cookie** (15 min) y viene del mismo sitio:
   `DURACION_PASO_MS = VENTANA_TOPES_POR_REGISTRO_MS`, para que no se puedan
   separar por descuido. Sigue por debajo de `RETENCION_MAXIMA_DE_CUPOS_MS`
   (60 min), que es el invariante que hace segura la limpieza diaria — con
   prueba.
4. **El cooldown lo aparta también el PRIMER envío**, el que sale del
   formulario, para que un reenvío inmediato no se salte la espera.
5. **`ClienteCupos` entra en `ContextoVerificacion`** (`cupos`). Es el mismo
   Prisma; va aparte porque son dos superficies distintas.
6. **La limpieza ya estaba resuelta**: `limpiarCuposCaducados` (tarea diaria,
   §6 del despliegue) es genérica sobre la tabla, así que recoge estas filas
   sin tocar una línea.

**LFPDPPP:** lo que se guarda es un **HMAC del identificador del registro**, no
el identificador, no el número y **no una IP**. La frase del aviso ya publicado
—"la IP… solo en su memoria… No la guardamos en la base de datos"— sigue siendo
cierta palabra por palabra, porque aquí no se guarda ninguna IP.

**Un comportamiento que cambió a propósito, y es un empeoramiento para el
dueño:** *un reenvío que no sale ahora SÍ gasta reenvío*. En la iteración 1 se
devolvía para no castigar al dueño por una falla ajena; con [C-2] a la vista
eso convertía un proveedor caído —o el tope diario alcanzado— en reintentos
gratis e ilimitados contra el canal que cuesta dinero. Entre la comodidad del
dueño y el saldo del fundador se protege el saldo: el dueño conserva su
registro y el admin lo confirma por WhatsApp, que es el flujo completo de
siempre. Está documentado en `flujo.ts` y con prueba propia.

**Aserciones apretadas** en `tests/verificacion-seguridad-adversarial.test.ts`
(el describe se renombró a `[C-2 CERRADO]`):

| Antes (defecto) | Ahora (cerrojo) |
|---|---|
| 15 códigos al proveedor con la cookie del principio | exactamente **5**, y el último destino es `gracias?agotado=1` |
| sin IP declarada, **6 SMS** (el tope diario entero) | exactamente **2**, y el tope diario de 6 ni se roza |
| con IP declarada, 3 SMS (mitigación del cupo por IP) | **2** — manda la cota más estricta, que ahora es la del registro |

**Pruebas nuevas propias:** 8 casos en `tests/verificacion-limites.test.ts`
(contra la base de verdad: agotamiento, independencia entre registros y entre
los tres cupos, liberación de la ventana, y que **lo guardado es una huella de
32 hexadecimales que no contiene el identificador**), más el ataque de
rebobinado reproducido de punta a punta en `verificacion-flujo.test.ts` y en
`verificacion-acciones.test.ts`.

**Fail-safe comprobado otra vez:** con la capacidad apagada **no se escribe ni
una fila** en `IntentoDeCupo` — la puerta del proveedor se cruza antes que
ninguna cota. Test nuevo en `tests/verificacion-failsafe.test.ts`.

## Observaciones del reporte C

- **[O-1] el tope diario se aparta antes de llamar al proveedor** — **sin
  acción, declarada.** Es conforme a la spec ("verificaciones **iniciadas** por
  día") y lo contrario (contar solo los envíos que salieron bien) abre una vía
  para gastar SMS sin tope, que es justo lo que [C-2] acaba de cerrar. La
  consecuencia operativa que señala el auditor —un proveedor caído consume la
  cuota del día— es real y se acepta.
- **[O-2] diferencia de destino con una ficha rechazada ya verificada** —
  **sin acción, declarada.** Exige la bandera encendida, conocer el número y
  que la ficha esté rechazada. Cerrarlo obligaría a mandar a todo el mundo a la
  pantalla del código y luego sacarlo, que es peor producto por menos
  seguridad.
- **[O-3] `esHttps` sale de `x-forwarded-proto`** — **sin acción, declarada.**
  Es **exactamente** el criterio de `sirviendoPorHttps` en
  `src/lib/admin/guarda.ts`, que protege la cookie de sesión del panel (mucho
  más valiosa que esta). Divergir aquí crearía dos reglas para la misma
  decisión. Tras [C-2] la cookie lleva aún menos: ni contadores, ni número, ni
  código. Si algún día se endurece, se endurece en los dos sitios a la vez.
- **[O-4] el mínimo del secreto es de longitud, no de entropía** — **sin
  acción, declarada.** Mismo criterio que `PANEL_SESION_SECRETO`, y
  `.env.example` manda `openssl rand -base64 32`.

## Documentación actualizada

`docs/despliegue.md` §11: la lista de cupos ahora distingue **qué se cuenta en
la base y qué en el proceso**, y la advertencia de §11.4 se corrigió — el tope
diario y el cupo por IP siguen siendo por proceso, pero **los topes por
registro ya no**, así que el techo de lo que un solo registro puede gastar no
se multiplica con las instancias ni se puede rebobinar desde el navegador.

## Archivos tocados en esta iteración

| Archivo | Qué |
|---|---|
| `src/lib/gestion/ediciones.ts` | [C-1]: limpia la marca cuando el número cambia |
| `src/lib/gestion/campos.ts` | [C-1b]: censo completo en tres listas |
| `src/lib/verificacion/limites.ts` | [C-2]: los tres cupos por registro |
| `src/lib/verificacion/paso.ts` | [C-2]: la cookie pierde los contadores |
| `src/lib/verificacion/flujo.ts` | [C-2]: consume los cupos del servidor |
| `src/lib/verificacion/acciones.ts` | [C-2]: deja de reescribir la cookie |
| `docs/despliegue.md` | §11 y §11.4 |
| `tests/gestion-modelo.test.ts` | guardián exhaustivo del censo |
| `tests/verificacion-seguridad-adversarial.test.ts` | 4 aserciones invertidas a cerrojo |
| `tests/verificacion-{limites,paso,flujo,acciones,failsafe}.test.ts` | pruebas nuevas y adaptadas |

## Gates de la iteración 2

- `npm run lint` → **limpio**.
- `npx tsc --noEmit` → **limpio**.
- `npm run build` → **verde**.
- `npm test` → **3542 pasan, 2 skipped, 0 fallan** en la primera corrida
  (incluidas [A1] y [A2], que esta vez salieron verdes); en la segunda,
  **3540 pasan y fallan solo [A1] y [A2]**, las carreras intermitentes
  conocidas y ajenas al change. Total: 123 archivos, +44 casos respecto de la
  etapa C.

---

# Iteración 3 — [C-3] MEDIO cerrado

**Qué era:** al cerrar [C-2] en la iteración 2 metí el cooldown dentro de
`pedirCodigo`, y con eso el tope de 2 reenvíos pasó a apartarse **antes** que
la espera de 60 s. Como el primer toque de "Reenviar" siempre cae dentro del
cooldown —la pantalla se abre segundos después del envío del formulario—, tres
toques impacientes en 40 s gastaban los dos reenvíos del dueño **con cero SMS
enviados**, y el tercero le borraba la credencial de paso y lo echaba a
`gracias?agotado=1` con "Ya lo intentaste varias veces", justo cuando el primer
código podía estar llegándole. Caso normal, no borde.

**Corrección** (`src/lib/verificacion/flujo.ts`), la que indicó la auditoría:
el turno de envío se saca de `pedirCodigo` y lo aparta cada llamador donde le
toca. En `reenviarCodigo` el orden queda **cooldown → tope de 2 reenvíos →
ficha → cupo por IP y tope diario → proveedor**: un clic que no manda SMS ya no
cuesta un reenvío. En `pedirCodigoParaFicha` el turno se sigue apartando en el
primer envío, para que el reenvío inmediato sí choque con la espera.

**No reabre [C-2]:** el cooldown también está anclado en el servidor (1 envío
cada 60 s por registro), así que machacar el botón sigue sin poder provocar más
de un intento por minuto, y **un reenvío que sí llega al proveedor sigue
gastando reenvío, salga bien o mal** — el cerrojo que la auditoría dejó para
esa propiedad sigue en verde.

**Aserciones invertidas** en `tests/verificacion-seguridad-adversarial.test.ts`
(describe renombrado a `[C-3 CERRADO]`): los tres clics dentro del cooldown
responden los tres "Espera un momento para pedir otro código." sin gastar nada
y **sin borrar la credencial**; pasado el minuto el SMS sale, y el tope de 2
reenvíos sigue siendo real (el cuarto envío da `agotado`).

**Residuo declarado, sin acción:** si el cupo por IP (3/hora) está agotado, el
reenvío sí consume un reenvío sin mandar SMS. Es un camino mucho más raro que
[C-3] —exige que ya hayan salido tres códigos desde esa IP en la última hora— y
cerrarlo obligaría a partir `pedirCodigo` en dos. Anotado por si la operación
real lo ve alguna vez.

## Gates de la iteración 3

- `npm run lint` → **limpio**.
- `npx tsc --noEmit` → **limpio**.
- `npm run build` → **verde**.
- `npm test` → **3555 pasan, 2 skipped, 1 falla**: únicamente **[A1]** de
  `tests/reportes-seguridad-adversarial.test.ts`, la carrera intermitente
  conocida y ajena al change ([A2] salió verde). 123 archivos.
