"use strict";

const sql_up = `
    ALTER TABLE "Inventory" DROP CONSTRAINT "FK_Inventory.city_id";

    ALTER TABLE "Inventory"
        ADD CONSTRAINT "FK_Inventory.city_id"
            FOREIGN KEY (city_id)
                REFERENCES "City" (city_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE;
`;

const sql_down = `
    ALTER TABLE "Inventory" DROP CONSTRAINT "FK_Inventory.city_id";

    ALTER TABLE "Inventory"
        ADD CONSTRAINT "FK_Inventory.city_id"
            FOREIGN KEY (city_id)
                REFERENCES "City" (city_id)
    ;
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
