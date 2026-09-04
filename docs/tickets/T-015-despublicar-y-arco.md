# T-015 · Dar al admin las acciones sobre fichas publicadas: despublicar y borrado ARCO

**Estado:** en-review
**Prioridad:** P0 (criterio de lanzamiento: el aviso de privacidad ya promete ambas cosas)
**Épica:** E3-6 y hallazgo de T-011 (docs/backlog.md)
**Referencias PRD:** §6.3 (moderación, retiro de fichas), §8 (ARCO ≤20 días hábiles, borrado definitivo)
**Depende de:** T-005 (panel), T-011 (los reportes son el disparador natural)
**OpenSpec change:** `agregar-despublicar-y-borrado-arco`
**PR:** [#13](https://github.com/SoyJorgePilo/necesitouno/pull/13)

## Contexto

El panel aprueba y rechaza registros en revisión, pero no puede actuar sobre fichas ya publicadas: ni bajar la de un negocio que cerró o resultó falso (lo que los reportes de T-011 van a pedir a gritos), ni ejecutar el borrado definitivo que el aviso de privacidad ya promete atender en ≤20 días hábiles. Hoy ambas cosas serían tocar la base a mano — inaceptable con el sitio lanzado.

## Criterios de aceptación

- [x] Desde el detalle de una ficha `publicado`, el admin puede **despublicarla** con motivo: la ficha regresa a `en_revision` (o el estado que la spec justifique), desaparece del directorio/búsqueda/sitemap de inmediato, y su URL responde el 404 indistinguible
- [x] Despublicar ofrece el WhatsApp prellenado de aviso al negocio (texto literal en la spec), consistente con los avisos de T-005
- [x] Desde el detalle de cualquier registro, el admin puede ejecutar el **borrado definitivo** (hard delete: fila, vínculos con giros, reportes, y archivos de foto si T-008 está) con confirmación explícita de dos pasos — es irreversible
- [x] Ambas acciones exigen sesión válida, son idempotentes/condicionadas al estado (mismo patrón de `updateMany` de T-005), y quedan fuera del alcance de cualquier POST sin autenticar
- [ ] Los reportes pendientes del negocio (T-011) se muestran junto a las acciones para dar contexto a la decisión — **bloqueado por T-011, que no ha mergeado**: el detalle ya reserva el lugar exacto (entre los datos y las acciones) con el comentario ancla en `src/app/admin/registros/[id]/page.tsx`. Se cierra al mergear T-011.
- [x] El borrado responde a solicitudes ARCO: la spec documenta el flujo operativo (solicitud por WhatsApp/correo → verificación de titularidad por el admin → borrado) aunque el software solo implemente el botón

## Fuera de alcance de este ticket

- Papelera/recuperación (el borrado es definitivo por diseño ARCO)
- Purga automática de rechazados a 90 días (T-013/E0-3, mecanismo de cron)
- Registro de auditoría de acciones del admin

## Notas

- El aviso de privacidad publicado dice "borrado definitivo" y "despublicación en cuanto nos llega tu mensaje" — este ticket es lo que vuelve verdad operativa esas frases.
- Verificación de titularidad antes de borrar: humana, por WhatsApp (mismo criterio de la verificación de alta).
