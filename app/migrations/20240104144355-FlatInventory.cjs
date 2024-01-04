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

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /// InventoryValue ///
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.renameTable("SubCategoryValue", "InventoryValue", {
        transaction,
      });
      await queryInterface.renameColumn(
        "InventoryValue",
        "subcategory_value_id",
        "id",
        { transaction },
      );
      await queryInterface.renameColumn(
        "InventoryValue",
        "datasource_id",
        "data_source_id",
        { transaction },
      );
      await queryInterface.renameColumn(
        "InventoryValue",
        "total_emissions",
        "co2eq",
        { transaction },
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
      await queryInterface.renameColumn(
        "EmissionsFactor",
        "emissions_factor_id",
        "id",
        { transaction },
      );
      await queryInterface.renameColumn(
        "EmissionsFactor",
        "emissions_factor",
        "emissions_per_activity",
        { transaction },
      );
      await queryInterface.renameColumn(
        "EmissionsFactor",
        "emissions_factor_url",
        "url",
        { transaction },
      );
      await queryInterface.addColumn(
        "EmissionsFactor",
        "gas",
        Sequelize.STRING(255),
        { transaction },
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
      throw "Not implemented";
    });
  },
};
