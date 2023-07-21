CREATE TABLE "City" (
  "city_id" uuid, /* city ID */
  "name" varchar(255),
  "shape" json,
  "country" varchar(255),
  "region" varchar(255),
  "area" bigint,
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("city_id")
);