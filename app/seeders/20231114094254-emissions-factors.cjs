"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { bulkUpsert } = require("./util/util.cjs");

const folders = [
  "EFDB_2006_IPCC_guidelines",
  //"CarbonFootPrint_2023",
  //"ghgprotocol",
];

const toJson = ({
  transformation_description,
  dataset_description,
  methodology_description,
  dataset_name,
  ...row
}) => {
  const out = { ...row };

  if (!!transformation_description) {
    out.transformation_description = JSON.stringify({
      user: transformation_description,
    });
  }
  if (!!dataset_description) {
    out.dataset_description = JSON.stringify({ user: dataset_description });
  }
  if (!!methodology_description) {
    out.methodology_description = JSON.stringify({
      user: methodology_description,
    });
  }
  if (!!dataset_name) {
    out.dataset_name = JSON.stringify({ user: dataset_name });
  }
  return out;
};

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

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface) {
    // Skip emissions factors seeding - now handled by emissions-factors-sync.ts
    console.error("Skipping emissions factors seeding - using sync script instead");
    return;
    await queryInterface.sequelize.transaction(async (transaction) => {
      // set all existing emissions factors to deprecated
      // if they aren't overridden by the new data, they will be deleted (if unused in inventories) after all seed folders are processed
      await queryInterface.bulkUpdate(
        "EmissionsFactor",
        { deprecated: true },
        {}, // no where clause, update all
        { transaction },
        {}, // don't return attributes
      );

      for (const folder of folders) {
        console.log("Loading emissions factor folder " + folder + "...");
        const dataSources = await parseFile("DataSource", folder);
        const dataSourceEmissionsFactors = await parseFile(
          "DataSourceEmissionsFactor",
          folder,
        );
        const methodologies = await parseFile("Methodology", folder);
        const emissionsFactorsRaw = await parseFile("EmissionsFactor", folder);
        const emissionsFactors = emissionsFactorsRaw.map((ef) => {
          const metadata = ef.metadata ? ef.metadata : "{}";
          ef.metadata = metadata.replace(/'/g, '"');
          ef.year = !!ef.year ? parseInt(ef.year) : null;
          ef.deprecated = false; // set to false, as we set all existing emissions factors to deprecated at the start of this seeder
          return ef;
        });

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
          "DataSourceI18n",
          dataSources.map(toJson),
          "datasource_id",
          transaction,
        );
        console.info("Finished adding data sources");
        await bulkUpsert(
          queryInterface,
          "Methodology",
          methodologies,
          "methodology_id",
          transaction,
        );
        console.info("Finished adding methodologies");
        await bulkUpsert(
          queryInterface,
          "EmissionsFactor",
          emissionsFactors,
          "id",
          transaction,
          // folder == "CarbonFootPrint_2023",
        );
        console.info("Finished adding emissions factors");
        await bulkUpsert(
          queryInterface,
          "DataSourceEmissionsFactor",
          dataSourceEmissionsFactors,
          "emissions_factor_id", // TODO handle multiple primary keys
          transaction,
        );
        console.info("Finished adding DataSourceEmissionsFactor entries");
      }

      console.info("Deleting unused deprecated emissions factors...");
      await queryInterface.sequelize.query(
        `DELETE FROM "EmissionsFactor" ef
        WHERE ef.deprecated = true AND ef.inventory_id IS NULL AND NOT EXISTS (
          SELECT FROM "GasValue" gv WHERE gv.emissions_factor_id = ef.id
        );`,
        { transaction },
      );

      console.info("Done, have a nice day ✨");
    });
  },

  async down(queryInterface) {
    // Skip rollback - emissions factors are now managed by sync script
    console.error("Skipping emissions factors rollback - managed by sync script");
    return;
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
          "DataSourceI18n",
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
