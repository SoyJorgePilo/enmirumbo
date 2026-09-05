# Tareas: agregar-aviso-diario-pendientes

Orden por dependencia. Cada tarea se puede terminar y comprobar por sí sola.

## 1. Configuración y documentación

- [ ] 1.1 Documentar en `docs/despliegue.md` §3.2 (tabla de opcionales) las tres variables nuevas: `RESEND_API_KEY` (secreto, credencial del proveedor), `AVISOS_CORREO_REMITENTE` (dirección en dominio verificado, ej. `avisos@enmirumbo.com`) y `AVISOS_CORREO_DESTINO` (buzón que recibe el aviso), cada una con qué pasa si falta: **sin cualquiera de ellas no se manda ningún correo y queda en el log**. *Comprobable:* `npm test -- despliegue` sigue en verde y las tres aparecen en el documento.
- [ ] 1.2 Agregar las tres variables a `.env.example`, vacías y con comentario. **Ninguna dirección de correo real** en el ejemplo (repo público, LFPDPPP). *Comprobable:* el archivo no contiene ninguna dirección real.
- [ ] 1.3 Mover la tarea de la purga en `vercel.json` de `17 9 * * *` a `17 13 * * *` (13:17 UTC ≈ 07:17 en Tizayuca), para que el correo esté en la bandeja al empezar el día. El barrido de fotos no se toca. *Comprobable:* `vercel.json` declara las mismas dos tareas y la de la purga con la hora nueva.
- [ ] 1.4 Ampliar `docs/despliegue.md` §6 (tareas programadas): la hora nueva de la purga con el porqué, que esa tarea además manda el aviso diario, el JSON de ejemplo con el estado del aviso, y el paso humano de verificar el dominio en Resend con los DNS de Namecheap. *Comprobable:* alguien que solo lea §6 sabe a qué hora sale el correo, qué esperar y qué hacer si no llega.

## 2. Puerto de correo

- [ ] 2.1 Crear el puerto en `src/lib/correo/` con una sola operación —mandar un correo de texto plano con asunto, cuerpo, destinatario, remitente y clave del día— y sus tipos de resultado: mandado, no configurado, fallido. *Comprobable:* compila y tiene pruebas de tipos/contrato con un adaptador de mentira.
- [ ] 2.2 Lector de configuración fail-safe: junta `RESEND_API_KEY`, `AVISOS_CORREO_REMITENTE`, `AVISOS_CORREO_DESTINO` y `SITIO_URL`; si falta cualquiera devuelve "no configurado" nombrando **cuál** falta, y deja constancia en el log **una sola vez por proceso** (mismo patrón que `avisarSinSecretoDeTareasUnaVez` en `src/lib/tareas/secreto.ts`). Nunca inventa valores por defecto. *Comprobable:* prueba con las cuatro combinaciones de hueco (nada, solo proveedor, sin destino, sin `SITIO_URL`) y prueba de que el log no se repite.
- [ ] 2.3 Adaptador Resend con `fetch`, cabecera `Idempotency-Key` y límite de espera propio con `AbortController`; traduce cualquier respuesta que no sea aceptación a "fallido", sin filtrar la credencial ni el destinatario completo en el mensaje de error. *Comprobable:* pruebas con `fetch` simulado para respuesta buena, error del proveedor y cuelgue (timeout).
- [ ] 2.4 Adaptador nulo (no configurado): no manda nada, no toca la red, informa "no configurado". *Comprobable:* prueba de que no se hace ninguna petición.

## 3. Qué se avisa

