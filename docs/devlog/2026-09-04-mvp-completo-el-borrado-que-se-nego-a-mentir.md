# 2026-09-04 · MVP completo: las 29 historias P0 y el borrado que se negó a mentir

<!-- Escrito para publicarse: un extracto de esta entrada debe poder ir tal cual a Facebook/LinkedIn/X. Tono cercano, español mexicano, sin jerga innecesaria. -->

**Hito:** con el PR #19 mergeado, el código de NecesitoUno queda completo — las 29 historias P0 del PRD están hechas. Lo que falta para que el sitio exista en producción ya no es una sola línea de TypeScript: son cuentas, dominio y pasos humanos.

## Qué construimos

T-013 no dibuja ninguna pantalla nueva — el propio ticket lo dice y la auditoría lo verificó: su superficie visible son dos avisos del panel y los mensajes del log de arranque. Lo que hace es la otra mitad del deploy, la que sí es código: que el esquema Prisma corra contra el mismo Postgres que va a usar producción, que los `CHECK` que escribimos a mano (`estado`, `origen`) sobrevivan la migración, que la purga de rechazados a los 90 días tenga su cron con test, y que `docs/despliegue.md` quede como un documento único y ordenado — cuentas que crear, variables que llenar, orden de operaciones, prueba de humo.

La decisión de fondo detrás de ese documento fue mudar **todos** los entornos a PostgreSQL, incluido el desarrollo local. Hasta ayer developíamos contra SQLite y sólo producción iba a ser Postgres (ADR-004). El diseño de este change encontró que esa separación no aguantaba: `provider` es un literal fijo del esquema de Prisma, no admite variables, así que "SQLite en dev, Postgres en prod" obligaba a mantener dos árboles de migraciones y escribir cada `CHECK` dos veces — justo el punto donde ya se nos habían perdido una vez (la migración del buscador se los comió en silencio hace unas semanas). Preferimos pagar el costo de un solo dialecto real en todos lados. Quedó como enmienda formal a ADR-001: "Prisma + SQLite" en desarrollo ya no es la decisión vigente.

## La decisión interesante

Este fue el ticket más golpeado del proyecto: 3 iteraciones dev↔seguridad y una cuarta que ya no fue automática. La auditoría de seguridad, en las primeras tres vueltas, encontró cinco hallazgos altos que —si hubieran llegado a producción— habrían sido serios de verdad para un directorio con datos personales reales:

- Una guarda que decide "esta base es local, es seguro sembrarle datos de prueba" leyendo el hostname de la URL de conexión — pero el parser de PostgreSQL acepta un parámetro `?host=` que sustituye ese hostname *después* de que la guarda ya decidió. Una URL con pinta de `localhost` podía, en los hechos, apuntar a producción.
- El driver de Postgres (`pg`) no cifra la conexión salvo que se lo pidas explícitamente con `sslmode=require`. El documento de despliegue, en su primer borrador, no lo pedía. Sin ese parámetro, cada consulta entre el sitio y Supabase habría viajado en claro por Internet: nombres de negocio, WhatsApps, direcciones, motivos de rechazo — todo el conjunto de datos personales del directorio, legible por cualquiera en el camino.
- Y el más incómodo: en un entorno serverless, donde cada instancia tiene su propio disco, el borrado definitivo de una ficha (el que atiende una solicitud ARCO) intentaba borrar la foto desde el disco de *esa* instancia. Si el archivo vivía en otra, `rm` no encontraba nada, no fallaba, y el panel respondía "borrado" — con la foto todavía sirviéndose desde algún lado.

Ese último punto llegó a un lugar donde el proceso ya no podía decidir solo: cuando el almacén de fotos no está configurado y una ficha sí tiene foto, ¿el borrado ARCO debe seguir diciendo "borrado" (para no trabar la purga de los 90 días) o debe negarse (y admitir que hay una foto que no puede tocar)? Las dos respuestas son defendibles con código; ninguna es una decisión técnica. El pipeline tiene un tope de tres vueltas dev↔seguridad por diseño — para no dar rodeos infinitos buscando que el código convenza a la seguridad— y aquí lo tocamos. En vez de forzar una cuarta vuelta automática, la pregunta subió al fundador, que es exactamente lo que el proceso manda cuando se llega al tope. La respuesta fue: **el borrado se niega a mentir.** Si el almacén de fotos no responde, la ficha no se da por borrada — se cuenta como pendiente y el cron avisa con un 500 en vez de un "listo" falso, aunque eso signifique una purga que no cierra sola esa noche.

## Qué aprendimos

Cambiar de dialecto no solo destapó bugs de configuración: destapó un bug de concurrencia que SQLite nos había estado ocultando. El tope de reportes por IP se protegía con una sentencia que en SQLite era atómica porque SQLite serializa las escrituras con un lock de base — en Postgres, bajo `READ COMMITTED`, ese mismo código dejaba de serlo, y dos envíos simultáneos podían pasarse el tope juntos. No es un bug que "se nos hubiera escapado": es un bug que en desarrollo con SQLite **no existía**, y sólo aparece con el motor real. Developear contra el mismo dialecto que producción no es un capricho de pureza técnica.

Y una nota más chica pero honesta sobre cuánto control humano queda incluso al final: para que el validador pudiera empujar el push de este PR, GitHub le pidió al humano conceder explícitamente el scope `workflow` — porque el change toca `.github/workflows/ci.yml`. Ni el último commit de código se sube sin que alguien, con nombre y apellido, apriete un botón de permiso.

En total la auditoría cerró con 122 pruebas adversariales propias (7 nacieron en rojo marcando un hallazgo real, las 7 se pusieron en verde al corregirse el código) sobre una suite de 2,616 pruebas en todo el repo.

## Siguiente paso

`docs/despliegue.md` es, desde hoy, el manual completo para que el sitio exista en internet: qué cuentas crear (Vercel, Supabase, dominio, Umami), qué variables llenar, en qué orden migrar/sembrar catálogos/verificar, y la prueba de humo antes de dar por bueno un deploy. El siguiente paso ya no es escribir código — es que un humano siga ese documento línea por línea, cree las cuentas, apunte el DNS y presione deploy. Después de eso viene lo que de verdad importa: la primera siembra real de negocios de Tizayuca.

---
*Tickets/PRs relacionados: T-013 · PR #19*
