"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (let i = 1; i <= 4; i++) {
        await queryInterface.bulkUpdate(
          "InventoryValue",
          { gpc_reference_number: `III.${i}.2` }, // target value
          { gpc_reference_number: `III.${i}.3` }, // where clause
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (let i = 1; i <= 4; i++) {
        await queryInterface.bulkUpdate(
          "InventoryValue",
          { gpc_reference_number: `III.${i}.3` }, // target value
          { gpc_reference_number: `III.${i}.2` }, // where clause
          { transaction },
        );
      }
    });
  },
};
