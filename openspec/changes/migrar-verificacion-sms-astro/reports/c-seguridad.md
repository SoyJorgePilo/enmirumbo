# Etapa C · seguridad — migrar-verificacion-sms-astro (T-024, Fase 3b-2)

Worktree `enmirumbo-3b2`, sin commits. Probado contra la salida construida con `tests/fixtures/twilio-falso.mjs` (bloquea todo host externo) y un PostgreSQL 16 desechable del scratchpad (`c3b2sec`, backends independientes; detenido al cerrar). Ningún número real ni Twilio real.

**Veredicto: PASA al validador.** 0 críticos · 0 altos · 2 medios · 6 observaciones.

## Medios

**M1 · Fuerza bruta concurrente: el tope de 5 códigos no aguanta una ráfaga** (preexistente, igual en Next; fuera de alcance por proposal).
`src/lib/verificacion/flujo.ts:201-205`: `intentosDelRegistroAgotados` se pregunta antes de `proveedor.comprobar` y `apuntarIntentoDelRegistro` va después, sin atomicidad. Medido sobre la build con PG real: una ráfaga de **40** códigos equivocados con la misma cookie produce **13** comprobaciones al proveedor; una de **200** produce **184-200** (3 corridas). En la base quedan 5 intentos apuntados. El comentario de `limites.ts` (`apuntarIntentoDelRegistro`: "uno o dos intentos de más contra 10⁶") es falso: la cota real es el tamaño de la ráfaga.
- Explotación: quien registra un negocio con un WhatsApp ajeno recibe la cookie y puede probar N códigos en paralelo para ganar la marca "Número verificado por SMS". Así suplanta a alguien ante el admin.
- Lo mitiga hoy un tercero: Twilio Verify corta en 5 comprobaciones por verificación (429/60202, que `proveedor-twilio.ts:148` traduce a `error` y no cuenta como intento). Con 1 SMS más 2 reenvíos quedan ≈15 intentos por registro contra 10⁶.
- No bloquea porque no lo introduce este change y la proposal lo excluye. Candidato a ticket: apartar el intento de forma atómica ANTES de comprobar (como el reenvío) y devolverlo si el proveedor falla, y corregir el comentario.
- La prueba `plataforma-astro-verificar-adversarial` › "ráfaga de 40 códigos" fija lo medido, con cota de 5 a 40.

**M2 · Prueba intermitente nueva: `tests/plataforma-astro-verificar.test.ts:290` (7 MiB).** En la primera corrida completa de `npm test` venció a los 60 s. Lo reproduje con una sonda temporal (ya borrada):
- con cuerpos de 7 MiB, el emulador **sí responde** (el log trae 100 de 100 POST respondidos);
- pero el cliente `postearComoNavegador` se queda bloqueado esperando `drain` y nunca ve la respuesta;
- frecuencia: 1 de cada 80 en serie y del 20 al 75 % en paralelo, con la bandera encendida y apagada;
- con `/registro?_action=registrar`, que lee todo el cuerpo, no pasa nunca.

Es un artefacto del cliente de prueba y del emulador, no del producto: Vercel corta los cuerpos en 4.5 MB antes de la función, y el servidor sigue vivo. Pero puede poner el CI en rojo. El `enviar200Mb` de `plataforma-astro-verificar-apagada.test.ts:129` usa el mismo patrón. **Lo corrige el dev:** que el ayudante deje de escribir y resuelva con lo que llegó del socket (o con un tope de tiempo por petición), en vez de depender de `drain`.

## Observaciones (bajas, no bloquean)

1. **Reenviar con una cookie vieja después de confirmar o de agotar intentos manda SMS igual.** `flujo.ts:256-278`: `reenviarCodigo` no mira `numeroVerificadoEn`. Son como máximo 2 SMS inútiles por registro en 15 min (unos $0.10). Preexistente; candidato a ticket junto con M1.
2. **Ficha borrada + reenvío escribe 2 filas de cupos** (hallazgo del dev). Hace falta una cookie firmada por el servidor de una ficha propia que el admin después borró. Cada cookie da a lo sumo una fila de espera por minuto y 2 de reenvío durante sus 15 min, y la ventana y la limpieza diaria las purgan. Con eso no hay crecimiento práctico de la tabla ni DoS. Severidad baja; se queda como ticket.
3. **Canal lateral de la bandera.**
   - Cabeceras: idénticas entre apagada y encendida sin cookie (13 B, 64 KiB, 1 MiB y 5 MiB con `Content-Length`).
   - Tiempo: encendida, la Action lee el cuerpo, y eso se ve en local con cuerpos grandes (5 MiB: mediana de 1.2 ms apagada frente a 4.0 ms encendida). Con 13 B, la diferencia está dentro del ruido.
   - No es práctico: la bandera ya es pública por diseño en `/registro`, que con la bandera encendida hace 303 a `/registro/verificar`.
   - El `Cache-Control` frente a `/a/b/c` es la diferencia aceptada por el fundador. No delata la bandera, porque es igual con la bandera encendida y sin cookie.
