-- Negocios FICTICIOS del spike (repo público + LFPDPPP): ningún nombre ni
-- teléfono real. Solo crea y llena `spike_negocio`; no toca nada más.
CREATE TABLE IF NOT EXISTS spike_negocio (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  giro TEXT NOT NULL,
  colonia TEXT NOT NULL
);
TRUNCATE spike_negocio RESTART IDENTITY;
INSERT INTO spike_negocio (nombre, giro, colonia) VALUES
  ('Tlapalería La Ficticia', 'Tlapalería', 'Haciendas de Tizayuca'),
  ('Plomería Don Ejemplo', 'Plomería', 'Centro'),
  ('Tortillería Prueba Feliz', 'Tortillería', 'Huitzila');
