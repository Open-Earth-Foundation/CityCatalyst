"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // CC-710: duplicate OrganizationAdmin rows for the same (organization_id, user_id)
    // pair caused organizations to appear more than once in the sidebar dropdown.
    // Keep the oldest row per pair and delete the rest before enforcing uniqueness.
    await queryInterface.sequelize.query(`
      DELETE FROM "OrganizationAdmin" oa
      USING (
        SELECT organization_admin_id,
               ROW_NUMBER() OVER (
                 PARTITION BY organization_id, user_id
                 ORDER BY created ASC, organization_admin_id ASC
               ) AS rn
        FROM "OrganizationAdmin"
      ) ranked
      WHERE oa.organization_admin_id = ranked.organization_admin_id
        AND ranked.rn > 1;
    `);

    await queryInterface.addIndex("OrganizationAdmin", {
      fields: ["organization_id", "user_id"],
      unique: true,
      name: "organization_admin_organization_id_user_id_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "OrganizationAdmin",
      "organization_admin_organization_id_user_id_unique",
    );
  },
};
