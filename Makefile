# ArbiterAI — common tasks. Requires Node >= 22, npm, and (for docker targets) Docker Compose v2.
# Windows: run from Git Bash or WSL (GNU make).

NPM     ?= npm
COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help setup env install dev dev-backend dev-frontend build start typecheck lint format test test-backend test-shared \
        seed db-reset clean docker-build docker-up docker-down docker-logs docker-reset docker-sqlite

help: ## Show this help
	@echo "ArbiterAI make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: env install ## First-time setup: create .env and install dependencies

env: ## Create .env from .env.example if it does not exist
	@node -e "const fs=require('fs');if(fs.existsSync('.env')){console.log('.env already exists')}else{fs.copyFileSync('.env.example','.env');console.log('Created .env from .env.example')}"

install: ## Install all workspace dependencies
	$(NPM) install

dev: ## Run API (:8080) and web (:5173) with hot reload
	$(NPM) run dev

dev-backend: ## Run only the API with hot reload
	$(NPM) run dev:backend

dev-frontend: ## Run only the Vite dev server
	$(NPM) run dev:frontend

build: ## Production build (frontend + bundled backend)
	$(NPM) run build

start: build ## Build, then serve API + SPA on :8080 (SERVE_WEB=true)
	SERVE_WEB=true NODE_ENV=production PUBLIC_WEB_URL=http://localhost:8080 $(NPM) run start

typecheck: ## Type-check every workspace
	$(NPM) run typecheck

lint: ## Lint the monorepo
	$(NPM) run lint

format: ## Format with Prettier
	$(NPM) run format

test: ## Run all tests (mock PayPal + mock LLM, in-memory SQLite)
	$(NPM) run test

test-backend: ## Run backend tests only
	$(NPM) run test -w @arbiter/backend

test-shared: ## Run shared-package tests only
	$(NPM) run test -w @arbiter/shared

seed: ## Seed the three demo contracts (awaiting funding)
	$(NPM) run seed:demo

db-reset: ## Delete the local database (SQLite file or Postgres tables)
	$(NPM) run db:reset

clean: ## Remove build output and local SQLite data
	@node -e "for (const p of ['backend/dist','frontend/dist','backend/data','data']) require('fs').rmSync(p,{recursive:true,force:true}); console.log('Cleaned')"

docker-build: ## Build the Docker image
	$(COMPOSE) build

docker-up: ## Start Postgres + ArbiterAI on http://localhost:8080
	$(COMPOSE) up -d --build
	@echo "ArbiterAI → http://localhost:8080   (health: /api/health)"

docker-down: ## Stop the stack
	$(COMPOSE) down

docker-logs: ## Tail application logs
	$(COMPOSE) logs -f app

docker-reset: ## Stop the stack and delete the Postgres volume
	$(COMPOSE) down -v

docker-sqlite: ## Run a single container with SQLite (no Postgres)
	$(COMPOSE) --profile sqlite up --build app-sqlite
