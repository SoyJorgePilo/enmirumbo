# Tareas: migrar-registro-astro (Fase 3b-1)

Rama: `feature/astro-registro`, que sale de `origin/migracion-astro` en `200b2a4`. El PR va directo a `migracion-astro`.

Reglas:

- Las tareas van en orden de dependencia y cada una se comprueba sola.
- Primero van las referencias de Next y las pruebas en rojo; después, el código.
- Las rutas que se pueden tocar son las del requirement "La mitad 3b-1 no pierde dureza…" (`design.md` §2, §4 y §6).
- Todos los datos son ficticios: WhatsApp `771999xxxx`, dominios `.example`, credenciales `ACtest…`, y fotos generadas en la prueba.
- **La bandera de SMS no se enciende en ningún entorno de `migracion-astro` hasta 3b-2.**

## Línea base y referencias

- [x] 1. **Línea base.**
   - Anotar en `reports/b-dev.md` el resultado de `npm test`.
   - Hacer una tabla con los archivos que importan `src/app/(publico)/registro/{page,gracias/page}`, `src/components/registro/*` o que simulan `next/*` para `src/lib/verificacion/acciones` (entre otros, `registro-pagina`, `registro-adversarial`, `foto-formulario`, `responsivo-guardian`, `analitica-privacidad`, `verificacion-failsafe`, `verificacion-acciones`, `verificacion-seguridad-adversarial` y `layout`), con su conteo de `expect(`.
   - Medir el JS que transfiere `/registro` en Next de `main` (bytes con gzip, por archivo) para la tabla de `design.md` §1.1.

   Comprobar: la tabla coincide con el `grep`.
- [x] 2. **Fixtures de Next (`tests/fixtures/next-3b/`).** Montar Next de `main` en un worktree, como en 3a, con la base semilla más una ficha publicada, una en revisión, una rechazada con foto y constancia `1`, y una rechazada ya verificada. Capturar con y sin `SITIO_URL`:
   - **Pantallas:** `/registro`, y `/registro/gracias` con los seis casos del scenario "gracias igual a la de hoy".
   - **Envíos sin JS** (arnés de la tarea 3): los del scenario "mismos desenlaces que Next", más una foto de 5.5 MB, un HTML como `.jpg`, un SVG, `Origin` ajeno, `Origin: null` y sin `Origin`. De cada uno: estado, `Location`, `Set-Cookie`, cabeceras, `Cache-Control` del 200 re-pintado y del 303, y el HTML re-pintado.

   Comprobar: no hay datos reales y los `<id>` están anonimizados.
- [x] 3. **Arnés y Twilio falso.**
   - Ampliar el arnés de envío sin JS de 3a: multipart con archivos (`<input type="file">` con su `accept`), varios archivos en un campo y lectura del formulario re-pintado.
   - `tests/fixtures/twilio-falso.mjs` (`design.md` §7): guion por `TWILIO_FALSO_GUION`, registro de llamadas y fallo ante cualquier otro host externo. Con sus pruebas unitarias.
   - El guardián de que nada en `src/` ni en la build lo menciona.

   Comprobar: el arnés reproduce contra Next los envíos de la tarea 2, y la precarga hace fallar un `fetch` a `https://example.com`.

## Pruebas en rojo

- [x] 4. **Registro sin JS sobre la build** (`tests/plataforma-astro-registro.test.ts`). Una prueba por scenario de los requirements "La página de registro responde…", "El envío del registro sin JavaScript…" y "La pantalla de gracias…", y de los MODIFIED de Actions y PRG:
   - los desenlaces contra los fixtures;
   - el `Referer` no cambia el destino;
   - recargar gracias no duplica;
   - 7 MiB con `Content-Length` y sin él;
   - la Action fuera de su ruta y por RPC;
   - el error no lleva `Location` ni `Set-Cookie` con datos;
   - las cabeceras en el 200, el 303, el 200 re-pintado y el 403;
   - la base caída al abrir el formulario.

   Comprobar: fallan porque las rutas no existen.
- [x] 5. **Foto real, cupos y concurrencia sobre la build** (PostgreSQL real, como en la tarea 6 de 3a):
   - los scenarios del requirement de la foto (las fotos se generan en la prueba);
   - `sharp` presente en la función de la salida;
   - el cupo por IP con el primer valor rotado y la separación de cupos registro/reportes;
   - la carrera por el mismo número con foto;
   - limpieza con `tests/limpieza.ts` en `afterAll` (archivos de foto incluidos).

   Comprobar: fallan solo porque falta la ruta. La concurrencia se salta con aviso en PGlite, como en 3a.
