# Estrategia de lanzamiento — NecesitoUno Tizayuca

**Versión:** 0.1 · **Fecha:** 4 de septiembre de 2026 · **Estado:** Borrador de trabajo

> Este documento aterriza el plan de lanzamiento del PRD (§9) en números semana por semana y en un calendario operable por **una sola persona**. Todo lo que aparece aquí como proyección son **hipótesis a calibrar con datos reales de Umami**, no promesas. Los umbrales de decisión son los del PRD §10 — esos sí son compromisos.

---

## 1. Proyección de registros por semana (12 semanas)

### Cómo leer estas tablas

La proyección separa dos motores que no se deben mezclar (el PRD §10 exige marcar el origen de cada ficha justo por esto):

- **Siembra** = altas por cambaceo (Fase 0 del §9). Las controla el fundador con horas de calle: es la única palanca directa. Sembrar valida logística, **no** valida el objetivo (a) del §4.
- **Orgánico** = negocios que se registraron solos, sin cambaceo. Es la métrica que valida el producto (PRD §10: meta ≥ 15 a 60 días). Arranca en cero hasta que empieza la difusión en la semana 3.

**Restricción dura que acota todo:** la revisión manual del admin aguanta ~10-15 registros por semana (PRD §11). Ningún escenario debería planear sostenidamente por encima de eso sin activar la bandera de verificación por SMS (ADR-011).

Los umbrales del §10 caen así en el calendario: **día 30 ≈ fin de la semana 4** (contando desde el inicio de la siembra) y **día 60 ≈ fin de la semana 8 / inicio de la 9**.

### Supuestos por escenario (explícitos y discutibles)

| Supuesto | Conservador | Base | Optimista |
|---|---|---|---|
| Salidas de cambaceo por semana (sem. 1-2) | 2 | 3 | 4 |
| Visitas por salida | 6 | 8 | 10 |
| Tasa de aceptación (visita → ficha enviada) | 25% | ~40% | 50% (topada por el admin) |
| Altas sembradas/semana en sem. 1-2 | ~3-4 | ~10 | ~14 (tope operativo) |
| Orgánicas/semana una vez difundido (sem. 3-8) | ~1 | 2-4 | 4-7 |
| Orgánicas/semana con SEO + boca en boca (sem. 9-12) | ~2 | 4-5 | 8-9 |

La tasa de aceptación del escenario base (~40%) sale de que el cambaceo del §9 no es venta fría pura: es una oferta gratuita, en persona, a negocios sub-digitalizados (solo 5.6% de las pymes tiene página web, §2) cuyo canal ya es WhatsApp (92.6% de uso, §2). Aun así es el supuesto más frágil del documento: **las primeras 2 salidas reales lo calibran**.

### Escenario BASE

| Semana | Siembra (nuevas) | Orgánicas (nuevas) | Total acumulado | Orgánicas acum. |
|---|---|---|---|---|
| 1 | 10 | 0 | 10 | 0 |
| 2 | 10 | 0 | 20 | 0 |
| 3 | 3 | 2 | 25 | 2 |
| **4 (día 30)** | 3 | 3 | **31** | **5** |
| 5 | 0 | 3 | 34 | 8 |
| 6 | 0 | 3 | 37 | 11 |
| 7 | 0 | 3 | 40 | 14 |
| **8 (día ~60)** | 0 | 4 | **44** | **18** |
| 9 | 0 | 4 | 48 | 22 |
| 10 | 0 | 4 | 52 | 26 |
| 11 | 0 | 4 | 56 | 30 |
| 12 | 0 | 5 | 61 | 35 |

**Contra los umbrales del §10:**

