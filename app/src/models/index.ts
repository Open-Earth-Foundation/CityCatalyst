import { Sequelize } from 'sequelize';

export const db: {
  initialized: boolean,
  initialize: () => Promise<void>,
  sequelize?: Sequelize | null
} = {
  initialized: false,
  sequelize: null,
  initialize,
};

const config = {
  host: process.env.DATABASE_HOST,
  name: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
}

async function initialize() {

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
