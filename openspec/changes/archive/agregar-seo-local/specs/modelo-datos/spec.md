# Spec delta: modelo-datos

## ADDED Requirements

### Requirement: Los slugs de los tres catálogos no producen URLs ambiguas en la raíz

Las páginas públicas de categoría (`/servicios-del-hogar`), de giro (`/plomeria`) y de giro+colonia (`/plomeria-haciendas-de-tizayuca`) comparten la raíz del sitio, así que los slugs de los tres catálogos DEBEN garantizar que **cada URL de la raíz se lea de una sola manera**. El proyecto DEBE tener una verificación automática sobre los catálogos sembrados que falle —antes de que nada se publique— si se rompe cualquiera de estas condiciones:

- ningún slug de giro ni de colonia coincide con un slug de categoría;
- ningún slug de ninguno de los tres catálogos coincide con un segmento reservado del sitio (las rutas propias, PRD §6.3 y §6.4);
- ningún slug compuesto `«giro»-«colonia»` coincide con un slug de categoría ni con un slug de giro;
- ningún slug compuesto `«giro»-«colonia»` admite dos lecturas distintas, es decir, no existen dos pares de giro y colonia del catálogo que produzcan la misma URL.

Esto NO exige campos nuevos ni migraciones: es una invariante de los catálogos ya sembrados (8 categorías, 21 colonias y 49 giros con slug estable). Reservar un nombre es gratis; migrar una URL ya publicada, no.

#### Scenario: los catálogos de hoy son inequívocos

- **WHEN** se corre la verificación sobre la base con los tres catálogos sembrados
- **THEN** pasa: ninguna URL de la raíz se puede leer de dos maneras

#### Scenario: un giro que se llama como una categoría

- **WHEN** se agrega al catálogo un giro cuyo slug coincide con el de una categoría
- **THEN** la verificación falla y señala el slug en conflicto

#### Scenario: un giro que taparía una ruta propia

- **WHEN** se agrega al catálogo un giro o una colonia con un slug que es un segmento reservado del sitio (por ejemplo `buscar`)
- **THEN** la verificación falla y señala el slug en conflicto

#### Scenario: un compuesto con dos lecturas

- **WHEN** el catálogo llega a un estado en el que un mismo slug compuesto se puede leer como dos pares distintos de giro y colonia
- **THEN** la verificación falla y nombra las dos lecturas posibles