- [ ] 3.1 Función de conteo de pendientes que **reutiliza los criterios de `src/lib/admin/consultas.ts`** —los mismos que arman las dos secciones de la cola— y devuelve `{ altas, ediciones, reportes }`: altas `en_revision` + ediciones pendientes sin contar dos veces al mismo negocio, y los reportes sin atender contados por reporte. Sin consultas paralelas con reglas propias. *Comprobable:* prueba que arma una base con altas, publicados, rechazados, ediciones pendientes/aplicadas/descartadas, un publicado con edición pendiente y un `en_revision` con tres reportes pendientes, y verifica que los conteos coinciden con lo que pinta la cola.
- [ ] 3.2 Módulo de textos del aviso (al estilo de `src/lib/admin/textos.ts`): asunto en singular y plural con la suma de los tres tipos, cuerpo literal, las tres líneas en su orden fijo y omitidas cuando el conteo es cero, enlace `<SITIO_URL>/admin` y remitente presentado como "EnMiRumbo". *Comprobable:* pruebas de los literales exactos de la spec para 2+1+2, solo ediciones, solo reportes y un solo pendiente.
- [ ] 3.3 Prueba de privacidad del contenido: con una base sembrada con fichas ficticias completas y un reporte con comentario, ni el asunto, ni el cuerpo, ni el enlace contienen nombres, WhatsApp, colonias, comentarios de reportes ni identificadores. *Comprobable:* la prueba falla si alguien mete el nombre del negocio en el asunto.

## 4. El día

- [ ] 4.1 Fecha local de Tizayuca con `Intl.DateTimeFormat` sobre `America/Mexico_City` y clave del día `enmirumbo-pendientes-<AAAA-MM-DD>`. *Comprobable:* pruebas con reloj fijo a las 09:17 UTC, a las 02:00 UTC (que es el día anterior en local) y a las 20:00 locales, verificando qué claves coinciden y cuáles no.

## 5. Enganche en la tarea programada

- [ ] 5.1 Llamar al aviso desde `src/app/api/tareas/purgar-rechazados/route.ts` **después** del trabajo de la purga, y de forma independiente de su resultado: si la purga falla, el aviso se intenta igual; si el aviso falla, lo ya purgado queda purgado. *Comprobable:* pruebas de los cuatro cruces (purga bien/mal × aviso bien/mal).
- [ ] 5.2 Semántica de respuesta: el cuerpo suma el estado del aviso (mandado, sin pendientes, sin configurar, fallido); "fallido" responde 500 y "sin configurar" responde éxito. El log usa el prefijo `[aviso]` y no escribe datos de nadie. *Comprobable:* pruebas de código de respuesta y de cuerpo por cada estado.
- [ ] 5.3 Sin `CRON_SECRET`, o con secreto equivocado, la ruta sigue respondiendo el 404 vacío de siempre y **no se manda ningún correo**; la respuesta no gana ninguna cabecera ni cuerpo propios que la delaten. *Comprobable:* ampliar `tests/tareas-programadas.test.ts` con la comprobación de que el adaptador de correo no se llamó.
- [ ] 5.4 Ajustar `tests/purga-rechazados.test.ts` a la respuesta nueva sin aflojar ninguna de sus comprobaciones actuales. *Comprobable:* la suite completa en verde.

## 6. Idempotencia de punta a punta

- [ ] 6.1 Prueba de doble disparo: dos corridas seguidas el mismo día local mandan **una sola vez** con la misma clave, y el adaptador de mentira lo registra. *Comprobable:* el adaptador recibe dos peticiones con clave idéntica y la prueba afirma que la clave no cambió.
- [ ] 6.2 Prueba de que un envío que falló no gasta el día: tras un fallo, el siguiente disparo del mismo día vuelve a intentar. *Comprobable:* dos intentos, el segundo sí llega.

## 7. Cierre

- [ ] 7.1 Sumar a la prueba de humo de `docs/despliegue.md` §9 el paso manual: dejar un registro en la cola, disparar la tarea con `curl` y confirmar que el correo llega al buzón (y que no trae ningún dato del negocio).
- [ ] 7.2 Revisión final de alcance: ningún archivo nuevo declara `"use client"`, no hay migraciones ni cambios de esquema, y ninguna dirección de correo real quedó en el repo. *Comprobable:* `git diff` y la suite completa en verde.
