CREATE TABLE "Population" (
  "city_id" varchar(36), /* city ID */
  "population" bigint, /* Population in units; 1000 => 1000 people */
  "year" int, /* Year of measurement, YYYY */
  "created" timestamp,
  "last_updated" timestamp,
  "datasource_id" varchar(36),
  PRIMARY KEY ("city_id", "year")  /* One record per actor per year */
  CONSTRAINT "FK_Population.datasource_id"
    FOREIGN KEY ("datasource_id")
      REFERENCES "DataSource"("datasource_id"),
  CONSTRAINT "FK_Population.city_id"
    FOREIGN KEY ("city_id")
      REFERENCES "City"("city_id")
);