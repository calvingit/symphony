SHELL := /bin/bash

.PHONY: help install build-symphony dev linear wait-linear symphony stop status logs clean

ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
WORKFLOW_FILE ?= $(ROOT_DIR)WORKFLOW.local.md
DEV_DIR := $(ROOT_DIR)tmp/dev
LINEAR_URL := http://127.0.0.1:3001/
LINEAR_PID_FILE := $(DEV_DIR)/linear-local.pid
SYMPHONY_PID_FILE := $(DEV_DIR)/symphony-cli.pid
LINEAR_LOG_FILE := $(DEV_DIR)/linear-local.log
SYMPHONY_LOG_FILE := $(DEV_DIR)/symphony-cli.log
RTK := $(shell command -v rtk 2>/dev/null)
PNPM := $(if $(RTK),$(RTK) pnpm,pnpm)

help:
	@echo "Targets:"
	@echo "  install   Install workspace dependencies"
	@echo "  dev       Start local tracker and Symphony CLI in background"
	@echo "  linear    Start only the local tracker in background"
	@echo "  symphony  Start only the Symphony CLI in background"
	@echo "  status    Show running service status"
	@echo "  logs      Tail both service logs"
	@echo "  stop      Stop all background services started by this Makefile"
	@echo "  clean     Remove pid/log files under tmp/dev"

install:
	$(PNPM) install

build-symphony:
	$(PNPM) --filter @symphony/symphony build

dev: linear wait-linear symphony status
	@echo "Local tracker UI: http://localhost:3001/"
	@echo "Local tracker GraphQL: http://localhost:3001/graphql"
	@echo "Symphony status API: http://localhost:4010/api/v1/state"

linear:
	@mkdir -p "$(DEV_DIR)"
	@if [ -f "$(LINEAR_PID_FILE)" ] && kill -0 "$$(cat "$(LINEAR_PID_FILE)")" 2>/dev/null; then \
		echo "linear-local already running (pid $$(cat "$(LINEAR_PID_FILE)"))"; \
	else \
		rm -f "$(LINEAR_PID_FILE)"; \
		nohup $(PNPM) dev:linear >"$(LINEAR_LOG_FILE)" 2>&1 & echo $$! >"$(LINEAR_PID_FILE)"; \
		echo "Started linear-local (pid $$(cat "$(LINEAR_PID_FILE)"))"; \
	fi

wait-linear:
	@for _ in $$(seq 1 30); do \
		if python3 -c 'import urllib.request; response = urllib.request.urlopen("$(LINEAR_URL)", timeout=1); response.close()' >/dev/null 2>&1; then \
			echo "linear-local ready at $(LINEAR_URL)"; \
			exit 0; \
		fi; \
		sleep 1; \
	done; \
	echo "linear-local did not become ready at $(LINEAR_URL)" >&2; \
	exit 1

symphony: build-symphony wait-linear
	@mkdir -p "$(DEV_DIR)"
	@if [ -f "$(SYMPHONY_PID_FILE)" ] && kill -0 "$$(cat "$(SYMPHONY_PID_FILE)")" 2>/dev/null; then \
		echo "symphony-cli already running (pid $$(cat "$(SYMPHONY_PID_FILE)"))"; \
	else \
		rm -f "$(SYMPHONY_PID_FILE)"; \
		nohup $(PNPM) --filter @symphony/symphony-cli dev -- --port 4010 "$(WORKFLOW_FILE)" >"$(SYMPHONY_LOG_FILE)" 2>&1 & echo $$! >"$(SYMPHONY_PID_FILE)"; \
		echo "Started symphony-cli (pid $$(cat "$(SYMPHONY_PID_FILE)"))"; \
	fi

status:
	@mkdir -p "$(DEV_DIR)"
	@$(MAKE) --no-print-directory _service-status PID_FILE="$(LINEAR_PID_FILE)" NAME="linear-local" LOG_FILE="$(LINEAR_LOG_FILE)"
	@$(MAKE) --no-print-directory _service-status PID_FILE="$(SYMPHONY_PID_FILE)" NAME="symphony-cli" LOG_FILE="$(SYMPHONY_LOG_FILE)"

logs:
	@mkdir -p "$(DEV_DIR)"
	@touch "$(LINEAR_LOG_FILE)" "$(SYMPHONY_LOG_FILE)"
	@tail -f "$(LINEAR_LOG_FILE)" "$(SYMPHONY_LOG_FILE)"

stop:
	@$(MAKE) --no-print-directory _service-stop PID_FILE="$(LINEAR_PID_FILE)" NAME="linear-local"
	@$(MAKE) --no-print-directory _service-stop PID_FILE="$(SYMPHONY_PID_FILE)" NAME="symphony-cli"

clean: stop
	@rm -f "$(LINEAR_LOG_FILE)" "$(SYMPHONY_LOG_FILE)"
	@rmdir "$(DEV_DIR)" 2>/dev/null || true

_service-status:
	@if [ -f "$(PID_FILE)" ] && kill -0 "$$(cat "$(PID_FILE)")" 2>/dev/null; then \
		echo "$(NAME): running (pid $$(cat "$(PID_FILE)"))"; \
	else \
		rm -f "$(PID_FILE)"; \
		if [ -f "$(LOG_FILE)" ]; then \
			echo "$(NAME): stopped (see $(LOG_FILE))"; \
		else \
			echo "$(NAME): stopped"; \
		fi; \
	fi

_service-stop:
	@if [ -f "$(PID_FILE)" ]; then \
		pid=$$(cat "$(PID_FILE)"); \
		if kill -0 "$$pid" 2>/dev/null; then \
			kill "$$pid"; \
			echo "Stopped $(NAME) (pid $$pid)"; \
		else \
			echo "$(NAME) already stopped"; \
		fi; \
		rm -f "$(PID_FILE)"; \
	else \
		echo "$(NAME) not running"; \
	fi
