import { Sequelize } from "sequelize";
import pg from "pg";
import * as models from "./init-models";

export const db: {
  initialized: boolean;
  initialize: () => Promise<void>;
  sequelize?: Sequelize | null;
  models: Omit<typeof models, "initModels">;
} = {
  initialized: false,
  sequelize: null,
  initialize,
  models,
};

async function initialize() {
  const useSSL = process.env.DATABASE_USE_SSL === "true";
  const sequelize = new Sequelize({
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    dialect: "postgres",
    dialectModule: pg,
    logging: false,
    dialectOptions: useSSL
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  });

  db.models = models.initModels(sequelize);

  db.sequelize = sequelize;
  db.initialized = true;
}
