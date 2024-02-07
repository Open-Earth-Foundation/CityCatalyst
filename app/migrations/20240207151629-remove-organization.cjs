"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn("User", "is_organization", {
        transaction,
      });
      await queryInterface.removeColumn("User", "organization_id", {
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "User",
        "is_organization",
        Sequelize.BOOLEAN,
        {
          transaction,
        },
      );
      await queryInterface.addColumn(
        "User",
        "organization_id",
        Sequelize.UUID,
        {
          transaction,
        },
      );
      await queryInterface.addConstraint("User", {
        type: "foreign key",
        name: "FK_User_organization_id",
        fields: ["organization_id"],
        references: {
          table: "User",
          field: "user_id",
        },
        onDelete: "SET NULL",
        onUpdate: "SET NULL",
        transaction,
      });
    });
  },
};
