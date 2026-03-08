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
│   ├── config.py          # Configuration management
│   └── core/              # Core components
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

5. **Access the application**
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

4. **Run the application**
   ```bash
   uv run uvicorn app.main:app --reload
   ```

## Environment Configuration

Create a `.env` file based on `.env.example` with the following variables:

- `ENVIRONMENT`: Environment name (dev/staging/prod)
- `SECRET_KEY`: Secret key for security operations
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_*`: Database configuration variables

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
