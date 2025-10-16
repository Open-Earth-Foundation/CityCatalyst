const fs = require("node:fs");
const { parse } = require("csv-parse");

async function bulkUpsert(
  queryInterface,
  tableName,
  entries,
  idColumnName, // can be array or string
  transaction,
  debug = false,
  insertTimestampsOnCreate = false,
) {
  for (const entry of entries) {
    if (debug) {
      console.info("Upserting entry", entry);
    }

    let idColumns = [];
    if (typeof idColumnName === "string") {
      idColumns.push(idColumnName);
    } else if (Array.isArray(idColumnName)) {
      idColumns = idColumnName;
    } else {
      throw new Error(
        "bulkInsert: argument idColumnName must be a string or an array",
      );
    }

    const whereClause = idColumns
      .map((col) => `"${col}" = '${entry[col]}'`)
      .join(" AND ");
    const item = await queryInterface.sequelize.query(
      `SELECT COUNT(*) FROM "${tableName}" WHERE ${whereClause};`,
      { transaction },
    );
    if (item[0][0].count === "0") {
      let entryCopy = entry;
      if (insertTimestampsOnCreate) {
        entryCopy = { ...entry };
        entryCopy.created = new Date();
        entryCopy.last_updated = new Date();
      }
      await queryInterface.bulkInsert(tableName, [entryCopy], { transaction });
    } else {
      const whereClause = idColumns.reduce((acc, idColumn) => {
        acc[idColumn] = entry[idColumn];
        return acc;
      }, {});
      await queryInterface.bulkUpdate(tableName, entry, whereClause, {
        transaction,
      });
    }
  }
}

async function parseFile(folder, filename) {
  const records = [];
  const parser = fs
    .createReadStream(`${__dirname}/../../seed-data/${folder}/${filename}.csv`)
    .pipe(parse({ delimiter: ",", columns: true }));

  for await (const record of parser) {
    records.push(record);
  }

  return records;
}

async function parseJsonFile(folder, filename) {
  const filePath = `${__dirname}/../../seed-data/${folder}/${filename}.json`;
  const data = await fs.promises.readFile(filePath, "utf8");
  const records = JSON.parse(data);
  return Array.isArray(records) ? records : [records];
}

module.exports = { bulkUpsert, parseFile, parseJsonFile };
