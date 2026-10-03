# Etapa D · validación — migrar-panel-admin-base-astro (T-026, Fase 5a)

**Veredicto: APROBADO.** 0 críticos, 0 altos, 0 medios. 2 correcciones editoriales mías (abajo) y 3 observaciones bajas al PR. Es un PR **borrador** apilado sobre #38 (`--base feature/astro-verificacion-sms`). T-026 queda en `en-review` solo por 5a; faltan 5b, 5c y 5d.

## Base y alcance

- `origin/feature/astro-verificacion-sms` sigue en `a4d560e`, que ya está dentro de la rama. No hubo que fusionar.
- Archivos compartidos con las otras fases, con cambios mínimos y delimitados:
  - `src/middleware.ts`: +10/−1. Un import, `conReferenteDelPanel` envolviendo a `atender`, y la guarda entre el origen y `atenderAcciones`.
  - `src/astro/acciones.ts`: +9/−1. Un import, el tipo y dos entradas.
  - `src/astro/metadatos.ts`: +4. `referrer` entre la descripción y `robots`.
- `src/lib/`:
  - nuevos: `admin/entrar.ts` y `admin/peticion.ts`, sin `next/*`;
  - `admin/guarda.ts`: solo el import y el cuerpo de `sirviendoPorHttps` (misma firma y misma regla);
  - `sesion.ts`, `acceso.ts`, `config.ts`, `cupos/compartido.ts` y `registro/limite-ip.ts`: **0 líneas** contra `origin/main`.
- `src/app/`: solo `accion-acceso.ts` y `accion-salir.ts`, como envoltorios. `src/components/`: solo `boton-salir.tsx`. Su HTML con una función lo rendericé yo desde HEAD y es igual byte a byte a `tests/fixtures/boton-salir-head/con-funcion.html`.
- Sin diff en `vercel.json`, `prisma/`, `openspec/specs/`, `astro.config.mjs`, `next.config.ts`, `package*.json` ni `spikes/`.
- Sin dependencias nuevas. No hay `clientAddress` en `src/`.
- Secretos y datos: en las pruebas, la contraseña y el secreto se generan con `randomBytes`. Los números de 10 dígitos son `771999…` o ids `c5a…`. Las fixtures no traen el valor de ninguna cookie. No hay correos.
- Cambios al spec, proposal y design hechos por el dev: corresponden exactamente a las decisiones 4 a 7 del fundador y no tocan nada más.
- `scripts/servir-salida-vercel.mjs` y `tests/salida-astro.ts` son infraestructura de pruebas (arreglo de O6), fuera de `src/`. Los acepto.

## Hallazgos propios

- **E1 (editorial, corregido):** `proposal.md`, en "Candidatos a ticket", citaba `src/lib/admin/limite-ip.ts`, que no existe. Ahora dice `src/lib/registro/limite-ip.ts`.
- **E2 (editorial, corregido):** el título de `tests/plataforma-astro-panel-acceso.test.ts:136` decía "(primer valor…)", lo contrario de la decisión 7. Cambié solo el título y volví a correr el archivo: 16/16.
- **B1 (bajo, al PR):** `analitica-exclusion-admin` ya no compara la política de las pantallas de 5b a 5d, que siguen en Next, con `src/app/admin/layout.tsx` (desviación 6 del dev). Next no se sirve en esta rama. Se cierra solo en T-027, o en 5b a 5d al migrar esas pantallas.
- **B2 (bajo, preexistente):** `.fotos-test` queda con 1 foto (2 variantes) después de la suite. La dejan `layout.test.ts` y `analitica-exclusion-admin.test.ts` (por `sembrarNegociosDemo`). Lo reproduje igual en el árbol de HEAD. Las 26 pruebas nuevas o tocadas por 5a, corridas juntas, dejan 0 negocios, 0 reportes y 0 filas de `IntentoDeCupo`.
- **B3 (bajo, preexistente; es O1 de C):** confirmé `/admin/cola//` → 301 y `POST /admin/cola//?_action=aprobar` → 308. Las dos salen sin las cuatro cabeceras y sin `Cache-Control`, con cuerpo vacío y sin open redirect. Ya está en "Candidatos a ticket".
- Las observaciones de C:
  - **M1:** resuelto. Lo verifiqué con mutación (abajo).
  - **O2 a O5:** preexistentes, ya en "Candidatos a ticket" o documentadas.
  - **O6:** resuelto. Los emuladores usan copias propias de la salida en `.vercel/salidas-de-pruebas/`, que quedó vacía tras las dos suites y los subconjuntos, sin copias huérfanas. `TRACE` ya no tumba el emulador (prueba nueva en verde).

