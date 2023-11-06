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

    // remove column gpc_reference_number, find subsector/ subcategory with it
    // and assign the ID to the data source
    const subsectors = await queryInterface.select(null, "SubSector");
    const subcategories = await queryInterface.select(null, "SubCategory");
    const sourcesWithIds = dataSources.map((source) => {
      const referenceNumber = source.gpc_reference_number;
      delete source.gpc_reference_number;

      if (referenceNumber != null) {
        const subcategory = subcategories.find(
          (cat) => cat.reference_number === referenceNumber,
        );
        if (subcategory) {
          console.log("Found subcategory for source", source.datasource_id, "with refno", referenceNumber);
          source.subcategory_id = subcategory.subcategory_id;
        } else {
          console.log("Found subsector for source", source.datasource_id, "with refno", referenceNumber);
          const subsector = subsectors.find(
            (sec) => sec.reference_number === referenceNumber,
          );
          if (subsector) {
            source.subsector_id = subsector.subsector_id;
          }
        }
      }

      return source;
    });

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert("Publisher", publishers, {
        transaction,
        updateOnDuplicate: ["publisher_id"],
      });
      await queryInterface.bulkInsert("DataSource", dataSources, {
      await queryInterface.bulkInsert("DataSource", sourcesWithIds, {
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
