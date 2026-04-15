"use strict";

/**
 * Add import_status values used by Path B/C async flows:
 * - 'extracting': PDF extraction in progress (client polls)
 * - 'pending_ai_interpretation': Tabular file awaiting Interpret API
 * Run this on dev if you see: invalid input value for enum "enum_ImportedInventoryFile_import_status": "extracting"
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_import_status" ADD VALUE 'extracting';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_import_status" ADD VALUE 'pending_ai_interpretation';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down() {
    // PostgreSQL does not support removing enum values without recreating the type.
    // No-op; rollback would require manual migration of data and enum recreate.
  },
};
