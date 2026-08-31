# PRD — NecesitoUno.com · Directorio de Negocios de Tizayuca (MVP)

**Versión:** 0.8 (propuesta) · **Fecha:** 31 de agosto de 2026 · **Estado:** Borrador

> Cambios v0.8: se cierran los huecos detectados en la validación técnica previa a la implementación — acceso del admin al panel (contraseña única, sin cuentas); catálogo cerrado de giros como base real de las páginas SEO, asignado por el admin al aprobar (nuevo Apéndice B); flujo de rechazo completo con aviso y retención de 90 días; política de duplicados (una ficha por número de WhatsApp); reglas de la foto; separación de métricas orgánicas vs sembradas con campo de origen; analítica cookieless con eventos definidos y exclusión de bots; normalización de la búsqueda (acentos, coincidencia parcial); reglas de moderación escritas; anti-abuso del formulario sin captcha; operación ARCO y retención; requisitos de accesibilidad; y expectativa realista del Schema LocalBusiness. Cambios v0.7: se adopta el nombre NecesitoUno.com — marca neutral que resuelve la pregunta abierta de branding y permite expandir a otras ciudades sin cambiar de nombre. Cambios v0.6: se agrega la categoría y el apartado destacado de clubes y escuelas deportivas — espacio inexistente en la oferta municipal, oportunidad de diferenciación y SEO sin competencia. Cambios v0.5: se integra la investigación de mercado — contexto de Tizayuca con datos INEGI, competencia real (Google Maps y grupos de Facebook), lista de colonias para el formulario, requisitos legales conforme a la LFPDPPP 2025, plan de lanzamiento en fases con umbrales de decisión, ajuste de la métrica de conversión con benchmark, y requisitos de SEO local. Cambios v0.4: autogestión de ediciones con enlace único de gestión; los cambios pasan a revisión antes de publicarse; flujo de recuperación de enlace perdido. Cambios v0.3: formulario ajustado — colonia obligatoria con lista cerrada, palabras clave, checkbox de entregas a domicilio y link opcional de Facebook. Cambios v0.2: verificación manual integrada en la revisión del admin (se elimina el código automático por WhatsApp).

## 1. Resumen

NecesitoUno.com es un sitio web donde los negocios de Tizayuca (restaurantes, servicios, comercios, clubes deportivos) pueden registrarse en minutos y aparecer en un directorio público que los vecinos consultan para encontrarlos y contactarlos, principalmente por WhatsApp. El nombre refleja el momento exacto del usuario: "necesito un plomero", "necesito una fonda", "necesito una escuela de futbol".

**Principio rector: máxima sencillez.** Si un dueño de fonda no puede registrarse solo desde su celular en menos de 5 minutos, el producto falló.

**Diferenciador: curaduría local y confianza** — cada negocio es verificado manualmente antes de publicarse ("negocios verificados, de vecino a vecino") y el contacto es directo por WhatsApp. No competimos con Google Maps en ser una base de datos; competimos en confianza vecinal y contacto inmediato.

## 2. Contexto de mercado (por qué ahora y por qué aquí)

Tizayuca es una de las ciudades de mayor crecimiento del país: 168,302 habitantes en el municipio (Censo 2020, INEGI), un crecimiento de 72.7% respecto a 2010; para 2026 la población real probablemente supera los 200,000. Es el único municipio de Hidalgo dentro de la Zona Metropolitana del Valle de México.

Es ciudad dormitorio: traslado promedio al trabajo de 43.9 minutos (Data México). Implicación de producto: los vecinos resuelven sus necesidades locales por celular y valoran el contacto inmediato — refuerza el botón de WhatsApp como acción central.

Universo de negocios: el ayuntamiento reportó 4,383 establecimientos registrados a enero de 2026 (~8.5 aperturas nuevas al mes); directorios privados reclaman hasta ~8,000. En Hidalgo, 95.7% de los establecimientos son micronegocios y ~50.9% opera en la informalidad (Censos Económicos 2019). El universo contactable real está entre ambas cifras — la meta de 50 negocios es <2% de ese universo.