- Día 30: 31 publicados (umbral: si <25, intensificar cambaceo) ✓ con poco margen.
- Día 30: 5 orgánicas (umbral: si <5, revisar difusión y formulario) — **justo en la raya**. Vigilarlo cada semana, no cada mes.
- Día 60: 44 publicados vs meta de 50 — el base llega a 50 en la **semana 10**, no en la 8. Es honesto decirlo: si a los 30 días vamos como el base, conviene 1 salida extra de cambaceo por semana en las semanas 5-6 para cerrar la brecha, en lugar de esperar a que el orgánico la cierre solo.
- Día 60: 18 orgánicas vs meta ≥ 15 ✓ — el objetivo (a) del §4 se valida.

### Escenario CONSERVADOR

| Semana | Siembra (nuevas) | Orgánicas (nuevas) | Total acumulado | Orgánicas acum. |
|---|---|---|---|---|
| 1 | 4 | 0 | 4 | 0 |
| 2 | 4 | 0 | 8 | 0 |
| 3 | 3 | 1 | 12 | 1 |
| **4 (día 30)** | 3 | 1 | **16** | **2** |
| 5 | 4 | 1 | 21 | 3 |
| 6 | 4 | 1 | 26 | 4 |
| 7 | 3 | 1 | 30 | 5 |
| **8 (día ~60)** | 3 | 1 | **34** | **6** |
| 9 | 0 | 2 | 36 | 8 |
| 10 | 0 | 2 | 38 | 10 |
| 11 | 0 | 2 | 40 | 12 |
| 12 | 0 | 2 | 42 | 14 |

**Contra los umbrales:** a los 30 días hay 16 (<25) → **se dispara el umbral del §10: intensificar cambaceo** (por eso la siembra sube en las semanas 5-8 en vez de apagarse). Orgánicas a 30 días: 2 (<5) → **segundo umbral disparado: revisar difusión y formulario**. A los 60 días: 34 publicados y 6 orgánicas — el MVP **todavía no valida** el objetivo (a). Este escenario no es fracaso, es el que dice "el problema está en la difusión o en el formulario, arréglalo antes de escalar nada".

### Escenario OPTIMISTA

| Semana | Siembra (nuevas) | Orgánicas (nuevas) | Total acumulado | Orgánicas acum. |
|---|---|---|---|---|
| 1 | 14 | 0 | 14 | 0 |
| 2 | 14 | 0 | 28 | 0 |
| 3 | 4 | 4 | 36 | 4 |
| **4 (día 30)** | 2 | 5 | **43** | **9** |
| 5 | 0 | 6 | 49 | 15 |
| 6 | 0 | 6 | 55 | 21 |
| 7 | 0 | 7 | 62 | 28 |
| **8 (día ~60)** | 0 | 7 | **69** | **35** |
| 9 | 0 | 8 | 77 | 43 |
| 10 | 0 | 8 | 85 | 51 |
| 11 | 0 | 9 | 94 | 60 |
| 12 | 0 | 9 | 103 | 69 |

**Contra los umbrales:** todo en verde desde el día 30. La meta de 50 cae en la semana 6. **Ojo:** las 14 altas/semana de las semanas 1-2 ya están en el tope de lo que la revisión manual aguanta (§11: 10-15/semana), y si el orgánico sostiene 8-9/semana más las ediciones de fichas existentes, este escenario **dispara el criterio de automatización del §11** — es el momento de prender la bandera de SMS (ADR-011), no antes. El "problema" del optimista es de cola de revisión, no de demanda; buen problema, pero hay que verlo venir.

### Nota de honestidad intelectual

Nadie sabe cuántas orgánicas trae un post en un grupo de Facebook de Tizayuca. Estos números son hipótesis con un solo propósito: **tener algo contra qué comparar el dato real de Umami cada domingo** (ver §4 de este documento). A las 2 semanas de difusión, la proyección se reescribe con datos; conservarla intacta contra la evidencia sería el error, no la desviación.

---

## 2. Estrategia de canales por audiencia

Dos audiencias, dos embudos, canales distintos (PRD §5). No mezclar los mensajes: al negocio se le vende aparecer; al vecino se le resuelve una necesidad.

