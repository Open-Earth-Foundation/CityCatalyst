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
  const sequelize = process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: "postgres",
        logging: false,
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        },
      })
    : new Sequelize({
        host: process.env.DATABASE_HOST,
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        dialect: "postgres",
        dialectModule: pg,
        logging: false,
        dialectOptions: {
          ssl: process.env.DATABASE_SSL === "true" ? { require: true, rejectUnauthorized: false } : false,
        },
      });

  db.models = models.initModels(sequelize);

  db.sequelize = sequelize;
  db.initialized = true;
}