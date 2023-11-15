# Update ClimateTRACE records

These scripts are used to update locodes for cliamteTRACE assets. Once the csv file `climatetrace_update_locodes.csv` is created, the records can updated with the following script:

```bash
 python climatetrace_update_records.py  --database_uri=postgresql://ccglobal:@localhost/ccglobal --file=.climatetrace_update_locodes.csv
```

Here are the steps to create `climatetrace_update_locodes.csv`

1. Use nominatim to get city names from lat/lon pairs. Then use OpenClimate to get the locode. The output for pair will be saved as a csv file in `--dir`

```bash
python 1_match_locodes_with_nominatim.py --database_uri=postgresql://ccglobal:@localhost/ccglobal --dir=./tmp
```

2. Once all the files generated, we will stitch them together and filter out records where the locode is null. The script below will create a file named `climatetrace_update_locodes.csv`. This contains two columns: `id` and `locode`

```bash
python 2_create_csv_files.py --database_uri=postgresql://ccglobal:@localhost/ccglobal --dir=./tmp
```

3. Once the csv is created, we can use it to update records in the `asset` table.

```bash
 python climatetrace_update_records.py  --database_uri=postgresql://ccglobal:@localhost/ccglobal --file=./climatetrace_update_locodes.csv
```