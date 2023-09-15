"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    try {
    await queryInterface.sequelize.query(`
      ALTER TABLE "User" DROP CONSTRAINT "FK_user.organization_id";
      ALTER TABLE "User" ADD CONSTRAINT "FK_User.organization_id"
        FOREIGN KEY("organization_id")
        REFERENCES "User" ("user_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

      ALTER TABLE "CityUser" DROP CONSTRAINT "FK_CityUser.user_id";
      ALTER TABLE "CityUser" ADD CONSTRAINT "FK_CityUser.user_id"
        FOREIGN KEY("user_id")
        REFERENCES "User" ("user_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "CityUser" DROP CONSTRAINT "FK_CityUser.city_id";
      ALTER TABLE "CityUser" ADD CONSTRAINT "FK_CityUser.city_id"
        FOREIGN KEY("city_id")
        REFERENCES "City" ("city_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "SubSector" DROP CONSTRAINT "FK_SubSector.sector_id";
      ALTER TABLE "SubSector" ADD CONSTRAINT "FK_SubSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "SubCategory" DROP CONSTRAINT "FK_SubCategory.subsector_id";
      ALTER TABLE "SubCategory" ADD CONSTRAINT "FK_SubCategory.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubCategory" DROP CONSTRAINT "FK_SubCategory.scope_id";
      ALTER TABLE "SubCategory" ADD CONSTRAINT "FK_SubCategory.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      ALTER TABLE "SubCategory" DROP CONSTRAINT "FK_SubCategory.reportinglevel_id";
      ALTER TABLE "SubCategory" ADD CONSTRAINT "FK_SubCategory.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

      ALTER TABLE "ActivityData" DROP CONSTRAINT "FK_ActivityData.subcategory_id";
      ALTER TABLE "ActivityData" ADD CONSTRAINT "FK_ActivityData.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "ActivityData" DROP CONSTRAINT "FK_ActivityData.scope_id";
      ALTER TABLE "ActivityData" ADD CONSTRAINT "FK_ActivityData.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      ALTER TABLE "ActivityData" DROP CONSTRAINT "FK_ActivityData.reportinglevel_id";
      ALTER TABLE "ActivityData" ADD CONSTRAINT "FK_ActivityData.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

      ALTER TABLE "DataSource" DROP CONSTRAINT "FK_DataSource.publisher_id";
      ALTER TABLE "DataSource" ADD CONSTRAINT "FK_DataSource.publisher_id"
        FOREIGN KEY("publisher_id")
        REFERENCES "Publisher" ("publisher_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

      ALTER TABLE "Methodology" DROP CONSTRAINT "FK_Methodology.datasource_id";
      ALTER TABLE "Methodology" ADD CONSTRAINT "FK_Methodology.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceActivityData" DROP CONSTRAINT "FK_DataSourceActivityData.datasource_id";
      ALTER TABLE "DataSourceActivityData" ADD CONSTRAINT "FK_DataSourceActivityData.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceActivityData" DROP CONSTRAINT "FK_DataSourceActivityData.activitydata_id";
      ALTER TABLE "DataSourceActivityData" ADD CONSTRAINT "FK_DataSourceActivityData.activitydata_id"
        FOREIGN KEY("activitydata_id")
        REFERENCES "ActivityData" ("activitydata_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceEmissionsFactor" DROP CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id";
      ALTER TABLE "DataSourceEmissionsFactor" ADD CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceEmissionsFactor" DROP CONSTRAINT "FK_DataSourceEmissionsFactor.emissions_factor_id";
      ALTER TABLE "DataSourceEmissionsFactor" ADD CONSTRAINT "FK_DataSourceEmissionsFactor.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceGHGs" DROP CONSTRAINT "FK_DataSourceGHGs.datasource_id";
      ALTER TABLE "DataSourceGHGs" ADD CONSTRAINT "FK_DataSourceGHGs.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceGHGs" DROP CONSTRAINT "FK_DataSourceGHGs.ghg_id";
      ALTER TABLE "DataSourceGHGs" ADD CONSTRAINT "FK_DataSourceGHGs.ghg_id"
        FOREIGN KEY("ghg_id")
        REFERENCES "GHGs" ("ghg_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceMethodology" DROP CONSTRAINT "FK_DataSourceMethodology.datasource_id";
      ALTER TABLE "DataSourceMethodology" ADD CONSTRAINT "FK_DataSourceMethodology.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceMethodology" DROP CONSTRAINT "FK_DataSourceMethodology.methodology_id";
      ALTER TABLE "DataSourceMethodology" ADD CONSTRAINT "FK_DataSourceMethodology.methodology_id"
        FOREIGN KEY("methodology_id")
        REFERENCES "Methodology" ("methodology_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceReportingLevel" DROP CONSTRAINT "FK_DataSourceReportingLevel.datasource_id";
      ALTER TABLE "DataSourceReportingLevel" ADD CONSTRAINT "FK_DataSourceReportingLevel.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceReportingLevel" DROP CONSTRAINT "FK_DataSourceReportingLevel.reportinglevel_id";
      ALTER TABLE "DataSourceReportingLevel" ADD CONSTRAINT "FK_DataSourceReportingLevel.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceSector" DROP CONSTRAINT "FK_DataSourceSector.datasource_id";
      ALTER TABLE "DataSourceSector" ADD CONSTRAINT "FK_DataSourceSector.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceSector" DROP CONSTRAINT "FK_DataSourceSector.sector_id";
      ALTER TABLE "DataSourceSector" ADD CONSTRAINT "FK_DataSourceSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceSubCategory" DROP CONSTRAINT "FK_DataSourceSubCategory.datasource_id";
      ALTER TABLE "DataSourceSubCategory" ADD CONSTRAINT "FK_DataSourceSubCategory.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceSubCategory" DROP CONSTRAINT "FK_DataSourceSubCategory.subcategory_id";
      ALTER TABLE "DataSourceSubCategory" ADD CONSTRAINT "FK_DataSourceSubCategory.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "DataSourceSubSector" DROP CONSTRAINT "FK_DataSourceSubSector.datasource_id";
      ALTER TABLE "DataSourceSubSector" ADD CONSTRAINT "FK_DataSourceSubSector.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "DataSourceSubSector" DROP CONSTRAINT "FK_DataSourceSubSector.subsector_id";
      ALTER TABLE "DataSourceSubSector" ADD CONSTRAINT "FK_DataSourceSubSector.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "GDP" DROP CONSTRAINT "FK_GDP.datasource_id";
      ALTER TABLE "GDP" ADD CONSTRAINT "FK_GDP.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "GDP" DROP CONSTRAINT "FK_GDP.city_id";
      ALTER TABLE "GDP" ADD CONSTRAINT "FK_GDP.city_id"
        FOREIGN KEY("city_id")
        REFERENCES "City" ("city_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "Inventory" DROP CONSTRAINT "FK_Inventory.city_id";
      ALTER TABLE "Inventory" ADD CONSTRAINT "FK_Inventory.city_id"
        FOREIGN KEY("city_id")
        REFERENCES "City" ("city_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "Population" DROP CONSTRAINT "FK_Population.datasource_id";
      ALTER TABLE "Population" ADD CONSTRAINT "FK_Population.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "Population" DROP CONSTRAINT "FK_Population.city_id";
      ALTER TABLE "Population" ADD CONSTRAINT "FK_Population.city_id"
        FOREIGN KEY("city_id")
        REFERENCES "City" ("city_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

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

      ALTER TABLE "SubSectorReportingLevel" DROP CONSTRAINT "FK_SubSectorReportingLevel.subsector_id";
      ALTER TABLE "SubSectorReportingLevel" ADD CONSTRAINT "FK_SubSectorReportingLevel.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubSectorReportingLevel" DROP CONSTRAINT "FK_SubSectorReportingLevel.reportinglevel_id";
      ALTER TABLE "SubSectorReportingLevel" ADD CONSTRAINT "FK_SubSectorReportingLevel.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

      ALTER TABLE "SubSectorScope" DROP CONSTRAINT "FK_SubSectorScope.subsector_id";
      ALTER TABLE "SubSectorScope" ADD CONSTRAINT "FK_SubSectorScope.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      ALTER TABLE "SubSectorScope" DROP CONSTRAINT "FK_SubSectorScope.scope_id";
      ALTER TABLE "SubSectorScope" ADD CONSTRAINT "FK_SubSectorScope.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
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

      ALTER TABLE "Version" DROP CONSTRAINT "FK_Version.inventory_id";
      ALTER TABLE "Version" ADD CONSTRAINT "FK_Version.inventory_id"
        FOREIGN KEY("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    `);
    } catch(err) {
      console.error(err.original.message);
      throw err;
    }
  },

  async down(queryInterface) {
    // behaviour was previously undefined
  },
};
