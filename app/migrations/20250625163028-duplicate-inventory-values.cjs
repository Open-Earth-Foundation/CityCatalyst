"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      /* await queryInterface.sequelize.query(`
        SELECT * from "InventoryValue" iv1 JOIN "InventoryValue" iv2 on iv1.inventory_id = iv2.inventory_id AND iv1.gpc_reference_number = iv2.gpc_reference_number WHERE iv1.id < iv2.id;
      `); */
      // merge the values and save them to the database
      await queryInterface.sequelize.query(`
        WITH duplicates AS (
          SELECT iv1.id AS id1, iv2.id AS id2, iv1.inventory_id, iv1.gpc_reference_number, SUM(iv1.value) AS total_value
          FROM "InventoryValue" iv1
          JOIN "InventoryValue" iv2 ON iv1.inventory_id = iv2.inventory_id
          AND iv1.gpc_reference_number = iv2.gpc_reference_number
          WHERE iv1.id < iv2.id
          GROUP BY iv1.inventory_id, iv1.gpc_reference_number
        )
        UPDATE "InventoryValue" iv
        SET value = d.total_value
        FROM duplicates d
        WHERE iv.id = d.id1
        AND iv.inventory_id = d.inventory_id
        AND iv.gpc_reference_number = d.gpc_reference_number;
      `);

      // add unique constraint to prevent future duplicates
      await queryInterface.addConstraint("InventoryValue", {
        fields: ["inventory_id", "gpc_reference_number"],
        type: "unique",
        name: "InventoryValue_inventory_refno_unique_constraint",
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    // add unique constraint to prevent future duplicates
    await queryInterface.removeConstraint(
      "InventoryValue",
      "InventoryValue_inventory_refno_unique_constraint",
      { transaction },
    );
  },
};
