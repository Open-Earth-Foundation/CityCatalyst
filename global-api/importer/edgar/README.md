# EDGAR  importer

Importing the EDGAR data

1. Save the database URI to an environment variable named `DB_URI`

2. Run `./import_edgar.sh` to import data

See the [`/global-api/README.md`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/develop/global-api) for instructions on setting up a local instance of the database

Use the following to to create an envionrment variable in `zsh`:

```sh
export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
```

Add it to the `~/.zshrc` file if you want the variable to persist.

### Directory tree

```sh
├── README.md                            # top level readme
├── citycelloverlapedgar_importer.py     # importer for cell overlap for each each
├── gridcelledgar_importer.py            # importer for entire edgar grid
├── gridcellemissionsedgar_importer.py   # importer for grid cell emissions
├── import_edgar.sh                      # shell script to run importer
└── utils.py                             # utility scripts uses .py files
```