#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Academia Espronceda monorepo.
#
# Installs the pinned toolchains the repository requires (see .nvmrc,
# .python-version and package.json "engines") into the per-user ~/.local
# prefix, then installs project dependencies and prepares the local database.
#
# The script is safe to run repeatedly: toolchain steps are skipped when the
# correct version is already present, and dependency/migration steps converge.
set -euo pipefail

NODE_VERSION="24.16.0"
PYTHON_VERSION="3.14.2"
UV_VERSION="0.12.5"

# Resolve to the repository root regardless of where the script is invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

LOCAL_PREFIX="${HOME}/.local"
LOCAL_BIN="${LOCAL_PREFIX}/bin"
mkdir -p "${LOCAL_BIN}"
# ~/.local/bin is first on the Cloud Agent PATH, so tools placed here take
# precedence over any pre-baked Node/Python shims in the base image.
export PATH="${LOCAL_BIN}:${PATH}"

log() { printf '\n[install] %s\n' "$*"; }

# --- Node.js (bundles the required npm) -------------------------------------
if [ "$(command -v node >/dev/null 2>&1 && node -v || echo none)" != "v${NODE_VERSION}" ]; then
  log "Installing Node.js ${NODE_VERSION} into ${LOCAL_PREFIX}"
  tmp_node="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    -o "${tmp_node}/node.tar.xz"
  tar -xJf "${tmp_node}/node.tar.xz" -C "${LOCAL_PREFIX}" --strip-components=1
  rm -rf "${tmp_node}"
else
  log "Node.js ${NODE_VERSION} already present"
fi
log "node $(node -v) / npm $(npm -v)"

# --- Python via uv's standalone builds --------------------------------------
if ! command -v uv >/dev/null 2>&1; then
  log "Installing uv ${UV_VERSION}"
  curl -LsSf "https://astral.sh/uv/${UV_VERSION}/install.sh" | sh
fi
export PATH="${LOCAL_BIN}:${PATH}"

if [ "$(command -v python3 >/dev/null 2>&1 && python3 -V 2>/dev/null || echo none)" != "Python ${PYTHON_VERSION}" ]; then
  log "Installing Python ${PYTHON_VERSION} via uv"
  uv python install "${PYTHON_VERSION}"
  py_bin="$(uv python find "${PYTHON_VERSION}")"
  ln -sf "${py_bin}" "${LOCAL_BIN}/python3.14"
  ln -sf "${LOCAL_BIN}/python3.14" "${LOCAL_BIN}/python3"
  ln -sf "${LOCAL_BIN}/python3.14" "${LOCAL_BIN}/python"
else
  log "Python ${PYTHON_VERSION} already present"
fi
log "python3 $(python3 -V)"

# --- Local development configuration ----------------------------------------
# .env.local is git-ignored; seed it from the committed example when missing.
if [ ! -f .env.local ]; then
  log "Seeding .env.local from .env.development.example"
  cp .env.development.example .env.local
fi

# Directory that holds the local libSQL database file.
mkdir -p .data

# --- Project dependencies ----------------------------------------------------
# JavaScript workspaces (api, web) plus the Python solver virtualenv and dev
# dependencies. Mirrors the repository's documented `npm run setup`.
log "Installing project dependencies (npm run setup)"
npm run setup

# Apply Drizzle migrations to the local database (already-applied ones are skipped).
log "Applying database migrations"
npm run db:migrate

log "Bootstrap complete"
