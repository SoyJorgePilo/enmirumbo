# ADR-005 · Analítica cookieless

**Fecha:** 2026-08-31 · **Estado:** aceptada el 2026-09-03, ejecutada en E7 (T-010, change OpenSpec `agregar-analitica-cookieless`)

## Contexto y problema

El PRD (§9-10, v0.8) exige analítica desde el día 1 con eventos definidos (formulario iniciado/enviado, vista de ficha, clics a WhatsApp/llamar/cómo llegar), exclusión de bots, y sin banner de cookies. Las métricas del §10 — los umbrales que deciden el destino del MVP — dependen de que esto mida bien.

## Drivers de la decisión

1. Sin cookies de rastreo → sin banner de consentimiento (fricción cero, coherente con el principio rector y con LFPDPPP)
2. Eventos personalizados con propiedades (categoría, colonia de la ficha) para la "señal de foco" del PRD §10
3. Filtrado de bots/crawlers confiable — el tráfico SEO es parte del plan y no debe inflar las vistas
4. Peso del script: la meta <2s en 4G no tolera un tag manager
5. Costo ~$0 en la fase de validación

## Opciones consideradas

### Plausible
Cookieless por diseño, script <1KB, eventos con propiedades, filtrado de bots decente, UI simple que hasta sirve para el devlog público. Contras: de pago (~$9/mes) tras el trial; self-host posible pero añade operación.

### Umami (self-host o cloud)
Open source, cookieless, gratuito self-hosteado y con plan cloud gratuito (hobby). Contras: el self-host contradice la operabilidad de una persona; el plan gratuito cloud tiene límites de eventos que hay que verificar contra las 300 visitas/semana + eventos.

### Google Analytics 4
Gratuito e ilimitado. **Por qué no:** requiere banner de consentimiento (fricción directa contra el principio rector), su modelo de eventos es desproporcionado para 5 eventos, el script pesa contra la meta de 4G, y enviar datos de comportamiento de vecinos a Google es exactamente la conversación LFPDPPP que no queremos tener. Descartado no por capacidad sino por costo de fricción y confianza.

### Sin proveedor: eventos propios en la DB
Contar vistas y clics en nuestra propia tabla. Pros: control total, cero terceros. Contras: reinventar deduplicación, bots y visitantes únicos — semanas de trabajo para medir peor; los visitantes únicos sin cookies son genuinamente difíciles de hacer bien.

## Decisión (confirmada al ejecutar E7)

**Umami Cloud (plan gratuito) primero; migrar a Plausible si los límites aprietan.** Ambos cumplen los 5 drivers; Umami gana en costo cero y la migración entre ellos es barata porque nuestros 6 eventos son un contrato chico. Complemento: los contadores que el producto necesita mostrar (nada en el MVP) o auditar con precisión legal vivirían en la DB propia — la analítica es para decidir, no es registro contable.

### Cómo quedó implementada (T-010)

