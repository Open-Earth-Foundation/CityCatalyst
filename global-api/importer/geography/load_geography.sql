DROP TABLE IF EXISTS geography_staging;

CREATE TEMP TABLE geography_staging (LIKE geography INCLUDING ALL);

\copy geography_staging (locode, region, country) from 'geography.csv' with CSV HEADER;

INSERT INTO geography (locode, region, country)
SELECT locode, region, country
FROM geography_staging
ON CONFLICT ON CONSTRAINT geography_pkey
DO UPDATE SET
  region = EXCLUDED.region,
  country = EXCLUDED.country;

DROP TABLE geography_staging;
