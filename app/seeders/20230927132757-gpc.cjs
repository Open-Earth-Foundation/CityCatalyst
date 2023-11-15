"use strict";

const fs = require("node:fs");
const { parse } = require("csv-parse");

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
      for (const scope of scopes) {
        await queryInterface.upsert(
          "Scope",
          scope,
          scope,
          { scopeId: scope.scopeId },
          { transaction, model: queryInterface.sequelize.models.Scope },
        );
      }
      for (const reportingLevel of reportingLevels) {
        await queryInterface.upsert(
          "ReportingLevel",
          reportingLevel,
          reportingLevel,
          { reportinglevelId: reportingLevel.reportinglevelId },
          {
            transaction,
            model: queryInterface.sequelize.models.ReportingLevel,
          },
        );
      }
      for (const sector of sectors) {
        await queryInterface.upsert(
          "Sector",
          sector,
          sector,
          { sectorId: sector.sectorId },
          { transaction, model: queryInterface.sequelize.models.Sector },
        );
      }
      for (const subSector of subSectors) {
        await queryInterface.upsert(
          "SubSector",
          subSector,
          subSector,
          { subsectorId: subSector.subsectorId },
          { transaction, model: queryInterface.sequelize.models.SubSector },
        );
      }
      for (const subCategory of subCategories) {
        await queryInterface.upsert(
          "SubCategory",
          subCategory,
          subCategory,
          { subcategoryId: subCategory.subcategoryId },
          {
            transaction,
            model: queryInterface.sequelize.models.SubCategory,
          },
        );
      }

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
