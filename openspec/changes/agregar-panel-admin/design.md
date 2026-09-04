# Diseño técnico: agregar-panel-admin

Decisiones no obvias que la implementación debe respetar. Antes de tocar código, leer la guía correspondiente en `node_modules/next/dist/docs/` (esta versión de Next.js difiere de lo conocido; ver `AGENTS.md` de la raíz), en particular lo relativo a `cookies()`, Server Actions, `redirect()`, `generateMetadata` y rutas dinámicas con `params` asíncronos.

## 1. Sesión: cookie firmada con HMAC del propio Node, sin dependencias nuevas

El ticket pide justificar cualquier librería. No hace falta ninguna: el panel tiene un solo usuario y un solo secreto, así que la sesión es un valor firmado, no una base de sesiones.

- **Formato del valor**: `<caducidad en epoch>.<firma>`, donde la firma es un HMAC-SHA256 de la caducidad (y de un identificador de versión del formato) con el secreto de entorno. No lleva datos personales ni la contraseña.
- **Verificación**: se compara la firma con `crypto.timingSafeEqual` (comparación en tiempo constante) y se revisa la caducidad. Cualquier fallo —firma alterada, secreto distinto, formato raro, fecha vencida— se trata como "no hay sesión", sin distinguir el motivo en la respuesta.
- **La contraseña también se compara en tiempo constante**, sobre el hash de ambas cadenas para no filtrar longitud.
- **Atributos**: `HttpOnly`, `SameSite=Lax`, `Path` acotado a la ruta del panel, `Max-Age` de 8 horas y `Secure` cuando el sitio se sirve por HTTPS. `Lax` en lugar de `Strict` porque el admin va a abrir el panel desde un enlace pegado en su propio WhatsApp, y con `Strict` esa navegación entrante lo dejaría fuera; el riesgo de CSRF que `Strict` cubriría de más ya lo cubren las Server Actions de Next (que verifican el origen) y el hecho de que ninguna transición es un GET.
- **Salir** borra la cookie. No hay lista de sesiones revocadas: rotar el secreto de entorno invalida todas, que es la única "revocación" que un panel de un solo admin necesita.

## 2. Fail-safe: sin configuración no hay panel, y el porqué no viaja en la respuesta

Una sola función decide si el panel está configurado (contraseña presente y no vacía + secreto de firma presente y de longitud suficiente). Si dice que no:

- la pantalla de acceso muestra "El panel no está disponible por ahora." y **no pinta el campo de contraseña** (no hay nada que escribir);
- la verificación de sesión devuelve siempre "sin sesión", así que ninguna página del panel y ninguna transición se ejecutan, incluso si alguien fabrica una cookie;
- el detalle de qué falta se escribe **solo en el log del servidor**. A quien está afuera no se le dice si falta la contraseña o el secreto: es información gratis para preparar un ataque.

Nada de contraseñas por defecto, ni de "en desarrollo el panel se abre solo". Un panel que se abre solo en algún modo es un panel abierto: el error de configuración en producción es el escenario que este fail-safe existe para atrapar.

## 3. La guarda vive en cada página y en cada acción, no en un middleware

Tentación obvia: un `middleware.ts` que proteja `/admin/*`. Se descarta por dos razones: el middleware corre en un runtime distinto donde `node:crypto` no es de fiar, y —más importante— dejaría las Server Actions protegidas solo por la ruta desde la que se invocan, cuando en realidad son endpoints propios. Cada página del panel y cada acción llaman primero a la misma guarda (`requerirSesionAdmin()`), que redirige a la pantalla de acceso si no hay sesión válida.

Para que esa disciplina no dependa de la memoria de nadie, un test enumera los archivos de ruta y de acción bajo `src/app/admin/` y falla si alguno no invoca la guarda. Es el mismo patrón que `src/lib/directorio.ts` usa para el filtro de `publicado`: convertir una regla de seguridad en una propiedad verificable del código.

La redirección va a la ruta de acceso **sin parámetros**: nada de `?destino=` ni de identificadores de registro en la URL, que es donde se filtran datos por accidente (y donde quedan guardados en el historial y en los logs del proxy).

## 4. Antifuerza bruta del acceso reutilizando el límite por IP del registro

Una sola contraseña sin límite de intentos es una invitación. Se reutiliza el módulo de cupo por IP de T-003 (`src/lib/registro/limite-ip.ts`, con el encabezado de IP declarado por configuración) con una ventana propia para el acceso. Vale la misma advertencia que ahí: sin encabezado de IP confiable declarado no hay a quién atribuir los intentos, así que en producción esa variable es parte del despliegue, no un extra.

