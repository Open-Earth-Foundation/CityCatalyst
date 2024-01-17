"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("SubSectorValue", {}, { transaction });
      await queryInterface.addIndex(
        "SubSectorValue",
        ["inventory_id", "subsector_id"],
        {
          name: "ID_SubSectorValue_inventory_id_subsector_id",
          indicesType: "UNIQUE",
          unique: true,
          transaction,
        },
      );
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        "SubSectorValue",
        "ID_SubSectorValue_inventory_id_subsector_id",
        { transaction },
      );
    });
  },
};
