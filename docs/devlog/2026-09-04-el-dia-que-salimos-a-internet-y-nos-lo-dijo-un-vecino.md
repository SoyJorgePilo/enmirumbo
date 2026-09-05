# 2026-09-04 · El día que salimos a internet, y nos lo dijo un vecino

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** el directorio ya vive en internet de verdad — dominio, base de datos y panel en producción, con la primera visita real del mundo ya ocurrida — y el mismo día recibimos, diagnosticamos y corregimos en producción el primer bug que reportó un usuario real, no el fundador ni un agente.

## Qué construimos

Hoy dejamos de developear "para cuando lancemos" y lanzamos. `enmirumbo.com` es el dominio comprado, con su DNS apuntando a Vercel, que ya jala directo del repo y hace deploy automático en cada merge a `main`. Supabase quedó con las migraciones corridas y los catálogos (categorías, giros, colonias) sembrados. El panel `/admin` responde, Umami está midiendo, y montamos un respaldo diario local de la base — nada de esto es teoría de `docs/despliegue.md`: es la primera vez que se ejecuta contra cuentas reales.

Aparte, ya está decidido y con spec aprobada el rebrand: el sitio se va a llamar **EnMiRumbo**, no NecesitoUno (el dominio ya lo compramos con ese nombre; "rumbo" también deja la puerta abierta a otras poblaciones más adelante). El repo en GitHub ya se renombró. Lo que falta es la parte visible: el ticket T-019 tiene su spec lista y entra a la cola de implementación — hoy el sitio en producción todavía dice "NecesitoUno" en la mayoría de sus textos.

## La decisión interesante

El primer defecto reportado por un usuario real no lo encontró un agente de seguridad ni una prueba adversarial: lo encontró un vecino, en su Android, y nos mandó una captura por WhatsApp. Al hacer scroll la barra del navegador se colapsa (así es Android), el viewport crece, y el pie de página se quedaba corto — una franja blanca debajo, como si el sitio se hubiera quedado a medias.

El diagnóstico fue rápido porque el síntoma apuntaba directo a la causa: el `<body>` medía su alto mínimo con `min-h-full` (`100%`), que se resuelve contra el viewport *con la barra visible*; cuando el viewport crecía al colapsarse la barra, el documento ya no alcanzaba. `min-h-dvh` sigue el viewport dinámico en vez del estático, así que el pie llega al borde en los dos estados. Una clase de Tailwind.

La decisión no fue técnica, fue de proceso: ¿esto merece ticket y spec porque es el primer bug que ve un usuario real y el proyecto es público, o es exactamente el caso que la ruta corta existe para resolver? Optamos por la ruta corta —sin ticket ni spec, con validación y PR (`docs/proceso.md` §5b)— porque el diseño del proceso ya contempla esto: un diff de un archivo y una clase, que no toca el formulario público, el panel, ni ningún contrato fijado en `openspec/specs/`. Ceder a la tentación de "esto es importante, démosle ceremonia completa" solo porque lo vio un vecino de verdad habría sido inflar el proceso por sentimentalismo, no por riesgo. De la captura de WhatsApp al PR #21 mergeado por el fundador con CI verde y deploy automático pasaron menos de dos horas.

## Qué aprendimos

Que el primer deploy real siempre enseña algo que ningún test local podía. `docs/despliegue.md` ya documentaba, en teoría, que si la validación del certificado fallaba había un "último recurso temporal" (`sslmode=no-verify`, que cifra pero no valida la cadena) antes de llegar al `verify-full` correcto. La teoría se cumplió al pie de la letra el mismo día que hicimos el primer deploy de verdad: la CA propia de Supabase hizo que `sslmode=require` rechazara la conexión ("self-signed certificate in certificate chain"), y production quedó, por unas horas, corriendo con ese puente temporal — documentado como deuda el mismo día en `docs/backlog.md`, no escondido. El arreglo definitivo (empaquetar la raíz pública de Supabase en el bundle y forzar `verify-full`) ya corre en su propia rama de pipeline en este momento.

No es la primera vez que el runbook predice un problema antes de que ocurra — es la primera vez que lo vemos ocurrir en cuentas reales, el mismo día, y confirmamos que el plan B que habíamos escrito "por si acaso" de verdad servía cuando hizo falta.

## Siguiente paso

Con el sitio ya vivo, lo que sigue es cerrar el rebrand a EnMiRumbo (T-019, spec aprobada) para que la cara del sitio deje de decir un nombre que ya no es el dominio, y mergear el fix definitivo de TLS que ya está en pipeline. En paralelo siguen corriendo T-018 (listado completo del panel) y T-016 (verificación por SMS tras bandera). Después de eso empieza lo que de verdad importa: la primera siembra real de negocios de Tizayuca.

---
*Tickets/PRs relacionados: T-019 · T-018 · T-016 · T-020 · PR #21*
