# OSM importer

Importing the Open Street Map data

1. Save the database URI to an environment variable named `DB_URI`

2. Run `./import_osm.sh` to import data

See the [`/global-api/README.md`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/develop/global-api) for instructions on setting up a local instance of the database

Use the following to to create an envionrment variable in `zsh`:

```sh
export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
```

Add it to the `~/.zshrc` file if you want the variable to persist.

### Directory tree

```sh
├── README.md            # top level readme
├── osm_importer.py      # importer for osm data
├── import_osm.sh        # shell script to run importer
└── osmid_to_geometry.py # script to get geometry from osmid
```