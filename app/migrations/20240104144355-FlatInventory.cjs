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
        name: "FK_EmissionsFactor_inventory_id",
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

  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("GasValue");
      await queryInterface.dropTable("GasValue");
      throw new Error("Not implemented");
    });
  },
};
