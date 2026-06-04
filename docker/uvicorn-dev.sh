#!/bin/sh
# Dev API startup: migrate once, seed once, then uvicorn with reload excludes.
set -e

echo "Running database migrations..."
uv run alembic upgrade head

echo "Running core seed (idempotent)..."
uv run python -m app.scripts.core_seed

exec uv run uvicorn app.main:app \
  --host "${API_HOST:-0.0.0.0}" \
  --port "${API_PORT:-8000}" \
  --reload \
  --reload-exclude 'tests/*' \
  --reload-exclude 'tests/**' \
  --reload-exclude '.pytest_cache/*' \
  --reload-exclude 'htmlcov/*' \
  --reload-exclude 'crud_logs.txt' \
  --reload-exclude '.git/*' \
  --reload-exclude '.venv/*' \
  --reload-exclude '**/__pycache__/*' \
  --reload-exclude '**/*.pyc' \
  --reload-exclude 'web/*' \
  --reload-exclude 'mobile/*'
