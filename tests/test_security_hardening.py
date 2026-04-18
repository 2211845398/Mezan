"""Focused tests for Batch 3 platform and security hardening."""

from __future__ import annotations

import importlib

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.deps import require_permission
from app.db.database import get_db


def _reload_main_module(monkeypatch: pytest.MonkeyPatch, **env_overrides):
    base_env = {
        "ENVIRONMENT": "dev",
        "SECRET_KEY": "dev-secret-key-change-in-production",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/mezan",
        "POSTGRES_PASSWORD": "postgres",
        "ALLOWED_ORIGINS": "[]",
        "SEED_ON_STARTUP": "false",
    }
    base_env.update(env_overrides)
    for key, value in base_env.items():
        monkeypatch.setenv(key, value)

    import app.api.v1 as api_v1_module
    import app.api.v1.auth as auth_module
    import app.core.config as config_module
    import app.core.rate_limit as rate_limit_module
    import app.main as main_module

    importlib.reload(config_module)
    importlib.reload(rate_limit_module)
    importlib.reload(auth_module)
    importlib.reload(api_v1_module)
    return importlib.reload(main_module)


@pytest.mark.asyncio
async def test_cors_allows_configured_origin_only(monkeypatch: pytest.MonkeyPatch) -> None:
    main_module = _reload_main_module(
        monkeypatch,
        ALLOWED_ORIGINS='["http://allowed.test"]',
    )

    async with AsyncClient(
        transport=ASGITransport(app=main_module.app),
        base_url="http://test",
    ) as client:
        allowed = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://allowed.test",
                "Access-Control-Request-Method": "GET",
            },
        )
        blocked = await client.options(
            "/api/v1/health",
            headers={
                "Origin": "http://blocked.test",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://allowed.test"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert blocked.status_code == 400
    assert "access-control-allow-origin" not in blocked.headers


def test_production_rejects_placeholder_secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("SECRET_KEY", "dev-secret-key-change-in-production")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/mezan",
    )
    monkeypatch.setenv("POSTGRES_PASSWORD", "postgres")

    from app.core.config import Settings

    with pytest.raises(ValidationError, match="SECRET_KEY must be a strong, unique value"):
        Settings()


def test_route_audit_allows_known_public_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    main_module = _reload_main_module(monkeypatch)
    app = FastAPI()
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(router, prefix="/api/v1")

    main_module._audit_route_permissions(app)


def test_route_audit_rejects_private_route_without_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    main_module = _reload_main_module(monkeypatch)
    app = FastAPI()
    router = APIRouter()

    @router.get("/private")
    async def private_route() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(router, prefix="/api/v1")

    with pytest.raises(RuntimeError, match="GET /api/v1/private"):
        main_module._audit_route_permissions(app)


@pytest.mark.asyncio
async def test_auth_login_is_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    main_module = _reload_main_module(monkeypatch)

    import app.api.v1.auth as auth_module

    async def _override_get_db():
        yield object()

    async def _fake_login_email_password(db, email: str, password: str) -> dict[str, object]:
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "token_type": "bearer",
            "expires_in": 1800,
            "user_id": 1,
            "email": email,
        }

    monkeypatch.setattr(auth_module.auth_service, "login_email_password", _fake_login_email_password)
    main_module.app.dependency_overrides[get_db] = _override_get_db

    try:
        async with AsyncClient(
            transport=ASGITransport(app=main_module.app),
            base_url="http://test",
        ) as client:
            responses = []
            for _ in range(6):
                responses.append(
                    await client.post(
                        "/api/v1/auth/login",
                        headers={"X-Forwarded-For": "198.51.100.10"},
                        json={"email": "cashier@example.com", "password": "password123"},
                    )
                )
    finally:
        main_module.app.dependency_overrides.clear()

    assert [response.status_code for response in responses[:5]] == [200, 200, 200, 200, 200]
    assert responses[5].status_code == 429
    assert responses[5].json()["error"]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_lifespan_skips_seed_calls_when_seed_on_startup_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    main_module = _reload_main_module(monkeypatch, SEED_ON_STARTUP="false")

    import app.services.seed_service as seed_service

    async def _unexpected_seed(*args, **kwargs) -> None:
        raise AssertionError("Seed routines should not run when SEED_ON_STARTUP is false.")

    monkeypatch.setattr(seed_service, "seed_permissions_and_roles", _unexpected_seed)
    monkeypatch.setattr(seed_service, "seed_accounting_defaults", _unexpected_seed)
    monkeypatch.setattr(seed_service, "seed_default_admin", _unexpected_seed)
    monkeypatch.setattr(main_module.settings, "SEED_ON_STARTUP", False)
    monkeypatch.setattr(main_module.settings, "BACKUP_ENABLED", False)

    async with main_module.lifespan(main_module.app):
        pass


def test_route_audit_detects_permission_marker_on_protected_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    main_module = _reload_main_module(monkeypatch)
    app = FastAPI()
    router = APIRouter()

    @router.get("/protected")
    async def protected_route(_: None = require_permission("roles", "read")) -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(router, prefix="/api/v1")

    main_module._audit_route_permissions(app)