- [x] 6. **Bandera encendida y apagada sobre la build** (`tests/plataforma-astro-registro-bandera.test.ts`, con la precarga de la tarea 3). Los scenarios "código pedido", "el SMS no sale" (error, rechazo, `tarda`) y "apagada no habla con nadie" (los tres casos), más el reenvío de una ficha ya verificada y el duplicado, ambos con cero llamadas. Diff del HTML de `/registro` y de gracias entre los tres casos apagados.

   Comprobar: fallan solo porque falta la ruta.
- [x] 7. **O1** (`tests/plataforma-astro-falla-servidor.test.ts`, build con `DATABASE_URL` hacia `127.0.0.1:1`):
   - un POST válido a reportar y uno a registrar responden 500 "Algo falló de nuestro lado" con las cuatro cabeceras y sin escribir;
   - `POST /500?_action=registrar` no escribe nada.

   Comprobar: la de reportar falla hoy con la 404 (reproduce O1).
- [x] 8. **Mejora progresiva (en rojo).**
   - Pruebas de `decidirTrasEnvio` y del ejemplo en `src/astro/registro-cliente.ts`: cada fila de `design.md` §1.3, paso 4, incluidos los destinos `https://evil.example/registro/gracias`, `//evil.example` y `/negocios`.
   - Prueba del DOM (`happy-dom`, si se aprueba la duda 3) con el HTML de la build y las respuestas capturadas: error en el sitio sin cambiar `location`, foco, valores, foto vacía con su aviso, "Enviando...", ejemplo tras el reemplazo, respuesta inesperada con el error general y sin reenvío, y sin `fetch`/`DOMParser` el envío nativo.
   - Tope de 5 KB con gzip y "ninguna otra página gana `<script>` propio".

   Comprobar: fallan porque el módulo no existe.

   > Nota del dev: las pruebas sobre la build de las tareas 4–6 se escribieron con la página ya en marcha; su rojo se comprobó por mutación (desatar `registrar` de `/registro` en la tabla: 10 de 26 fallan; quitar la guarda de `/500`: la de reportar vuelve a la 404). Ver `reports/b-dev.md`.

## Código

- [x] 9. **`src/lib/verificacion/acciones.ts` sin Next** (`design.md` §4) y los tres envoltorios de `src/app/`.
   - Re-apuntar `verificacion-acciones` y `verificacion-seguridad-adversarial` al destino devuelto, sin simular `next/*`.

   Comprobar:
   - `grep "from \"next/" src/lib/verificacion` sale vacío;
   - `npm run typecheck` en verde;
   - las dos pruebas tienen el mismo número de `expect(` o más, y pasan.
- [x] 10. **Componentes** (`design.md` §2): `cuerpo-formulario-registro.tsx`, `boton-enviar-vista.tsx` y `formulario-registro-nativo.tsx`; `FormularioRegistro` y `BotonEnviar` pasan a usarlos.

    Comprobar:
    - las pruebas de render actuales de `FormularioRegistro` y `BotonEnviar` siguen en verde sin tocarlas (el HTML no cambia);
    - una prueba nueva exige que el nativo pinte el mismo cuerpo más el `autofocus` del primer error;
    - `git diff src/components/` muestra solo esos cinco archivos.
- [x] 11. **Action `registrar`, la tabla y O1.**
    - `src/astro/registro.ts`, con el pegamento copiado de `accion.ts` y el resultado cerrado.
    - `src/actions/index.ts` (`registrar`).
    - `src/astro/acciones.ts`: la entrada `registrar → /registro`, el resultado `repintar` validado, el `trasFallar` sin base (`design.md` §3) y la pasada de `/500` (`design.md` §5).
    - Pruebas unitarias de la Action con un contexto falso y el proveedor simulado.

    Comprobar: en verde las unitarias y la tarea 7. Mutación: quitar la guarda de `/500` vuelve a dar la 404 (revertir).
- [x] 12. **Páginas.**
    - `src/pages/registro.astro`: `TroncoPublico`; catálogos de la base; el estado desde `Astro.getActionResult(actions.registrar)`; `FormularioRegistroNativo` con `action={actions.registrar.toString()}`; `data-ejemplos`; los metadatos de hoy.
    - `src/pages/registro/gracias.astro`: dinámica, sin base y con la regla del primer valor.

    Comprobar: las tareas 4, 5 y 6 en verde.
