'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
    CREATE TABLE "User" (
      "user_id" uuid PRIMARY KEY,
      "name" varchar(255),
      "picture_url" text,
      "is_organization" boolean DEFAULT false,
      "email" varchar(255) UNIQUE,
      "password_hash" char(60),
      "role" text,
      "created" timestamp,
      "last_updated" timestamp,
      "organization_id" uuid,
      CONSTRAINT "FK_user.organization_id"
        FOREIGN KEY("organization_id")
        REFERENCES "User" ("user_id")
    );

    CREATE TABLE "City" (
      "city_id" uuid,
      "locode" varchar(255) UNIQUE,
      "name" varchar(255),
      "shape" jsonb,
      "country" varchar(255),
      "region" varchar(255),
      "area" bigint,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("city_id")
    );

    CREATE TABLE "CityUser" (
      "city_user_id" uuid,
      "user_id" uuid,
      "city_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("city_user_id"),
      CONSTRAINT "FK_CityUser.user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "User" ("user_id"),
      CONSTRAINT "FK_CityUser.city_id"
        FOREIGN KEY ("city_id")
        REFERENCES "City" ("city_id")
    );

    CREATE TABLE "Publisher" (
      "publisher_id" uuid,
      "name" varchar(255),
      "URL" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("publisher_id")
    );

    CREATE TABLE "ReportingLevel" (
      "reportinglevel_id" uuid,
      "reportinglevel_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("reportinglevel_id")
    );

    CREATE TABLE "Scope" (
      "scope_id" uuid,
      "scope_name" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("scope_id")
    );

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
      "sector_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("subsector_id"),
      CONSTRAINT "FK_SubSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
    );

    CREATE TABLE "SubCategory" (
      "subcategory_id" uuid,
      "subcategory_name" varchar(255),
      "activity_name" varchar(255),
      "subsector_id" uuid,
      "scope_id" uuid,
      "reportinglevel_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("subcategory_id"),
      CONSTRAINT "FK_SubCategory.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
      CONSTRAINT "FK_SubCategory.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id"),
      CONSTRAINT "FK_SubCategory.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
    );

    CREATE TABLE "ActivityData" (
      "activitydata_id" uuid,
      "activitydata" varchar(255),
      "subcategory_id" uuid,
      "scope_id" uuid,
      "reportinglevel_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
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

    CREATE TABLE "EmissionsFactor" (
      "emissions_factor_id" uuid,
      "emissions_factor" numeric,
      "emissions_factor_url" varchar(255),
      "units" varchar(255),
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

    CREATE TABLE "DataSource" (
      "datasource_id" uuid, /*Unique identifier for the datasource */
      "name" varchar(255), /* Name of the datasource */
      "URL" varchar(255), /* Link to the datasource */
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
      "units" varchar(255),
      "methodology_url" varchar(255),
      "publisher_id" uuid,
      "retrieval_method" varchar(255),
      "api_endpoint" varchar(255),
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id"),
      CONSTRAINT "FK_DataSource.publisher_id"
        FOREIGN KEY ("publisher_id")
        REFERENCES "Publisher" ("publisher_id")
    );

    CREATE TABLE "Methodology" (
      "methodology_id" uuid, /* Unique identifier for the methodology */
      "methodology" varchar(255), /* Description or name of methodology being used */
      "methodology_url" varchar(255), /* Link for human-readable methodology documentation */
      "datasource_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("methodology_id"),
      CONSTRAINT "FK_Methodology.datasource_id"
        FOREIGN KEY ("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
    );

    CREATE TABLE "DataSourceActivityData" (
      "datasource_id" uuid,
      "activitydata_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY("datasource_id", "activitydata_id"),
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

    CREATE TABLE "GDP" (
      "city_id" uuid, /* city ID */
      "gdp" bigint, /* GDP in US dollars */
      "year" int, /* Year of measurement, YYYY */
      "created" timestamp,
      "last_updated" timestamp,
      "datasource_id" uuid,
      PRIMARY KEY ("city_id", "year"),  /* One record per actor per year */
      CONSTRAINT "FK_GDP.datasource_id"
        FOREIGN KEY ("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_GDP.city_id"
        FOREIGN KEY ("city_id")
        REFERENCES "City" ("city_id")
    );

    CREATE TABLE "Inventory" (
      "inventory_id" uuid,
      "inventory_name" varchar(255),
      "year" int,
      "total_emissions" bigint,
      "city_id" uuid,
      PRIMARY KEY ("inventory_id"),
      CONSTRAINT "FK_Inventory.city_id"
        FOREIGN KEY ("city_id")
        REFERENCES "City" ("city_id")
    );

    CREATE TABLE "Population" (
      "city_id" uuid, /* city ID */
      "population" bigint, /* Population in units; 1000 => 1000 people */
      "year" int, /* Year of measurement, YYYY */
      "created" timestamp,
      "last_updated" timestamp,
      "datasource_id" uuid,
      PRIMARY KEY ("city_id", "year"),  /* One record per actor per year */
      CONSTRAINT "FK_Population.datasource_id"
        FOREIGN KEY ("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
      CONSTRAINT "FK_Population.city_id"
        FOREIGN KEY ("city_id")
        REFERENCES "City" ("city_id")
    );

    CREATE TABLE "SectorValue" (
      "sector_value_id" uuid,
      "total_emissions" numeric,
      "sector_id" uuid,
      "inventory_id"  uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("sector_value_id"),
      CONSTRAINT "FK_SectorValue.sector_id"
      FOREIGN KEY ("sector_id")
        REFERENCES "Sector" ("sector_id"),
      CONSTRAINT "FK_SectorValue.inventory_id"
      FOREIGN KEY ("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
    );

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
        REFERENCES "EmissionsFactor" ("emissions_factor_id"),
      CONSTRAINT "FK_SubCategoryValue.subcategory_id"
        FOREIGN KEY ("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id"),
      CONSTRAINT "FK_SubCategoryValue.sector_value_id"
        FOREIGN KEY ("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id"),
      CONSTRAINT "FK_SubCategoryValue.inventory_id"
        FOREIGN KEY ("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
    );

    CREATE TABLE "SubSectorReportingLevel" (
      "subsector_id" uuid,
      "reportinglevel_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("subsector_id", "reportinglevel_id"),
      CONSTRAINT "FK_SubSectorReportingLevel.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
      CONSTRAINT "FK_SubSectorReportingLevel.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
    );

    CREATE TABLE "SubSectorScope" (
      "subsector_id" uuid,
      "scope_id" uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("subsector_id", "scope_id"),
      CONSTRAINT "FK_SubSectorScope.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
      CONSTRAINT "FK_SubSectorScope.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
    );

    CREATE TABLE "SubSectorValue" (
      "subsector_value_id" uuid,
      "activity_units" varchar(255),
      "activity_value" numeric,
      "emission_factor_value" numeric,
      "total_emissions" numeric,
      "emissions_factor_id" uuid,
      "subsector_id" uuid,
      "sector_value_id" uuid,
      "inventory_id"  uuid,
      "created" timestamp,
      "last_updated" timestamp,
      PRIMARY KEY ("subsector_value_id"),
      CONSTRAINT "FK_SubSectorValue.emissions_factor_id"
      FOREIGN KEY ("emissions_factor_id")
        REFERENCES "EmissionsFactor" ("emissions_factor_id"),
      CONSTRAINT "FK_SubSectorValue.subsector_id"
      FOREIGN KEY ("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
      CONSTRAINT "FK_SubSectorValue.sector_value_id"
      FOREIGN KEY ("sector_value_id")
        REFERENCES "SectorValue" ("sector_value_id"),
      CONSTRAINT "FK_SubSectorValue.inventory_id"
      FOREIGN KEY ("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
    );

    CREATE TABLE "Version" (
      "version_id" uuid,
      "year" int,
      "version" varchar(255),
      "inventory_id" uuid,
      PRIMARY KEY ("version_id"),
      CONSTRAINT "FK_Version.inventory_id"
        FOREIGN KEY ("inventory_id")
        REFERENCES "Inventory" ("inventory_id")
    );
  `);
  },

  async down(queryInterface) {
    const tables = [
      'User', 'City', 'CityUser', 'Publisher', 'ReportingLevel', 'Scope',
      'Sector', 'SubSector', 'SubCategory', 'ActivityData', 'EmissionsFactor',
      'GHGs', 'DataSource', 'Methodology', 'DataSourceActivityData',
      'DataSourceEmissionsFactor', 'DataSourceGHGs', 'DataSourceMethodology',
      'DataSourceReportingLevel', 'DataSourceScope', 'DataSourceSector',
      'DataSourceSubCategory', 'DataSourceSubSector', 'GDP', 'Inventory',
      'Population', 'SectorValue', 'SubCategoryValue',
      'SubSectorReportingLevel', 'SubSectorScope', 'SubSectorValue', 'Version'
    ];

    return queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of tables) {
        await transaction.dropTable(table, { cascade: true, transaction });
      }
    });
  }
};

