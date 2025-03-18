module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_OrganizationInvite_role" ADD VALUE IF NOT EXISTS 'org_admin';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert by recreating the ENUM without 'org_admin'
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.changeColumn(
        "OrganizationInvite",
        "role",
        {
          type: Sequelize.ENUM("admin", "collaborator"),
        },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE TYPE "enum_OrganizationInvite_role_new" AS ENUM ('admin', 'collaborator');
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE "OrganizationInvite" ALTER COLUMN "role" TYPE "enum_OrganizationInvite_role_new"
        USING role::text::"enum_OrganizationInvite_role_new";
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DROP TYPE "enum_OrganizationInvite_role";
      `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TYPE "enum_OrganizationInvite_role_new" RENAME TO "enum_OrganizationInvite_role";
      `,
        { transaction },
      );
    });
  },
};
