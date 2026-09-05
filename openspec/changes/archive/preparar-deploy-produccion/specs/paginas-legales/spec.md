# Delta de spec: paginas-legales

Único cambio: la lista de **pendientes operativos** deja de declarar la purga de los 90 días (este change la automatiza) y declara en su lugar lo que ADR-004 exige antes del lanzamiento — nombrar en el aviso al proveedor que trata los datos por cuenta nuestra. El texto publicado de las dos páginas legales NO cambia.

## MODIFIED Requirements

### Requirement: Placeholders visibles y marca de borrador mientras falten datos del responsable

Todo dato que solo una persona puede aportar (nombre o razón social del responsable, domicilio, correo de contacto/ARCO, WhatsApp del directorio, fecha de publicación y jurisdicción) DEBE aparecer en la página como un placeholder visible entre corchetes con la indicación de que falta completarlo, nunca como un dato inventado, un espacio en blanco o texto de relleno. Mientras quede al menos un placeholder sin completar, ambas páginas DEBEN mostrar arriba, de forma visible, la marca de borrador con el texto literal "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance." Los placeholders pendientes DEBEN estar declarados en un solo lugar del código, de modo que la verificación automática pueda listarlos y el checklist de lanzamiento no dependa de que alguien los busque a ojo.

Los datos que faltan no son lo único pendiente antes de retirar la marca de borrador. El aviso compromete operaciones que el sistema todavía no cumple solo. Junto a los placeholders DEBE declararse, en el mismo módulo y en la misma forma recorrible, la lista de esos **pendientes operativos**, cada uno con el ticket que lo resuelve, para que la revisión legal y el checklist de lanzamiento los vean sin buscarlos a ojo. Esta lista NO se publica en las páginas: el texto legal dice lo que el responsable se compromete a hacer, no el estado del backlog; lo que las páginas no DEBEN hacer es prometer automatismos que no existen.

La lista DEBE reflejar la realidad del sistema, y hoy son dos: (a) atender las solicitudes ARCO, despublicar una ficha y borrar de forma definitiva se sigue haciendo a mano contra la base, porque el panel solo aprueba y rechaza (T-015, E3-6); y (b) el aviso dice que los datos los tratan "los proveedores que hacen funcionar el sitio (hospedaje y base de datos)" sin nombrarlos, y ADR-004 exige nombrar al encargado del tratamiento antes del lanzamiento, cosa que solo puede escribirse cuando la cuenta exista (revisión legal, E6-3). La eliminación de los registros rechazados a los 90 días DEJA de ser un pendiente operativo: el sistema la ejecuta solo.

#### Scenario: el domicilio del responsable todavía no existe

- **WHEN** el humano abre `/aviso-de-privacidad` antes de la revisión legal
- **THEN** en lugar del domicilio lee "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]", y lo mismo para el nombre del responsable, el correo ARCO y el WhatsApp del directorio

#### Scenario: marca de borrador visible

- **WHEN** cualquier persona abre cualquiera de las dos páginas legales mientras siga habiendo placeholders sin completar
- **THEN** lee arriba "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance."

#### Scenario: los pendientes son verificables

- **WHEN** se corre la verificación automática del sitio
- **THEN** puede listar cuáles placeholders siguen sin completar, y ninguna página legal contiene un dato de contacto o un domicilio inventado

#### Scenario: los pendientes operativos también están declarados

- **WHEN** la revisión legal o el checklist de lanzamiento revisan qué falta antes de retirar la marca de borrador
- **THEN** encuentran, junto a la lista de placeholders y en el mismo módulo, la lista de pendientes operativos —el flujo ARCO en el panel y el nombre del encargado del tratamiento en el aviso—, cada uno con su ticket, y ninguno de ellos aparece publicado en las páginas legales

#### Scenario: la purga ya no es un pendiente

- **WHEN** se recorre la lista de pendientes operativos después de este change
- **THEN** la eliminación de los registros rechazados a los 90 días ya no aparece, porque el sistema la ejecuta sin intervención humana
