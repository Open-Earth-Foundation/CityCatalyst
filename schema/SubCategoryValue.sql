CREATE TABLE "SubCategoryValue" (
  "subcategory_value_id" uuid,
  "activity_units" varchar(255),
  "activity_value" numeric,
  "emission_factor_value" numeric,
  "total_emissions" numeric,
  "emissions_factor_id" uuid,
  "subcategory_id" uuid,
  "sector_value_id" uuid,
  "inventory_id"  uuid,
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("subcategory_value_id"),
  CONSTRAINT "FK_SubCategoryValue.emissions_factor_id"
    FOREIGN KEY ("emissions_factor_id")
      REFERENCES "EmissionsFactor"("emissions_factor_id"),
  CONSTRAINT "FK_SubCategoryValue.subcategory_id"
    FOREIGN KEY ("subcategory_id")
      REFERENCES "SubCategory"("subcategory_id"),
  CONSTRAINT "FK_SubCategoryValue.sector_value_id"
    FOREIGN KEY ("sector_value_id")
      REFERENCES "SectorValue"("sector_value_id"),
  CONSTRAINT "FK_SubCategoryValue.inventory_id"
    FOREIGN KEY ("inventory_id")
      REFERENCES "Inventory"("inventory_id")
);