SHELL := /bin/bash

BACKEND_BUILD_DIR ?= backend/build
CMAKE_BUILD_TYPE ?= Release
NPM ?= npm

.PHONY: all check security-audit backend-configure backend-build backend-test frontend-install frontend-audit frontend-lint frontend-build clean

all: check

check: backend-test frontend-audit frontend-lint frontend-build

security-audit:
	scripts/security-audit.sh

backend-configure:
	cmake -S backend -B $(BACKEND_BUILD_DIR) -DCMAKE_BUILD_TYPE=$(CMAKE_BUILD_TYPE)

backend-build: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target weather_backend -j$$(nproc)

backend-test: backend-configure
	cmake --build $(BACKEND_BUILD_DIR) --target test_gridsim -j$$(nproc)
	./$(BACKEND_BUILD_DIR)/test_gridsim

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
