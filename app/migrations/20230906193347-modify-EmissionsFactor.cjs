'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      -- GPC reference number the EF corresponds to (ex. I.1.2)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "gpc_refno" varchar(255);

      -- chemical formula of the gas (ex. CH4)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "gas" varchar(255);

      -- (optional) region the EF is appliable for (ex. US-NY)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "region" varchar(255);

      -- (optional) time frame the EF is appliable for (ex. 2010)
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "time_frame" varchar(255);

      -- (optional) reference or citation for the EF
      ALTER TABLE "EmissionsFactor"
      ADD COLUMN "reference" varchar(255);
    `);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      -- (optional) reference or citation for the EF
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "reference" varchar(255);

      -- (optional) time frame the EF is appliable for (ex. 2010)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "time_frame" varchar(255);

      -- (optional) region the EF is appliable for (ex. US-NY)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "region" varchar(255);

      -- chemical formula of the gas (ex. CH4)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "gas" varchar(255);

      -- GPC reference number the EF corresponds to (ex. I.1.2)
      ALTER TABLE "EmissionsFactor"
      DROP COLUMN "gpc_refno" varchar(255);
    `);
  }
};
