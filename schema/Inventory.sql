CREATE TABLE "Inventory"(
  "inventory_id" uuid,
  "inentory_name" varchar(255),
  "year" int,
  "total_emissions" bigint,
  "city_id" uuid,
  PRIMARY KEY ("inventory_id"),
  CONSTRAINT "FK_Inventory.city_id"
    FOREIGN KEY ("city_id")
    REFERENCES "City" ("city_id")
);