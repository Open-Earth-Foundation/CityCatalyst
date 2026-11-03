"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "ImportedInventoryFile",
        "review_history",
        {
          type: Sequelize.JSONB,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE FUNCTION protect_import_review_history() RETURNS trigger AS $$
        BEGIN
          IF OLD.review_history IS NOT NULL AND
             NEW.review_history IS DISTINCT FROM OLD.review_history THEN
            RAISE EXCEPTION 'Import review history cannot be changed';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER protect_import_review_history
        BEFORE UPDATE ON "ImportedInventoryFile"
        FOR EACH ROW EXECUTE FUNCTION protect_import_review_history();
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        DROP TRIGGER IF EXISTS protect_import_review_history ON "ImportedInventoryFile";
        DROP FUNCTION IF EXISTS protect_import_review_history();
      `,
        { transaction },
      );
      await queryInterface.removeColumn(
        "ImportedInventoryFile",
        "review_history",
        { transaction },
      );
    });
  },
};
