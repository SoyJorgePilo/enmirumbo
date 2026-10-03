# Etapa C · seguridad — migrar-panel-admin-base-astro (T-026, Fase 5a)

**Veredicto: PASA al validador.** 0 críticos · 0 altos · 1 medio · 6 observaciones (preexistentes o de herramienta, no bloquean).

Se probó contra la salida construida (`astro build` + `scripts/servir-salida-vercel.mjs`), la función invocada directo (sin la tabla de rutas de la CDN) y PostgreSQL 16 desechable (`c5a`, `c5asuite`; puerto 55493). Todo ficticio: claves y secretos generados, WhatsApp 77199959xx, IPs RFC 5737.

## Hallazgos

### Medio

- **M1 · `tests/admin-adversarial.test.ts:628-631` — el guardián "la guarda va antes de tocar datos" se aflojó para lo que queda en `src/app/admin/`.** Antes recorría todo `src/app/admin/` con una lista explícita de excepciones; ahora solo las subcarpetas sin página homónima en Astro. Quedan fuera los archivos de la raíz de `src/app/admin/` y las carpetas `cola/` y `negocios/`. Ejemplo: un `src/app/admin/accion-nueva.ts` con `prisma.negocio.update` y sin `requerirSesionAdmin()` pasa en verde (mutación hecha, ver abajo). Hoy no se puede explotar: `npm run build` es `astro build` y Next no sirve nada. Pero contradice "ninguno se afloja" (spec, "La mitad 5a no pierde dureza") y el código de Next sigue en el árbol hasta T-027. **Para el dev:** volver a recorrer todo `src/app/admin/` y sumar a `EXCEPCIONES` los archivos que 5a dejó como envoltorios o páginas reemplazadas (o recorrer la raíz con su lista), sin quitar `cola/` ni `negocios/` del recorrido.

### Observaciones (no bloquean)

1. **O1 · 301/308 propio de Astro ante `//` final (preexistente, en todo el sitio; el dev lo reportó).** `/admin/cola//` → 301 y `POST /admin/cola//?_action=aprobar` → **308** (conserva método y query). La respuesta sale sin las cuatro cabeceras y **sin `Cache-Control`**, así que incumple la letra de "ninguna respuesta bajo `/admin` sin `no-store`". Qué se probó y descartó:
   - el cuerpo es `text/plain` vacío, sin datos;
   - el `Location` es la misma ruta sin la barra final (`/admin//evil.example//` → `/admin//evil.example/`, que es relativa al sitio): no hay open redirect;
   - el reenvío del 308 vuelve a pasar por origen y guarda: sin sesión, 303 a `/admin`.

   No expone nada del panel.
2. **O2 · llave de IP del cupo (`src/lib/registro/limite-ip.ts:183-229`, sin cambios en este diff).**
   - `[2001:db8::1]:443` da `null`, así que **el límite no aplica a esa petición**;
   - `2001:db8::1`, `2001:db8:0:0:0:0:0:1` y `2001:0db8::0001` son tres llaves distintas;
   - no se agrupa por /64.

   Una ráfaga de 70 con 7 formas de la "misma" IPv6 llegó a comparar 30 veces. Solo se puede explotar si el último salto del encabezado declarado lo influye el cliente: en Vercel lo escribe el edge. Propuesta para un ticket aparte: canonicalizar IPv6 y agrupar por /64.