## 5. Las transiciones se aplican condicionadas al estado, no leyendo y luego escribiendo

Aprobar y rechazar se ejecutan como una escritura condicionada a que el registro siga en `en_revision` (un `updateMany` con el estado en el `where`, o equivalente): si la escritura no afecta ninguna fila, la transición no aplicaba y el panel muestra "Este registro ya lo habías resuelto." Leer primero y decidir después deja una ventana entre la lectura y la escritura en la que dos pestañas del admin sobrescriben la resolución de la otra —y con ella la fecha de publicación, los giros y el origen.

Después de resolver, la respuesta redirige a la pantalla de confirmación (POST-Redirect-GET, igual que el registro público): recargar no repite la transición.

Las páginas del directorio público leen la base en cada request (`force-dynamic`, T-004), así que aprobar publica la ficha de inmediato sin invalidar cachés. Cuando E5/E0-3 metan ISR habrá que revalidar aquí; queda anotado, no implementado.

## 6. Reenvío tras rechazo: se actualiza la ficha, no se crea otra

La unicidad de `whatsapp` es una constraint de base (T-001) y "una sola ficha por número" es una regla de producto: crear una segunda fila no es opción. El reenvío actualiza la fila existente con los datos nuevos, la regresa a `en_revision` y deja nulos `rechazadoEn` y `motivoRechazo`. **Enmienda (iteración 2 de seguridad, aprobada):** la constancia `consintioAvisoEn` NO se sustituye en el reenvío — es la evidencia LFPDPPP del titular y un reenvío (que en un formulario anónimo podría venir de un tercero) no debe moverla; el checkbox de consentimiento sigue siendo obligatorio en cada envío, y registrar la renovación de consentimiento del titular legítimo queda como ticket propio (columna adicional).

Dos consecuencias que hay que asumir a conciencia:

- **Se pierde el historial del rechazo anterior.** A cambio, la purga de 90 días (que se guiará por `rechazadoEn`) no borra un registro que ya volvió a la cola. Conservar el historial pediría una tabla aparte, que este ticket no justifica. Es la duda 3 de la propuesta.
- **`registradoEn` se actualiza al momento del reenvío**, porque es el reloj del indicador de 48 horas: si no se reinicia, todo reenvío entra a la cola ya marcado como atrasado y el indicador deja de significar algo.

Fuga de información acotada y aceptada: quien pruebe un número ajeno puede notar que un envío "pasa" (ficha rechazada) y otro devuelve el mensaje de duplicado (ficha publicada o en revisión). No ve ningún dato ni el motivo, las fichas publicadas ya son públicas, y el formulario sigue protegido por el cupo por IP y el campo trampa. Cerrar esa diferencia obligaría a mentirle al negocio legítimo que sí está corrigiendo su registro, que es justo el flujo que el PRD §6.3 promete. Sí queda un abuso posible: alguien que conozca un número rechazado puede pisar sus datos con basura. El daño es contenido —esa ficha no es pública y el admin la ve en la cola antes de publicar nada— y el remedio real (verificar el número) está fuera de alcance por el PRD §6.6.

## 7. El link de la ficha en el aviso de aprobación necesita la URL pública del sitio

El mensaje de WhatsApp lleva la URL **absoluta** de la ficha, porque va a viajar fuera del sitio. En el servidor no hay una forma confiable de deducir el dominio público (los encabezados de host los escribe quien pide), así que se lee de una variable de entorno con la URL del sitio. En desarrollo, el valor por defecto es la dirección local; si en producción falta, el panel debe fallar visiblemente al armar el mensaje en vez de mandar un link a `localhost` a un negocio real.

## 8. Textos del panel y plantillas de WhatsApp en un módulo, como el registro

Los tres mensajes prellenados y todos los literales del panel viven en un módulo propio (`src/lib/admin/textos.ts`), igual que `src/lib/registro/textos.ts`: son contenido aprobado en la spec, no copy libre. El nombre del negocio y el motivo se interpolan y se codifican al armar la URL de `wa.me`; el número pasa antes por `normalizarWhatsapp` (T-003) y, si no se puede normalizar, no se pinta enlace —el mismo criterio que la ficha pública con `tel:`.

## 9. La cota de 1 a 3 giros se valida en la acción, no solo en el formulario

La base admite cualquier número de giros a propósito (spec `modelo-datos`). El límite es una regla de producto del PRD §6.3 y se hace cumplir en la acción del servidor, no con `disabled` en las casillas: el formulario del panel también funciona sin JavaScript, así que el navegador no puede ser quien la sostenga.