La oferta está sub-digitalizada: a nivel nacional solo 5.6% de las pymes tiene página web propia y 13.2% redes sociales activas (INEGI); entre microempresas, solo ~23% usa computadora. Pero WhatsApp es universal: 92.6% de los internautas mexicanos lo usa (2024) y 81.7% accede a internet desde el celular. Esto valida las tres decisiones centrales del MVP: mobile-first, sin correo/contraseña, y WhatsApp como canal.

## 3. Problema y competencia

Los negocios locales dependen de recomendaciones de boca en boca y grupos de Facebook desordenados; los vecinos no tienen un lugar único y confiable para buscar "¿dónde arreglan lavadoras?".

**Competencia directa (débil):** existen directorios genéricos con páginas de Tizayuca (pymes.org.mx, yaloencontre.mx, agregadores del DENUE como PueblosAmerica), pero son bases scrapeadas, desactualizadas, sin verificación ni comunidad. Sección Amarilla dejó de imprimir en 2018-2019 y perdió relevancia como directorio de consulta.

**Competencia real (por la atención):** Google Maps —estándar de búsqueda local, aunque con cobertura incompleta de micronegocios no reclamados— y los grupos de Facebook de vecinos de Tizayuca, que ya concentran la demanda y la confianza local. Estrategia: no pelear contra ellos, usarlos como canal de distribución (ver §9).

## 4. Objetivo del MVP

Validar que: **(a)** los negocios están dispuestos a registrarse solos, y **(b)** los vecinos usan el directorio para encontrarlos y contactarlos.

No es objetivo del MVP: monetizar, tener app nativa, cubrir otras ciudades.

## 5. Usuarios

| Usuario | Necesidad | Contexto clave |
|---|---|---|
| Dueño de negocio | Aparecer en internet sin complicarse | Usa celular, no computadora (solo ~23% de microempresas usa PC); WhatsApp es su canal principal; poca paciencia para formularios |
| Vecino de Tizayuca | Encontrar un negocio o servicio rápido | Busca desde el celular; quiere WhatsApp y ubicación, no leer mucho |
| Admin del directorio | Revisar y aprobar registros rápido | Verifica manualmente cada negocio antes de publicarlo |

## 6. Alcance del MVP

### 6.1 Registro de negocio (P0)

Un solo formulario, una sola pantalla, desde el celular. Sin cuenta, sin contraseña, sin código de verificación: el negocio llena el formulario, lo envía y listo.

**Obligatorios (5):**

- Nombre del negocio
- Categoría (lista cerrada: Restaurantes y fondas, Servicios del hogar, Belleza, Salud, Abarrotes y comercio, Talleres, Clubes y escuelas deportivas, Otro)
- WhatsApp (10 dígitos; **una sola ficha por número** — si el número ya tiene ficha, el formulario lo dice y ofrece el flujo "Perdí mi enlace"; sucursales múltiples siguen fuera de alcance §6.6)
- Colonia (lista cerrada — ver Apéndice A — con opción "Otra" + texto libre moderado) — habilita el filtro de búsqueda más natural del directorio
- Checkbox de consentimiento con aviso de privacidad simplificado visible en el formulario, con link al integral (requisito LFPDPPP, ver §8)

**Opcionales (5):**

- ¿Qué ofreces? — palabras clave guiadas con ejemplo dentro del campo, adaptado a la categoría elegida ("ej. plomería, destape de drenajes, bombas de agua"; para deporte: "ej. futbol infantil 6-12 años, entrenamientos martes y jueves"; máx. 200 caracteres); alimenta directamente el buscador
- ¿Haces entregas o vas a domicilio? (checkbox sí/no)
- Teléfono fijo y dirección o referencias (texto libre + pin opcional en mapa)
- Horario (texto libre, ej. "L-S 9am-7pm")
- Una foto (desde la galería del celular) y/o link a su página de Facebook. Política de foto: del local, los productos o el trabajo — sin personas reconocibles (el aviso de privacidad no cubre la imagen de terceros); máx. 5 MB de entrada, comprimida en el servidor; el admin rechaza fotos que no cumplan

