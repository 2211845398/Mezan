# Mezan ERP System

Comprehensive ERP and Retail Management System built with FastAPI, PostgreSQL, and Docker.

## Technology Stack

- **Backend**: FastAPI (Python 3.12)
- **Package Management**: UV
- **Database**: PostgreSQL 15+
- **Migrations**: Alembic
- **Containerization**: Docker & Docker Compose
- **CI/CD**: GitHub Actions

## Project Structure

```
mezan/
├── app/                    # Application code
│   ├── main.py            # FastAPI application entry point
│   ├── scripts/           # Operational scripts (for example manual seeding)
│   └── core/              # Core components
│       ├── config.py      # Configuration management
│       └── database.py    # Database connection
├── alembic/               # Database migrations
├── tests/                 # Test suite
├── docker/                # Dockerfiles for different environments
└── .github/workflows/     # CI/CD pipelines
```

## Prerequisites

- Docker and Docker Compose
- UV package manager (optional, for local development)
- Python 3.12+ (optional, for local development)

## Quick Start

### Development Environment

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mezan
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your configuration values, especially `SECRET_KEY`.

3. **Start services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   docker-compose exec api alembic upgrade head
   ```

5. **Core seed** runs automatically in the API entrypoint after migrations. To run manually:
   ```bash
   docker-compose exec api uv run python -m app.scripts.core_seed
   ```

6. **Access the application**
   - API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - PgAdmin (optional): http://localhost:5050

### Local Development (without Docker)

1. **Install UV** (if not already installed)
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Install dependencies**
   ```bash
   uv sync
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your local database settings
   ```

4. **Run database migrations**
   ```bash
   uv run alembic upgrade head
   ```

5. **Core seed** (after migrations; also runs in Docker entrypoint)
   ```bash
   uv run python -m app.scripts.core_seed
   ```

6. **Run the application**
   ```bash
   uv run uvicorn app.main:app --reload
   ```

## Environment Configuration

Create a `.env` file based on `.env.example` with the following variables:

- `ENVIRONMENT`: Environment name (dev/staging/prod)
- `SECRET_KEY`: Secret key for security operations. In production it must be a strong unique value, not a placeholder or short dev secret.
- `ALLOWED_ORIGINS`: Comma-separated or JSON-array list of trusted browser origins for CORS credentials. Example: `http://localhost:3000,http://127.0.0.1:5173`
- `SEED_ON_STARTUP`: Set to `true` only when you intentionally want startup seeding to run. Development compose enables it; production compose disables it.
- `MEZAN_ALLOW_DEV_SEED`: Set to `1` / `true` only to allow `app.scripts.dev_seed` when `ENVIRONMENT` is production (not recommended).
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_*`: Database configuration variables

### Email (purchase order PDF to suppliers)

When sending a purchase order to a supplier, the API attaches a PDF and emails the supplier's `contact.email`. Sending is atomic: if delivery fails, the PO stays in `draft`.

| Variable | Description |
|----------|-------------|
| `EMAIL_ENABLED` | `true` to send real mail; `false` logs only (default in dev) |
| `EMAIL_PROVIDER` | `mock` or `smtp` |
| `SMTP_HOST`, `SMTP_PORT` | SMTP server (required when using `smtp` with `EMAIL_ENABLED=true`) |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional SMTP credentials |
| `SMTP_USE_TLS` | STARTTLS (default `true`, port 587) |
| `SMTP_USE_SSL` | Implicit SSL (e.g. port 465) |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Sender address and display name |
| `COMPANY_DISPLAY_NAME` | Header on PO PDF and email subject (default `Mezan`) |

#### Local dev with Mailpit

Development Compose includes **Mailpit** (`mezan_mailpit_dev`) to capture outbound SMTP without a real mailbox.

| Endpoint | Purpose |
|----------|---------|
| `localhost:1025` | SMTP (plain, no auth/TLS) |
| [http://localhost:8025](http://localhost:8025) | Web UI — inspect PO emails and PDF attachments |

Start the stack:

```bash
docker compose up -d db mailpit api
```

`docker-compose.yml` sets API email defaults to `SMTP_HOST=mailpit`, port `1025`, TLS/SSL off. Align `.env` the same when the API runs in Docker.

| API runtime | `SMTP_HOST` |
|-------------|-------------|
| Inside Docker (`mezan_api_dev`) | `mailpit` |
| On the host (`uv run uvicorn …`) | `localhost` (Mailpit ports are published to the host) |

Example `.env` for Mailpit:

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USE_TLS=false
SMTP_USE_SSL=false
EMAIL_FROM=noreply@mezan.local
EMAIL_FROM_NAME=Mezan
```

