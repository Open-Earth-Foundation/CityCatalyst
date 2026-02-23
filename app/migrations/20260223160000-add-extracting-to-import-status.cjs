"use strict";

/**
 * Add import_status 'extracting' for async PDF extraction (client polls until done).
 * PostgreSQL: add new value to existing ENUM.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_import_status" ADD VALUE 'extracting';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down() {
    // PostgreSQL does not support removing a value from an enum easily.
    // No-op for safety.
  },
};