Al enviar, el negocio ve: "¡Gracias! Tu negocio está en revisión. Te contactaremos por WhatsApp para confirmar tus datos antes de publicarlo."

### 6.2 Directorio público (P0)

- **Página principal:** buscador + categorías como botones grandes.
- **Listado por categoría con filtro por colonia:** tarjetas con foto, nombre, colonia, etiqueta "A domicilio" cuando aplique y botón verde de WhatsApp. La información esencial visible sin clics extra (lección de los directorios que fracasan por fricción).
- **Ficha de negocio:** toda la información + botones "Enviar WhatsApp", "Llamar", "Cómo llegar" (abre Google Maps) y link a su Facebook si lo registró. Sello visible de "Negocio verificado".
- **Búsqueda simple** por nombre, palabras clave de "¿Qué ofreces?" y giros asignados (Apéndice B): insensible a mayúsculas y acentos, con coincidencia parcial — "plomero" encuentra "plomería" y "plomeria". Quien escriba "plomero" debe encontrar al negocio aunque su categoría sea "Servicios del hogar".

### 6.3 Revisión manual = verificación + moderación (P0)

Un solo paso cumple dos funciones:

- Todos los registros entran a una cola de revisión en un panel simple.
- Antes de aprobar, el admin contacta al número registrado (mensaje de WhatsApp o llamada) para confirmar que el negocio existe y que el número le pertenece. Esta conversación sirve además como evidencia de consentimiento ante la LFPDPPP.
- El admin aprueba o rechaza. **Al aprobar:** asigna 1-3 giros del catálogo cerrado (Apéndice B — base de las páginas SEO y los filtros; las palabras clave libres solo alimentan el buscador), normaliza la colonia si fue "Otra", marca el origen de la ficha (siembra o registro orgánico, para las métricas del §10), se publica la ficha y se le avisa al negocio por WhatsApp. **Al rechazar:** avisa por WhatsApp con el motivo; el negocio puede corregir y volver a enviar; los datos de registros rechazados se eliminan definitivamente a los 90 días.
- **Acceso al panel:** ruta no indexada protegida con contraseña única definida como variable de entorno y sesión con cookie segura — sin sistema de cuentas (consistente con §6.6). Si el proyecto suma más admins, se revisará.
- **Reglas de moderación** (se publican también en los términos): se rechazan fichas de actividades ilegales o que requieren licencia no demostrable (medicamentos controlados, armas, préstamos informales), contenido ofensivo, discriminatorio o sexual, fichas de terceros sin autorización del negocio, y fotos que incumplan la política del §6.1.
- Meta operativa: revisar y responder cada registro en menos de 48 horas.
- Botón "Reportar" en cada ficha pública para negocios falsos o cerrados.

La curaduría manual no es una carga: es el diferenciador de confianza frente a Google Maps y los agregadores scrapeados (modelo Aliada: verificar la oferta para fabricar confianza).

### 6.4 Edición de fichas con enlace de gestión (P1)

Autogestión sin cuentas ni contraseñas, con publicación supervisada:

- Al aprobar un registro, el sistema genera un **enlace único y secreto de gestión** para ese negocio (ej. necesitouno.com/editar/x8k2m9...). El admin lo envía por WhatsApp con la instrucción: "Guarda este mensaje (puedes destacarlo con la estrella) — con este enlace actualizas tus datos cuando quieras".
- El enlace abre la ficha en modo edición, con el formulario prellenado; el dueño cambia lo que necesite y envía.
- Los cambios NO se publican al instante: entran a la misma cola de revisión y el admin los aprueba antes de que la ficha pública se actualice. Mientras tanto, la ficha sigue mostrando la versión anterior.
- **Enlace perdido:** botón "Perdí mi enlace" en la ficha pública, que abre un WhatsApp prellenado hacia el admin. Si quien escribe lo hace desde el mismo número registrado, el admin reenvía el enlace (o genera uno nuevo, invalidando el anterior, si hay sospecha de que alguien más lo tiene). El enlace queda guardado en el historial del chat de WhatsApp con el admin, así que "perderlo" normalmente se resuelve buscando en la conversación.

