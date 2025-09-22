"use strict";

const sql_up = `
    CREATE TABLE "ActionPlan" (
        id UUID default gen_random_uuid() not null PRIMARY KEY,
        action_id TEXT NOT NULL,
        inventory_id UUID NOT NULL
            constraint ActionPlan_Inventory_inventory_id_fk references "Inventory" ON DELETE CASCADE,
        hi_action_ranking_id UUID NULL
            constraint ActionPlan_HIRanking_ranking_id_fk references "HighImpactActionRanking" ON DELETE SET NULL,
        city_locode TEXT NOT NULL,
        action_name TEXT NOT NULL,
        language TEXT NOT NULL,
        plan_data JSONB NOT NULL,
        created_by UUID NULL
            constraint ActionPlan_User_created_by_fk references "User" ON DELETE SET NULL,
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_action_plan_inventory_id ON "ActionPlan" (inventory_id);
    CREATE INDEX idx_action_plan_action_id ON "ActionPlan" (action_id);
    CREATE INDEX idx_action_plan_city_locode ON "ActionPlan" (city_locode);
    CREATE INDEX idx_action_plan_language ON "ActionPlan" (language);
    CREATE INDEX idx_action_plan_created_by ON "ActionPlan" (created_by);
    
    -- Add unique constraint to prevent duplicate plans for same action/inventory/language
    CREATE UNIQUE INDEX idx_action_plan_unique ON "ActionPlan" (action_id, inventory_id, language);
`;

const sql_down = `
    DROP INDEX IF EXISTS idx_action_plan_inventory_id;
    DROP INDEX IF EXISTS idx_action_plan_action_id;
    DROP INDEX IF EXISTS idx_action_plan_city_locode;
    DROP INDEX IF EXISTS idx_action_plan_language;
    DROP INDEX IF EXISTS idx_action_plan_created_by;
    DROP INDEX IF EXISTS idx_action_plan_unique;
    DROP TABLE IF EXISTS "ActionPlan";
`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
