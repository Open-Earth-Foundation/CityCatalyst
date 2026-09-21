"use strict";

/**
 * Allows a removed action to carry no legal verdict.
 *
 * `MeedActionRemoved` was created when every row came from the legal hard
 * filter, so the three verdict columns were `NOT NULL` with no default. That
 * assumption stopped holding once exclusions confirmed on the pre-flight screen
 * began reaching the ranking: hiap-meed returns those with
 * `removal_source: "user_exclusion"` and `legal: null`, because no legal
 * assessment was involved.
 *
 * The JSONB and array columns already default to `{}` / `[]`, so they accept
 * such a row as-is. These three had no default and would reject it.
 *
 * NULL here means "no legal assessment applies to this removal", which is
 * distinct from an assessment that ran and returned nothing.
 */
const COLUMNS = [
  "verdict_category",
  "ownership_category",
  "restrictions_category",
];

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const column of COLUMNS) {
        await queryInterface.changeColumn(
          "MeedActionRemoved",
          column,
          { type: Sequelize.TEXT, allowNull: true },
          { transaction },
        );
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Rows added while the columns were nullable would block the constraint.
      for (const column of COLUMNS) {
        await queryInterface.sequelize.query(
          `DELETE FROM "MeedActionRemoved" WHERE "${column}" IS NULL`,
          { transaction },
        );
        await queryInterface.changeColumn(
          "MeedActionRemoved",
          column,
          { type: Sequelize.TEXT, allowNull: false },
          { transaction },
        );
      }
    });
  },
};