### 6.5 Apartado "Deporte en Tizayuca" (P0)

Los clubes y escuelas deportivas tienen un tratamiento destacado, no solo una categoría más, porque no existe ninguna oferta de este tipo por parte del municipio — es un vacío de información real y un diferenciador del directorio:

- Bloque propio en la página principal ("Deporte en Tizayuca"), al mismo nivel visual que las categorías comerciales, para que las familias que buscan actividades para sus hijos lo encuentren de inmediato.
- Usa la misma ficha y el mismo formulario (sin campos nuevos ni lógica aparte): la disciplina, edades y días de entrenamiento van en "¿Qué ofreces?" con el ejemplo adaptado; los horarios de entrenamiento en el campo de horario; la sede (deportivo, cancha, gimnasio) en dirección/referencias con pin opcional.
- Pueden registrarse aunque no sean negocios formales: escuelas de futbol, ligas, entrenadores, clubes de box, taekwondo, danza/zumba, gimnasios, clubes de corredores o ciclismo. La verificación manual por WhatsApp aplica igual.
- Filtros y búsqueda idénticos al resto: por colonia y por palabras clave ("futbol", "box", "natación").
- Oportunidad SEO sin competencia: páginas indexables tipo "clases de futbol en Tizayuca", "box en Tizayuca", donde hoy no hay oferta municipal ni directorios que respondan.

### 6.6 Fuera de alcance (explícitamente NO en el MVP)

- Verificación automática por código (WhatsApp API, SMS, correo)
- Cuentas de usuario, contraseñas o login con redes sociales
- Pagos, suscripciones o planes premium
- Reseñas y calificaciones
- Pedidos en línea o reservaciones
- App nativa (solo web responsiva)
- Múltiples sucursales por negocio
- Otras ciudades

## 7. Flujos principales

**Flujo A — Registro:** El dueño entra al sitio (probablemente desde un link compartido por WhatsApp o un grupo de Facebook) → toca "Registra tu negocio gratis" → llena el formulario y acepta el aviso de privacidad → envía → mensaje de "en revisión" → el admin lo contacta por WhatsApp para confirmar → se publica la ficha → el negocio recibe por WhatsApp el link de su ficha pública + su enlace de gestión.

**Flujo B — Búsqueda:** El vecino entra al sitio → toca una categoría o escribe en el buscador → ve el listado → toca un negocio → toca "Enviar WhatsApp" → sale del sitio hacia la conversación. Éxito = salió del sitio hablando con el negocio.

**Flujo C — Edición:** El dueño abre su enlace de gestión → ve su ficha en modo edición prellenada → cambia lo necesario → envía → los cambios entran a revisión → el admin aprueba → la ficha pública se actualiza y el negocio recibe confirmación por WhatsApp.

**Flujo D — Enlace perdido:** El dueño toca "Perdí mi enlace" en su ficha → se abre WhatsApp prellenado hacia el admin → el admin verifica que escribe desde el número registrado → reenvía (o regenera) el enlace.

## 8. Requisitos no funcionales y legales

**Producto y rendimiento:**

