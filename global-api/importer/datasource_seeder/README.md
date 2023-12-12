# Datasource Catalogue

Importing the EDGAR data

1. Save the database URI to an environment variable named `DB_URI`

2. Run `./import_seeders.sh ` to import data

See the [`/global-api/README.md`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/develop/global-api) for instructions on setting up a local instance of the database

Use the following to to create an envionrment variable in `zsh`:

```sh
export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
```

Add it to the `~/.zshrc` file if you want the variable to persist.

### Directory tree

```sh
├── README.md               # top level readme
├── climatetrace_seeder.py  # seeder for climatetrace datasources
├── edgar_seeder.py         # seeder for edgar datasources
├── import_seeders.sh       # shell script to import seeders
└── utils.py                # utility scripts used in  .py files
```