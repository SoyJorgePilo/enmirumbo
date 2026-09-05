# Backlog — NecesitoUno (MVP)

> Derivado del PRD v0.7. Prioridades: P0 = imprescindible para lanzar, P1 = antes de escalar. Orden de las épicas ≈ orden de construcción sugerido.

## E0 · Fundaciones técnicas (P0)

| Historia | Descripción | Ticket |
|---|---|---|
| E0-1 | Modelo de datos: negocio (campos del PRD §6.1), categorías y colonias (Apéndice A) como catálogos, estados (`en_revision`, `publicado`, `rechazado`) | T-001 |
| E0-2 | Layout base mobile-first: header, footer, tipografía y paleta; verde WhatsApp como color de acción | — |
| E0-3 | Deploy continuo a producción (base decidida: PostgreSQL en Supabase, ADR-004; código listo en T-013 — falta el paso humano de crear cuentas, dominio y DNS: `docs/despliegue.md`) | T-013 |

## E1 · Registro de negocio (P0 — PRD §6.1, Flujo A)

| Historia | Descripción |
|---|---|
| E1-1 | Formulario de una pantalla con 5 obligatorios y 5 opcionales, ejemplos de "¿Qué ofreces?" adaptados a la categoría elegida |
| E1-2 | Checkbox de consentimiento con aviso simplificado visible y link al integral |
| E1-3 | Subida de una foto desde galería, comprimida en el servidor; incluye validar `fotoUrl` antes de renderizarla en el directorio (hallazgo M1 de T-004) |
| E1-6 | El aviso simplificado del formulario debe decir que el WhatsApp y el teléfono quedan públicos en la ficha (hallazgo M3 de T-004, LFPDPPP) |
| E1-4 | Envío → estado `en_revision` → pantalla de gracias con mensaje del PRD |
| E1-5 | Colonia "Otra" con texto libre marcado para normalización del admin |

## E2 · Directorio público (P0 — PRD §6.2, Flujo B)

| Historia | Descripción |
|---|---|
| E2-1 | Home: buscador + categorías como botones grandes + bloque "Deporte en Tizayuca" |
| E2-2 | Listado por categoría con filtro por colonia: tarjetas con foto, nombre, colonia, etiqueta "A domicilio" y botón de WhatsApp directo |
| E2-3 | Ficha de negocio: información completa, botones WhatsApp / Llamar / Cómo llegar / Facebook, sello "Negocio verificado" |
| E2-4 | Búsqueda por nombre y palabras clave de "¿Qué ofreces?" ("plomero" encuentra al de "Servicios del hogar") |

## E3 · Panel de revisión del admin (P0 — PRD §6.3)

| Historia | Descripción |
|---|---|
| E3-1 | Acceso protegido al panel (mecanismo mínimo; sin sistema de cuentas públicas) |
| E3-2 | Cola de revisión: pendientes con todos los datos + botón para abrir WhatsApp del negocio (verificación manual) |
| E3-3 | Aprobar (publica la ficha) / rechazar (con motivo); normalizar colonia "Otra" |
| E3-4 | Botón "Reportar" en ficha pública → entra a la cola del admin |
| E3-5 | Indicador de pendientes >48h (meta operativa del PRD) |
| E3-6 | Borrado definitivo desde el panel (derechos ARCO, PRD §8 — hoy se atendería a mano contra la base; el PRD compromete ≤20 días hábiles, necesario antes del lanzamiento) — **hecho en T-015** para cancelación y oposición (despublicar y borrar) |
| E3-7 | Acceso y rectificación desde el panel: entregarle al negocio una copia de sus datos y editarlos o quitar un campo de su ficha. Es lo que queda del renglón ARCO de `PENDIENTES_OPERATIVOS_LEGALES` después de T-015; hoy se hace a mano contra la base (E8-2 lo resolvería del lado del negocio) |
| E3-8 | Buscador de fichas dentro del panel (por nombre o WhatsApp): hoy llegar al detalle de una ficha publicada sin reporte de por medio obliga a copiar el id del final de la URL pública, incómodo desde el celular (duda 1 de T-015). El listado completo para gestionar cualquier negocio ya tiene ticket: **T-018** (revisión del fundador 2026-09-04) |
| E3-9 | Bitácora de las acciones destructivas del admin (quién despublicó o borró y cuándo) + segundo factor de acceso al panel. Con un solo admin es tolerable; en cuanto haya dos, es lo primero que hace falta para poder demostrar el plazo ARCO (BAJO 4 de la auditoría de T-015) |
| E3-10 | Que `rechazarRegistro` deje de recortar el motivo en silencio a 500 caracteres: ese texto viaja dentro del WhatsApp que se le manda al negocio, así que un recorte llega como una frase cortada a media palabra. `despublicarFicha` ya lo rechaza con error de formulario en vez de recortarlo (T-015); emparejar los dos exige enmendar la spec de T-005 (BAJO 5 de la auditoría de T-015) |
| E3-11 | El detalle repinta los giros previos si el admin los desmarca todos y la aprobación falla por otra validación: `sp.giro ? … : registro.girosIds` debe discriminar por `sp.errorAprobar` (nota del validador de T-015) |

## E4 · Deporte en Tizayuca (P0 — PRD §6.5)

