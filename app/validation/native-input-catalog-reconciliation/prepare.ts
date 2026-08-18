import pg from "pg";

const { Client } = pg;

const databaseName = process.env.DATABASE_NAME;
const readerPassword = process.env.RECONCILIATION_READER_PASSWORD;
const writerPassword = process.env.RECONCILIATION_WRITER_PASSWORD;

if (!databaseName || !readerPassword || !writerPassword) {
  throw new Error(
    "DATABASE_NAME, RECONCILIATION_READER_PASSWORD, and RECONCILIATION_WRITER_PASSWORD are required",
  );
}

const client = new Client({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: databaseName,
});

const ids = {
  user: "00000000-0000-0000-0000-000000000001",
  city: "00000000-0000-0000-0000-000000000002",
  inventory: "00000000-0000-0000-0000-000000000003",
  fileOne: "00000000-0000-0000-0000-000000000004",
  fileTwo: "00000000-0000-0000-0000-000000000005",
  catalogOne: "00000000-0000-0000-0000-000000000006",
  catalogDangling: "00000000-0000-0000-0000-000000000007",
};

await client.connect();

try {
  await client.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'validation_reader') THEN
         CREATE ROLE validation_reader LOGIN PASSWORD '${readerPassword.replaceAll("'", "''")}';
       ELSE
         ALTER ROLE validation_reader LOGIN PASSWORD '${readerPassword.replaceAll("'", "''")}';
       END IF;
     END
     $$;`,
  );
  await client.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'validation_writer') THEN
         CREATE ROLE validation_writer LOGIN PASSWORD '${writerPassword.replaceAll("'", "''")}';
       ELSE
         ALTER ROLE validation_writer LOGIN PASSWORD '${writerPassword.replaceAll("'", "''")}';
       END IF;
     END
     $$;`,
  );
  await client.query(
    `GRANT CONNECT ON DATABASE "${databaseName.replaceAll('"', '""')}" TO validation_reader, validation_writer;
     GRANT USAGE ON SCHEMA public TO validation_reader, validation_writer;
     GRANT SELECT ON ALL TABLES IN SCHEMA public TO validation_reader, validation_writer;
     GRANT INSERT, UPDATE ON TABLE "NativeInputCatalog" TO validation_writer;
     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO validation_reader, validation_writer;`,
  );

  const timestamp = "2026-01-01T00:00:00.000Z";
  await client.query(
    `INSERT INTO "User" (user_id, name, email, created, last_updated)
     VALUES ($1, 'Validation User', 'validation@example.invalid', $2, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [ids.user, timestamp],
  );
  await client.query(
    `INSERT INTO "City" (city_id, locode, name, created, last_updated)
     VALUES ($1, 'VAL-XX', 'Validation City', $2, $2)
     ON CONFLICT (city_id) DO NOTHING`,
    [ids.city, timestamp],
  );
  await client.query(
    `INSERT INTO "Inventory" (inventory_id, inventory_name, year, city_id, created, last_updated)
     VALUES ($1, 'Validation Inventory', 2025, $2, $3, $3)
     ON CONFLICT (inventory_id) DO NOTHING`,
    [ids.inventory, ids.city, timestamp],
  );
  await client.query(
    `INSERT INTO "ImportedInventoryFile"
       (id, user_id, city_id, inventory_id, file_name, file_type, file_size,
        original_file_name, import_status, created, last_updated)
     VALUES
       ($1, $3, $4, $5, 'validation-one.csv', 'csv', 10, 'validation-one.csv', 'uploaded', $6, $6),
       ($2, $3, $4, $5, 'validation-two.csv', 'csv', 10, 'validation-two.csv', 'uploaded', $6, $6)
     ON CONFLICT (id) DO NOTHING`,
    [ids.fileOne, ids.fileTwo, ids.user, ids.city, ids.inventory, timestamp],
  );
  await client.query(
    `INSERT INTO "NativeInputCatalog"
       (id, kind, owning_module, source_type, source_id, user_id, inventory_id,
        city_id, availability, labels, created, last_updated)
     VALUES
       ($1, 'inventory_source_file', 'ghgi', 'imported_inventory_file', $3, $4, $5, $6, 'active', '{}'::jsonb, $7, $7),
       ($2, 'inventory_source_file', 'ghgi', 'imported_inventory_file', 'missing-file', $4, $5, $6, 'active', '{}'::jsonb, $8, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      ids.catalogOne,
      ids.catalogDangling,
      ids.fileOne,
      ids.user,
      ids.inventory,
      ids.city,
      timestamp,
      "2026-01-03T00:00:00.000Z",
    ],
  );
} finally {
  await client.end();
}

console.log(
  "Prepared isolated reconciliation fixtures, read-only role, and catalog-only writer role.",
);