## Compuertas (ejecutadas por mí, desde limpio)

| Compuerta | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run lint` | 0 errores (453 archivos) |
| `npm run typecheck` ("Revisar tipos") | exit 0, 0 errores |
| `npm run build` con `DATABASE_URL` en `127.0.0.1:1` | Complete |
| CI en orden sobre PostgreSQL 16 real desechable (`d5asuite`, puerto 55581): `migrate deploy`, `db:seed`, `vitest run --no-cache` | **177/177 archivos, 4479 pasan, 2 xfail, 0 saltadas** |
| `prisma dev --name d5apglite`: lo mismo | **177/177 archivos, 4471 pasan, 2 xfail, 8 saltadas** (concurrencia con aviso) |

## Diff de HTML contra Next de `origin/main` (`8d514f5`)

Montaje: Next de un worktree mío de `origin/main`, 4 procesos (configurado, sin configurar, sin secreto y secreto de 31). Astro de una copia del árbol, 4 emuladores. Una base espejo propia (`d5adiff`), el mismo secreto ficticio y `REGISTRO_ENCABEZADO_IP=x-forwarded-for`.

- `--solo-5a`: **65 "igual" (52 rutas o estados + 13 envíos), exit 0, "Cero diferencias en el panel (5a)"**. Diferencias aceptadas que imprime el arnés:
  - `Referrer-Policy` bajo `/admin`: 31;
  - cuerpo vacío del 307: 21.

  Normalizaciones aplicadas: de formulario 8 + 8 (el acceso ×6 y la cola ×2) y de 404 dinámica 3 × 6 (el comodín).
- El resto de las fases, en la medida en que el montaje lo permitió:
  - público 2a/2b con `--rutas` (29 rutas con el seed demo): 26 iguales. Las 3 restantes (`/api`, `/negocio`, `/no-existe`) son las 404 dinámicas, que con `--rutas` no reciben las 3 normalizaciones aceptadas de 2b. No las cuento como regresión;
  - `--solo-3a`: 19 rutas iguales;
  - `--solo-3b`: 29 iguales, exit 0;
  - `--solo-3b2 --verificacion apagada`: 73 iguales.

  En 3a y 3b-2 los envíos no corrieron por mis datos de arnés incompletos (sin fotos ni Storage falso). **No hice** el diff completo con fotos.
- Cruce de cookies: la cookie firmada a mano abre la cola de Astro (200) y la de Next (200).

## Reproducido por mí (salida construida, emulador; no confío en los reportes)

- **(a) Guarda:** 27 formas de ruta × 7 métodos (GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS) × con y sin `?_action=aprobar`, sin sesión: **378 peticiones, 0 con 200 o con datos**. Entre las formas: `//admin`, `/ADMIN`, `/admin/COLA`, barra final, `/%61dmin`, `/admin/%63ola`, `%2563`, `/admin%2F`, `..%2f`, `/./`, `;`, `%00`, `%20`, `_action` repetido o vacío, `%5Faction`, `/_actions/{entrar,salir,aprobar}` y `/admin/_actions/…`.
  - lo que Astro resuelve a una pantalla del panel responde 307/303 a `/admin`;
  - el resto responde 404.
