"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { randomUUID } = require("node:crypto");

async function parseFile(filename) {
  const records = [];
  const parser = fs
    .createReadStream(`${__dirname}/data/${filename}.csv`)
    .pipe(parse({ delimiter: ",", columns: true }));

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    let climateTraceSources = await parseFile("climatetrace_sources");
    const climateTracePublisherName = climateTraceSources[0].publisher_id;
    const climateTracePublisherId = randomUUID();
    climateTraceSources = climateTraceSources.map((source) => {
      source.publisher_id = climateTracePublisherId;
      return source;
    });
    let edgarSources = await parseFile("edgar_sources");
    const edgarPublisherName = edgarSources[0].publisher_id;
    const edgarPublisherId = randomUUID();
    edgarSources = edgarSources.map((source) => {
      source.publisher_id = edgarPublisherId;
      return source;
    });
    const dataSources = climateTraceSources.concat(edgarSources);
    const publishers = [
      {
        publisher_id: climateTracePublisherId,
        name: climateTracePublisherName,
        URL: "https://climatetrace.org/",
      },
      {
        publisher_id: edgarPublisherId,
        name: edgarPublisherName,
        URL: "https://joint-research-centre.ec.europa.eu/index_en",
      },
    ];

    // TODO remove column gpc_reference_number, find subsector with it and assign the subsector's ID to the data source

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert("Publisher", publishers, {
        transaction,
        updateOnDuplicate: ["publisher_id"],
      });
      await queryInterface.bulkInsert("DataSource", dataSources, {
        transaction,
        updateOnDuplicate: ["datasource_id"],
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Publisher", null);
    await queryInterface.bulkDelete("DataSource", null);
  },
};
