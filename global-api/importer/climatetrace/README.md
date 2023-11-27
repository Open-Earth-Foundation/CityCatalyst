# ClimateTRACE importer

Importing the climateTrace data

1. Save the database URI to an environment variable named `DB_URI`

2. Run `./importer_climatetrash.sh` to execute `climatetrace_importer.py` and `climatetrace_importer_road_transportation.py`.

See the [`/global-api/README.md`](https://github.com/Open-Earth-Foundation/CityCatalyst/tree/develop/global-api) for instructions on setting up a local instance of the database

Use the following to to create an envionrment variable in `zsh`:

```sh
export DB_URI="postgresql://ccglobal:@localhost/ccglobal"
```

Add it to the `~/.zshrc` file if you want the variable to persist.

### Directory tree

```sh
.
├── README.md                                      # top level readme
├── climatetrace_data.tar.gz                       # gzipped data to import
├── climatetrace_importer.py                       # importer for point source data
├── climatetrace_importer_road_transportation.py   # importer for road transportation
├── importer_climatetrace.sh                       # script to run the importer
├── lat_lon_to_locode.py                           # functions for geoencoding
└── update_files/                                  # directory with scripts to add locodes to points
```