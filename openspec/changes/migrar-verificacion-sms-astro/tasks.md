# Tareas: migrar-verificacion-sms-astro (Fase 3b-2)

Rama: `feature/astro-verificacion-sms`, que sale de `feature/astro-registro` en `696210d`. El PR va directo a `migracion-astro`, **después de mergear #37** y rebasado sobre esa rama.

Reglas:

- Las tareas van en orden de dependencia y cada una se comprueba sola.
- Primero van las referencias de Next y las pruebas en rojo; después, el código.
- Las rutas que se pueden tocar son las del requirement "La mitad 3b-2 no pierde dureza…": **cero líneas en `src/lib/`, `src/app/` y `src/middleware.ts`**.
- Todos los datos son ficticios: WhatsApp `771999xxxx`, dominios `.example`, credenciales `ACtest…`, y secretos y cookies generados en la prueba.
- **La bandera de SMS no se enciende en ningún entorno de `migracion-astro` hasta mergear este change** (salvo lo que decida la duda 1 sobre el preview del PR).

## Línea base y referencias

- [x] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Hacer una tabla con los archivos que importan `src/app/(publico)/registro/verificar/` o que usan `/registro/verificar` como ruta inexistente o en listas de 404 (`verificacion-failsafe`, `layout`, `responsivo-guardian`, `buscador-pagina`, `directorio-astro-seguridad-adversarial`, `plataforma-astro-registro-bandera`, entre otros), con su conteo de `expect(`.
   - Confirmar con una línea que `rewrite("/404")` también da la 404 vacía (`design.md` §2.1 b).

   Comprobar: la tabla coincide con el `grep`, y `grep "from \"next/" src/lib/verificacion` sale vacío.

   > **Corrección (dev):** `rewrite("/404")` no da una 404 vacía: da un **500** ("Algo falló de nuestro lado"), porque la función no puede reescribir a la 404 prerenderizada. La conclusión de `design.md` §2.1 (b) se mantiene: descartado.
- [x] 2. **Fixtures de Next (`tests/fixtures/next-3b2/`).** Montar Next de `main` como en 3b-1, con `NODE_OPTIONS="--import …/twilio-falso.mjs"`, y comprobar primero que una petición a `verify.twilio.com` llega al falso (`design.md` §8). Capturar con y sin `SITIO_URL`:
   - **Apagada**, en las tres configuraciones: `GET`, `HEAD`, `POST ?_action=confirmar` y `POST` sin parámetro a `/registro/verificar`, más `/loquesea`, `/registro/loquesea` y `/a/b/c`.
   - **Encendida**, con una cookie firmada: las 9 pantallas de `design.md` §12.
   - **Envíos sin JS:**
     - cada fila de la tabla de desenlaces;
     - los casos sin credencial válida;
     - origen ajeno, `null` y sin `Origin`;
     - campos extra.

     De cada uno: estado, `Location`, atributos de `Set-Cookie`, cabeceras, `Cache-Control`, HTML, llamadas al falso y filas de la base.
   - Medir el JS que transfiere `/registro/verificar` en Next (bytes con gzip) para el §1.1.

   Comprobar: no hay datos reales, y las cookies y los ids están anonimizados.
- [x] 3. **Arnés y simulador.**
   - `twilio-falso.mjs`: al comprobar, suma `error` (503) y `tarda`, con sus pruebas unitarias.
   - Ayudantes de prueba:
     - firmar una cookie de paso (vigente, caducada, alterada, con otro secreto, malformada);
     - envejecer las filas de `IntentoDeCupo` de un registro para vencer la espera de 60 s sin dormir;
     - en el arnés, elegir uno de dos `<form>` de una página por su botón.

   Comprobar: el arnés reproduce contra Next los envíos de la tarea 2, y la precarga hace fallar un `fetch` a `https://example.com`.

## Pruebas en rojo

- [x] 4. **Bandera apagada sobre la build** (`tests/plataforma-astro-verificar-apagada.test.ts`). Una prueba por scenario del requirement "Con la verificación apagada…" y de "la compuerta va antes del manejador":
   - las tres configuraciones;
   - la cookie bien firmada;
   - el cuerpo de 200 MB, contado con `tests/fixtures/contar-lecturas.mjs`;
   - la igualdad con `/loquesea` y con `/a/b/c`;
   - 0 llamadas, 0 filas y sin `Set-Cookie`.

   Comprobar: hoy la mayoría pasan con la 404 de la CDN. Son la red de seguridad y tienen que seguir pasando con la ruta creada. Anotar cuáles fallan hoy y por qué.
