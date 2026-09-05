# PRD v2 — EnMiRumbo (documento de entrega)

> **Para quién es esto:** un equipo técnico que tome o continúe el producto. Este documento
> separa **lo que es negocio y no se negocia** de **lo que es técnica y puede cambiarse**.
> Si algo técnico se reemplaza (framework, base, hosting), todo lo marcado como regla de
> negocio debe sobrevivir intacto.
>
> **La letra chica del comportamiento** (cada pantalla, mensaje y caso borde, ~1,400
> escenarios) vive en `openspec/specs/` — 10 capacidades consolidadas que son el contrato
> fino de lo construido. Este PRD es el mapa; aquello es el plano. El PRD histórico del
> MVP es `docs/PRD.md` (v0.9); este v2 describe **lo que existe en producción** al
> 2026-09-04, más la visión inmediata.

---

## 1. Qué es EnMiRumbo

**EnMiRumbo — el directorio de los negocios de tu rumbo.** Un directorio web hiperlocal
(hoy: Tizayuca, Hidalgo) donde los negocios se registran solos desde su celular, un humano
los verifica antes de publicarlos, y los vecinos los encuentran y los contactan
directamente por WhatsApp.

La ventaja competitiva NO es el listado (directorios hay miles). Son dos cosas:

1. **Confianza**: cada ficha publicada pasó por verificación humana. El sello "Negocio
   verificado" significa que una persona habló con ese negocio.
2. **Inmediatez**: todo desemboca en WhatsApp, la app que ya está en todas las manos.

En vivo: **https://enmirumbo.com** (repo público: `github.com/SoyJorgePilo/enmirumbo`).

## 2. Principios de negocio — NO NEGOCIABLES

Cualquier reimplementación técnica debe conservar estos principios. Están en orden de
importancia:

1. **Sin cuentas ni contraseñas para el público.** Ni negocios ni vecinos crean cuentas.
   El negocio gestiona su ficha con un **enlace secreto** que recibe por WhatsApp al ser
   aprobado. El único login del sistema es el del panel de administración.
2. **Registrarse y aparecer es gratis, siempre.** La monetización futura (§9) nunca cobra
   la ficha básica ni le cobra al vecino.
3. **Verificación humana antes de publicar.** Nada se publica solo. El admin contacta al
   negocio (hoy por WhatsApp) y aprueba o rechaza con motivo. Existe una verificación por
   SMS **detrás de una bandera apagada** (§6.5) y aun encendida NO sustituye la
   aprobación humana: solo marca "número confirmado".
4. **WhatsApp es el canal.** El botón principal de cada ficha abre WhatsApp con mensaje
   prellenado. Llamar/Cómo llegar/Facebook son secundarios.
5. **Honestidad estructural.** El sistema nunca miente: si falta configuración, falla a
   la vista (no inventa datos ni degrada en silencio); si borra, borra de verdad (los
   archivos antes que la fila — un borrado a medias se reporta como fallido); si el texto
   legal cambia, la versión sube y se pide re-aceptación (nunca se reescribe lo aceptado).
   Este principio está tejido en todo el producto y es parte de la marca.
6. **Español mexicano coloquial en todo texto de UI.** "Registra tu negocio gratis", no
   "Crear listado". Se escribe como habla Tizayuca.
7. **Mobile-first real.** Se diseña a 390px; escritorio es adaptación. Meta de
   rendimiento: contenido visible en **<2s con 4G** (hoy: 1.3s, Lighthouse 100).
8. **Sin reseñas con estrellas.** Decisión de producto: en ciudades chicas se vuelven
   arma entre competidores. La verificación humana es el sustituto de confianza. El
   mecanismo de calidad es el botón "Reportar" (§6.4).
9. **Privacidad como promesa cumplible (LFPDPPP)** — ver §7. Los datos nunca se venden
   ni comparten; la analítica no usa cookies ni identifica personas.

## 3. Usuarios y flujos principales

### Flujo A — El negocio se registra (existe, en producción)
Formulario de UNA pantalla: 5 campos obligatorios (nombre, categoría, WhatsApp de 10
dígitos, colonia, qué ofreces) y opcionales (teléfono fijo, dirección/referencias,
horario en texto libre guiado, Facebook, UNA foto). Checkbox de consentimiento con aviso
simplificado visible (dice explícitamente qué datos quedarán públicos) y versión del
aviso declarada. Al enviar → estado "en revisión" → pantalla de gracias. Anti-abuso: 3
altas por hora por IP, honeypot, y umbral diario que alerta al admin.

