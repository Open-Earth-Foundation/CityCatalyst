"use strict";

const { parse } = require("csv-parse");
const { bulkUpsert } = require("../seeders/util/util.cjs");

const csvData = `subcategory_id,subsector_id,subcategory_name,reference_number,scope_id,reportinglevel_id,created,last_updated
70d968e6-e9f7-37d8-94e1-8197e6f8332b,a8baeb06-0ab2-3215-a93e-2fcbe0e8f8a9,Emissions from waste generated outside the city boundary but treated biologically within the city boundary,III.2.3,503d4c60-3ff0-3d2b-9ea0-6fb5b0078031,7b8bd2cf-13a0-3a76-8d50-e08b4321703a,2023-10-10,2023-10-10
7582e783-dfd5-3caa-a06a-e10bcc75e089,0ed16605-c76a-3c07-892d-4383a7618943,Emissions from waste generated outside the city boundary but treated within the city boundary,III.3.3,503d4c60-3ff0-3d2b-9ea0-6fb5b0078031,7b8bd2cf-13a0-3a76-8d50-e08b4321703a,2023-10-10,2023-10-10
e7218f77-9896-30db-8a47-afb6b1d084a8,172d10c0-6b80-3173-902e-eca5c0af84c8,Emissions from waste generated outside the city boundary and disposed in landfills or open dumps within the city boundary,III.1.3,503d4c60-3ff0-3d2b-9ea0-6fb5b0078031,7b8bd2cf-13a0-3a76-8d50-e08b4321703a,2023-10-10,2023-10-10
af68e0d7-f55a-3827-aa53-369d98e210f8,c465e7a2-1634-337f-819a-2dfbe147927e,Emissions from wastewater generated outside the city boundary but treated within the city boundary,III.4.3,503d4c60-3ff0-3d2b-9ea0-6fb5b0078031,7b8bd2cf-13a0-3a76-8d50-e08b4321703a,2023-10-10,2023-10-10
`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE from "SubCategory" WHERE reference_number LIKE 'III.%.3'`,
    );
  },

  async down(queryInterface) {
    parse(
      csvData,
      { delimiter: ",", columns: true },
      async (csvError, subCategories) => {
        if (csvError) {
          throw csvError;
        }

        await bulkUpsert(
          queryInterface,
          "SubCategory",
          subCategories,
          "subcategory_id",
          transaction,
        );
      },
    );
  },
};
