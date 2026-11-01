SHELL := /bin/bash

BACKEND_BUILD_DIR ?= .tmp/backend-build
# Never frontend/dist: in the production checkout nginx serves that directory
# live, so only scripts/deploy.sh may replace it (atomically).
FRONTEND_DIST ?= $(CURDIR)/.tmp/frontend-dist
CMAKE_BUILD_TYPE ?= Release
BUILD_JOBS ?= 2
NPM ?= npm

.PHONY: all check preflight security-audit backend-configure backend-build backend-test frontend-install frontend-audit frontend-test frontend-lint frontend-build e2e-install e2e clean

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
	cd frontend && $(NPM) run build -- --outDir "$(FRONTEND_DIST)" --emptyOutDir

e2e-install:
	cd e2e && $(NPM) ci --ignore-scripts

# Full stack in a real browser: the deploy/nginx vhost in front of the backend
# and the built frontend (see scripts/ci/run-e2e.sh). Needs nginx, python3,
# curl and a Playwright Chromium (npx playwright install chromium, or CHROME_PATH).
e2e: backend-build frontend-build e2e-install
	scripts/ci/run-e2e.sh $(BACKEND_BUILD_DIR)/weather_backend "$(FRONTEND_DIST)"

clean:
	rm -rf $(BACKEND_BUILD_DIR) "$(FRONTEND_DIST)" e2e/test-results e2e/playwright-report e2e/stack-logs
