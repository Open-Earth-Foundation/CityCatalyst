CREATE TABLE "SectorValue" (
  "sector_value_id" uuid,
  "total_emissions" numeric,
  "sector_id" uuid,
  "inventory_id"  uuid,
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("sector_value_id")
  CONSTRAINT "FK_SectorValue.sector_id"
    FOREIGN KEY ("sector_id")
      REFERENCES "Sector"("sector_id"),
  CONSTRAINT "FK_SectorValue.inventory_id"
    FOREIGN KEY ("inventory_id")
      REFERENCES "Inventory"("inventory_id")
);