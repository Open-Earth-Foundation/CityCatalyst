"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn(
      "SubCategoryValue",
      "datasource_id",
      Sequelize.UUID,
    );
    queryInterface.addConstraint(
      "SubCategoryValue",
      {
        type: "foreign key",
        name: "FK_SubCategoryValue_datasource_id",
        fields: ["datasource_id"],
        references: {
          table: "DataSource",
          field: "datasource_id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
    );
  },

  async down(queryInterface) {
    queryInterface.removeConstraint(
      "SubCategoryValue",
      "FK_SubCategoryValue_datasource_id",
    );
    queryInterface.removeColumn("SubCategoryValue", "datasource_id");
  },
};
