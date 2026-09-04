# Delta: directorio-publico — lo despublicado y lo borrado desaparecen de inmediato

## MODIFIED Requirements

### Requirement: Solo se muestra lo que está publicado

El directorio público DEBE mostrar únicamente negocios en estado `publicado`. Los negocios en `en_revision` o `rechazado` NO DEBEN aparecer en ningún listado, ni en ningún conteo, ni en el filtro de colonias, ni en los resultados del buscador, y su ficha DEBE responder 404 con la misma página y el mismo código que un negocio inexistente, para no delatar que existe una ficha en revisión (PRD §6.3 y §8).

**Esa regla se aplica también en el instante en que una ficha deja de estar publicada.** Cuando el admin despublica una ficha, esta DEBE desaparecer del directorio en la siguiente petición, sin esperar a que caduque ningún caché ni a que se regenere nada: fuera del listado de su categoría, de sus conteos, del filtro de colonias, del bloque de la home, de los resultados del buscador y de cualquier índice que el sitio genere a partir de lo publicado (el sitemap, el día que exista, se genera de lo publicado y hereda esta regla). Su URL DEBE responder el mismo 404 indistinguible que sirve para un negocio en revisión o inexistente: nada en la respuesta DEBE permitir distinguir "esta ficha se despublicó" de "esta ficha nunca existió". Lo mismo aplica a una ficha borrada de forma definitiva.

Ninguna superficie pública DEBE mostrar jamás la fecha ni el motivo de una despublicación: son datos internos del panel, como el motivo de un rechazo.

#### Scenario: un negocio en revisión no aparece en el listado

- **WHEN** un negocio de la categoría "Belleza" está en estado `en_revision` y el vecino abre `/belleza`
- **THEN** ese negocio no aparece en el listado ni ninguno de sus datos está en el HTML de la página

#### Scenario: un negocio rechazado no aparece en el listado

- **WHEN** un negocio está en estado `rechazado` y el vecino abre el listado de su categoría
- **THEN** ese negocio no aparece ni ninguno de sus datos está en el HTML de la página

#### Scenario: ficha de un negocio no publicado

- **WHEN** alguien abre la URL de la ficha de un negocio en `en_revision` o `rechazado`
- **THEN** ve la página 404 en español, exactamente igual que si el negocio no existiera, y ningún dato del negocio aparece en la respuesta

#### Scenario: la ficha despublicada sale del directorio en la siguiente petición

- **WHEN** el admin despublica un negocio y enseguida se abren la home, el listado de su categoría con y sin filtro de colonia, y la página de resultados con una búsqueda que antes lo encontraba
- **THEN** no aparece en ninguna, ninguno de sus datos está en el HTML y los conteos de esas pantallas ya no lo incluyen

#### Scenario: la URL de una ficha despublicada no delata nada

- **WHEN** alguien abre el enlace que le compartieron por WhatsApp de una ficha que acaba de despublicarse
- **THEN** ve exactamente la misma página 404, con el mismo código, que si el identificador nunca hubiera existido, sin ningún aviso de que la ficha estuvo publicada

#### Scenario: la ficha borrada tampoco deja rastro

- **WHEN** alguien abre la URL de una ficha borrada de forma definitiva
- **THEN** ve el mismo 404 y ningún dato del negocio aparece en la respuesta

#### Scenario: la despublicación no se publica

- **WHEN** se revisan la home, los listados, la página de resultados y el HTML de cualquier ficha después de despublicar un negocio
- **THEN** en ninguna aparece la fecha ni el motivo de la despublicación
