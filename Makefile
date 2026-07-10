SHELL := /bin/bash

BACKEND_BUILD_DIR ?= backend/build
CMAKE_BUILD_TYPE ?= Release
NPM ?= npm

.PHONY: all check preflight security-audit backend-configure backend-build backend-test frontend-install frontend-audit frontend-lint frontend-build clean

all: check

check: backend-test frontend-audit frontend-lint frontend-build

preflight:
	scripts/preflight.sh

security-audit:
	scripts/security-audit.sh

backend-configure:
	cmake -S backend -B $(BACKEND_BUILD_DIR) -DCMAKE_BUILD_TYPE=$(CMAKE_BUILD_TYPE)

backend-build: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target weather_backend -j$$(nproc)

backend-test: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target test_gridsim test_security test_weathersim -j$$(nproc)
	cd $(BACKEND_BUILD_DIR) && ctest --output-on-failure

frontend-install:
	cd frontend && $(NPM) ci

frontend-audit:
	cd frontend && $(NPM) audit --audit-level=moderate

frontend-lint:
	cd frontend && $(NPM) run lint

frontend-build:
	cd frontend && $(NPM) run build

clean:
	rm -rf $(BACKEND_BUILD_DIR) frontend/dist
