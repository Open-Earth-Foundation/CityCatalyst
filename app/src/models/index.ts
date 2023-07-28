import getConfig from 'next/config';
import { Sequelize } from 'sequelize';

const { serverRuntimeConfig } = getConfig();

export const db: {
  initialized: boolean,
  initialize: () => Promise<void>,
  sequelize?: Sequelize | null
} = {
  initialized: false,
  sequelize: null,
  initialize,
};

async function initialize() {
  const config = serverRuntimeConfig.dbConfig;

  const sequelize = new Sequelize({
    host: config.host,
    database: config.name,
    dialect: 'postgres',
    username: config.username,
    password: config.password,
  });

  db.sequelize = sequelize;
  db.initialized = true;
}

