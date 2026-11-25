"use strict";

/**
 * Backfills omit_from_total on stored rows the GPC leaves out of BASIC and
 * BASIC+ totals: III.x.3 and VI.1. New saves get the flag from the model hook,
 * so this only changes historical totals, and it can run before or after the
 * code ships. Rerunning it changes nothing.
 *
 * down is a no-op on purpose. Rows flagged here cannot be told apart from rows
 * that were already true, so clearing them could put an explicit exclusion back
 * into totals. After a rollback these rows stay flagged; reset them by hand only
 * with a list of affected ids.
 */

const REFERENCES = ["III.1.3", "III.2.3", "III.3.3", "III.4.3", "VI.1"];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE "InventoryValue"
      SET omit_from_total = true
      WHERE gpc_reference_number IN (:references)
        AND omit_from_total = false
      `,
      { replacements: { references: REFERENCES } },
    );
  },

  async down() {},
};
