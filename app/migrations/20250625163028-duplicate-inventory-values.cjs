"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Update the value of the kept InventoryValue (sum of all duplicates)
      await queryInterface.sequelize.query(`
        WITH ranked AS (
          SELECT
            id,
            inventory_id,
            gpc_reference_number,
            value,
            ROW_NUMBER() OVER (
              PARTITION BY inventory_id, gpc_reference_number
              ORDER BY id
            ) AS rn
          FROM "InventoryValue"
        ),
        to_keep AS (
          SELECT
            inventory_id,
            gpc_reference_number,
            id AS id_to_keep,
            (SELECT SUM(value) FROM ranked r2
              WHERE r2.inventory_id = r1.inventory_id
                AND r2.gpc_reference_number = r1.gpc_reference_number
            ) AS total_value
          FROM ranked r1
          WHERE rn = 1
          GROUP BY inventory_id, gpc_reference_number, id
          HAVING COUNT(*) FILTER (
            WHERE inventory_id = r1.inventory_id
              AND gpc_reference_number = r1.gpc_reference_number
          ) > 1
        )
        UPDATE "InventoryValue" iv
        SET value = tk.total_value
        FROM to_keep tk
        WHERE iv.id = tk.id_to_keep;
      `);

      // Reassign ActivityValue entries to the kept InventoryValue
      await queryInterface.sequelize.query(`
        WITH ranked AS (
          SELECT
            id,
            inventory_id,
            gpc_reference_number,
            ROW_NUMBER() OVER (
              PARTITION BY inventory_id, gpc_reference_number
              ORDER BY id
            ) AS rn
          FROM "InventoryValue"
        ),
        duplicates AS (
          SELECT
            inventory_id,
            gpc_reference_number,
            id AS id_to_remove,
            FIRST_VALUE(id) OVER (
              PARTITION BY inventory_id, gpc_reference_number
              ORDER BY id
            ) AS id_to_keep
          FROM ranked
          WHERE rn > 1
        )
        UPDATE "ActivityValue" av
        SET inventory_value_id = d.id_to_keep
        FROM duplicates d
        WHERE av.inventory_value_id = d.id_to_remove;
      `);

      // Remove the duplicate InventoryValue entries
      await queryInterface.sequelize.query(`
        WITH ranked AS (
          SELECT
            id,
            inventory_id,
            gpc_reference_number,
            ROW_NUMBER() OVER (
              PARTITION BY inventory_id, gpc_reference_number
              ORDER BY id
            ) AS rn
          FROM "InventoryValue"
        )
        DELETE FROM "InventoryValue" iv
        USING ranked r
        WHERE iv.id = r.id AND r.rn > 1;
      `);

      // Add unique constraint to prevent future duplicates
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