### 2.1 Oferta — dueños de negocio

**Canal principal: cambaceo (puerta a puerta).** Es el único canal de Fase 0 y el único que el fundador controla al 100%. Colonias ancla del §9: Centro, Haciendas de Tizayuca y Fuentes/Geovillas, más deportivos y canchas para los 5-10 clubes deportivos (el gancho de difusión del lanzamiento: "por fin un lugar para encontrar dónde entrenar en Tizayuca").

Guion sugerido de 30 segundos (calibrarlo en las primeras visitas):

> "Buenas — ¿usted es el dueño/la encargada? Le quito 30 segundos. Estoy armando **NecesitoUno**, un directorio de negocios de Tizayuca: los vecinos buscan 'necesito un plomero', 'necesito una fonda', y les sale su negocio con un botón para mandarle WhatsApp directo. **Es gratis y no hay que hacer cuenta ni contraseña**: se registra aquí desde su celular en 3 minutos, yo lo verifico y queda publicado. ¿Le paso el link o lo llenamos de una vez?"

Reglas del cambaceo: siempre con permiso y consentimiento registrado (LFPDPPP, §8-§9 del PRD); si no está el dueño, dejar el link por WhatsApp y anotar el pendiente; nunca llenar el formulario *por* el negocio sin que él lo vea — el % de registros completados sin ayuda (>70%, §10) es una métrica del MVP y sembrar con demasiada asistencia la contamina.

**Canal de cierre: WhatsApp directo.** Muchos no se registran en el momento; el seguimiento es un mensaje al día siguiente con el link. WhatsApp es el hábitat natural de esta audiencia (§2: 92.6% de uso) — un mensaje, no cinco.

**El multiplicador: el efecto "comparte tu ficha".** Al publicarse, cada negocio recibe por WhatsApp el link de su ficha (§7, Flujo A). Pedirle explícitamente que lo comparta: en sus estados de WhatsApp, con sus clientes, en su Facebook. El negocio presume "ya estoy en internet, verificado" — y cada ficha compartida es distribución gratuita hacia vecinos (así lo plantea el §9: "el negocio mismo se vuelve distribuidor"). Esto convierte cada alta de oferta en un empujón de demanda.

### 2.2 Demanda — vecinos de Tizayuca

**Canal principal: grupos de Facebook de vecinos y compra-venta de Tizayuca.** Ahí ya vive la demanda y la confianza local (§3: son la competencia real; §9: la estrategia es usarlos como canal, no pelearles). La táctica correcta **no es publicar "conoce el nuevo directorio"** — eso es spam y los admins lo borran. Es:

- **Responder preguntas reales con fichas concretas.** Cuando alguien pregunta "¿alguien sabe quién arregle lavadoras por Haciendas?", responder con el link de la ficha del técnico verificado: útil, específico, bienvenido. Cada respuesta así es el producto demostrándose en su momento exacto de uso ("necesito uno").
- Publicar como máximo 1 post propio por grupo por semana, y que sea contenido útil (ej. "los 8 talleres verificados de Tizayuca, con WhatsApp directo"), no autopromoción desnuda.
- Presentarse con los admins de los grupos antes de publicar; algunos se vuelven aliados.
- El bloque "Deporte en Tizayuca" (§6.5) es el mejor contenido de arranque: no existe oferta municipal, y "¿dónde meto a mi hijo a futbol/box?" es pregunta recurrente en esos grupos.

**Capa de marca: TikTok.** No es canal de conversión directa en un municipio — es cómo la marca se vuelve reconocible ("ah, los del directorio"). Formato corto, hiperlocal, cero producción. 5 ideas concretas:

1. **"¿Sabías que en Tizayuca hay…?"** — serie descubriendo clubes y escuelas deportivas (box, taekwondo, ligas): el vacío de información del §6.5 convertido en contenido. Cierra con "está en NecesitoUno".
2. **"Pedir un plomero en el grupo de Facebook vs. en NecesitoUno"** — pantalla dividida: 40 comentarios desordenados y sin número, contra buscar → ficha → botón de WhatsApp. El problema del §3 en 20 segundos.
3. **Recorrido de 30 segundos por un negocio verificado** (con permiso del dueño): la fonda, el taller, la estética — "de vecino a vecino". Al negocio le encanta y lo recomparte (multiplica el efecto ficha).
4. **Building in public del cambaceo:** "Día 9 sembrando el directorio de Tizayuca: vamos 23 negocios, hoy me tocó la Zona Industrial". El repo ya es público; la calle también puede serlo. Genera simpatía local y atrae negocios que piden ser visitados.
5. **"Cosas que solo entiendes si vives en Tizayuca"** (los 43.9 minutos al trabajo del §2 dan material solo) — humor local que termina resolviendo una necesidad real con el buscador en pantalla.

**Canal subestimado: WhatsApp Estados.** En municipios como Tizayuca los estados funcionan como tablón del pueblo: los ven cientos de contactos sin algoritmo de por medio. Tres usos: (1) el fundador publica cada ficha nueva en sus estados ("negocio verificado #31: tacos El Güero, Huicalco"); (2) se le pide a cada negocio publicado que suba su ficha a sus estados — sus contactos son exactamente sus clientes potenciales; (3) los hitos ("ya somos 40 negocios verificados") también van ahí. Costo cero, fricción cero, y llega justo a la gente que ya confía en quien lo publica.

**Alianza institucional (explorar, no depender):** el ayuntamiento / desarrollo económico municipal lleva registro de 4,383 establecimientos (§2) y puede dar legitimidad y difusión (§9). Un correo y una visita en la semana 4; si no fructifica, el plan no depende de ella.

---

## 3. Calendario de las primeras 4 semanas (para una persona)

Supuesto de sostenibilidad: el fundador tiene trabajo, familia y vida. Este calendario asume **~2 horas los días laborales y una mañana de sábado**, con el domingo casi libre (solo la revisión semanal de 30 min). Las salidas de cambaceo son de ~2 horas y se hacen 3 veces por semana (escenario base). Si una semana solo caben 2 salidas, se recorre — mejor lento que quemado.

### Semana 1 — Siembra en colonias ancla (Fase 0)

| Día | Qué hacer (bloque de ~2 h) |
|---|---|
| Lunes | Preparación final: ruta de cambaceo de la semana (Centro), guion impreso/en el cel, verificar que Umami registra eventos y que el aviso de privacidad y términos están en línea. |
| Martes | **Cambaceo #1: Centro** (~8 visitas). En la noche: registrar pendientes y mandar el link por WhatsApp a los que dijeron "luego lo lleno". |
| Miércoles | Revisar cola del panel: verificar por WhatsApp y aprobar lo que llegó (meta <48 h, §10). Seguimiento a los "luego". |
| Jueves | **Cambaceo #2: Haciendas de Tizayuca** (~8 visitas). |
| Viernes | Cola de revisión + seguimientos. Validar en campo la lista de colonias del Apéndice A con lo aprendido en las visitas. |
| Sábado | **Cambaceo #3: deportivos y canchas** (mañana: es cuando entrenan) — arrancar los 5-10 clubes deportivos del §9. |
| Domingo | 30 min: fila de la semana en la bitácora de medición (ver §4). Ajustar el guion si la aceptación real difiere del supuesto. |

### Semana 2 — Completar la siembra

