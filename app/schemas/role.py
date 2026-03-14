"""Pydantic schemas for role API."""

from pydantic import BaseModel, ConfigDict


class PermissionRead(BaseModel):
    """Permission read."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    resource: str
    action: str


class RoleCreate(BaseModel):
    """Create a role."""

    name: str
    description: str | None = None


class RoleUpdate(BaseModel):
    """Update role (partial)."""

    name: str | None = None
    description: str | None = None


class RoleRead(BaseModel):
    """Role read."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    is_system: bool


class RoleWithPermissions(RoleRead):
    """Role with permission ids."""

    permission_ids: list[int] = []


class RolePermissionUpdate(BaseModel):
    """Set permission ids for a role."""

    permission_ids: list[int]


class UserRoleAssign(BaseModel):
    """Assign a role to a user (optional branch scope)."""

    role_id: int
    branch_id: int | None = None