- Móvil primero: todo se diseña para pantalla de celular; escritorio es secundario (81.7% del acceso a internet en México es desde el celular).
- Rápido en redes lentas: página principal < 2 segundos en 4G; imágenes comprimidas.
- Español mexicano en todos los textos, con lenguaje coloquial ("Registra tu negocio", no "Crear listado").
- Accesibilidad base: HTML semántico, contraste AA, áreas táctiles ≥44 px y lenguaje llano — el público usa celulares de gama media y tiene poca paciencia para interfaces confusas.
- Anti-abuso sin fricción en el formulario público y el botón de reportar: honeypot + límite de envíos por IP (ej. 3 por hora) + alerta al admin si las altas diarias superan lo plausible. Sin captcha — contradiría el principio rector; la revisión manual filtra calidad, esto protege el volumen (el admin es el cuello de botella, ver §11).

**SEO local (para capturar búsquedas "plomero en Tizayuca"):**

- Páginas indexables por giro y por giro+colonia (ej. /plomeria-haciendas-de-tizayuca), con URLs limpias y geolocalizadas, **generadas desde el catálogo cerrado de giros que el admin asigna al aprobar** (Apéndice B) — las palabras clave libres del negocio no generan páginas (no son estables ni normalizables), solo alimentan el buscador. También hay páginas por categoría.
- Schema Markup LocalBusiness en cada ficha, con expectativa realista: al publicar colonia (no dirección exacta) y horario en texto libre, el markup será parcial; el horario estructurado queda para fases posteriores (§12).
- La cola larga "[giro] en Tizayuca" / "[giro] en [colonia]" es la vía realista para que el directorio aparezca en Google sin pelear el Local Pack de Maps.
- Reclamar y verificar el Google Business Profile del propio directorio.

**Legal (LFPDPPP, reformada — nueva ley vigente desde el 21 de marzo de 2025; la autoridad ya no es el INAI sino la Secretaría Anticorrupción y Buen Gobierno):**

- Los datos de contacto de una persona física con actividad empresarial (nombre, WhatsApp, colonia) son datos personales protegidos: se requiere consentimiento y aviso de privacidad.
- Aviso de privacidad simplificado en el formulario (checkbox obligatorio) que remite al aviso integral en página propia con los elementos mínimos: identidad y domicilio del responsable, datos tratados, finalidades, medios para limitar uso o divulgación, mecanismo de derechos ARCO y procedimiento de cambios.
- Términos y condiciones que establezcan: el directorio es un intermediario informativo; deslinde de responsabilidad por la veracidad de la información publicada por los negocios y por las transacciones vecino-negocio; reglas de contenido y derecho de retirar fichas.
- Publicar colonia (no dirección domiciliaria exacta) por defecto reduce el riesgo; el pin en mapa es opcional y lo decide el negocio.
- Operación ARCO y retención: las solicitudes de acceso, corrección o eliminación llegan por el WhatsApp del admin y se atienden en ≤20 días hábiles; el panel permite el borrado definitivo (no solo despublicar); los registros rechazados se eliminan a los 90 días y las fichas retiradas a solicitud del negocio, de inmediato.
- **Pendiente:** revisión legal profesional antes del lanzamiento — el reglamento de la nueva ley y los criterios de la nueva autoridad aún se están consolidando.

## 9. Plan de lanzamiento (respuesta al arranque en frío)

El riesgo #1 de todo directorio es el huevo-gallina; ~90% de los marketplaces fracasa por no romper la inercia inicial. Plan basado en los casos que sí funcionaron (Cornershop: sembrar la oferta a mano, una sola ciudad):

**Fase 0 — Sembrar la oferta (semanas 1-2, antes del lanzamiento público):**

- Pre-cargar 30-50 negocios mediante cambaceo (visitas puerta a puerta, con su permiso y consentimiento registrado) en 2-3 colonias ancla de alta densidad: Centro, Haciendas de Tizayuca y Fuentes/Geovillas.
- Incluir en la siembra 5-10 clubes y escuelas deportivas (escuelas de futbol, box, taekwondo, gimnasios, ligas locales) contactándolos en deportivos y canchas — al no existir oferta municipal, este apartado puede ser el gancho de difusión del lanzamiento ("por fin un lugar para encontrar dónde entrenar en Tizayuca").
- Cerrar la lista de colonias del formulario (Apéndice A) y tener listos aviso de privacidad y términos de uso.
- Verificar disponibilidad y registrar el dominio necesitouno.com (y de ser posible necesitouno.mx y necesitouno.com.mx para proteger la marca).

