#!/usr/bin/env bash
# Idempotent repository bootstrap for the Academia Espronceda Cloud Agent environment.
# Safe to run repeatedly: it only seeds missing local files and refreshes dependencies.
set -euo pipefail

# Resolve to the repository root regardless of where the script is invoked from.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Local development configuration (git-ignored). Seed it from the committed example.
if [ ! -f .env.local ]; then
  cp .env.development.example .env.local
fi

# Directory that holds the local libSQL database file used by the API and dev scripts.
mkdir -p .data

# Install JavaScript workspaces (api, web) and create the Python solver virtualenv
# with its dev dependencies. Mirrors the repository's documented `npm run setup`.
npm run setup

# Apply Drizzle migrations to the local database. Already-applied migrations are skipped.
npm run db:migrate
