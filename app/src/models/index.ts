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

// Reference-counted so concurrent callers sharing this singleton (e.g. Jest
// test files in the same worker, which reuse this module's state) can't have
// one caller's close() tear down the connection while another still needs it.
let refCount = 0;

async function initialize() {
  refCount++;

  if (db.initialized && db.sequelize) {
    return;
  }

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

  const closeConnection = sequelize.close.bind(sequelize);
  sequelize.close = async () => {
    refCount = Math.max(refCount - 1, 0);
    if (refCount > 0) {
      return;
    }
    db.initialized = false;
    db.sequelize = null;
    await closeConnection();
  };

  db.models = models.initModels(sequelize);

  db.sequelize = sequelize;
  db.initialized = true;
}
