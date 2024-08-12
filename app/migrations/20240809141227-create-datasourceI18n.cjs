"use strict";

const sql_up = `create table if not exists public."DataSourceI18n"
(
    datasource_id uuid not null constraint "DataSourceI18n_pkey" primary key,
    datasource_name            varchar(255),
    "URL"                      varchar(255),
    dataset_description        jsonb,
    access_type                varchar(255),
    geographical_location      varchar(255),
    latest_accounting_year     integer,
    frequency_of_update        varchar(255),
    spatial_resolution         varchar(255),
    language                   varchar(255),
    accessibility              varchar(255),
    data_quality               varchar(255),
    notes                      text,
    units                      varchar(255),
    methodology_url            varchar(255),
    publisher_id uuid constraint "FK_DataSourceI18n.publisher_id" references public."Publisher" on update cascade on delete set null,
    retrieval_method           varchar(255),
    api_endpoint               varchar(255),
    created                    timestamp,
    last_updated               timestamp,
    source_type                varchar(255),
    sector_id uuid constraint "FK_DataSourceI18n.sector_id" references public."Sector" on update cascade on delete cascade,
    subsector_id uuid constraint "FK_DataSourceI18n.subsector_id" references public."SubSector" on update cascade on delete cascade,
    subcategory_id uuid constraint "FK_DataSourceI18n.subcategory_id" references public."SubCategory" on update cascade on delete cascade,
    start_year                 integer,
    end_year                   integer,
    methodology_description    jsonb,
    transformation_description jsonb,
    dataset_name               jsonb
);

alter table public."DataSourceI18n"
    owner to citycatalyst;

`;
const sql_down = `drop table if exists public."DataSourceI18n";`;
/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_up);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(sql_down);
  },
};
