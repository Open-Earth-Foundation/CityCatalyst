CREATE TABLE "Version"(
  "version_id" uuid,
  "year" int,
  "version" varchar(255),
  "inventory_id" uuid,
  PRIMARY KEY ("version_id"),
  CONSTRAINT "FK_Version.inventory_id"
    FOREIGN KEY ("inventory_id")
      REFERENCES "Inventory"("inventory_id")
);