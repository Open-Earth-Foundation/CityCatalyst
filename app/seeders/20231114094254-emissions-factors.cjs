"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { bulkUpsert } = require("./util/util.cjs");

const folders = ["EFDB_2006_IPCC_guidelines", "EFDB_US"];

async function parseFile(filename, folder) {
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
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const folder of folders) {
        const dataSources = await parseFile("DataSource", folder);
        const dataSourceEmissionsFactors = await parseFile(
          "DataSourceEmissionsFactor",
          folder,
        );
        const emissionsFactors = await parseFile("EmissionsFactor", folder);
        const publishers = await parseFile("Publisher", folder);

        await bulkUpsert(
          queryInterface,
          "Publisher",
          publishers,
          "publisher_id",
          transaction,
        );
        await bulkUpsert(
          queryInterface,
          "DataSource",
          dataSources,
          "datasource_id",
          transaction,
        );
        await bulkUpsert(
          queryInterface,
          "EmissionsFactor",
          emissionsFactors,
          "id",
          transaction,
        );
        await bulkUpsert(
          queryInterface,
          "DataSourceEmissionsFactor",
          dataSourceEmissionsFactors,
          "emissions_factor_id", // TODO handle multiple primary keys
          transaction,
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("DataSourceEmissionsFactor", null, {
        transaction,
      });
      await queryInterface.bulkDelete("EmissionsFactor", null, { transaction });

      for (const folder of folders) {
        const dataSources = await parseFile("DataSource", folder);
        const publishers = await parseFile("Publisher", folder);

        const dataSourceIds = dataSources.map((s) => s.datasource_id);
        const publisherIds = publishers.map((p) => p.publisher_id);

        await queryInterface.bulkDelete(
          "DataSource",
          { id: { [Sequelize.Op.in]: dataSourceIds } },
          { transaction },
        );
        await queryInterface.bulkDelete(
          "Publisher",
          { id: { [Sequelize.Op.in]: publisherIds } },
          { transaction },
        );
      }
    });
  },
};
