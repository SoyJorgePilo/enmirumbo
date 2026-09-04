# T-007 · Publicar las páginas legales y transparentar el uso de datos

**Estado:** en-review
**Prioridad:** P0
**Épica:** E6-1, E6-2, E1-6 (docs/backlog.md)
**Referencias PRD:** §8 (LFPDPPP 2025, elementos mínimos del aviso), §6.3 (reglas de moderación → términos), §6.1 (checkbox con link al integral)
**Depende de:** T-002 (footer), T-003 (formulario)
**OpenSpec change:** `agregar-paginas-legales`
**PR:** [#9](https://github.com/SoyJorgePilo/necesitouno/pull/9)

## Contexto

El sitio ya recibe y publica datos personales de negocios, pero el aviso de privacidad integral y los términos no existen: el checkbox del formulario promete un link que no lleva a ningún lado (por eso hoy no lo muestra) y el footer reservó el espacio desde T-002. Además, la auditoría de T-004 encontró que el aviso simplificado no dice lo más importante: que el WhatsApp y el teléfono quedan públicos en la ficha (hallazgo M3, E1-6). Todo el texto es borrador de producto: la revisión legal profesional (E6-3) sigue siendo gate humano previo al lanzamiento.

## Criterios de aceptación

- [x] Existe la página del aviso de privacidad integral con los elementos mínimos LFPDPPP del PRD §8: identidad y domicilio del responsable, datos tratados, finalidades, medios para limitar uso o divulgación, mecanismo de derechos ARCO (con el plazo de ≤20 días hábiles) y procedimiento de cambios — con placeholders claramente marcados donde falten datos del responsable que solo el humano puede dar
- [x] Existe la página de términos y condiciones: intermediario informativo, deslinde de las operaciones entre vecinos y negocios, y las reglas de moderación del PRD §6.3 publicadas
- [x] El footer enlaza ambas páginas (los enlaces que T-002 dejó previstos, con área táctil ≥44px)
- [x] El aviso simplificado del formulario dice de forma llana que el nombre del negocio, WhatsApp, teléfono y demás datos de la ficha serán públicos en el directorio (E1-6/M3), y enlaza al aviso integral
- [x] Ambas páginas son indexables, en español mexicano llano (el público no es abogado), mobile-first y sin JS de cliente
- [x] La lista blanca de enlaces (`tests/layout.test.ts`) reconoce las rutas nuevas; el scenario del footer "sin enlaces muertos" se actualiza conforme al delta de spec

## Fuera de alcance de este ticket

- Revisión legal profesional (E6-3 — humana; las páginas quedan marcadas como borrador hasta entonces)
- El flujo operativo ARCO en el panel (E3-6)
- La foto del negocio y su política de publicación detallada (T-008 la menciona en su superficie)

## Notas

- El texto legal se redacta con base en el PRD §8 y la LFPDPPP 2025 citada ahí; donde falte un dato real (domicilio del responsable, correo de contacto ARCO) va un placeholder visible tipo «[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]» para que la revisión legal humana no pase nada por alto.
- El correo/canal ARCO propuesto: el WhatsApp del directorio y un correo — decidir en la spec cuál poner como placeholder.
