"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "SubSectorValue",
        "co2_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubSectorValue",
        "ch4_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubSectorValue",
        "n2o_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );

      await queryInterface.addColumn(
        "SubCategoryValue",
        "co2_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubCategoryValue",
        "ch4_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );
      await queryInterface.addColumn(
        "SubCategoryValue",
        "n2o_emissions_value",
        Sequelize.NUMERIC,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        "SubSectorValue",
        "co2_emissions_value",
        { transaction },
      );
      await queryInterface.removeColumn(
        "SubSectorValue",
        "ch4_emissions_value",
        { transaction },
      );
      await queryInterface.removeColumn(
        "SubSectorValue",
        "n2o_emissions_value",
        { transaction },
      );

      await queryInterface.removeColumn(
        "SubCategoryValue",
        "co2_emissions_value",
        { transaction },
      );
      await queryInterface.removeColumn(
        "SubCategoryValue",
        "ch4_emissions_value",
        { transaction },
      );
      await queryInterface.removeColumn(
        "SubCategoryValue",
        "n2o_emissions_value",
        { transaction },
      );
    });
  },
};
