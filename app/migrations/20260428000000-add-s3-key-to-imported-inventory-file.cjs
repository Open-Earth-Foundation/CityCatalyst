"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ImportedInventoryFile", "s3_key", {
      type: Sequelize.STRING(512),
      allowNull: true,
      comment:
        "S3 object key for the uploaded file. When set, file bytes are stored in S3 and the `data` column is null.",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("ImportedInventoryFile", "s3_key");
  },
};