- [x] 5. **Pantalla y envíos encendidos sobre la build** (`tests/plataforma-astro-verificar.test.ts`, con el simulador). Los scenarios de "Con la verificación encendida, la pantalla…", "Sin una credencial de paso válida…" (la tabla de `design.md` §2.3 entera, comparando byte a byte por fila) y "Confirmar y reenviar…":
   - recorrido completo;
   - desenlaces contra los fixtures;
   - recargar tras un error;
   - el borrado de la cookie seguido con un frasco de cookies;
   - `Referer` hostil;
   - nada sensible en las URLs, las cabeceras ni el log.

   Comprobar: fallan solo porque la ruta no existe.
- [x] 6. **Topes, ráfagas y reutilización de la cookie** (PostgreSQL real, como en la tarea 5 de 3b-1). Los scenarios del requirement de topes:
   - la primera cookie reutilizada;
   - 6 reenvíos simultáneos;
   - el cupo por IP con el primer valor rotado y los cupos separados de registro y reportes;
   - el tope diario con `VERIFICACION_SMS_TOPE_DIARIO=2` y una sola alerta.

   Limpiar con `tests/limpieza.ts` en `afterAll`.

   Comprobar: fallan solo porque falta la ruta. La concurrencia se salta con aviso en PGlite.
- [x] 7. **Panel y `GET` sin efectos.**
   - La fila antes y después de dos confirmaciones.
   - `obtenerColaDeRevision` y `obtenerRegistroParaPanel` con esa fila.
   - El render de `tarjeta-cola` y `detalle-registro` con esa fila, con los literales del panel, "Escribirle por WhatsApp" y las acciones.
   - Tres `GET` con conteos sin cambio.
   - En `registro-mejora-dom`, con las respuestas capturadas con la bandera encendida: el módulo navega a `/registro/verificar` y no hace ninguna otra petición.

   Comprobar: las de la build fallan solo porque falta la ruta.

## Código

- [x] 8. **`FormularioVerificarCodigo`** (`design.md` §1.3): `accionConfirmar` y `accionReenviar` pasan a `string | función`, con `method="post"` solo con texto.

   Comprobar:
   - una prueba nueva exige que el HTML con funciones sea idéntico byte a byte al de HEAD;
   - `git diff src/components/` muestra solo ese archivo;
   - `npm run typecheck` en verde, con la página de Next sin tocar.
- [x] 9. **`src/astro/verificar.ts`:**
   - el adaptador `AlmacenCookies` sobre `Astro.cookies` (`design.md` §4);
   - los manejadores de `confirmar` y `reenviar`, con la auto-comprobación de ruta;
   - `DESTINOS_DE_VERIFICAR`, la lista cerrada;
   - `cargarPantalla(url, cookies)`: configuración primero, después cookie, y listas cerradas de errores;
   - pruebas unitarias con un contexto falso y el proveedor simulado.
   - Medir que el envío `application/x-www-form-urlencoded` llega como formulario.

   Comprobar: unitarias en verde. Mutación: un destino fuera de la lista se obedece → falla (revertir).
- [x] 10. **Actions y tabla.**
    - `src/actions/index.ts`: `confirmar` y `reenviar` con `accept: 'form'`.
    - `src/astro/acciones.ts`:
      - las dos entradas con `puedeCorrer: verificacionEncendida`, evaluada antes de `action.handler()` (`design.md` §2.3);
      - `trasFallar` → `no-encontrado`;
      - el `no-encontrado` de estas entradas por el mismo camino que reportar;
      - `esResultado` con la lista cerrada.

    Comprobar: en verde las unitarias y la tarea 4. Mutación: mover la compuerta después del manejador hace fallar "el cuerpo no se lee con la bandera apagada" (revertir).

    > **Corrección (dev):** la mutación la detecta la prueba "la compuerta va antes del manejador" (cuerpo a medio llegar: sin compuerta el manejador espera el resto y no hay respuesta en 3 s), no la de 200 MB: Astro corta en 6 MiB con `readBodyWithLimit` sin llamar a `formData()`, así que la sonda cuenta 0 y la memoria no sube con o sin compuerta. Las dos se quedan.
- [x] 11. **`src/pages/registro/verificar.astro`:**
    - `prerender = false` y `TroncoPublico` con `noindex, nofollow`;
    - 404 con `NoEncontradoDinamico` si la configuración falta (antes de la cookie), si la cookie no vale o si el resultado de la Action es `NOT_FOUND`;
    - la pantalla con `FormularioVerificarCodigo` y `action={actions.confirmar.toString()}` / `actions.reenviar.toString()`;
    - ningún `<script>`.

    Comprobar: las tareas 4, 5, 6 y 7 en verde.

## Verificación

