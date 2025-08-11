"use strict";

/** @type {import('sequelize-cli').Migration} */

/*

- Create table for OAuth 2.0 clients with ID and redirectURI
- Create i18n table for client names and descriptions

*/

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("OAuthClient", {
      client_id: {
        type: Sequelize.STRING(64),
        primaryKey: true,
        allowNull: false,
      },
      redirect_uri: {
        // maximum 2048 chars, like Google or AWS
        type: Sequelize.STRING(2048), // Sequelize does not have a URL type
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.createTable("OAuthClientI18N", {
      client_id: {
        type: Sequelize.STRING(64),
        allowNull: false,
        references: {
          model: "OAuthClient",
          key: "client_id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      language: {
        // ISO 639-1 two-letter language code
        type: Sequelize.STRING(2),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addConstraint("OAuthClientI18N", {
      fields: ["client_id", "language"],
      type: "primary key",
      name: "OAuthClientI18N_pkey",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "OAuthClientI18N",
      "OAuthClientI18N_pkey",
    );
    await queryInterface.dropTable("OAuthClientI18N");
    await queryInterface.dropTable("OAuthClient");
  },
};
