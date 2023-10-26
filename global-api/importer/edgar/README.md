# EDGAR  importer scripts

These scripts are used to populate the database with EDGAR data.

Make sure to run `python gridcelledgar_importer.py --database-uri $DB_URI` first, since the other scripts rely on the gridcell table being populated.

```bash
python gridcelledgar_importer.py --database-uri $DB_URI
python citycelloverlapedgar_importer.py --database-uri $DB_URI
python gridcellemissionsedgar_importer.py --database-uri $DB_URI
```