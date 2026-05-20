## CityCatalyst Global API

This is the Global API server used by CityCatalyst for accessing data from services that don't have a public API.

### Requirements

It runs on Python 3, and requires a Postgres database.

### Setup

#### Code

Install the requirements with `pip`:

```bash
pip install -r requirements.txt
```

#### Database

You have to create a Postgres database user:

```bash
createuser ccglobal
```

Then create a database:

```bash
createdb ccglobal -O ccglobal
```

Then, run `alembic` to create the tables:

```bash
alembic upgrade head
```

You should re-run alembic each time a new database migration is added.

#### Configuration

Copy `sample.env` to `.env` and edit it to match your configuration.

```bash
cp sample.env .env
```

Configuration options are:

- `PROJECT_NAME`: name of the project; default is `CityCatalyst-Global-API`
- `DB_NAME`: name of your database; default is `ccglobal` or whatever
    you set in the database setup above
- `DB_USER`: `ccglobal` or whatever you used above
- `DB_PASSWORD`: blank, unless you added something
- `DB_HOST`: localhost or whatever you used above
- `DB_PORT`: integer; usually 5432

### Running

```bash
python main.py
```

On MacOS or other systems, you have to use `python3` instead of `python`.

```bash
python3 main.py
```

### Code layout

`routes` will have the API routes

`models` will have the SQLalchemy database models

`tests` will have our test functions

`.github` will have setup github actions to run our tests

`utils` will have utility scripts

### New CCRA Adapta endpoint

`GET /api/v1/cities/{actor_id}/climate-risk/adapta`

Optional query params:
- `timeframe` (int; when omitted, all years for the city and scenario are returned—summary collapses one row per `(timeframe, sector, risk, component)`; chain returns every leaf row. When set, the response is restricted to that year.)
- `scenario` (text; defaults to `current`)
- `level` (`summary` or `chain`; defaults to `summary`)

Response shape:
- `meta`: city/scenario/release provenance; `timeframe` is null when no year filter; `timeframe_resolution` is `all_years` or `single_year`
- `data`: risk rows each include `timeframe`, plus `null_type` and derived `value_status`
