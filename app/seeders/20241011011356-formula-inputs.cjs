"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { bulkUpsert } = require("./util/util.cjs");
const folders = ["EFDB_2006_IPCC_guidelines"];

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
      `${__dirname}/../seed-data/formula_values/data_processed/${folder}/${filename}.csv`,
    )
    .pipe(parse({ delimiter: ",", columns: true }));

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const folder of folders) {
        console.log("Loading Formula Value  folder " + folder + "...");
        const dataSources = await parseFile("DataSource", folder);
        const dataSourceFormulaInput = await parseFile(
          "DataSourceFormulaInput",
          folder,
        );
        const methodologies = await parseFile("Methodology", folder);
        const formulaInputsRaw = await parseFile("FormulaInputs", folder);
        const formulaInputs = formulaInputsRaw.map((fi) => {
          const metadata = (fi.metadata ? fi.metadata : "")
            .split(", ")
            .map((entry) => entry.split(":"));
          fi.metadata = JSON.stringify(Object.fromEntries(metadata));
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
          "FormulaInputs",
          formulaInputs,
          "id",
          transaction,
        );
        console.info("Finished adding formula inputs");
        await bulkUpsert(
          queryInterface,
          "DataSourceEmissionsFactor",
          dataSourceEmissionsFactors,
          "formulainput_id", // TODO handle multiple primary keys
          transaction,
        );
        console.info("Done, have a nice day ✨");
      }
    });
    /**
     * Add seed commands here.
     *
     * Example:
     * await queryInterface.bulkInsert('People', [{
     *   name: 'John Doe',
     *   isBetaMember: false
     * }], {});
     */
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add commands to revert seed here.
     *
     * Example:
     * await queryInterface.bulkDelete('People', null, {});
     */
  },
};
