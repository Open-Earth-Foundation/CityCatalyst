"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");

const folder = "EFDB_2006_IPCC_guidelines";

async function parseFile(filename) {
  const records = [];
  const parser = fs
    .createReadStream(
      `${__dirname}/../seed-data/emissions_factors/data_processed/${folder}/${filename}.csv`,
    )
    .pipe(parse({ delimiter: ",", columns: true }));

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dataSources = await parseFile("DataSource");
    const dataSourceEmissionsFactors = await parseFile(
      "DataSourceEmissionsFactor",
    );
    const emissionsFactors = await parseFile("EmissionsFactor");
    const publishers = await parseFile("Publisher");

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert("Publisher", publishers, { transaction });
      await queryInterface.bulkInsert("DataSource", dataSources, {
        transaction,
      });
      await queryInterface.bulkInsert("EmissionsFactor", emissionsFactors, {
        transaction,
      });
      await queryInterface.bulkInsert(
        "DataSourceEmissionsFactor",
        dataSourceEmissionsFactors,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("DataSourceEmissionFactor", null);
    await queryInterface.bulkDelete("EmissionFactor", null);
  },
};
