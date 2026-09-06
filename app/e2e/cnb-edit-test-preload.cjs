/**
 * Route the CC-732 browser fixture to an explicitly selected local test database.
 *
 * This is test setup, not production configuration or an authentication bypass.
 * Load with NODE_OPTIONS="--require=<absolute path to this file>" and set
 * CNB_EDIT_TEST_DB_PORT, DATABASE_HOST=127.0.0.1, DATABASE_NAME=cc732_..., and
 * the synthetic DATABASE_USER/DATABASE_PASSWORD before starting Next or seeds.
 * It writes no files and logs no credentials. Unexpected targets fail closed.
 */
const { Sequelize } = require("sequelize");

const testPort = Number(process.env.CNB_EDIT_TEST_DB_PORT);
const testDatabase = process.env.DATABASE_NAME;
if (
  !Number.isInteger(testPort) ||
  testPort < 1024 ||
  testPort > 65535 ||
  process.env.DATABASE_HOST !== "127.0.0.1" ||
  !/^cc732_[a-z0-9_]+$/.test(testDatabase || "")
) {
  throw new Error(
    "CC-732 fixtures require an explicit isolated local test database",
  );
}

Sequelize.addHook(
  "beforeInit",
  "cnb-edit-isolated-database",
  (config, options) => {
    config.port = testPort;
    options.port = testPort;
    const existing = options.hooks?.beforeConnect;
    const hooks = existing
      ? Array.isArray(existing)
        ? existing
        : [existing]
      : [];
    options.hooks = {
      ...options.hooks,
      beforeConnect: [
        ...hooks,
        (connection) => {
          if (
            options.dialect !== "postgres" ||
            connection.host !== "127.0.0.1" ||
            connection.database !== testDatabase ||
            Number(connection.port) !== testPort
          ) {
            throw new Error(
              "CC-732 fixtures may connect only to their local test database",
            );
          }
        },
      ],
    };
  },
);
