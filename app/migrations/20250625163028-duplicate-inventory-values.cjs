"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // merge the values and save them to the database
      await queryInterface.sequelize.query(`
        WITH duplicates AS (
          SELECT
            iv1.id AS id_to_keep,
            iv2.id AS id_to_remove,
            iv1.inventory_id,
            iv1.gpc_reference_number,
            SUM(iv1.value) AS total_value
          FROM "InventoryValue" iv1
          JOIN "InventoryValue" iv2
            ON iv1.inventory_id = iv2.inventory_id
            AND iv1.gpc_reference_number = iv2.gpc_reference_number
          WHERE iv1.id < iv2.id
          GROUP BY iv1.id, iv2.id, iv1.inventory_id, iv1.gpc_reference_number
        ),
        summed AS (
          SELECT
            inventory_id,
            gpc_reference_number,
            SUM(value) AS total_value,
            MIN(id) AS id_to_keep
          FROM "InventoryValue"
          GROUP BY inventory_id, gpc_reference_number
          HAVING COUNT(*) > 1
        )
      `);

      // Update the value of the kept InventoryValue
      await queryInterface.sequelize.query(`
        UPDATE "InventoryValue" iv
        SET value = s.total_value
        FROM summed s
        WHERE iv.id = s.id_to_keep;
      `);

      // Reassign ActivityValue entries to the kept InventoryValue
      await queryInterface.sequelize.query(`
        UPDATE "ActivityValue" av
        SET inventory_value_id = d.id_to_keep
        FROM duplicates d
        WHERE av.inventory_value_id = d.id_to_remove;
      `);

      // Remove the duplicate InventoryValue entries
      await queryInterface.sequelize.query(`
        DELETE FROM "InventoryValue" iv
        USING duplicates d
        WHERE iv.id = d.id_to_remove;
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
