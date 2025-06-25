"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // update the value of the kept InventoryValue (sum of all duplicates)
      await queryInterface.sequelize.query(`
        WITH to_keep AS (
          SELECT
            MIN(id) AS id_to_keep,
            inventory_id,
            gpc_reference_number,
            SUM(value) AS total_value
          FROM "InventoryValue"
          GROUP BY inventory_id, gpc_reference_number
          HAVING COUNT(*) > 1
        )
        UPDATE "InventoryValue" iv
        SET value = tk.total_value
        FROM to_keep tk
        WHERE iv.id = tk.id_to_keep;
      `);

      // reassign ActivityValue entries to the kept InventoryValue
      await queryInterface.sequelize.query(`
        WITH duplicates AS (
          SELECT
            MIN(id) AS id_to_keep,
            id AS id_to_remove,
            inventory_id,
            gpc_reference_number
          FROM "InventoryValue"
          GROUP BY inventory_id, gpc_reference_number, id
          HAVING COUNT(*) > 1 OR id != MIN(id)
        )
        UPDATE "ActivityValue" av
        SET inventory_value_id = d.id_to_keep
        FROM duplicates d
        WHERE av.inventory_value_id = d.id_to_remove;
      `);

      // remove the duplicate InventoryValue entries
      await queryInterface.sequelize.query(`
        WITH duplicates AS (
          SELECT
            MIN(id) AS id_to_keep,
            id AS id_to_remove,
            inventory_id,
            gpc_reference_number
          FROM "InventoryValue"
          GROUP BY inventory_id, gpc_reference_number, id
          HAVING COUNT(*) > 1 OR id != MIN(id)
        )
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

  async down(queryInterface) {
    // add unique constraint to prevent future duplicates
    await queryInterface.removeConstraint(
      "InventoryValue",
      "InventoryValue_inventory_refno_unique_constraint",
      { transaction },
    );
  },
};