**Fase 1 — Activar la demanda donde ya está (semanas 3-8):**

- Difundir en los grupos de Facebook de vecinos y compra-venta de Tizayuca (ahí ya vive la confianza local); cada ficha publicada se comparte como link individual — el negocio mismo se vuelve distribuidor al compartir su ficha.
- Explorar alianza con el ayuntamiento de Tizayuca / desarrollo económico municipal (ya lleva registro de establecimientos) para legitimidad y difusión.
- Instrumentar analítica desde el día 1 con proveedor cookieless (sin banner de cookies; la elección concreta vive en las decisiones técnicas del repo) y eventos definidos: formulario iniciado, formulario enviado, vista de ficha, clic a WhatsApp, clic a llamar, clic a cómo llegar. Los conteos excluyen bots y crawlers — el propio tráfico SEO inflaría las vistas y ensuciaría la conversión del §10.

## 10. Métricas de éxito (primeros 60 días) y umbrales de decisión

| Métrica | Meta | Umbral de acción |
|---|---|---|
| Negocios publicados (siembra + orgánicos) | 50 | Si a los 30 días hay <25, intensificar cambaceo |
| Altas orgánicas (se registraron solos, sin cambaceo) | ≥ 15 | Si a los 30 días hay <5, revisar difusión y formulario — esta métrica es la que valida el objetivo (a); la siembra manual no lo valida |
| % de registros completados sin ayuda | > 70% | Si es menor, simplificar el formulario |
| Tiempo entre registro y publicación | < 48 horas | Si se supera de forma sostenida, revisar carga del admin |
| Clics a WhatsApp / vistas de ficha | > 15% (aspiracional) | Si a las 4 semanas está <8-10%, rediseñar la ficha (prominencia del botón, fotos, horarios) antes de escalar adquisición |
| Visitantes únicos semanales | 300 | Si el tráfico no llega, redoblar distribución en grupos de Facebook |

Cada ficha registra su origen (siembra / orgánico) al aprobarse (§6.3) para poder separar estas métricas.

Nota sobre el 15%: el benchmark disponible más cercano (Google Business Profile) muestra ~4.68% de conversión vista→acción. Nuestra métrica mide un punto más profundo del embudo (el usuario ya eligió la ficha), por lo que 15% es plausible pero debe validarse empíricamente, no asumirse.

**Señal de foco:** si >60% de las altas proviene de menos de 3 colonias, concentrar el esfuerzo ahí y no dispersarse.

## 11. Riesgos y preguntas abiertas

- **Arranque en frío:** mitigado con el plan de la §9 (siembra manual + distribución en Facebook). Es el riesgo principal y tiene plan explícito.
- **Google Maps y Facebook como sustitutos:** el hábito del consumidor ya está ahí. Mitigación: diferenciarse por verificación/curaduría y contacto por WhatsApp, y usar Facebook como canal, no como enemigo. Advertencia histórica: Sección Amarilla murió por no aportar valor frente a la geolocalización; Yumbling murió por no dar utilidad el día uno — cada ficha debe ser útil de inmediato.
- **La revisión manual no escala:** funciona hasta ~10-15 registros por semana. Si el volumen lo supera de forma sostenida, automatizar la verificación (SMS con proveedor local o WhatsApp Business API). Ese umbral es el disparador; no automatizar antes.
- **Dependencia del admin:** si el admin no revisa, el registro se atora y el negocio pierde interés. Mitigación: meta de <48 horas y notificaciones de pendientes.
- **Datos desactualizados:** negocios que cierran o cambian de número. Mitigación MVP: botón de reporte + revisión manual.
- **Enlace de gestión perdido o compartido:** riesgo bajo — vive en el chat de WhatsApp con el admin, la recuperación verifica el número, y ante sospecha se regenera. Como toda edición pasa por revisión, un enlace robado no puede publicar cambios sin que el admin lo vea.
- **Marco legal en transición:** la LFPDPPP 2025 aún consolida reglamento y criterios; requiere revisión legal profesional antes del lanzamiento.
- **Marca resuelta:** se adopta NecesitoUno.com, marca neutral que permite expandir a Pachuca y otros municipios sin renombrar. Implicación: como el nombre no dice "Tizayuca", el posicionamiento hiperlocal debe cargarse en la comunicación ("NecesitoUno Tizayuca" en título, logo y redes) y en el SEO (páginas "[giro] en Tizayuca"). Pendiente: confirmar disponibilidad del dominio antes de producir cualquier material.

