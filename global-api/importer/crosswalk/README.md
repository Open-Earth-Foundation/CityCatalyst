# Crosswalk Labs  importer

Importing the CrossWalk Labs data

1. Save the database URI to an environment variable named `DB_URI`

2. Run `./import_crosswalk.sh` to import data

See the [`/global-api/README.md`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/develop/global-api) for instructions on setting up a local instance of the database

Use the following to to create an envionrment variable in `zsh`:

```sh
export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
```

Add it to the `~/.zshrc` file if you want the variable to persist.

### Directory tree

```sh
├── README.md                           # top level readme
├── crosswalk_city_data_importer.py     # importer for crosswalk city data
├── crosswalk_data_importer.py          # importer for crossalk emissions
├── crosswalk_grid_importer.py          # importer for crosswalk grid
├── import_crosswalk.sh                 # shell script to import crosswalk data
└── utils.py                            # utility scripts uses .py files
```