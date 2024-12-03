#!/bin/bash

function get_package_version() {
  echo -n "v" # add v prefix to version so it matches our existing tags
  node -p "require('./package.json').version"
}

function release_test() {
  git fetch origin develop
  git checkout develop

  # create new test version (rc)
  npm version preminor --preid rc
  MAIN_VERSION=$(get_package_version)
  echo "NPM main version: $MAIN_VERSION"
  git commit -am "chore(release): release candidate version $MAIN_VERSION"
  git tag "$MAIN_VERSION"

  # create new dev version (dev)
  npm version preminor --preid dev
  DEV_VERSION=$(get_package_version)
  echo "NPM dev version: $DEV_VERSION"
  git commit -am "chore(release): development version $DEV_VERSION"
  git tag "$DEV_VERSION"
  git push
  # push new tags to remote
  git push origin refs/tags/"$DEV_VERSION"
  git push origin refs/tags/"$MAIN_VERSION"

  git fetch origin main
  git checkout main
  # merge rc version tag into main branch
  git merge "$MAIN_VERSION"
  # resolve merge conflicts because of changed version number
  git checkout --theirs -- package.json package-lock.json
  git commit -am "chore(release): merge rc version $MAIN_VERSION into main"
  git push
}

function release_prod() {
  git fetch origin main
  git checkout main

  npm version minor
  PROD_VERSION=$(get_package_version)
  git commit -am "chore(release): production version $PROD_VERSION"
  git tag "$PROD_VERSION"
  git push main
  git push origin refs/tags/"$PROD_VERSION"
}

# Check if Git working directory is clean
if [ -z "$(git status --porcelain)" ]; then
  echo "Working directory clean, continuing..."
else
  echo "Working directory not clean! Commit your changes and try again."
  exit 1
fi

# Check if --prod flag is passed as an argument
if [[ $* == *--prod* ]]; then
  release_prod
else
  release_test
fi
