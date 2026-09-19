SHELL := /bin/bash

BACKEND_BUILD_DIR ?= .tmp/backend-build
CMAKE_BUILD_TYPE ?= Release
BUILD_JOBS ?= 2
NPM ?= npm

.PHONY: all check preflight security-audit backend-configure backend-build backend-test frontend-install frontend-audit frontend-test frontend-lint frontend-build clean

all: check

check: backend-build backend-test frontend-audit frontend-test frontend-lint frontend-build

preflight:
	scripts/preflight.sh

security-audit:
	scripts/security-audit.sh

backend-configure:
	cmake -S backend -B $(BACKEND_BUILD_DIR) -DCMAKE_BUILD_TYPE=$(CMAKE_BUILD_TYPE)

backend-build: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target weather_backend -j$(BUILD_JOBS)

backend-test: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target test_gridsim test_security test_weathersim -j$(BUILD_JOBS)
	cd $(BACKEND_BUILD_DIR) && ctest --output-on-failure

frontend-install:
	cd frontend && $(NPM) ci --ignore-scripts

frontend-audit: frontend-install
	cd frontend && $(NPM) audit --audit-level=moderate

frontend-test: frontend-install
	cd frontend && $(NPM) test

frontend-lint: frontend-install
	cd frontend && $(NPM) run lint

frontend-build: frontend-install
	cd frontend && $(NPM) run build

clean:
	rm -rf $(BACKEND_BUILD_DIR) frontend/dist
