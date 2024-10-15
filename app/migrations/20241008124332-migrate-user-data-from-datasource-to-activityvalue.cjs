"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue" av
      SET metadata = COALESCE(av.metadata, '{}'::jsonb) || jsonb_build_object(
        'sourceExplanation', dsi."notes",
        'dataQuality', dsi."data_quality"
      )
      FROM "DataSourceI18n" dsi
      WHERE av."datasource_id" = dsi."datasource_id"
        AND (dsi."notes" IS NOT NULL OR dsi."data_quality" IS NOT NULL);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE "ActivityValue" av
      SET metadata = av.metadata - 'sourceExplanation' - 'dataQuality'
      WHERE av.metadata ? 'sourceExplanation' OR av.metadata ? 'dataQuality';
    `);
  },
};