- Dos variables de entorno, `NEXT_PUBLIC_UMAMI_SRC` y `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, documentadas en `.env.example`. **Fail-safe:** sin ellas —o con el `src` fuera de `https:`— el sitio no pinta ninguna etiqueta `<script>` ni pide nada a un dominio externo; solo deja una advertencia en el log, una vez por proceso, cuando la configuración quedó a medias.
- Un único `<script defer>` de terceros, sin gestor de etiquetas y sin JavaScript propio de cliente, inyectado desde el layout del grupo de rutas `src/app/(publico)/`. Así `/admin` queda fuera de la medición **por construcción**, no por una lista de rutas (PRD §8, LFPDPPP).
- Cuatro eventos (`whatsapp-tarjeta`, `whatsapp-ficha`, `llamar`, `como-llegar`) declarados con atributos `data-*` en el marcado, con dos propiedades y nada más: `categoria` y `colonia`, siempre slugs del catálogo (o `otra`). El contrato vive en un solo módulo, `src/lib/analitica/eventos.ts`, para que una eventual migración a Plausible toque un archivo.
- Se excluye la cadena de consulta de las URLs medidas (`data-exclude-search`, confirmado contra la documentación vigente del tracker): lo que el vecino escribe en `/buscar?q=…` no sale del sitio.
- El embudo del registro y la vista de ficha se miden con vistas de página, sin instrumentación propia.

### Modelo de confianza y deuda que hereda el despliegue (T-013 / E0-3)

Escrito aquí, y no solo en el reporte de un change que se archiva, porque es la parte de esta decisión que todavía no está mitigada (hallazgo M-3 de la auditoría de T-010):

- **Qué se está aceptando.** El sitio ejecuta JavaScript de un tercero en **todas** las páginas públicas, incluida `/registro`, que es justo donde el vecino teclea su nombre y su WhatsApp. Quien controle las variables de despliegue —o el dominio configurado— puede leer ese formulario antes de que se envíe, sin tocar el repo y sin dejar rastro en nuestro servidor. La validación del `src` exige `https:` y no hay gestor de etiquetas ni scripts encadenados, pero **no hay lista blanca de dominio ni SRI** (un tracker cambia solo, así que un hash fijo lo rompería).
- **Mitigación pendiente: `Content-Security-Policy`.** Requisito para T-013 (`preparar-deploy-produccion`), con **los dos dominios**, que no son el mismo: `script-src https://cloud.umami.is` (de donde se descarga el script) y `connect-src https://gateway.umami.is` (a donde manda los eventos, verificado leyendo el tracker y capturando su envío). Con uno solo, la medición se rompe en silencio: el script carga y ningún evento llega. Complemento del mismo ticket: `Referrer-Policy` para `/admin/*` a nivel de cabecera, que hoy se resuelve con `<meta name="referrer" content="strict-origin">` en el layout del panel. **El valor importa y no es intercambiable: si la cabecera se pone en `no-referrer`, el navegador manda `Origin: null` en los POST de navegación y Next aborta las Server Actions del panel —500 sin JavaScript, contra su requirement aprobado—; `same-origin` tampoco sirve, porque deja pasar la ruta completa entre páginas del mismo origen, que es justo la fuga. Solo `strict-origin` u `origin`.** A nivel de cabecera es aún más delicado, porque es fácil aplicarla de más (a todo el sitio) sin darse cuenta.
- **Endurecer el `src` a una lista blanca de dominio** es barato y consistente con el resto del módulo, pero cambia el contrato de la variable (hoy admite cualquier `https:`, lo que permite migrar de proveedor o autohospedar sin tocar código). Queda como decisión de spec, no de implementación.

### Tres canales, no dos

El tracker manda en cada envío la **URL**, el **título del documento** y el **referente**, además del nombre del evento y sus propiedades. La spec de T-010 razonó sobre la URL y las propiedades; los otros dos se cerraron al auditar:

- **`document.title`:** `/buscar` declara un título estático (`Buscar — NecesitoUno Tizayuca`) para que el término que escribe el vecino no salga por el título, que es un camino que `data-exclude-search` no cubre. Quien le dé metadata propia a las páginas del directorio (E5, SEO local) tiene que respetar esa excepción: `/buscar` es `noindex`, así que un título dinámico no aporta SEO y sí filtraría texto libre.
- **`document.referrer`:** el tracker reenvía los referentes del mismo origen **como ruta**, así que salir del panel hacia una página pública habría entregado `/admin/registros/<id>` a un tercero. El layout de `/admin` declara `referrer: "strict-origin"`: oculta la ruta —que es lo único que había que ocultar— y conserva el `Origin`, del que dependen los formularios del panel cuando no hay JavaScript.

### Un enlace instrumentado que no abre pestaña nueva se retrasa

El tracker cancela el clic de un `<a>` con evento que no lleva `target="_blank"`, manda el evento y navega **después** de que el proveedor responde: medido con el tracker real y un proveedor falso, **3.0 s de retraso con 3 s de latencia**. Afecta a `tel:` (el botón "Llamar" de la ficha), que por diseño no abre pestaña. Se resolvió declarando ese evento en un elemento envolvente en vez de en el enlace: el proveedor recibe el mismo evento y la llamada se marca de inmediato.

## Consecuencias

- Positivas: sin banner, sin fricción, métricas del §10 medibles desde el primer deploy.
- Negativas: dependencia de un tercero para la memoria histórica de métricas; los visitantes únicos cookieless son estimados (salted hash diario) — suficiente para umbrales, no para precisión científica.

## Cuándo revisarla

**Pendiente y vigente:** verificar los límites del plan gratuito con números reales, una vez que la cuenta esté creada y el sitio desplegado (300 visitas/semana + eventos, la cifra del PRD §10). El código quedó listo antes que la cuenta: el fail-safe permite desplegar sin llaves y conectarlas después, sin tocar código. Se revisa también si el MVP valida y llega la fase de monetización, donde la analítica de leads (PRD §12) pedirá eventos más ricos.
