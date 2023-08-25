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

### Skeleton directory for Global API server

.

├── .env

├── .github/

├── .gitignore

├── README.md

├── models/

├── requirements.txt

├── routes/

├── tests/

└── utils/

`routes` will have the API routes

`models` will have the SQLalchemy database models

`tests` will have our test functions

`.githu`b will have setup github actions to run our tests

`utils` will have utility scripts