4. **Presupuesto de SMS ajeno.** El tope diario es global por proceso. Cualquiera lo agota registrando números distintos, y además manda hasta 3 SMS a cada número de terceros. Solo lo frena el cupo de 3 por hora y por IP, y ese cupo solo existe si `REGISTRO_ENCABEZADO_IP` está declarado. Es preexistente y aceptado en T-016 (degrada al flujo manual). **Requisito para encender en producción:** declarar `REGISTRO_ENCABEZADO_IP`. Las IP escritas distinto quedan como el ticket que ya está abierto.
5. **Huecos de las pruebas del dev:**
   - **El de 200 MB no cuenta lecturas reales.** La aserción "cuerpo no se lee / memoria" no detecta quitar la compuerta, porque Astro lee con `readBodyWithLimit` y no con `formData()`. El dev ya lo anotó. Solo lo detecta la prueba del cuerpo a medio llegar.
   - **Nada vigilaba el candado por ruta del middleware.** Me refiero a la condición `routePattern !== entrada.ruta` de `src/astro/acciones.ts:206`. Su mutación sobrevivía a todo lo relacionado, porque cada manejador vuelve a comprobar su ruta. Ahora la cubre mi prueba nueva (ver mutaciones).
6. **Intermitente sin atribuir:** `tests/tareas-programadas.test.ts:137` ("cola vacía" al barrer fotos) falló una vez de tres corridas completas: quedaba 1 `Negocio` de otro archivo. No se reprodujo. Corrí uno por uno los 8 archivos nuevos o tocados de 3b-2 y todos dejan 0 negocios. Se suma a los conocidos [A1]/[A2].

Paridad, sin riesgo: `POST /registro/verificar/?_action=confirmar` (barra final) ejecuta la Action. Es la misma ruta y la cookie viaja igual. `PUT`, `PATCH` y `DELETE` pintan la página sin ejecutar nada.

## Auditoría por punto del encargo

1. **Bandera apagada.** Las variantes `""`, `0`, `true`, `TRUE`, `"1 "`, `" 1"`, `01`, `"1\t"`, `１` y `yes`, con credenciales completas y cookie bien firmada, responden la 404 idéntica a `/loquesea` en GET y en los dos POST. Ninguna llama al proveedor, escribe cupos, toca la ficha ni pone cookies. La configuración a medias da 404 y **una** advertencia que nombra la variable, sin valores. La compuerta (`acciones.ts:212-215`) va antes de `action.handler()`, y la página lee la configuración antes que la cookie (`verificar.ts:145-153`).
2. **Cookie.**
   - Firma: HMAC-SHA256 versionado con comparación en tiempo constante (`paso.ts`).
   - Rechazos: alterada, otro secreto, malformada y caducada dan la misma 404 (prueba del dev, tabla §2.3).
   - Contenido: solo `negocioId`, `ultimosCuatroDigitos` y `creadaEnMs`; ni el número ni el código.
   - Borrado: `nu_paso=; Max-Age=0; Path=/registro/verificar; HttpOnly; SameSite=Lax; Secure`, sin `Domain`.
   - Reusarla tras el éxito: confirmar va a `verificado=1` sin llamar al proveedor (para reenviar, ver la obs. 1).
   - Fijación: no aplica, porque la cookie solo identifica la ficha de quien la recibió.
3. **Actions.**
   - Regla de origen: `null`, ajeno, sufijo `127.0.0.1.evil…`, otro puerto, `http://` y `javascript:` dan 403 en las dos Actions, sin ejecutar nada.
   - Otras vías: RPC y otras rutas dan la 404 (pruebas del dev más la mía de cuerpo a medio llegar).
   - Destinos: `Location` siempre relativo y de la lista cerrada, con campos `destino`/`redirect`/`negocioId`/`$ACTION_*`, `Referer` ajeno, `X-Forwarded-Host` ajeno y parámetros extra.
   - Cuerpos: el multipart roto da la 404 sin 500. Los dígitos de ancho completo, `%00`, `1e5000`, `-12345`, `0x1E24` y un archivo dan `?error=incompleto` sin proveedor.