| Historia | Descripción |
|---|---|
| E4-1 | Bloque destacado en home al nivel de las categorías comerciales |
| E4-2 | Ejemplos del formulario adaptados a deporte; misma ficha, sin lógica aparte |
| E4-3 | Páginas indexables "clases de [disciplina] en Tizayuca" |

## E5 · SEO local (P0 — PRD §8)

| Historia | Descripción |
|---|---|
| E5-1 | URLs limpias por categoría y categoría+colonia (ej. `/plomeria-haciendas-de-tizayuca`) |
| E5-2 | Schema Markup LocalBusiness en cada ficha |
| E5-3 | Sitemap, metadata y Open Graph (las fichas se comparten por WhatsApp/Facebook: la vista previa importa) |
| E5-4 | Rendimiento: <2s en 4G, imágenes comprimidas (medir con Lighthouse) |
| E5-5 | robots.txt y fricción contra la cosecha masiva del directorio (hallazgo M5 de T-004) |

## E6 · Legal (P0 — PRD §8)

| Historia | Descripción |
|---|---|
| E6-1 | Página de aviso de privacidad integral (elementos mínimos LFPDPPP 2025) |
| E6-2 | Página de términos y condiciones (intermediario informativo, deslinde, reglas de contenido) |
| E6-3 | ⚠️ Revisión legal profesional antes del lanzamiento (tarea humana, fuera del código) |

## E7 · Analítica (P0 — PRD §9-10, "desde el día 1")

| Historia | Descripción |
|---|---|
| E7-1 | Eventos: vistas de ficha, clics a WhatsApp, altas enviadas/aprobadas, visitantes únicos |
| E7-2 | Vista simple de métricas contra los umbrales del PRD §10 (puede ser el propio proveedor de analítica al inicio) |

## E8 · Edición con enlace de gestión (P1 — PRD §6.4, Flujos C y D)

| Historia | Descripción |
|---|---|
| E8-1 | Generación de enlace único y secreto al aprobar; se invalida al regenerar |
| E8-2 | Modo edición prellenado desde el enlace; los cambios crean una revisión pendiente sin tocar la ficha pública |
| E8-3 | Cola del admin distingue "alta nueva" de "edición"; aprobar aplica los cambios |
| E8-4 | Botón "Perdí mi enlace" → WhatsApp prellenado al admin |
| E8-5 | Retención de las ediciones: `EdicionPendiente` crece sin poda y cada fila conserva una copia completa de datos personales (nombre, WhatsApp, teléfono, dirección), incluidas las ya aplicadas y descartadas. Hoy no hay plazo declarado ni purga —la de los 90 días solo alcanza a los rechazados—, así que es retención sin plazo frente a la LFPDPPP (PRD §8). Falta decidir el plazo y escribir la purga, junto a la de rechazados |

---

**Fuera de alcance** (PRD §6.6): cuentas/login, pagos, reseñas, pedidos, app nativa, multi-sucursal, otras ciudades, verificación automática.

**Deuda menor registrada** (candidata a una ruta corta): de T-014: el caso residual `publicado → en_revision → rechazado` con edición pendiente huérfana, `sinBytesNulos` en `leerEnvioRegistro` (BAJO 1 de la auditoría), y sumar la foto al modo edición (hoy la edición no toca la foto — decidir si E8 lo quiere); el listado "Todos los negocios" no señala si una ficha tiene edición pendiente (hoy ese trabajo vive en la cola; decidirlo a propósito si el listado crece como vista de gestión — observación del validador de T-014); del listado del panel (T-018, observaciones del validador): índices en `Negocio.estado`/`registradoEn` cuando el volumen lo pida, `textoFechaDeRegistro` usa la zona del servidor (UTC — la fecha puede diferir un día de la hora de Tizayuca), y `obtenerListadoDeNegocios` confía en `pagina ≥ 1` del normalizador; excluir `/negocio/*/reportar` y `/reportar/gracias` de robots.txt (O1 de T-011); escribir como norma el trim del honeypot en reportes Y altas (implementado y auditado, falta en spec); mencionar el botón Reportar en `/terminos` (evaluar con la revisión legal E6-3); el recorte silencioso del motivo en `rechazarRegistro` (fijado por spec de T-005, alinear con el criterio de rechazo por longitud de T-015); agregar `/aviso-de-privacidad` y `/terminos` al sitemap (T-007 y T-009 mergearon en paralelo y el requirement enumerativo no las incluyó — enmendar spec al hacerlo); hallazgos bajos B1-B4 de la auditoría de T-004 (`openspec/changes/archive/agregar-directorio-publico/reports/c-seguridad.md`), `<meta name="format-detection" content="telephone=no">` en el layout, unificar los teléfonos ficticios de seeds/tests a la convención `771999xxxx`, el salto h1→h3 en las tarjetas del listado, caracteres de control literales en `tests/registro-adversarial.test.ts` (git lo trata como binario), y registrar la renovación de consentimiento del titular en reenvíos (columna adicional — bajo de T-005). De T-006 quedan con dueño: anti-flood de `/buscar` (E5-5) y las consultas con adjetivo/complemento que dan cero resultados (mejora de producto, esperar datos reales de búsqueda).
