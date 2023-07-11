CREATE TABLE "GDP" (
  "city_id" varchar(36), /* city ID */
  "gdp" bigint, /* GDP in US dollars */
  "year" int, /* Year of measurement, YYYY */
  "created" timestamp,
  "last_updated" timestamp,
  "datasource_id" varchar(36),
  PRIMARY KEY ("city_id", "year")  /* One record per actor per year */
  CONSTRAINT "FK_GDP.datasource_id"
    FOREIGN KEY ("datasource_id")
      REFERENCES "DataSource"("datasource_id"),
  CONSTRAINT "FK_GDP.city_id"
    FOREIGN KEY ("city_id")
      REFERENCES "City"("city_id")
);