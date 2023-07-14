CREATE TABLE "SubSectorValue" (
  "subsector_value_id" uuid,
  "activity_units" varchar(255),
  "activity_value" numeric,
  "emission_factor_value" numeric,
  "total_emissions" numeric,
  "emission_factor_id" uuid,
  "subsector_id" uuid,
  "sector_value_id" uuid,
  "inventory_id"  uuid,
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("subsector_value_id")
  CONSTRAINT "FK_SubSectorValue.emission_factor_id"
    FOREIGN KEY ("emission_factor_id")
      REFERENCES "EmissionFactor"("emission_factor_id"),
  CONSTRAINT "FK_SubSectorValue.subsector_id"
    FOREIGN KEY ("subsector_id")
      REFERENCES "SubSector"("subsector_id"),
  CONSTRAINT "FK_SubSectorValue.sector_value_id"
    FOREIGN KEY ("sector_valuer_id")
      REFERENCES "SectorValue"("sector_value_id"),
  CONSTRAINT "FK_SubSectorValue.inventory_id"
    FOREIGN KEY ("inventory_id")
      REFERENCES "Inventory"("inventory_id")
);