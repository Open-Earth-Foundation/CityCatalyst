"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Fix CityUser table - make userId and cityId required
    await queryInterface.sequelize.query(`
      -- First, remove any orphaned records
      DELETE FROM "CityUser" 
      WHERE user_id IS NULL OR city_id IS NULL;
      
      -- Make columns NOT NULL
      ALTER TABLE "CityUser" 
      ALTER COLUMN user_id SET NOT NULL;
      
      ALTER TABLE "CityUser" 
      ALTER COLUMN city_id SET NOT NULL;
    `);

    // 2. Fix ProjectInvite table - make projectId required
    await queryInterface.sequelize.query(`
      -- First, remove any orphaned records
      DELETE FROM "ProjectInvite" 
      WHERE project_id IS NULL;
      
      -- Make projectId NOT NULL
      ALTER TABLE "ProjectInvite" 
      ALTER COLUMN project_id SET NOT NULL;
    `);

    // 3. Fix CityInvite table - make cityId required
    await queryInterface.sequelize.query(`
      -- First, remove any orphaned records
      DELETE FROM "CityInvite" 
      WHERE city_id IS NULL;
      
      -- Make cityId NOT NULL
      ALTER TABLE "CityInvite" 
      ALTER COLUMN city_id SET NOT NULL;
    `);

    // 4. Fix UserFile table - make userId and cityId required
    await queryInterface.sequelize.query(`
      -- First, remove any orphaned records
      DELETE FROM "UserFile" 
      WHERE user_id IS NULL OR city_id IS NULL;
      
      -- Make columns NOT NULL
      ALTER TABLE "UserFile" 
      ALTER COLUMN user_id SET NOT NULL;
      
      ALTER TABLE "UserFile" 
      ALTER COLUMN city_id SET NOT NULL;
    `);

    // 5. Fix OrganizationInvite table - make organizationId required
    await queryInterface.sequelize.query(`
      -- First, remove any orphaned records
      DELETE FROM "OrganizationInvite" 
      WHERE organization_id IS NULL;
      
      -- Make organizationId NOT NULL
      ALTER TABLE "OrganizationInvite" 
      ALTER COLUMN organization_id SET NOT NULL;
    `);

    // 6. Add unique constraints to prevent duplicate relationships
    await queryInterface.sequelize.query(`
      -- Add unique constraint for CityUser to prevent duplicate user-city relationships
      ALTER TABLE "CityUser" 
      ADD CONSTRAINT "CityUser_user_city_unique" 
      UNIQUE (user_id, city_id);
    `);
  },

  async down(queryInterface, Sequelize) {
    // Revert all changes
    await queryInterface.sequelize.query(`
      -- Remove unique constraints
      ALTER TABLE "CityUser" DROP CONSTRAINT IF EXISTS "CityUser_user_city_unique";
    `);

    await queryInterface.sequelize.query(`
      -- Make columns nullable again
      ALTER TABLE "CityUser" ALTER COLUMN user_id DROP NOT NULL;
      ALTER TABLE "CityUser" ALTER COLUMN city_id DROP NOT NULL;
      ALTER TABLE "ProjectInvite" ALTER COLUMN project_id DROP NOT NULL;
      ALTER TABLE "CityInvite" ALTER COLUMN city_id DROP NOT NULL;
      ALTER TABLE "UserFile" ALTER COLUMN user_id DROP NOT NULL;
      ALTER TABLE "UserFile" ALTER COLUMN city_id DROP NOT NULL;
      ALTER TABLE "OrganizationInvite" ALTER COLUMN organization_id DROP NOT NULL;
    `);
  },
};