3. **O3 · base caída:** el respaldo en memoria limita a 5 por proceso (2 ráfagas de 30 → 5 comparaciones cada una), con un solo `console.error` sin IP. Con N instancias son 5×N intentos: es el compromiso documentado de A4 y no lo cambia este diff.
4. **O4 · sesión sin estado (preexistente):** "Salir" no revoca una cookie copiada antes; vale hasta 8 h.
5. **O5 · "Salir" sin `Origin` procede.** Es la decisión 2 de 3a; un navegador siempre manda `Origin` en un POST de formulario. Con `Origin` ajeno o `null`: 403 sin `Set-Cookie` (prueba nueva).
6. **O6 · el emulador (herramienta de pruebas, no producto):**
   - `TRACE` lo tumba: `new Request` lanza fuera del `try` en `scripts/servir-salida-vercel.mjs:106`;
   - reconstruir `.vercel/output` con un emulador vivo lo tumba en la primera carga diferida de un chunk (`ERR_MODULE_NOT_FOUND`). Puede ser una de las causas del "el emulador terminó (1)" intermitente del CI.

## Verificado sin hallazgo (sobre la build)

- **Guarda por construcción:**
  - 22 formas de la ruta × GET/POST con `?_action=`, por el emulador; 16 contra la función directa;
  - entre ellas `/%61dmin`, `/admin/%63ola`, `/admin/%2563ola`, `//admin`, `/ADMIN`, `/admin;x`, `%00`, `%20`, `/./`, `/x/../`, `%2e%2e`, `..%2f`, `\`, barra final y doble;
  - toda forma que Astro resuelve a una pantalla del panel recibe 307/303 a `/admin`; el resto, 404 sin datos. Nunca un 200 sin sesión;
  - métodos GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS, `?_action=` repetido, vacío, `%5Faction`, `_ACTION`: 303 si hay Action y 307 si no; `salir` corre solo en `/admin/cola`;
  - `/_actions/*`, `/?_action=entrar`, `/admin/x?_action=entrar` y `/admin?_action=salir` dan 404;
  - `/admin/foto/…` cae en el comodín; `/_image` responde 404; `/_server-islands/x` 400 (no hay `server:defer`).
- **Sesión:**
  - HMAC más `timingSafeEqual` y caducidad canónica (`sesion.ts` intacto);
  - 16 manipulaciones dan 307: un carácter, truncada, relleno `=`, base64 estándar, ±1 en la caducidad, ceros a la izquierda, 16 dígitos, negativa, hexadecimal, sin punto, tres partes, prefijo `v1.`, otro secreto, caducada, comillas, nombre en mayúsculas;
  - con dos cookies vale la primera; una mala adelante no abre;
  - `Set-Cookie: Max-Age=28800; Path=/admin; HttpOnly; Secure; SameSite=Lax`;
  - nada fuera de `src/astro/panel/guardia.ts` y `index.astro` lee `nu_panel`.
- **Acceso:**
  - una ráfaga paralela de 60 contra la misma IP, rotando el primer valor de XFF, `x-real-ip` y `x-vercel-forwarded-for`, dio exactamente 5 comparaciones (2 aciertos con cookie, 3 incorrectas) y 55 `?error=intentos` sin cookie. Lo mismo con `IP:puerto`;
  - dos procesos contra la misma base: el 6.º responde `intentos` (A4 vigente);
  - la contraseña equivocada, vacía, de 10 000 caracteres, repetida o con bytes raros recibe el mismo 303 vacío;
  - JSON, `text/plain`, sin `Content-Type` y multipart roto van a `/admin` sin intento ni cookie;
  - el log no trae la contraseña, la cookie, el secreto ni la IP (también con la base caída y en el 500).
- **Redirecciones:** `next`, `destino`, `redirect` (en el campo y en la query) y `Referer` ajeno no cambian el `Location` (lista cerrada, `acceso.ts:73`).
- **Cabeceras:** `strict-origin` y `no-store` en 200, 303, 307, 403, 404 y 500 bajo `/admin`, también en las formas raras que llegan a la función. Con la medición configurada, ninguna pantalla del panel ni su 404/403 trae el script de Umami.
- **HTML:** nombres y colonias con `<script>`, `"><svg onload>`, `" onmouseover="`, `javascript:`, RTL override, emoji y `&amp;` salen escapados en la cola y en el listado; ningún WhatsApp. `?estado=` y `?pagina=` hostiles (negativos, 5000 dígitos, `1e3`, `0x10`, `a[]=`, `__proto__`, `constructor`, `%00`, script) responden 200, sin eco y sin 500.
- **Alcance:** contra `origin/main`, `sesion.ts`, `acceso.ts`, `config.ts`, `cupos/compartido.ts` y `limite-ip.ts` no cambian. `guarda.ts` solo delega `sirviendoPorHttps` (misma firma y regla). `entrar.ts` sigue el orden y los logs de Next. No hay diff en `vercel.json`, `prisma/`, `openspec/specs/`, `astro.config.mjs`, `package*.json`. Las fixtures `next-5a` no traen valores de cookie ni secretos.
- **Diff de pruebas (7 guardianes):** salvo M1, ninguno pierde aserciones; varios ganan (tabla de 6 Actions, `clientAddress` en `src/astro/panel`, `src/pages/admin`, `src/lib/admin`, privacidad sin `src/pages/admin`, que además exige que la cola lea `@/lib/admin/reportes`).

## Mutaciones propias (todas revertidas y comprobadas con `cmp`)

| Mutación | Resultado |
|---|---|
| `<ScriptAnalitica />` en `cola.astro` | 4 fallas (3 de `analitica-exclusion-admin` y la de la build con la medición configurada) |
| `client:load` en `BotonSalir` de la cola | 3 fallas (guardián de hidratación y 2 del diff de la cola) |
| La guarda deja pasar sin sesión todo método distinto de GET/HEAD sin Action | 1 falla (unitaria). Sobre la build sigue el 307: lo para `exigirSesionAdmin` de la página (la defensa en profundidad funciona) |
| El middleware salta la regla de origen en `/admin/cola` (CSRF sobre `salir`) | 1 falla del dev (indirecta, en cabeceras) y 1 de la prueba nueva "salir con Origin ajeno o null" |
| `strict-origin` solo en `/admin` exacto | 5 fallas |
| `src/pages/admin/nueva.astro` que lee la base, sin alta y sin guarda | 5 fallas (enumeración de la build, disciplina y medición). Servida sin sesión: GET/POST/HEAD dan 307 y `?_action=x` 303, sin cuerpo; con sesión, 200 |
| `src/app/admin/accion-nueva.ts` con Prisma y sin guarda (M1) | **0 fallas**: confirma M1 |

## Scenarios sin prueba

Ninguno automatizable sin prueba. "Salir del panel no entrega la ruta", con el referente real en el navegador, queda en la tarea 18 (humano). El CSRF de `salir` solo tenía cobertura indirecta: la prueba nueva lo cubre.

## Pruebas adversariales añadidas

`tests/panel-seguridad-adversarial.test.ts`: 33 casos sobre la build, **33/33 en verde**. Cubren:

- 22 formas de la ruta × GET/POST;
- la cabecera estricta en las formas raras;
- 8 combinaciones de `?_action=` y métodos;
- 11 cookies manoseadas, con control positivo;
- CSRF de `salir` y `entrar` (403, sin cookie y sin intento);
- que ningún dato del cliente decide el destino;
- sin enumeración ni eco;
- escapado de datos hostiles en la cola y en el listado;
- 14 parámetros hostiles;
- el log sin contraseña, cookie, secreto ni IP.

## Compuertas

- `npm run lint`: 0.
- `npm run typecheck`: 452 archivos, 0 errores.
- `npm test` (PG 16 `c5asuite`, base nueva): 176/176 archivos, 4469 pasan + 2 xfail, 0 saltadas (las 4436 del dev + 33 nuevas); sin intermitentes [A1]/[A2] ni "el emulador terminó (1)" en esta corrida.
- `npm run build`: completa, sin base y sin `SITIO_URL`.
- Al cerrar: PG desechable y emuladores detenidos; filas `c5aadv*` e intentos de la prueba borrados en su `afterAll`.
