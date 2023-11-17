async function bulkUpsert(
  queryInterface,
  tableName,
  entries,
  idColumnName,
  transaction,
) {
  for (const entry of entries) {
    const id = entry[idColumnName];
    const item = await queryInterface.sequelize.query(
      `SELECT COUNT(*) FROM "${tableName}" WHERE "${idColumnName}" = '${id}';`,
      { transaction },
    );
    if (item[0][0].count === "0") {
      await queryInterface.bulkInsert(tableName, [entry], { transaction });
    } else {
      await queryInterface.bulkUpdate(
        tableName,
        entry,
        { [idColumnName]: entry[idColumnName] },
        {
          transaction,
        },
      );
    }
  }
}

module.exports = { bulkUpsert };
