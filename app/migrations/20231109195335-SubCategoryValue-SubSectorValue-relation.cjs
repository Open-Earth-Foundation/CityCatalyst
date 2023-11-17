"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "SubCategoryValue",
        "subsector_value_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("SubCategoryValue", {
        type: "foreign key",
        name: "FK_SubCategoryValue_subsector_value_id",
        fields: ["subsector_value_id"],
        references: {
          table: "SubSectorValue",
          field: "subsector_value_id",
        },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint(
        "SubCategoryValue",
        "FK_SubCategoryValue_subsector_value_id",
        {
          transaction,
        },
      );
      await queryInterface.removeColumn(
        "SubCategoryValue",
        "subsector_value_id",
        { transaction },
      );
    });
  },
};