| Día | Qué hacer |
|---|---|
| Lunes | Cola de revisión + seguimiento a todos los pendientes de la semana 1 (un solo mensaje de recordatorio, no insistir más). |
| Martes | **Cambaceo #4: Fuentes/Geovillas** (~8 visitas). |
| Miércoles | Cola de revisión. Empezar a pedir a los ya publicados que compartan su ficha (estados de WhatsApp, su Facebook). |
| Jueves | **Cambaceo #5: segunda pasada Haciendas** (es el fraccionamiento más grande, ~14,000 viviendas — aguanta dos pasadas). |
| Viernes | Cola de revisión. Preparar el lanzamiento: lista de 5-8 grupos de Facebook de Tizayuca, mensaje a sus admins presentándose, borrador del post de lanzamiento (ángulo: "Deporte en Tizayuca"). |
| Sábado | **Cambaceo #6: clubes deportivos faltantes** + cerrar huecos (giros sin representación en el catálogo del Apéndice B). |
| Domingo | Revisión semanal. Checkpoint de Fase 0: ¿hay ≥20-25 fichas publicadas y variadas? Si sí, se lanza. Si no, la semana 3 sigue siendo de siembra — **no difundir un directorio vacío** (lección Yumbling, §11: utilidad desde el día uno). |

### Semana 3 — Lanzamiento público (arranca Fase 1)

