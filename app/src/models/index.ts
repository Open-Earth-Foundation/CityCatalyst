import { Sequelize } from 'sequelize';
import pg from 'pg';
import { initModels } from './init-models';

export const db: {
  initialized: boolean,
  initialize: () => Promise<void>,
  sequelize?: Sequelize | null,
  models: Record<string, any>,
} = {
  initialized: false,
  sequelize: null,
  initialize,
  models: {},
};

async function initialize() {
  const sequelize = new Sequelize({
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    dialect: 'postgres',
    dialectModule: pg,
  });

  db.models = initModels(sequelize);

  db.sequelize = sequelize;
  db.initialized = true;
}

