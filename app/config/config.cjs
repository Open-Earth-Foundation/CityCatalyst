console.log(
  " process.env.DATABASE_USER,",
  JSON.stringify(process.env.DATABASE_USER),
); // TODO NINA

module.exports = {
  development: {
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD || null,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    dialect: "postgres",
    logging: false,
  },
  test: {
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD || null,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    dialect: "postgres",
    logging: false,
  },
  production: {
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD || null,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    dialect: "postgres",
    logging: false,
  },
};
