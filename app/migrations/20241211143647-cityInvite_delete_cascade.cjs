"use strict";

const sql_up = `
    alter table "CityInvite"
    drop constraint "CityInvite_city_id_fkey";

    ALTER TABLE "CityInvite"
        ADD CONSTRAINT "CityInvite_city_id_fkey"
            FOREIGN KEY (city_id)
                REFERENCES "City" (city_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE;
`;

const sql_down = `
    ALTER TABLE "CityInvite" DROP CONSTRAINT "CityInvite_city_id_fkey";

    ALTER TABLE "CityInvite"
        ADD CONSTRAINT "CityInvite_city_id_fkey"
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
