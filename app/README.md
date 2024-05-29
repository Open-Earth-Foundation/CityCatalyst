# CityCatalyst

This is the main CityCatalyst Web app. This directory includes both the
frontend and backend code for the app, as well as database management scripts.

## Installation

### Code

To install, clone the [CityCatalyst repository](https://github.com/Open-Earth-Foundation/CityCatalyst):

```bash
git clone https://github.com/Open-Earth-Foundation/CityCatalyst.git
```

Then, install the dependencies:

```bash
cd CityCatalyst/app
npm install
```

### Database

For a quick setup, run `scripts/start-db.sh`, which will launch a PostgreSQL Docker image with the right configuration. Otherwise continue below ⬇️

You'll need to run a [PostgreSQL](https://www.postgresql.org/) database, locally or remotely.

You'll need access to the `psql`, `createuser`, and `createdb` commands.

Create a database user:

```bash
createuser citycatalyst
```

Then, create the database

```bash
createdb citycatalyst -O citycatalyst
```

You'll need to have environment variables set up for the database connection.
You can do this by creating a `.env` file in the `app` directory. If you've followed the
above directions, You should just be able to copy the `env.example` file:

```bash
cp env.example .env
```

You can edit the `.env` file to match your database configuration.

Finally, you can run the database migrations:

```bash
cd CityCatalyst/app
npm run db:migrate
```

You'll need to re-run the migrations whenever you make changes to the database schema.

You can then run the seeders, which will fill the database with the required data for the GPC format (sectors, subsectors, subcategories etc.):

```bash
npm run db:seed
```

If necessary, you can undo individual migrations with `npm run db:migrate:undo` and seeders with `npm run db:seed:undo`.

### Environment

Copy `env.example` to a file called `.env`.  
The environment variables `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are required for running unless `NODE_ENV` is set to a value that's different than `production`.

## Running

### Development



To run the app in development mode, run:

```bash
cd CityCatalyst/app
cp env.example .env

## set up your database credentials in .env file 

npm run db:migrate

npm run db:seed

## set up login in credentials
npm run create-admin

npm run dev
```

### Docker

You can also run the app in a Docker container. To do so, you'll need to build the Docker image:

```bash
cd CityCatalyst/app
docker build -t ghcr.io/open-earth-foundation/citycatalyst .
```

Then, you can run the app in a container:

```bash
docker run -p 3000:3000 ghcr.io/open-earth-foundation/citycatalyst
```

### End to end testing

We use Playwright to run automated E2E tests.

Setup: `npx playwright install --with-deps`

Run: `npm run e2e:test`

### API unit tests

Run: `npm run api:test`
