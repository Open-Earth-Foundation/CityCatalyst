# CityCatalyst

This is the main CityCatalyst Web app. This directory includes both the
frontend and backend code for the app, as well as database management scripts.

## Prerequisites

This guide assumes you have installed and access to the following tools:

1. git command line interface. Please follow [this link](https://git-scm.com/downloads) for installation instructions.
2. Node.js and the node package manager npm. Please follow [this link](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for installation instructions.
3. (optional) docker engine. Docker is not strictly necessary but recommended. It makes the setup of the database service much easier. Please follow [this link](https://docs.docker.com/engine/install/) for installation instructions. 
4. (optional, Windows OS only) Windows Subsystem for Linux WSL2. This step is only needed for running the convenience shell scripts below e.g. for setting up the Postgres database via docker. Different Linux subsystems can be installed. The following link is for Ubuntu. Please follow [this link](https://ubuntu.com/desktop/wsl) for installation instructions. 

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

#### Automated setup via Docker

For a quick setup, run `scripts/start-db.sh`, which will launch a PostgreSQL Docker image with the right configuration.

Note for Windows users only: Make sure you run this script in the WSL2 environment. Since WSL2 does not share the same resources as the Windows host system, you have to configure the integration of docker with the WSL2 system. For this, open Docker Desktop, go to `Settings > Resources > WSL integration` and activate `Enable integration with my default WSL distro` and make sure your Linux distribution is listed and enabled.

Run the following command.

```bash
cd app/scripts/
bash start-db.sh
```

If you use this script, continue at [Environment](#environment). Otherwise continue below ⬇️ with the manual setup of the database service.

#### Manual setup

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

To download the current set of data sources from the global API, run the following command:
```bash
npm run sync-catalogue
```

### Environment

Copy `env.example` to a file called `.env`.  
The environment variables `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are required for running unless `NODE_ENV` is set to a value that's different than `production`.

## Running

### Development



To run the app in development mode, run:

```bash
cd CityCatalyst/app

## if you have copied and renamed the env.example file in the step under 'Environment', 
## skip the next line otherwise remove the comment in the next line
#cp env.example .env

## set up your database credentials in .env file 

npm run db:migrate

npm run db:seed

## set up login in credentials
npm run create-admin

npm run dev
```

The standard port is 3000 and the application can be opend at http://localhost:3000. Please check the log outputs, if a different port has been used.

Use `johndeo@example.com` and `password` to login.

#### HIAP
To connect to the HIAP prioritizer/plan creator, run
kubectl port-forward svc/hiap-service-dev 8080:8080

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
