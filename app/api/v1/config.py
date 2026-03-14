"""Global config API (RBAC-protected)."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.global_config import GlobalConfig
from app.models.users import User
from app.schemas.config import GlobalConfigRead, GlobalConfigUpdate
from app.services import audit_service

router = APIRouter()


def _normalize_value(v: dict | str | int | float | bool) -> dict:
    """Store as JSONB: dict as-is, primitive wrapped in {"v": ...}."""
    if isinstance(v, dict):
        return v
    return {"v": v}


@router.get("/config", response_model=list[GlobalConfigRead])
async def list_config(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("config", "read"),
) -> list[GlobalConfigRead]:
    """List all config entries. Requires config:read."""
    result = await db.execute(select(GlobalConfig).order_by(GlobalConfig.key))
    items = result.scalars().all()
    return [GlobalConfigRead.model_validate(c) for c in items]


@router.get("/config/{key}", response_model=GlobalConfigRead)
async def get_config(
    key: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("config", "read"),
) -> GlobalConfigRead:
    """Get one config by key. Requires config:read."""
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config key not found")
    return GlobalConfigRead.model_validate(config)


@router.put("/config/{key}", response_model=GlobalConfigRead)
async def set_config(
    key: str,
    body: GlobalConfigUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("config", "update"),
) -> GlobalConfigRead:
    """Set config key/value. Requires config:update."""
    result = await db.execute(select(GlobalConfig).where(GlobalConfig.key == key))
    config = result.scalar_one_or_none()
    value_dict = _normalize_value(body.value)
    if config:
        old_value = config.value
        config.value = value_dict
        config.description = body.description if body.description is not None else config.description
        config.updated_by = current_user.id
        await db.commit()
        await db.refresh(config)
        await audit_service.log(
            session=db,
            action="config.updated",
            resource_type="config",
            resource_id=key,
            old_value=old_value,
            new_value=value_dict,
            user_id=current_user.id,
            request=request,
        )
        await db.commit()
        return GlobalConfigRead.model_validate(config)
    config = GlobalConfig(
        key=key,
        value=value_dict,
        description=body.description,
        updated_by=current_user.id,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    await audit_service.log(
        session=db,
        action="config.created",
        resource_type="config",
        resource_id=key,
        new_value=value_dict,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return GlobalConfigRead.model_validate(config)
