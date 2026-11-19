"use strict";

/**
 * When a user is deleted, their inventory edit history and their imported or
 * uploaded files must stay, with the user reference set to null (CC-1274).
 *
 * Before this migration:
 * - "Version".author_id is NOT NULL with no ON DELETE rule, so deleting a user
 *   who edited inventory values fails.
 * - "ImportedInventoryFile".user_id and "UserFile".user_id are NOT NULL and
 *   cascade, so deleting a user deletes the records.
 *
 * Now all three columns are nullable with ON DELETE SET NULL ON UPDATE CASCADE.
 *
 * Back up the database before running this on a shared environment.
 */

// table, column, constraint name, and what the constraint did before.
const COLUMNS = [
  {
    table: "Version",
    column: "author_id",
    constraint: "Version_author_id_fkey",
    previousOnDelete: "NO ACTION",
    previousOnUpdate: "NO ACTION",
  },
  {
    table: "ImportedInventoryFile",
    column: "user_id",
    constraint: "ImportedInventoryFile_user_id_fkey",
    previousOnDelete: "CASCADE",
    previousOnUpdate: "CASCADE",
  },
  {
    table: "UserFile",
    column: "user_id",
    constraint: "UserFile_user_id_fkey",
    previousOnDelete: "CASCADE",
    previousOnUpdate: "CASCADE",
  },
];

/** Replaces the foreign key to "User" and sets whether the column may be null. */
async function setUserReference(
  queryInterface,
  { table, column, constraint },
  { nullable, onDelete, onUpdate },
  transaction,
) {
  await queryInterface.sequelize.query(
    `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "${table}" ALTER COLUMN ${column} ${nullable ? "DROP" : "SET"} NOT NULL;`,
    { transaction },
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "${table}"
       ADD CONSTRAINT "${constraint}"
       FOREIGN KEY (${column}) REFERENCES "User" (user_id)
       ON DELETE ${onDelete} ON UPDATE ${onUpdate};`,
    { transaction },
  );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const spec of COLUMNS) {
        await setUserReference(
          queryInterface,
          spec,
          { nullable: true, onDelete: "SET NULL", onUpdate: "CASCADE" },
          transaction,
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Rows whose user was deleted have a null reference. NOT NULL cannot be
      // restored while they exist, and deleting or inventing an author would
      // lose or falsify data, so stop and let a person decide.
      for (const { table, column } of COLUMNS) {
        const [[{ count }]] = await queryInterface.sequelize.query(
          `SELECT COUNT(*)::int AS count FROM "${table}" WHERE ${column} IS NULL;`,
          { transaction },
        );
        if (count > 0) {
          throw new Error(
            `Cannot restore NOT NULL on "${table}".${column}: ${count} row(s) have no user. Reassign or remove them first.`,
          );
        }
      }

      for (const spec of COLUMNS) {
        await setUserReference(
          queryInterface,
          spec,
          {
            nullable: false,
            onDelete: spec.previousOnDelete,
            onUpdate: spec.previousOnUpdate,
          },
          transaction,
        );
      }
    });
  },
};