- [x] 12. **Diff de 3b-2** (`scripts/diff-html.mjs`):
    - las rutas y envíos de la tarea 2;
    - `/registro/verificar` apagada en la lista de 404 dinámicas;
    - `NORMALIZACIONES_FORMULARIO` extendida en alcance a la pantalla, en sus dos formularios;
    - **ninguna normalización nueva**, y la salida impresa.

    Comprobar: un oculto extra o un `data-` inyectados a mano salen como diferencia (revertir).
- [x] 13. **Re-apuntar pruebas y guardianes** (la tabla de la tarea 1):
    - `verificacion-failsafe`, `layout`, `responsivo-guardian` y `buscador-pagina` pasan a la página de Astro;
    - donde `/registro/verificar` servía de ruta inexistente, se usa `/registro/verificar/otra`;
    - la aserción "verificar igual a `/a/b/c`" de `plataforma-astro-registro-bandera` pasa a "`NoEncontradoDinamico` de la función, igual a `/loquesea`";

      > **Corrección (dev):** esa aserción no existe en `plataforma-astro-registro-bandera` (sus 40 `expect(` no piden `/registro/verificar`). La igualdad con `/loquesea` y `/a/b/c` vive en `plataforma-astro-verificar-apagada`.
    - se suma la pantalla a las listas de `noindex`, medición y responsivo;
    - el guardián de `clientAddress` cubre `src/astro/verificar.ts`;
    - el sitemap sigue sin la ruta.

    Comprobar:
    - `expect(` igual o mayor por archivo, sin `skip` nuevos;
    - el `grep` de imports de `src/app/(publico)/registro` en `tests/` sale vacío;
    - un `href` inventado sigue haciendo fallar el guardián de enlaces.
- [~] 14. **Diff y envíos contra Next.** Correr el diff A (`SITIO_URL`), B (+ medición) y C (producción sin `SITIO_URL`) con las rutas de 2a, 2b, 3a, 3b-1 y 3b-2, la bandera apagada y encendida, y el falso en los dos lados. Correr también el arnés contra las dos versiones. Pegar las salidas en `reports/b-dev.md`, junto con el JS de Next de la tarea 2 frente a 0 en Astro.

    Comprobar: cero diferencias fuera de las normalizaciones declaradas y de las tres aceptadas en `design.md` §12.

    > **Estado (dev):** `[~]`. Corrido con `--solo-3b2` en A, B y C, apagada y encendida (Next de `origin/main` `8d514f5` con el falso en los dos lados): cero diferencias. Las rutas de 2a, 2b, 3a y 3b-1 no se volvieron a correr contra Next (piden los datos de 2b y el Storage falso de 3b-1); sus fixtures siguen en verde en la suite. Lo completo queda para el validador.

## Cierre

- [x] 15. **Compuertas.**
    - `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test` (PGlite y PostgreSQL real), todo en verde.
    - `git diff --stat` solo con las rutas permitidas, y cero líneas en `src/lib/`, `src/app/` y `src/middleware.ts`.
    - Al final, cero negocios, cero fotos y cero filas de `IntentoDeCupo`.
- [x] 16. **Estado de la bandera documentado.** En T-024 y en `docs/despliegue.md` (sección de la verificación por SMS), cambiar la línea del estado intermedio: con 3b-2 mergeado, la bandera ya puede encenderse en un preview de `migracion-astro`. Agregar que el panel que muestra la marca sigue en Next hasta la Fase 5.

    Comprobar: el texto existe en los dos lugares y no promete nada del panel en Astro.
- [~] 17. **Preview de Vercel (paso humano; alcance según la duda 1).**
    - **Bandera apagada**, en Chrome **y** Firefox sin JS: `/registro/verificar` muestra "No encontramos esta página". `curl` de estado, cuerpo y cabeceras frente a `/a/b/c` y `/loquesea`. Un `POST ?_action=confirmar` da la misma 404.
    - **Si se autoriza encenderla en este preview:** sin JS, registro → SMS real a un número del fundador → un código equivocado → reenvío → el correcto → gracias con "¡Listo! Ya confirmamos tu número." → recargar. Con JS: el registro llega a la pantalla del código (la cookie del 303 la guardó el `fetch`).
    - Lighthouse móvil de la pantalla.
    - **Apagar la bandera** al terminar y anotarlo en el ticket.
- [ ] 18. **PR hacia `migracion-astro`**, una vez mergeado #37 y rebasado. Lleva en la descripción las salidas de las tareas 14 y 17, las normalizaciones y diferencias aceptadas, y lo que T-027 quita del Next. Se enlaza en T-024, que pasa a `en-review`. Al mergearlo, T-024 pasa a `hecho`.
