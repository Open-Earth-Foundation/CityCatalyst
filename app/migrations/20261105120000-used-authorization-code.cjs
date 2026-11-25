"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("UsedAuthorizationCode", {
      jwt_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      expires: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("UsedAuthorizationCode", ["expires"], {
      name: "idx_used_authorization_code_expires",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("UsedAuthorizationCode");
  },
};