| Día | Qué hacer |
|---|---|
| Lunes | Publicar el post de lanzamiento en los 2-3 grupos de Facebook más activos (ya con el visto bueno de sus admins). Fundador y negocios publicados suben la noticia a sus estados de WhatsApp. |
| Martes | **Monitoreo activo de grupos** (30-45 min, 2 veces al día): responder preguntas reales con fichas. Cola de revisión — pueden llegar las primeras orgánicas. |
| Miércoles | Grabar y subir el primer TikTok (idea 1 o 2 del §2.2). Cola de revisión. |
| Jueves | **Cambaceo #7 (refuerzo ligero):** 1 salida corta a la colonia con menos fichas. Monitoreo de grupos. |
| Viernes | Cola de revisión + responder en grupos. Post útil #2 en un grupo distinto al del lunes. |
| Sábado | Libre (o TikTok #2 si hay energía — el building in public del cambaceo se graba solo). |
| Domingo | **Primera revisión semanal con datos orgánicos**: visitantes únicos, clics a WhatsApp/vistas, ¿cayó la primera alta orgánica? Comparar contra la tabla del §1. |

### Semana 4 — Ritmo de crucero (cierra en el día 30)

| Día | Qué hacer |
|---|---|
| Lunes | Cola de revisión. Contactar a desarrollo económico municipal (correo + WhatsApp) para explorar la alianza del §9. |
| Martes | Monitoreo de grupos + responder con fichas. Seguimiento a negocios publicados: ¿ya compartieron su ficha? |
| Miércoles | TikTok #3 (recorrido de un negocio, con permiso). Cola de revisión. |
| Jueves | **Cambaceo #8 (refuerzo):** 1 salida corta. Monitoreo de grupos. |
| Viernes | Cola de revisión. Post útil en grupos ("los N talleres verificados de Tizayuca"). |
| Sábado | Libre. |
| Domingo | **Corte del día 30 — el importante.** Contra el §10: ¿≥25 publicados? ¿≥5 orgánicas? Decidir con la tabla de umbrales del §4 qué se intensifica en las semanas 5-8. |

A partir de la semana 5 el patrón se repite: lunes/viernes grupos y cola, miércoles contenido, jueves cambaceo solo si los umbrales lo piden, domingo revisión. El cambaceo deja de ser el motor y pasa a ser la herramienta correctiva.

---

## 4. El bucle de medición (Umami vs. proyección, cada semana)

Instrumentado desde el día 1 (§9): Umami cookieless con los eventos definidos — formulario iniciado, formulario enviado, vista de ficha, clic a WhatsApp, clic a llamar, clic a cómo llegar — excluyendo bots y crawlers (el tráfico SEO inflaría las vistas y ensuciaría la conversión, §9).

**Ritual del domingo (30 minutos, sin excepción).** Una fila por semana en una tabla simple (sirve un archivo en el repo o una hoja de cálculo):

| Qué mirar en Umami | Contra qué compararlo (§10) |
|---|---|
| Visitantes únicos de la semana | Meta: 300/semana. Si no llega, redoblar distribución en grupos de Facebook |
| Clic a WhatsApp / vistas de ficha | Meta >15% (aspiracional; el benchmark GBP es ~4.68%, así que validar, no asumir). Si a las 4 semanas está <8-10%, rediseñar la ficha antes de escalar adquisición |
| Formulario enviado / formulario iniciado | Proxy del ">70% completados sin ayuda". Si mucha gente inicia y no envía, simplificar el formulario |
| Referers (¿de dónde llegan?) | ¿Qué grupo de Facebook trae tráfico de verdad? Duplicar esfuerzo ahí, soltar los que no |
| Fichas más vistas y búsquedas frecuentes | Qué giros demanda la gente → dirigir el próximo cambaceo a esos giros/colonias |

Y del panel (no de Umami): altas de la semana separadas **siembra vs. orgánico** (el campo de origen del §6.3 existe para esto), tiempo registro→publicación (<48 h), y distribución por colonia (señal de foco del §10: si >60% de las altas viene de <3 colonias, concentrarse ahí y no dispersarse).

Cada fila se compara contra la tabla del escenario base del §1. Dos semanas seguidas por debajo del conservador = actuar, no esperar al corte de 30 días.

**Las 2 señales de alarma temprana (los umbrales de 30 días del §10):**

1. **Menos de 25 negocios publicados al día 30** → intensificar cambaceo. Es la alarma de oferta: la palanca es más horas de calle, y es la única alarma que el fundador arregla solo con esfuerzo.
2. **Menos de 5 altas orgánicas al día 30** → revisar difusión y formulario. Es la alarma grave: la siembra manual no valida el objetivo (a) del §4 — si nadie se registra solo, el producto aún no demuestra su hipótesis central, por más fichas sembradas que haya.

---

## 5. Lo que NO hacer al inicio

- **No pagar publicidad antes de validar.** Ni ads de Facebook ni promocionar TikToks mientras la conversión de la ficha no esté validada (clic a WhatsApp/vistas <8-10% = rediseñar antes de escalar adquisición, §10). Pagar tráfico hacia un embudo no validado es comprar datos caros de algo que Umami dice gratis. Los canales del §2 cuestan cero y todavía no están saturados.
- **No abrir una segunda ciudad.** La marca NecesitoUno permite expandir a Pachuca (§11), y esa será la tentación exacta cuando algo funcione. El PRD es explícito: otras ciudades están fuera del MVP (§4, §6.6). Un directorio a medias en dos ciudades vale menos que uno útil en una — Cornershop sembró una sola ciudad (§9).
- **No prometer features a los negocios.** En el cambaceo van a pedir reseñas, pagos, pedidos, destacados. Todo eso está fuera de alcance (§6.6) y prometerlo crea deuda de confianza con la audiencia que más cuesta conseguir. Respuesta honesta: "hoy el directorio hace esto; si funciona, viene más" — y anotar cada petición, que es investigación de producto gratis (§12 ya tiene la lista de candidatas).
- **No automatizar la verificación antes del umbral.** La curaduría manual es el diferenciador (§6.3), y el §11 fija el disparador: sostenidamente >10-15 registros/semana. Antes de eso, prender el SMS (ADR-011) es resolver un problema que no existe.
- **No spamear los grupos de Facebook.** Son el canal principal de demanda y la vía de un baneo es la autopromoción repetida. La regla del §2.2: responder preguntas reales con fichas, máximo 1 post propio por grupo por semana.
- **No sembrar fichas a espaldas del negocio.** Cada ficha sembrada lleva permiso y consentimiento registrado (§9, LFPDPPP §8). Un directorio scrapeado sin consentimiento es exactamente la competencia débil que el §3 describe — y un riesgo legal en un repo público.
