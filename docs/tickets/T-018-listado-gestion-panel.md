# T-018 · Listar todos los negocios en el panel para gestionarlos

**Estado:** en-spec <!-- pendiente | en-spec | en-desarrollo | en-review | hecho -->
**Prioridad:** P1
**Épica:** E3 (docs/backlog.md)
**Referencias PRD:** §6.3
**Depende de:** T-014
**OpenSpec change:** `agregar-listado-gestion-panel`
**PR:** —

## Contexto

Hoy el panel solo muestra la cola de revisión (pendientes) y los reportados. Un negocio ya publicado y sin reportes es inalcanzable para el admin salvo adivinando la URL `/admin/registros/<id>`: el fundador lo detectó al preguntar "¿dónde borro un negocio publicado?". Sin un listado completo, las herramientas de T-015 (despublicar, borrar/ARCO) no se pueden operar en la práctica.

## Criterios de aceptación

- [ ] El panel tiene una vista "Todos los negocios" con cada registro (cualquier estado: en revisión, publicado, rechazado, despublicado), su estado visible y enlace a su detalle `/admin/registros/<id>`.
- [ ] Se puede filtrar o al menos distinguir por estado sin salir de la vista; el orden por defecto deja arriba lo más reciente.
- [ ] Con muchos registros la vista no se degrada (paginación o corte razonable definido en la spec).
- [ ] La vista queda detrás de la misma sesión del panel y con las mismas cabeceras/protecciones que el resto de `/admin`.
- [ ] Cero JS de cliente nuevo; texto en español mexicano coloquial.

## Fuera de alcance de este ticket

- Buscador por texto dentro del panel (deuda E3-8; si la spec lo resuelve gratis, bien, pero no es requisito).
- Acciones nuevas sobre los registros (las de T-005/T-015 ya existen en el detalle).
- Edición de datos del negocio desde el panel.

## Notas

- Superficie sensible (panel admin): ruta completa obligatoria (spec + pipeline con seguridad-test).
- Nace de la revisión visual del fundador (2026-09-04). Relacionado con la deuda "buscador del panel" registrada al cerrar T-015.
