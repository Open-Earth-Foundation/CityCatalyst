"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("DataSourceSector", { transaction });
      await queryInterface.dropTable("DataSourceSubSector", { transaction });
      await queryInterface.dropTable("DataSourceSubCategory", { transaction });
      await queryInterface.addColumn("DataSource", "sector_id", Sequelize.UUID, { transaction });
      await queryInterface.addColumn("DataSource", "subsector_id", Sequelize.UUID, { transaction });
      await queryInterface.addColumn("DataSource", "subcategory_id", Sequelize.UUID, { transaction });

      const constraintOptions = (table, field) => ({
        transaction,
        type: "foreign key",
        name: `FK_${table}.${field}`,
        references: { table, field },
        fields: [field],
        onDelete: "cascade",
        onUpdate: "cascade",
      });
      await queryInterface.addConstraint(
        "DataSource",
        constraintOptions("Sector", "sector_id"),
      );
      await queryInterface.addConstraint(
        "DataSource",
        constraintOptions("SubSector", "subsector_id"),
      );
      await queryInterface.addConstraint(
        "DataSource",
        constraintOptions("SubCategory", "subcategory_id"),
      );
    });
  },

  async down (queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint("DataSource", "FK_DataSource.sector_id", {transaction});
      await queryInterface.removeConstraint("DataSource", "FK_DataSource.subsector_id", {transaction});
      await queryInterface.removeConstraint(
        "DataSource",
        "FK_DataSource.subcategory_id",
        { transaction },
      );
      await queryInterface.removeColumn("DataSource", "sector_id", { transaction });
      await queryInterface.removeColumn("DataSource", "subsector_id", { transaction });
      await queryInterface.removeColumn("DataSource", "subcategory_id", { transaction });
      await queryInterface.sequelize.query(
        `CREATE TABLE "DataSourceSector" (
          "datasource_id" uuid,
          "sector_id" uuid,
          "created" timestamp,
          "last_updated" timestamp,
          PRIMARY KEY("datasource_id", "sector_id"),
          CONSTRAINT "FK_DataSourceSector_datasource_id"
            FOREIGN KEY("datasource_id")
            REFERENCES "DataSource" ("datasource_id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_DataSourceSector_sector_id"
            FOREIGN KEY("sector_id")
            REFERENCES "Sector" ("sector_id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
    
        CREATE TABLE "DataSourceSubCategory" (
          "datasource_id" uuid,
          "subcategory_id" uuid,
          "created" timestamp,
          "last_updated" timestamp,
          PRIMARY KEY("datasource_id","subcategory_id"),
          CONSTRAINT "FK_DataSourceSubCategory.datasource_id"
            FOREIGN KEY("datasource_id")
            REFERENCES "DataSource" ("datasource_id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_DataSourceSubCategory.subcategory_id"
            FOREIGN KEY("subcategory_id")
            REFERENCES "SubCategory" ("subcategory_id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );
    
        CREATE TABLE "DataSourceSubSector" (
          "datasource_id" uuid,
          "subsector_id" uuid,
          "created" timestamp,
          "last_updated" timestamp,
          PRIMARY KEY("datasource_id","subsector_id"),
          CONSTRAINT "FK_DataSourceSubSector.datasource_id"
            FOREIGN KEY("datasource_id")
            REFERENCES "DataSource" ("datasource_id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "FK_DataSourceSubSector.subsector_id"
            FOREIGN KEY("subsector_id")
            REFERENCES "SubSector" ("subsector_id")
            ON DELETE CASCADE ON UPDATE CASCADE
        );`,
        { transaction },
      );
    });
  }
};
