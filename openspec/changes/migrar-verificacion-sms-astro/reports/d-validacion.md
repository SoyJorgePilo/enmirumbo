# Etapa D · validación — migrar-verificacion-sms-astro (T-024, Fase 3b-2)

**Veredicto: APROBADO, con commit y push de la rama y SIN PR** (modo especial: #37 aún no está mergeado). 0 bloqueantes, 0 críticos/altos. Hay 2 hallazgos bajos propios (V1 y V2), que no bloquean. M1 de C queda como candidato a ticket para `main`, prioritario antes de encender la bandera. El PR hacia `migracion-astro` lo abre el orquestador cuando #37 esté mergeado. T-024 no se tocó, sigue sin `en-review`.

Rama `feature/astro-verificacion-sms`:
- se le fusionó `origin/feature/astro-registro` (trae `8093bf7`, el arreglo V1 de 3b-1) sin conflictos;
- `origin/migracion-astro` sigue en `200b2a4`, así que no había nada más que fusionar.

Todo lo verifiqué yo:
- `npm ci` limpio, sin `dist`, `.astro`, `.vercel/output` ni `.next`, y sin caché de Vitest;
- bases propias: PostgreSQL 16 desechable (`dval3b2ci` para la suite y `dval3b2diff` como espejo) y `prisma dev dval3b2pd`;
- todas detenidas al terminar.

## Compuertas (mías)

- `npm run lint`: exit 0.
- `npm run typecheck`: 436 archivos, 0 errores.
- `npm run build` con `DATABASE_URL` a `127.0.0.1:1`: Complete.
- `npm test` en **PostgreSQL 16 real, en el orden del CI** (`migrate deploy` → `db:seed` → `npm test`): 168 archivos, **4351 pasan, 2 expected fail, 0 saltadas**. Al final quedan 0 negocios, 0 reportes, 0 fotos y 0 filas de `IntentoDeCupo` en `public`.
- `npm test` contra `prisma dev dval3b2pd` (PGlite): 4325 pasan, 2 xfail, 25 saltadas y 2 rojas preexistentes en archivos que este change no toca:
  - `[A1]` de `reportes-seguridad-adversarial`, la carrera conocida;
  - el `beforeAll` de `plataforma-astro-paginas` venció a los 10 s.

  Los dos archivos, re-corridos 3 veces en PGlite: 109/109 cada vez. En el CI corre PostgreSQL real.

## Diff de HTML contra Next de `origin/main` (`8d514f5`): 2a + 2b + 3a + 3b-1 + 3b-2 juntas

Montaje:
- base espejo con `db:seed` y `db:seed:demo`, más extras ficticios: fotos de revisión y rechazado, un despublicado con foto y una ficha con 10 reportes;
- Storage falso en HTTPS local;
- `next start` y `servir-salida-vercel.mjs`, los dos con `--import tests/fixtures/twilio-falso.mjs`;
- builds A/B/C de los dos lados.

| | Encendida | Apagada (credenciales y secreto, sin bandera) |
|---|---|---|
| A (`SITIO_URL`) | **0 diferencias, 109 rutas**, exit 0 | **0 diferencias, 102 rutas**, exit 0 |
| B (A + medición) | 0 diferencias, 109 rutas | 0 diferencias, 102 rutas |
| C (sin `SITIO_URL`) | 0 diferencias, 80 rutas | 0 diferencias, 73 rutas |

- **Envíos encendida:** 52 iguales (3a 6, 3b-1 22, 3b-2 24) + 6 ACEPTADA.
- **Envíos apagada:** 28 iguales + 4 ACEPTADA.
- **Lo ACEPTADO** es solo el origen ajeno o `null`: Next 500, Astro 403.
- **Normalizaciones impresas, ninguna nueva:**
  - `atributos-del-form` y `campos-action-de-next`: 27 encendida (7 reportar + 20 de las 10 pantallas × 2 formularios) y 7 apagada;
  - las 3 de la 404 dinámica, que incluyen `/registro/verificar` sin cookie (encendida) y GET y POST (apagada);
  - las 5 del registro (13/13/13/13/10).
- **Encendida, con una salvedad (V1):** la corrida limpia es con una copia temporal del script que borra `IntentoDeCupo` en `reiniciar`. Con el script tal como está, A encendida da 1 DISTINTA (`reenvio-rechazado`), que es un artefacto del arnés y no del producto.

## Reproducciones propias (sonda temporal sobre la build A, Twilio falso; borrada)

- **(a) Bandera apagada**, probada con credenciales sin bandera y también sin variables:
  - Formas: GET, POST `confirmar`, POST `reenviar`, POST sin `_action`, JSON, `text/plain` y 7 MiB.
  - Cookies: sin cookie, vigente, alterada, otro secreto, caducada, malformada y de una ficha borrada.
  - Cada forma da una sola respuesta para las 7 cookies: 404 con el cuerpo idéntico a `/a/b/c` (igual a `/loquesea`), las 4 cabeceras y sin `Set-Cookie`.
  - HEAD da 404 y `/_actions/{confirmar,reenviar}` es igual a `/a/b/c`.
  - Un POST con el cuerpo a medio llegar (`Content-Length: 1000000`) responde 404 en 2 ms, o sea, sin leer el cuerpo.
  - 0 llamadas al falso, 0 filas de cupos y la ficha no cambia.
- **(b) Encendida.** Recorrido: alta multipart con JPEG → 303 a `/registro/verificar` con `nu_paso` (`Max-Age=900; Path=/registro/verificar; HttpOnly; Secure; SameSite=Lax`, sin el número) y 1 SMS.
  - `12a456` → `?error=incompleto` sin llamada.
  - Un código mal → `?error=no-coincide` con 1 intento gastado; recargar dos veces da el mismo cuerpo sin gastar.
  - Reenviar antes de tiempo → `espera-reenvio`. Con la espera envejecida: 1.º y 2.º reenvío → `/registro/verificar` con 1 SMS cada uno; el 3.º → `gracias?agotado=1` con el borrado de la cookie y sin SMS.
  - El código bien → `gracias?verificado=1` con `nu_paso=; Max-Age=0; Path=/registro/verificar; HttpOnly; Secure; SameSite=Lax`, y gracias muestra "¡Listo! Ya confirmamos tu número.". La ficha queda `en_revision` con su fecha.
  - En otra ficha: 5 códigos mal → `agotado`, y reusar la cookie no llega al proveedor.
  - Cookies alterada, otro secreto, caducada, malformada y de una ficha borrada → 404 igual a `/a/b/c`. Origen ajeno → 403 con las 4 cabeceras.
- **(c)** Con la cookie del 303: 3 GET y un HEAD dan 200, el mismo cuerpo y ningún `Set-Cookie`; las llamadas, los cupos y la fila de la ficha no cambian. La pantalla muestra "termina en 6202", sin el número completo, sin el id y sin `<script>`.
- **(d) Cuatro cabeceras** presentes en:
  - 200: la pantalla y gracias;
  - 303: los desenlaces;
  - 403: origen ajeno;
  - 404: todas las de (a);
  - 500: con la base caída, `GET /registro`, `POST /500?_action=confirmar` y `POST /registro?_action=registrar` dan "Algo falló de nuestro lado".
- **(e)** El componente de `HEAD` y el de ahora, pintados con funciones: **15/15 combinaciones idénticas byte a byte** (5 `errorCodigo` × 3 `errorReenvio`). Con texto sale `method="post"`.
- **M1 reproducido:** una ráfaga de 40 códigos equivocados con la misma cookie produjo **25 comprobaciones** al falso y dejó 5 intentos apuntados.

## Guardianes y pruebas (f, g)

- `expect(` no baja en ningún archivo modificado. Ejemplos: `layout` 178→184, `verificacion-failsafe` 40→42, `registro-mejora-dom` 75→81 (sobre el `8093bf7` ya fusionado), `diff-html` 69→75 y `arnes-formulario` 47→54.
- No hay `skip`/`only`/`todo` nuevos. Los únicos condicionales son `runIf` de concurrencia con PG real, en `topes` y `adversarial`.
- El `grep` de imports de `src/app/(publico)/registro` en `tests/` sale vacío.
- `tests/aviso-pendientes.test.ts` (T-020) solo suma el import de `afterAll` y un `afterAll` que borra su `PREFIJO` y desconecta, sin tocar aserciones. Es alcance justificado: lo sobrante rompía la "base vacía" de `tareas-programadas` (obs. 6 de C).
- **Mutaciones mías** (revertidas y verificadas con `cmp`):
  1. Sin `puedeCorrer` en la entrada de verificar (`src/astro/acciones.ts:90`): reprueban 2, `apagada` › "la compuerta va antes del manejador" y `verificar-accion` › "cuatro Actions… con la compuerta". `src/lib/` sigue dando 404 por su cuenta, así que es defensa en profundidad.
  2. Sin `contexto.routePattern !== entrada.ruta` (`src/astro/acciones.ts:206`): reprueba 1, `adversarial` › "una Action pedida desde otra ruta no llega ni a leer el cuerpo".
- **Fugas:**
  - cada archivo nuevo o tocado de 3b-2, corrido solo (13 archivos), deja 0 negocios, 0 reportes, 0 fotos y 0 cupos;
  - `.fotos-test` conserva los 2 `.webp` del demo de `layout`/`responsivo`, que son preexistentes;
  - los helpers `postear-por-trozos.ts` y `salida-astro.ts` no tocan la base.
- **Cuerpo gigante:** `plataforma-astro-verificar`, `plataforma-astro-verificar-apagada` y `registro-astro-cuerpo-una-vez`, **20 corridas seguidas: 20/20 en verde** (26/26 cada una), sin fugas en ninguna.

## Alcance (h)

- Cero líneas en `src/lib/`, `src/app/`, `src/middleware.ts`, `vercel.json`, `prisma/`, `openspec/specs/`, `astro.config.mjs`, `next.config.ts`, `spikes/`, `package.json` y `package-lock.json`, medido contra `origin/feature/astro-registro`.
- En `src/components/` solo cambia `formulario-verificar-codigo.tsx`.
- Sin dependencias nuevas y sin `any`.
- La UI no cambia (español, literales de T-016).
- Sin secretos ni datos reales: WhatsApp de la serie `771999xxxx`, `ACtest…`, `.example`. Nada de `src/` menciona el falso.
- Nunca se usó Twilio real.

## Hallazgos propios

**V1 · bajo · arnés, no producto.** `scripts/diff-html.mjs:317` (`compararEnvios3b`, `reiniciar`) vuelve a sembrar las fichas de id fijo, pero no borra sus filas de `IntentoDeCupo`.
- Con la bandera encendida, `reenvio-rechazado` sale DISTINTA: el lado que corre segundo hereda la espera de 60 s del primero y va a gracias sin SMS.
- Al invertir el orden de los lados, la diferencia se invierte. Con `DELETE FROM "IntentoDeCupo"` en `reiniciar` sale 0 en A, B y C.
- Arreglo de 1 línea, recomendado antes del PR o, si no, anotado en él.

**V2 · bajo · observabilidad.** `src/astro/acciones.ts:89`: `trasFallar` → `no-encontrado` también se traga las fallas internas dentro del manejador.
- Con la base caída, `confirmar`/`reenviar` con cookie válida dan 404 "No encontramos esta página" y **no queda nada en el log**. Next responde 500 y lo registra.
- Es lo que pide design §3 ("falla interna → no-encontrado, no hay 500"), así que no es un incumplimiento.
- Candidato: un `console.error` sin datos cuando el código sea `INTERNAL_SERVER_ERROR`.

**Nota.** La cabecera de estado de T-024 dice "3b-2 en spec". Lo actualiza el orquestador al abrir el PR (tarea 18).

## Candidatos a ticket (para la descripción del futuro PR)

1. **M1, para `main`, PRIORITARIO ANTES DE ENCENDER LA BANDERA.** En `src/lib/verificacion/flujo.ts:201-205` el tope de 5 códigos no es atómico (yo medí 25 de 40 y C midió 13 de 40 y 184-200 de 200).
   - El comentario de `src/lib/verificacion/limites.ts:262` ("uno o dos intentos de más contra 10⁶") es falso.
   - Hoy lo frena solo Twilio Verify (429/60202).
   - Arreglo: apartar el intento de forma atómica antes de comprobar y devolverlo si el proveedor falla. Igual en Next.
2. Ficha borrada + reenvío escribe 2 filas de cupos (igual en Next).
3. Reenviar con una cookie vieja después de confirmar o agotar manda SMS (obs. 1 de C).
4. Cupo por IP: la misma IP escrita distinto (`::ffff:v4`, IPv6 no canónica) y sin atomicidad. Aplica también al cupo de códigos.
5. 413 de Vercel con fotos de 4.5 a 5 MB.
6. `Forbidden` sin cabeceras con `x-astro-locals` (M1 de 3a).
7. El middleware no pisa cabeceras ya presentes.
8. La 404 dinámica de Next con el `<body>` vacío sin JS (preexistente en `main`).
9. `ws` en el árbol de producción del lock.
10. V2 de esta etapa (log de fallas internas en `confirmar`/`reenviar`).
11. Requisito para encender en producción: declarar `REGISTRO_ENCABEZADO_IP` (obs. 4 de C). Conviene sumar M1 a la advertencia de `docs/despliegue.md`.

## Pendiente

- **Tarea 17 (humana, preview):**
  - con la bandera apagada, en Chrome y Firefox sin JS, `/registro/verificar` muestra "No encontramos esta página";
  - `curl` de estado, cuerpo y cabeceras frente a `/a/b/c` y `/loquesea`, y un `POST ?_action=confirmar` da la misma 404;
  - Lighthouse móvil.
  - El SMS real, solo si lo decide el fundador.
- **Tarea 18 (orquestador):** PR hacia `migracion-astro` cuando #37 esté mergeado, con estos candidatos y la salida del diff. **El CI de GitHub Actions tiene que quedar en verde en el PR**: esta validación local no lo sustituye. El merge lo hace un humano.
