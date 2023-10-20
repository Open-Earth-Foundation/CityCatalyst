"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    queryInterface.addColumn(
      "SubSectorValue",
      "datasource_id",
      Sequelize.UUID,
    );
    queryInterface.addConstraint(
      "SubSectorValue",
      {
        type: "foreign key",
        name: "FK_SubSectorValue_datasource_id",
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
      "SubSectorValue",
      "FK_SubSectorValue_datasource_id",
    );
    queryInterface.removeColumn("SubSectorValue", "datasource_id");
  },
};
