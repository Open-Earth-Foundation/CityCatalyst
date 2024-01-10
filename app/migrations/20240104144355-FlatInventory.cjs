"use strict";

async function removeColumns(
  tableName,
  columnNames,
  queryInterface,
  transaction,
) {
  for (const columnName of columnNames) {
    await queryInterface.removeColumn(tableName, columnName, { transaction });
  }
}

async function renameColumns(
  tableName,
  columnMapping,
  queryInterface,
  transaction,
) {
  for (const [oldName, newName] of Object.entries(columnMapping)) {
    await queryInterface.renameColumn(tableName, oldName, newName, {
      transaction,
    });
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /// InventoryValue ///
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.renameTable("SubCategoryValue", "InventoryValue", {
        transaction,
      });
      await renameColumns(
        "InventoryValue",
        {
          subcategory_value_id: "id",
          datasource_id: "data_source_id",
          total_emissions: "co2eq",
          subcategory_id: "sub_category_id",
        },
        queryInterface,
        transaction,
      );
      await queryInterface.changeColumn(
        "InventoryValue",
        "co2eq",
        Sequelize.BIGINT,
        { transaction },
      );
      await queryInterface.addColumn(
        "InventoryValue",
        "co2eq_years",
        Sequelize.INTEGER,
        { transaction },
      );
      await queryInterface.addColumn(
        "InventoryValue",
        "gpc_reference_number",
        Sequelize.STRING,
        { transaction },
      );
      await queryInterface.addColumn(
        "InventoryValue",
        "sector_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("InventoryValue", {
        type: "foreign key",
        name: "FK_InventoryValue.sector_id",
        fields: ["sector_id"],
        references: {
          table: "Sector",
          field: "sector_id",
        },
        onDelete: "cascade",
        onUpdate: "cascade",
        transaction,
      });
      await queryInterface.addColumn(
        "InventoryValue",
        "sub_sector_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("InventoryValue", {
        type: "foreign key",
        name: "FK_InventoryValue.sub_sector_id",
        fields: ["sub_sector_id"],
        references: {
          table: "SubSector",
          field: "subsector_id",
        },
        onDelete: "cascade",
        onUpdate: "cascade",
        transaction,
      });
      await removeColumns(
        "InventoryValue",
        [
          "co2_emissions_value",
          "ch4_emissions_value",
          "n2o_emissions_value",
          "emissions_factor_id",
          "emission_factor_value",
          "subsector_value_id",
          "sector_value_id",
        ],
        queryInterface,
        transaction,
      );
      await queryInterface.dropTable("SubSectorValue", { transaction });
      await queryInterface.dropTable("SectorValue", { transaction });

      /// EmissionsFactor ///
      await renameColumns(
        "EmissionsFactor",
        {
          emissions_factor_id: "id",
          emissions_factor: "emissions_per_activity",
          emissions_factor_url: "url",
        },
        queryInterface,
        transaction,
      );
      await queryInterface.addColumn(
        "EmissionsFactor",
        "inventory_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("EmissionsFactor", {
        type: "foreign key",
        name: "FK_EmissionsFactor.inventory_id",
        fields: ["inventory_id"],
        references: {
          table: "Inventory",
          field: "inventory_id",
        },
        onDelete: "cascade",
        onUpdate: "cascade",
        transaction,
      });

      /// GasToCO2Eq ///
      await queryInterface.createTable(
        "GasToCO2Eq",
        {
          gas: {
            type: Sequelize.STRING(255),
            primaryKey: true,
            allowNull: false,
          },
          co2eq_per_kg: {
            type: Sequelize.FLOAT,
            allowNull: true,
          },
          co2eq_years: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
        },
        { transaction },
      );

      /// GasValue ///
      await queryInterface.createTable(
        "GasValue",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
          },
          inventory_value_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "InventoryValue",
              key: "id",
            },
          },
          emissions_factor_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "EmissionsFactor",
              key: "id",
            },
          },
        },
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      /// GasValue, GasToCO2Eq ///
      await queryInterface.dropTable("GasValue", { transaction });
      await queryInterface.dropTable("GasToCO2Eq", { transaction });

      /// EmissionsFactor ///
      await queryInterface.removeConstraint(
        "EmissionsFactor",
        "FK_EmissionsFactor_inventory_id",
        { transaction },
      );
      await queryInterface.removeColumn("EmissionsFactor", "inventory_id", {
        transaction,
      });

      await renameColumns(
        "EmissionsFactor",
        {
          id: "emissions_factor_id",
          emissions_per_activity: "emissions_factor",
          url: "emissions_factor_url",
        },
        queryInterface,
        transaction,
      );

      /// SectorValue ///
      await queryInterface.sequelize.query(
        `CREATE TABLE "SectorValue" (
          sector_value_id uuid PRIMARY KEY NOT NULL,
          total_emissions numeric,
          sector_id uuid,
          inventory_id uuid,
          created timestamp without time zone,
          last_updated timestamp without time zone
        );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE ONLY "SectorValue"
          ADD CONSTRAINT "FK_SectorValue.inventory_id" FOREIGN KEY (inventory_id) REFERENCES "Inventory"(inventory_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SectorValue.sector_id" FOREIGN KEY (sector_id) REFERENCES "Sector"(sector_id) ON UPDATE SET NULL ON DELETE SET NULL;`,
        { transaction },
      );

      /// SubSectorValue ///
      await queryInterface.sequelize.query(
        `CREATE TABLE "SubSectorValue" (
          subsector_value_id uuid PRIMARY KEY NOT NULL,
          activity_units character varying(255),
          activity_value numeric,
          emission_factor_value numeric,
          total_emissions numeric,
          emissions_factor_id uuid,
          subsector_id uuid,
          sector_value_id uuid,
          inventory_id uuid,
          created timestamp without time zone,
          last_updated timestamp without time zone,
          datasource_id uuid,
          co2_emissions_value numeric,
          ch4_emissions_value numeric,
          n2o_emissions_value numeric,
          unavailable_reason text,
          unavailable_explanation text
        );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE ONLY "SubSectorValue"
          ADD CONSTRAINT "FK_SubSectorValue.emissions_factor_id" FOREIGN KEY (emissions_factor_id) REFERENCES "EmissionsFactor"(emissions_factor_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubSectorValue.inventory_id" FOREIGN KEY (inventory_id) REFERENCES "Inventory"(inventory_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubSectorValue.sector_value_id" FOREIGN KEY (sector_value_id) REFERENCES "SectorValue"(sector_value_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubSectorValue.subsector_id" FOREIGN KEY (subsector_id) REFERENCES "SubSector"(subsector_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubSectorValue_datasource_id" FOREIGN KEY (datasource_id) REFERENCES "DataSource"(datasource_id) ON UPDATE CASCADE ON DELETE CASCADE;`,
        { transaction },
      );

      /// SubCategoryValue ///
      await queryInterface.dropTable("InventoryValue", { transaction });
      await queryInterface.sequelize.query(
        `CREATE TABLE public."SubCategoryValue" (
          subcategory_value_id uuid PRIMARY KEY NOT NULL,
          activity_units character varying(255),
          activity_value numeric,
          emission_factor_value numeric,
          total_emissions numeric,
          emissions_factor_id uuid,
          subcategory_id uuid,
          sector_value_id uuid,
          inventory_id uuid,
          created timestamp without time zone,
          last_updated timestamp without time zone,
          datasource_id uuid,
          subsector_value_id uuid,
          co2_emissions_value numeric,
          ch4_emissions_value numeric,
          n2o_emissions_value numeric
        );`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE ONLY "SubCategoryValue"
          ADD CONSTRAINT "FK_SubCategoryValue.emissions_factor_id" FOREIGN KEY (emissions_factor_id) REFERENCES "EmissionsFactor"(emissions_factor_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubCategoryValue.inventory_id" FOREIGN KEY (inventory_id) REFERENCES "Inventory"(inventory_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubCategoryValue.sector_value_id" FOREIGN KEY (sector_value_id) REFERENCES "SectorValue"(sector_value_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubCategoryValue.subcategory_id" FOREIGN KEY (subcategory_id) REFERENCES "SubCategory"(subcategory_id) ON UPDATE SET NULL ON DELETE SET NULL,
          ADD CONSTRAINT "FK_SubCategoryValue_datasource_id" FOREIGN KEY (datasource_id) REFERENCES "DataSource"(datasource_id) ON UPDATE CASCADE ON DELETE CASCADE,
          ADD CONSTRAINT "FK_SubCategoryValue_subsector_value_id" FOREIGN KEY (subsector_value_id) REFERENCES "SubSectorValue"(subsector_value_id) ON UPDATE SET NULL ON DELETE SET NULL;`,
        { transaction },
      );
    });
  },
};
