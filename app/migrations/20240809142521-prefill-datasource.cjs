"use strict";

const toJson = (text) => ({ user: text });

const getRowsWithUserData = async (queryInterface) => {
  const rowsWithUserData = await queryInterface.sequelize.query(`select * from "DataSource" where source_type = 'user'`);
  return rowsWithUserData[0];
};

function getFormattedRows(rowsWithUserData) {
  return rowsWithUserData.map(
    ({
       transformation_description,
       dataset_description,
       methodology_description,
       dataset_name,
       ...row
     }
    ) => {
      return {
        ...row,
        transformation_description: toJson(transformation_description),
        dataset_description: toJson(dataset_description),
        methodology_description: toJson(methodology_description),
        dataset_name: toJson(dataset_name)
      };
    }
  );
}

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const rowsWithUserData = await getRowsWithUserData(queryInterface);
    const formattedRows = getFormattedRows(rowsWithUserData);
    return queryInterface.sequelize.transaction(async (transaction) => {
      for (const row of formattedRows) {
        await queryInterface.insert(null, "DataSourceI18n", row, { transaction });
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`TRUNCATE TABLE "DataSourceI18n";`);
  }
};
