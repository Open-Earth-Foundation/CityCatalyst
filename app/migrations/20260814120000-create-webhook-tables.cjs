"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("WebhookSubscription", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Organization", key: "organization_id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      url: { type: Sequelize.STRING(2048), allowNull: false },
      secret_ciphertext: { type: Sequelize.TEXT, allowNull: false },
      secret_iv: { type: Sequelize.STRING(64), allowNull: false },
      secret_auth_tag: { type: Sequelize.STRING(64), allowNull: false },
      secret_prefix: { type: Sequelize.STRING(8), allowNull: false },
      events: { type: Sequelize.JSONB, allowNull: false },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      consecutive_failures: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      disabled_at: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "User", key: "user_id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
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
    });

    await queryInterface.addIndex("WebhookSubscription", ["organization_id"], {
      name: "idx_webhook_subscription_organization",
    });

    await queryInterface.createTable("WebhookDelivery", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "WebhookSubscription", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      event_type: { type: Sequelize.STRING(128), allowNull: false },
      payload: { type: Sequelize.JSONB, allowNull: false },
      status: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: "pending",
      },
      attempt_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      run_after: { type: Sequelize.DATE, allowNull: true },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      last_http_status: { type: Sequelize.INTEGER, allowNull: true },
      last_error: { type: Sequelize.TEXT, allowNull: true },
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
    });

    await queryInterface.addConstraint("WebhookDelivery", {
      fields: ["status"],
      type: "check",
      where: {
        status: {
          [Sequelize.Op.in]: ["pending", "delivering", "delivered", "failed"],
        },
      },
      name: "WebhookDelivery_status_check",
    });
    await queryInterface.addIndex(
      "WebhookDelivery",
      ["status", "run_after"],
      { name: "idx_webhook_delivery_due" },
    );
    await queryInterface.addIndex("WebhookDelivery", ["subscription_id"], {
      name: "idx_webhook_delivery_subscription",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("WebhookDelivery");
    await queryInterface.dropTable("WebhookSubscription");
  },
};
