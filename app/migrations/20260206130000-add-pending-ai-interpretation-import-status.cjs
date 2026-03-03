"use strict";

/**
 * Path B: Add import_status 'pending_ai_interpretation' to ImportedInventoryFile.
 * PostgreSQL: add new value to existing ENUM (cannot drop/recreate without migrating data).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_import_status" ADD VALUE 'pending_ai_interpretation';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down(queryInterface) {
    // PostgreSQL does not support removing a value from an enum easily; would require recreate enum + update rows.
    // No-op for safety; document that rollback requires manual steps if needed.
  },
};