Suppliers need `contact.email` before `POST /api/v1/purchase-orders/{id}/send` (dev seed suppliers may have an empty contact — set email in the UI first).

## Core seeding (production-safe)

**`app/scripts/core_seed.py`** seeds permissions, roles, default CoA / accounting settings, notification templates, and optionally the default admin (when `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are set). It is idempotent.

- **Docker entrypoint** runs `core_seed` after `alembic upgrade head` on every API container start.
- **Development compose** also sets `SEED_ON_STARTUP=true` so uvicorn lifespan re-runs core seed after hot reload (safe but redundant with entrypoint).
- **Production compose** sets `SEED_ON_STARTUP=false`; only the entrypoint runs core seed.

Manual:

```bash
# Local
uv run python -m app.scripts.core_seed

# Docker Compose
docker-compose exec api uv run python -m app.scripts.core_seed

# Legacy alias (same as core_seed)
uv run python -m app.scripts.seed
```

If you want a default admin account to be created during manual or startup seeding, set both `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`. While that email matches a user in the database, the API keeps that account **active** (it rejects other account statuses), refuses to remove its `ADMIN` role assignment, rejects assigning additional roles, and blocks admin-initiated password-reset requests and permission-override APIs for that user (so the deployment always keeps one reachable full-access administrator).

## Dev database bootstrap

`app/scripts/dev_seed.py` loads a **rich local dataset** on top of core seed: branches, catalog, POS terminals, customers, suppliers, purchase orders, POS shifts/invoices, attendance, and payroll drafts. It is **manual only** and separate from `core_seed`.

**Safety:** the script **refuses to run** when `ENVIRONMENT` is `production` or `prod` unless you set `MEZAN_ALLOW_DEV_SEED=1` (explicit opt-in).

**`--reset`:** truncates all `public` tables **except** `alembic_version` (schema and migration history stay). You must set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` in the environment, or pass `--email` and `--password`.

**POS terminals (dev):** each branch gets a terminal with plain API key `pos_dev_<branch_code>_mezan2026` (logged once when the terminal row is created).

Run inside Docker (recommended; the API container uses `POSTGRES_HOST=db`):

```bash
docker compose exec api uv run python -m app.scripts.dev_seed --reset
```

Fresh Postgres volume instead of in-database truncate:

```bash
docker compose down -v
docker compose up -d
docker compose exec api alembic upgrade head
docker compose exec api uv run python -m app.scripts.dev_seed
```

From the host with local `uv`, point `.env` at Docker Postgres on `localhost` (not `db`), then:

```bash
cd mezan
uv run python -m app.scripts.dev_seed --reset
```

## Database Migrations

### Create a new migration
```bash
docker-compose exec api alembic revision --autogenerate -m "Description of changes"
```

### Apply migrations
```bash
docker-compose exec api alembic upgrade head
```

### Rollback migration
```bash
docker-compose exec api alembic downgrade -1
```

## Testing

Run tests:
```bash
docker-compose exec api uv run pytest
```

Or locally:
```bash
uv run pytest
```

## Docker Compose Environments

- **Development**: `docker-compose.yml` - Includes hot-reload and pgAdmin
- **Staging**: `docker-compose.staging.yml` - Optimized for staging
- **Production**: `docker-compose.prod.yml` - Production-ready configuration

## CI/CD

The project includes GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main/develop
  - Code linting (Ruff)
  - Running tests
  - Building Docker images

- **CD** (`.github/workflows/cd.yml`): Deploys on push to main/staging
  - Builds and pushes Docker images
  - Deploys to staging/production environments

## Development Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Rebuild containers
docker-compose build --no-cache

# Access API container shell
docker-compose exec api bash

# Access database
docker-compose exec db psql -U postgres -d mezan
```

## Next Steps

After setting up the infrastructure:

1. Verify all services are running: `docker-compose ps`
2. Test the health endpoint: `curl http://localhost:8000/health`
3. Check API documentation: http://localhost:8000/docs
4. Ready to begin Epic 1: Authentication & Core Infrastructure

## License

[Add your license here]
