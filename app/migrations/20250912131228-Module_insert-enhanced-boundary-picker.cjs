"use strict";

const sql_up = `
    insert into "Module" (id, type, stage, name, description, tagline, author, url, logo) values
      ('def76a39-6650-4860-8755-e9153073d661', 'POC', 'assess-&-analyze', '{"en": "Enhanced Boundary Picker"}',
      '{"en": "Use Open Street Map to change your city boundary in case the default one from CityCatalyst does not match your city''s."}',
      '{"en": "Choose an alternative boundary for your city based on Open Street Map data."}',
      'Open Earth Foundation', 'https://cc-boundary-picker.replit.app/', 'https://cc-pocs.s3.us-east-2.amazonaws.com/logos/EnhancedBoundaryEditorIcon.png');
`;

const sql_down = `
    delete from "Module" where id = 'def76a39-6650-4860-8755-e9153073d661';
`;

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