### Flujo B — El vecino encuentra (existe)
Home con buscador + 8 categorías como botones grandes + bloque "Deporte en Tizayuca" (el
deporte es apuesta de descubrimiento, al nivel de las categorías comerciales). Búsqueda
por nombre y por palabras de "qué ofreces" ("plomero" encuentra al de "servicios del
hogar"). Listados por categoría y por categoría+colonia con URLs limpias indexables
(`/plomeria-huicalco`). Ficha con sello "Negocio verificado" y botón de WhatsApp
protagonista. Los estados vacíos siempre ofrecen salida (categorías, o "Registra tu
negocio gratis").

### Flujos C/D — El negocio se gestiona solo (existe)
Al aprobar, el mensaje de WhatsApp al negocio incluye su **enlace de gestión** (token de
256 bits; el sistema solo guarda su huella SHA-256 — un enlace perdido no se recupera, se
regenera). Con él: edición prellenada de su ficha. Los cambios NO tocan la ficha pública:
crean una **revisión pendiente** que el admin aprueba o descarta. "Perdí mi enlace" →
WhatsApp prellenado al admin. Regenerar invalida el anterior.

### Flujo E — El admin opera (existe)
Panel con contraseña única (sin cuentas): **cola de revisión** (altas nuevas + ediciones
+ reenvíos, un renglón por negocio, indicador de >48h de espera), **listado de todos los
negocios** (cualquier estado, filtros, paginación — la puerta para gestionar fichas
publicadas), **reportes** de vecinos, y el detalle con las acciones: aprobar (genera el
enlace y los mensajes de WhatsApp prellenados), rechazar con motivo, despublicar, borrar
definitivamente (ARCO), regenerar enlace. Todo opera desde un celular y sin JavaScript.

## 4. Reglas de negocio del ciclo de vida

- Estados de un negocio: `en_revision` → `publicado` | `rechazado`; `publicado` puede
  volver a `en_revision` (despublicación, con etiqueta propia en la cola).
- Un rechazado puede **reenviar** corrigiendo; el reenvío re-acepta el aviso vigente.
- Los **rechazados se purgan definitivamente a los 90 días** (automático, diario). Es
  promesa del aviso de privacidad: no es opcional.
- El **borrado ARCO** elimina de verdad: foto/archivos primero, fila después, ediciones
  en cascada; si no puede completar, lo dice (nunca reporta éxito parcial).
- Meta operativa: revisar pendientes en **<48 horas** (el panel lo señala; hay un aviso
  diario por correo en desarrollo — T-020).

## 5. Marca y copy — reglas fijas

- La marca es **"EnMiRumbo"** a secas (junto, M y R mayúsculas). El compuesto
  "EnMiRumbo Tizayuca" está **prohibido** (hay un guardián automático que lo detecta).
- Cuando hace falta contexto: "EnMiRumbo, el directorio de negocios de Tizayuca" (solo
  primera mención en textos legales o mensajes largos).
- La línea del pie es intocable: **"Hecho para los vecinos de Tizayuca, Hidalgo."**
- El relato: *"EnMiRumbo — el directorio de los negocios de tu rumbo"* ("rumbo" = como
  los vecinos llaman a su zona; sostiene la expansión futura a otras poblaciones).
- Mensaje prellenado del vecino al negocio: "Hola, te vi en EnMiRumbo. ¿Me das informes?"
- El verde WhatsApp es EL color de acción y solo se usa para la acción principal.

## 6. Compromisos que parecen técnicos pero son de negocio

Estos sobreviven a cualquier cambio de stack:

1. **El sitio público funciona sin JavaScript.** Formularios, filtros, paginación, panel:
   todo opera con HTML del servidor. (Celulares de gama baja y conexiones malas son el
   usuario real. El JS es mejora progresiva, nunca requisito.)
2. **<2s en 4G** (medido con Lighthouse móvil; hoy 100/100/100/100).
3. **SEO local**: URLs limpias por categoría y categoría+colonia, Schema LocalBusiness,
   sitemap, Open Graph digno de compartirse en WhatsApp (la vista previa importa).
4. **Analítica sin cookies y sin datos personales** (hoy Umami). Los eventos: visitas,
   vistas de ficha, clics a WhatsApp, altas. El panel y las pantallas del enlace de
   gestión están **fuera de la medición** (en las de gestión, la URL es la credencial).
5. **Verificación por SMS tras bandera** (`VERIFICACION_SMS_ACTIVA`, apagada): si se
   enciende, el registro pide confirmar el WhatsApp con un código; apagada, el flujo es
   byte a byte el actual. Costos acotados por cupos (cada SMS cuesta).
6. **TLS verificado de punta a punta con la base**; secretos jamás en el repo (es
   público); los tokens de gestión jamás en claro en la base ni en la analítica.
7. **Cero JavaScript de terceros** salvo el script de analítica, y solo en las páginas
   medidas (política de seguridad de contenido estricta).

## 7. Compromisos legales (LFPDPPP) — INVIOLABLES

El aviso de privacidad publicado es un contrato. Lo que promete, el sistema lo cumple:

- Solo se publican los datos que el negocio sabe que serán públicos (el aviso
  simplificado lo dice antes del consentimiento).
- La IP del que registra: solo en memoria, menos de una hora, nunca en la base (los
  límites anti-abuso están diseñados alrededor de esta promesa).
- El acceso al panel guarda HMAC de IP, no la IP.
- Derechos ARCO: despublicar y borrar existen en el panel (cancelación/oposición);
  acceso y rectificación se atienden manualmente (pendiente E3-7); plazo comprometido
  ≤20 días hábiles; el negocio puede pedir que campos opcionales no aparezcan.
- **Versionado del aviso**: el texto legal tiene huella criptográfica anclada a una
  versión. Cambiar el texto exige subir versión; quien aceptó la anterior conserva su
  constancia intacta; los reenvíos re-aceptan solo hacia adelante. Vigente: **versión 2**.
- Placeholders honestos: mientras falten datos del responsable (hoy: razón social —
  S.A.S. en trámite—, domicilio, jurisdicción), las páginas legales muestran marca de
  "borrador" a la vista. **Nunca** se llenan con datos falsos o seudónimos.
- Retención: rechazados 90 días; pendiente definir plazo para ediciones no aplicadas
  (E8-5).
- Contacto de datos: `contacto@enmirumbo.com`.

## 8. Métricas de éxito (sin cambio desde el MVP)

A 60 días del lanzamiento público: ~44 negocios acumulados, ≥60% de fichas con foto,
clics a WhatsApp como métrica estrella (es el "pedido" del MVP), pendientes de revisión
<48h sostenido. Detalle y proyecciones semanales: `docs/estrategia-lanzamiento.md`.

## 9. Hacia dónde va (Fase 2 — visión, no compromiso)

Detalle en `docs/vision-fase-2.md` y plan de ingresos en el PDF de monetización del
fundador. Resumen para que el equipo técnico no cierre puertas:

- **El pedido**: el vecino pide ("necesito un plomero hoy en mi colonia") y EnMiRumbo
  reparte entre verificados. Su interfaz natural es un **bot de WhatsApp** (Cloud API).
  La web queda de vitrina (SEO + ficha compartible); WhatsApp de mostrador.
- **Monetización en escalera**: métricas mensuales gratis a cada negocio → destacados
  etiquetados con techo por categoría → prioridad en pedidos. Nunca: cobrar registro,
  vender datos, publicidad camuflada, estrellas de paga.
- **Horario estructurado** (estilo Google Business) capturado vía enlace de gestión →
  chip y filtro "Abierto ahora". El registro conserva el texto libre.
- **Multi-localidad** (T-017): "Tizayuca" saldrá de literales hacia configuración cuando
  el modelo esté validado. El nombre EnMiRumbo ya lo soporta.

## 10. Lo técnico ACTUAL — referencia reemplazable

Lo de abajo es cómo está hecho HOY. Se puede cambiar TODO este bloque si §2–§7 quedan
intactos. Decisiones y porqués: `docs/decisiones/` (11 ADRs).

- Next.js (App Router) + TypeScript + Tailwind; Server Components; Prisma + PostgreSQL
  (Supabase) en todos los entornos; Vercel (deploy automático por merge); fotos en
  Supabase Storage (bucket privado, servidas por ruta propia con claves opacas, EXIF/GPS
  eliminado, compresión server-side); Umami Cloud; correo transaccional Resend (T-020).
- Suite de ~3,300 pruebas (unitarias, integración contra Postgres real y adversariales
  de seguridad) + guardianes que fijan invariantes (marca, huella legal, sesión,
  responsivo, no-fuga de analítica). CI en GitHub Actions obligatorio antes de merge.
- Operación: `docs/despliegue.md` es el runbook completo (variables, crons, TLS, prueba
  de humo). Respaldo diario externo mientras el plan de base no incluya backups.
- Proceso de desarrollo: `docs/proceso.md` (tickets → spec aprobada → pipeline
  multiagente con auditoría de seguridad → PR con CI → merge humano). Las specs
  consolidadas en `openspec/specs/` son el contrato de comportamiento: **cualquier
  reescritura técnica puede validarse contra ellas**.

---

*Documento generado el 2026-09-04 a partir del producto en producción, las 10 capacidades
de `openspec/specs/`, los ADRs y las decisiones del fundador. Ante conflicto entre este
documento y `openspec/specs/`, manda la spec (es más fina); ante conflicto de visión,
manda el fundador.*
