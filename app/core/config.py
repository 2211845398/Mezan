"""Application configuration management."""

from pydantic import Field
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

    @property
    def database_url_async(self) -> str:
        """Get async database URL for SQLAlchemy."""
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self.DATABASE_URL

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.ENVIRONMENT == "prod"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.ENVIRONMENT == "dev"


# Global settings instance
settings = Settings()
