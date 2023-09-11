'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      -- GPC reference number the EF corresponds to (ex. I.1.2)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "gpc_refno" varchar(20);

      -- chemical formula of the gas (ex. CH4)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "gas" varchar(20);

      -- (optional) region the EF is appliable for (ex. US-NY)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "region" varchar(10);

      -- (optional) time frame the EF is appliable for (ex. 2010)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "year" integer;

      -- (optional) reference or citation for the EF
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "reference" text;
    `);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      -- (optional) reference or citation for the EF
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "reference" text;

      -- (optional) time frame the EF is appliable for (ex. 2010)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "year" integer;

      -- (optional) region the EF is appliable for (ex. US-NY)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "region" varchar(10);

      -- chemical formula of the gas (ex. CH4)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "gas" varchar(20);

      -- GPC reference number the EF corresponds to (ex. I.1.2)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "gpc_refno" varchar(20);
    `);
  }
};
