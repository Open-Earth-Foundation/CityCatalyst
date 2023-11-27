# Importers

These directories contain the import scripts to populate the `ccglobal` database.

- [sqlalchemy](https://www.sqlalchemy.org/) is used to connect to the database
- [Black](https://black.readthedocs.io/en/stable/) formatting is used for all scripts to ensure consistency
- [UUID version 3](https://docs.python.org/3/library/uuid.html#uuid.uuid3) is used to generate each `id` to ensure repeatability
    - The `id` is generated on unique column(s)
    - If necessary, generate the UUID from a concatenation of multiple columns
- Be mindful of memory useage
    - generators and [generator expressions](https://docs.python.org/3/reference/expressions.html#grammar-token-python-grammar-generator_expression) are great for looping over records in a dataset and help reduce memory useage

## Directory Tree

```sh
.
├── README.md          # top level documentation
├── climatetrace       # import scripts for ClimateTRACE emissions
├── crosswalk          # import scripts for CrossWalk Labs emissions
├── datasource_seeder  # seeder files for datasource catalogue
├── edgar              # import scripts for Edgar emissions
└── osm                # import script for Open Street Map boundaries
```