- [x] 13. **Módulo de mejora progresiva**: `src/astro/registro-cliente.ts` y el `<script>` de `registro.astro`, con el contrato de `design.md` §1.3.

    Comprobar: la tarea 8 en verde, y el módulo construido pesa 5 KB o menos con gzip.

    > Corrección del dev: el `<script>` hace `import()` del módulo en vez de importarlo estático. Con import estático pesa menos de 4096 B y Astro lo mete EN LÍNEA en el HTML (`assetsInlineLimit`), y la spec pide un módulo de `/_astro/`; cambiar el límite exige tocar `astro.config.mjs`, que no está permitido. Son dos archivos (arranque + módulo), 2.6 KB con gzip en total.

## Verificación

- [x] 14. **Diff de 3b-1.** Agregar a `scripts/diff-html.mjs` las rutas y los envíos de la tarea 2 y `NORMALIZACIONES_REGISTRO`, con exactamente las cinco entradas de `design.md` §8, aplicadas solo a `/registro` y con su salida impresa.

    Comprobar: un oculto extra o un `data-` distinto inyectados a mano salen como diferencia (revertir).
- [x] 15. **Re-apuntar pruebas y guardianes.**
    - Pasar a Astro los archivos de la tarea 1, salvo lo de `verificar/` (3b-2).
    - Vaciar `EXCEPCIONES_FASE_3` (`tests/layout.test.ts`).
    - Sumar `/registro` y gracias a las listas de `responsivo-guardian`, `analitica-privacidad` y del guardián de exclusión de la medición.
    - Extender el guardián de `clientAddress` a los archivos nuevos.
    - Re-apuntar a `boton-enviar-vista.tsx` la prueba que ancla `disabled={pending}`/"Enviando...".
    - Re-escribir "sin onSubmit ni fetch" para que quede así: `FormularioRegistro` sigue sin `fetch`, y el único `fetch` del módulo va a `form.action`.

    Comprobar:
    - `expect(` igual o mayor por archivo, sin `skip` nuevos;
    - el `grep` de imports de `src/app/(publico)/registro` en `tests/` solo encuentra `verificar/`;
    - un `href` inventado sigue haciendo fallar el guardián.
- [x] 16. **Diff y envíos contra Next.** Correr el diff A (`SITIO_URL`), B (+ medición) y C (producción sin `SITIO_URL`) con las rutas de 2a, 2b, 3a y 3b-1, y el arnés contra las dos versiones. Pegar las salidas en `reports/b-dev.md`, junto con la medición de JS de la tarea 1 contra la del módulo.

    Comprobar: cero diferencias fuera de las normalizaciones declaradas (las de 2b, `NORMALIZACIONES_FORMULARIO` y `NORMALIZACIONES_REGISTRO`) y de la diferencia aceptada de 3a (el 500 de Next frente al 403 de Astro con origen ajeno).

## Cierre

- [x] 17. **Compuertas.**
    - `npm run lint`, `npm run typecheck`, `npm run build` sin base y `npm test` (PGlite y PostgreSQL real), todo en verde.
    - `git diff --stat` solo con las rutas permitidas.
    - Al final, cero negocios, cero fotos y cero archivos en `.fotos-test` (lección A1).
- [x] 18. **Estado intermedio documentado.** En T-024 y en `docs/despliegue.md` (sección de la verificación por SMS), una línea que diga que en `migracion-astro` la bandera no se enciende hasta mergear 3b-2.

    Comprobar: el texto existe en los dos lugares.
- [~] 19. **Preview de Vercel (paso humano).**
    - Con el JS apagado, en Chrome **y** Firefox: `/registro` → enviar vacío (comprobar el foco) → corregir con una foto de 3–4 MB tomada con el celular → gracias → recargar. Capturar el `Origin` del POST, el 303 y la URL final.
    - Con JS: dos errores y un éxito. Comprobar que la URL no cambia, el foco, "Enviando..." y una sola vista de `/registro` y una de gracias en Umami.
    - Lighthouse móvil de `/registro` (anotar la puntuación y el JS transferido).
    - Comprobar que la foto se procesó (prueba de que `sharp` de Linux viaja en la función).
    - `curl` de las cuatro cabeceras en `/registro`, el 303 y gracias.
    - Una foto de 4.6 MB, para anotar el 413 de Vercel (candidato a ticket, no se arregla aquí).
    - Anotarlo en el ticket.
- [x] 20. **PR hacia `migracion-astro`** (#37). Lleva en la descripción las salidas de las tareas 16 y 19, las normalizaciones, las dos enmiendas de `registro-negocio`, el estado intermedio de la bandera y lo pendiente para 3b-2. Se enlaza en T-024.
