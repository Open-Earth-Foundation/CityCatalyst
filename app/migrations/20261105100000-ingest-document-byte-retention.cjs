"use strict";

/** CC-1221: remember when a document was withdrawn so byte retention can drop S3 later. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("IngestDocument", "withdrawn_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("IngestDocument", "bytes_purged_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("InventoryValue", "source_document_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex("InventoryValue", ["source_document_id"], {
      name: "idx_inventory_value_source_document",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "InventoryValue",
      "idx_inventory_value_source_document",
    );
    await queryInterface.removeColumn("InventoryValue", "source_document_id");
    await queryInterface.removeColumn("IngestDocument", "bytes_purged_at");
    await queryInterface.removeColumn("IngestDocument", "withdrawn_at");
  },
};