## 12. Fases posteriores (no comprometidas)

Solo si el MVP valida: verificación automática (el enlace de gestión se convierte en login formal con código por WhatsApp o SMS, sin rehacer nada), publicación instantánea de ediciones de negocios confiables, horario estructurado (mejora el Schema LocalBusiness, ver §8), reseñas simples, fichas destacadas de pago y categorías patrocinadas (modelo freemium típico de directorios), generación de leads cualificados (donde está el ingreso real de los directorios), expansión a Pachuca y municipios vecinos.

## Apéndice A — Lista de colonias y fraccionamientos para el formulario

**Centro tradicional:** Tizayuca Centro, El Pedregal / Pedregal Centro, Huicalco, Atempa, Emiliano Zapata, Nacozari, Olmos / Ampliación Olmos, Nuevo Tizayuca, El Refugio Tepojaco, Huitzila, Zona Industrial.

**Fraccionamientos:** Haciendas de Tizayuca (el más grande, ~14,000 viviendas), Fuentes de Tizayuca, Geovillas, Rancho Don Antonio, Los Héroes Tizayuca, Andalucía Residencial, Real Toledo, Bosques de Ibiza, Las Campanas, El Cid.

Más opción "Otra" con campo de texto libre (el admin la normaliza al aprobar). Validar la lista en campo durante la Fase 0.

## Apéndice B — Catálogo inicial de giros (para páginas SEO y filtros)

El admin asigna 1-3 giros al aprobar cada ficha; el catálogo es curado (los negocios no lo editan) y se ajusta con lo aprendido en la siembra de Fase 0. Si un negocio no embona en ningún giro, se publica solo con su categoría y el admin anota el giro faltante como candidato al catálogo.

- **Servicios del hogar:** plomería, electricidad, albañilería, herrería, carpintería, pintura, jardinería, fumigación, reparación de lavadoras y refrigeradores, cerrajería, mudanzas
- **Restaurantes y fondas:** fonda / comida corrida, antojitos, tacos, pizzas, pollos, mariscos, panadería, pastelería
- **Belleza:** estética, barbería, uñas, maquillaje
- **Salud:** consultorio médico, dentista, farmacia, veterinaria, psicología
- **Abarrotes y comercio:** abarrotes, papelería, ferretería, ropa, celulares y accesorios, florería
- **Talleres:** taller mecánico, hojalatería y pintura, vulcanizadora, bicicletas, motos, electrónica
- **Clubes y escuelas deportivas:** futbol, box, taekwondo / artes marciales, gimnasio, danza / zumba, natación, basquetbol, atletismo / corredores, ciclismo

## Apéndice C — Fuentes clave de la investigación

INEGI (Censo 2020, ENDUTIH 2024, Censos Económicos 2019), Data México (Secretaría de Economía), Criterio Hidalgo (registro municipal de establecimientos, ene 2026), Statista (uso de WhatsApp en México), estudio Meta-BCG 2024 (mensajería en pymes), BrightLocal (benchmark de conversión de Google Business Profile), LFPDPPP reformada (DOF, marzo 2025), casos: Cornershop, Frogtek/Tiendatek, Aliada, Jüsto, Yumbling, Sección Amarilla.
