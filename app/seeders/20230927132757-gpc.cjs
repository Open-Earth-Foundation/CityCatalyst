"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");
const { bulkUpsert } = require("./util/util.cjs");

async function parseFile(filename) {
  const records = [];
  const parser = fs
    .createReadStream(
      `${__dirname}/../seed-data/gpc_seeder/data_processed/${filename}.csv`,
    )
    .pipe(parse({ delimiter: ",", columns: true }));

  for await (const record of parser) {
    // prevent errors because of empty UUIDs
    if (record.scope_id == "") {
      delete record.scope_id;
    }
    records.push(record);
  }

  return records;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const scopes = await parseFile("Scope");
    const reportingLevels = await parseFile("ReportingLevel");
    const sectors = await parseFile("Sector");
    const subSectors = await parseFile("SubSector");
    const subCategories = await parseFile("SubCategory");

    await queryInterface.sequelize.transaction(async (transaction) => {
      await bulkUpsert(
        queryInterface,
        "Scope",
        scopes,
        "scope_id",
        transaction,
      );
      await bulkUpsert(
        queryInterface,
        "ReportingLevel",
        reportingLevels,
        "reportinglevel_id",
        transaction,
      );
      await bulkUpsert(
        queryInterface,
        "Sector",
        sectors,
        "sector_id",
        transaction,
      );
      await bulkUpsert(
        queryInterface,
        "SubSector",
        subSectors,
        "subsector_id",
        transaction,
      );
      await bulkUpsert(
        queryInterface,
        "SubCategory",
        subCategories,
        "subcategory_id",
        transaction,
      );

      /* re-enable when updateOnDuplicate is fixed in sequelize
      await queryInterface.bulkInsert("Scope", scopes, {
        transaction,
        updateOnDuplicate: ["scope_id"],
      });
      await queryInterface.bulkInsert("ReportingLevel", reportingLevels, {
        transaction,
        updateOnDuplicate: ["reportinglevel_id"],
      });
      await queryInterface.bulkInsert("Sector", sectors, {
        transaction,
        updateOnDuplicate: ["sector_id"],
      });
      await queryInterface.bulkInsert("SubSector", subSectors, {
        transaction,
        updateOnDuplicate: ["subsector_id"],
      });
      await queryInterface.bulkInsert("SubCategory", subCategories, {
        transaction,
        updateOnDuplicate: ["subcategory_id"],
      });
      */
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete("SubCategory", null, { transaction });
      await queryInterface.bulkDelete("SubSector", null, { transaction });
      await queryInterface.bulkDelete("Sector", null, { transaction });
      await queryInterface.bulkDelete("ReportingLevel", null, { transaction });
      await queryInterface.bulkDelete("Scope", null, { transaction });
    });
  },
};
