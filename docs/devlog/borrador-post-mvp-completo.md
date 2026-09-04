# Borrador — post largo de cierre de MVP (building in public)

> Uso: publicar tal cual (o con ajustes menores de longitud según la red) en LinkedIn/Facebook. Las tres versiones cortas del final son para X/estado. Todo dato viene de `docs/devlog/`, `docs/metricas-pipeline.md` y `docs/decisiones/ADR-009-revision-pipeline-13-corridas.md`. Los puntos marcados [PENDIENTE] dependen del lanzamiento real y no se deben publicar como si ya hubieran pasado.

---

## Post largo

Hace unos días NecesitoUno no existía ni como repositorio. Hoy tiene las 16 pull requests de su MVP mergeadas — todas las historias P0 del directorio de negocios de Tizayuca están construidas: un negocio se registra solo desde el celular, un admin lo verifica por WhatsApp antes de publicarlo, y cualquier vecino lo encuentra y le escribe directo, sin cuentas, sin fricción. Lo escribimos en público desde el primer día: el repo es abierto y cada pieza dejó su entrada de devlog contando qué se construyó y qué costó trabajo.

Cómo se construyó importa tanto como qué se construyó. Cada feature caminó el mismo camino: una especificación que un humano aprueba, cuatro agentes de IA que se pasan el trabajo por archivo (uno arma la interfaz, otro la lógica real, otro la ataca buscando huecos de seguridad, otro valida todo de nuevo antes de abrir el pull request), y un humano que aprieta el botón de merge. Solo dos puntos de control humano en todo el proceso — aprobar la especificación y mergear el PR — y en ninguna de las 16 corridas se saltaron. Cerca de 2,400 pruebas automatizadas respaldan el código, y en 14 corridas registradas del pipeline, ni una sola vez el validador final rechazó algo que el CI ya hubiera atrapado: cuando encontró problemas, fueron cosas que ningún checklist mecánico ve.

Y encontró cosas de verdad. Van cuatro que nos gusta contar porque son el tipo de bug que no se ve hasta que alguien lo busca a propósito:

**La IP que elegía el atacante.** Para frenar abuso, limitábamos cuántas veces se puede enviar el formulario desde la misma IP por hora. El problema: leíamos esa IP de un encabezado que, en muchas configuraciones, puede escribir el propio navegador. Cualquiera podía cambiarlo en cada envío y tener cupo infinito — el candado lo elegía el atacante, no nosotros. Se corrigió leyendo la IP de una sola fuente declarada explícitamente por configuración, y fallando *sin* cupo (no con uno falso) si esa configuración no existe.

**La foto de 123 KB que pedía 429 megas de RAM.** Un PNG de un solo color, de 39 megapíxeles, pesa casi nada porque comprime perfecto — pero al procesarlo, el servidor tenía que reconstruir esos millones de píxeles en memoria. Con 12 subidas simultáneas, trivial desde cualquier laptop, la memoria del servidor se disparaba a 429 MB con apenas 1.4 MB de subida real. La primera corrección (un límite de 2 fotos procesándose a la vez) cerró el hueco pero abrió otro: bloqueaba también a la gente subiendo fotos legítimas. Angostamos el candado para que proteja solo el segundo que de verdad importa —decodificar la imagen original— y dejamos correr libre la compresión, que es inofensiva. El tiempo que un envío quedaba retenido bajó de 1,789 milisegundos a 13.

**El referente que delataba al panel.** El panel de administración vive fuera del sitio público, así que nunca carga el script de analítica — pero cuando un admin revisaba el registro de un negocio y abría el sitio en otra pestaña, el navegador mandaba la URL completa del panel (`/admin/registros/<id>`) como referente al proveedor de métricas. Sin querer, filtrábamos la ruta de un expediente concreto a un tercero. El primer arreglo (bloquear el referente por completo) cerró la fuga pero también tumbó el panel sin JavaScript — el flujo que más importa, porque un admin puede estar aprobando negocios con señal mala en la calle. Nos tomó tres iteraciones fijar el valor exacto que oculta la ruta sin romper el formulario.

**El aviso que prometía de más.** Nuestro propio aviso de privacidad decía que si un registro "no se publicaba", sus datos se borraban a los 90 días. Sonaba razonable hasta que lo comparamos con lo que el sistema realmente puede hacer: el único reloj que existe es la fecha de rechazo, y esa fecha no existe mientras un registro sigue esperando revisión. Estábamos prometiendo un borrado automático que no teníamos programado. Se corrigió acotando la promesa a lo cierto y declarando en el código, sin disfraz, los dos pendientes operativos que faltan por resolver.

No todo salió a la primera, y eso es el proceso funcionando, no fallando: de 14 corridas registradas, la mediana de idas y vueltas entre desarrollo y seguridad fue 1, con un tope de 3 (llegó una vez, justo en la foto). Ocho auditorías de seguridad encontraron hallazgos altos reales antes de que llegaran a producción. Y hasta el propio pipeline se tropezó consigo mismo: dos features corriendo en paralelo dejaron tres conflictos que ningún `git merge` de texto detecta —son de significado, no de líneas—, y los resolvimos a mano, con nombre y explicación, en vez de esconderlos en un merge silencioso.

Con eso, el código está listo. Lo que sigue ya no es una línea más de TypeScript: es la calle. [PENDIENTE: fecha de siembra de los primeros negocios reales de Tizayuca, resultado de las primeras verificaciones por WhatsApp, y métricas reales de uso una vez que el sitio esté arriba]. Construir la fábrica tomó días; que la use un plomero de Tizayuca de verdad es harina de otro costal, y ahí es donde vamos ahora.

---

## Versiones cortas (≈280 caracteres)

**1.**
NecesitoUno ya tiene su MVP completo: 16 PRs, ~2,400 pruebas, 4 agentes de IA con 2 frenos humanos que nunca se saltaron. Cazamos bugs reales antes de producción (una IP falsificable, una foto que pedía 429MB de RAM). El código está listo. Ahora toca la calle. 🧵

**2.**
Building in public, corte de caja: directorio de negocios de Tizayuca, MVP terminado. El pipeline de agentes encontró 8+ hallazgos de seguridad altos de verdad —uno era un candado anti-abuso que el propio atacante podía elegir. Sigue la siembra real. [PENDIENTE fecha]

**3.**
Cerramos el MVP de NecesitoUno: registro sin cuentas, verificación por WhatsApp, directorio público — todo construido y auditado en público. Lo que no salió a la primera también se cuenta: 3 iteraciones para blindar el panel sin romperlo. Sigue: salir a la calle.
