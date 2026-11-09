"use strict";

const DEBUG_CONTEXT_ONLY_MARKER =
  "This draft was generated from structured report context without an LLM call.";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "MeedActionReport",
      "catalog_eligible",
      {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    );

    // Historical report rows have no source metadata. Classify only the rows
    // with persisted plan content, while excluding the deterministic debug
    // marker that predated the no-persistence debug behavior.
    await queryInterface.sequelize.query(
      `
        UPDATE "MeedActionReport"
        SET "catalog_eligible" = true
        WHERE cardinality("languages") > 0
          AND (
            CASE
              WHEN jsonb_typeof("chapters") = 'array'
                THEN jsonb_array_length("chapters")
              ELSE 0
            END
          ) > 0
          AND "chapters"::text NOT LIKE :debugContextOnlyMarker
      `,
      {
        replacements: {
          debugContextOnlyMarker: `%${DEBUG_CONTEXT_ONLY_MARKER}%`,
        },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "MeedActionReport",
      "catalog_eligible",
    );
  },
};
