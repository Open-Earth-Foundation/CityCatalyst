"use strict";

const sql_up = `create table if not exists public."DataSourceI18n"
(
    datasource_id uuid not null constraint "DataSourceI18n_pkey" primary key,
    datasource_name            text,
    "URL"                      text,
    dataset_description        jsonb,
    access_type                text,
    geographical_location      text,
    latest_accounting_year     integer,
    frequency_of_update        text,
    spatial_resolution         text,
    language                   text,
    accessibility              text,
    data_quality               text,
    notes                      text,
    units                      text,
    methodology_url            text,
    publisher_id uuid constraint "FK_DataSourceI18n.publisher_id" references public."Publisher" on update cascade on delete set null,
    retrieval_method           text,
    api_endpoint               text,
    created                    timestamp,
    last_updated               timestamp,
    source_type                text,
    sector_id uuid constraint "FK_DataSourceI18n.sector_id" references public."Sector" on update cascade on delete set null,
    subsector_id uuid constraint "FK_DataSourceI18n.subsector_id" references public."SubSector" on update cascade on delete set null,
    subcategory_id uuid constraint "FK_DataSourceI18n.subcategory_id" references public."SubCategory" on update cascade on delete set null,
    start_year                 integer,
    end_year                   integer,
    methodology_description    jsonb,
    transformation_description jsonb,
    dataset_name               jsonb
);
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
