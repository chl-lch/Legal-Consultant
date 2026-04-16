PYTHON ?= python3

.PHONY: backend-install backend-test frontend-install frontend-build fmt

backend-install:
	cd backend && $(PYTHON) -m pip install -e ".[dev]"

backend-test:
	cd backend && pytest

frontend-install:
	cd frontend && npm install

frontend-build:
	cd frontend && npm run build

fmt:
	cd backend && ruff check . --fix && ruff format .
	cd frontend && npm run lint