- **(b) Sesión:** sin cookie, firma alterada, otro secreto, caducada 1 s, ceros a la izquierda, 16 dígitos, malformada, vacía, truncada, tres partes y hex: las 11 dan 307 sin datos. El control con una cookie válida da 200.
  - Sin secreto, con secreto de 31 o sin contraseña: la cookie válida no abre (307) y `/admin` dice "no está disponible" sin campo.
  - Salir: `nu_panel=; Max-Age=0; Path=/admin; HttpOnly; Secure; SameSite=Lax`.
- **(c) Límite de intentos (PostgreSQL real):**
  - ráfaga paralela de 60 con el primer valor de XFF rotado: **5 filas, 5 comparadas**, 2 cookies (aciertos dentro del margen) y 0 cookies en los 55 `?error=intentos`;
  - dos procesos alternados contra la misma base: el 6.º da `intentos`;
  - 7 IPs distintas en el último salto, con `x-real-ip` fijo: 7 `incorrecta`. La llave sale del último valor de `x-forwarded-for` (`ipDeEncabezados`).
- **(d) Destinos:** `next=`, `destino=` y `redirect=` (en la query y en el cuerpo) y un `Referer` ajeno no cambian el `Location` de `entrar` ni de `salir`.
- **(e) Cabeceras:** en 200 (acceso y cola), 307, 303 (entrar), 403 (origen ajeno), 404 (comodín y Action ajena) y 500 (base caída):
  - `Referrer-Policy: strict-origin`, `no-store`, `nosniff`, `DENY` y CSP;
  - sin `<script>` ni Umami, y sin `x-powered-by` en el 500;
  - `<meta name="referrer">` en los documentos;
  - robots `noindex, nofollow` en las pantallas y solo `noindex` en la 404.

## Mutaciones propias (todas revertidas y comprobadas con `cmp` contra el árbol)

| Mutación | Resultado |
|---|---|
| `src/app/admin/accion-nueva.ts` con `prisma.negocio.update` sin guarda (la de C) | 1 falla en `admin-adversarial` ("no llama a la guarda") |
| `src/pages/admin/nueva.astro` que lee la base, sin alta y sin guarda | 5 fallas: disciplina, enumeración de la build (nombra `/admin/nueva`), prerender y medición ×2. Servida sin sesión, GET/HEAD/POST/PUT dan 307 a `/admin`, `?_action=x` da 303, y nunca sale el contenido |
| La guarda deja pasar todo `POST` sin sesión | 6 fallas (303/307 medidos, 7 MiB sin leer, guarda antes de la tabla, `?_action=` y métodos raros) |
| El middleware sin `conReferenteDelPanel` (sin `strict-origin` en `/admin`) | 5 fallas (`despliegue`, cabeceras 200…500, formas raras, salir con origen ajeno) |
| `client:load` en el `BotonSalir` de la cola | 3 fallas (guardián de hidratación y diff de la cola ×2) |

## Muestreo

- Leí el código nuevo completo: `guardia.ts`, `acceso.ts`, `parametros.ts`, `entrar.ts`, `peticion.ts`, las 4 páginas, `DocumentoPanel` y `NoEncontradoDelPanel`.
- Revisé el diff de los 17 archivos de pruebas modificados:
  - ninguno pierde `expect(` (`admin-adversarial` pasa de 176 a 189, `admin-acceso` de 55 a 68);
  - no hay `skip`, `only` ni `todo` nuevos;
  - el guardián de `admin-adversarial` vuelve a recorrer todo `src/app/admin/` y además `src/pages/admin/` y `src/astro/panel/`.
- El `grep` de imports del §9 sale vacío. `cola/page` solo aparece en las dos excepciones.

## Pendiente humano (tarea 18) y CI

Va en el PR: la lista de la tarea 18 y los candidatos a ticket. El CI de GitHub Actions (`ci`) tiene que quedar en verde en el PR. Un Vercel en rojo es esperado mientras #40 no se mergee. El merge lo hace un humano, después de #37 y #38.
