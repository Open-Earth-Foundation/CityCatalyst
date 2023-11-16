# Update ClimateTRACE records

Use the following command to update locode records in the `asset` table.

```bash
 python climatetrace_update_records.py  --database_uri=postgresql://ccglobal:@localhost/ccglobal --file=./updated_locodes.csv &
```

Below are the steps to create `updated_locodes.csv`. If this file already exists, then you do not need to run these commands

1. Use nominatim to get osmid names from lat/lon pairs. Then use the `locode_to_osmid.csv` to lookup the locode. The output for pair will be saved as a csv file in `--dir`

```bash
python 1_match_locodes_with_nominatim.py  --database_uri=postgresql://ccglobal:@localhost/ccglobal --file=./locode_to_osmid.csv --dir=./tmp &
```

2. Once all the files generated, we will stitch them together and filter out records where the locode is null. The script below will create a file named `updated_locodes.csv`. This contains two columns: `id` and `locode`

```bash
 python 2_create_csv_file.py  --database_uri=postgresql://ccglobal:@localhost/ccglobal  --dir=./tmp &
```

3. Once the csv is created, we can use it to update records in the `asset` table.

```bash
 python climatetrace_update_records.py --database_uri=postgresql://ccglobal:@localhost/ccglobal --file=./updated_locodes.csv &
```