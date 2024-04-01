DROP TABLE IF EXISTS population_staging;

CREATE TEMP TABLE population_staging (LIKE population INCLUDING ALL);

\copy population_staging (actor_id, year, population) from 'population.csv' with CSV HEADER;

INSERT INTO population (actor_id, year, population)
SELECT actor_id, year, population
FROM population_staging
ON CONFLICT ON CONSTRAINT population_pkey
DO UPDATE SET
  population = EXCLUDED.population;

DROP TABLE population_staging;
