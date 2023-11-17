"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "SectorValue" DROP CONSTRAINT "FK_SectorValue.sector_id";
      ALTER TABLE "SectorValue" ADD CONSTRAINT "FK_SectorValue.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SectorValue" DROP CONSTRAINT "FK_SectorValue.inventory_id";
      ALTER TABLE "SectorValue" ADD CONSTRAINT "FK_SectorValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE SET NULL ON UPDATE SET NULL;

      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.emissions_factor_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.subcategory_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.sector_value_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.sector_value_id"
        FOREIGN KEY("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.inventory_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE SET NULL ON UPDATE SET NULL;

      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.emissions_factor_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.subsector_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.sector_value_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.sector_value_id"
        FOREIGN KEY("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.inventory_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE SET NULL ON UPDATE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "SectorValue" DROP CONSTRAINT "FK_SectorValue.sector_id";
      ALTER TABLE "SectorValue" ADD CONSTRAINT "FK_SectorValue.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SectorValue" DROP CONSTRAINT "FK_SectorValue.inventory_id";
      ALTER TABLE "SectorValue" ADD CONSTRAINT "FK_SectorValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.emissions_factor_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.subcategory_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.sector_value_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.sector_value_id"
        FOREIGN KEY("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubCategoryValue" DROP CONSTRAINT "FK_SubCategoryValue.inventory_id";
      ALTER TABLE "SubCategoryValue" ADD CONSTRAINT "FK_SubCategoryValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.emissions_factor_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.subsector_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.sector_value_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.sector_value_id"
        FOREIGN KEY("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubSectorValue" DROP CONSTRAINT "FK_SubSectorValue.inventory_id";
      ALTER TABLE "SubSectorValue" ADD CONSTRAINT "FK_SubSectorValue.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  },
};
