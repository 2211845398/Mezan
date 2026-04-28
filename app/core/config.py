"""Application configuration management."""

from __future__ import annotations

import json
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    API_HOST: str = Field(default="0.0.0.0", description="API host address")
    API_PORT: int = Field(default=8000, description="API port number")
    ENVIRONMENT: str = Field(default="dev", description="Environment name (dev/staging/prod)")
    SECRET_KEY: str = Field(..., description="Secret key for security operations")
    DEBUG: bool = Field(default=False, description="Debug mode")
    ALLOWED_ORIGINS: list[str] = Field(
        default_factory=list,
        description="Allowed browser origins for CORS, as CSV or JSON array",
    )
    SEED_ON_STARTUP: bool = Field(
        default=False,
        description="Run idempotent seed routines during application startup",
    )
    MEZAN_ALLOW_DEV_SEED: bool = Field(
        default=False,
        description="Allow app.scripts.dev_seed destructive/bootstrap (requires explicit opt-in in prod)",
    )

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30, description="Access token expiry in minutes"
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, description="Refresh token expiry in days")
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT signing algorithm")
    SESSION_IDLE_TIMEOUT_MINUTES: int = Field(
        default=480,
        description="Refresh token idle timeout in minutes (0 disables idle expiry)",
    )

    # SSO (optional)
    GOOGLE_CLIENT_ID: str | None = Field(default=None, description="Google OAuth2 client ID")
    GOOGLE_CLIENT_SECRET: str | None = Field(
        default=None, description="Google OAuth2 client secret"
    )
    OAUTH_CALLBACK_BASE_URL: str = Field(
        default="http://localhost:8000",
        description="Base URL for OAuth callback (e.g. http://localhost:8000)",
    )

    # Optional: seed default admin user when no users exist
    DEFAULT_ADMIN_EMAIL: str | None = Field(
        default=None, description="Email for default admin (seed)"
    )
    DEFAULT_ADMIN_PASSWORD: str | None = Field(
        default=None, description="Password for default admin (seed)"
    )

    # Payment/OCR providers
    POS_DEFAULT_PAYMENT_PROVIDER: str = Field(
        default="in_store", description="Default POS payment provider"
    )
    OCR_PROVIDER: str = Field(default="basic", description="Invoice OCR provider name")

    # AI advisory
    OPENAI_API_KEY: str | None = Field(default=None, description="OpenAI API key")
    OPENAI_MODEL: str = Field(default="gpt-4o-mini", description="AI advisory model name")
    OPENAI_BASE_URL: str = Field(
        default="https://api.openai.com/v1", description="OpenAI-compatible API base URL"
    )
    OPENAI_REQUEST_TIMEOUT_SECONDS: int = Field(default=20, description="LLM call timeout")

    # Automated backups
    BACKUP_ENABLED: bool = Field(default=False, description="Enable scheduled DB backups")
    BACKUP_INTERVAL_MINUTES: int = Field(default=1440, description="Backup interval in minutes")
    BACKUP_RETENTION_DAYS: int = Field(default=14, description="Backup retention window in days")
    BACKUP_OUTPUT_DIR: str = Field(default="./backups", description="Local backup output directory")
    BACKUP_S3_BUCKET: str | None = Field(default=None, description="Optional S3 backup bucket")

    # Push notifications (Epic 13)
    NOTIFICATIONS_ENABLED: bool = Field(
        default=False, description="Enable the notification scheduler loop"
    )
    NOTIFICATIONS_TICK_SECONDS: int = Field(
        default=60, description="Scheduler tick period in seconds"
    )
    PUSH_PROVIDER: str = Field(default="mock", description="Push provider: mock / fcm")
    PUSH_REQUEST_TIMEOUT_SECONDS: int = Field(
        default=10, description="Push provider HTTP timeout in seconds"
    )
    FCM_CREDENTIALS_PATH: str | None = Field(
        default=None, description="Path to FCM service-account JSON file"
    )
    FCM_CREDENTIALS_JSON: str | None = Field(
        default=None, description="Inline FCM service-account JSON string"
    )

    # Database
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL database connection URL",
    )
    POSTGRES_USER: str = Field(default="postgres", description="PostgreSQL user")
    POSTGRES_PASSWORD: str = Field(..., description="PostgreSQL password")
    POSTGRES_DB: str = Field(default="mezan", description="PostgreSQL database name")
    POSTGRES_HOST: str = Field(default="db", description="PostgreSQL host")
    POSTGRES_PORT: int = Field(default=5432, description="PostgreSQL port")

    # Database Pool Settings
    DB_POOL_SIZE: int = Field(default=5, description="Database connection pool size")
    DB_MAX_OVERFLOW: int = Field(default=10, description="Database connection pool max overflow")

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Any) -> list[str] | Any:
        """Accept CORS origins as either CSV or JSON array input."""
        if value is None:
            return []
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = None
                else:
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]
        return value

    @model_validator(mode="after")
    def validate_security_settings(self) -> Settings:
        """Reject placeholder or weak production secrets."""
        if not self.is_production:
            return self

        secret = self.SECRET_KEY.strip()
        normalized = secret.lower()
        weak_secrets = {
            "changeme",
            "change-me",
            "default-secret-key",
            "dev-secret-key-change-in-production",
            "secret",
            "test-secret-key-not-for-prod",
        }
        if (
            len(secret) < 32
            or normalized in weak_secrets
            or normalized.startswith("dev-secret-key")
            or "change-in-production" in normalized
        ):
            raise ValueError("SECRET_KEY must be a strong, unique value in production.")
        return self

    @property
    def database_url_async(self) -> str:
        """Get async database URL for SQLAlchemy."""
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT.lower() in {"prod", "production"}

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.ENVIRONMENT.lower() in {"dev", "development"}

    @property
    def cors_allow_credentials(self) -> bool:
        """Only allow credentialed CORS when trusted origins are configured."""
        return bool(self.ALLOWED_ORIGINS)


# Global settings instance
settings = Settings()
