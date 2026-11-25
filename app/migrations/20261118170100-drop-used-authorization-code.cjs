"use strict";
/** @type {import('sequelize-cli').Migration} */
/*
- UsedAuthorizationCode recorded the jti of redeemed signed-JWT codes. Codes are
  now rows in AuthorizationCode with their own consumed_at, so this table is not
  needed. Its rows only ever lived for the 5 minutes a code was valid, so
  nothing of value is lost.
*/
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable("UsedAuthorizationCode");
  },

  // Recreates the table as 20261105120000-used-authorization-code.cjs made it.
  async down(queryInterface, Sequelize) {
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
};
