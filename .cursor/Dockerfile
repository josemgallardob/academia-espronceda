# Base development image for Academia Espronceda Cloud Agents.
# Provides the pinned Node.js and Python toolchains the monorepo requires
# (see .nvmrc, .python-version, and package.json "engines").
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System packages: git/curl for tooling, xz-utils to unpack the Node tarball,
# and build-essential for any native npm module compilation (argon2, libsql).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        xz-utils \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js 24.16.0 (bundles npm 11.13.0) installed into /usr/local.
ARG NODE_VERSION=24.16.0
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version \
    && npm --version

# Python 3.14.2 via uv's standalone build, exposed as python3/python so the
# solver's `python3 -m venv` uses the required interpreter.
ARG PYTHON_VERSION=3.14.2
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
RUN uv python install "${PYTHON_VERSION}" \
    && PYBIN="$(uv python find ${PYTHON_VERSION})" \
    && ln -sf "${PYBIN}" /usr/local/bin/python3.14 \
    && ln -sf /usr/local/bin/python3.14 /usr/local/bin/python3 \
    && ln -sf /usr/local/bin/python3.14 /usr/local/bin/python \
    && python3 --version

# Run as the Cloud Agent runtime user. The agent harness places ~/.local/bin
# first on PATH, so symlink the pinned Node there to win over any injected shim.
RUN id ubuntu >/dev/null 2>&1 || useradd -m -u 1000 -s /bin/bash ubuntu
USER ubuntu
RUN mkdir -p /home/ubuntu/.local/bin \
    && ln -sf /usr/local/bin/node /home/ubuntu/.local/bin/node \
    && ln -sf /usr/local/bin/npm /home/ubuntu/.local/bin/npm \
    && ln -sf /usr/local/bin/npx /home/ubuntu/.local/bin/npx \
    && ln -sf /usr/local/bin/corepack /home/ubuntu/.local/bin/corepack
ENV PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
