"use strict";

/**
 * CC-1283: credentials and the in-process OAuth AS leave CityCatalyst.
 * Identity owns passwords, 2FA, clients and grants.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("AuthorizationCode", { transaction });
      await queryInterface.dropTable("OAuthClientAuthz", { transaction });
      await queryInterface.dropTable("OAuthClientI18N", { transaction });
      await queryInterface.dropTable("OAuthClient", { transaction });

      await queryInterface.removeColumn("User", "password_hash", {
        transaction,
      });
      await queryInterface.removeColumn("User", "two_factor_enabled", {
        transaction,
      });
      await queryInterface.removeColumn("User", "two_factor_secret", {
        transaction,
      });
      await queryInterface.removeColumn("User", "two_factor_recovery_hashes", {
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "User",
        "password_hash",
        { type: Sequelize.CHAR(60), allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        "User",
        "two_factor_enabled",
        {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          defaultValue: false,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        "User",
        "two_factor_secret",
        { type: Sequelize.TEXT, allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        "User",
        "two_factor_recovery_hashes",
        {
          type: Sequelize.ARRAY(Sequelize.TEXT),
          allowNull: true,
          defaultValue: [],
        },
        { transaction },
      );

      // Recreate empty OAuth tables so down is runnable; data is not restored.
      await queryInterface.createTable(
        "OAuthClient",
        {
          client_id: {
            type: Sequelize.STRING(64),
            primaryKey: true,
            allowNull: false,
          },
          redirect_uri: { type: Sequelize.TEXT, allowNull: false },
          created: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
          last_updated: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
        },
        { transaction },
      );
      await queryInterface.createTable(
        "OAuthClientI18N",
        {
          client_id: {
            type: Sequelize.STRING(64),
            allowNull: false,
            primaryKey: true,
            references: { model: "OAuthClient", key: "client_id" },
            onDelete: "CASCADE",
          },
          language: {
            type: Sequelize.STRING(8),
            allowNull: false,
            primaryKey: true,
          },
          name: { type: Sequelize.STRING(255), allowNull: false },
          description: { type: Sequelize.TEXT, allowNull: true },
          created: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
          last_updated: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
        },
        { transaction },
      );
      await queryInterface.createTable(
        "OAuthClientAuthz",
        {
          client_id: {
            type: Sequelize.STRING(64),
            allowNull: false,
            primaryKey: true,
            references: { model: "OAuthClient", key: "client_id" },
            onDelete: "CASCADE",
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: "User", key: "user_id" },
            onDelete: "CASCADE",
          },
          last_used: { type: Sequelize.DATE, allowNull: true },
          created: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
        },
        { transaction },
      );
      await queryInterface.createTable(
        "AuthorizationCode",
        {
          code_hash: {
            type: Sequelize.STRING(64),
            primaryKey: true,
            allowNull: false,
          },
          client_id: { type: Sequelize.STRING(64), allowNull: false },
          user_id: { type: Sequelize.UUID, allowNull: false },
          redirect_uri: { type: Sequelize.TEXT, allowNull: false },
          code_challenge: { type: Sequelize.STRING(128), allowNull: false },
          scope: { type: Sequelize.TEXT, allowNull: false },
          nonce: { type: Sequelize.STRING(255), allowNull: true },
          expires: { type: Sequelize.DATE, allowNull: false },
          used_at: { type: Sequelize.DATE, allowNull: true },
          created: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn("NOW"),
          },
        },
        { transaction },
      );
    });
  },
};
