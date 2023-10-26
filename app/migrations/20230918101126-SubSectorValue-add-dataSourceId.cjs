"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "SubSectorValue",
        "datasource_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("SubSectorValue", {
        type: "foreign key",
        name: "FK_SubSectorValue_datasource_id",
        fields: ["datasource_id"],
        references: {
          table: "DataSource",
          field: "datasource_id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeConstraint(
        "SubSectorValue",
        "FK_SubSectorValue_datasource_id",
        { transaction },
      );
      await queryInterface.removeColumn("SubSectorValue", "datasource_id", {
        transaction,
      });
    });
  },
};
