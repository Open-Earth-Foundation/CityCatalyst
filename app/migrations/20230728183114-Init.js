'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createDatabase('citycatalyst');
    await queryInterface.sequelize.query(```
    CREATE TABLE "Sector" (
      "sector_id" uuid,
      "sector_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("sector_id")
    );

    CREATE TABLE "SubSector" (
      "subsector_id" uuid,
      "subsector_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      "sector_id" uuid,
      PRIMARY KEY("subsector_id"),
      CONSTRAINT "FK_SubSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
    );

    CREATE TABLE "SubCategory" (
      "subcategory_id" uuid,
      "subcategory_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      "subsector_id" uuid,
      PRIMARY KEY("subcategory_id"),
      CONSTRAINT "FK_SubCategory.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
    );

    CREATE TABLE "ReportingLevel" (
      "reportinglevel_id" uuid,
      "scope_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("reportinglevel_id")
    );

    CREATE TABLE "Scope" (
      "scope_id" uuid,
      "scope_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("scope_id")
    );

    CREATE TABLE "ActivityData" (
      "activitydata_id" uuid,
      "activitydata" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      "subcategory_id" uuid,
      "scope_id" uuid,
      "reportinglevel_id" uuid,
      PRIMARY KEY("activitydata_id"),
      CONSTRAINT "FK_ActivityData.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id"),
      CONSTRAINT "FK_ActivityData.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id"),
       CONSTRAINT "FK_ActivityData.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
    );

    CREATE TABLE "DataSource" (
      "datasource_id" uuid, /*Unique identifier for the datasource */
      "name" varchar(255), /* Name of the datasource */
      "url" varchar(255), /* Link to the datasource */
      "description" TEXT, /* A brief human-readerble description of the datasource */
      "access_type" varchar(255), /* How to access the datasource. Through download, api etc */
      "geographical_location" varchar(255), /* Which regions or countries does the data source focus on */
      "latest_accounting_year" int, /* What's the latest year of the datasource */
      "frequency_of_update" varchar(255), /* How often does the datasource get updated? */
      "spacial_resolution" varchar(255), /* City boundary? Outside city boundary? */
      "language" varchar(255),
      "accessibility" varchar(255), /* Is the datasource free or paid? */
      "data_quality" varchar(255), /* Is the datasource third party verified or not? */
      "notes" TEXT, /* Any other information about the datasource */
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id")
    );

    CREATE TABLE "EmissionsFactor" (
      "emissions_factor_id" uuid,
      "emissions_factor" varchar(255),
      "emissions_factor_link" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("emissions_factor_id")
    );

    CREATE TABLE "GHGs" (
      "ghg_id" uuid,
      "ghg_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("ghg_id")
    );

    CREATE TABLE "Methodology" (
      "methodology_id" uuid, /* Unique identifier for the methodology */
      "methodology" varchar(255), /* Description or name of methodology being used */
      "methodology_link" varchar(255), /* Link for human-readable methodology documentation */
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("methodology_id")
    );

    CREATE TABLE "DataSourceActivityData" (
      "datasource_id" uuid,
      "activitydata_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id","activitydata_id"),
      CONSTRAINT "FK_DataSourceActivityData.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceActivityData.activitydata_id"
        FOREIGN KEY("activitydata_id")
        REFERENCES "ActivityData" ("activitydata_id")
    );

    CREATE TABLE "DataSourceEmissionsFactor" (
      "datasource_id" uuid,
      "emissions_factor_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id", "emissions_factor_id"),
      CONSTRAINT "FK_DataSourceEmissionsFactor.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceEmissionsFactor.emissions_factor_id"
        FOREIGN KEY("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id")
    );

    CREATE TABLE "DataSourceGHGs" (
      "datasource_id" uuid,
      "ghg_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id", "ghg_id"),
      CONSTRAINT "FK_DataSourceGHGs.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceGHGs.ghg_id"
        FOREIGN KEY("ghg_id")
        REFERENCES "GHGs" ("ghg_id")
    );

    CREATE TABLE "DataSourceMethodology" (
      "datasource_id" uuid,
      "methodology_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id", "methodology_id"),
      CONSTRAINT "FK_DataSourceMethodology.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceMethodology.methodology_id"
        FOREIGN KEY("methodology_id")
        REFERENCES "Methodology" ("methodology_id")
    );

    CREATE TABLE "DataSourceReportingLevel" (
      "datasource_id" uuid,
      "reportinglevel_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id","reportinglevel_id"),
      CONSTRAINT "FK_DataSourceReportingLevel.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceReportingLevel.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
    );

    CREATE TABLE "DataSourceScope" (
      "datasource_id" uuid,
      "scope_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id","scope_id"),
      CONSTRAINT "FK_DataSourceScope.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceScope.activitydata_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
    );

    CREATE TABLE "DataSourceSector" (
      "datasource_id" uuid,
      "sector_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id", "sector_id"),
      CONSTRAINT "FK_DataSourceSector_datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceSector_sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
    );

    CREATE TABLE "DataSourceSubCategory" (
      "datasource_id" uuid,
      "subcategory_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id","subcategory_id"),
      CONSTRAINT "FK_DataSourceSubCategory.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceSubCategory.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id")
    );

    CREATE TABLE "DataSourceSubSector" (
      "datasource_id" uuid,
      "subsector_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id","subsector_id"),
      CONSTRAINT "FK_DataSourceSubSector.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_DataSourceSubSector.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
    );

    CREATE TABLE "User" (
      "user_id" uuid PRIMARY KEY,
      "name" text,
      "picture_url" text,
      "is_organization" boolean DEFAULT false,
      "email" text,
      "password_hash" text,
      "role" text,
      "created" timestamp,
      "last_updated" timestamp,
      "organization_id" uuid,
      CONSTRAINT "FK_user.organization_id"
        FOREIGN KEY("organization_id")
        REFERENCES "User" ("user_id")
    );
  ```);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropDatabase('citycatalyst');
  }
};

