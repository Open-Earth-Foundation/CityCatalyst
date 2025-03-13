"use strict";

const { v4 } = require("uuid");

const defaultOrgData = {
  organization_id: "5a84ebff-33ee-457e-ab52-512b5731978b",
  name: "cc_organization_default",
  contact_email: "johndoe@gmail.com",
  created: new Date(),
  last_updated: new Date(),
};

const defaultProjectData = {
  project_id: "ebe82f61-b51b-4015-90ef-8b94f86fb0b7",
  name: "cc_project_default",
  organization_id: defaultOrgData.organization_id,
  description: "Default project for cities created in City Catalyst",
  city_count_limit: 999999,
  created: new Date(),
  last_updated: new Date(),
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("Organization", [defaultOrgData]);

    await queryInterface.bulkInsert("Project", [defaultProjectData]);

    await queryInterface.bulkUpdate(
      "City",
      {
        project_id: defaultProjectData.project_id,
        last_updated: new Date(),
      },
      {
        project_id: null, // Assuming cities without projects have NULL project_id
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
      "City",
      {
        project_id: null,
        last_updated: new Date(),
      },
      {
        project_id: defaultProjectData.project_id,
      },
    );

    await queryInterface.bulkDelete("Project", {
      project_id: defaultProjectData.project_id,
    });

    await queryInterface.bulkDelete("Organization", {
      organization_id: defaultOrgData.organization_id,
    });
  },
};
