"use strict";

/**
 * When a user is deleted, their inventory edit history, their imported or
 * uploaded files and their project invites must stay, with the user reference
 * set to null (CC-1274).
 *
 * Before this migration:
 * - "Version".author_id is NOT NULL with no ON DELETE rule, so deleting a user
 *   who edited inventory values fails.
 * - "ImportedInventoryFile".user_id and "UserFile".user_id are NOT NULL and
 *   cascade, so deleting a user deletes the records.
 * - "ProjectInvite".user_id has two foreign keys to "User": one with no ON
 *   DELETE rule (from the column definition) and one that cascades (added
 *   next to it). The first is checked before the cascade runs, so deleting a
 *   user who has a project invite fails.
 *
 * Now all four columns are nullable with ON DELETE SET NULL ON UPDATE CASCADE,
 * and each has exactly one foreign key to "User".
 *
 * Back up the database before running this on a shared environment.
 */

// For each column: the constraint to create, and what the column looked like
// before, so down() can put it back.
const COLUMNS = [
  {
    table: "Version",
    column: "author_id",
    constraint: "Version_author_id_fkey",
    previousNullable: false,
    previousOnDelete: "NO ACTION",
    previousOnUpdate: "NO ACTION",
  },
  {
    table: "ImportedInventoryFile",
    column: "user_id",
    constraint: "ImportedInventoryFile_user_id_fkey",
    previousNullable: false,
    previousOnDelete: "CASCADE",
    previousOnUpdate: "CASCADE",
  },
  {
    table: "UserFile",
    column: "user_id",
    constraint: "UserFile_user_id_fkey",
    previousNullable: false,
    previousOnDelete: "CASCADE",
    previousOnUpdate: "CASCADE",
  },
  {
    table: "ProjectInvite",
    column: "user_id",
    constraint: "ProjectInvite_user_id_fkey",
    // Already nullable before this migration.
    previousNullable: true,
    // down() restores the one key that blocked the delete. The cascading
    // duplicate had no effect, because the blocking key is checked first.
    previousOnDelete: "NO ACTION",
    previousOnUpdate: "NO ACTION",
  },
];

/** The actual names of the foreign keys from table.column to "User". */
async function findUserForeignKeys(queryInterface, table, column, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT con.conname AS name
       FROM pg_constraint con
       JOIN pg_attribute att
         ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.conrelid = format('%I', :table)::regclass
        AND con.confrelid = '"User"'::regclass
        AND att.attname = :column;`,
    { replacements: { table, column }, transaction },
  );
  return rows.map((row) => row.name);
}

/**
 * Replaces every foreign key from the column to "User" with one new key, and
 * sets whether the column may be null.
 *
 * The existing keys are looked up, not assumed by name. A database that
 * drifted (a manual fix, a Sequelize sync) could have a key with another
 * name, and dropping by a guessed name would leave the old rule in place while
 * the migration reports success.
 */
async function setUserReference(
  queryInterface,
  { table, column, constraint },
  { nullable, onDelete, onUpdate },
  transaction,
) {
  const existing = await findUserForeignKeys(
    queryInterface,
    table,
    column,
    transaction,
  );
  if (existing.length === 0) {
    // Without a key there is nothing to replace: the schema is not what we
    // expect, so stop and let a person check.
    throw new Error(
      `Expected a foreign key from "${table}".${column} to "User", found none.`,
    );
  }
  for (const name of existing) {
    // No IF EXISTS: if a key is missing, fail instead of skipping it.
    await queryInterface.sequelize.query(
      `ALTER TABLE "${table}" DROP CONSTRAINT "${name}";`,
      { transaction },
    );
  }
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
      // restored while they exist, and deleting or inventing a user would lose
      // or falsify data, so stop and let a person decide.
      for (const { table, column, previousNullable } of COLUMNS) {
        // Columns that allowed null before can keep their null rows.
        if (previousNullable) continue;
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
            nullable: spec.previousNullable,
            onDelete: spec.previousOnDelete,
            onUpdate: spec.previousOnUpdate,
          },
          transaction,
        );
      }
    });
  },
};
