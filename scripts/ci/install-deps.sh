#!/usr/bin/env bash
# Installs build/runtime packages inside the CI container (ubuntu:26.04, the
# production OS, whose libdrogon-dev is Drogon 1.9.11 like production).
#
# Usage: scripts/ci/install-deps.sh [--e2e]
#   --e2e  also install nginx, python3 and curl for scripts/ci/run-e2e.sh
set -euo pipefail

packages=(
    ca-certificates git make cmake g++
    libdrogon-dev libboost-dev libbrotli-dev libhiredis-dev libjsoncpp-dev
    libmariadb-dev libmariadb-dev-compat libpq-dev libsqlite3-dev
    libyaml-cpp-dev uuid-dev zlib1g-dev
)
if [[ "${1:-}" == "--e2e" ]]; then
    packages+=(nginx python3 curl)
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends "${packages[@]}"
dpkg-query -W -f='${Package} ${Version}\n' libdrogon-dev
