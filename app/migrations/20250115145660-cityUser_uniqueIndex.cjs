"use strict";

const sql_up = `create index CityUser_city_id_index
    on "CityUser" (city_id);

create unique index CityUser_city_id_user_id_uindex
    on "CityUser" (city_id, user_id);

create index CityUser_user_id_index
    on "CityUser" (user_id);

`;

const sql_down = `drop index cityuser_city_id_index;

drop index cityuser_city_id_user_id_uindex;

drop index cityuser_user_id_index;

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
