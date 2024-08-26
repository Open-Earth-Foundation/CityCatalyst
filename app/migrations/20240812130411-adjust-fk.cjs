"use strict";

const sql_up = `  
-- Drop existing foreign key constraints  
ALTER TABLE "DataSourceScope" DROP CONSTRAINT "FK_DataSourceScope.datasource_id";  
ALTER TABLE "Methodology" DROP CONSTRAINT "FK_Methodology.datasource_id";  
ALTER TABLE "DataSourceActivityData" DROP CONSTRAINT "FK_DataSourceActivityData.datasource_id";  
ALTER TABLE "DataSourceEmissionsFactor" DROP CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id";  
ALTER TABLE "DataSourceGHGs" DROP CONSTRAINT "FK_DataSourceGHGs.datasource_id";  
ALTER TABLE "DataSourceMethodology" DROP CONSTRAINT "FK_DataSourceMethodology.datasource_id";  
ALTER TABLE "DataSourceReportingLevel" DROP CONSTRAINT "FK_DataSourceReportingLevel.datasource_id";  
ALTER TABLE "GDP" DROP CONSTRAINT "FK_GDP.datasource_id";  
ALTER TABLE "Population" DROP CONSTRAINT "FK_Population.datasource_id";  
ALTER TABLE "InventoryValue" DROP CONSTRAINT "FK_SubCategoryValue_datasource_id";  
ALTER TABLE "ActivityValue" DROP CONSTRAINT "FK_ActivityValue_datasource_id";  

-- Add new foreign key constraints referencing 'DataSourceI18n'  
ALTER TABLE "DataSourceScope"  
    ADD CONSTRAINT "FK_DataSourceScope.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "Methodology"  
    ADD CONSTRAINT "FK_Methodology.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "DataSourceActivityData"  
    ADD CONSTRAINT "FK_DataSourceActivityData.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "DataSourceEmissionsFactor"  
    ADD CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "DataSourceGHGs"  
    ADD CONSTRAINT "FK_DataSourceGHGs.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "DataSourceMethodology"  
    ADD CONSTRAINT "FK_DataSourceMethodology.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "DataSourceReportingLevel"  
    ADD CONSTRAINT "FK_DataSourceReportingLevel.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "GDP"  
    ADD CONSTRAINT "FK_GDP.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "Population"  
    ADD CONSTRAINT "FK_Population.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "InventoryValue"  
    ADD CONSTRAINT "FK_SubCategoryValue_datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

ALTER TABLE "ActivityValue"  
    ADD CONSTRAINT "FK_ActivityValue_datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSourceI18n" ("datasource_id");  

`;
const sql_down = `

-- Drop the foreign key constraints referencing 'DataSourceI18n'  
ALTER TABLE "DataSourceScope" DROP CONSTRAINT "FK_DataSourceScope.datasource_id";  
ALTER TABLE "Methodology" DROP CONSTRAINT "FK_Methodology.datasource_id";  
ALTER TABLE "DataSourceActivityData" DROP CONSTRAINT "FK_DataSourceActivityData.datasource_id";  
ALTER TABLE "DataSourceEmissionsFactor" DROP CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id";  
ALTER TABLE "DataSourceGHGs" DROP CONSTRAINT "FK_DataSourceGHGs.datasource_id";  
ALTER TABLE "DataSourceMethodology" DROP CONSTRAINT "FK_DataSourceMethodology.datasource_id";  
ALTER TABLE "DataSourceReportingLevel" DROP CONSTRAINT "FK_DataSourceReportingLevel.datasource_id";  
ALTER TABLE "GDP" DROP CONSTRAINT "FK_GDP.datasource_id";  
ALTER TABLE "Population" DROP CONSTRAINT "FK_Population.datasource_id";  
ALTER TABLE "InventoryValue" DROP CONSTRAINT "FK_SubCategoryValue_datasource_id";  
ALTER TABLE "ActivityValue" DROP CONSTRAINT "FK_ActivityValue_datasource_id";  

-- Re-add the foreign key constraints referencing 'DataSource'  
ALTER TABLE "DataSourceScope"  
    ADD CONSTRAINT "FK_DataSourceScope.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "Methodology"  
    ADD CONSTRAINT "FK_Methodology.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "DataSourceActivityData"  
    ADD CONSTRAINT "FK_DataSourceActivityData.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "DataSourceEmissionsFactor"  
    ADD CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "DataSourceGHGs"  
    ADD CONSTRAINT "FK_DataSourceGHGs.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "DataSourceMethodology"  
    ADD CONSTRAINT "FK_DataSourceMethodology.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "DataSourceReportingLevel"  
    ADD CONSTRAINT "FK_DataSourceReportingLevel.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "GDP"  
    ADD CONSTRAINT "FK_GDP.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "Population"  
    ADD CONSTRAINT "FK_Population.datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "InventoryValue"  
    ADD CONSTRAINT "FK_SubCategoryValue_datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

ALTER TABLE "ActivityValue"  
    ADD CONSTRAINT "FK_ActivityValue_datasource_id"  
    FOREIGN KEY ("datasource_id") REFERENCES "DataSource" ("datasource_id");  

`;
/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  }
};