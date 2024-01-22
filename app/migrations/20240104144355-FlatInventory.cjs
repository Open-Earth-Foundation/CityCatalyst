"use strict";

const { randomUUID } = require("node:crypto");

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
      const previousValues = await queryInterface.select(
        null,
        "InventoryValue",
        { raw: true, transaction },
      );
      await renameColumns(
        "InventoryValue",
        {
          subcategory_value_id: "id",
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
      await queryInterface.addColumn(
        "InventoryValue",
        "unavailable_reason",
        Sequelize.TEXT,
        { transaction },
      );
      await queryInterface.addColumn(
        "InventoryValue",
        "unavailable_explanation",
        Sequelize.TEXT,
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
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
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
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
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
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
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
          gas: { type: Sequelize.STRING, allowNull: true },
          gas_amount: { type: Sequelize.BIGINT, allowNull: true },
        },
        { transaction },
      );
      await queryInterface.addConstraint("GasValue", {
        type: "foreign key",
        name: "FK_GasValue.inventory_value_id",
        fields: ["inventory_value_id"],
        references: {
          table: "InventoryValue",
          field: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        transaction,
      });
      await queryInterface.addConstraint("GasValue", {
        type: "foreign key",
        name: "FK_GasValue.emissions_factor_id",
        fields: ["emissions_factor_id"],
        references: {
          table: "EmissionsFactor",
          field: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });

      // Restore gas and subsector/ sector data for previous InventoryValue entries
      for (const value of previousValues) {
        if (value.subcategory_id) {
          const subCategory = await queryInterface.select(null, "SubCategory", {
            raw: true,
            transaction,
            where: {
              subcategory_id: value.subcategory_id,
            },
          });
          const sub_sector_id = subCategory[0].subsector_id;
          const subSector = await queryInterface.select(null, "SubSector", {
            raw: true,
            transaction,
            where: {
              subsector_id: sub_sector_id,
            },
          });
          const sector_id = subSector[0].sector_id;
          await queryInterface.bulkUpdate(
            "InventoryValue",
            { sub_sector_id, sector_id },
            { id: value.subcategory_value_id },
            { transaction },
          );
        }

        const gasValues = [];
        for (const gas of ["CO2", "CH4", "N2O"]) {
          const gasAmount = value[gas.toLowerCase() + "_emissions_value"];
          if (gasAmount) {
            // there were no emissionsFactorId's assigned previously
            gasValues.push({
              id: randomUUID(),
              gas,
              inventory_value_id: value.id,
              gas_amount: gasAmount,
            });
          }
        }
        if (gasValues.length > 0) {
          await queryInterface.bulkInsert("GasValue", gasValues, {
            transaction,
          });
        }
      }
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      /// GasValue, GasToCO2Eq ///
      await queryInterface.dropTable("GasValue", { transaction });
      await queryInterface.dropTable("GasToCO2Eq", { transaction });

      /// EmissionsFactor ///
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
