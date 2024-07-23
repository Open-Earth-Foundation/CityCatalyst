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

        const emissionsFactorsStationaryEnergy = await parseFile("EmissionsFactor_Stationary_Energy", folder);
        const emissionsFactorsStationaryEnergyScope1 = await parseFile("EmissionsFactor_Stationary_Energy_Scope1", folder);
        const emissionsFactorsRaw = emissionsFactorsStationaryEnergy.concat(emissionsFactorsStationaryEnergyScope1);

        const emissionsFactors = emissionsFactorsRaw.map((ef) => {
          delete ef["EF ID_x"];
          // delete ef["ipcc_2006_category"];
          return ef;
        })

        const publishers = await parseFile("Publisher", folder);

        console.info("Done loading files");

        await bulkUpsert(
          queryInterface,
          "Publisher",
          publishers,
          "publisher_id",
          transaction,
        );
        console.info("Finished adding publishers");
        await bulkUpsert(
          queryInterface,
          "DataSource",
          dataSources,
          "datasource_id",
          transaction,
        );
        console.info("Finished adding data sources");
        await bulkUpsert(
          queryInterface,
          "EmissionsFactor",
          emissionsFactors,
          "id",
          transaction,
          true,
        );
        console.info("Finished adding emissions factors");
        await bulkUpsert(
          queryInterface,
          "DataSourceEmissionsFactor",
          dataSourceEmissionsFactors,
          "emissions_factor_id", // TODO handle multiple primary keys
          transaction,
        );
        console.info("Done, have a nice day ✨");
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
