"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add CASCADE constraints for CityUser table
    await queryInterface.sequelize.query(`
      -- Drop existing constraints if they exist
      ALTER TABLE "CityUser" DROP CONSTRAINT IF EXISTS "CityUser_user_id_fkey";
      ALTER TABLE "CityUser" DROP CONSTRAINT IF EXISTS "CityUser_city_id_fkey";
      
      -- Add CASCADE constraints
      ALTER TABLE "CityUser" 
      ADD CONSTRAINT "CityUser_user_id_fkey" 
      FOREIGN KEY (user_id) REFERENCES "User" (user_id) 
      ON DELETE CASCADE ON UPDATE CASCADE;
      
      ALTER TABLE "CityUser"
      ADD CONSTRAINT "CityUser_city_id_fkey"
      FOREIGN KEY (city_id) REFERENCES "City" (city_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);

    // 2. Add CASCADE constraints for ProjectInvite table
    await queryInterface.sequelize.query(`
      -- Drop existing constraints if they exist
      ALTER TABLE "ProjectInvite" DROP CONSTRAINT IF EXISTS "ProjectInvite_project_id_fkey";
      ALTER TABLE "ProjectInvite" DROP CONSTRAINT IF EXISTS "ProjectInvite_user_id_fkey";
      
      -- Add CASCADE constraints
      ALTER TABLE "ProjectInvite"
      ADD CONSTRAINT "ProjectInvite_project_id_fkey"
      FOREIGN KEY (project_id) REFERENCES "Project" (project_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
      
      ALTER TABLE "ProjectInvite"
      ADD CONSTRAINT "ProjectInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id)
      ON DELETE SET NULL ON UPDATE CASCADE;
    `);

    // 3. Add CASCADE constraints for CityInvite table
    await queryInterface.sequelize.query(`
      -- Drop existing constraints if they exist
      ALTER TABLE "CityInvite" DROP CONSTRAINT IF EXISTS "CityInvite_user_id_fkey";
      ALTER TABLE "CityInvite" DROP CONSTRAINT IF EXISTS "CityInvite_inviting_user_id_fkey";
      
      -- Add CASCADE constraints
      ALTER TABLE "CityInvite"
      ADD CONSTRAINT "CityInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id)
      ON DELETE SET NULL ON UPDATE CASCADE;
      
      ALTER TABLE "CityInvite"
      ADD CONSTRAINT "CityInvite_inviting_user_id_fkey"
      FOREIGN KEY (inviting_user_id) REFERENCES "User" (user_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);

    // 4. Add CASCADE constraints for UserFile table
    await queryInterface.sequelize.query(`
      -- Drop existing constraints if they exist
      ALTER TABLE "UserFile" DROP CONSTRAINT IF EXISTS "UserFile_user_id_fkey";
      ALTER TABLE "UserFile" DROP CONSTRAINT IF EXISTS "UserFile_city_id_fkey";
      
      -- Add CASCADE constraints
      ALTER TABLE "UserFile"
      ADD CONSTRAINT "UserFile_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
      
      ALTER TABLE "UserFile"
      ADD CONSTRAINT "UserFile_city_id_fkey"
      FOREIGN KEY (city_id) REFERENCES "City" (city_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);

    // 5. Add CASCADE constraints for OrganizationInvite table
    await queryInterface.sequelize.query(`
      -- Drop existing constraints if they exist
      ALTER TABLE "OrganizationInvite" DROP CONSTRAINT IF EXISTS "OrganizationInvite_user_id_fkey";
      ALTER TABLE "OrganizationInvite" DROP CONSTRAINT IF EXISTS "OrganizationInvite_organization_id_fkey";
      
      -- Add CASCADE constraints
      ALTER TABLE "OrganizationInvite"
      ADD CONSTRAINT "OrganizationInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id)
      ON DELETE SET NULL ON UPDATE CASCADE;
      
      ALTER TABLE "OrganizationInvite"
      ADD CONSTRAINT "OrganizationInvite_organization_id_fkey"
      FOREIGN KEY (organization_id) REFERENCES "Organization" (organization_id)
      ON DELETE CASCADE ON UPDATE CASCADE;
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert all CASCADE constraints back to NO ACTION
    await queryInterface.sequelize.query(`
      -- Revert CityUser constraints
      ALTER TABLE "CityUser" DROP CONSTRAINT IF EXISTS "CityUser_user_id_fkey";
      ALTER TABLE "CityUser" DROP CONSTRAINT IF EXISTS "CityUser_city_id_fkey";
      
      ALTER TABLE "CityUser" 
      ADD CONSTRAINT "CityUser_user_id_fkey" 
      FOREIGN KEY (user_id) REFERENCES "User" (user_id);
      
      ALTER TABLE "CityUser"
      ADD CONSTRAINT "CityUser_city_id_fkey"
      FOREIGN KEY (city_id) REFERENCES "City" (city_id);
    `);

    await queryInterface.sequelize.query(`
      -- Revert ProjectInvite constraints
      ALTER TABLE "ProjectInvite" DROP CONSTRAINT IF EXISTS "ProjectInvite_project_id_fkey";
      ALTER TABLE "ProjectInvite" DROP CONSTRAINT IF EXISTS "ProjectInvite_user_id_fkey";
      
      ALTER TABLE "ProjectInvite"
      ADD CONSTRAINT "ProjectInvite_project_id_fkey"
      FOREIGN KEY (project_id) REFERENCES "Project" (project_id);
      
      ALTER TABLE "ProjectInvite"
      ADD CONSTRAINT "ProjectInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id);
    `);

    await queryInterface.sequelize.query(`
      -- Revert CityInvite constraints
      ALTER TABLE "CityInvite" DROP CONSTRAINT IF EXISTS "CityInvite_user_id_fkey";
      ALTER TABLE "CityInvite" DROP CONSTRAINT IF EXISTS "CityInvite_inviting_user_id_fkey";
      
      ALTER TABLE "CityInvite"
      ADD CONSTRAINT "CityInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id);
      
      ALTER TABLE "CityInvite"
      ADD CONSTRAINT "CityInvite_inviting_user_id_fkey"
      FOREIGN KEY (inviting_user_id) REFERENCES "User" (user_id);
    `);

    await queryInterface.sequelize.query(`
      -- Revert UserFile constraints
      ALTER TABLE "UserFile" DROP CONSTRAINT IF EXISTS "UserFile_user_id_fkey";
      ALTER TABLE "UserFile" DROP CONSTRAINT IF EXISTS "UserFile_city_id_fkey";
      
      ALTER TABLE "UserFile"
      ADD CONSTRAINT "UserFile_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id);
      
      ALTER TABLE "UserFile"
      ADD CONSTRAINT "UserFile_city_id_fkey"
      FOREIGN KEY (city_id) REFERENCES "City" (city_id);
    `);

    await queryInterface.sequelize.query(`
      -- Revert OrganizationInvite constraints
      ALTER TABLE "OrganizationInvite" DROP CONSTRAINT IF EXISTS "OrganizationInvite_user_id_fkey";
      ALTER TABLE "OrganizationInvite" DROP CONSTRAINT IF EXISTS "OrganizationInvite_organization_id_fkey";
      
      ALTER TABLE "OrganizationInvite"
      ADD CONSTRAINT "OrganizationInvite_user_id_fkey"
      FOREIGN KEY (user_id) REFERENCES "User" (user_id);
      
      ALTER TABLE "OrganizationInvite"
      ADD CONSTRAINT "OrganizationInvite_organization_id_fkey"
      FOREIGN KEY (organization_id) REFERENCES "Organization" (organization_id);
    `);
  },
};
