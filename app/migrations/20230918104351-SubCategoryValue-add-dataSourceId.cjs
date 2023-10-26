"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "SubCategoryValue",
        "datasource_id",
        Sequelize.UUID,
        { transaction },
      );
      await queryInterface.addConstraint("SubCategoryValue", {
        type: "foreign key",
        name: "FK_SubCategoryValue_datasource_id",
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
      queryInterface.removeConstraint(
        "SubCategoryValue",
        "FK_SubCategoryValue_datasource_id",
        { transaction },
      );
      queryInterface.removeColumn("SubCategoryValue", "datasource_id", {
        transaction,
      });
    });
  },
};
