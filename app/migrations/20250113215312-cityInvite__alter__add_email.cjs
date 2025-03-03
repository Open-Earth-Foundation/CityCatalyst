"use strict";

const sql_up = `alter table "CityInvite"
    add email varchar(255);

create index CityInvite_email_index
    on "CityInvite" (email);

create index CityInvite_inviting_user_id_index
    on "CityInvite" (inviting_user_id);

create index CityInvite_user_id_index
    on "CityInvite" (user_id);

create unique index CityInvite_city_id_user_id_email_uindex
    on "CityInvite" (city_id, user_id, email);

`;

const sql_down = `drop index cityinvite_email_index;

alter table "CityInvite"
    drop column email;

drop index cityinvite_inviting_user_id_index;

drop index cityinvite_user_id_index;

drop index  CityInvite_city_id_user_id_email_uindex
;
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
