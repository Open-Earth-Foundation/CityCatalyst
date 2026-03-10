"use strict";

/**
 * Path C: Add file_type 'pdf' and import_status 'pending_ai_extraction' to ImportedInventoryFile.
 * PostgreSQL: add new values to existing ENUMs (cannot drop/recreate without migrating data).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_file_type" ADD VALUE 'pdf';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_ImportedInventoryFile_import_status" ADD VALUE 'pending_ai_extraction';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  },

  async down(queryInterface) {
    // PostgreSQL does not support removing a value from an enum easily; would require recreate enum + update rows.
    // No-op for safety; document that rollback requires manual steps if needed.
  },
};
