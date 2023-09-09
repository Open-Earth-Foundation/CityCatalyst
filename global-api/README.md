## CityCatalyst Global API

This is the Global API server used by CityCatalyst for accessing data from services that don't have a public API.

### Setup Locally In Docker Container
#### Requirements
Needs docker installed with docker compose on machine

```bash
docker compose build --build-args build_env=dev && docker compose up -d && docker compose logs -f --tail 100
```
To interact with backend container.
```bash
docker compose exec be bash
```
To interact with postgres databse inside container.
```bash
docker compose exec db psql -U `postgres_username`
```
### Setup Locally
#### Requirements

It runs on Python 3, and requires a Postgres database.

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
