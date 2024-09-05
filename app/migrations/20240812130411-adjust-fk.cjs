"use strict";

const TABLES = [
  "DataSourceScope",
  "Methodology",
  "DataSourceActivityData",
  "DataSourceEmissionsFactor",
  "DataSourceGHGs",
  "DataSourceMethodology",
  "DataSourceReportingLevel",
  "GDP",
  "Population",
  "InventoryValue",
  "ActivityValue",
];

const UNDERSCORES = ["InventoryValue", "ActivityValue"];

const OLD_TABLE = "DataSource";
const NEW_TABLE = "DataSourceI18n";

function fkName(table) {
  if (UNDERSCORES.includes(table)) {
    return `FK_${table}_datasource_id`;
  } else {
    return `FK_${table}.datasource_id`;
  }
}

async function dropConstraint(queryInterface, table, foreignTable) {
  await queryInterface.sequelize.query(`
    ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${fkName(table)}";
    `);
}

async function addConstraint(queryInterface, table, foreignTable) {
  await queryInterface.addConstraint(table, {
    fields: ["datasource_id"],
    type: "foreign key",
    name: fkName(table),
    references: {
      table: foreignTable,
      field: "datasource_id",
    }
});
}

async function deleteNonMatching(queryInterface, table, newTable) {
  await queryInterface.sequelize.query(`
  DELETE FROM "${table}"
  WHERE datasource_id NOT IN (SELECT datasource_id FROM "${newTable}");
`);
}

/** @type {import("sequelize-cli").Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await dropConstraint(queryInterface, table, OLD_TABLE);
      await deleteNonMatching(queryInterface, table, NEW_TABLE);
      await addConstraint(queryInterface, table, NEW_TABLE);
    }
  },

  async down(queryInterface, Sequelize) {
    for (const table of TABLES) {
      await dropConstraint(queryInterface, table, NEW_TABLE);
      await addConstraint(queryInterface, table, OLD_TABLE);
    }
  },
};
