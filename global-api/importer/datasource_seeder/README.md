# Datasource catalogue

This is a catalogue of datasources that are available for use by CityCatalyst.

- `datasource_seeder.csv` includes all the datasources. Add new ones at the end.
- `import_datasource_seeder.sql` imports the `datasource_seeder.csv` file into the database. It will update existing records and add new ones. You can run it like this:

```bash
psql -U ccglobal -d ccglobal -f import_datasource_seeder.sql
```