4. **Topes.** Ver M1 y la obs. 4. La ráfaga de reenvíos, el cupo por IP con el primer valor rotado y el tope diario están cubiertos por el dev y en verde sobre PG real.
5. **Enumeración y privacidad.**
   - Sin un campo de número no hay forma de enumerar desde esta pantalla, y la cookie solo abre la ficha propia.
   - En pantalla solo salen 4 dígitos, y un paso firmado con marcado en esos dígitos se pinta escapado.
   - Log: sin código, número, id ni credenciales (prueba del dev).
6. **HTML.** `?error=`/`?errorReenvio=` con `<script>`, atributos, mayúsculas, `%00`, espacios, `error[]`, `__proto__` y 8000 caracteres: la página es byte a byte igual a la limpia, sin `role="alert"`, y gana el primer valor. `formulario-verificar-codigo.tsx`: rendericé el componente de **HEAD** contra `tests/fixtures/formulario-verificar-head/` y sale idéntico en las 8 combinaciones, así que el fixture es auténtico.
7. **GET del módulo:** `plataforma-astro-verificar-panel` (3 GET + HEAD, sin `Set-Cookie`, sin llamadas y sin filas nuevas) está en verde.
8. **Guardianes.** Los conteos de `expect(` HEAD→ahora coinciden con b-dev en los 13 archivos. No hay `skip`/`only`/`todo` nuevos. En los diffs revisados nada se aflojó (`/registro/verificar` como inexistente pasó a `/registro/verificar/otra`; failsafe ahora exige la 404 con una cookie bien firmada).
9. **Alcance.**
   - Cero líneas en `src/lib/`, `src/app/`, `src/middleware.ts`, `vercel.json`, `prisma/`, `openspec/specs/` y `package*.json`; en componentes solo cambia `formulario-verificar-codigo.tsx`.
   - Sin dependencias nuevas.
   - Datos: los fixtures `next-3b2` solo traen la serie 771999 y "termina en 8299"; no hay números de 10 dígitos fuera de esa serie ni credenciales.
   - La bandera no se enciende en ningún archivo commiteable.
10. **Premisas de tasks.md.**
    - #1 (`rewrite` da 500): no afecta la cobertura.
    - #10: el scenario "el cuerpo no se lee" queda cubierto por la prueba del cuerpo a medio llegar, no por la de 200 MB (obs. 5).
    - #13: la igualdad con `/a/b/c` vive en `plataforma-astro-verificar-apagada`.
    - No queda ningún scenario automatizable sin prueba real.

## Mutaciones (todas revertidas; `cmp` contra el original)

| Mutación | Resultado |
|---|---|
| Compuerta anulada (`false && entrada.puedeCorrer…`) | Reprueba `apagada` › "la compuerta va antes del manejador" (solo esa) |
| Sin `routePattern !== entrada.ruta` en `acciones.ts:206` | **0 fallas** en verificar, verificar-accion, reportar-accion, astro-middleware, astro-seguridad-adversarial, plataforma-astro-reportar/registro, registro-astro-seguridad-adversarial y compat. Reprueba **mi** prueba nueva |
| Lo anterior + sin el `routePattern` de los dos manejadores (`verificar.ts`) | Reprueban `plataforma-astro-verificar` › "Action desde una ruta ajena" y `verificar-accion` › "cada Action comprueba su propia ruta" |
| `cargarPantalla` lee la cookie antes que la configuración | Reprueban 2 de `verificar-accion` |

## Pruebas adversariales añadidas

`tests/plataforma-astro-verificar-adversarial.test.ts`: **20 pruebas, todas en verde**, sobre la build, con el falso y la serie `77199972xx`.
- Bandera: 10 variantes más la configuración a medias.
- `?error=` hostil y paso con marcado.
- Destinos ante campos, `Referer` y `Host`.
- Regla de origen en las dos Actions.
- Action desde otra ruta sin leer el cuerpo (cierra el hueco de la mutación 2).
- Métodos, nombres y escrituras raras de la ruta.
- Cuerpos rotos.
- Cookie: contenido, borrado y reuso.
- Ráfaga de fuerza bruta (solo PG real; fija M1).

## Compuertas

- `npm test` (PG 16 real, 3 corridas completas):
  - la última: 168 archivos, 4350 pasan, 2 xfail;
  - las anteriores: una con M2 y otra con la obs. 6, cada una no reproducida en las otras dos.
- `npm run lint`: 0.
- `npm run typecheck`: 435 archivos, 0 errores.
- `npm run build`: completa.
