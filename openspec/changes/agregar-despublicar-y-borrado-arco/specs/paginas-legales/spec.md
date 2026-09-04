# Delta: paginas-legales — el flujo ARCO deja de ser un pendiente operativo

## MODIFIED Requirements

### Requirement: Placeholders visibles y marca de borrador mientras falten datos del responsable

Todo dato que solo una persona puede aportar (nombre o razón social del responsable, domicilio, correo de contacto/ARCO, WhatsApp del directorio, fecha de publicación y jurisdicción) DEBE aparecer en la página como un placeholder visible entre corchetes con la indicación de que falta completarlo, nunca como un dato inventado, un espacio en blanco o texto de relleno. Mientras quede al menos un placeholder sin completar, ambas páginas DEBEN mostrar arriba, de forma visible, la marca de borrador con el texto literal "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance." Los placeholders pendientes DEBEN estar declarados en un solo lugar del código, de modo que la verificación automática pueda listarlos y el checklist de lanzamiento no dependa de que alguien los busque a ojo.

Los datos que faltan no son lo único pendiente antes de retirar la marca de borrador. El aviso compromete una operación —atender las solicitudes ARCO en ≤20 días hábiles, despublicar y borrar de forma definitiva, y eliminar los datos de los registros rechazados a los 90 días— y junto a los placeholders DEBE declararse, en el mismo módulo y en la misma forma recorrible, la lista de los **pendientes operativos** que siguen sin resolverse, cada uno con el ticket que lo resuelve, para que la revisión legal y el checklist de lanzamiento los vean sin buscarlos a ojo. Un pendiente DEBE salir de esa lista en cuanto el panel lo pueda hacer de verdad: **despublicar una ficha y borrar un registro de forma definitiva ya son acciones del panel (T-015), así que ese renglón se retira**; sigue en la lista la purga de los registros rechazados a los 90 días, que no existe (E0-3/T-013). Esta lista NO se publica en las páginas: el texto legal dice lo que el responsable se compromete a hacer, no el estado del backlog; lo que las páginas no DEBEN hacer es prometer automatismos que no existen.

Los textos publicados del aviso y de los términos NO cambian con esto y siguen siendo verdad: la despublicación y el borrado se ejecutan a mano y a petición del titular, después de que el admin verifica la titularidad por WhatsApp; el titular sigue sin tener "un botón que lo haga solo". Lo que cambia es que el admin ya no toca la base a mano para cumplirlo.

#### Scenario: el domicilio del responsable todavía no existe

- **WHEN** el humano abre `/aviso-de-privacidad` antes de la revisión legal
- **THEN** en lugar del domicilio lee "[DOMICILIO DEL RESPONSABLE — completar antes del lanzamiento]", y lo mismo para el nombre del responsable, el correo ARCO y el WhatsApp del directorio

#### Scenario: marca de borrador visible

- **WHEN** cualquier persona abre cualquiera de las dos páginas legales mientras siga habiendo placeholders sin completar
- **THEN** lee arriba "Ojo: este texto todavía es un borrador. Nos faltan los datos que ves entre corchetes y la revisión legal antes de que el directorio se lance."

#### Scenario: los pendientes son verificables

- **WHEN** se corre la verificación automática del sitio
- **THEN** puede listar cuáles placeholders siguen sin completar, y ninguna página legal contiene un dato de contacto o un domicilio inventado

#### Scenario: el pendiente del flujo ARCO ya no aparece

- **WHEN** la revisión legal o el checklist de lanzamiento revisan la lista de pendientes operativos
- **THEN** ya no encuentran el renglón del flujo ARCO en el panel, porque despublicar y borrar ya se hacen desde el panel

#### Scenario: la purga sigue pendiente

- **WHEN** se revisa la misma lista
- **THEN** sigue apareciendo la eliminación de los datos de los registros rechazados a los 90 días, con su ticket, y ninguno de los pendientes aparece publicado en las páginas legales

#### Scenario: el texto legal no cambia

- **WHEN** se comparan `/aviso-de-privacidad` y `/terminos` con el texto aprobado en esta spec después de que el panel estrena despublicar y borrar
- **THEN** coinciden párrafo por párrafo: siguen diciendo que todo se atiende a mano y a petición, con confirmación en un máximo de 20 días hábiles
